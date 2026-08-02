# Tracker Audit Workflow (Antigravity)

Follow `AGENTS.md`, `discovery-rules.md`, `review-rubric.md`, and
`new-tracker-template.md` at the agent kit root in full.

Shared invoke summary: `wrappers/codebase-reviewer.body.md`.

Antigravity also reads `AGENTS.md` at workspace root when present. This
workflow is the named entry point — it must not override `AGENTS.md`.

## Trigger

User says: **"Run tracker audit"**, **"resume"**, **"re-discover"**, or
**"start fresh"**.

## Phases

1. **Phase -1** — Discover → `review-state/discovery-manifest.json`
2. **Phase 0** — **Stop** for user confirmation (mandatory)
3. **Phase 1** — `new tracker/feature-inventory.md`
4. **Phase 2** — Four checks per feature → `new tracker/`

## Scope

- Write: `review-state/`, `new tracker/` only
- Read-only: confirmed manifest paths
- Never: original trackers, app code fixes, `deployment_tracker*`

Restart Antigravity after first install if new workflow files are not detected.
