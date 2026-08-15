import { randomUUID } from "crypto";
import {
  AccessRestriction,
  AuditEntry,
  Brief,
  Classification,
  VaultItem,
  VaultManifest,
} from "../types";

/**
 * Builds the vault manifest that accompanies a brief.
 *
 * Two properties matter here and are covered by tests:
 *
 *   - The vault starts with `freelancer_access: "none"` and an empty
 *     `approvals[]`. Packaging is not permission. The freelancer gets read
 *     access only when a human passes it through the approval gate.
 *   - Audit entries reference the item IDs that are actually in `items[]`,
 *     so the log can never point at materials that do not exist.
 */

export const DEFAULT_RETENTION_DAYS = 14;

export interface VaultItemInput {
  name: string;
  type: string;
  path: string;
  provenance: string;
  collected_at?: string;
  collection_method?: string;
  classification?: Classification;
  access_restrictions?: AccessRestriction[];
  notes?: string;
}

export interface BuildVaultOptions {
  /** Days until the vault auto-locks. Defaults to 14. */
  retentionDays?: number;
  /** Explicit items. Defaults to the brief's source materials. */
  items?: VaultItemInput[];
  /** Overrides the clock, for deterministic tests. */
  now?: Date;
}

function toVaultItem(input: VaultItemInput, collectedAt: string): VaultItem {
  return {
    item_id: `item-${randomUUID()}`,
    name: input.name,
    type: input.type,
    path: input.path,
    provenance: input.provenance,
    collected_at: input.collected_at ?? collectedAt,
    collection_method: input.collection_method ?? "user_upload",
    classification: input.classification ?? "internal",
    access_restrictions: input.access_restrictions ?? ["freelancer_only"],
    ...(input.notes ? { notes: input.notes } : {}),
  };
}

export function buildVaultManifest(
  brief: Brief,
  options: BuildVaultOptions = {}
): VaultManifest {
  const now = options.now ?? new Date();
  const timestamp = now.toISOString();
  const retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const expiresAt = new Date(
    now.getTime() + retentionDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const inputs: VaultItemInput[] =
    options.items ??
    brief.source_materials.map((material) => ({
      name: material.name,
      type: material.type,
      path: material.location,
      provenance: material.provenance,
      collected_at: material.collected_at,
    }));

  const items = inputs.map((input) => toVaultItem(input, timestamp));

  const auditLog: AuditEntry[] = [
    {
      timestamp,
      actor: "system",
      action: "vault_created",
      details: `Vault created for engagement ${brief.engagement_id}`,
      item_ids: [],
    },
    {
      timestamp,
      actor: "agent_intake",
      action: "items_collected",
      details: `${items.length} item(s) from the client response added to the vault`,
      item_ids: items.map((item) => item.item_id),
    },
  ];

  return {
    engagement_id: brief.engagement_id,
    brief_id: brief.brief_id,
    vault_path: `/engagements/${brief.engagement_id}/vault`,
    scope: "per-engagement",
    created_at: timestamp,
    expires_at: expiresAt,
    client_approval_required_before_use: true,
    items,
    access_control: {
      // Nothing is released until the approval gate says so.
      freelancer_access: "none",
      client_access: "revoke_anytime",
      audit_access: "log_only",
    },
    audit_log: auditLog,
    revocation_conditions: {
      automatic_expiry_utc: expiresAt,
      manual_revocation_by_client: true,
      on_expiry_action: "lock_read_only",
      retention_after_expiry: "90d",
    },
    // Deliberately empty. An approval is something a human adds at the gate,
    // not something the packaging step writes on their behalf.
    approvals: [],
  };
}

export default buildVaultManifest;
