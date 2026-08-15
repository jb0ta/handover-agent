import * as fs from "fs";
import * as path from "path";
import Intake from "./intake/Intake";
import ApprovalGate, { ApprovalError } from "./approval/ApprovalGate";
import { createDemoEngagement, DEMO_SKILL_PATH } from "./demo/demoEngagement";

/**
 * Main: demonstrates the full handover-agent flow.
 *
 * 1. Load a skill and run intake against a client response
 * 2. Generate a structured, schema-validated brief
 * 3. Package a scoped vault manifest (provenance, classification, expiry)
 * 4. Show that the agent cannot approve its own handover
 * 5. Stop at the gate — a human decides, in the UI (`npm run gate`)
 */

function rule(): void {
  console.log("\n" + "=".repeat(60) + "\n");
}

async function main(): Promise<void> {
  console.log("🚀 Handover Agent Demo\n");
  console.log("=".repeat(60));

  const intake = new Intake(
    "./schemas/skill.schema.json",
    "./schemas/brief.schema.json"
  );

  console.log("\n📥 Running intake...\n");
  const skill = await intake.loadSkill(DEMO_SKILL_PATH);
  console.log(`✓ Loaded skill: ${skill.skill} v${skill.version}`);

  const { brief, vault, validation, responseValidation } =
    await createDemoEngagement(intake);

  console.log(`✓ Generated brief: ${brief.brief_id}`);
  console.log(
    `✓ Packaged vault: ${vault.items.length} item(s), expires ${vault.expires_at}`
  );

  rule();
  console.log("🔍 Validation Status:\n");
  console.log(`  Brief schema:          ${validation.valid ? "✓ PASS" : "❌ FAIL"}`);
  validation.errors.forEach((error) => {
    console.log(`    - ${error.instancePath} ${error.message}`);
  });

  console.log(
    `  Response completeness: ${responseValidation.valid ? "✓ PASS" : "⚠️  INCOMPLETE"}`
  );
  responseValidation.missing.forEach((entry) => console.log(`    - ${entry}`));
  responseValidation.warnings.forEach((entry) => console.log(`    ! ${entry}`));

  rule();
  console.log("🔒 Vault Manifest:\n");
  console.log(JSON.stringify(vault, null, 2));

  rule();
  console.log("👤 The approval gate\n");
  console.log(`  Brief status:      ${brief.approval_status}`);
  console.log(
    `  Freelancer access: ${vault.access_control?.freelancer_access} (nothing released yet)`
  );

  // The invariant, demonstrated rather than asserted: the agent asking to
  // approve its own handover is refused.
  const gate = new ApprovalGate();
  try {
    gate.decide(brief, vault, {
      decision: "approved",
      approver_role: "client",
      approver_name: "agent_intake",
    });
    console.log("  ❌ The agent approved its own handover — invariant broken!");
    process.exitCode = 1;
  } catch (error) {
    if (error instanceof ApprovalError) {
      console.log(`  ✓ Agent self-approval refused (${error.code})`);
      console.log(`    "${error.message}"`);
    } else {
      throw error;
    }
  }

  rule();
  console.log("📋 Next Steps:\n");
  console.log("1. 👤 HUMAN APPROVAL GATE");
  console.log("   Run `npm run gate` and decide in the browser.");
  console.log("\n2. 📦 SCOPED HANDOVER");
  console.log("   On approval the vault opens read-only, expiring in 14 days.");
  console.log("\n3. ⏱️  PRODUCTIVE WORK");
  console.log(
    `   Freelancer does the focused work (est. ${brief.estimated_productive_time_minutes} min).`
  );
  console.log("\n4. 🔄 RETURN HANDOVER");
  console.log("   Deliverables + changes + tests. Billing for productive time only.");

  rule();

  const outputDir = "./examples";
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, "example-brief.json"),
    JSON.stringify(brief, null, 2)
  );
  fs.writeFileSync(
    path.join(outputDir, "example-vault-manifest.json"),
    JSON.stringify(vault, null, 2)
  );

  console.log("✓ Saved example-brief.json to examples/");
  console.log("✓ Saved example-vault-manifest.json to examples/\n");
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
