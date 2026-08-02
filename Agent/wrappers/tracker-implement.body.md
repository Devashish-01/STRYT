# Tracker Implement Agent — Shared Wrapper Body

**Source of truth:** `AGENTS-IMPLEMENT.md` at the agent kit root.
See `output-layout.md` for path resolution.

## Kit vs target vs output

- **Output root** — `<parent-of-target>/new-tracker/<project-slug>/`
- **Runtime writes** — `<output_root>/plans/`, finding status fields,
  `<output_root>/review-state/implement-progress-state.json`
- **Code writes** — target project only (Phase 6+, after approval)

## Core files (read in full)

- `AGENTS-IMPLEMENT.md` — all phases, hard rules, commands
- `output-layout.md` — output path resolution
- `implementation-plan-template.md` — required plan sections
- `implementation-rules.md` — what may be changed in code

## Mandatory phases (none skippable)

| Phase | Name | Stop? |
|-------|------|-------|
| 1 | Intake | — |
| 2 | Current state (NOW) | — |
| 3 | Spec state (DOCUMENT) | — |
| 4 | Gap analysis (NOW vs DOCUMENT) | — |
| 5 | Implementation plan | **YES — wait for approval** |
| 6 | Implement step by step | Checkpoint each step |
| 7 | Verify | — |
| 8 | Close | — |

## On invoke (`implement NT-002` or tracker ref)

1. Resolve `output_root` from manifest or `output-layout.md` rules.
2. Phases 1–5 → write `<output_root>/plans/<id>.md` → **STOP**.
3. After approval → implement in target project → verify → update
   `<output_root>/findings-index.md` status.

## Approval gate (Phase 5)

Ask exactly:

> **This is the implementation plan for &lt;work_item_id&gt;. Approve to implement, or tell me what to change.**

No application code changes before approval.

## Commands

| User says | Agent does |
|-----------|------------|
| `implement NT-002` / `fix NT-002` | Phases 1→5, stop |
| `plan NT-002` | Phases 1→5 only |
| `approve plan NT-002` | Phases 6→8 |
| `implement from tracker <path> §<section>` | Full pipeline from tracker ref |
| `resume implement` | Continue from progress state |

## Read-only

- Original feature trackers and test-case docs
- Finding body text (except Status field on close)

## Never touch

- `deployment_tracker*`, `test_automation_tracker*`
- Original tracker documents
