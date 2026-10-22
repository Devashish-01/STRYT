# STRYT — Manual Test Plan

**Version under test:** 1.0.0 (created) · current `package.json` is 1.0.45 as
of the 3 Sep 2026 addendum below — still nothing here has been run on a
device, this plan just grew alongside the code
**Created:** 2026-08-03
**Purpose:** the pre-launch device pass. Nothing in this app has been run on a
phone; every fix from this cycle is verified only by typecheck, lint, 127 unit
tests and a clean build.

**3 Sep 2026 addendum:** a full-coverage bug-hunt pass re-verified every named
issue in the older audit docs against current code and fixed what was still
real (walletService silent write failures, a missing guest-guard on
CommunityCard's Share button, two compose entry points skipping the
requireAuth() toast, a daily-appointment-limit race). See §1.11 below for the
device checks those specific fixes need, and note that §3.2/§3.14 predate this
session's full rewrite of Explore and Community — read their addenda too.

**Later 3 Sep 2026 addendum:** the business bulk-buying campaign model was
rebuilt this session (pledge + deposit + business-side close/fulfil/refund,
replacing the old instant-order deal) — this predates and supersedes §3/14 and
§4/9's descriptions of "bulk deals". Zero device or live-DB testing yet. Full
step-by-step scripts now live in [`workflows/`](workflows/00_INDEX.md) —
start with `workflows/06_customer_bulk_buying_campaigns.md` and
`workflows/16_business_bulk_buying_campaigns.md`, and see
`workflows/23_cross_cutting_regression_risks.md` item 10. That folder also
has a literal step-by-step script for every row in §2–§9 below — use it to
*execute* this table, not just to track it.

---

## How to use this

- **P0** — a launch blocker. Ship nothing if one fails.
- **P1** — fix before launch unless you consciously accept it.
- **P2** — log it, ship, fix after.
- Mark each ✅ / ❌ / N/A. A ❌ needs the **exact steps**, a screenshot, and the
  device model — "the map is broken" costs a whole debugging round trip.

**Run §1 first.** It's the regression pass over everything changed this cycle,
and it's where breakage is most likely. §2–§9 are the full surface.

> ⏸ **v1.0 STATUS: delivery is deferred.** `DELIVERY_AGENT_ENABLED` is `false`
> for this release — every delivery-specific block below is marked
> `⏸ DEFERRED — skip for v1.0` and kept, not deleted, so this plan is ready to
> reactivate for v1.1. One new v1.0-only check replaces them: confirm
> `/delivery`, the business "Deliveries" tab, and "my-deliveries" all redirect
> away instead of opening.

### Test accounts to prepare

| # | Account | Purpose |
|---|---------|---------|
| A1 | Fresh phone number, never used | Sign-up, name/alias, first-run states |
| A2 | Business owner (owns 1 shop) | Console, settings, delete |
| A3 | Team member (SCOPED, appointments only) | **Privilege escalation regression** |
| A4 | ⏸ DEFERRED for v1.0 — Delivery agent (delivery scope) | Runs, duty, cancel |
| A5 | Provider | Provider console |
| A6 | Customer with bookings + history | Customer flows |
| A7 | Admin | Admin panel |

### Devices

Minimum: **one Android phone** (real, not emulator) + **one browser at 360px**.
Ideally add a low-end Android (Xiaomi/Oppo/Vivo — these are where battery
managers kill background work) and one desktop width.

---

## §1 — Regression pass: everything changed this cycle

> If your time is limited, this section is the one that matters.

### 1.1 Team access privilege escalation `P0`

The original bug only appeared on the **second** page load. Same-session testing
will not catch a regression here.

| # | Step | Expected |
|---|------|----------|
| 1 | As **A2**, grant **A3** SCOPED access — appointments only | Grant succeeds |
| 2 | As **A3**, switch into that business | Console opens |
| 3 | **Fully close and reopen the app. Then reload again.** | Still scoped |
| 4 | Check the console nav | Only Appointments. No Settings/Payments/Verification |
| 5 | Type `/business/<id>/manage/settings` directly into the URL | **Bounced** to console root with a toast |
| 6 | Same for `/manage/payments`, `/manage/verify`, `/manage/profile` | All bounced |
| 7 | A3's own Profile page | Shows **no** business as theirs; no "share my business" |
| 8 | A3 → Settings → Security | **No** business-password section |
| 9 | A3 opens the business needing a password | Prompted for the **owner's** password, not bypassed |
| 10 | A3 taps "forgot business password" | **Not offered** |
| 11 | As A2, revoke A3 | A3 is bounced to /home within seconds, no reload |

