# Feedback Batch — 17 Items

**Created:** 2026-08-02
**Source:** user feedback, 12:42am–1:13am
**Status: EXECUTED 2026-08-02.** 16 of 17 done. #9 is blocked on a reproduction
(see §5) and #17 is partially done — the two global defects found are fixed, a
full per-screen enumeration still needs device testing.

## Executed — outcomes

| # | Outcome |
|---|---------|
| 1 | Two named CTAs ("Create a business" / "Become a provider") replace one generic "Start selling" card |
| 2 | Identity block is no longer a button; the pencil affordance is gone. Edit has its own button |
| 3 | `.action-row` — surface, border, press state on the switcher's action rows |
| 4 | `.nav-item` — 44pt min target, active pill, pressed state, **all five tabs** |
| 5 | **Soft-delete** via `delete_business` (20260877) + typed-confirmation sheet |
| 6 | `isEmailName`/`isUnusableName` guard + `greetingName` + seeding fix + backfill (20260876) |
| 7 | `LiveShareExplainer` on first share; stopping stays ungated |
| 8 | Real `<input type="date">` with min/max bounds |
| 9 | **Blocked** — no reproduction exists; both mechanical causes eliminated |
| 10 | `catalogLabel()` — Menu / Services / Products / Catalogue, matched on category |
| 11 | Import card removed; `mapBusinessSearch` + 2 orphaned helpers deleted |
| 12 | **Confirmed already done** — both flows share `WeeklyHoursEditor` |
| 13 | Nav entries renamed to "Inventory" (screen keeps its honest "alerts" title) |
| 14 | "+" in the AppBar and an empty-state CTA, both → Explore |
| 15 | Illustration + CTA for both empty states — the zero-lists case had none at all |
| 16 | 44pt pin hit area; popup now resolves against live data instead of a snapshot |
| 17 | `overflow-x: clip` on html/body; `#root` uses dvh. Full audit still outstanding |

**Migrations:** `20260876` (name seeding + backfill), `20260877` (+ enum value,
+ a follow-up fixing the live-status guard). All applied and verified.

**Verification:** `tsc` clean · `eslint` 0 errors · **127/127 tests** (59 new)
· production build clean · `delete_business` verified 8/8 against the live DB in
a rolled-back transaction.

---

## Deploy staleness — separate bug, found while fixing the above

**Reported:** "sometimes when person opens this app I got old version, and OTA
is not completely updating the app."

**Root cause (web/PWA):** a documented `vite-plugin-pwa` trap. With
`strategies: "generateSW"` the plugin injects `skipWaiting`/`clientsClaim` for
you. This project uses `injectManifest` (so one SW owns both caching and push),
which injects **nothing** — they must be hand-written, and weren't. Compounding
it, `registerType: "autoUpdate"` never fires `onNeedRefresh`, so
`ServiceWorkerUpdater`'s `updateSW(true)` never ran, and nothing in the app ever
posted the `SKIP_WAITING` message `sw.js` was listening for.

Every deploy therefore installed a service worker that sat in `waiting`
**forever**. The old worker kept serving the old bundle until the user closed
every tab or fully killed the PWA — on a phone, close to never.

**Fixed:**

| Where | Change |
|-------|--------|
| `src/sw.js` | `self.skipWaiting()` + `clientsClaim()` at top level; `cleanupOutdatedCaches()` |
| `src/sw.js` | offline fallback used `caches.match("/index.html")`, which misses Workbox's revisioned precache key — now `{ ignoreSearch: true }` |
| `ServiceWorkerUpdater.tsx` | reload once on `controllerchange` (guarded against loops), hourly `registration.update()` poll, plus a check on `visibilitychange` |
| `vercel.json` | `index.html` + `/` + manifest → `max-age=0, must-revalidate`; `/assets/*` → `immutable`. A cached HTML shell pins the browser to a previous deploy's hashed JS regardless of the SW |

Verified in the built `dist/sw.js`: `self.skipWaiting()`, `clients.claim()`,
`cleanupOutdatedCaches()` and the `ignoreSearch` fallback are all present.

