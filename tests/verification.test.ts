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

describe("Intake — instance reuse (regression)", () => {
  // Regression: AJV registers a schema by its $id on compile and throws if the
  // same $id is compiled twice. Before validator caching, an Intake instance was
  // single-use — the second validateBrief()/loadSkill() call threw
  // "schema with key or id ... already exists". Any long-lived caller (the
  // approval server holds one Intake and serves many requests) hit this on
  // request #2.
  it("validates more than one brief from the same instance", async () => {
    const intake = makeIntake();
    const skill = await intake.loadSkill(EXAMPLE_SKILL_JSON);
    const first = intake.generateBrief(skill, COMPLETE_RESPONSE as any);
    const second = intake.generateBrief(skill, COMPLETE_RESPONSE as any);

    expect(intake.validateBrief(first).valid).toBe(true);
    expect(intake.validateBrief(second).valid).toBe(true);
  });

  it("loads more than one skill from the same instance", async () => {
    const intake = makeIntake();
    await intake.loadSkill(EXAMPLE_SKILL_JSON);
    await expect(intake.loadSkill(EXAMPLE_SKILL_JSON)).resolves.toBeTruthy();
  });

  it("reports every schema violation, not just the first", async () => {
    const intake = makeIntake();
    const skill = await intake.loadSkill(EXAMPLE_SKILL_JSON);
    const brief: any = intake.generateBrief(skill, COMPLETE_RESPONSE as any);
    brief.client_objective = "short"; // below minLength
    brief.estimated_productive_time_minutes = 5; // below minimum
    const result = intake.validateBrief(brief);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

describe("Intake — missing-info detection (regression)", () => {
  // Regression: the what_i_need loop ignored the need it was iterating and
  // tested source_materials every time. One uploaded file therefore satisfied
  // "read-only access to the relevant platform", which is not a file.
  it("flags a missing access grant even when materials were provided", async () => {
    const intake = makeIntake();
    const skill = await intake.loadSkill(EXAMPLE_SKILL_JSON);
    const result = intake.validateResponse(skill, {
      ...COMPLETE_RESPONSE,
      access_provided: [],
    } as any);

    expect(result.valid).toBe(false);
    expect(result.missing.join(" ")).toMatch(/Missing access:.*[Rr]ead-only access/);
  });

  it("passes when both materials and the access grant are present", async () => {
    const intake = makeIntake();
    const skill = await intake.loadSkill(EXAMPLE_SKILL_JSON);
    const result = intake.validateResponse(skill, {
      ...COMPLETE_RESPONSE,
      access_provided: [{ system: "n8n", scope: "read-only" }],
    } as any);

    expect(result.missing).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("separates material needs from access needs when nothing was provided", async () => {
    const intake = makeIntake();
    const skill = await intake.loadSkill(EXAMPLE_SKILL_JSON);
    const result = intake.validateResponse(skill, {
      ...COMPLETE_RESPONSE,
      source_materials: [],
      access_provided: [],
    } as any);

    const joined = result.missing.join("\n");
    expect(joined).toMatch(/Missing material:/);
    expect(joined).toMatch(/Missing access:/);
  });
});

describe("Intake — PII warning (regression)", () => {
  // Regression: the check was `skill.exclusions.includes("no_pii_unless_required")`,
  // an exact match against an array of prose sentences. The real flag lives at
  // skill.security_requirements.no_pii_unless_required, so the warning was dead
  // code and never fired — while docs/threat-model.md T2 claimed it existed.
  it("warns when the skill asks for no PII and the brief mentions customer data", async () => {
    const intake = makeIntake();
    const skill = await intake.loadSkill(EXAMPLE_SKILL_JSON);
    expect(skill.security_requirements?.no_pii_unless_required).toBe(true);

    const result = intake.validateResponse(skill, {
      ...COMPLETE_RESPONSE,
      access_provided: [{ system: "n8n", scope: "read-only" }],
      current_situation: "The workflow stores customer records and user emails",
    } as any);

    expect(result.warnings.join(" ")).toMatch(/only shared what's necessary/);
  });

  it("stays quiet when the brief mentions no personal data", async () => {
    const intake = makeIntake();
    const skill = await intake.loadSkill(EXAMPLE_SKILL_JSON);
    const result = intake.validateResponse(skill, {
      ...COMPLETE_RESPONSE,
      access_provided: [{ system: "n8n", scope: "read-only" }],
      current_situation: "The workflow batches records and times out",
    } as any);

    expect(result.warnings).toEqual([]);
  });
});

describe("Skill loading — YAML and JSON are interchangeable", () => {
  // A .yaml skill used to throw "YAML support not yet implemented", so
  // example-skill.yaml was never parsed by anything — and had drifted: it
  // carried a `notes` field the strict skill schema rejected. Parsing it
  // surfaced that immediately. `notes` is now part of the schema, and these
  // tests keep the two example files honest with each other.
  it("loads a YAML skill", async () => {
    const intake = makeIntake();
    const skill = await intake.loadSkill(EXAMPLE_SKILL_YAML);
    expect(skill.skill).toBe("workflow-automation-review");
    expect(skill.version).toBe("0.1.0");
    expect(skill.security_requirements?.no_pii_unless_required).toBe(true);
  });

  it("produces an identical skill from the YAML and JSON examples", async () => {
    const intake = makeIntake();
    const fromYaml = await intake.loadSkill(EXAMPLE_SKILL_YAML);
    const fromJson = await intake.loadSkill(EXAMPLE_SKILL_JSON);
    expect(fromYaml).toEqual(fromJson);
  });

  it("rejects a YAML skill that violates the schema", async () => {
    const intake = makeIntake();
    const badPath = path.join(__dirname, "tmp-bad-skill.yaml");
    fs.writeFileSync(badPath, "skill: x\nversion: 0.1.0\n");
    await expect(intake.loadSkill(badPath)).rejects.toThrow(/validation failed/);
    fs.unlinkSync(badPath);
  });

  it("reports malformed YAML as a parse error, not a schema error", async () => {
    const intake = makeIntake();
    const badPath = path.join(__dirname, "tmp-malformed.yaml");
    fs.writeFileSync(badPath, "skill: [unclosed\n");
    await expect(intake.loadSkill(badPath)).rejects.toThrow(/not valid YAML/);
    fs.unlinkSync(badPath);
  });

  it("rejects an unsupported file extension", async () => {
    const intake = makeIntake();
    const badPath = path.join(__dirname, "tmp-skill.txt");
    fs.writeFileSync(badPath, "skill: x");
    await expect(intake.loadSkill(badPath)).rejects.toThrow(
      /must be \.json, \.yaml or \.yml/
    );
    fs.unlinkSync(badPath);
  });

  it("still reports a missing file clearly", async () => {
    const intake = makeIntake();
    await expect(intake.loadSkill("./skills/nope.yaml")).rejects.toThrow(/not found/);
  });
});

describe("Brief generation — vault handling stays out of the brief", () => {
  // classification / access_restrictions / notes are declared alongside the
  // material because that is where the client knows them, but they describe
  // custody, not the work. The brief is what the freelancer reads.
  it("strips vault-handling fields from brief source materials", async () => {
    const intake = makeIntake();
    const skill = await intake.loadSkill(EXAMPLE_SKILL_JSON);
    const brief = intake.generateBrief(skill, {
      ...COMPLETE_RESPONSE,
      source_materials: [
        {
          name: "workflow.json",
          type: "file",
          location: "workflow.json",
          provenance: "client_upload",
          classification: "credentials_or_keys",
          access_restrictions: ["client_only"],
          notes: "handling note",
        },
      ],
    } as any);

    expect(brief.source_materials[0]).toEqual({
      name: "workflow.json",
      type: "file",
      location: "workflow.json",
      provenance: "client_upload",
    });
    expect(intake.validateBrief(brief).valid).toBe(true);
  });
});
