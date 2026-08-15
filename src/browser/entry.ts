import Intake, { ClientResponse, SkillDefinition } from "../intake/Intake";
import ApprovalGate, { ApprovalError, DecisionRequest } from "../approval/ApprovalGate";
import SchemaValidator, { JsonSchema } from "../validation/SchemaValidator";
import { buildVaultManifest } from "../vault/VaultManifest";
import { Brief, VaultManifest } from "../types";

/**
 * Browser entry point.
 *
 * The page runs the *real* intake, vault packaging and approval gate — the same
 * modules the server runs — rather than a second implementation that would
 * drift. That is what the I/O separation was for: these classes take objects,
 * so a browser can supply them.
 *
 * The schemas are substituted at build time (`scripts/build-browser.ts` passes
 * them through esbuild's `define`), which keeps the JSON out of TypeScript's
 * module resolution and the filesystem out of the bundle.
 *
 * Nothing here transmits anything. There is no fetch, no storage, no analytics:
 * whatever a visitor types stays in the tab until they close it.
 */

declare const __HANDOVER_SCHEMAS__: {
  skill: JsonSchema;
  brief: JsonSchema;
  vault: JsonSchema;
};
declare const __HANDOVER_SKILL__: unknown;

const schemas = __HANDOVER_SCHEMAS__;

export interface BuiltEngagement {
  brief: Brief;
  vault: VaultManifest;
  findings: { missing: string[]; warnings: string[] };
}

export class HandoverBrowser {
  private intake: Intake;
  private gate: ApprovalGate;
  /** The skill the in-page form runs against, validated at construction. */
  readonly skill: SkillDefinition;

  constructor() {
    // One validator for both: AJV refuses a second compile of the same $id,
    // and the brief schema is used by each.
    const validator = new SchemaValidator();
    this.intake = new Intake(
      { skill: schemas.skill, brief: schemas.brief },
      validator
    );
    this.gate = new ApprovalGate(
      { brief: schemas.brief, vault: schemas.vault },
      validator
    );
    this.skill = this.intake.useSkill(__HANDOVER_SKILL__);
  }

  /** Validate a skill object. Throws with the schema errors if it is invalid. */
  useSkill(skill: unknown): SkillDefinition {
    return this.intake.useSkill(skill);
  }

  /**
   * Run intake and package a vault — the same path `createEngagement` takes on
   * the server, minus the file reading.
   */
  build(skill: SkillDefinition, response: ClientResponse): BuiltEngagement {
    const findings = this.intake.validateResponse(skill, response);
    const brief = this.intake.generateBrief(skill, response) as Brief;

    const briefValidation = this.intake.validateBrief(brief);
    if (!briefValidation.valid) {
      throw new Error(
        briefValidation.errors
          .map((e) => `${e.instancePath || "brief"} ${e.message}`)
          .join("; ")
      );
    }

    const vault = buildVaultManifest(brief, {
      items: (response.source_materials ?? []).map((material) => ({
        name: material.name,
        type: material.type,
        path: material.location,
        provenance: material.provenance,
        collected_at: material.collected_at,
        collection_method: "user_upload",
        classification: material.classification,
        access_restrictions: material.access_restrictions,
        notes: material.notes,
      })),
    });

    return {
      brief,
      vault,
      findings: { missing: findings.missing, warnings: findings.warnings },
    };
  }

  /** Record a decision. The gate's refusals apply here exactly as on the server. */
  decide(brief: Brief, vault: VaultManifest, request: DecisionRequest) {
    return this.gate.decide(brief, vault, request);
  }

  isApprovalError(error: unknown): error is ApprovalError {
    return error instanceof ApprovalError;
  }
}

/**
 * Published as a global rather than a module export: the page's own script is
 * plain inline JavaScript, not a module, so this is what it can reach.
 * `globalThis` rather than `window` keeps the DOM lib out of the core build.
 */
(globalThis as unknown as { Handover: HandoverBrowser }).Handover =
  new HandoverBrowser();
