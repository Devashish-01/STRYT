# P12 Report — Code quality refactors (behaviour-preserving)

**Agent / model:** Claude (Opus 5), Claude Code
**Session date (UTC):** 2026-09-17 → 2026-09-18
**Branch:** `phase/07-e2e`

## 1. Preconditions

| Check | Result | Pass? |
|---|---|---|
| Branch | Continued on `phase/07-e2e` rather than a new `phase/12-quality` | ⚠️ deviation, see §2 |
| Safety net — unit tests | 646 green at the start, 685 green at the end, run after every commit | ✅ |
| Safety net — E2E | Deferred during the work by the owner's instruction ("do the coding part for the remaining things we will test in the end"), then run against the finished phase: **137 passed, 0 failed, 0 flaky, 12.0 min** | ✅ |
| D3 answered | `DECISIONS.md` — delete the shelved screens | ✅ |

## 2. Deviations from the phase file (and why)

| Phase file says | Done instead | Why |
|---|---|---|
| `git switch -c phase/12-quality origin/develop` | Stayed on `phase/07-e2e` | P07–P12 are being run as one unpushed stretch on that branch; splitting now would fragment history that has not been reviewed yet. |
| "`npm run e2e` green before and after every refactor commit" | Unit tests after every commit; E2E once, against the finished phase | The owner asked for coding now and all testing at the end. Recorded because it is the phase's own safety rule: a single run at the end proves the end state but not which commit would have broken what, so a bisect would be needed if it had failed. It did not — 137/137 first attempt. |
| Step 2: "no screen file over 700 lines" | Met for 3 of 8 named files; 5 left untouched | Forcing the other five would make the code worse, not better. See §5. |
| Step 3: app ≤ 250 `any`, services ≤ 20 | 455 and 128 | Large reduction, target not reached. See §5. |

## 3. What was done

### Step 1 — Notification actions as a tested registry ✅

`Notifications.tsx` held a 700-line `if/else` chain: 57 branches covering 60 action names, where adding an
action meant another `else if` and nothing could be tested without rendering the screen.

It is now `src/screens/notifications/actions.ts`, a `Record<string, NotificationAction>`, and `handleAction`
is a lookup. The screen drops **1111 → 409 lines**.

The bodies were parsed out, not retyped. A script re-parsed the chain from the previous commit and compared
each branch against its registry entry: **all 60 map to a byte-identical body**. Two things changed shape:
guards that lived in the condition (`action === "ACCEPT" && meta?.appointmentId`) became an early return,
which is what falling through to the next `else if` amounted to; and the closure values each branch reads are
destructured from a context object at the top of it.

**37 unit tests** in `actions.test.ts`, written from the chain as it stood in the previous commit rather than
from the new code — 60 registered names, 23 navigation cases, the guards, optimistic-update-then-rollback,
and the calendar and dialler hand-offs.

### Step 2 — Large files 🟨 partial

| File | Before | After |
|---|---|---|
| `screens/admin/AdminPanel.tsx` | 1253 | **109** (ten tab components → `screens/admin/tabs/`) |
| `components/cards.tsx` | 1144 | **12** (five modules by card family + a re-export barrel) |
| `screens/Notifications.tsx` | 1111 | **409** (step 1) |
| `screens/CommunityPostDetail.tsx` | 1757 | 1176 (`EditPostSheet`, `CommentRow` extracted) |
| `screens/business/BusinessDetail.tsx` | 1268 | 1263 |
| `screens/CommunityCompose.tsx` | 1205 | 1205 |
| `components/AppointmentSheet.tsx` | 1147 | 1147 |
| `screens/business/manage/BusinessAppointments.tsx` | 1014 | 1014 |

Also split, for the Fast Refresh work in step 4: `store.tsx` (770) → `store.ts` + `store/AppProvider.tsx`;
`lib/i18n.tsx` → `lib/i18n.ts` + `lib/i18n/I18nProvider.tsx`; `features/live-share/useLiveShare.tsx` →
`useLiveShare.ts` + `LiveShareProvider.tsx`.

The five unfinished ones are analysed in §5.

### Step 3 — Types in services 🟨 partial

The unlock was that **`src/types/database.types.ts` had drifted badly**. It still declared `bulk_deal_order`
and `bulk_deal_quote`, dropped in `20260921`, and knew none of the RPCs added since — `community_poll_close`,
`community_comment_delete`, `community_comment_update`, `community_comment_set_pinned`,
`community_post_add_recommendation` and the whole `bulk_deal_pledge_*` family.

Service code had worked around that by casting the client itself: **97 uses of `(sb.from as any)` and
`(sb.rpc as any)` across 17 files**. That cast does not silence one unknown table — it turns off type
checking for the whole query, including column names and the shape of the result.

Regenerated from staging via the Management API. All 97 casts removed, then the result-erasing
`(data ?? []) as any[]` / `.map((r: any) => …)` pattern removed across the same services. That surfaced
**54 type errors**, each resolved on its own terms:

