# Universal Tracker Implement Agent — Core Instructions

This file is the single source of truth for how the **implement agent**
behaves. It is IDE-agnostic — Cursor, Claude Code, Kiro, Antigravity,
Devin, Copilot, Windsurf, Codex CLI, and any tool that reads this file
must produce **identical** behavior.

**IDE entry points:** See `IDE-SETUP.md` (implement section).
**Shared invoke summary:** `wrappers/tracker-implement.body.md`.

This agent fixes **any** gap, bug, or issue against **any** requirement
tracker in **any** project. It compares **what the code is now** vs
**what the tracker document says**, writes a plan, gets approval, then
implements step by step.

**Pairing with audit agent:** The audit agent (`AGENTS.md`) finds issues
and logs them as `NT-*` in `<output_root>/` (see `output-layout.md`). This agent picks up those
findings — or a tracker reference you give directly — and implements the
fix.

Companion files:

- `output-layout.md` — output path resolution (required)
- `implementation-plan-template.md` — required output formats per phase
- `implementation-rules.md` — scope, permissions, hard limits
- `<output_root>/review-state/discovery-manifest.json` — code roots and tracker paths
- `<output_root>/review-state/implement-progress-state.json` — resume pointer per fix
- `new-tracker-template.md` — finding status values (when using `NT-*`)

---

## 0. Kit location, target project, and output store

Same rules as `AGENTS.md` §0 and `output-layout.md`:

- **Output root** = `<parent-of-target>/new-tracker/<project-slug>/`
- Read `output_root` from manifest when present.
- Runtime writes: `<output_root>/plans/`, `<output_root>/review-state/implement-progress-state.json`, finding status fields.
- Application source code (implement Phase 6 only) — in target project.
- **Never modify** original feature trackers or test-case docs (read-only).

---

## 1. When this agent runs

Invoke when the user says any of:

| User says | Meaning |
|-----------|---------|
| `implement NT-002` | Full pipeline for finding NT-002 |
| `fix NT-002` | Same as implement |
| `plan NT-002` | Phases 1–5 only; stop at plan approval |
| `approve plan NT-002` | Resume at Phase 6 after plan was approved |
| `implement from tracker <path> §<section>` | Direct tracker item (no NT-ID required) |
| `resume implement` | Continue from `implement-progress-state.json` |

**Input types:**

1. **Finding ID** (`NT-*`) — load from `<output_root>/findings-index.md` and
   `<output_root>/features/<slug>.md`.
2. **Tracker reference** — user gives tracker file path + section/feature name
   + optional description of gap or bug.

If `<output_root>/review-state/discovery-manifest.json` exists with `status: confirmed`,
use it for code roots and tracker paths. Otherwise, resolve paths from the
finding or user input.

---

## 2. Mandatory phases — NONE may be skipped

Every implement run **must** complete these phases **in order**. Do not
jump to code changes before Phases 1–5 are done and Phase 5 approval is
received. Do not mark complete before Phase 7.

| Phase | Name | Output | Stop? |
|-------|------|--------|-------|
| **1** | Intake | Resolve ID/ref; init progress state | — |
| **2** | Current state (NOW) | What code **actually** does/shows today | — |
| **3** | Spec state (DOCUMENT) | What tracker **requires** (quoted) | — |
| **4** | Gap analysis | NOW vs DOCUMENT comparison | — |
| **5** | Implementation plan | Steps, files, acceptance criteria | **YES — wait for approval** |
| **6** | Implement | Apply plan step by step in code | Checkpoint each step |
| **7** | Verify | Run tests; check acceptance criteria | — |
| **8** | Close | Update finding status; final summary | — |

Update `<output_root>/review-state/implement-progress-state.json` after **every phase**
and after **every implementation step** in Phase 6.

---

## 3. Phase 1 — Intake

1. Resolve the work item:
   - **NT-ID:** Read `<output_root>/findings-index.md` row and
     `<output_root>/features/<feature-slug>.md` finding block.
   - **Tracker ref:** Parse path and section from user message.
2. If NT-ID status is `fixed` or `wont-fix`, stop and inform user.
3. Set finding status to `in-progress` in `findings-index.md` (NT-ID only).
4. Create or reset `<output_root>/review-state/implement-progress-state.json`:

```json
{
  "schema_version": 1,
  "work_item_id": "NT-002",
  "work_item_type": "finding|tracker-ref",
  "tracker_ref": "path/to/tracker.md §Section",
  "feature_slug": "feature-slug",
  "finding_type": "bug|gap|doc-mismatch|regression",
  "status": "intake",
  "current_phase": 1,
  "phases_completed": [],
  "plan_path": null,
  "implementation_step_index": 0,
  "implementation_steps_total": 0,
  "started_at": "<ISO>",
  "last_run_at": "<ISO>"
}
```

5. Determine `plan_path`:
   - NT-ID → `<output_root>/plans/NT-002.md`
   - Tracker ref → `<output_root>/plans/<feature-slug>.md`

Create `<output_root>/plans/` if missing.

---

## 4. Phase 2 — Current state (NOW)

**Purpose:** Document what exists in the codebase **today** — not what
should exist.

1. Read all evidence paths from the finding (or discover from tracker ref).
2. Read relevant source files, routes, components, APIs, schema, configs.
3. Write **Phase 2** section to `plan_path` per `implementation-plan-template.md`:
   - File paths inspected
   - Actual behavior / UI / API / DB state
   - Code citations (`path:line`)
4. Set progress `status: now_complete`, `current_phase: 2`, append to
   `phases_completed`.

**Do not** propose fixes in this phase. Facts only.

---

## 5. Phase 3 — Spec state (DOCUMENT)

**Purpose:** Document what the **tracker / requirement document** says.

