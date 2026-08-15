import Intake from "../src/intake/Intake";
import { loadSchemas, createIntake } from "../src/node";
import * as fs from "fs";
import * as path from "path";

const SCHEMAS = loadSchemas(path.join(__dirname, "../schemas"));
const EXAMPLE_SKILL = path.join(__dirname, "../skills/example-skill.json");

function makeIntake(): Intake {
  return createIntake(SCHEMAS);
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
  // The example skill's what_i_need includes "Read-only access to the relevant
  // platform" — an access grant, not a file. A response without it is not
  // complete, so the fixture carries one.
  access_provided: [
    {
      system: "n8n",
      scope: "read-only access to the workflow and logs",
    },
  ],
  estimated_productive_time_minutes: 120,
};

describe("Intake — skill loading", () => {
  it("loads and validates a well-formed skill", async () => {
    const intake = makeIntake();
    const skill = await intake.loadSkill(EXAMPLE_SKILL);
    expect(skill.skill).toBe("workflow-automation-review");
    expect(skill.version).toBe("0.1.0");
    expect(Array.isArray(skill.questions_i_ask)).toBe(true);
  });

  it("throws on a missing skill file", async () => {
    const intake = makeIntake();
    await expect(intake.loadSkill("./skills/does-not-exist.json")).rejects.toThrow(
      /not found/
    );
  });

  it("rejects a skill that violates the schema", async () => {
    const intake = makeIntake();
    const badSkillPath = path.join(__dirname, "tmp-bad-skill.json");
    // Missing required fields (how_i_work, what_i_need, etc.)
    fs.writeFileSync(badSkillPath, JSON.stringify({ skill: "x", version: "0.1.0" }));
    await expect(intake.loadSkill(badSkillPath)).rejects.toThrow(/validation failed/);
    fs.unlinkSync(badSkillPath);
  });
});

describe("Intake — question generation", () => {
  it("includes the skill's own questions", async () => {
    const intake = makeIntake();
    const skill = await intake.loadSkill(EXAMPLE_SKILL);
    const questions = intake.generateIntakeQuestions(skill);
    const joined = questions.join(" ");
    expect(joined).toContain("single outcome");
    expect(joined).toContain("break or slow down");
  });

  it("surfaces the skill's exclusions as security notes", async () => {
    const intake = makeIntake();
    const skill = await intake.loadSkill(EXAMPLE_SKILL);
    const questions = intake.generateIntakeQuestions(skill);
    const joined = questions.join(" ");
    expect(joined.toLowerCase()).toContain("no production credentials");
  });
});

describe("Intake — response validation (missing-info detection)", () => {
  it("passes a complete response", async () => {
    const intake = makeIntake();
    const skill = await intake.loadSkill(EXAMPLE_SKILL);
    const result = intake.validateResponse(skill, COMPLETE_RESPONSE as any);
    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it("detects a missing objective", async () => {
    const intake = makeIntake();
    const skill = await intake.loadSkill(EXAMPLE_SKILL);
    const incomplete = { ...COMPLETE_RESPONSE, client_objective: "" };
    const result = intake.validateResponse(skill, incomplete as any);
    expect(result.valid).toBe(false);
    expect(result.missing.join(" ")).toMatch(/objective/i);
  });

  it("detects missing source materials", async () => {
    const intake = makeIntake();
    const skill = await intake.loadSkill(EXAMPLE_SKILL);
    const incomplete = { ...COMPLETE_RESPONSE, source_materials: [] };
    const result = intake.validateResponse(skill, incomplete as any);
    expect(result.valid).toBe(false);
  });
});

describe("Intake — brief generation", () => {
  it("produces a schema-valid brief", async () => {
    const intake = makeIntake();
    const skill = await intake.loadSkill(EXAMPLE_SKILL);
    const brief = intake.generateBrief(skill, COMPLETE_RESPONSE as any);
    const validation = intake.validateBrief(brief);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it("sets brief_id and engagement_id with correct prefixes", async () => {
    const intake = makeIntake();
    const skill = await intake.loadSkill(EXAMPLE_SKILL);
    const brief = intake.generateBrief(skill, COMPLETE_RESPONSE as any);
    expect(brief.brief_id).toMatch(/^brief-/);
    expect(brief.engagement_id).toMatch(/^engagement-/);
  });

  it("SAFETY INVARIANT: every new brief starts pending_approval", async () => {
    const intake = makeIntake();
    const skill = await intake.loadSkill(EXAMPLE_SKILL);
    const brief = intake.generateBrief(skill, COMPLETE_RESPONSE as any);
    // Nothing leaves without a human approving it. A fresh brief must never
    // be auto-approved by the agent.
    expect(brief.approval_status).toBe("pending_approval");
  });

  it("links the brief to the same engagement_id", async () => {
    const intake = makeIntake();
    const skill = await intake.loadSkill(EXAMPLE_SKILL);
    const brief = intake.generateBrief(skill, COMPLETE_RESPONSE as any);
    expect(brief.engagement_id).toBeTruthy();
    expect(brief.skill).toBe(skill.skill);
  });
});

describe("Intake — full flow", () => {
  it("runs end-to-end and returns a valid, pending-approval brief", async () => {
    const intake = makeIntake();
    const result = await intake.runIntake(EXAMPLE_SKILL, COMPLETE_RESPONSE as any);
    expect(result.brief).toBeTruthy();
    expect(result.validation.valid).toBe(true);
    expect(result.brief.approval_status).toBe("pending_approval");
  });
});