- **Nullable timestamps.** `created_at` is nullable in 83 tables and was reaching `relDate`/`relLabel`/
  `fmtDate`/`dailyBuckets`, typed `string`. Those helpers had always been handed nulls at runtime —
  `new Date(null)` is the epoch — so a row without a timestamp has always rendered as 1970. Parameters
  widened to `string | null` with `new Date(iso ?? 0)`, which is exactly that behaviour. **Logged as
  P12-002**, not silently changed.
- **Status columns read into unions** (8). Each cast names the CHECK constraint that makes the narrowing
  sound, read off staging. `location_share_grants` has no such constraint and its comment says so rather
  than implying one.
- **Single nullable fields** — `Comment.authorAvatar`, `Coupon.businessId`, `DeletionRequest.reason`,
  `SavedSearch.createdAt`, `proposalsGiven.requestId`. App types widened to match the column rather than
  defaulted, because a default changes what the UI receives.
- **`mapPost`** took `Record<string, any>`; it now takes `Tables<"community_posts">`. Six `as any` reads went
  with it, and so did comments claiming those columns were "not in the generated DB types" — untrue once the
  types were regenerated.

| Measure | Baseline | Now | Target |
|---|---|---|---|
| `any` in app code | 670 | **455** | ≤ 250 |
| `any` in services | 361 | **128** | ≤ 20 |

### Step 4 — ESLint to zero ✅

31 warnings → **0**, and `verify` / `verify:ci:test` now run `eslint . --max-warnings 0` (was 30), so it
cannot drift back.

- **21 `react-refresh/only-export-components`.** Eleven component files also exported a helper, so editing
  any of them threw away component state on every save. Each helper moved to the module its callers already
  reach for. Four modules exported a provider beside its context and hook; since the hook has the callers
  (149 files import `useApp`, 88 `useI18n`), the **provider** moved out instead — one import line changed
  rather than 149.
- **10 `react-hooks/exhaustive-deps`**, decided on what each effect is for:
  - **Three were real bugs.** `AppProvider` built `confirmNotifExplainer`/`dismissNotifExplainer` as plain
    functions and listed them in the store's `useMemo` deps, so the context value was rebuilt every render
    and all 149 consumers re-rendered with it. `MapView`'s `businesses`/`providers` were a fresh `[]` each
    render, so the memo below them never hit its cache.
  - **Five were the rule misreading a deliberate field-level dependency.** The console dashboards watch
    `business?.isAvailableNow`, not `business`, on purpose: depending on the object re-runs the sync on every
    refetch and resets a toggle the owner just flipped.
  - **Two are cases where the rule is wrong**, now with the reason beside the disable.
    `useAmbientTheme`'s `dayPartTick` looks unused because the body reads the clock through `getDayPart()`;
    removing it freezes the ambient theme at mount.

### Step 5 — External links ✅

`src/lib/openExternal.ts` (`noopener,noreferrer`); 11 call sites converted. Four had been missing `noopener`
— the directions links on BusinessDetail, MyQueues, PlaceDetail and a notification action — which lets the
opened page navigate the tab it came from, so a maps link becomes a way to replace STRYT with a look-alike
sign-in page. `git grep "window.open(" -- src` now returns only `openExternal` itself and the two `tel:`
diallers.

### Step 6 — Demo data ✅ (needs E2E)

`isMockTarget` matched `"b1"`, `"p1"`, `biz_mock_*`, `prov_mock_*`. For those, `businessService` and
`providerService` returned a **fabricated listing** — invented name, address and two made-up reviews signed
"Emily Watson" and "Michael Chang" — and `appointmentService` wrote the booking to localStorage only.

Neither production nor staging holds a row with any of those ids, so **in production `/business/b1` renders
an invented shop to anyone who opens it**, and a booking made there tells the customer they are booked while
no owner ever sees it — the shape of E2E-009, fixed for real shops and left standing here.

Removed across six files. `git grep -n "isMockTarget\|biz_mock_\|prov_mock_" -- src` is empty outside tests.
Two now-unreachable blocks went with it: the local-only booking record in `create()` and the local `ACCEPTED`
record after the walk-in RPC.

Four unit tests booked a demo shop as a signed-out guest, which is no longer possible. They were testing the
local implementation, not the shipping one — carry-forward on reschedule happens inside
`reschedule_appointment`. Rewritten against that path: the reschedule tests now assert the RPC is called with
the original's id, that the client does not re-send the payment fields and so cannot overwrite what the
server preserved, and that a signed-out reschedule is refused rather than written locally.

### Step 7 — Shelved screens ✅

`src/screens/future-enhancement/` deleted under D3 — 13 unrouted screens, 1799 lines — plus
`societyService`, which nothing imported once they were gone.

### Step 8 — CODEBASE_MAP ✅

§2, §4, §6 and §9 updated, with a table of every file P12 split and an explicit note of the five screens it
did not. Every path the new section names was checked to exist before the section was written.

## 4. Bugs found and logged, not fixed

P12's own rule: a bug found during a refactor goes to the ledger and gets fixed in its own commit.

