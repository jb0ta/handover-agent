import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import Intake from "../intake/Intake";
import ApprovalGate, { ApprovalError } from "../approval/ApprovalGate";
import { createDemoEngagement } from "../demo/demoEngagement";
import { Brief, VaultManifest } from "../types";

/**
 * The approval gate server.
 *
 * A small, dependency-free HTTP server that puts a human in front of the
 * handover. It holds one engagement in memory, serves it to the review UI, and
 * records exactly one decision on it.
 *
 * Scope, stated plainly: this is a local review tool. There is no
 * authentication — whoever can reach the port can decide. It binds to loopback
 * for that reason. Decisions are written to `engagements/<id>/` as ordinary
 * JSON files, which is a record, not a tamper-evident store
 * (see docs/threat-model.md, T6).
 */

const DEFAULT_PORT = 4173;
const DEFAULT_HOST = "127.0.0.1";
const MAX_BODY_BYTES = 64 * 1024;

/** Resolves from both `src/server` (ts-node) and `dist/server` (compiled). */
const UI_PATH = path.join(__dirname, "..", "..", "src", "ui", "index.html");

export interface EngagementState {
  brief: Brief;
  vault: VaultManifest;
  /** Missing-info findings from intake, surfaced to the reviewer. */
  intake_findings: { missing: string[]; warnings: string[] };
}

export interface ServerOptions {
  port?: number;
  host?: string;
  outputDir?: string;
}

export class ApprovalServer {
  private state: EngagementState | null = null;
  private gate: ApprovalGate;
  private intake: Intake;
  private outputDir: string;
  private server: http.Server;

  constructor(options: ServerOptions = {}) {
    this.gate = new ApprovalGate();
    this.intake = new Intake();
    this.outputDir = options.outputDir ?? "./engagements";
    this.server = http.createServer((req, res) => {
      this.handle(req, res).catch((error) => {
        this.sendJson(res, 500, {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    });
  }

  /** Loads a fresh, undecided engagement. */
  async seed(): Promise<EngagementState> {
    const demo = await createDemoEngagement(this.intake);
    this.state = {
      brief: demo.brief,
      vault: demo.vault,
      intake_findings: {
        missing: demo.responseValidation.missing,
        warnings: demo.responseValidation.warnings,
      },
    };
    return this.state;
  }

  async listen(port = DEFAULT_PORT, host = DEFAULT_HOST): Promise<number> {
    if (!this.state) {
      await this.seed();
    }

    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(port, host, () => {
        const address = this.server.address();
        resolve(typeof address === "object" && address ? address.port : port);
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve) => this.server.close(() => resolve()));
  }

  private async handle(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const route = `${req.method} ${url.pathname}`;

    switch (route) {
      case "GET /":
        return this.sendUi(res);
      case "GET /api/engagement":
        return this.sendJson(res, 200, this.state);
      case "POST /api/decision":
        return this.handleDecision(req, res);
      case "POST /api/reset":
        await this.seed();
        return this.sendJson(res, 200, this.state);
      default:
        return this.sendJson(res, 404, { error: `No route for ${route}` });
    }
  }

  private sendUi(res: http.ServerResponse): void {
    if (!fs.existsSync(UI_PATH)) {
      this.sendJson(res, 500, { error: `UI not found at ${UI_PATH}` });
      return;
    }

    // src/ui/index.html is page content, not a whole document — the same
    // fragment is publishable as a hosted artifact, which supplies its own
    // skeleton. Serving it means supplying one here.
    const body = fs.readFileSync(UI_PATH, "utf-8");
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
${body}
</body>
</html>`;

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(html);
  }

  private async handleDecision(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    if (!this.state) {
      this.sendJson(res, 409, { error: "No engagement loaded." });
      return;
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse((await this.readBody(req)) || "{}");
    } catch {
      this.sendJson(res, 400, { error: "Request body is not valid JSON." });
      return;
    }

    try {
      const result = this.gate.decide(this.state.brief, this.state.vault, {
        decision: body.decision as "approved" | "rejected",
        approver_role: body.approver_role as "client" | "freelancer" | "admin",
        approver_name: String(body.approver_name ?? ""),
        notes: typeof body.notes === "string" ? body.notes : undefined,
      });

      this.state = {
        ...this.state,
        brief: result.brief,
        vault: result.vault,
      };

      const written = this.persist(result.brief, result.vault);
      this.sendJson(res, 200, {
        ...this.state,
        audit_entry: result.audit_entry,
        written_to: written,
      });
    } catch (error) {
      if (error instanceof ApprovalError) {
        // 409 for "the gate refused", 400 for "the request was malformed".
        const status =
          error.code === "already_decided" || error.code === "engagement_mismatch"
            ? 409
            : 400;
        this.sendJson(res, status, { error: error.message, code: error.code });
        return;
      }
      throw error;
    }
  }

  /** Writes the decided engagement out as plain JSON. */
  private persist(brief: Brief, vault: VaultManifest): string {
    const dir = path.join(this.outputDir, brief.engagement_id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "brief.json"),
      JSON.stringify(brief, null, 2)
    );
    fs.writeFileSync(
      path.join(dir, "vault-manifest.json"),
      JSON.stringify(vault, null, 2)
    );
    return dir;
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks: Buffer[] = [];

      req.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          reject(new Error("Request body too large."));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      req.on("error", reject);
    });
  }

  private sendJson(
    res: http.ServerResponse,
    status: number,
    payload: unknown
  ): void {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(payload, null, 2));
  }
}

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  const server = new ApprovalServer();
  const actual = await server.listen(port);
  const state = await server.seed();

  console.log("\n🔒 Handover Agent — Approval Gate\n");
  console.log(`   Review UI:  http://${DEFAULT_HOST}:${actual}`);
  console.log(`   Engagement: ${state.brief.engagement_id}`);
  console.log(`   Brief:      ${state.brief.brief_id} (${state.brief.approval_status})`);
  console.log(`   Vault:      ${state.vault.items.length} item(s), freelancer access "${state.vault.access_control?.freelancer_access}"`);
  console.log("\n   No authentication — bound to loopback. Ctrl+C to stop.\n");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Failed to start approval gate:", error);
    process.exit(1);
  });
}

export default ApprovalServer;
