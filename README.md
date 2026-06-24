# Handover Agent: Skill-Driven Micro-Engagement Workflow

**v0.1.1** · Implementation of agentic freelancing micro-engagements.

This is a **working vertical slice**, not production. See [What's Here](#whats-here) and [What's Coming](#whats-coming).

---

## What This Is

A **client-side handover agent** that:

1. **Loads a freelancer skill** (JSON today; YAML planned) — "How I work, what I need, my questions"
2. **Runs adaptive intake** — asks skill-driven questions, detects missing info
3. **Builds a scoped brief** — collects into a structured, schema-validated brief
4. **Creates a vault manifest** — materials with provenance, permissions, expiry, audit log
5. **Requires human approval** — nothing leaves without explicit approval
6. **Outputs a handover** — brief + scoped vault, ready for the freelancer

**Goal:** collapse onboarding cost so engagements can shrink to "a couple of hours" and still add real value.

---

## Core Model

```
Freelancer Skill (JSON)
    ↓
Client Need + Materials
    ↓
[Skill-Driven Intake Agent]
    ↓
Structured Brief + Scoped Vault
    ↓
[HUMAN APPROVAL GATE]
    ↓
Handover to Freelancer
    ↓
Freelancer Does Focused Work (2h)
    ↓
Return Handover: Deliverables + Changes + Tests
    ↓
Billing: Productive Time Only
```

---

## What's Here

### ✅ Working (MVP)

- **Skill schema** (`schemas/skill.schema.json`) — validates freelancer skill definitions
- **Brief schema** (`schemas/brief.schema.json`) — validates structured client briefs
- **Vault manifest schema** (`schemas/vault-manifest.schema.json`) — validates scoped handover + provenance + audit log
- **Return-handover schema** (`schemas/return-handover.schema.json`) — validates what freelancer returns
- **Intake logic** (`src/intake/Intake.ts`) — loads skill, asks questions, builds brief, validates against schemas
- **Example skill** (`skills/example-skill.yaml`) — demonstrates skill-as-code (workflow-automation-review)
- **Example outputs** (`examples/`) — sample brief + vault manifest from the demo
- **Demo runner** (`src/main.ts`) — end-to-end flow showing concept
- **Test suite** (`tests/intake.test.ts`) — 13 tests, including a build-failing safety invariant (a new brief can never be auto-approved)
- **Schema validator** (`scripts/validate-schemas.js`) — validates schemas + examples; run with `npm run validate:schemas`
- **Docs** (`docs/architecture.md`, `docs/threat-model.md`) — trust boundaries and the security model
- **Package setup** — Node 18+, TypeScript, AJV schema validation, ready to build/test/deploy

### ⚠️ Concept Only (Not Implemented)

- Actual YAML parsing (skills are JSON for now; `example-skill.yaml` is provided for readability)
- Vault filesystem/access control (manifest structure defined + validated; runtime enforcement not built)
- Approval gate UI (the invariant is enforced in code; no interface yet)
- Freelancer workspace + live return-handover collection (schema + example exist; no runtime)
- Expiry/revocation enforcement (modelled in schema; not enforced at runtime)
- Audit log persistence (structure enforced; no append-only store yet)
- API/web interface

### 🏗️ Architecture

```
├── schemas/                          # JSON schemas (source of truth)
│   ├── skill.schema.json            # Freelancer skill definition
│   ├── brief.schema.json            # Client brief
│   ├── vault-manifest.schema.json   # Scoped handover + provenance
│   └── return-handover.schema.json  # Freelancer deliverables
├── skills/                           # Example skills
│   └── example-skill.yaml           # Workflow review skill
├── examples/                         # Example outputs
│   ├── example-brief.json           # Sample generated brief
│   ├── example-vault-manifest.json  # Sample vault
│   └── example-return-handover.json # Sample return handover
├── src/
│   ├── intake/
│   │   └── Intake.ts                # Core intake logic
│   ├── brief/                       # (Planned: brief generation/validation)
│   ├── vault/                       # (Planned: vault creation/access control)
│   ├── approval/                    # (Planned: approval gate)
│   └── main.ts                      # Demo runner
├── tests/                            # Test suite (intake + verification)
├── docs/                             # architecture.md, threat-model.md
├── package.json
├── tsconfig.json
└── README.md
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Install & Run

```bash
# Clone or download
git clone <repo> handover-agent
cd handover-agent

# Install
npm install

# Build TypeScript
npm run build

# Run the demo
npm start
```

**Output:** generates `examples/example-brief.json` and `examples/example-vault-manifest.json`.

---

## Usage: Define a Skill

Create a skill file (`skills/my-skill.yaml`):

```yaml
skill: code-review
version: 0.1.0
provider: your-name
description: "Thorough code review of a pull request or module."

how_i_work:
  - "I read the code carefully, understand its context, and return clear, actionable feedback."
  - "I work in 1–2 hour focused blocks; billing is for productive time only."

what_i_need:
  - "Code (file, repo link, or text)"
  - "One sentence: what the code should do"
  - "Read-only repo access (if needed to understand context)"

questions_i_ask:
  - "What is the goal of this code?"
  - "What should I focus on: performance, security, clarity, or all three?"
  - "Are there specific patterns or standards you want me to check against?"

accepted_file_types: [".js", ".ts", ".py", ".md"]

exclusions:
  - "No production credentials. Read-only access only."
  - "Do not send proprietary algorithms or trade secrets unless strictly required."

deliverables:
  - "Annotated code review (Markdown)"
  - "List of issues: critical, important, nice-to-have"
  - "Explanation of each issue"

security_requirements:
  vault_scope: per-engagement
  data_retention: "14d_then_revoke"
  approval_required_before_external_action: true
  no_production_credentials: true

completion_conditions:
  - "Review delivered"
  - "Client approved the return handover"
```

> Note: the loader parses **JSON** today; provide the equivalent as a `.json` file. YAML parsing is on the roadmap.

Today the demo runs a built-in example via `npm start`. A CLI to pass an arbitrary skill + response file is on the roadmap (see [What's Coming](#whats-coming)).

---

## Validation & Quality

All schemas are **strict** (no additional properties) and validated with **AJV**:

```bash
npm run validate:schemas
```

Schemas enforce:
- Required fields
- Type strictness
- Enums for fixed choices
- Patterns for IDs, formats, URLs
- Min/max lengths
- Append-only audit-log structure *by design*; runtime persistence and tamper-evidence are not yet built (see docs/threat-model.md, T6)

---

## Security & Provenance Design

Every collected item has:
- **Provenance:** where it came from, when, by whom (agent or human)
- **Classification:** public, internal, confidential, credentials
- **Access restrictions:** per-item granularity (freelancer-only, client-only, etc.)
- **Expiry:** automatic revocation at engagement end (default 14 days)
- **Audit trail:** append-only log *by design* of access, changes, approvals (runtime persistence/tamper-evidence not yet built)

**Threat model** (see [docs/threat-model.md](docs/threat-model.md)):
- Untrusted client input (prompt injection in uploaded files) — mitigated by input trust boundary
- Over-collection of sensitive data — mitigated by "collect only what the skill names" rule
- Vault data outliving engagement — mitigated by auto-expiry + revocation
- Agent taking external action without approval — mitigated by hard approval gate
- Secrets leakage — mitigated by least-privilege scoping + file-based secrets (no plaintext in JSON)

See [docs/threat-model.md](docs/threat-model.md) for the full model.

---

## What's Coming (Roadmap)

### Phase 2 (1–2 weeks)
- [ ] YAML skill parser (not just JSON)
- [ ] CLI interface (load skill, run intake, output brief)
- [ ] Approval gate UI (simple web form or Telegram bot)
- [ ] Threat model & documented hardening
- [ ] Test suite (intake validation, schema validation, edge cases)

### Phase 3 (2–4 weeks)
- [ ] Vault implementation (scoped filesystem + access control + expiry)
- [ ] Return-handover collection & validation
- [ ] Freelancer workspace concept (clean briefing folder)
- [ ] Audit log persistence (append-only, tamper-evident)
- [ ] Approval workflow (human sign-off before vault unlock)

### Phase 4 (production)
- [ ] API / web interface
- [ ] Integration with real freelancing platforms (Upwork, Toptal, etc.)
- [ ] Billing model enforcement (productive-time-only tracking)
- [ ] Metrics & observability (intake quality, handover latency, freelancer feedback)

---

## Philosophy

This implementation follows Dinis Cruz's stated values:

1. **Artifacts over slides.** Everything here is code, schemas, or working examples. No marketing copy.
2. **Type-safe & validated.** All inputs and outputs are schema-validated; no surprises.
3. **Provenance & transparency.** Every decision, every material, every action is audited and traceable.
4. **Human approval gates.** Agents collect and package; humans decide and approve.
5. **Least privilege.** Access is scoped, time-limited, and granular.
6. **Document as you build.** Schemas come first; code follows; tests verify.

---

## Development

### Build

```bash
npm run build
```

Compiles `src/**/*.ts` → `dist/**/*.js`. Respects `tsconfig.json` (strict mode, source maps).

### Run Demo

```bash
npm run dev       # TypeScript directly (ts-node)
npm start         # Compiled JavaScript
```

### Testing

```bash
npm test          # Run jest
npm run test:watch
```

### Linting & Formatting

```bash
npm run lint      # ESLint
npm run format    # Prettier
```

---

## Contributing

This is a proof-of-concept pilot. If you find gaps or want to extend it:

1. Read the schemas first — they define the model.
2. Add tests for any new feature.
3. Keep the code simple and schema-first.
4. Document assumptions (see comments in code).

---

## License

CC-BY-4.0. Use, share, remix freely. Credit appreciated.

---

## References

- **Dinis Cruz's micro-engagement brief:** v0.33.33, published June 23, 2026
- **Skills-as-code brief:** v0.33.40 (referenced in main brief)
- **Wardley Maps / EVTP:** Simon Wardley's Explorers/Villagers/Town-Planners model (organizational archetypes)
- **Provenance & graph thinking:** Dinis's research hub articles on semantic graphs and trust

---

## Status

**v0.1.1 — MVP / Proof of Concept**

- ✅ Model defined (schemas)
- ✅ Core intake logic working
- ✅ Example skill + outputs + return handover
- ✅ Test suite (18 passing, incl. safety invariant)
- ✅ Architecture + threat-model docs
- ⚠️ Not production-hardened
- ❌ No approval UI yet (invariant enforced in code, but no interface)
- ❌ No vault runtime enforcement yet

**Expected next step:** a human reviews the generated brief, approves the vault, and sees the loop close with actual freelancer work.

---

## Questions?

- Read the schemas (`schemas/`) — they're the source of truth.
- Run the demo (`npm start`) — it shows the concept in action.
- Check `examples/` — sample brief and vault manifest.
- See `skills/example-skill.yaml` — a concrete skill definition.

---

**Built for:** testing whether agentic workflows really do collapse onboarding cost.

**Built by:** José Bota, Loulé, Portugal, June 2026.

**For:** Anyone building the next generation of freelancing.