| Id | What | Why not fixed here |
|---|---|---|
| **P12-001** | `OPEN_CHAT` matched two branches of the action chain; first-match-wins made the second dead for it. The two fall back to different routes — `/chats` and `/chat` — and `/chat` is not a registered route, so `REPLY_CHAT` with no conversation id and no deepLink navigates nowhere. | The registry preserves both fallbacks exactly as the chain resolved them, and a test pins them. Changing one is a one-word fix that deserves its own commit and a test. |
| **P12-002** | A row with a null `created_at` renders as a 1970 date. Pre-existing: `new Date(null)` is the epoch and the `any` hid it. | What a missing timestamp should show — blank, "recently", or hiding the row — is a product decision. |
| **P12-003** | Community post distance falls back to a hardcoded 0.5 km through a read that can never succeed: `(p as any).distance_km` on an already-camelCased object, for a column `community_posts_feed` does not return. | Fixing it means either dropping the distance or having the feed RPC return one — a product decision, not a rename. |

## 5. What is not done, and what it needs

### Five screens still over 700 lines

`BusinessDetail` (1263), `CommunityCompose` (1205), `CommunityPostDetail` (1176), `AppointmentSheet` (1147),
`BusinessAppointments` (1014).

Each is **one component** with 20–30 pieces of state. The three files that split cleanly did so because they
contained several independent top-level components; these do not. Measured on the two candidates:

- `BusinessAppointments`'s 209-line card renderer needs **18 props**, six of them raw `setState` functions,
  and removing it still leaves the file at ~810.
- `CommunityPostDetail`'s modal cluster needs about **30**.

A component with a 25-prop interface is harder to follow than the JSX it replaced, which is the opposite of
what this phase is for. **What they actually need** is a container/presenter split — lift each screen's state
and handlers into a `use<Screen>()` hook, leaving the screen as markup. That is a change of shape rather than
a move, it is best done with the E2E suite running, and it is one screen per sitting. Recommended as its own
follow-up rather than forced in here.

### `any` reduction short of target

455 app / 128 services against 250 / 20. What remains is concentrated in row mappers still typed `(row: any)`
— `rowToProposal`, `rowToRequest`, `mapAgreement` — which are each called from several places with
differently-shaped joined selects, so typing one means giving each call site a row type. The mechanical part
is done; this part is per-query work. `catch (e: any)` accounts for 6 in services and ~175 app-wide, and
converting those to `unknown` needs a shared `errorMessage(err)` helper and a touch of every catch body.

## 6. Verification

The E2E suite was run once, against the finished phase rather than after each commit. All 21 spec files
and 137 tests passed on the first attempt, in 12.0 minutes, with no flakes and nothing skipped —
including every booking, queue and listing journey the demo-mode removal touches.


| Command | Expected | Result |
|---|---|---|
| `npx eslint . --max-warnings 0` | exit 0 | ✅ exit 0 |
| `npx tsc --noEmit` | clean | ✅ clean |
| `npx vitest run` | green | ✅ 685 passed, 46 files |
| `npm run build` | succeeds | ✅ precache 221 entries, 6003 KiB (was 6027 at P12 start) |
| `git grep "window.open(" -- src` | only `openExternal` + `tel:` | ✅ |
| `git grep "isMockTarget\|biz_mock_\|prov_mock_" -- src` | empty | ✅ outside tests |
| `any` app ≤ 250 / services ≤ 20 | — | ❌ 455 / 128 |
| Every screen ≤ 700 lines | — | ❌ 5 remain |
| `npm run e2e` | 0 failed, 0 flaky | ✅ **137 passed, 0 failed, 0 flaky, 12.0 min** (2026-09-18, staging `laswruzdyqehziyupmdm`, 21 spec files) |

## 7. Definition of Done

- [x] Notification actions as a tested registry
- [ ] No screen over 700 lines — 3 of 8 done, 5 analysed in §5
- [ ] `any` targets met — large reduction, targets not reached
- [x] 0 ESLint warnings enforced in CI
- [x] `openExternal` everywhere
- [x] No demo data in production paths
- [x] Shelved screens handled per D3
- [x] E2E green — run once against the finished phase rather than after each commit (see §2)

## 8. For the checker

- Three refactor commits worth reading as pure moves: `d31e914` (helpers out of component files),
  `414df17` (the four context splits), `a1ddc33` (the action registry — the equivalence script is described
  in its message).
- `c1b7a48` is **not** a pure move and should be read as a behaviour question: it widens app types to admit
  nulls the database was always able to return.
- `618066f` (demo removal) changes the booking and listing read paths. The E2E run covers them:
  `booking-accept`, `booking-daily-limit`, `booking-decline-reason`, `booking-reschedule-paid`, `queue`,
  `queue-console`, `bulk-deal` and `request-proposal-agreement` all passed.
- Re-count independently: `grep -rn ": any\|<any>\|as any\|any\[\]\|(any" src --include=*.ts --include=*.tsx | grep -v "\.test\.\|database.types" | wc -l`
