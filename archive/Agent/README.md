# Universal Tracker Agent Kit

Copy this folder into **any product** or **any repository**. It gives your
team two AI agents that work the **same way in every IDE** — Cursor, Claude
Code, Kiro, Antigravity, Devin, GitHub Copilot, Windsurf, Codex CLI, and
others.

**No product-specific setup.** The agents discover your trackers,
architecture docs, and code automatically.

---

## What this kit does

Your product keeps requirements in **tracker documents** (markdown files
that list features, tasks, APIs, screens, and acceptance criteria). This
kit closes the loop between those documents and your **actual code**.

```
  Requirement trackers          Your codebase
  (what should exist)    ←→    (what exists today)
         │                           │
         └──────── Agent kit ────────┘
                    │
         ┌──────────┴──────────┐
         ▼                     ▼
   tracker-audit          tracker-implement
   (find issues)          (fix issues)
         │                     │
         ▼                     ▼
   new-tracker/<product>/   new-tracker/<product>/plans/
   findings NT-*            + code changes in product
```

Output is stored **outside** the product and **outside** `Agent/` — see
[`output-layout.md`](output-layout.md).

### Agent 1 — tracker-audit (find)

Compares your code against requirement trackers and logs every mismatch.

| Capability | Detail |
|------------|--------|
| Auto-discovery | Finds tracker files, architecture docs, schema, code roots, logs |
| User confirmation | Shows discovered files; waits for your OK before auditing |
| Page-by-page audit | One feature at a time — not one giant pass |
| Four checks per feature | Screen, functionality, database, flow (logs) |
| Structured findings | Each issue gets an `NT-*` ID (bug, gap, doc-mismatch, regression) |
| Resume | Stops and continues later from last completed feature |
| Safe | Never edits your code or original trackers |

### Agent 2 — tracker-implement (fix)

Takes any gap or bug — from an audit finding or directly from a tracker —
and fixes it in a controlled, repeatable way.

| Capability | Detail |
|------------|--------|
| NOW vs DOCUMENT | Always compares current code vs what the tracker says |
| Written plan | Full plan saved before any code change |
| Approval gate | Stops and waits for you to approve the plan |
| Step-by-step implement | Each plan step executed and checkpointed |
| Verification | Runs tests and checks acceptance criteria before closing |
| Resume | Continues from last phase or implementation step |
| Safe | Never edits original tracker documents |

### Agent 3 — feature-file-mapper (verify)

Maps every feature to its source files for **manual engineer walkthrough**.

| Capability | Detail |
|------------|--------|
| Bootstrap script | `scripts/generate-feature-file-map.py` discovers files per feature |
| Per-feature maps | `file-maps/<slug>.md` with categorized file inventory |
| Verification checklist | 7-step manual flow per feature |
| Master index | `file-map-index.md` — start here |
| Read-only | Never edits code or trackers |

**Invoke:** `Run feature file map` or launch `.cursor/agents/feature-file-mapper.md`

---

## What this kit does NOT do

| Will not | Why |
|----------|-----|
| Edit original `*_features_tracker.md` files | Trackers stay the source of truth (read-only) |
| Touch `deployment_tracker*` or `test_automation_tracker*` | Out of scope by design |
| Skip phases | Every compare → plan → implement step is mandatory |
| Behave differently per IDE | Same `AGENTS.md` / `AGENTS-IMPLEMENT.md` everywhere |

---

## What your product needs

Works with **any** repo that has:

| You have | Examples (any naming works) |
|----------|----------------------------|
| Feature trackers | `docs/fe_features_tracker.md`, `features/tracker.md` |
| Architecture / schema docs | `docs/architecture/`, `Database_Schema.md` |
| Application code | `src/`, `apps/`, `packages/`, `backend/` |
| Optional: test / journey docs | `docs/test_cases/` |

The agent discovers these automatically. You confirm the list on first run.

---

## Install (any product)

### Step 1 — Copy the kit

Copy the entire `Agent/` folder into your product:

```
your-product/
  agent-kit/              ← copy Agent/ here (name is optional)
    AGENTS.md
    AGENTS-IMPLEMENT.md
    README.md             ← this file
    .cursor/agents/
    ...
```

**Or** keep the kit next to the product in a mono-repo:

```
company-repo/
  Agent/                  ← kit (instructions only)
  your-product/           ← open as IDE workspace (source code)
  new-tracker/            ← created automatically — all audit output
    your-product/         ← findings, plans, review-state per product
```

### Step 2 — Open the product in your IDE

