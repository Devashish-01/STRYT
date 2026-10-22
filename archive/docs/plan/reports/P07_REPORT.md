# P07 Report — End-to-end test suite on staging

**Agent / model:** Claude (Opus 5), Claude Code
**Sessions:** 2026-09-15 → 2026-09-18
**Branch:** `phase/07-e2e` (reports finished on `night/2026-09-18`)

## 1. What exists

**21 spec files · 137 tests · one worker, strictly serial · ~12 minutes · against staging
`laswruzdyqehziyupmdm`.**

| Group | Files | What it covers |
|---|---|---|
| `critical/` | 18 | The journeys where a bug costs someone money, a booking, or their privacy |
| `flows/` | 2 | `screens.spec.ts` — breadth over 103 routes × persona; `accessibility.spec.ts` — axe (added in P13) |
| `smoke/` | 1 | All seven personas sign in and reach a loaded signed-in screen |

The suite refuses to run against anything but staging: `global-setup.ts` checks the project ref before it
reseeds, and the app is built in `--mode staging` so it cannot talk to production.

## 2. Coverage, honestly

From `tests/e2e/COVERAGE.md`, against the 52 flows in `MASTER_FLOW_AUDIT_TRACKER.md`:

| Level | Flows | Meaning |
|---|---|---|
| **Journey** | 22 | The action is performed through the UI, checked from every affected persona's side, and proven to have persisted — reload, or another persona seeing it, or the database. |
| **Screen** | 25 | The screen opens for the right persona (or is correctly blocked), finishes loading, and raises no page error, failing Supabase call or error toast. **The main action is not exercised.** |
| **Deferred** | 3 | Deliberately not tested — delivery, per BLOCKER 1. |
| Other | 2 | One `Screen+`, one gap. |

**So 22 of 52 flows are proven end to end, and 25 are proven only to open.** That distinction is the most
important sentence in this report. A green run does not mean "the app works"; it means eighteen critical
journeys work and half the remaining screens at least render without error.

26 flows carry an explicit `action spec TODO`.

## 3. The screens breadth spec

`flows/screens.spec.ts` is the widest net: every route, opened by the persona that uses it, asserting four
things at once —

1. it lands where it should, including guards that redirect;
2. no `.skel` skeleton is left behind (it finished loading);
3. no page error;
4. no failing Supabase call and no "Couldn't load" toast.

That fourth check is watched with a `MutationObserver` rather than sampled, because E2E-005 was a toast that
appeared about a second after the skeletons cleared and slipped past a one-off check.

## 4. Results

**137 passed, 0 failed, 0 flaky, nothing skipped, 12.0 minutes** — 2026-09-18, first attempt, run against
the finished P12 refactors.

One `knownBug()` marker remains in the suite. Bugs found while building it were fixed and their tests turned
green rather than being weakened; the ledger carries them as `E2E-0NN`.

## 5. Deviations and what is not done

| Phase file asks for | State | Why |
|---|---|---|
| 3 consecutive green full runs on the final code | **1 run** | The code kept changing — P12 landed eleven commits, then P13/P14 landed more. A "final code" run is only meaningful once the branch stops moving. See §7. |
| Action specs for the screen-only flows | **26 outstanding** | Each is a real test to write, not a gap in the harness. |
| E2E green before and after every refactor commit | Not done during P12 | The owner asked for coding first and testing at the end. P12's report records it; the single end-state run passed. |

## 6. What the suite cannot prove

Worth stating so it is not over-trusted:

- It runs in a desktop Chromium emulating a Pixel 7. It has never touched a real phone — that is P13, and
  BLOCKER 3 is still open.
- It cannot see a push notification arrive, a permission dialog, the dialler, or what Android does to a
  backgrounded process.
- It tests staging. Production has not had migrations `20260973`–`20260989` applied, so the two are not the
  same database today.

## 7. To close this phase

1. Stop changing the branch.
2. Run the suite three times consecutively; all green, no flakes.
3. Write action specs for the 26 `action spec TODO` flows, or accept them as screen-level with that recorded
   as a decision.

## 8. Definition of Done

- [x] Suite runs on staging only, with a guard
- [x] 18 critical journeys as full journey tests
- [x] Breadth coverage of every route
- [x] Bugs found are fixed and their tests turned green, not weakened
- [x] Report
- [ ] 3 consecutive green runs on final code
- [ ] Action specs for the 26 screen-only flows
