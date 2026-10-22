# Implementation Rules

Referenced by `AGENTS-IMPLEMENT.md` Phase 6. Applies to **any** project
and **any** tracker-driven fix.

---

## What this agent may change

- Application source code under confirmed `code_roots` in discovery manifest
- Project config required for the fix (e.g. `package.json` scripts if tracker requires)
- `<output_root>/plans/<id>.md` — plan and implementation log
- `<output_root>/findings-index.md` — status fields only
- `<output_root>/features/<slug>.md` — finding status only
- `<output_root>/review-state/implement-progress-state.json`

---

## What this agent must not change

- Original `*_features_tracker.md` and requirement tracker documents (read-only)
- `deployment_tracker*`, `test_automation_tracker*`
- Test-case journey docs (read-only unless user explicitly asks to update tests as part of fix)
- Audit findings content (except `Status` field on close)
- Other open findings

---

## Implementation conventions

1. **Match the repo** — naming, patterns, imports, error handling same as surrounding code.
2. **Minimal scope** — fix only what the approved plan covers; no drive-by refactors.
3. **Layer order** — when a fix spans layers, default order: backend → frontend → website.
4. **DB changes** — if tracker requires schema change, follow existing migration patterns in the repo.
5. **No secrets** — never commit credentials; use env examples if tracker requires new config keys.

---

## When tracker and code conflict

If Phase 4 shows the tracker is ambiguous or wrong:

1. Do not guess — document ambiguity in the plan.
2. Stop at Phase 5 and ask the user to clarify before approval.
3. Do not mark `fixed` if the fix does not match an agreed interpretation.

---

## Verification minimum

Before Phase 8 close, at least one of:

- Automated test command from plan passes
- Manual verification steps documented with result
- For UI-only: describe what was checked and outcome

If tests cannot run (missing env), document `unverified` and do not mark
`fixed` unless user explicitly accepts unverified close.
