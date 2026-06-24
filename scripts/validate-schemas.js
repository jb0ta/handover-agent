#!/usr/bin/env node
/**
 * Validates that all JSON schemas are well-formed and that the example
 * skill + example outputs conform to their schemas.
 */
const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");

const ROOT = path.join(__dirname, "..");
const ajv = new Ajv({ allErrors: true });

let failures = 0;

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function check(name, ok, detail) {
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ❌ ${name}${detail ? " — " + detail : ""}`);
    failures++;
  }
}

console.log("Validating schemas are well-formed JSON Schema...");
const schemaDir = path.join(ROOT, "schemas");
const schemas = {};
for (const file of fs.readdirSync(schemaDir).filter((f) => f.endsWith(".json"))) {
  try {
    const schema = loadJson(path.join(schemaDir, file));
    const validate = ajv.compile(schema);
    schemas[file] = validate;
    check(file, typeof validate === "function");
  } catch (e) {
    check(file, false, e.message);
  }
}

console.log("\nValidating example skill against skill.schema.json...");
try {
  const skill = loadJson(path.join(ROOT, "skills", "example-skill.json"));
  const validate = schemas["skill.schema.json"];
  const ok = validate(skill);
  check("example-skill.json", ok, ok ? "" : ajv.errorsText(validate.errors));
} catch (e) {
  check("example-skill.json", false, e.message);
}

console.log("\nValidating example outputs (if present)...");
const examplesDir = path.join(ROOT, "examples");
const exampleChecks = [
  ["example-brief.json", "brief.schema.json"],
  ["example-vault-manifest.json", "vault-manifest.schema.json"],
];
for (const [file, schemaName] of exampleChecks) {
  const p = path.join(examplesDir, file);
  if (!fs.existsSync(p)) {
    console.log(`  (skipped ${file} — run 'npm start' to generate it)`);
    continue;
  }
  try {
    const data = loadJson(p);
    const validate = schemas[schemaName];
    const ok = validate(data);
    check(file, ok, ok ? "" : ajv.errorsText(validate.errors));
  } catch (e) {
    check(file, false, e.message);
  }
}

console.log("");
if (failures > 0) {
  console.error(`❌ ${failures} validation failure(s).`);
  process.exit(1);
} else {
  console.log("✅ All schema validations passed.");
}
