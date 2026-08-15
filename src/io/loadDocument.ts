import * as fs from "fs";
import * as path from "path";
import { parse as parseYaml } from "yaml";

/**
 * Reads a structured document from disk as JSON or YAML.
 *
 * Skills are meant to be written by hand — YAML is the format a person
 * actually wants to author. Client responses are the same. Both formats
 * produce the same object, so everything downstream (schema validation,
 * intake, the gate) is unaffected by which one was used.
 */

const YAML_EXTENSIONS = [".yaml", ".yml"];
const JSON_EXTENSIONS = [".json"];

export function isYamlPath(filePath: string): boolean {
  return YAML_EXTENSIONS.includes(path.extname(filePath).toLowerCase());
}

export function loadDocument<T = unknown>(filePath: string, label = "file"): T {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }

  const extension = path.extname(filePath).toLowerCase();
  if (![...YAML_EXTENSIONS, ...JSON_EXTENSIONS].includes(extension)) {
    throw new Error(
      `${label} must be .json, .yaml or .yml — got "${extension || filePath}"`
    );
  }

  const content = fs.readFileSync(filePath, "utf-8");

  let parsed: unknown;
  try {
    parsed = isYamlPath(filePath) ? parseYaml(content) : JSON.parse(content);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} is not valid ${isYamlPath(filePath) ? "YAML" : "JSON"}: ${detail}`);
  }

  // A YAML file of only comments parses to null, and a bare scalar parses to a
  // string — both would otherwise reach schema validation as a confusing error.
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must contain an object at the top level: ${filePath}`);
  }

  return parsed as T;
}

export default loadDocument;
