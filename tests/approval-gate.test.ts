import * as fs from "fs";
import * as path from "path";
import Ajv from "ajv";
import ApprovalGate, { ApprovalError, DecisionRequest } from "../src/approval/ApprovalGate";
import Intake from "../src/intake/Intake";
import { buildVaultManifest } from "../src/vault/VaultManifest";
import { Brief, VaultManifest } from "../src/types";

const SKILL_SCHEMA = path.join(__dirname, "../schemas/skill.schema.json");
const BRIEF_SCHEMA = path.join(__dirname, "../schemas/brief.schema.json");
const VAULT_SCHEMA = path.join(__dirname, "../schemas/vault-manifest.schema.json");
const EXAMPLE_SKILL = path.join(__dirname, "../skills/example-skill.json");

const RESPONSE = {
  client_objective: "Make our lead workflow faster",
  current_situation: "Our n8n workflow times out on large batches",
  desired_result: "Handle 500+ leads with no data loss",
  source_materials: [
    {
      name: "workflow.json",
      type: "file",
      location: "workflow.json",
      provenance: "client_upload",
      collected_at: new Date().toISOString(),
    },
  ],
  access_provided: [{ system: "n8n", scope: "read-only access" }],
  estimated_productive_time_minutes: 120,
};

const HUMAN: Pick<DecisionRequest, "approver_role" | "approver_name"> = {
  approver_role: "client",
  approver_name: "José Bota",
};

function makeGate(): ApprovalGate {
  return new ApprovalGate(BRIEF_SCHEMA, VAULT_SCHEMA);
}

async function makeEngagement(): Promise<{ brief: Brief; vault: VaultManifest }> {
  const intake = new Intake(SKILL_SCHEMA, BRIEF_SCHEMA);
  const skill = await intake.loadSkill(EXAMPLE_SKILL);
  const brief = intake.generateBrief(skill, RESPONSE as never) as Brief;
  const vault = buildVaultManifest(brief);
  return { brief, vault };
}

describe("ApprovalGate — only a human can approve", () => {
  // This is the runtime half of threat-model T4. The intake agent already
  // cannot emit an approved brief; this stops it from *asking* for one.
  it("refuses an agent identity in the approver role", async () => {
    const { brief, vault } = await makeEngagement();
    const gate = makeGate();

    expect(() =>
      gate.decide(brief, vault, {
        decision: "approved",
        approver_role: "agent_intake" as never,
        approver_name: "José Bota",
      })
    ).toThrow(ApprovalError);
  });

  it.each([
    "agent_intake",
    "system",
    "handover-bot",
    "automation",
    "claude",
    "ai",
  ])("refuses %s as an approver name", async (name) => {
    const { brief, vault } = await makeEngagement();
    const gate = makeGate();

    expect(() =>
      gate.decide(brief, vault, { ...HUMAN, decision: "approved", approver_name: name })
    ).toThrow(/automated identity|approved by a person/i);
  });

  it("refuses an empty approver name", async () => {
    const { brief, vault } = await makeEngagement();
    const gate = makeGate();

    expect(() =>
      gate.decide(brief, vault, { ...HUMAN, decision: "approved", approver_name: "   " })
    ).toThrow(/name of the person/i);
  });

  it("accepts a named human in an approving role", async () => {
    const { brief, vault } = await makeEngagement();
    const gate = makeGate();

    const result = gate.decide(brief, vault, { ...HUMAN, decision: "approved" });
    expect(result.brief.approval_status).toBe("approved");
  });
});

describe("ApprovalGate — a brief is decided once", () => {
  it("refuses to re-decide an approved brief", async () => {
    const { brief, vault } = await makeEngagement();
    const gate = makeGate();

    const approved = gate.decide(brief, vault, { ...HUMAN, decision: "approved" });

    expect(() =>
      gate.decide(approved.brief, approved.vault, { ...HUMAN, decision: "rejected" })
    ).toThrow(/already "approved"/);
  });

  it("refuses to flip a rejected brief to approved", async () => {
    const { brief, vault } = await makeEngagement();
    const gate = makeGate();

    const rejected = gate.decide(brief, vault, { ...HUMAN, decision: "rejected" });

    expect(() =>
      gate.decide(rejected.brief, rejected.vault, { ...HUMAN, decision: "approved" })
    ).toThrow(/already "rejected"/);
  });
});

