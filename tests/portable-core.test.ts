import * as fs from "fs";
import * as path from "path";
import Intake from "../src/intake/Intake";
import ApprovalGate from "../src/approval/ApprovalGate";
import SchemaValidator from "../src/validation/SchemaValidator";
import { buildVaultManifest } from "../src/vault/VaultManifest";
import { loadSchemas } from "../src/schemas";
import { Brief } from "../src/types";

/**
 * The core must not depend on a filesystem.
 *
 * Validation, intake, vault packaging and the approval gate take objects and
 * return objects. That is what lets the same code run in Node, in a test with
 * nothing on disk, and — the reason this refactor happened — in a browser,
 * without a second implementation drifting away from the real one.
 *
 * These tests fail if that coupling comes back.
 */

const SRC = path.join(__dirname, "../src");
const SCHEMAS = loadSchemas(path.join(__dirname, "../schemas"));

const CORE_MODULES = [
  "validation/SchemaValidator.ts",
  "intake/Intake.ts",
  "approval/ApprovalGate.ts",
  "vault/VaultManifest.ts",
  "types.ts",
];

describe("core modules reach no filesystem", () => {
  it.each(CORE_MODULES)("%s imports neither fs nor path", (module) => {
    const source = fs.readFileSync(path.join(SRC, module), "utf-8");
    const imports = source
      .split("\n")
      .filter((line) => /^\s*import /.test(line))
      .join("\n");

    expect(imports).not.toMatch(/from "fs"/);
    expect(imports).not.toMatch(/from "node:fs"/);
    expect(imports).not.toMatch(/from "path"/);
    expect(imports).not.toMatch(/require\(/);
  });

  it.each(CORE_MODULES)("%s does not pull in a file loader", (module) => {
    const source = fs.readFileSync(path.join(SRC, module), "utf-8");
    // src/schemas and src/io both read from disk. A core module importing
    // either — even only as a default argument — drags fs into any bundle.
    expect(source).not.toMatch(/from "\.\.?\/io\//);
    expect(source).not.toMatch(/from "\.\.?\/schemas"/);
  });
});

describe("a full engagement runs from objects alone", () => {
  // No paths anywhere below: schemas and the skill are plain objects, exactly
  // what a browser bundle would inline.
  const SKILL = {
    skill: "workflow-automation-review",
    version: "0.1.0",
    how_i_work: ["I review one automation workflow end-to-end and report back."],
    what_i_need: ["A workflow export", "Read-only access to the platform"],
    questions_i_ask: ["What should this workflow do better?"],
    deliverables: ["A prioritised list of fixes"],
    completion_conditions: ["Findings delivered and reviewed"],
    security_requirements: { no_pii_unless_required: true },
  };

  const RESPONSE = {
    client_name: "Acme Ltd.",
    client_objective: "Make the lead workflow faster and more reliable",
    current_situation: "It times out on large batches and sometimes drops rows",
    desired_result: "Handles 500+ leads a day with no data loss",
    source_materials: [
      {
        name: "workflow.json",
        type: "file",
        location: "workflow.json",
        provenance: "client_upload",
        classification: "confidential" as const,
      },
    ],
    access_provided: [{ system: "n8n", scope: "read-only" }],
    estimated_productive_time_minutes: 120,
  };

  function build() {
    const validator = new SchemaValidator();
    const intake = new Intake(
      { skill: SCHEMAS.skill, brief: SCHEMAS.brief },
      validator
    );
    const gate = new ApprovalGate(
      { brief: SCHEMAS.brief, vault: SCHEMAS.vault },
      validator
    );
    return { intake, gate };
  }

  it("validates a skill handed in as an object", () => {
    const { intake } = build();
    expect(intake.useSkill(SKILL).skill).toBe("workflow-automation-review");
  });

  it("rejects an invalid skill object", () => {
    const { intake } = build();
    expect(() => intake.useSkill({ skill: "x", version: "0.1.0" })).toThrow(
      /validation failed/
    );
  });

  it("goes from skill and response to an approved handover", () => {
    const { intake, gate } = build();

    const skill = intake.useSkill(SKILL);
    const findings = intake.validateResponse(skill, RESPONSE);
    const brief = intake.generateBrief(skill, RESPONSE) as Brief;
    const vault = buildVaultManifest(brief, {
      items: RESPONSE.source_materials.map((m) => ({
        name: m.name,
        type: m.type,
        path: m.location,
        provenance: m.provenance,
        classification: m.classification,
      })),
    });

    expect(findings.valid).toBe(true);
    expect(intake.validateBrief(brief).valid).toBe(true);
    expect(brief.approval_status).toBe("pending_approval");
    expect(vault.access_control?.freelancer_access).toBe("none");

    const decided = gate.decide(brief, vault, {
      decision: "approved",
      approver_role: "client",
      approver_name: "José Bota",
    });

    expect(decided.brief.approval_status).toBe("approved");
    expect(decided.vault.access_control?.freelancer_access).toBe("read_only");
    expect(decided.vault.audit_log).toHaveLength(vault.audit_log.length + 1);
  });

  it("still refuses an agent approver with no filesystem in play", () => {
    const { intake, gate } = build();
    const skill = intake.useSkill(SKILL);
    const brief = intake.generateBrief(skill, RESPONSE) as Brief;
    const vault = buildVaultManifest(brief);

    expect(() =>
      gate.decide(brief, vault, {
        decision: "approved",
        approver_role: "client",
        approver_name: "agent_intake",
      })
    ).toThrow(/automated identity/);
  });
});

describe("Intake without a document reader", () => {
  it("says how to proceed rather than failing obscurely", async () => {
    const intake = new Intake({ skill: SCHEMAS.skill, brief: SCHEMAS.brief });
    await expect(intake.loadSkill("./skills/example-skill.yaml")).rejects.toThrow(
      /no document reader|useSkill/
    );
  });
});

describe("SchemaValidator caches by schema identity", () => {
  it("validates repeatedly against the same $id without throwing", () => {
    const validator = new SchemaValidator();
    for (let i = 0; i < 3; i += 1) {
      expect(validator.validate(SCHEMAS.brief, {}).valid).toBe(false);
    }
  });

  it("handles a schema with no $id", () => {
    const validator = new SchemaValidator();
    const anonymous = { type: "object", required: ["a"] };
    expect(validator.validate(anonymous, { a: 1 }).valid).toBe(true);
    expect(validator.validate(anonymous, {}).valid).toBe(false);
  });

  it("keeps two distinct schemas apart", () => {
    const validator = new SchemaValidator();
    expect(validator.validate({ type: "string" }, "x").valid).toBe(true);
    expect(validator.validate({ type: "number" }, "x").valid).toBe(false);
  });
});
