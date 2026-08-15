/**
 * Shared types for the handover model.
 *
 * The JSON schemas in `schemas/` remain the source of truth — these interfaces
 * mirror them so TypeScript callers get the same shape at compile time. When a
 * schema changes, change it here too; the tests validate real objects against
 * the schemas, so drift is caught.
 */

export type ApprovalStatus = "pending_approval" | "approved" | "rejected";

export interface SourceMaterial {
  name: string;
  type: string;
  location: string;
  provenance: string;
  collected_at?: string;
}

export interface AccessGrant {
  system: string;
  scope: string;
  expires_at?: string;
  security_note?: string;
}

export interface Brief {
  brief_id: string;
  engagement_id: string;
  skill: string;
  created_at: string;
  client_name?: string;
  client_objective: string;
  current_situation: string;
  desired_result: string;
  scope: string;
  out_of_scope: string[];
  constraints: string[];
  source_materials: SourceMaterial[];
  access_provided: AccessGrant[];
  risks: string[];
  open_questions: string[];
  success_criteria: string[];
  estimated_productive_time_minutes: number;
  approval_status: ApprovalStatus;
  approved_at?: string;
  notes?: string;
}

/**
 * A brief as it comes out of intake.
 *
 * The literal type is the compile-time half of the safety invariant: the intake
 * agent cannot produce anything but `pending_approval`. Moving a brief off that
 * value is the approval gate's job, and only a human can ask for it.
 */
export type NewBrief = Omit<Brief, "approval_status"> & {
  approval_status: "pending_approval";
};

export type Classification =
  | "public"
  | "internal"
  | "confidential"
  | "credentials_or_keys";

export type AccessRestriction =
  | "client_only"
  | "freelancer_only"
  | "both_with_approval"
  | "audit_log_only";

export interface VaultItem {
  item_id: string;
  name: string;
  type: string;
  path: string;
  size_bytes?: number;
  hash?: string;
  provenance: string;
  collected_at: string;
  collection_method: string;
  classification?: Classification;
  access_restrictions?: AccessRestriction[];
  notes?: string;
}

export interface AuditEntry {
  timestamp: string;
  actor: string;
  action: string;
  item_ids?: string[];
  details: string;
  ip_address?: string;
}

export type ApproverRole = "client" | "freelancer" | "admin";

export interface VaultApproval {
  approver: ApproverRole;
  approved_at: string;
  approval_type: "vault_creation" | "handover_use" | "return_handover";
  notes?: string;
}

export interface VaultAccessControl {
  freelancer_access?: "none" | "read_only" | "read_write" | "read_until_expiry";
  client_access?: "none" | "read_only" | "revoke_anytime";
  audit_access?: "log_only" | "full";
}

export interface VaultManifest {
  engagement_id: string;
  brief_id: string;
  vault_path: string;
  scope: "per-engagement" | "per-project" | "organizational";
  created_at: string;
  expires_at: string;
  client_approval_required_before_use?: boolean;
  freelancer_approval_required_before_use?: boolean;
  items: VaultItem[];
  access_control?: VaultAccessControl;
  audit_log: AuditEntry[];
  revocation_conditions?: {
    automatic_expiry_utc?: string;
    manual_revocation_by_client?: boolean;
    on_expiry_action?: "lock_read_only" | "delete" | "archive";
    retention_after_expiry?: string;
  };
  approvals?: VaultApproval[];
  return_handover_id?: string;
}
