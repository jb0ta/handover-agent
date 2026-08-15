# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.0] — 2026-08-15

The approval gate stops being a diagram. It is now a module, an HTTP surface, and a review UI — and the invariant it protects is enforced at every one of those layers.

### Added
- **`src/approval/ApprovalGate.ts`** — the human sign-off, enforced. Refuses an automated identity as approver, refuses a second decision on an already-decided brief, refuses a brief/vault pair from different engagements, appends to the audit log without touching prior entries, and re-validates both documents against their schemas before returning.
- **`src/server/server.ts`** — a dependency-free HTTP server (`npm run gate`) exposing `GET /api/engagement`, `POST /api/decision`, `POST /api/reset`, and the review UI. Binds to loopback; decisions are written to `engagements/<engagement_id>/`.
- **`src/ui/index.html`** — the review screen: the brief beside the materials that would leave the client's control, each item carrying its classification, provenance and access restrictions; the audit log; and the decision form. Works against the server, and falls back to a static preview when there is none.
- **`src/vault/VaultManifest.ts`** — vault packaging extracted from the demo runner and made reusable.
- **`src/validation/SchemaValidator.ts`** — one compiled-schema cache shared by intake and the gate.
- **`src/types.ts`** — shared TypeScript mirrors of the schemas. `NewBrief` pins `approval_status` to the literal `"pending_approval"`, so auto-approval now fails to compile as well as failing its test.
- **`tests/approval-gate.test.ts`** and **`tests/server.test.ts`** — 33 new tests covering the gate's invariants in isolation and over the wire.
- **File-driven engagements.** `--skill` and `--response` on both `npm run dev` and `npm run gate`, reading `.json`, `.yaml` or `.yml`. The client response used to be a `const` in TypeScript, so onboarding a real client meant editing the repo; it is now a file you copy from `examples/example-client-response.yaml` and fill in. `src/engagement/createEngagement.ts` is the single path both the worked example and a real engagement take — there is no separate demo mode.
- **YAML skill parsing.** `loadSkill()` used to throw `YAML support not yet implemented` for `.yaml`, despite the `yaml` dependency being installed and the README documenting skills in YAML. It now parses both formats through `src/io/loadDocument.ts`. Parsing `skills/example-skill.yaml` for the first time immediately revealed it had drifted from its JSON twin and carried a `notes` field the strict skill schema rejected; `notes` is now part of the schema and a test asserts the two example files are identical.
- **Per-material classification from the response.** `classification`, `access_restrictions` and handling `notes` are declared alongside each material and travel into the vault manifest, not the brief. Previously classification was hardcoded in a demo-only lookup table, so every real engagement's items would have defaulted to `internal`.
- **Continuous integration** (`.github/workflows/ci.yml`) — lint, schema validation, tests and build on Node 18 and 22, for every push and pull request. The README's claim that the safety invariants "fail the build" now has a build to fail.

### Fixed
- **Intake instances were single-use (P1).** AJV registers a schema by its `$id` on compile and throws if the same `$id` is compiled twice; `loadSkill()` and `validateBrief()` recompiled on every call, so the *second* call on any instance threw `schema with key or id ... already exists`. Every test constructing a fresh `Intake` had hidden it. Validators are now compiled once and cached — which is what makes a long-lived server possible at all.
- **Missing-info detection ignored the need it was checking (P2).** The `what_i_need` loop tested `source_materials` on every iteration regardless of the need in hand, so one uploaded file satisfied *all* declared needs — including "read-only access to the relevant platform", which is not a file. Needs asking for system access are now checked against `access_provided`, and unmet needs are reported per need.
- **The PII warning was dead code (P3).** The check was `skill.exclusions.includes("no_pii_unless_required")` — an exact string match against an array of prose sentences. The real flag lives at `skill.security_requirements.no_pii_unless_required`, so the warning never fired, while `docs/threat-model.md` T2 claimed it existed. It now reads the flag, scans `exclusions` by pattern, and checks the whole brief rather than only `current_situation`.
- **Only the first schema error was ever reported.** AJV now runs with `allErrors: true`.
- **The demo pre-approved its own vault.** `main.ts` wrote an `approvals[]` entry saying the client had approved, while the brief it accompanied was `pending_approval`. Packaging no longer records approvals; a vault leaves intake with `freelancer_access: "none"` and an empty `approvals[]`, and only the gate changes that.
- **`npm run lint` never linted `src/main.ts` or `src/types.ts`.** The `src/**/*.ts` argument expands to `src/*/*.ts` in a shell without `globstar`, silently skipping every top-level file. Now `eslint src tests --ext .ts`, with tests linted too.

