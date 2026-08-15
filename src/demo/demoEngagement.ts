import Intake, { ClientResponse } from "../intake/Intake";
import { buildVaultManifest } from "../vault/VaultManifest";
import { Brief, VaultManifest } from "../types";

/**
 * The worked example used by both the CLI demo (`npm start`) and the approval
 * gate server (`npm run gate`), so the two never drift apart.
 */

export const DEMO_SKILL_PATH = "./skills/example-skill.json";

export const DEMO_CLIENT_RESPONSE: ClientResponse = {
  client_name: "TechFlow Inc.",
  client_objective:
    "Make our main lead-capture workflow 30% faster and more reliable",
  current_situation:
    "We run a webhook-triggered n8n workflow that collects form submissions, validates them, enriches with company data via API, and logs to Pipedrive. It works, but often times out on large batches and sometimes loses data.",
  desired_result:
    "A faster, more resilient workflow that can handle 500+ leads per day without timeouts or data loss. We want clear error handling and retry logic.",
  scope:
    "Review and fix the existing workflow, apply one key optimization, and document the changes.",
  out_of_scope: [
    "Complete rewrite of the workflow",
    "Integration with new platforms",
  ],
  constraints: [
    "No downtime during the fix (we need the workflow running)",
    "Changes must be compatible with our existing Pipedrive setup",
  ],
  source_materials: [
    {
      name: "Lead workflow export",
      type: "file",
      location: "lead-workflow.json",
      provenance: "Client export from n8n",
      collected_at: new Date().toISOString(),
    },
    {
      name: "Error log (last 7 days)",
      type: "file",
      location: "error-log.csv",
      provenance: "Client export from n8n logs",
      collected_at: new Date().toISOString(),
    },
  ],
  access_provided: [
    {
      system: "n8n",
      scope: "read-only access to the workflow and logs",
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ],
  risks: [
    "The workflow handles sensitive lead data; changes must not compromise privacy",
    "Any timeout during the fix could cause duplicate leads; needs careful testing",
  ],
  open_questions: [
    "Can we use a paid n8n node to improve performance, or must we stick to free nodes?",
    "What's the acceptable data latency for lead logging?",
  ],
  success_criteria: [
    "Workflow can process 500+ leads without timeouts",
    "Error rate < 0.5%",
    "No data loss on any lead",
    "Changes are documented with rollback plan",
  ],
  estimated_productive_time_minutes: 120,
};

/**
 * Per-item handling for the demo materials. The intake collects them; a human
 * classifies them. Anything not named here defaults to "internal".
 */
const DEMO_ITEM_HANDLING: Record<
  string,
  { classification: "internal" | "confidential"; notes: string }
> = {
  "Lead workflow export": {
    classification: "internal",
    notes:
      "Contains workflow logic and API endpoints. Do not share externally.",
  },
  "Error log (last 7 days)": {
    classification: "confidential",
    notes: "Contains timestamps and error details. May contain PII.",
  },
};

export interface DemoEngagement {
  brief: Brief;
  vault: VaultManifest;
  validation: ReturnType<Intake["validateBrief"]>;
  responseValidation: ReturnType<Intake["validateResponse"]>;
}

/**
 * Runs the real intake path and packages the result. Nothing here approves
 * anything — the brief comes back `pending_approval` and the vault comes back
 * with `freelancer_access: "none"`.
 */
export async function createDemoEngagement(
  intake: Intake = new Intake(),
  skillPath: string = DEMO_SKILL_PATH
): Promise<DemoEngagement> {
  const skill = await intake.loadSkill(skillPath);
  const responseValidation = intake.validateResponse(
    skill,
    DEMO_CLIENT_RESPONSE
  );
  const brief = intake.generateBrief(skill, DEMO_CLIENT_RESPONSE) as Brief;
  const validation = intake.validateBrief(brief);

  const vault = buildVaultManifest(brief, {
    items: brief.source_materials.map((material) => ({
      name: material.name,
      type: material.type,
      path: material.location,
      provenance: material.provenance,
      collected_at: material.collected_at,
      collection_method: "user_upload",
      ...(DEMO_ITEM_HANDLING[material.name] ?? {}),
    })),
  });

  return { brief, vault, validation, responseValidation };
}