Open **`your-product/`** as the workspace root (not the kit folder,
unless the kit lives inside the product).

### Step 3 — Pick your IDE entry point

| Your IDE | How to start |
|----------|--------------|
| Cursor | Subagent: `tracker-audit` or `tracker-implement` |
| Claude Code | `/tracker-audit` or `/tracker-implement` |
| Kiro | Agent picker → `tracker-audit` / `tracker-implement` |
| Antigravity | Workflow or chat command |
| Devin | Subagent picker |
| GitHub Copilot | Chat in VS Code |
| Windsurf | Workflow or chat |
| Any other | Say the chat commands below |

Full per-IDE steps: [`IDE-SETUP.md`](IDE-SETUP.md)

---

## How to use — full workflow

### Workflow A — Audit then fix (recommended)

**1. Run an audit**

In chat, say:

```
Run tracker audit
```

The agent will:
1. Scan your project for trackers and docs
2. **Stop** and ask you to confirm the file list
3. Build a feature inventory from your trackers
4. Audit each feature with four checks
5. Write findings to `new-tracker/<your-product>/` (sibling folder, not inside product)

**2. Review findings**

Open:

```
company-repo/new-tracker/your-product/findings-index.md
```

Each row is an `NT-*` issue (gap, bug, doc-mismatch, or regression).

**3. Fix a finding**

```
implement NT-001
```

The agent will:
1. Read what the code does **now**
2. Read what the **tracker document** requires
3. Write a NOW vs DOCUMENT comparison
4. Write an implementation plan → **stop for your approval**

**4. Approve and implement**

When you see the plan:

```
approve plan NT-001
```

The agent implements step by step, runs tests, and marks the finding `fixed`.

**5. Re-audit (optional)**

```
Run tracker audit
```

Confirm the same feature passes all four checks.

---

### Workflow B — Fix directly from a tracker (no audit first)

If you already know which tracker item is wrong:

```
implement from tracker docs/features_tracker.md §User Login
```

Same 8 phases: NOW → DOCUMENT → gap → plan → approve → implement → verify → close.

---

### Workflow C — Resume after interruption

Audit interrupted:

```
resume
```

Implement interrupted:

```
resume implement
```

---

## Chat commands (same in every IDE)

### tracker-audit

| Say | What happens |
|-----|--------------|
| `Run tracker audit` | Discover files → confirm → audit all features |
| `resume` | Continue audit from last feature |
| `re-discover` | Re-scan requirement files; confirm again |
| `start fresh` | Reset audit progress; re-discover |

### tracker-implement

| Say | What happens |
|-----|--------------|
| `implement NT-001` | Analyze → plan → **wait for approval** |
| `fix NT-001` | Same as `implement` |
| `plan NT-001` | Plan only (no code changes) |
| `approve plan NT-001` | Implement → verify → close |
| `implement from tracker <path> §<section>` | Fix from any tracker section |
| `resume implement` | Continue from last checkpoint |

---

## Mandatory implement phases (never skipped)

Every IDE runs these in order:

| # | Phase | Output |
|---|-------|--------|
| 1 | Intake | Load finding or tracker reference |
| 2 | **NOW** | What code actually does today |
| 3 | **DOCUMENT** | What the tracker requires (source doc read) |
| 4 | **Gap** | NOW vs DOCUMENT comparison table |
| 5 | **Plan** | Steps + tests → **you must approve** |
| 6 | **Implement** | Code changes, one step at a time |
| 7 | **Verify** | Tests and acceptance criteria |
| 8 | **Close** | Mark `fixed`, summary to you |

Approval prompt (exact):

> *This is the implementation plan for NT-001. Approve to implement, or tell me what to change.*

---

## Audit checks (four per feature)

| Check | Validates |
|-------|-----------|
| **Screen alignment** | UI pages, buttons, labels match tracker |
| **Functionality** | APIs, actions, business logic match tracker |
| **Database validation** | Tables, columns, queries match schema docs |
| **Flow validation** | User flows match logs or runtime traces |

---

## Where output is written

Audit and implement output lives in **`new-tracker/<project-slug>/`**
— a sibling of your product folder and `Agent/`, **not inside the product**.

```
company-repo/
  Agent/
  your-product/                    ← source code only
  new-tracker/
    your-product/                  ← all agent output for this product
      README.md
      feature-inventory.md
      findings-index.md
      features/
      plans/
      summary/
      review-state/
        discovery-manifest.json
        progress-state.json
        implement-progress-state.json
```