### Security
- **Dropped the `uuid` dependency.** Its advisory (missing buffer bounds check in v3/v5/v6 when `buf` is supplied) was unreachable here — every call site was `uuidv4()` with no arguments — but `engines` already requires Node ≥18, where `crypto.randomUUID()` is built in. One fewer dependency, and the only production advisory is gone rather than pinned.
- **Cleared the remaining advisories.** `js-yaml` resolved within range; `@typescript-eslint` moved to v8 to pick up the patched `minimatch`. `npm audit` now reports zero vulnerabilities.

### Changed
- `npm start` / `npm run dev` now demonstrate the gate refusing agent self-approval instead of printing a hand-built manifest.
- A rejection sets `freelancer_access: "none"` rather than only labelling the brief.
- README test count corrected (it claimed 13 in one place and 18 in another; the suite is now 59).

---

## [0.1.2] — 2026-06-24

### Fixed
- **`npm start` from a clean clone (P1):** running `npm start` without a prior `npm run build` failed with `Cannot find module dist/main.js`, because `dist/` is git-ignored and no build step ran first. Added a `prestart` lifecycle hook so `npm start` always compiles first. A new user can now run `npm install && npm start` with no manual build step.

### Changed
- README Quick Start no longer requires a separate `npm run build` step.

---

## [0.1.1] — 2026-06-24

### Fixed
- **Audit integrity (D1):** the vault manifest's audit log referenced placeholder item IDs instead of the real generated IDs. Audit entries now reference the actual items. Regression test added.
- **Safety contract (D2):** `approval_status` is now `required` in the brief schema, so the safety-critical approval field can no longer be omitted from a valid brief. Regression test added.
- **Validator coverage (D3):** `validate:schemas` now also checks `example-return-handover.json`.

### Added
- `tests/verification.test.ts` — 5 regression/critical tests (suite is now 18 passing).
- ESLint configuration (`.eslintrc.json`); `npm run lint` now runs clean with no `any` in `src/`.

### Changed
- Type-safety: replaced loose `ClientResponse` index signature and removed all explicit `any` from `src/`.
- Documentation: corrected audit-log claims to match the threat model (append-only by design, not yet runtime-enforced); removed stale "(Planned)" labels for `tests/`/`docs/`; clarified that skills are parsed as JSON today (YAML is roadmap); replaced the non-working CLI example.

---

## [0.1.0] — 2026-06-24

### Initial Release

**What's working:**
- Skill schema (v0.1.0) — freelancer skill definitions with validation
- Brief schema (v0.1.0) — client brief structure and validation
- Vault manifest schema (v0.1.0) — scoped handover with provenance and audit log
- Return-handover schema (v0.1.0) — freelancer deliverables and results
- Intake logic (TypeScript) — loads skill, asks adaptive questions, generates validated brief
- Example skill (`workflow-automation-review`) — demonstrates skill-as-code
- Example outputs — sample brief and vault manifest
- Demo runner — end-to-end concept demonstration
- Package setup — Node 18+, TypeScript strict mode, AJV validation

**Philosophy:**
- Schema-first design: contracts before code
- Strict validation: all I/O against JSON Schema
- Provenance-aware: every item is auditable
- Human approval gates: agents collect and package; humans decide
- Least privilege: access is scoped and time-limited

**What's planned (Phase 2):**
- YAML skill parser
- CLI interface
- Approval gate UI
- Threat model documentation
- Test suite

