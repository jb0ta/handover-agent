# Handover Agent: Skill-Driven Micro-Engagement Workflow

**v0.2.0** · Implementation of agentic freelancing micro-engagements.

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
- **File-driven engagements** (`src/engagement/`, `src/cli/`) — point `--skill` and `--response` at real YAML or JSON files and run a real engagement without touching source
- **Vault packaging** (`src/vault/VaultManifest.ts`) — turns collected materials into a scoped manifest with provenance, classification and expiry
- **Approval gate** (`src/approval/ApprovalGate.ts`) — the human sign-off, enforced: an automated identity cannot approve, a brief is decided once, and every decision appends to the audit log
- **Approval gate server + review UI** (`src/server/`, `src/ui/`) — run `npm run gate`, read the brief beside what would leave the client's control, and decide
- **Example skill** (`skills/example-skill.yaml`) — demonstrates skill-as-code (workflow-automation-review)
- **Example outputs** (`examples/`) — sample brief + vault manifest from the demo
- **Demo runner** (`src/main.ts`) — end-to-end flow showing concept
- **Test suite** (`tests/`) — 91 tests, including build-failing safety invariants (a new brief can never be auto-approved; an agent can never approve one)
- **Schema validator** (`scripts/validate-schemas.js`) — validates schemas + examples; run with `npm run validate:schemas`
- **Docs** (`docs/architecture.md`, `docs/threat-model.md`) — trust boundaries and the security model
- **CI** (`.github/workflows/ci.yml`) — lint, schemas, tests and build on Node 18 and 22, every push and PR
- **Static demo** (`.github/workflows/pages.yml`) — the review UI published to GitHub Pages, no server behind it
- **Package setup** — Node 18+, TypeScript, AJV schema validation, one runtime dependency

### ⚠️ Concept Only (Not Implemented)

