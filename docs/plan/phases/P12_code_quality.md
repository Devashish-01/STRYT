# P12 — Code quality refactors (behaviour-preserving)

**Who:** agent
**Size:** 3–4 sessions
**Depends on:** P11

## Goal
Make the code safer to change without changing what it does:
- stronger types;
- smaller files;
- zero lint warnings;
- no leftovers.

The E2E suite (P07) and unit tests are the safety net: **they must be green before and after every refactor commit.**

## Baseline (2026-09-13)
- **`any`:** 670 in app code. Top files:
  - `communityService.ts` 70
  - `bulkService.ts` 29, `businessService.ts` 28, `requestService.ts` 28
  - `deliveryService.ts` 24, `AdminPanel.tsx` 24, `appointmentService.ts` 23
  - `userService.ts` 21, `Notifications.tsx` 18, `BusinessSettings.tsx` 17
  - `adminService.ts` 15, `societyService.ts` 13
- **Files over 1,000 lines:**
  - `CommunityPostDetail.tsx` 1,752, `BusinessDetail.tsx` 1,251, `AdminPanel.tsx` 1,222, `CommunityCompose.tsx` 1,198
  - `AppointmentSheet.tsx` 1,147, `cards.tsx` 1,136, `businessService.ts` 1,087
  - `Notifications.tsx` 1,060 (includes a ~700-line `if/else` chain of notification actions)
  - `BusinessAppointments.tsx` 1,006
  - `database.types.ts` (8,049) and `i18n.tsx` are excluded: generated or data.
- **ESLint:** 30 warnings (21 `react-refresh/only-export-components`, 9 `react-hooks/exhaustive-deps`).
- **`window.open` without `noopener`:** 5 call sites.
- **Demo-data short-circuits:** `src/services/engagement/appointmentService.ts` still returns canned data for demo ids.
- **Shelved:** 13 unrouted screens in `src/screens/future-enhancement/` (D3).

## Preconditions
| Check | Command | Expected |
|---|---|---|
| Branch | `git switch -c phase/12-quality origin/develop` | Switched |
| Safety net green | `npm run verify`, `npm run e2e` | exit 0, 0 fixme |
| D3 answered | `DECISIONS.md` | Present |

## Read first
- `docs/engineering/CODEBASE_MAP.md` (§4–6 patterns)
- `src/types/database.types.ts`: generated `Tables<"x">`, `TablesInsert`, `TablesUpdate`
- `src/lib/caseMap.ts` (`toCamel`/`toSnake`)

## Rules
- **No behaviour change.** A refactor commit contains no logic changes. A bug you find goes into the ledger as a new `OPEN` row, gets fixed in its own commit via the P09 loop, and is never mixed into a refactor.
- **Mechanical, reviewable commits.** One extraction or one file's typing per commit, with `verify` + the relevant E2E specs after each.

## Steps
1. **Notification actions:**
   - replace the `handleAction` `if/else` chain in `src/screens/Notifications.tsx` with a registry `src/screens/notifications/actions.ts`: `Record<ActionName, (ctx) => Promise<void> | void>`;
   - keep optimistic update → server call → toast → rollback identical per action;
   - add unit tests: each action navigates to the same route and calls the same service method as before (mock `nav` and services).
2. **Split large screens** by extracting sub-components and hooks into sibling folders: `CommunityPostDetail`, `BusinessDetail`, `AdminPanel`, `CommunityCompose`, `AppointmentSheet`, `BusinessAppointments`, `cards.tsx` (one component per file). Target: no screen file over 700 lines. Keep props explicit; no new context.
3. **Types in services:**
   - type Supabase rows with `Tables<"table">` and mapped results with the existing app types;
   - replace `any` in the 7 top services first;
   - allowed: `as any` where a third-party type is wrong, with a one-line comment giving the reason.

   Target: services ≤ 20 `any` in total; the whole app ≤ 250.
4. **ESLint:**
   - fix the 30 warnings: move non-component exports out of component files, and correct hook dependency arrays **without changing behaviour** (use `useCallback` where the dependency is a function);
   - set `--max-warnings 0` in `npm run verify` and in CI.
5. **External links:** add `openExternal(url)` in `src/lib/` (uses `noopener,noreferrer`; native: `@capacitor/browser` if already used) and replace the 5 `window.open` sites. `tel:` links keep using `window.open(..., "_self")` or an `<a href="tel:">`; don't break dialing.
6. **Demo data:** remove the demo-id short-circuits from production service code. If tests rely on them, move the fixtures into the test files. Prove no production code path references demo ids: `git grep -n -E "biz_mock_|prov_mock_" -- src ':!*.test.ts'` → no output.
7. **Shelved screens (D3 = delete):** delete `src/screens/future-enhancement/`. Prove nothing imports it: `git grep -n "future-enhancement" -- src` → no output after deleting. Remove services and types used only by those screens, **only if** `tsc` and a grep prove nothing else uses them.
8. Update `docs/engineering/CODEBASE_MAP.md` for every moved or deleted file.

## Verification
| Command | Expected |
|---|---|
| `npx eslint . --max-warnings 0` | exit 0 |
| `any` count (same grep as the baseline) | App ≤ 250; services ≤ 20 |
| `wc -l` on the listed screens | Each ≤ 700 |
| `git grep -n "window.open(" -- src` | Only `openExternal` and `tel:` uses |
| `npm run e2e` | 0 failed, 0 flaky |
| `npm run verify` | exit 0 |
| Bundle size | Not larger than P11's after-numbers |

> **Status 2026-09-18 — see [the report](../reports/P12_REPORT.md).**
> Done: steps 1, 4, 5, 6, 7, 8. Step 2 is done for `AdminPanel` (1253→109), `cards.tsx` (1144→12) and
> `Notifications` (1111→409); five screens remain over 700 lines. Step 3 reduced `any` from 670 to 455 in the
> app and 361 to 128 in services, short of 250/20.
>
> Two things the report argues rather than assumes: the remaining five screens each need a container/presenter
> hook, not a component extraction (measured at 18–30 props), and the remaining `any` are concentrated in row
> mappers that need per-query row types. Three bugs found during the work are logged as P12-001/002/003 and
> deliberately not fixed inside a refactor.
>
> **None of it has been through the E2E suite** — the owner's instruction was to code now and test at the end.
> The demo-mode removal (step 6) is the one that most needs it: it changes the booking and listing read paths.

## Definition of Done
- [ ] Notification actions as a tested registry.
- [ ] No screen over 700 lines.
- [ ] `any` targets met; 0 ESLint warnings enforced in CI.
- [ ] `openExternal` everywhere; no demo data in production paths; shelved screens handled per D3.
- [ ] E2E and unit suites green after every commit.

## Stop and ask if
- A refactor exposes behaviour that looks wrong. Log it; don't silently "fix" it inside the refactor.
- Typing a service reveals the database schema and the app disagree.

## Checker checklist
- Pick 3 refactor commits: confirm `git show` has no logic changes (only moves and type annotations).
- Run the E2E suite.
- Re-count `any` and the line counts yourself.
