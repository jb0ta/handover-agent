# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
5. **Append-only audit logs:** Audit trail cannot be modified, only appended to. Tamper-evident by design.
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
