import * as fs from "fs";
import * as path from "path";
import { JsonSchema } from "../validation/SchemaValidator";

/**
 * Loading the JSON schemas off disk.
 *
 * This is the one module in the core that touches a filesystem. Everything
 * downstream — `Intake`, `ApprovalGate`, `SchemaValidator` — takes schema
 * objects, so the logic runs anywhere the objects can be supplied: a Node
 * process, a test with no fixtures, or a browser bundle that inlines them.
 *
 * The files in `schemas/` remain the source of truth. This just reads them.
 */

export const DEFAULT_SCHEMA_DIR = "./schemas";

export interface Schemas {
  skill: JsonSchema;
  brief: JsonSchema;
  vault: JsonSchema;
  returnHandover: JsonSchema;
}

export const SCHEMA_FILES: Record<keyof Schemas, string> = {
  skill: "skill.schema.json",
  brief: "brief.schema.json",
  vault: "vault-manifest.schema.json",
  returnHandover: "return-handover.schema.json",
};

function readSchema(dir: string, file: string): JsonSchema {
  const filePath = path.join(dir, file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Schema not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

export function loadSchemas(dir: string = DEFAULT_SCHEMA_DIR): Schemas {
  return {
    skill: readSchema(dir, SCHEMA_FILES.skill),
    brief: readSchema(dir, SCHEMA_FILES.brief),
    vault: readSchema(dir, SCHEMA_FILES.vault),
    returnHandover: readSchema(dir, SCHEMA_FILES.returnHandover),
  };
}

let cached: Schemas | undefined;

/**
 * The schemas from `./schemas`, read once per process.
 *
 * Callers that need a different directory — tests running from anywhere,
 * a consumer vendoring its own copies — pass their own via `loadSchemas`.
 */
export function defaultSchemas(): Schemas {
  if (!cached) {
    cached = loadSchemas();
  }
  return cached;
}

export default defaultSchemas;
