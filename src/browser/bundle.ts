import * as fs from "fs";
import * as path from "path";
import * as esbuild from "esbuild";
import { loadSchemas } from "../schemas";

/**
 * Bundles the real core for the browser.
 *
 * The point is that the page runs the same Intake, VaultManifest and
 * ApprovalGate the server runs, rather than a mirror of them that drifts. The
 * schemas are substituted in at build time so nothing has to be fetched and no
 * filesystem is involved.
 *
 * Output is a self-contained IIFE that gets inlined into the page — the demo
 * must load zero external resources, and the artifact host's CSP blocks
 * external scripts outright.
 */

export interface BuildBrowserOptions {
  minify?: boolean;
  schemaDir?: string;
  /** Skill the in-page form runs intake against. Defaults to the example. */
  skillPath?: string;
}

const DEFAULT_SKILL = "./skills/example-skill.json";

export async function buildBrowserBundle(
  options: BuildBrowserOptions = {}
): Promise<string> {
  const schemas = loadSchemas(options.schemaDir);
  const skill = JSON.parse(
    fs.readFileSync(options.skillPath ?? DEFAULT_SKILL, "utf-8")
  );

  const result = await esbuild.build({
    entryPoints: [path.resolve(__dirname, "entry.ts")],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["es2020"],
    minify: options.minify ?? true,
    write: false,
    legalComments: "none",
    alias: {
      // The core imports randomUUID from Node's crypto. The browser has an
      // equivalent; this supplies it without changing the core.
      crypto: path.resolve(__dirname, "crypto-shim.ts"),
    },
    define: {
      // Substituted textually, so the schemas end up as literals in the bundle.
      __HANDOVER_SCHEMAS__: JSON.stringify({
        skill: schemas.skill,
        brief: schemas.brief,
        vault: schemas.vault,
      }),
      // The form needs a skill to run intake against; the example ships with it.
      __HANDOVER_SKILL__: JSON.stringify(skill),
      "process.env.NODE_ENV": '"production"',
    },
  });

  if (result.outputFiles.length !== 1) {
    throw new Error(
      `Expected exactly one bundle, got ${result.outputFiles.length}`
    );
  }

  return result.outputFiles[0].text;
}

export default buildBrowserBundle;
