import * as fs from "fs";
import Ajv from "ajv";
import { v4 as uuidv4 } from "uuid";

/**
 * Intake: skill-driven client brief collection
 *
 * Loads a freelancer skill (YAML), asks adaptive questions, collects the brief,
 * validates against the brief schema, and outputs a structured brief JSON.
 */

interface SkillDefinition {
  skill: string;
  version: string;
  provider?: string;
  how_i_work?: string[];
  what_i_need?: string[];
  questions_i_ask?: string[];
  accepted_file_types?: string[];
  exclusions?: string[];
  deliverables?: string[];
}

interface ClientResponse {
  [key: string]: string | string[] | { [key: string]: any };
}

interface GeneratedBrief {
  brief_id: string;
  engagement_id: string;
  skill: string;
  created_at: string;
  client_objective: string;
  current_situation: string;
  desired_result: string;
  scope: string;
  out_of_scope: string[];
  constraints: string[];
  source_materials: Array<{
    name: string;
    type: string;
    location: string;
    provenance: string;
    collected_at: string;
  }>;
  access_provided: Array<{
    system: string;
    scope: string;
  }>;
  risks: string[];
  open_questions: string[];
  success_criteria: string[];
  estimated_productive_time_minutes: number;
  approval_status: "pending_approval";
}

export class Intake {
  private ajv: Ajv;
  private skillSchemaPath: string;
  private briefSchemaPath: string;

  constructor(
    skillSchemaPath: string = "./schemas/skill.schema.json",
    briefSchemaPath: string = "./schemas/brief.schema.json"
  ) {
    this.ajv = new Ajv({});
    this.skillSchemaPath = skillSchemaPath;
    this.briefSchemaPath = briefSchemaPath;
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
    const schemaContent = fs.readFileSync(this.skillSchemaPath, "utf-8");
    const skillSchema = JSON.parse(schemaContent);
    const validate = this.ajv.compile(skillSchema);

    if (!validate(skill)) {
      throw new Error(
        `Skill validation failed: ${JSON.stringify(validate.errors)}`
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

    // Check required inputs from skill.what_i_need
    if (skill.what_i_need) {
      skill.what_i_need.forEach((need) => {
        if (
          !response.source_materials ||
          (Array.isArray(response.source_materials) &&
            response.source_materials.length === 0)
        ) {
          missing.push(`Missing: ${need}`);
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

    // Warn about PII
    if (skill.exclusions && skill.exclusions.includes("no_pii_unless_required")) {
      if (
        response.current_situation &&
        typeof response.current_situation === "string"
      ) {
        if (
          response.current_situation.toLowerCase().includes("customer") ||
          response.current_situation.toLowerCase().includes("user")
        ) {
          warnings.push(
            "⚠️  Your brief mentions customer/user data. Make sure you've only shared what's necessary."
          );
        }
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
    const engagementId = `engagement-${uuidv4()}`;
    const briefId = `brief-${uuidv4()}`;

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
      source_materials: (response.source_materials as any[]) || [],
      access_provided: (response.access_provided as any[]) || [],
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
  validateBrief(brief: any): {
    valid: boolean;
    errors: any[];
  } {
    const schemaContent = fs.readFileSync(this.briefSchemaPath, "utf-8");
    const briefSchema = JSON.parse(schemaContent);
    const validate = this.ajv.compile(briefSchema);

    const valid = validate(brief);

    return {
      valid,
      errors: validate.errors || [],
    };
  }

  /**
   * Full intake flow: load skill → ask questions → collect response → generate brief
   */
  async runIntake(skillPath: string, clientResponse: ClientResponse): Promise<{
    skill: SkillDefinition;
    brief: GeneratedBrief;
    validation: { valid: boolean; errors: any[] };
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
