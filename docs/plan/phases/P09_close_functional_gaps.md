# P09 — Close functional gaps

**Who:** agent; owner confirms applies, pushes and releases
**Size:** 14+ sessions. 9.0 cross-cutting patterns, then one session per domain (9.1–9.12, the same split as P08), plus 9.13 for leftovers and new `E2E-`/`QA-` items. Keep each session to **≤10 findings**.
**Depends on:** P08

## Goal
Every `OPEN` row in `docs/gaps/GAP_LEDGER.csv` becomes `FIXED` (with a regression test) or is deferred **in writing by the owner**. Every E2E `fixme` is removed.

## Preconditions (each session)
| Check | Command | Expected |
|---|---|---|
| Branch | `git switch -c phase/09-<session>-<slug> origin/develop` | Switched |
| Ledger valid | `node scripts/gaps/ledger-summary.mjs` | exit 0 |
| Suites green before starting | `npm run verify` and `npm run e2e` | exit 0 (`fixme` allowed) |
| No blocking decisions | `DECISIONS.md` | Every `DECISION` row in this session's domain is answered, or skipped this session |

## Read first (each session)
- The ledger rows for the session, and each finding's detailed section in its gap log
- `docs/engineering/CODEBASE_MAP.md` for the domain
- `docs/plan/AGENT_RULES.md` §3 and §4

## The loop for every finding
1. **Reproduce.** Write the smallest test that fails because of this defect:
   - a unit test next to the code (`*.test.ts`), for logic, services or helpers;
   - an E2E assertion in the flow's spec (remove the `fixme` if one exists), for screen or multi-persona behaviour;
   - a forced-rollback SQL test, for database behaviour.

   Run it and **paste the failure**.
2. **Fix** with the smallest change that follows existing patterns. For a database change, use the full HANDOFF §5 procedure, **on staging first** (apply the migration to staging, run the domain's E2E there), then production with owner confirmation and an APPLY_LOG row.
3. **Prove** the test now passes (paste the output), then run `npm run verify` and the domain's E2E specs.
4. **Record** in the ledger: status `FIXED`, evidence = test name + `file:line`, commit sha. Mark the gap log ✅.
5. **Commit** that finding (or a tight group sharing one root cause) with message `fix(<domain>): <what the user sees now> [<gap_id>]`, owner-confirmed.

## 9.0 — Cross-cutting patterns (first session)
Fix each pattern once; close every ledger row it covers. Clusters come from `EXECUTION_PHASE_PLAN.md` Phase 5; **use only rows still `OPEN` in the ledger**.
- **Swallowed errors:** a write whose `{ error }` is discarded, or `.catch(() => {})`. Surface via `showToast` + rollback, and add a lint script `scripts/check-swallowed-errors.mjs` that fails on new empty catches in `src/` (allow-list with reasons).
- **Missing cache invalidation after mutations:** use existing `invalidateQueryCache` / bust helpers.
- **Destructive action without confirmation:** use the existing confirm-sheet pattern.
- **Unbounded party size:** one shared bound, enforced server-side too.
- **Tappable phone numbers (`tel:`):** one shared helper. The Android `<queries>` fix is in P01.
- **Team-scope checks missing** for scoped staff (`has_business_scope`).

## 9.1–9.12 — Domains
Same domain split and order as P08. Within a session, fix **P0 → P1 → P2 → P3**.

## 9.13 — Leftovers
- New rows created during P09/P10–P13 (`E2E-###`, `QA-###`).
- Every P2/P3 row the owner chose to defer is marked `DEFERRED` with a new decision id (D17+), so nothing is silently dropped.

## Releases during this phase (per D15)
After every 2–3 domains:
1. confirm `develop` is green (`npm run verify`, `npm run e2e`, CI);
2. the owner approves a PR from `develop` → `main`;
3. after the merge, verify:
   - the OTA bundle: download `latest.json` and the zip, and grep for a string from the newest fix;
   - stryt.in: grep the entry JS the same way;
   - the Android workflow run succeeded.

## Verification (end of each domain session)
| Command | Expected |
|---|---|
| `node scripts/gaps/ledger-summary.mjs` | exit 0; the domain has 0 `OPEN` P0/P1 |
| `grep -rn "test.fixme" tests/e2e/<domain>` | No fixme for this domain's gap ids |
| `npm run e2e` | 0 failed, 0 flaky |
| `npm run verify` | exit 0 |
| `npm run check-drift` | 0 drift (production matches migrations) |

## Definition of Done (whole phase)
- [ ] Ledger: 0 `OPEN`; P2/P3 are `FIXED` or `DEFERRED` with a decision id.
- [ ] `grep -rn "test.fixme" tests/e2e` → no output.
- [ ] Every `FIXED` row from this phase has a regression test named in its evidence.
- [ ] Tracker flows marked 🟢 Production Ready only where the ledger has 0 open rows for the flow.
- [ ] Every production DB change is in APPLY_LOG with a rollback.

## Stop and ask if
- A fix needs a product decision, or changes behaviour users rely on.
- A finding can't be reproduced **and** the code looks correct → propose `NOT_A_BUG` with evidence instead of "fixing" it.
- A fix grows beyond the finding (touches another domain).

## Checker checklist (per session)
- For 3 random fixes: `git revert --no-commit <sha>` on a scratch branch and run the named test. It **must fail**, which proves the test catches the bug. Then discard.
- Re-run `npm run e2e` and the ledger summary.
- Verify APPLY_LOG rows for any database fix (recompute the sha256; check the rollback file exists).
