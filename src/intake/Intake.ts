import * as fs from "fs";
import { randomUUID } from "crypto";
import { ErrorObject } from "ajv";
import SchemaValidator from "../validation/SchemaValidator";
import { NewBrief } from "../types";

/**
 * Intake: skill-driven client brief collection
 *
 * Loads a freelancer skill (YAML), asks adaptive questions, collects the brief,
 * validates against the brief schema, and outputs a structured brief JSON.
 */

/**
 * A `what_i_need` entry that asks for access to a system rather than for a
 * file or a piece of text. Matched against the need's own wording.
 */
const ACCESS_NEED_PATTERN = /\baccess\b|\bcredential|\blogin\b|\bpermission/i;

/** Wording that suggests personal data may be in scope. */
const PII_HINT_PATTERN =
  /\bcustomers?\b|\busers?\b|\bpersonal data\b|\bpii\b|\bemail addresses\b|\bphone numbers\b/i;

export interface SkillSecurityRequirements {
  vault_scope?: string;
  data_retention?: string;
  approval_required_before_external_action?: boolean;
  no_production_credentials?: boolean;
  no_pii_unless_required?: boolean;
}

export interface SkillDefinition {
  skill: string;
  version: string;
  provider?: string;
  how_i_work?: string[];
  what_i_need?: string[];
  questions_i_ask?: string[];
  accepted_file_types?: string[];
  exclusions?: string[];
  deliverables?: string[];
  security_requirements?: SkillSecurityRequirements;
}

export interface ResponseSourceMaterial {
  name: string;
  type: string;
  location: string;
  provenance: string;
  collected_at?: string;
}

export interface ResponseAccessGrant {
  system: string;
  scope: string;
  expires_at?: string;
  security_note?: string;
}

export interface ClientResponse {
  client_name?: string;
  client_objective?: string;
  current_situation?: string;
  desired_result?: string;
  scope?: string;
  out_of_scope?: string[];
  constraints?: string[];
  stakeholders?: Array<{ name: string; role: string; approval_required?: boolean }>;
  source_materials?: ResponseSourceMaterial[];
  access_provided?: ResponseAccessGrant[];
  risks?: string[];
  open_questions?: string[];
  success_criteria?: string[];
  estimated_productive_time_minutes?: number;
  notes?: string;
}

/**
 * What intake produces. `NewBrief` pins `approval_status` to the literal
 * "pending_approval", so a change that auto-approves fails to compile as well
 * as failing the safety-invariant test.
 */
type GeneratedBrief = NewBrief;

export class Intake {
  private validator: SchemaValidator;
  private skillSchemaPath: string;
  private briefSchemaPath: string;

  constructor(
    skillSchemaPath: string = "./schemas/skill.schema.json",
    briefSchemaPath: string = "./schemas/brief.schema.json",
    validator: SchemaValidator = new SchemaValidator()
  ) {
    this.skillSchemaPath = skillSchemaPath;
    this.briefSchemaPath = briefSchemaPath;
    this.validator = validator;
  }

  /**
   * Load a skill file (YAML or JSON) and validate it
   */
  async loadSkill(skillPath: string): Promise<SkillDefinition> {
    if (!fs.existsSync(skillPath)) {
      throw new Error(`Skill file not found: ${skillPath}`);
    }

    const content = fs.readFileSync(skillPath, "utf-8");
    let skill: SkillDefinition;

    if (skillPath.endsWith(".yaml") || skillPath.endsWith(".yml")) {
      // For YAML, we'd use a YAML parser in production
      // For now, assume it's been converted to JSON or use a simple parser
      console.warn(
        "YAML parsing requires a YAML library. Using JSON-only for MVP."
      );
      throw new Error("YAML support not yet implemented. Use JSON skills.");
    } else {
      skill = JSON.parse(content);
    }

    // Validate against skill schema
    const result = this.validator.validate(this.skillSchemaPath, skill);

    if (!result.valid) {
      throw new Error(
        `Skill validation failed: ${JSON.stringify(result.errors)}`
      );
    }

    return skill;
  }

  /**
   * Generate questions based on the skill
   */
  generateIntakeQuestions(skill: SkillDefinition): string[] {
    const questions: string[] = [];

    // Standard opening questions
    questions.push("📋 First, let's establish your goal.");
    questions.push(`What is the single outcome you want to achieve with ${skill.skill}?`);

    // Skill-specific questions
    if (skill.questions_i_ask && skill.questions_i_ask.length > 0) {
      questions.push("\n🎯 Now, some specifics for this skill:");
      questions.push(...skill.questions_i_ask);
    }

    // Materials/input questions
    if (skill.what_i_need && skill.what_i_need.length > 0) {
      questions.push("\n📁 What materials do you have ready?");
      skill.what_i_need.forEach((need) => {
        questions.push(`  - ${need}`);
      });
    }

    // Constraints
    questions.push("\n⏱️ Any constraints or dependencies?");
    questions.push("(timeline, budget, technical limitations, stakeholders)");

    // Security/sensitivity
    if (skill.exclusions && skill.exclusions.length > 0) {
      questions.push("\n🔒 Security note:");
      skill.exclusions.forEach((excl) => {
        questions.push(`  ⚠️  ${excl}`);
      });
    }

    return questions;
  }