### 1.2 Delivery: the cancel path `P0`

> ⏸ DEFERRED — skip for v1.0. `/delivery` redirects to `/home` with the flag
> off; nothing in this table is reachable. Instead, confirm A4 (or any
> account) hitting `/delivery` directly gets bounced to `/home`.

| # | Step | Expected |
|---|------|----------|
| 1 | A4 → `/delivery`, go **on duty** | Battery sheet appears **here** (§1.7) |
| 2 | A2 assigns A4 a single delivery | Appears under Assigned |
| 3 | Advance: Start → En route → Arrived | Stepper tracks |
| 4 | Enter a **wrong** handoff code 5× | Locks out with a clear message, not a silent fail |
| 5 | Enter the correct code | Delivered |
| 6 | New delivery → tap **"Can't deliver?"** | Sheet opens naming the order + customer |
| 7 | Try to confirm without a reason | Blocked — "Pick a reason first" |
| 8 | Pick "Something else", leave note empty | Confirm stays disabled |
| 9 | Pick a reason, tap destructive once | **Arms** ("Tap again"), does not fire |
| 10 | Wait ~4s without tapping | **Disarms** |
| 11 | Arm and confirm | Toast names the business; stop disappears |
| 12 | Now toggle **off duty** | **Works** — this is the whole point of the fix |
| 13 | A2's deliveries board | Shows the cancellation; can reassign |
| 14 | Customer's appointment | Still exists — history not destroyed |
| 15 | Double-tap confirm quickly | Exactly **one** cancel |

### 1.3 Delivery: runs, position, multi-run `P1`

> ⏸ DEFERRED — skip for v1.0, same reason as §1.2.

| # | Step | Expected |
|---|------|----------|
| 1 | A2 assigns a **batch** of 3 | Fullscreen "New delivery run" gate |
| 2 | A2 assigns a **second** batch while the first is pending | Gate shows **"Run 1 of 2"** |
| 3 | Solo delivery also assigned | Footer notes "N single deliveries also waiting" |
| 4 | Decline once | Arms; second tap declines; next run slides in |
| 5 | Accept a run | Stops ordered nearest-first |
| 6 | Advance the first stop off Assigned | Owner board shows run as **IN_PROGRESS** |
| 7 | Walk/drive 200m mid-run | Owner board dot **moves** |
| 8 | Reach ARRIVED, keep moving | Dot **still moves**, status stays ARRIVED (does not fall back to En route) |
| 9 | Two accepted runs at once | **Both** report position |
| 10 | Background the app 10 min mid-run | Location still posting; FGS notification visible throughout |
| 11 | Cancel the last live stop of a run | Run closes as Completed |

### 1.4 The email-as-name leak `P0`

| # | Step | Expected |
|---|------|----------|
| 1 | Sign up **A1** with an **email** | — |
| 2 | Home greeting | Alias or "Neighbor" — **never** the email address |
| 3 | A1's public profile (`/u/<id>`) as another user | No email shown as a name |
| 4 | A1 posts to community; A1 leaves a review | Author name is not an email |
| 5 | A1 books; owner opens the booking | Customer name is not an email |
| 6 | Existing accounts (8 were backfilled) | None display an email anywhere |

### 1.5 Live location explainer `P0`

| # | Step | Expected |
|---|------|----------|
| 1 | Fresh install, tap **My People** on Home | **Explainer sheet** — who sees it, how to stop |
| 2 | Tap "Not now" | Nothing starts. No sharing |
| 3 | Tap My People again | Explainer shows **again** (dismissing ≠ consent) |
| 4 | Tap "Start sharing" | Android disclosure → permission → sharing starts, dot pulses |
| 5 | Tap My People again | Stops **immediately** — no explainer, no confirm |
| 6 | Tap again to start | Starts directly — explainer does **not** return |
| 7 | Long-press My People | Opens the hub, does **not** toggle |

### 1.6 Business soft-delete `P1`

| # | Step | Expected |
|---|------|----------|
| 1 | A2 with an upcoming ACCEPTED booking → Settings → Delete | Refused, naming the booking count |
| 2 | Cancel that booking, retry | Sheet opens |
| 3 | Type anything but DELETE | Confirm disabled |
| 4 | Type DELETE, confirm | Deleted; returned to customer home |
| 5 | Search / map / explore | Business **gone** |
| 6 | A2's switcher and profile | Business gone |
| 7 | Team member who had access | Access revoked; bounced |
| 8 | Customer's past booking with that shop | **Still visible** — history intact |

### 1.7 Battery prompt re-scoping `P0` (Play risk)

