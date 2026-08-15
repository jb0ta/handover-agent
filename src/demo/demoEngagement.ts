import { ClientResponse } from "../intake/Intake";

/**
 * The worked example, used as the default client response when no
 * `--response` file is given.
 *
 * It is an ordinary `ClientResponse` — exactly what a real response file
 * parses into — so the demo exercises the same code path a real engagement
 * does. `examples/example-client-response.yaml` is this same content in the
 * format a client would actually be handed.
 */

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
      classification: "internal",
      access_restrictions: ["freelancer_only"],
      notes:
        "Contains workflow logic and API endpoints. Do not share externally.",
    },
    {
      name: "Error log (last 7 days)",
      type: "file",
      location: "error-log.csv",
      provenance: "Client export from n8n logs",
      classification: "confidential",
      access_restrictions: ["freelancer_only"],
      notes: "Contains timestamps and error details. May contain PII.",
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

export default DEMO_CLIENT_RESPONSE;