  /**
   * Validate that the response includes all required information
   */
  validateResponse(
    skill: SkillDefinition,
    response: ClientResponse
  ): {
    valid: boolean;
    missing: string[];
    warnings: string[];
  } {
    const missing: string[] = [];
    const warnings: string[] = [];

    const hasMaterials = (response.source_materials ?? []).length > 0;
    const hasAccess = (response.access_provided ?? []).length > 0;

    // Check required inputs from skill.what_i_need.
    //
    // A free-text need cannot be matched semantically to a specific artifact,
    // so this is a coarse but honest check: needs that ask for system access
    // are satisfied by an access grant, everything else by a source material.
    // The distinction matters — before, a single uploaded file silently
    // satisfied "read-only access to the platform", which is not a file at all.
    if (skill.what_i_need) {
      skill.what_i_need.forEach((need) => {
        if (ACCESS_NEED_PATTERN.test(need)) {
          if (!hasAccess) {
            missing.push(`Missing access: ${need}`);
          }
        } else if (!hasMaterials) {
          missing.push(`Missing material: ${need}`);
        }
      });
    }

    // Check that core fields are present
    if (!response.client_objective || response.client_objective === "") {
      missing.push("Missing: client objective (what you want to achieve)");
    }

    if (!response.desired_result || response.desired_result === "") {
      missing.push("Missing: desired result (what 'done' looks like)");
    }

    // Warn about PII.
    //
    // The flag lives at skill.security_requirements.no_pii_unless_required.
    // `exclusions` is free prose, so it is scanned by pattern rather than by
    // exact string match.
    const noPiiRequested =
      skill.security_requirements?.no_pii_unless_required === true ||
      (skill.exclusions ?? []).some((e) => /\bpii\b|personal data/i.test(e));

    if (noPiiRequested) {
      const searchable = [
        response.current_situation,
        response.client_objective,
        response.desired_result,
        response.scope,
        response.notes,
      ]
        .filter((v): v is string => typeof v === "string")
        .join(" ");

      if (PII_HINT_PATTERN.test(searchable)) {
        warnings.push(
          "⚠️  Your brief mentions customer/user/personal data. Make sure you've only shared what's necessary."
        );
      }
    }

    return {
      valid: missing.length === 0,
      missing,
      warnings,
    };
  }

  /**
   * Generate a structured brief from the response
   */
  generateBrief(
    skill: SkillDefinition,
    response: ClientResponse
  ): GeneratedBrief {
    const engagementId = `engagement-${randomUUID()}`;
    const briefId = `brief-${randomUUID()}`;

    const brief: GeneratedBrief = {
      brief_id: briefId,
      engagement_id: engagementId,
      skill: skill.skill,
      created_at: new Date().toISOString(),
      client_objective:
        (response.client_objective as string) || "Objective not specified",
      current_situation:
        (response.current_situation as string) || "Current state not described",
      desired_result:
        (response.desired_result as string) || "Desired result not specified",
      scope:
        (response.scope as string) ||
        `Work within the scope of this ${skill.skill} skill`,
      out_of_scope: (response.out_of_scope as string[]) || [],
      constraints: (response.constraints as string[]) || [],
      source_materials: response.source_materials || [],
      access_provided: response.access_provided || [],
      risks: (response.risks as string[]) || [],
      open_questions: (response.open_questions as string[]) || [],
      success_criteria: (response.success_criteria as string[]) || [
        "Deliverables received and approved",
        "All assumptions documented",
        "Tests passed (if applicable)",
      ],
      estimated_productive_time_minutes:
        typeof response.estimated_productive_time_minutes === "number"
          ? response.estimated_productive_time_minutes
          : 120,
      approval_status: "pending_approval",
    };

    return brief;
  }

  /**
   * Validate brief against the brief schema
   */
  validateBrief(brief: unknown): {
    valid: boolean;
    errors: ErrorObject[];
  } {
    return this.validator.validate(this.briefSchemaPath, brief);
  }

  /**
   * Full intake flow: load skill → ask questions → collect response → generate brief
   */
  async runIntake(skillPath: string, clientResponse: ClientResponse): Promise<{
    skill: SkillDefinition;
    brief: GeneratedBrief;
    validation: { valid: boolean; errors: ErrorObject[] };
    validation_response: { valid: boolean; missing: string[]; warnings: string[] };
  }> {
    // Load skill
    const skill = await this.loadSkill(skillPath);
    console.log(`✓ Loaded skill: ${skill.skill} v${skill.version}`);

    // Validate response completeness
    const responseValidation = this.validateResponse(skill, clientResponse);
    if (!responseValidation.valid) {
      console.warn("⚠️  Response incomplete:");
      responseValidation.missing.forEach((m) => console.warn(`  ${m}`));
    }

    if (responseValidation.warnings.length > 0) {
      console.warn("⚠️  Warnings:");
      responseValidation.warnings.forEach((w) => console.warn(`  ${w}`));
    }

    // Generate brief
    const brief = this.generateBrief(skill, clientResponse);
    console.log(`✓ Generated brief: ${brief.brief_id}`);

    // Validate brief against schema
    const briefValidation = this.validateBrief(brief);
    if (!briefValidation.valid) {
      console.error("❌ Brief validation failed:");
      briefValidation.errors?.forEach((e) => console.error(`  ${e.message}`));
    } else {
      console.log("✓ Brief schema validation passed");
    }

    return {
      skill,
      brief,
      validation: briefValidation,
      validation_response: responseValidation,
    };
  }
}

export default Intake;