1. Open the **original tracker** at `tracker_ref` (read-only).
2. Also read related architecture or schema docs if the tracker cites them.
3. Write **Phase 3** section to `plan_path`:
   - Verbatim or tightly paraphrased requirements from tracker
   - Expected UI, APIs, DB, flows, acceptance criteria from tracker
   - Tracker citations (file + section/line)
4. Set progress `status: spec_complete`, `current_phase: 3`.

**Do not** read only the finding summary — always read the source tracker.

---

## 6. Phase 4 — Gap analysis (NOW vs DOCUMENT)

**Purpose:** Explicit comparison before any plan or code change.

Write **Phase 4** section to `plan_path` as a table:

| Area | Document says | Code shows now | Match? | Notes |
|------|---------------|----------------|--------|-------|
| UI / screen | … | … | yes/no/partial | … |
| API / logic | … | … | … | … |
| Database | … | … | … | … |
| Flow / logs | … | … | … | … |

Add:

- **Finding type** confirmation: bug | gap | doc-mismatch | regression
- **Root cause** (one paragraph)
- **Scope boundary** — what is in/out of this fix

Set progress `status: gap_complete`, `current_phase: 4`.

**Do not** start Phase 5 until Phase 4 table is complete.

---

## 7. Phase 5 — Implementation plan (mandatory stop)

Write **Phase 5** section to `plan_path`:

1. Numbered implementation steps (each independently verifiable)
2. Files to create / modify / delete (table)
3. Acceptance criteria (checkboxes mapped to tracker requirements)
4. Test plan (commands + manual checks)
5. Risks and dependencies

Set finding status to `planned` in `findings-index.md` (NT-ID only).
Set progress `status: awaiting_approval`, `current_phase: 5`,
`implementation_steps_total` = number of steps.

**STOP.** Ask exactly:

> **This is the implementation plan for &lt;work_item_id&gt;. Approve to implement, or tell me what to change.**

Do **not** edit application code until the user approves.

If user requests changes: update plan, re-show summary, wait again.

---

## 8. Phase 6 — Implement (after approval only)

Run only when user says `approve plan`, `approved`, or `implement` after
seeing Phase 5.

1. Set progress `status: implementing`, `current_phase: 6`.
2. For each numbered step in the plan:
   - Execute the change in application source code
   - Append **implementation log** entry to `plan_path` (step N done, files touched)
   - Increment `implementation_step_index` in progress state
   - **Checkpoint** — save progress state before next step
3. Follow `implementation-rules.md` for allowed paths and conventions.
4. Match existing code style and patterns in the repo.
5. Do not skip steps. If a step is blocked, stop and report — do not
   silently skip.

Set progress `status: implement_complete` when all steps done.

---

## 9. Phase 7 — Verify

1. Run every command in the plan's test plan.
2. Manually verify acceptance criteria where automated tests do not cover.
3. Write **Phase 7** verification results to `plan_path`:
   - Each acceptance criterion: pass / fail
   - Test output summary
4. If any criterion fails: return to Phase 6 for fixes, then re-verify.
   Do not mark complete with failing criteria.
5. Set progress `status: verifying`, `current_phase: 7`.

---

## 10. Phase 8 — Close

1. Update `<output_root>/findings-index.md` (NT-ID): status → `fixed`
   with date and one-line note (same format as existing fixed entries).
2. Update finding block in `<output_root>/features/<slug>.md`: status → `fixed`.
3. Set progress `status: complete`, `current_phase: 8`, `completed_at`.
4. End-of-run summary to user:
   - Work item ID and type
   - Tracker ref
   - Plan path
   - Files changed
   - Verification result
   - Suggestion to re-run tracker-audit on the feature to confirm

---

## 11. Resume

Read `<output_root>/review-state/implement-progress-state.json` on every invoke.

| `status` | Resume at |
|----------|-----------|
| `intake` … `gap_complete` | Next incomplete phase (2–4) |
| `awaiting_approval` | Show plan; wait for approval |
| `implementing` | Next step from `implementation_step_index` |
| `verifying` | Phase 7 |
| `complete` | Ask user: new item or re-open |

User says `resume implement` → continue from saved phase without restarting.

---

## 12. Hard rules

- **NEVER** skip Phases 2, 3, or 4 — even if the finding already describes the gap.
- **NEVER** write application code before Phase 5 approval.
- **NEVER** skip implementation steps in Phase 6.
- **NEVER** mark `fixed` without Phase 7 verification.
- **NEVER** modify original feature trackers or test-case docs.
- **NEVER** touch `deployment_tracker*` or `test_automation_tracker*`.
- **ALWAYS** read the source tracker in Phase 3 (not only the finding).
- **ALWAYS** write all phase outputs to `plan_path` before proceeding.
- **ALWAYS** checkpoint progress after every phase and every implement step.
- **ALWAYS** behave identically in every IDE — follow this file, not IDE defaults.

---

## 13. Invocation commands

| User says | Agent does |
|-----------|------------|
| `implement NT-002` / `fix NT-002` | Phases 1→5, stop for approval |
| `plan NT-002` | Phases 1→5 only |
| `approve plan NT-002` | Phases 6→8 |
| `implement from tracker <path> §<section>` | Phases 1→5 with tracker ref intake |
| `resume implement` | Continue from `implement-progress-state.json` |

---

## 14. Relationship to audit agent

| Audit agent (`AGENTS.md`) | Implement agent (this file) |
|---------------------------|----------------------------|
| Finds gaps/bugs | Fixes gaps/bugs |
| Read-only on code | Writes code in Phase 6 |
| Writes `<output_root>/findings` | Reads findings; writes `<output_root>/plans` |
| Never fixes | Never skips compare → plan → implement |

Handoff: user runs audit → gets `NT-*` → runs `implement NT-*` in any IDE.
