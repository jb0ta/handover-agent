import Intake, { ClientResponse, SkillDefinition } from "../intake/Intake";
import { buildVaultManifest } from "../vault/VaultManifest";
import loadDocument from "../io/loadDocument";
import { DEMO_CLIENT_RESPONSE } from "../demo/demoEngagement";
import { Brief, VaultManifest } from "../types";

/**
 * Runs a skill and a client response through intake and packages the result.
 *
 * This is the path a real engagement takes. The built-in worked example is
 * just the default value of one argument — there is no separate "demo mode"
 * with its own code path, so anything that works for the example works for a
 * real client.
 *
 * Nothing here approves anything: the brief comes back `pending_approval` and
 * the vault comes back with `freelancer_access: "none"`.
 */

export interface CreateEngagementOptions {
  skillPath: string;
  /** Client response file. Omit to use the built-in worked example. */
  responsePath?: string;
  retentionDays?: number;
}

export interface Engagement {
  skill: SkillDefinition;
  brief: Brief;
  vault: VaultManifest;
  validation: ReturnType<Intake["validateBrief"]>;
  responseValidation: ReturnType<Intake["validateResponse"]>;
  /** Where the inputs came from, for display and for the audit trail. */
  sources: { skill: string; response: string };
}

export async function createEngagement(
  intake: Intake,
  options: CreateEngagementOptions
): Promise<Engagement> {
  const skill = await intake.loadSkill(options.skillPath);

  const response = options.responsePath
    ? loadDocument<ClientResponse>(options.responsePath, "Client response")
    : DEMO_CLIENT_RESPONSE;

  const responseValidation = intake.validateResponse(skill, response);
  const brief = intake.generateBrief(skill, response) as Brief;
  const validation = intake.validateBrief(brief);

  const vault = buildVaultManifest(brief, {
    retentionDays: options.retentionDays,
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
    skill,
    brief,
    vault,
    validation,
    responseValidation,
    sources: {
      skill: options.skillPath,
      response: options.responsePath ?? "(built-in example)",
    },
  };
}

export default createEngagement;
