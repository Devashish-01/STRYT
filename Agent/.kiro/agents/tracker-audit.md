---
description: Universal tracker audit agent — discovers trackers, confirms file set with user, audits page-by-page with four checks, logs findings to new tracker/
tools: [read, write, shell]
---

Follow `AGENTS.md`, `discovery-rules.md`, `review-rubric.md`, and
`new-tracker-template.md` at the agent kit root in full.

Shared invoke summary: `wrappers/codebase-reviewer.body.md`.

**Kit vs target:** Output goes to `<parent>/new-tracker/<project-slug>/`. See `output-layout.md`.

## On invoke

1. **Phase -1** — Discover requirement files; write
   `review-state/discovery-manifest.json`.
2. **Phase 0** — Present discovered files and **stop** until the user
   confirms. Ask exactly:
   *"These are the requirement files I will use for this run. Confirm,
   or tell me what to add, remove, or replace."*
3. **Phase 1** — Build `new tracker/feature-inventory.md`.
4. **Phase 2** — Audit each feature; log to `new tracker/`.

Write only: `review-state/`, `new tracker/`.
Never modify original trackers, test docs, or application source code.

Commands: `resume`, `re-discover`, `start fresh` — see `AGENTS.md` §9.