**Path rule:** `<parent-of-product>/new-tracker/<product-folder-name>/`

Example for this repo:

```
Invoice-LLM-SOLO-Dev/new-tracker/Prod_Invoice_LLM/
```

Legacy paths inside the product (`new tracker/`, `review-state/`) are
deprecated — see `MOVED.md` files if present.

Full rules: [`output-layout.md`](output-layout.md)

---

## Kit file reference

| File | Purpose |
|------|---------|
| `AGENTS.md` | Audit agent — single source of truth |
| `AGENTS-IMPLEMENT.md` | Implement agent — single source of truth |
| `IDE-SETUP.md` | Per-IDE install and parity checklists |
| `output-layout.md` | Where audit output is stored (`new-tracker/`) |
| `layer-checklists.md` | Visual + API detail per feature (v1) |
| `VALIDATION-ENHANCEMENT-PLAN.md` | **Plan:** UI padding, visual elements, flow control (V1–V3, F1–F3) |
| `discovery-rules.md` | How trackers are auto-found |
| `review-rubric.md` | Four audit checklists |
| `new-tracker-template.md` | Finding and report formats |
| `implementation-plan-template.md` | Plan file format (Phases 2–8) |
| `implementation-rules.md` | What implement may change in code |
| `wrappers/` | Shared invoke summaries for IDE wrappers |
| `.cursor/`, `.claude/`, `.kiro/`, etc. | Thin IDE entry points |

---

## Quick IDE reference

| IDE | Audit | Implement |
|-----|-------|-----------|
| Cursor | `.cursor/agents/tracker-audit.md` | `.cursor/agents/tracker-implement.md` |
| Claude Code | `.claude/agents/tracker-audit.md` | `.claude/agents/tracker-implement.md` |
| Kiro | `.kiro/agents/tracker-audit.md` | `.kiro/agents/tracker-implement.md` |
| Antigravity | `.agent/workflows/tracker-audit.md` | `.agent/workflows/tracker-implement.md` |
| Devin | `.devin/agents/tracker-audit.md` | `.devin/agents/tracker-implement.md` |
| Copilot | `.github/copilot-instructions.md` | same file |
| Windsurf | `.windsurf/workflows/tracker-audit.md` | `.windsurf/workflows/tracker-implement.md` |

---

## Example session (any product)

```
You:    Run tracker audit

Agent:  Found 3 trackers, 2 architecture docs, 4 code roots.
        Confirm this file list?

You:    Confirm

Agent:  Auditing feature 1 of 20… findings: NT-001, NT-002
        (checkpoints after each feature; say "resume" to continue)

You:    implement NT-001

Agent:  Phase 2: code shows POST /api/login returns 401 on empty body…
        Phase 3: tracker §Login requires 400 with validation message…
        Phase 4: gap — wrong status code…
        Phase 5: plan written to new tracker/plans/NT-001.md
        Approve to implement?

You:    approve plan NT-001

Agent:  Step 1/3 done… Step 2/3 done… tests pass. NT-001 marked fixed.
```

---

## FAQ

**Does this work only for web apps?**  
No. Any product with markdown trackers and source code — mobile, API,
data pipeline, monorepo, single app.

**Do all team members need the same IDE?**  
No. Each person uses their own IDE; behavior is identical because all
wrappers point to the same `AGENTS.md` files.

**Can I use only audit or only implement?**  
Yes. Audit alone finds issues. Implement alone works with `implement from
tracker <path> §<section>` without running audit first.

**Will it change my tracker documents?**  
No. Original trackers are always read-only. Only finding **status** in
`new-tracker/<product>/` and application code (after plan approval) are updated.

**What if discovery misses a tracker?**  
At the confirmation step, say what to add. Or say `re-discover`.

---

## More documentation

| Doc | When to read |
|-----|--------------|
| [`VALIDATION-ENHANCEMENT-PLAN.md`](VALIDATION-ENHANCEMENT-PLAN.md) | UI, padding, flow validation roadmap |
| [`IDE-SETUP.md`](IDE-SETUP.md) | Setting up a specific IDE |
| [`AGENTS.md`](AGENTS.md) | Full audit agent rules |
| [`AGENTS-IMPLEMENT.md`](AGENTS-IMPLEMENT.md) | Full implement agent rules |
| [`new-tracker/README.md`](../new-tracker/README.md) | Output store at repo root |
| [`Agent/new-tracker/README.md`](new-tracker/README.md) | Per-product output template |

---

*Universal Tracker Agent Kit — portable across products, IDEs, and teams.*
