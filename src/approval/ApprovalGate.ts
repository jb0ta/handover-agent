import SchemaValidator from "../validation/SchemaValidator";
import {
  ApproverRole,
  AuditEntry,
  Brief,
  VaultManifest,
} from "../types";

/**
 * ApprovalGate: the human sign-off between "the agent packaged it" and
 * "the freelancer can see it".
 *
 * The agent is allowed to collect, structure, classify and package. It is not
 * allowed to decide. This module is where that boundary is actually enforced
 * rather than merely documented:
 *
 *   1. Only a human role can record a decision. An agent/system identity is
 *      refused outright — the agent cannot approve its own handover.
 *   2. A brief is decided once. An already-approved or already-rejected brief
 *      cannot be quietly flipped.
 *   3. The brief and the vault must belong to the same engagement.
 *   4. Every decision appends to the vault audit log. Existing entries are
 *      never rewritten.
 *   5. The results must still satisfy the schemas.
 *
 * What this does NOT do: persist to a tamper-evident store. The audit log here
 * is append-only *by construction within a process*; a caller with filesystem
 * access can still rewrite the JSON. See docs/threat-model.md T6.
 */

export type ApprovalDecision = "approved" | "rejected";

/** Roles a decision may be recorded under — matches the vault manifest schema. */
const HUMAN_ROLES: readonly ApproverRole[] = ["client", "freelancer", "admin"];

/**
 * Words that indicate an automated identity rather than a person.
 *
 * This is a guardrail, not authentication. It stops the obvious failure — an
 * agent recording itself as the approver — but a caller who types a human name
 * is trusted. Real identity belongs upstream (see docs/threat-model.md, "out of
 * scope: identity/authentication").
 */
const NON_HUMAN_NAME_TOKENS = new Set([
  "agent",
  "agents",
  "ai",
  "assistant",
  "automated",
  "automation",
  "bot",
  "bots",
  "claude",
  "cron",
  "daemon",
  "gpt",
  "llm",
  "noreply",
  "robot",
  "script",
  "service",
  "system",
]);

/**
 * Whole-word match on the name's parts, so `agent_intake`, `handover-bot` and
 * `System` are all caught while ordinary names ("Roberto", "Bota") are not.
 */
function looksAutomated(name: string): boolean {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .some((token) => NON_HUMAN_NAME_TOKENS.has(token));
}

type FreelancerAccess = NonNullable<
  VaultManifest["access_control"]
>["freelancer_access"];

/**
 * What the freelancer gets when a handover is approved.
 *
 * A packaged vault sits at "none". Approval opens it to read-only unless the
 * vault already carries a deliberately different grant, which is preserved.
 */
function openAccess(current: FreelancerAccess): FreelancerAccess {
  return current === undefined || current === "none" ? "read_only" : current;
}

export type ApprovalErrorCode =
  | "non_human_approver"
  | "missing_approver"
  | "already_decided"
  | "engagement_mismatch"
  | "invalid_decision"
  | "schema_violation";

export class ApprovalError extends Error {
  readonly code: ApprovalErrorCode;

  constructor(code: ApprovalErrorCode, message: string) {
    super(message);
    this.name = "ApprovalError";
    this.code = code;
  }
}

export interface DecisionRequest {
  decision: ApprovalDecision;
  approver_role: ApproverRole;
  approver_name: string;
  notes?: string;
}

export interface DecisionResult {
  brief: Brief;
  vault: VaultManifest;
  audit_entry: AuditEntry;
}

export class ApprovalGate {
  private validator: SchemaValidator;
  private briefSchemaPath: string;
  private vaultSchemaPath: string;

  constructor(
    briefSchemaPath = "./schemas/brief.schema.json",
    vaultSchemaPath = "./schemas/vault-manifest.schema.json",
    validator: SchemaValidator = new SchemaValidator()
  ) {
    this.briefSchemaPath = briefSchemaPath;
    this.vaultSchemaPath = vaultSchemaPath;
    this.validator = validator;
  }

