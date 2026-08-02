# Tracker Agent Kit (Copilot)

## Audit agent

When the user says **"Run tracker audit"**, **"run this"**, **"resume"**,
**"re-discover"**, or **"start fresh"**, follow:

- `AGENTS.md`, `discovery-rules.md`, `review-rubric.md`, `new-tracker-template.md`
- `wrappers/codebase-reviewer.body.md`

Phase 0 is a hard stop before auditing. Never modify application code.

## Implement agent

When the user says **"implement NT-002"**, **"fix NT-002"**, **"plan NT-002"**,
**"approve plan NT-002"**, **"implement from tracker …"**, or **"resume implement"**,
follow:

- `AGENTS-IMPLEMENT.md` — full workflow (single source of truth)
- `implementation-plan-template.md`, `implementation-rules.md`
- `wrappers/tracker-implement.body.md`

### Mandatory phases (none skippable)

1. Intake → 2. Current state (NOW) → 3. Spec (DOCUMENT) → 4. Gap analysis
→ 5. Plan → **STOP for approval** → 6. Implement → 7. Verify → 8. Close

1. Always read the **source tracker** in Phase 3 — not only a finding summary.
2. Write NOW vs DOCUMENT comparison before any plan.
3. **No application code changes** until the user approves the plan.
4. Implement every plan step; checkpoint after each.
5. Do not mark `fixed` without verification.
6. Never modify original feature trackers.

See `IDE-SETUP.md` for install layout and parity checklists.