> ⏸ DEFERRED — skip for v1.0. The prompt's only call site is delivery's
> on-duty toggle, which is unreachable, and the permission itself is
> commented out of `AndroidManifest.xml`. Replace with one check: as a plain
> customer, use the app fully — the battery sheet never appears (this is now
> trivially true, since nothing left can trigger it, but worth confirming
> nothing else references the event by mistake).

| # | Step | Expected |
|---|------|----------|
| 1 | Fresh install as a **plain customer**, accept notifications, use the app | Battery sheet **never appears** |
| 2 | As A4, go **on duty** | Sheet appears, headed "Keep your run tracking" |
| 3 | Copy | Talks about deliveries — **not** notifications |
| 4 | Dismiss, go off then on duty again | Does **not** nag again |
| 5 | Different agent, same device | Asked once (per-agent) |

### 1.8 Map `P1`

| # | Step | Expected |
|---|------|----------|
| 1 | Open Map on a good connection | Mapbox tiles, no lurch/jump after first paint |
| 2 | Throttle to slow 3G, reopen | Falls back to free map within ~30s; never a stuck spinner |
| 3 | Pan/pinch | Smooth, inertial, **stays north-up** (no accidental rotation) |
| 4 | Drag from the map edge | Page does **not** scroll or pull-to-refresh behind it |
| 5 | Tap a pin one-handed, several times | Reliably hits (44pt target) |
| 6 | Open a pin popup, toggle that layer **off** | Popup **closes** — no orphan popup |
| 7 | Open popup, change radius so it drops out | Popup closes |
| 8 | Long-press the map | Opens pin-drop confirm — does **not** silently change your location |
| 9 | Long-press then drag | Treated as a pan, no pin-drop |
| 10 | Leave map, return via tab | No white flash / full re-init |
| 11 | Story avatars on map | Render; broken images hide cleanly |

### 1.9 Feedback-batch spot checks `P2`

