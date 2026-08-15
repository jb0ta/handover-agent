import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import ApprovalServer from "../src/server/server";

/**
 * Integration tests against the real HTTP surface. These exist because the
 * invariants that matter are the ones that survive the wire: a caller who can
 * reach the port must not be able to talk the gate into approving itself.
 */

let server: ApprovalServer;
let base: string;
let outputDir: string;

beforeEach(async () => {
  outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "handover-test-"));
  server = new ApprovalServer({ outputDir });
  const port = await server.listen(0);
  base = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  await server.close();
  fs.rmSync(outputDir, { recursive: true, force: true });
});

/** `Response.json()` resolves to `unknown` under these lib types. */
async function readJson(response: Response): Promise<any> {
  return response.json();
}

async function getEngagement(): Promise<any> {
  return readJson(await fetch(`${base}/api/engagement`));
}

async function decide(body: unknown): Promise<{ status: number; json: any }> {
  const response = await fetch(`${base}/api/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await readJson(response) };
}

const HUMAN = { approver_role: "client", approver_name: "José Bota" };

describe("approval server — serving the engagement", () => {
  it("serves a pending brief with a closed vault", async () => {
    const response = await fetch(`${base}/api/engagement`);
    const state = await readJson(response);

    expect(response.status).toBe(200);
    expect(state.brief.approval_status).toBe("pending_approval");
    expect(state.vault.access_control.freelancer_access).toBe("none");
    expect(state.vault.approvals).toEqual([]);
    expect(state.vault.items.length).toBeGreaterThan(0);
  });

  it("serves the review UI as a complete HTML document", async () => {
    const response = await fetch(`${base}/`);
    const html = await response.text();

    expect(response.headers.get("content-type")).toMatch(/text\/html/);
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain("<title>Handover Approval Gate</title>");
    expect(html).toContain('id="btn-approve"');
  });

  it("404s an unknown route", async () => {
    const response = await fetch(`${base}/api/nope`);
    expect(response.status).toBe(404);
  });
});

describe("approval server — the gate holds over HTTP", () => {
  it("refuses an agent identity with 400", async () => {
    const { status, json } = await decide({
      decision: "approved",
      approver_role: "client",
      approver_name: "agent_intake",
    });

    expect(status).toBe(400);
    expect(json.code).toBe("non_human_approver");
  });

  it("refuses a non-human approver role with 400", async () => {
    const { status, json } = await decide({
      decision: "approved",
      approver_role: "system",
      approver_name: "José Bota",
    });

    expect(status).toBe(400);
    expect(json.code).toBe("non_human_approver");
  });

  it("refuses an unnamed approver with 400", async () => {
    const { status, json } = await decide({
      decision: "approved",
      approver_role: "client",
      approver_name: "",
    });

    expect(status).toBe(400);
    expect(json.code).toBe("missing_approver");
  });

  it("leaves the engagement untouched after a refusal", async () => {
    await decide({ ...HUMAN, decision: "approved", approver_name: "bot" });

    const state = await getEngagement();
    expect(state.brief.approval_status).toBe("pending_approval");
    expect(state.vault.access_control.freelancer_access).toBe("none");
    expect(state.vault.audit_log).toHaveLength(2);
  });

  it("refuses a malformed body with 400", async () => {
    const response = await fetch(`${base}/api/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(response.status).toBe(400);
  });
});

describe("approval server — a human decision", () => {
  it("approves, opens the vault, and appends one audit entry", async () => {
    const before = await getEngagement();
    const { status, json } = await decide({
      ...HUMAN,
      decision: "approved",
      notes: "Checked the error log for PII first.",
    });

    expect(status).toBe(200);
    expect(json.brief.approval_status).toBe("approved");
    expect(json.vault.access_control.freelancer_access).toBe("read_only");
    expect(json.vault.audit_log).toHaveLength(before.vault.audit_log.length + 1);
    expect(json.audit_entry.actor).toBe("client:José Bota");
    expect(json.vault.approvals).toHaveLength(1);
  });

  it("rejects, keeps the vault shut, and records no approval", async () => {
    const { status, json } = await decide({ ...HUMAN, decision: "rejected" });

    expect(status).toBe(200);
    expect(json.brief.approval_status).toBe("rejected");
    expect(json.vault.access_control.freelancer_access).toBe("none");
    expect(json.vault.approvals).toEqual([]);
  });

  it("refuses a second decision with 409", async () => {
    await decide({ ...HUMAN, decision: "approved" });
    const { status, json } = await decide({ ...HUMAN, decision: "rejected" });

    expect(status).toBe(409);
    expect(json.code).toBe("already_decided");
  });

  it("writes the decided brief and vault to disk", async () => {
    const { json } = await decide({ ...HUMAN, decision: "approved" });
    const dir = path.join(outputDir, json.brief.engagement_id);

    const brief = JSON.parse(
      fs.readFileSync(path.join(dir, "brief.json"), "utf-8")
    );
    const vault = JSON.parse(
      fs.readFileSync(path.join(dir, "vault-manifest.json"), "utf-8")
    );

    expect(brief.approval_status).toBe("approved");
    expect(vault.audit_log[vault.audit_log.length - 1].action).toBe("approved");
  });

  it("issues a fresh, undecided engagement on reset", async () => {
    const first = await getEngagement();
    await decide({ ...HUMAN, decision: "approved" });

    const reset = await readJson(
      await fetch(`${base}/api/reset`, { method: "POST" })
    );

    expect(reset.brief.approval_status).toBe("pending_approval");
    expect(reset.brief.brief_id).not.toBe(first.brief.brief_id);
    expect(reset.vault.access_control.freelancer_access).toBe("none");
  });

  it("serves many engagements from one long-lived instance", async () => {
    // Guards the AJV single-use regression at the level that would have hurt:
    // the server holds one Intake and one ApprovalGate across all requests.
    for (let i = 0; i < 3; i += 1) {
      await fetch(`${base}/api/reset`, { method: "POST" });
      const { status } = await decide({ ...HUMAN, decision: "approved" });
      expect(status).toBe(200);
    }
  });
});
