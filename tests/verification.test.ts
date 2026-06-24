import Intake from "../src/intake/Intake";
import Ajv from "ajv";
import * as fs from "fs";
import * as path from "path";

const SKILL_SCHEMA = path.join(__dirname, "../schemas/skill.schema.json");
const BRIEF_SCHEMA = path.join(__dirname, "../schemas/brief.schema.json");
const VAULT_SCHEMA = path.join(__dirname, "../schemas/vault-manifest.schema.json");
const EXAMPLE_SKILL_JSON = path.join(__dirname, "../skills/example-skill.json");
const EXAMPLE_SKILL_YAML = path.join(__dirname, "../skills/example-skill.yaml");
const EXAMPLE_VAULT = path.join(__dirname, "../examples/example-vault-manifest.json");

function makeIntake(): Intake {
  return new Intake(SKILL_SCHEMA, BRIEF_SCHEMA);
}

const COMPLETE_RESPONSE = {
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
  estimated_productive_time_minutes: 120,
};

describe("Brief schema — approval_status is a required field", () => {
  // Regression: the brief schema must REQUIRE approval_status, so the
  // safety-critical field cannot be silently omitted from a brief.
  it("rejects a brief that omits approval_status", async () => {
    const intake = makeIntake();
    const skill = await intake.loadSkill(EXAMPLE_SKILL_JSON);
    const brief: any = intake.generateBrief(skill, COMPLETE_RESPONSE as any);
    delete brief.approval_status;
    const result = intake.validateBrief(brief);
    expect(result.valid).toBe(false);
    expect(JSON.stringify(result.errors)).toMatch(/approval_status/);
  });

  it("rejects a brief whose approval_status is not an allowed value", async () => {
    const intake = makeIntake();
    const skill = await intake.loadSkill(EXAMPLE_SKILL_JSON);
    const brief: any = intake.generateBrief(skill, COMPLETE_RESPONSE as any);
    brief.approval_status = "approved_by_agent";
    const result = intake.validateBrief(brief);
    expect(result.valid).toBe(false);
  });
});

describe("Vault manifest example — integrity", () => {
  const manifest = JSON.parse(fs.readFileSync(EXAMPLE_VAULT, "utf-8"));

  it("validates against the vault-manifest schema", () => {
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(
      JSON.parse(fs.readFileSync(VAULT_SCHEMA, "utf-8"))
    );
    expect(validate(manifest)).toBe(true);
  });

  // Regression: audit-log entries must reference item IDs that actually
  // exist in items[], not placeholder strings.
  it("has audit_log entries that only reference real item IDs", () => {
    const realIds = new Set(manifest.items.map((i: any) => i.item_id));
    const referenced: string[] = ([] as string[]).concat(
      ...manifest.audit_log.map((e: any) => e.item_ids || [])
    );
    const dangling = referenced.filter((id) => !realIds.has(id));
    expect(dangling).toEqual([]);
  });
});

describe("Skill loading — YAML is advertised but not yet parsed", () => {
  // Documents ACTUAL behaviour honestly: a .yaml skill currently throws a
  // clear, predictable error rather than silently mis-parsing.
  it("throws a clear error when given a .yaml skill", async () => {
    const intake = makeIntake();
    await expect(intake.loadSkill(EXAMPLE_SKILL_YAML)).rejects.toThrow(
      /YAML support not yet implemented/
    );
  });
});