**Native OTA is a different mechanism and is NOT broken.**
`@capgo/capacitor-updater` is set to `autoUpdate: 'atBackground'`, which by
design downloads in the background and applies the new bundle when the app is
**backgrounded** — so the update lands on the *next* launch. "Opened it and
still saw the old version once" is the configured behaviour, not a fault. If you
want it to apply sooner, that's a config change (`directUpdate`), not a bug fix
— flagged rather than changed, since it alters launch behaviour for every user.

**Also fixed in passing:** a stray `}` in `src/index.css` (pre-existing, at the
end of `@keyframes pulse-live`) left the stylesheet brace-unbalanced and
produced a `css-syntax-error` warning on every build.

---

### Three things execution changed

1. **#6 was worse than diagnosed.** The seeding line writes *phone or email* —
   the phone half is why `isPhoneName` already existed. Same bug, second
   channel, never guarded. Backfill dry-run first: 8 rows, all `name = email`,
   all with an alias, 2 real names correctly untouched.
2. **#5 shipped with a real bug that only verification caught.** The guard used
   `status in ('PENDING','CONFIRMED')` — but `appointments_status_check` has no
   `CONFIRMED`; the live value is `ACCEPTED`. It matched nothing, so an owner
   could have deleted a shop with accepted bookings on the calendar. Fixed and
   re-verified.
3. **#1 and #3 turned out to be the same screen.** "Add a business" and "Become
   a provider" already existed as unstyled rows in the account switcher — the
   reason nobody could find them.

> Every item below was checked against the actual code and, where relevant, the
> live database before being planned. **Nine of the seventeen are not what the
> ticket says they are** — §1 is the important section.

---

## 1. Audit — what's actually true

| # | Ticket says | What the code/data says | Effect on plan |
|---|-------------|--------------------------|----------------|
| 1 | No way to create a business/provider | **Exists, buried.** `Profile.tsx:337,504` routes to `/onboard/business` and `/onboard/provider` from the role-switcher; Home has a "List your spot" CTA (`Home.tsx:505`) | Discoverability, not a new feature |
| 2 | Username tap redirects to edit | **Confirmed.** `Profile.tsx:165` wraps the whole identity block in a button → `/profile/edit`. A separate Edit button already exists at `:232` | Trivial — delete one handler |
| 3 | "Manage All" doesn't look tappable | Styling only | As stated |
| 4 | Profile footer tab not pressable | **Not profile-specific.** All five tabs share `nav-item`/`active` (`BottomNav.tsx:46,55,76,87`) | Fix all tabs, or it'll look inconsistent |
| 5 | No delete business | **Confirmed absent** — zero matches app-wide | **Hidden DB scope** — see §4 |
| 6 | Home shows email not username | **Data bug, not a UI bug.** `firstName()` guards phone numbers but not emails (`publicName.ts:9`). Live DB: **8 of 10 users have `name` exactly equal to `email`** | Affects *every* screen. See §3 |
| 7 | "Street Safe" needs explaining | **No such button.** It's `MyPeopleToggle` on Home — one tap **starts broadcasting live location** ("no confirmation sheet — press and go", `MyPeopleToggle.tsx:12`) | Privacy UX issue, not a copy tweak. See §3 |
| 8 | Opening date needs a date picker | **Confirmed.** Plain text input, placeholder `"e.g. 30 May 2026"` (`BusinessOnboard.tsx:366`) → real `date` column | Confirmed; likely feeds #9 |
| 9 | Submitted review data wrong | **Cannot reproduce.** Live: 0 businesses pending, 0 with documents | Needs a repro before a fix. See §5 |
| 10 | Category-wise templates | Largest item | **Scoped to labels only** (your call) |
| 11 | Remove Google Maps import | **Confirmed present** (`BusinessOnboard.tsx:148–218` + `lib/mapBusinessSearch.ts`) | As stated |
| 12 | Hours UI differs creation vs settings | **Already done.** Both `BusinessOnboard.tsx:10` and `HoursEditor.tsx:10,116` use the same `WeeklyHoursEditor` | Verify what you saw; likely no work |
| 13 | Rename "Inventory Alert" | 4 call sites | **Rename changes meaning** — see §4 |
| 14 | No "Add appointment" CTA | Needs confirming on-screen | As stated |
| 15 | My List empty looks blank | **Empty state exists** (`Lists.tsx:46`, 📂) | Upgrade, not add |
| 16 | Map page fix | Basemap reworked earlier this session | **Scoped to markers/pins** (your call) |
| 17 | Not responsive on web/mobile | Vague, app-wide | Audit before coding. See §5 |