**What's not implemented yet (Phase 3+):**
- Actual vault filesystem and access control
- Freelancer workspace management
- Return-handover collection
- Audit log persistence
- API / web interface
- Integration with freelancing platforms
- Billing model enforcement

### Schemas

#### Skill Schema (skill.schema.json)
- Defines how freelancers describe their work, needs, and questions
- Validates structure, required fields, and value types
- Enables skill-driven adaptive intake

#### Brief Schema (brief.schema.json)
- Structures client needs, materials, access, and constraints
- Shaped by the freelancer's skill questions
- Includes provenance for each source material
- Tracks approval status

#### Vault Manifest Schema (vault-manifest.schema.json)
- Maps everything collected in a scoped handover
- Per-item provenance: source, timestamp, collection method
- Classification levels: public, internal, confidential, credentials
- Granular access control (freelancer-only, client-only, audit-log-only)
- Append-only audit trail
- Automatic expiry and revocation conditions
- Supports nested approvals (client, freelancer, admin)

#### Return Handover Schema (return-handover.schema.json)
- Captures deliverables, assumptions, changes made
- Tests performed and results
- Unresolved issues and recommendations
- Productive time logged (for billing)
- Quality checklist

### Code

#### Intake.ts
- **loadSkill()** — loads and validates a skill file (JSON/YAML)
- **generateIntakeQuestions()** — compiles questions from skill
- **validateResponse()** — checks client response for completeness
- **generateBrief()** — structures response into validated brief JSON
- **validateBrief()** — validates brief against brief schema
- **runIntake()** — full flow: skill → questions → brief

#### main.ts
- Demonstrates end-to-end flow with example client response
- Shows intake running, validation, and output
- Includes vault manifest concept and next-steps guidance
- Saves example outputs for reference

### Examples

- `example-skill.yaml` — workflow-automation-review skill
- `example-brief.json` — generated brief from demo run
- `example-vault-manifest.json` — generated vault from demo run

### Known Limitations

- YAML parsing not implemented (assumes JSON skills for now)
- Vault filesystem/access control: structure defined, enforcement not built
- Approval UI: schema supports it, no interface implemented
- No freelancer workspace or return-handover collection yet
- No audit log persistence
- No API or CLI yet (demo is direct TypeScript execution)

### Design Decisions

1. **JSON Schemas as contract:** All data structures validated against schemas before use. Schemas are the single source of truth.
2. **TypeScript strict mode:** All code type-checked and validated. No implicit any.
3. **Per-engagement vault scope:** Default scope is per-engagement. Expires automatically in 14 days.
4. **Human approval gates:** Nothing external happens without explicit human approval (schema enforces this).
5. **Append-only audit logs (by design):** the audit-log structure is append-only by contract; runtime persistence and tamper-evidence are not yet built (see threat model T6).
6. **Least-privilege access:** Vault items have granular restrictions (freelancer-only, client-only, etc.). Expiry is default.
7. **Provenance on every item:** Where it came from, when, how, who touched it. Everything traceable.

---

## Future

### v0.2.0 (Phase 2)
- YAML skill parser
- CLI: load skill, run intake, output brief
- Web form for approval gate
- Threat model document
- Test suite (jest)

### v0.3.0+ (Phase 3+)
- Vault filesystem implementation
- Return-handover collection
- Freelancer workspace
- Audit log persistence (append-only, signed)
- API/REST interface
- Integration with freelancing platforms
- Usage metrics and observability

---

## Versioning

This project uses semantic versioning:
- **Major (0.x.x):** Pre-release (API may change)
- **Minor (x.1.x):** New features (backward compatible)
- **Patch (x.x.1):** Bug fixes and improvements

---

## How to Contribute

1. Read the schemas first — they define the model.
2. Write tests for any new feature.
3. Keep code simple and schema-first.
4. Update CHANGELOG and schemas simultaneously.
5. Tag releases: `git tag v0.x.x`.

---

## License

CC-BY-4.0. Free to use, remix, and redistribute.