- Vault filesystem/access control (the manifest records who may read what; no runtime storage layer enforces it)
- Authentication on the gate (it binds to loopback and trusts whoever reaches it — see [Security](#security--provenance-design))
- Freelancer workspace + live return-handover collection (schema + example exist; no runtime)
- Expiry/revocation enforcement (modelled in schema; not enforced at runtime)
- Audit log persistence (append-only by construction and written to disk as JSON; not a tamper-evident store)
- Multi-engagement storage (the gate holds one engagement at a time)

### 🏗️ Architecture

```
├── schemas/                          # JSON schemas (source of truth)
│   ├── skill.schema.json            # Freelancer skill definition
│   ├── brief.schema.json            # Client brief
│   ├── vault-manifest.schema.json   # Scoped handover + provenance
│   └── return-handover.schema.json  # Freelancer deliverables
├── skills/                           # Example skills
│   └── example-skill.yaml           # Workflow review skill
├── examples/                         # Example inputs and outputs
│   ├── example-client-response.yaml # Copy this to onboard a real client
│   ├── example-brief.json           # Sample generated brief
│   ├── example-vault-manifest.json  # Sample vault
│   └── example-return-handover.json # Sample return handover
├── src/
│   ├── intake/Intake.ts             # Skill-driven intake → brief
│   ├── engagement/createEngagement.ts # Skill + response → brief + vault
│   ├── io/loadDocument.ts           # JSON or YAML, one loader
│   ├── cli/options.ts               # --skill / --response argument parsing
│   ├── vault/VaultManifest.ts       # Scoped vault packaging
│   ├── approval/ApprovalGate.ts     # The human sign-off, enforced
│   ├── server/server.ts             # Approval gate HTTP server
│   ├── ui/index.html                # Review + decide screen
│   ├── ui/renderPage.ts             # One HTML skeleton, three hosts
│   ├── validation/SchemaValidator.ts# Compiled-schema cache
│   ├── demo/demoEngagement.ts       # The worked example, shared
│   ├── types.ts                     # TS mirrors of the schemas
│   └── main.ts                      # Demo runner
├── tests/                            # 91 tests across 6 suites
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

# Run the demo (builds automatically via the prestart hook)
npm start

# Open the approval gate and decide in the browser
npm run gate
```

`npm start` generates `examples/example-brief.json` and `examples/example-vault-manifest.json`.

`npm run gate` serves the review UI on <http://127.0.0.1:4173>.

---

## The Approval Gate

The gate is the point of the project: the agent collects and packages, a person decides.

```bash
npm run gate    # http://127.0.0.1:4173
```

The screen puts the brief beside the materials that would leave the client's
control — each item with its classification, provenance, and who may read it —
plus the access grants, the expiry, and the audit log so far. You enter your
name, optionally a note, and approve or reject.

What the gate enforces, at the module *and* over HTTP:

| Rule | What happens |
|---|---|
| An automated identity cannot approve | `agent_intake`, `system`, `handover-bot` and friends are refused — as a role or as a name |
| A brief is decided once | A second decision returns `409 already_decided`; approvals can't be quietly flipped |
| Brief and vault must match | A brief decided against another engagement's vault is refused |
| Decisions append, never rewrite | Prior audit entries are carried over byte-identical |
| A rejection closes the door | `freelancer_access` is set to `none` and no approval is recorded |
| Results stay schema-valid | A decision that would produce an invalid brief or vault is not recorded |

Approving writes the decided brief and vault to
`engagements/<engagement_id>/` (git-ignored).

**Scope, stated plainly:** the gate is a local review tool. There is no
authentication — whoever reaches the port can decide, which is why it binds to
loopback. Do not expose it. Identity is assumed to be handled upstream
(see [docs/threat-model.md](docs/threat-model.md)).

### The static demo

`npm run demo:build` renders the same `src/ui/index.html` into a standalone
page, deployed to GitHub Pages on every merge to `main`. It has no server: the
page falls back to a fictional sample, mirrors the gate's refusal rules
client-side so the buttons do something, and says so in a banner. The rules it
demonstrates are enforced by `src/approval/ApprovalGate.ts`, not by the browser.

**The gate itself is not deployed and must not be** — see the scope note above.

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

Skills load from `.yaml`, `.yml` or `.json` — the same skill either way.

## Usage: Run a Real Engagement

Nothing here requires editing source. Copy the response template, fill it in
with the client's own words, and run it:

```bash
cp examples/example-client-response.yaml my-client.yaml
# ...fill it in...

npm run gate -- --skill ./skills/my-skill.yaml --response ./my-client.yaml
```

Intake checks the response against the skill's `what_i_need` and tells you what
is missing *before* you decide — the gate shows those findings above the
decision form.

Per-material `classification`, `access_restrictions` and `notes` are declared
alongside each material in the response file. They travel into the vault, not
the brief: the brief describes the work, the vault records custody.

```bash
npm run dev -- --help     # all options
```

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

### Phase 2
- [x] Approval gate UI (web review screen + HTTP API)
- [x] Approval workflow (human sign-off before the vault opens)
- [x] Threat model & documented hardening
- [x] Test suite (intake validation, schema validation, gate invariants, edge cases)
- [x] YAML skill parser (not just JSON)
- [x] File-driven engagements (`--skill` / `--response`, JSON or YAML)

### Phase 3
- [ ] Authentication on the gate (it currently trusts whoever reaches the port)
- [ ] Vault implementation (scoped filesystem + access control + expiry)
- [ ] Multi-engagement storage (the gate holds one at a time)
- [ ] Return-handover collection & validation
- [ ] Freelancer workspace concept (clean briefing folder)
- [ ] Audit log persistence (append-only, tamper-evident)

### Phase 4 (production)
- [ ] API / web interface
- [ ] Integration with real freelancing platforms (Upwork, Toptal, etc.)
- [ ] Billing model enforcement (productive-time-only tracking)
- [ ] Metrics & observability (intake quality, handover latency, freelancer feedback)

---

## Philosophy

This implementation follows these values:

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
npm run gate      # Approval gate server + review UI
npm run demo:build # Render the static demo into dist-demo/
```

### Testing

```bash
npm test          # Run jest
npm run test:watch
```

CI runs `lint`, `validate:schemas`, `test` and `build` on Node 18 and 22 for every
push and pull request. The safety invariants are ordinary tests, so weakening one
fails the build.

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

## Status

**v0.2.0 — MVP / Proof of Concept**

- ✅ Model defined (schemas)
- ✅ Core intake logic working
- ✅ Example skill + outputs + return handover
- ✅ Approval gate enforced in code, over HTTP, and in a review UI
- ✅ Test suite (91 passing, incl. safety invariants)
- ✅ Architecture + threat-model docs
- ⚠️ Not production-hardened
- ❌ No authentication on the gate (loopback only)
- ❌ No vault runtime enforcement yet
- ❌ No return-handover runtime yet
- ✅ Runs real engagements from files, no source edits

**Expected next step:** the freelancer half of the loop — a workspace that opens
on approval, and a return handover collected against its schema.

---

## Questions?

- Read the schemas (`schemas/`) — they're the source of truth.
- Run the demo (`npm start`) — it shows the concept in action.
- Run the gate (`npm run gate`) — it shows the decision that matters.
- Check `examples/` — sample brief and vault manifest.
- See `skills/example-skill.yaml` — a concrete skill definition.

---

**Built for:** testing whether agentic workflows really do collapse onboarding cost.

**Built by:** José Bota, Loulé, Portugal, June 2026.

**For:** Anyone building the next generation of freelancing.