**Net:** 2 items are already done or nearly so (#12, partly #1 and #15), 2 were
materially mis-diagnosed (#6, #7), 1 can't be reproduced (#9), and 1 hides real
database design work (#5).

---

## 2. Decisions taken

| # | Question | Decision |
|---|----------|----------|
| D1 | #16 scope | **Markers/pins only.** Basemap treated as done pending your device test. |
| D2 | #7 | It's the live-location share control on Home. |
| D3 | #10 depth | **Labels only** — one category→label lookup, no layout branching. |

---

## 3. The two that were mis-diagnosed

### #6 — the email-as-name bug is data, and it's everywhere

The ticket says "update the home screen header component". That would fix one
line of one screen and leave the bug live everywhere else.

What's actually happening: `users.name` is being **seeded from the email
address**, and 8 of the 10 current accounts are in that state.
`firstName()`/`displayName()` in `publicName.ts` already defend against a raw
phone number leaking into the UI — the same guard was never written for emails.
So every surface that renders a name (Home greeting, public profile, reviews,
chat, team lists, delivery cards) can show someone's email address.

That last part is the reason this is more than cosmetic: **an email address
rendered as a display name is a PII leak to strangers**, not just an ugly
greeting.

Three-part fix, in order:

1. **Guard** — extend `looksLikePhone` into a `looksLikeContact` check covering
   emails, and fall back to `alias` (populated for 10/10 users) then the
   friendly default. One change, fixes every screen at once.
2. **Seeding** — stop `handle_new_auth_user` writing the email into `name`.
3. **Backfill** — migration to null out `name` where it equals `email`, so the
   guard has something better to fall back to.

Do (1) first: it stops the leak immediately and is independently revertible.

### #7 — one tap broadcasts your live location

`MyPeopleToggle` on Home starts sharing live location with emergency contacts on
a single tap. Its own comment says *"no confirmation sheet — press and go."*

There **is** a disclosure in the path (`ensureBackgroundDisclosure()` in
`useLiveShare.tsx:95`) — but that's the Android background-location **permissions**
notice, required for Play Store. It explains a permission, not the feature, and
it's suppressed after the first accept. So a customer who taps this has no
in-app answer to "what did I just turn on, and who can see me?"

Fix: an explainer sheet on first use — what it shares, who receives it, how to
stop it — then share. Remembered per user, so it doesn't nag. Reuse the existing
`BackgroundLocationDisclosure` pattern rather than inventing a second one.
Long-press (opens the hub) is unchanged.

---

## 4. Items with more scope than they look

### #5 — Delete business needs a policy decision before any code

A business is referenced by appointments, deliveries, catalogue items, queue
tokens, reviews, access grants, and more — most with `on delete cascade`.
A hard delete would silently destroy other people's booking and payment history.

**Recommendation: soft-delete.** Set a `deleted_at`, hide it from discovery and
the owner's switcher, keep history intact, and let support hard-delete later.
That needs a migration, an RPC (owner-only, password-gated like other
destructive account actions), RLS/discovery filtering, and a confirmation flow.

**This is not a "button" — it's the largest item in the batch after #17.**
Flagging it now so it isn't costed as a UI task.

### #13 — the rename changes what the screen promises

"Inventory **alerts**" is a list of flagged/low-stock items. "Inventory
**management**" implies editing stock levels. If the screen doesn't gain editing,
the new name over-promises and generates its own complaints.

Two honest options: rename and add basic stock editing, or rename the *entry
point* only and keep the screen honest. I'd default to renaming the nav entry to
"Inventory" and leaving the screen "Inventory alerts" — but say the word if you
want the full CRUD.

Call sites: `BusinessStoreHub.tsx:25`, `InventoryAlerts.tsx:29,35,65`,
`ProviderProfileHub.tsx:111`.

---

## 5. Items that can't start yet

### #9 — no reproduction

Live data: **0 businesses pending review, 0 with verification documents.** The
admin queue is empty, so there is nothing to render incorrectly right now. The
path runs through the `verification-review` edge function
(`adminService.ts:527`), not a plain table read, so "data not showing correct"
could be the function's projection, the submit payload, or the status screen.

**Strong candidate: #8.** A free-text opening date being written to a real `date`
column is exactly the kind of thing that silently drops or mangles a field.
Fixing #8 first may resolve #9 outright.

Plan: fix #8, then submit one test business end-to-end and watch what the admin
panel receives. If it's still wrong, I'll have a real repro to debug.

### #17 — needs an audit, not a guess

"All the pages are not opening according to the phone" is app-wide and
unspecific. Blind global CSS changes to a live app is how you break twenty
working screens to fix three.

Plan: audit first — enumerate screens at 360/390/414px and a desktop width,
capture which actually break and how (horizontal overflow, fixed widths, unclamped
`vh`, unbounded content on desktop). That produces a concrete list to fix. There
is already a Playwright setup (`npm run audit`, mobile + desktop projects) that
can drive this rather than doing it by hand.

---

## 6. Sequencing

Grouped so each batch is independently shippable and reviewable.

### Batch A — leaks and one-liners *(highest value per unit of risk)*
| # | Item |
|---|------|
| 6 | Name guard (stops the PII leak) — then seeding, then backfill |
| 7 | Live-location explainer on first share |
| 2 | Remove the username tap-through |
| 11 | Remove Google Maps import |
| 8 | Date picker with min/max on opening date |

### Batch B — affordances and copy *(pure UI, no data risk)*
| # | Item |
|---|------|
| 3 | "Manage All" + sub-button affordance |
| 4 | Bottom nav pressability — **all five tabs** |
| 15 | Upgrade the My List empty state |
| 13 | Inventory rename (per §4 decision) |
| 14 | "Book appointment" CTA |
| 1 | Surface Create Business / Become Provider on Profile |

### Batch C — the map
| # | Item |
|---|------|
| 16 | Marker/pin audit: load, re-render churn, anchors, tap targets, layer toggles |

### Batch D — business profile
| # | Item |
|---|------|
| 10 | Category→label lookup (labels only) |
| 9 | Re-test admin review after #8; debug with a real repro |
| 12 | Confirm with you — believed already done |

### Batch E — the big two
| # | Item |
|---|------|
| 5 | Soft-delete business: migration + RPC + guard + confirm flow |
| 17 | Responsive audit → fix list → fix |

---

## 7. Verification

Same bar as the delivery work, which caught two real defects that reading alone
missed:

- `npx tsc --noEmit` + `npx eslint` clean on changed files.
- `npx vitest run` green — **repeat runs**, the suite has property tests that
  draw a fresh seed each run.
- Any migration applied via `mcp__supabase__apply_migration`, then **re-read from
  the live schema** — a migration file existing is not proof it was applied.
- #6 specifically: assert against live data that no user renders as an email,
  and add a unit test for the guard.
- #5: exercise the soft-delete and its RLS/discovery filtering inside a
  rolled-back transaction before it goes near real data.
- Device pass at the end for Batches B and C — affordance and marker work cannot
  be validated by typecheck.

---

## 8. Open questions

1. **#12** — both flows already share `WeeklyHoursEditor`. What differed when you
   saw it? (Possibly an older build, or the surrounding labels rather than the
   picker.)
2. **#13** — rename only, or rename plus stock editing? (§4)
3. **#5** — soft-delete confirmed? Hard delete would destroy other users'
   booking history.
4. **#3** — "a button below" the Manage All button: which one? Naming it saves a
   guessing round.
