import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import Intake from "../src/intake/Intake";
import { createEngagement } from "../src/engagement/createEngagement";
import { parseArgs, UsageError, DEFAULT_SKILL_PATH } from "../src/cli/options";
import { loadSchemas, createIntake } from "../src/node";

/**
 * The point of this suite: a real engagement must run from files, with no
 * source edits. The client response used to be a const in TypeScript, so
 * onboarding an actual client meant editing the repo.
 */

const SCHEMAS = loadSchemas(path.join(__dirname, "../schemas"));
const EXAMPLE_SKILL_YAML = path.join(__dirname, "../skills/example-skill.yaml");
const EXAMPLE_SKILL_JSON = path.join(__dirname, "../skills/example-skill.json");
const EXAMPLE_RESPONSE = path.join(
  __dirname,
  "../examples/example-client-response.yaml"
);

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "handover-files-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeIntake(): Intake {
  return createIntake(SCHEMAS);
}

function write(name: string, content: string): string {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

describe("createEngagement — from real files", () => {
  it("builds a full engagement from a YAML skill and a YAML response", async () => {
    const engagement = await createEngagement(makeIntake(), {
      skillPath: EXAMPLE_SKILL_YAML,
      responsePath: EXAMPLE_RESPONSE,
    });

    expect(engagement.validation.valid).toBe(true);
    expect(engagement.responseValidation.valid).toBe(true);
    expect(engagement.brief.approval_status).toBe("pending_approval");
    expect(engagement.vault.access_control?.freelancer_access).toBe("none");
    expect(engagement.vault.items).toHaveLength(2);
    expect(engagement.sources.response).toBe(EXAMPLE_RESPONSE);
  });

  it("carries per-material classification from the response into the vault", async () => {
    const engagement = await createEngagement(makeIntake(), {
      skillPath: EXAMPLE_SKILL_YAML,
      responsePath: EXAMPLE_RESPONSE,
    });

    const byName = Object.fromEntries(
      engagement.vault.items.map((item) => [item.name, item])
    );
    expect(byName["Lead workflow export"].classification).toBe("internal");
    expect(byName["Error log (last 7 days)"].classification).toBe("confidential");
    expect(byName["Error log (last 7 days)"].notes).toMatch(/May contain PII/);
    expect(byName["Error log (last 7 days)"].access_restrictions).toEqual([
      "freelancer_only",
    ]);
  });

  it("falls back to the built-in example when no response file is given", async () => {
    const engagement = await createEngagement(makeIntake(), {
      skillPath: EXAMPLE_SKILL_JSON,
    });

    expect(engagement.sources.response).toBe("(built-in example)");
    expect(engagement.validation.valid).toBe(true);
    expect(engagement.vault.items.length).toBeGreaterThan(0);
  });

  it("produces the same engagement shape from the YAML example as the built-in one", async () => {
    // examples/example-client-response.yaml is the demo constant in the format
    // a client would actually be handed; they must not drift.
    const fromFile = await createEngagement(makeIntake(), {
      skillPath: EXAMPLE_SKILL_YAML,
      responsePath: EXAMPLE_RESPONSE,
    });
    const builtIn = await createEngagement(makeIntake(), {
      skillPath: EXAMPLE_SKILL_YAML,
    });

    expect(fromFile.brief.client_objective).toBe(builtIn.brief.client_objective);
    expect(fromFile.brief.current_situation).toBe(builtIn.brief.current_situation);
    expect(fromFile.brief.success_criteria).toEqual(builtIn.brief.success_criteria);
    expect(fromFile.vault.items.map((i) => i.classification)).toEqual(
      builtIn.vault.items.map((i) => i.classification)
    );
  });

  it("surfaces missing information from a thin response rather than accepting it", async () => {
    const thin = write(
      "thin.yaml",
      [
        "client_objective: Make the thing faster please",
        "desired_result: It should be faster than it is now",
        "estimated_productive_time_minutes: 120",
      ].join("\n")
    );

    const engagement = await createEngagement(makeIntake(), {
      skillPath: EXAMPLE_SKILL_YAML,
      responsePath: thin,
    });

    expect(engagement.responseValidation.valid).toBe(false);
    const missing = engagement.responseValidation.missing.join("\n");
    expect(missing).toMatch(/Missing material:/);
    expect(missing).toMatch(/Missing access:/);
    expect(engagement.vault.items).toHaveLength(0);
  });

  it("reports a missing response file clearly", async () => {
    await expect(
      createEngagement(makeIntake(), {
        skillPath: EXAMPLE_SKILL_YAML,
        responsePath: path.join(tmpDir, "nope.yaml"),
      })
    ).rejects.toThrow(/Client response not found/);
  });

  it("reports a top-level non-object response clearly", async () => {
    const bad = write("bad.yaml", "- just\n- a\n- list\n");
    await expect(
      createEngagement(makeIntake(), {
        skillPath: EXAMPLE_SKILL_YAML,
        responsePath: bad,
      })
    ).rejects.toThrow(/must contain an object at the top level/);
  });

  it("accepts a JSON response as readily as YAML", async () => {
    const jsonResponse = write(
      "response.json",
      JSON.stringify({
        client_objective: "Make our lead workflow faster",
        current_situation: "Our n8n workflow times out on large batches",
        desired_result: "Handle 500+ leads with no data loss",
        source_materials: [
          {
            name: "workflow.json",
            type: "file",
            location: "workflow.json",
            provenance: "client_upload",
            classification: "confidential",
          },
        ],
        access_provided: [{ system: "n8n", scope: "read-only" }],
        estimated_productive_time_minutes: 120,
      })
    );

    const engagement = await createEngagement(makeIntake(), {
      skillPath: EXAMPLE_SKILL_JSON,
      responsePath: jsonResponse,
    });

    expect(engagement.responseValidation.valid).toBe(true);
    expect(engagement.vault.items[0].classification).toBe("confidential");
  });
});

describe("parseArgs", () => {
  it("defaults to the example skill and the built-in response", () => {
    const options = parseArgs([]);
    expect(options.skillPath).toBe(DEFAULT_SKILL_PATH);
    expect(options.responsePath).toBeUndefined();
    expect(options.help).toBe(false);
  });

  it("reads --flag value and --flag=value alike", () => {
    expect(parseArgs(["--skill", "a.yaml", "--response", "b.yaml"])).toMatchObject({
      skillPath: "a.yaml",
      responsePath: "b.yaml",
    });
    expect(parseArgs(["--skill=a.yaml", "--response=b.yaml"])).toMatchObject({
      skillPath: "a.yaml",
      responsePath: "b.yaml",
    });
  });

  it("parses port and output directory", () => {
    const options = parseArgs(["--port", "8080", "--out", "./out"]);
    expect(options.port).toBe(8080);
    expect(options.outputDir).toBe("./out");
  });

  it.each([["-h"], ["--help"]])("treats %s as a help request", (flag) => {
    expect(parseArgs([flag]).help).toBe(true);
  });

  // A typo'd flag silently falling back to the demo would be the worst
  // possible failure here: you would review the example and think it was
  // your client's data.
  it("rejects an unknown flag rather than ignoring it", () => {
    expect(() => parseArgs(["--responses", "b.yaml"])).toThrow(UsageError);
    expect(() => parseArgs(["--responses", "b.yaml"])).toThrow(/Unknown option/);
  });

  it("rejects a flag with no value", () => {
    expect(() => parseArgs(["--skill"])).toThrow(/needs a value/);
    expect(() => parseArgs(["--skill", "--response", "b.yaml"])).toThrow(
      /needs a value/
    );
  });

  it("rejects a non-numeric or out-of-range port", () => {
    expect(() => parseArgs(["--port", "abc"])).toThrow(/must be a number/);
    expect(() => parseArgs(["--port", "70000"])).toThrow(/must be a number/);
  });
});
