import Intake from "./intake/Intake";
import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";

/**
 * Main: demonstrates the full handover-agent flow
 *
 * 1. Load a skill (example-skill.yaml)
 * 2. Simulate client intake (questions + responses)
 * 3. Generate a structured brief
 * 4. Create a vault manifest (scoped, with provenance)
 * 5. Output for human approval
 */

const EXAMPLE_CLIENT_RESPONSE = {
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
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
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

async function main() {
  console.log("🚀 Handover Agent Demo\n");
  console.log("=".repeat(60) + "\n");

  try {
    // Initialize intake
    const intake = new Intake(
      "./schemas/skill.schema.json",
      "./schemas/brief.schema.json"
    );

    // Run intake with example skill and response
    console.log("📥 Running intake...\n");
    const result = await intake.runIntake(
      "./skills/example-skill.json",
      EXAMPLE_CLIENT_RESPONSE as any
    );

    console.log("\n" + "=".repeat(60));
    console.log("\n✅ INTAKE COMPLETE\n");

    // Display the generated brief
    console.log("📄 Generated Brief:");
    console.log(JSON.stringify(result.brief, null, 2));

    // Display validation status
    console.log("\n" + "=".repeat(60));
    console.log("\n🔍 Validation Status:");
    console.log(
      `  Schema validation: ${result.validation.valid ? "✓ PASS" : "❌ FAIL"}`
    );
    if (!result.validation.valid) {
      result.validation.errors.forEach((err) => {
        console.log(`    - ${err.message}`);
      });
    }

    console.log(
      `  Response completeness: ${result.validation_response.valid ? "✓ PASS" : "⚠️  INCOMPLETE"}`
    );
    if (!result.validation_response.valid) {
      result.validation_response.missing.forEach((m) => {
        console.log(`    - ${m}`);
      });
    }

    if (result.validation_response.warnings.length > 0) {
      console.log("  Warnings:");
      result.validation_response.warnings.forEach((w) => {
        console.log(`    - ${w}`);
      });
    }

    // Create vault manifest concept
    console.log("\n" + "=".repeat(60));
    console.log("\n🔒 Vault Manifest (concept):\n");

    const vaultManifest = {
      engagement_id: result.brief.engagement_id,
      brief_id: result.brief.brief_id,
      vault_path: `/engagements/${result.brief.engagement_id}/vault`,
      scope: "per-engagement",
      created_at: new Date().toISOString(),
      expires_at: new Date(
        Date.now() + 14 * 24 * 60 * 60 * 1000
      ).toISOString(), // 14 days
      items: [
        {
          item_id: `item-${uuidv4()}`,
          name: "Lead workflow export",
          type: "file",
          path: "lead-workflow.json",
          provenance: "client_upload",
          collected_at: new Date().toISOString(),
          collection_method: "user_upload",
          classification: "internal",
          access_restrictions: ["freelancer_only"],
          notes:
            "Contains workflow logic and API endpoints. Do not share externally.",
        },
        {
          item_id: `item-${uuidv4()}`,
          name: "Error log (last 7 days)",
          type: "file",
          path: "error-log.csv",
          provenance: "client_export",
          collected_at: new Date().toISOString(),
          collection_method: "user_upload",
          classification: "confidential",
          access_restrictions: ["freelancer_only"],
          notes: "Contains timestamp and error details. May contain PII.",
        },
      ],
      access_control: {
        freelancer_access: "read_only",
        client_access: "revoke_anytime",
        audit_access: "log_only",
      },
      audit_log: [
        {
          timestamp: new Date().toISOString(),
          actor: "system",
          action: "vault_created",
          details: `Vault created for engagement ${result.brief.engagement_id}`,
          item_ids: [],
        },
        {
          timestamp: new Date().toISOString(),
          actor: "agent_intake",
          action: "items_collected",
          details: "Client response materials added to vault",
          item_ids: ["item-workflow", "item-logs"],
        },
      ],
      revocation_conditions: {
        automatic_expiry_utc: new Date(
          Date.now() + 14 * 24 * 60 * 60 * 1000
        ).toISOString(),
        manual_revocation_by_client: true,
        on_expiry_action: "lock_read_only",
        retention_after_expiry: "90d",
      },
      approvals: [
        {
          approver: "client",
          approved_at: new Date().toISOString(),
          approval_type: "vault_creation",
          notes: "Client approved sharing materials with freelancer",
        },
      ],
    };

    console.log(JSON.stringify(vaultManifest, null, 2));

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("\n📋 Next Steps:\n");
    console.log("1. 👤 HUMAN APPROVAL GATE");
    console.log(
      "   A human must review the brief and vault manifest and approve."
    );
    console.log(`\n2. 📦 SCOPED HANDOVER`);
    console.log(`   If approved, the brief + vault is handed to the freelancer.`);
    console.log(`   Freelancer has read-only access, expires in 14 days.`);
    console.log(`\n3. ⏱️  PRODUCTIVE WORK`);
    console.log(
      `   Freelancer does the focused work (est. ${result.brief.estimated_productive_time_minutes} min).`
    );
    console.log(`\n4. 🔄 RETURN HANDOVER`);
    console.log(`   Freelancer returns: deliverables + changes + tests + notes.`);
    console.log(`   Billing is for productive time only.`);

    console.log("\n" + "=".repeat(60) + "\n");

    // Save outputs
    const outputDir = "./examples";
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(outputDir, "example-brief.json"),
      JSON.stringify(result.brief, null, 2)
    );
    fs.writeFileSync(
      path.join(outputDir, "example-vault-manifest.json"),
      JSON.stringify(vaultManifest, null, 2)
    );

    console.log("✓ Saved example-brief.json to examples/");
    console.log("✓ Saved example-vault-manifest.json to examples/\n");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main();
