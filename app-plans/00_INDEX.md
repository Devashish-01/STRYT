# STRYT — Overnight Work Plan (Index)

This directory holds one plan file per requested task. Each plan states the
current state (verified against the live codebase + production DB), the target,
the concrete steps, risk, and status. Work is executed one task at a time with a
build + commit checkpoint after each.

| # | Task | File | Risk | Status |
|---|------|------|------|--------|
| 1 | Profile routing isolation (customer / business / provider / employee) | `01_profile_routing_isolation.md` | Med | ✅ done |
| 2 | Play Store publishing (code + files) | `02_play_store_publishing.md` | Med | ✅ done (+ manual Play Console steps) |
| 3 | Team member access — full matured flow | `03_team_member_access.md` | Med | ✅ matured |
| 4 | Delegate access — full matured flow | `04_delegate_access.md` | Med | ✅ matured |
| 5 | Move Google import from Verification → Store | `05_google_import_to_store.md` | Low | ✅ done |
| 6 | Website presence / logo / branding | `06_website_presence.md` | Low | ✅ done |
| 7 | Freeze business location + admin-approved change | `07_business_location_freeze.md` | Med | ✅ done (+ server-side trigger) |
| 8 | Alias-name privacy model | `08_alias_name_privacy.md` | Med | ✅ done |
| 9 | Delivery-boy at appointment time | `09_delivery_boy_flow.md` | High | ✅ mature plan (impl deferred) |
| 10 | Free-choice improvements | `10_free_choice_improvements.md` | Low | ✅ advisors reviewed + documented |

See `DONE_SUMMARY.md` for the full outcome.

## Guiding constraints
- Live production app: 85 real users, 78 RLS-protected tables. No destructive
  migrations; all DB changes additive + reversible.
- Every code change must pass `tsc -b --noEmit` and `npm run build`.
- Commit + push after each major task (checkpoint strategy).
- Firebase-only auth is already in place; do not regress it.

## Execution order (value ÷ risk)
5 → 6 → 8 → 1 → 7 → 2 → 3 → 4 → 9 (plan) → 10, then final build.