describe("ApprovalGate — engagement integrity", () => {
  it("refuses a brief and vault from different engagements", async () => {
    const a = await makeEngagement();
    const b = await makeEngagement();
    const gate = makeGate();

    expect(() =>
      gate.decide(a.brief, b.vault, { ...HUMAN, decision: "approved" })
    ).toThrow(/does not match vault/);
  });

  it("refuses a decision value that is neither approved nor rejected", async () => {
    const { brief, vault } = await makeEngagement();
    const gate = makeGate();

    expect(() =>
      gate.decide(brief, vault, { ...HUMAN, decision: "maybe" as never })
    ).toThrow(/must be "approved" or "rejected"/);
  });
});

describe("ApprovalGate — audit log is append-only", () => {
  it("keeps every prior entry byte-identical and appends one", async () => {
    const { brief, vault } = await makeEngagement();
    const gate = makeGate();
    const before = JSON.stringify(vault.audit_log);

    const result = gate.decide(brief, vault, { ...HUMAN, decision: "approved" });

    expect(result.vault.audit_log).toHaveLength(vault.audit_log.length + 1);
    expect(JSON.stringify(result.vault.audit_log.slice(0, vault.audit_log.length))).toBe(
      before
    );
  });

  it("records who decided, what, and which items it covered", async () => {
    const { brief, vault } = await makeEngagement();
    const gate = makeGate();

    const result = gate.decide(brief, vault, {
      ...HUMAN,
      decision: "approved",
      notes: "Checked the error log for PII first.",
    });

    expect(result.audit_entry.actor).toBe("client:José Bota");
    expect(result.audit_entry.action).toBe("approved");
    expect(result.audit_entry.item_ids).toEqual(vault.items.map((i) => i.item_id));
    expect(result.audit_entry.details).toContain("Checked the error log for PII first.");
  });

  it("does not mutate the inputs", async () => {
    const { brief, vault } = await makeEngagement();
    const gate = makeGate();
    const briefBefore = JSON.stringify(brief);
    const vaultBefore = JSON.stringify(vault);

    gate.decide(brief, vault, { ...HUMAN, decision: "approved" });

    expect(JSON.stringify(brief)).toBe(briefBefore);
    expect(JSON.stringify(vault)).toBe(vaultBefore);
  });
});

describe("ApprovalGate — a rejection actually closes the door", () => {
  it("sets freelancer access to none and records no approval", async () => {
    const { brief, vault } = await makeEngagement();
    const gate = makeGate();

    const result = gate.decide(brief, vault, { ...HUMAN, decision: "rejected" });

    expect(result.brief.approval_status).toBe("rejected");
    expect(result.vault.access_control?.freelancer_access).toBe("none");
    expect(result.vault.approvals ?? []).toHaveLength(0);
  });

  it("grants read-only access and records the approval on approve", async () => {
    const { brief, vault } = await makeEngagement();
    const gate = makeGate();

    const result = gate.decide(brief, vault, { ...HUMAN, decision: "approved" });

    expect(result.vault.access_control?.freelancer_access).toBe("read_only");
    expect(result.vault.approvals).toHaveLength(1);
    expect(result.vault.approvals?.[0].approval_type).toBe("handover_use");
  });
});

describe("ApprovalGate — results stay schema-valid", () => {
  it("produces a brief and vault that both still validate", async () => {
    const { brief, vault } = await makeEngagement();
    const gate = makeGate();
    const intake = new Intake(SKILL_SCHEMA, BRIEF_SCHEMA);

    const result = gate.decide(brief, vault, { ...HUMAN, decision: "approved" });

    expect(intake.validateBrief(result.brief).valid).toBe(true);

    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(JSON.parse(fs.readFileSync(VAULT_SCHEMA, "utf-8")));
    expect(validate(result.vault)).toBe(true);
  });
});
