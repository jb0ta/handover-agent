# Architecture

`handover-agent` v0.1.0

This document explains how the pieces fit together and where the trust boundaries sit.

---

## The core idea

Freelancing was forced into long contracts because **onboarding is expensive** —
briefing, gathering materials, granting access, getting context. If a *client-side
agent* does that onboarding, an engagement can shrink to a couple of focused hours
and still add value.

This repo implements the onboarding half: **skill → intake → brief → scoped vault →
human approval → handover**. The freelancer's actual work, and the return handover,
are modelled (schema) but not yet executed (no workspace runtime).

---

## End-to-end flow

```
 Freelancer SKILL (json/yaml)                Client
        |                                       |
        v                                       v
 [1] Skill loaded & validated ----> [2] Client states a need + materials
        |                                       |
        +-------------------+-------------------+
                            v
              [3] Intake (skill-driven)
                  - generates questions from the skill
                  - detects missing required info
                  - flags over-collection of sensitive data
                            |
                            v
              [4] Structured BRIEF (schema-validated)
                  +  VAULT MANIFEST
                     - per-item provenance
                     - classification + access restrictions
                     - expiry / revocation
                     - append-only audit log
                            |
                    [HUMAN APPROVAL GATE]   <-- brief starts 'pending_approval'
                            |                    nothing proceeds without sign-off
                            v
              [5] Freelancer workspace (brief + scoped vault)   [modelled, not built]
                            |
                            v
              [6] RETURN HANDOVER (schema)                      [modelled, not built]
                  deliverables, assumptions, changes, tests,
                  open issues, next action, productive minutes
```

---

## Components

| Component | File | Status |
|---|---|---|
| Skill schema | `schemas/skill.schema.json` | ✅ |
| Brief schema | `schemas/brief.schema.json` | ✅ |
| Vault manifest schema | `schemas/vault-manifest.schema.json` | ✅ |
| Return-handover schema | `schemas/return-handover.schema.json` | ✅ |
| Intake logic | `src/intake/Intake.ts` | ✅ |
| Demo runner | `src/main.ts` | ✅ |
| Test suite | `tests/intake.test.ts` | ✅ |
| Schema validator | `scripts/validate-schemas.js` | ✅ |
| Vault enforcement | `src/vault/` | ⬜ planned |
| Approval gate (UI) | `src/approval/` | ⬜ planned |
| Audit log persistence | `src/audit/` | ⬜ planned |

---

## Trust boundaries

The single most important boundary is the **human approval gate**.

- The agent may **collect, structure, classify, and package**.
- The agent may **not** push anything across the client boundary on its own.
- A freshly generated brief is always `approval_status: "pending_approval"`. There
  is a test (`SAFETY INVARIANT: every new brief starts pending_approval`) that fails
  the build if this is ever changed to auto-approve.

A second boundary is **per-item access**. Each vault item carries
`classification` and `access_restrictions`, so "freelancer can read the workflow
export" does not imply "freelancer can read the credentials."

A third boundary is **time**. Vaults carry `expires_at` and `revocation_conditions`;
access is meant to end when the engagement ends.

---

## Data, not commands

Client-supplied materials (uploaded files, pasted text, log exports) are **data**.
The intake agent must never treat instructions found *inside* those materials as
commands. See `docs/threat-model.md` for the prompt-injection boundary.

---

## Why JSON Schema first

The schemas are the contract. Code is written against them; tests validate against
them; the demo output is validated against them on every run. If the model changes,
the schema changes first, and everything downstream is forced to follow. This is
deliberately the opposite of "let the LLM emit whatever shape it likes."