| # | Check | Expected |
|---|-------|----------|
| 1 | Profile → tap your name/handle | Does **nothing** (no jump to Edit) |
| 2 | Profile → Edit profile button | Works |
| 3 | Profile, no business yet | Two CTAs: "Create a business" and "Become a provider" |
| 4 | Bottom nav | All 5 tabs look pressable; active tab has a pill; press state visible |
| 5 | Account switcher rows | "Add a business" etc. look like buttons |
| 6 | My Lists with zero lists | Illustration + "Create your first list" (not blank) |
| 7 | Open an empty list | Illustration + "Explore nearby" |
| 8 | Appointments page | "+" in the header; empty state has "Find a place to book" |
| 9 | Salon/gym/chemist profile | Tab reads **Services**/**Products** — not "Menu" |
| 10 | Restaurant profile | Reads **Menu** |
| 11 | Business Store hub | Reads "Inventory" |
| 12 | Business setup → Hours step | Same card + heading as Settings → Hours |
| 13 | Business setup → Opening date | Native **date picker**, no free typing |
| 14 | Business setup | **No** "Import from Google Maps" |

### 1.10 Deploy / update pipeline `P0`

| # | Step | Expected |
|---|------|----------|
| 1 | Open the web app, leave it open | — |
| 2 | Deploy a visible change to Vercel | — |
| 3 | Wait ≤1h, or background/foreground the app | Page **reloads itself** onto the new build |
| 4 | Hard-close and reopen | New version — no manual refresh, no old build |
| 5 | Repeat once more | Still updates (proves it isn't a one-off) |
| 6 | DevTools → Application → Service Workers | No worker stuck in **"waiting"** |
| 7 | Console on every main screen | **No CSP violations** ← the change I could not test |
| 8 | Map + location naming specifically | Tiles load, area names resolve (CSP `connect-src`) |
| 9 | Airplane mode, reopen | Offline shell renders, doesn't hang |

> If §1.10/7 shows CSP errors, revert `Content-Security-Policy` →
> `Content-Security-Policy-Report-Only` in `vercel.json`. One-word fix.

### 1.11 Pre-Play-Store bug-hunt spot checks (added 3 Sep 2026) `P1`

Everything below was confirmed correct or fixed by re-reading current code
against a batch of older audit docs (`STRYT_AUDIT_REQUESTS_APPOINTMENTS.md`,
`GOAL_LIVE_AUDIT.md`, `GUEST_MODE_PLAN.md`) — code-level confirmation, not a
device confirmation. Cheap to verify live; do it once rather than trust the
read.

| # | Step | Expected |
|---|------|----------|
| 1 | As a **guest** (signed out), open a community post card | Share button is **hidden** — was previously showing for guests, unlike every other Share button in the app (fixed this pass) |
| 2 | As a guest, tap Community's header **+** and Explore → Requests tab's **"Ask"** button | Both now show **"Sign in to..."** + land back here after sign-in, instead of a silent bounce |
| 3 | Save a coupon / add a loyalty stamp with the device in **airplane mode** | A visible "Couldn't update — try again" toast, and the optimistic UI (saved state / stamp count) **reverts** — previously a failed write silently reported success (fixed this pass) |
| 4 | Tap-like a community post several times quickly | Never visually flickers/reverts after settling |
| 5 | Send yourself a message, read it, go back to the conversation list | Shows **read**, not stuck unread; open a conversation on **business** and **provider** hats — unread counts don't bleed into each other or into the customer badge |
| 6 | Negotiate a proposal to a counter-offer, accept the **counter** (not the original) | Agreement is created at the **countered price**, not the original ask |
| 7 | **Requires migration `20260897` applied first** (see below) — try to book a 6th appointment for the same customer on the same day, ideally from two devices/tabs at once | Server rejects the 6th with the daily-limit message; two near-simultaneous attempts can't both slip past the count |

**Before running #7:** confirm `supabase/migrations/20260897_daily_limit_advisory_lock.sql`
has actually been applied to the live database — a migration file existing in
the repo is not proof it ran (`CODEBASE_MAP.md` §12 has the standing warning
on this; two earlier migrations in this project sat committed and unapplied
long enough to break production before anyone noticed).

---

## §2 — Auth & onboarding

| # | Flow | P |
|---|------|---|
| 1 | Phone sign-up → OTP → onboarding → terms | P0 |
| 2 | Wrong OTP, expired OTP, resend | P0 |
| 3 | Google sign-in | P0 |
| 4 | Terms gate — cannot skip past `/auth/terms` | P0 |
| 5 | Location permission: allow / deny / "only while using" | P0 |
| 6 | Guest browsing without an account | P1 |
| 7 | Guest hits a sign-in wall (book/deal/ask) | P1 |
| 8 | Sign out → sign back in; no stale data from the previous account | P0 |
| 9 | Two accounts in sequence on one device | P1 |
| 10 | Account deletion → `/auth/deletion-pending` | P1 |

## §3 — Customer

| # | Flow | P |
|---|------|---|
| 1 | Home launchpad — every tile navigates | P0 |
| 2 | Explore: filters, sort, categories, infinite scroll — **this screen was fully restructured 2 Sep 2026**: category + radius are now a single universal filter shown above the tabs (not per-tab), and there's a 4th tab, "Requests" (folded in from the retired standalone `/requests` screen), with its own Nearby/Mine split and urgent/group/recurring filters. Cover all four tabs, not just Business/Provider/All | P1 |
| 3 | Search: shops, providers, empty results | P1 |
| 4 | Business detail: tabs, photos, reviews, share | P0 |
| 5 | **Book an appointment** end to end | P0 |
| 6 | ⏸ DEFERRED for v1.0 — Booking with delivery: address required, ETA shown | P0 |
| 7 | Out-of-service-area booking | P1 |
| 8 | Reschedule / cancel a booking | P0 |
| 9 | Payment: UPI deep link, mark paid, status | P0 |
| 10 | Join a queue, live position, leave | P1 |
| 11 | Post a request (`/ask`), receive a proposal, accept | P1 |
| 12 | Agreement lifecycle → rate | P1 |
| 13 | Chat: send, receive, unread badge | P1 |
| 14 | Community: post, comment, story create + view — **this screen was fully redesigned in late Aug/early Sep 2026**: the header/theme changed from a scoped pink accent back to the app's standard purple, the Requests tab was removed from Community entirely (moved to Explore, see §3/2), group buys and business bulk deals now render inline in the main feed with real join/order actions, and there's a new `/community/activity` screen for claim passes + joined pools. Cover the full new surface, not just the pre-redesign basics | P2 |
| 15 | Bookmarks, follows, lists | P2 |
| 16 | Notifications: receive, tap → correct deep link | P0 |
| 17 | Track link `/track/:token` | P1 |

## §4 — Business owner

| # | Flow | P |
|---|------|---|
| 1 | Business onboarding, all 4 steps | P0 |
| 2 | Submitted → admin review → approved → live | P0 |
| 3 | **Verify the review screen shows what was submitted** (feedback #9) | P0 |
| 4 | Dashboard, hub, nav | P1 |
| 5 | Catalog: add/edit/delete, photos, veg flag, price | P0 |
| 6 | Inventory: flags, restock | P1 |
| 7 | Queue: call next, serve, walk-in, close | P1 |
| 8 | Appointments: accept, reject, complete, no-show, walk-in | P0 |
| 9 | ⏸ DEFERRED for v1.0 — Deliveries board: assign, reassign, cancel, follow | P0 |
| 10 | Leads/Q&A/requests: respond, quote | P1 |
| 11 | Hours + special/holiday hours | P0 |
| 12 | Profile editor, portfolio, broadcast radius | P1 |
| 13 | Payments: UPI id, QR, timing, deposit | P0 |
| 14 | Verification: upload docs, status | P0 |
| 15 | Settings: capacity, delivery toggle, privacy toggles | P1 |
| 16 | Team & access: grant, edit scopes, revoke | P0 |
| 17 | Location change request → admin approval | P1 |

## §5 — Provider

| # | Flow | P |
|---|------|---|
| 1 | Provider onboarding | P0 |
| 2 | Console: jobs, availability, catalog, portfolio | P1 |
| 3 | Find work, submit proposal | P1 |
| 4 | Money / payments | P0 |
| 5 | Provider verification | P1 |
| 6 | Accepting-appointments toggle | P1 |

## §6 — Admin

| # | Flow | P |
|---|------|---|
| 1 | Admin login | P0 |
| 2 | Verification queue: approve / reject / suspend with reason | P0 |
| 3 | Business approval queue | P0 |
| 4 | Location-change approvals | P1 |
| 5 | Disputes, appeals, reports, bugs | P1 |
| 6 | Profile controls / account deletion | P1 |
| 7 | **Non-admin cannot reach `/admin`** | P0 |

## §7 — Roles & switching

| # | Check | P |
|---|-------|---|
| 1 | Switch customer ↔ business ↔ provider | P0 |
| 2 | Password/PIN gate on entering a console | P0 |
| 3 | Wrong password, then recovery (owner only) | P0 |
| 4 | Correct context "home" per hat | P1 |
| 5 | Deep link while in the wrong hat | P1 |
| 6 | ⏸ DEFERRED for v1.0 — Delivery hat appears with a standing `delivery` grant, **no active job** | P1 |
| 7 | Delivery hat does **not** appear anywhere (role switcher, account sheet), even for an account holding a `delivery` grant | P0 |

## §8 — Cross-cutting

| # | Check | P |
|---|-------|---|
| 1 | **360px width** — no horizontal scroll on any screen | P0 |
| 2 | 390 / 414 / tablet / desktop | P1 |
| 3 | Landscape | P2 |
| 4 | Bottom nav never covers content (scroll to the end of long pages) | P0 |
| 5 | Safe areas — notch and gesture bar | P0 |
| 6 | Back button / gesture from every screen | P0 |
| 7 | Deep links cold-start the app to the right screen | P0 |
| 8 | Push: foreground, background, app-killed | P0 |
| 9 | Push tap → correct screen | P0 |
| 10 | Offline: banner, retry, no white screen | P1 |
| 11 | Slow 3G on the heaviest screens | P1 |
| 12 | Rotate / resize mid-flow | P2 |
| 13 | Dark mode, if supported | P2 |
| 14 | Font scaling at 150% | P2 |
| 15 | Long names, emoji, RTL-ish input don't break layout | P2 |
| 16 | Language switching | P2 |

## §9 — Android specific

| # | Check | P |
|---|-------|---|
| 1 | Install release AAB/APK on a clean device | P0 |
| 2 | Cold start time; no white flash | P1 |
| 3 | All permission prompts appear in context, with disclosure first | P0 |
| 4 | **Deny** each permission — app degrades, does not crash | P0 |
| 5 | Revoke permissions in OS settings while running | P1 |
| 6 | Background 30 min, return | P1 |
| 7 | Low-end device (Xiaomi/Oppo/Vivo): FGS survives | P0 |
| 8 | OTA: publish a bundle, background the app, reopen | P1 |
| 9 | OTA rollback safety — app still boots after a bad bundle | P0 |
| 10 | APK upgrade over an older install keeps you signed in | P0 |
| 11 | No SW registered inside the WebView | P1 |

---

## Sign-off

| Section | Owner | Date | Result |
|---------|-------|------|--------|
| §1 Regression | | | |
| §2 Auth | | | |
| §3 Customer | | | |
| §4 Business | | | |
| §5 Provider | | | |
| §6 Admin | | | |
| §7 Roles | | | |
| §8 Cross-cutting | | | |
| §9 Android | | | |

**Do not upload to Play with any P0 open.**

### Known-unreproducible

Feedback **#9** (submitted data on the admin review screen) has never been
reproduced — there were 0 pending submissions in the database. §4/3 is the step
that will finally exercise it. If it misbehaves, capture the submitted values
and what the review screen shows, side by side.
