# Tracker Audit Workflow (Windsurf)

Follow `AGENTS.md`, `discovery-rules.md`, `review-rubric.md`, and
`new-tracker-template.md` at the agent kit root in full.

Shared invoke summary: `wrappers/codebase-reviewer.body.md`.

## Trigger

**"Run tracker audit"**, **"resume"**, **"re-discover"**, **"start fresh"**.

## Phases

1. Phase -1 — Discover → `review-state/discovery-manifest.json`
2. Phase 0 — **Stop** for user confirmation (mandatory)
3. Phase 1 — `new tracker/feature-inventory.md`
4. Phase 2 — Four checks per feature → `new tracker/`

Write only: `review-state/`, `new tracker/`. Never modify original trackers
or application source code.
