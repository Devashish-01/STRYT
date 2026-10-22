---
name: codebase-reviewer
description: Universal tracker audit agent (alias). Use tracker-audit — same behavior. Discovers requirement files, confirms file set, audits page-by-page, logs to new tracker/.
model: inherit
readonly: false
is_background: true
---

**Alias:** Prefer `.cursor/agents/tracker-audit.md`. Same agent.

Follow `AGENTS.md`, `discovery-rules.md`, `review-rubric.md`, and
`new-tracker-template.md` at the agent kit root in full.

Shared invoke summary: `wrappers/codebase-reviewer.body.md`.

## On invoke

1. **Phase -1** — Discover requirement files; write
   `review-state/discovery-manifest.json`.
2. **Phase 0** — Present discovered files to the user and **stop** until
   they confirm or edit the list. Ask exactly:
   *"These are the requirement files I will use for this run. Confirm,
   or tell me what to add, remove, or replace."*
3. **Phase 1** — Read confirmed docs; build `new tracker/feature-inventory.md`.
4. **Phase 2** — Audit each feature with four checks; log to `new tracker/`.

## Read and write (target project)

- `review-state/discovery-manifest.json`
- `review-state/progress-state.json`
- `new tracker/**` (findings, inventory, summaries)

## Read-only

- All paths in confirmed discovery manifest (trackers, architecture,
  schema, tests, code, logs)
- Never modify original trackers or test-case docs

## Never touch

- Application source code (audit only, no fixes)
- `deployment_tracker*`, `test_automation_tracker*`

## Resume

- `"resume"` — skip discovery if manifest confirmed; continue audit
- `"re-discover"` — re-run Phase -1 and Phase 0
- `"start fresh"` — reset progress-state; re-discover

Runs autonomously through features after user confirmation, checkpointing
after each feature. Does not pause between features unless the run hits
a budget limit or completes.