  /**
   * Reject anything that is not a named human in an approving role.
   *
   * Exported behaviour, not a private detail: callers (the server, a CLI) rely
   * on this throwing rather than on their own checks.
   */
  assertHumanApprover(role: unknown, name: unknown): asserts name is string {
    if (typeof role !== "string" || !HUMAN_ROLES.includes(role as ApproverRole)) {
      throw new ApprovalError(
        "non_human_approver",
        `Approver role must be one of ${HUMAN_ROLES.join(", ")}. ` +
          `Got: ${JSON.stringify(role)}. An agent cannot approve a handover.`
      );
    }

    if (typeof name !== "string" || name.trim().length === 0) {
      throw new ApprovalError(
        "missing_approver",
        "An approval must record the name of the person who gave it."
      );
    }

    if (looksAutomated(name.trim())) {
      throw new ApprovalError(
        "non_human_approver",
        `"${name.trim()}" looks like an automated identity. ` +
          "A handover must be approved by a person."
      );
    }
  }

  /**
   * Record a human decision on a brief.
   *
   * Returns new objects; the inputs are not mutated, so a caller that rejects
   * the result (schema violation) is left with its original state intact.
   */
  decide(
    brief: Brief,
    vault: VaultManifest,
    request: DecisionRequest
  ): DecisionResult {
    if (request.decision !== "approved" && request.decision !== "rejected") {
      throw new ApprovalError(
        "invalid_decision",
        `Decision must be "approved" or "rejected". Got: ${JSON.stringify(
          request.decision
        )}`
      );
    }

    this.assertHumanApprover(request.approver_role, request.approver_name);

    if (brief.approval_status !== "pending_approval") {
      throw new ApprovalError(
        "already_decided",
        `Brief ${brief.brief_id} is already "${brief.approval_status}". ` +
          "A decision cannot be changed; raise a new engagement instead."
      );
    }

    if (
      brief.brief_id !== vault.brief_id ||
      brief.engagement_id !== vault.engagement_id
    ) {
      throw new ApprovalError(
        "engagement_mismatch",
        `Brief ${brief.brief_id}/${brief.engagement_id} does not match vault ` +
          `${vault.brief_id}/${vault.engagement_id}.`
      );
    }

    const approverName = request.approver_name.trim();
    const decidedAt = new Date().toISOString();
    const approved = request.decision === "approved";

    const auditEntry: AuditEntry = {
      timestamp: decidedAt,
      actor: `${request.approver_role}:${approverName}`,
      action: approved ? "approved" : "rejected",
      item_ids: vault.items.map((item) => item.item_id),
      details: approved
        ? `Handover approved by ${approverName} (${request.approver_role}). ` +
          `${vault.items.length} item(s) released to the freelancer.` +
          (request.notes ? ` Note: ${request.notes}` : "")
        : `Handover rejected by ${approverName} (${request.approver_role}). ` +
          "No items released; freelancer access set to none." +
          (request.notes ? ` Note: ${request.notes}` : ""),
    };

    const decidedBrief: Brief = {
      ...brief,
      approval_status: approved ? "approved" : "rejected",
      approved_at: decidedAt,
    };

    const decidedVault: VaultManifest = {
      ...vault,
      // Append-only: prior entries are carried over untouched.
      audit_log: [...vault.audit_log, auditEntry],
      access_control: {
        ...vault.access_control,
        // A vault is packaged with freelancer_access "none". Approval is what
        // opens it; rejection leaves it shut rather than merely labelled.
        freelancer_access: approved
          ? openAccess(vault.access_control?.freelancer_access)
          : "none",
      },
      approvals: approved
        ? [
            ...(vault.approvals ?? []),
            {
              approver: request.approver_role,
              approved_at: decidedAt,
              approval_type: "handover_use" as const,
              notes:
                request.notes ?? `Approved by ${approverName} at the gate.`,
            },
          ]
        : vault.approvals,
    };

    this.assertValid(decidedBrief, decidedVault);

    return { brief: decidedBrief, vault: decidedVault, audit_entry: auditEntry };
  }

  /**
   * A decision that produces a schema-invalid brief or vault is not recorded.
   */
  private assertValid(brief: Brief, vault: VaultManifest): void {
    const briefResult = this.validator.validate(this.briefSchemaPath, brief);
    if (!briefResult.valid) {
      throw new ApprovalError(
        "schema_violation",
        `Decision would produce an invalid brief: ${JSON.stringify(
          briefResult.errors
        )}`
      );
    }

    const vaultResult = this.validator.validate(this.vaultSchemaPath, vault);
    if (!vaultResult.valid) {
      throw new ApprovalError(
        "schema_violation",
        `Decision would produce an invalid vault manifest: ${JSON.stringify(
          vaultResult.errors
        )}`
      );
    }
  }
}

export default ApprovalGate;
