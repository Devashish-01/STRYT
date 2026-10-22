# Tracker Audit Agent — Shared Wrapper Body

**Source of truth:** `AGENTS.md` at the agent kit root. See `output-layout.md`
for where files are written.

## Kit vs target vs output

- **Kit root** — directory containing `AGENTS.md`.
- **Target project root** — workspace root unless the user specifies another path.
- **Output root** — `<parent-of-target>/new-tracker/<project-slug>/`
  (read `output_root` from manifest when present).

**Runtime writes** — only under **output root**, never inside `Agent/` or
mixed into product source (except legacy migration).

## Core files (read in full)

- `AGENTS.md` — phases, hard rules, commands
- `output-layout.md` — path resolution
- `layer-checklists.md` — visual (fe/web) and API (be) detail per feature
- `discovery-rules.md` — Phase -1 heuristics
- `review-rubric.md` — four checks per feature
- `new-tracker-template.md` — finding and report formats

## On invoke

1. **Phase -1** — Discover requirement files; write
   `<output_root>/review-state/discovery-manifest.json` (include `output_root`).
2. **Phase 0** — Present discovered files to the user and **stop** until
   they confirm or edit the list. Ask exactly:
   *"These are the requirement files I will use for this run. Confirm,
   or tell me what to add, remove, or replace."*
3. **Phase 1** — Read confirmed docs; build `<output_root>/feature-inventory.md`.
4. **Phase 2** — Audit each feature with four checks; append **Visual & screen detail** (fe/web) or **API & handler detail** (be) per `layer-checklists.md`; log to `<output_root>/`.

## Read and write (output root only)

- `<output_root>/review-state/discovery-manifest.json`
- `<output_root>/review-state/progress-state.json`
- `<output_root>/**` (findings, inventory, summaries)

## Read-only

- All paths in the confirmed discovery manifest (trackers, architecture,
  schema, tests, code, logs)
- Never modify original trackers or test-case docs

## Never touch

- Application source code (audit only, no fixes)
- `deployment_tracker*`, `test_automation_tracker*`

## Commands

| User says | Agent does |
|-----------|------------|
| `Run tracker audit` / `run this` | Phase -1 → Phase 0 → wait for confirm |
| `resume` | Skip discovery if manifest confirmed; continue audit |
| `re-discover` | Re-run Phase -1 and Phase 0 |
| `start fresh` | Reset progress-state; re-discover |

## Autonomous run

After Phase 0 confirmation, run through features autonomously,
checkpointing after each feature. Do not pause between features unless
the run hits a budget limit or completes.
