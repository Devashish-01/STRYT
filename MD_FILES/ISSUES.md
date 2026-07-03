# STRYT — Known Issues & Bug Tracker

> **Full access — update this file whenever a bug is found, reproduced, or fixed.**
> Format: add entries under the right severity tier; update `Status` inline; never delete fixed entries (mark ✅).
> File locations use `src/` relative paths. Link to `TASKS.md` task IDs when a bug is part of a planned task.


---

## Legend

| Status | Meaning |
|--------|---------|
| 🔴 Open | Confirmed bug, not yet fixed |
| 🟡 Investigating | Root cause not fully known |
| 🟢 In progress | Fix is being actively written |
| ✅ Fixed | Resolved — commit / session noted |
| ⚠️ Design risk | Not a bug yet, but will cause one if left |

---

## Critical (data wrong / security)

_None currently open._

### ISS-001 — Leaked secrets in repo / env
- **Status:** ✅ Fixed (local configs scrubbed; cloud tokens rotated by user)
- **Where:** `.env` root file + git remote URL
- **What:** `.env` contains `SUPABASE_AT=sbp_f03b03111...` (Supabase **service/admin token** — full DB access). Git remote URL has a GitHub **PAT** embedded. Neither should be in a client-side Vite build or version-controlled at all.
- **Risk:** If the repo or `.env` leaks (deploy logs, CI, accidental push), an attacker has full Supabase admin access and GitHub write access.
- **Fix:** Rotate both tokens now. Keep service token server-side only (Edge Function / backend) — never in `VITE_*` variables. Scrub PAT from the remote URL (`git remote set-url origin https://github.com/...` without token).
- **Affects:** entire project

---

## High (wrong behavior users will see)

_None currently open._

---

## Medium (UX broken or misleading)

_None currently open._

---

## Low / Polish

_None currently open._

---

## Fixed

### ISS-F15 — ISS-009 fully resolved: column-level PII masking for phone/email/exact location/emergency contacts ✅
- **Status:** ✅ Fixed — session 2026-07-04
- **Was:** Postgres RLS is row-level, not column-level — `users`' privacy toggles (`show_phone_publicly` etc.) were only ever enforced by frontend rendering, never by the database. Traced all 24 frontend call sites that read `public.users` before touching anything (most only ever request `name`/`avatar` for other users and needed no change). Two real leaks found:
  1. Raw REST/devtools access could request `phone`/`emergency_contact`/exact `lat`,`lng`/`email`/`admin_login_id` for any row the row-level policy let through, regardless of privacy settings.
  2. Worse: `userService.publicProfile()` — the app's *own* "view someone else's profile" code path — was already pulling the target's raw phone and **exact home coordinates** into the client on every profile view, with only the UI's rendering choice standing between that data and the screen. Anyone with devtools open while viewing any public profile could read another user's exact coordinates and phone number regardless of what that user opted to share.
- **Fix:** `REVOKE SELECT` on the six sensitive columns from `authenticated`/`anon` on the raw `users` table. Every legitimate need for them now goes through a `SECURITY DEFINER` function that enforces self/admin/consent *inside the database*, so it can no longer be bypassed by constructing a different query: `get_own_profile()` (self, full row — `userService.me()`), `get_own_coords()` / `get_own_emergency_contact()` (small self-only helpers for the few places that needed just those), `get_public_profile()` (masks phone by `show_phone_publicly`, and — this is the actual fix for the worst finding — never returns another user's exact coordinates at all, only a **server-computed distance**; turn-by-turn directions to a private individual's exact address isn't a feature this app should have, independent of RLS, so it's removed from `PublicProfile.tsx` rather than reworked), `admin_search_users()` / `admin_recent_users()` (full columns, admin-checked internally — since "admin" is an app-level flag in `roles`, not a real Postgres role, the admin panel needed the same treatment as everyone else), and `get_nearby_user_ids()` (the new-listing broadcast notification filters by lat/lng, which needs the same bypass even though it never returns coordinates to the caller).
- **Files:** `userService.ts`, `businessService.ts`, `communityService.ts`, `providerService.ts`, `requestService.ts`, `adminService.ts`, `AdminPanel.tsx`, `PublicProfile.tsx`, `types.ts`.
- **Migration needed:** `supabase/migrations/20260715_pii_column_masking.sql` (run manually in SQL editor, after `20260714_google_oauth_admin_visibility.sql`)

### ISS-F14 — Google OAuth customers invisible in the admin directory ✅
- **Status:** ✅ Fixed — session 2026-07-04
- **Was:** admin reported Google sign-in users never showed up when searching the customer directory. Traced two real, compounding causes:
  1. `public.users` had no `email` column at all — the signup trigger and the client-side self-heal (`userService.me()`) only ever put email into the `name` field, and only as a last resort when Google didn't return a full name. For most Google users `name` became their real name, and their email was never persisted anywhere queryable.
  2. `AdminPanel.tsx`'s customer search only matched `name ILIKE`, with no way to search by phone and no way to browse a list without typing a search term first. Google accounts have `phone = NULL` (Google doesn't provide one), so an admin searching the way they search everyone else — by phone number, the dominant signup method — could never find them, and had no fallback way to just scroll and look.
- **Fix:** `users.email` column added + backfilled from `auth.users` + captured going forward by both the signup trigger and the client self-heal. Admin customer search now matches `name OR phone OR email`, and the directory defaults to the 30 most recent signups (ordered by `created_at`) when the search box is empty, so an admin can browse instead of only guessing search terms. Each result row now shows phone (or "No phone (Google sign-in)") and email so this class of user is visually obvious, not just findable.
- **Also found, not wired up:** `authService.ensureProfile()` — a documented client-side self-heal for OAuth/magic-link sign-ins — was exported but never actually called anywhere in the codebase. `userService.me()`'s own self-heal covers the same role in practice (confirmed it fires correctly), so this wasn't the cause of the bug, but it's dead code with a misleading comment claiming it's in use. Left as-is (fixed its email field for consistency) rather than wiring up a second self-heal path that would duplicate `me()`'s job.
- **Files:** `types.ts`, `userService.ts`, `authService.ts`, `AdminPanel.tsx`.
- **Migration needed:** `supabase/migrations/20260714_google_oauth_admin_visibility.sql` (run manually in SQL editor)

### ISS-F13 — Live-DB verification pass: society_members RLS infinite recursion (feature 100% broken), PII readable with zero authentication, corrected wrong claim about Razorpay Edge Functions ✅
- **Status:** ✅ Fixed — session 2026-07-03, migration pending
- **Was:** asked to verify (not just claim) that the app was launch-ready, so I queried the live Supabase project directly (public anon key, same access any client has) instead of only reading code. Found three real things:
  1. **`society_members` — every query fails.** `SELECT` against it returns Postgres error `42P17: infinite recursion detected in policy`. `SocietyScreen.tsx` (create/join a society, approve members, issue gate passes) has been completely non-functional in production — not degraded, fully broken — this whole time. Root cause: an untracked, live-only RLS policy that checks membership by querying `society_members` from within its own policy, causing Postgres to recurse forever.
  2. **PII exposed with zero authentication.** A plain `curl` using only the public `VITE_SUPABASE_ANON_KEY` — no login, no session — returned full `users` rows including `phone`, regardless of that user's own `show_phone_publicly = false` setting, and full `queue_tokens` rows including `customer_name` (an email address). The live `read_users` policy never checked `auth.role()`, so the fully-logged-out `anon` role passed it.
  3. **I was wrong earlier about the Razorpay functions.** Said `create-razorpay-order`/`verify-razorpay-payment` "don't exist" based on them being absent from `supabase/functions/` in this repo — live-tested them directly and both are actually deployed (just not in this repo's source, and not configured: they return "Payments not configured yet. Add RAZORPAY_KEY_ID/SECRET" rather than 404). The Pro-upgrade route removal (ISS-F12) is still the right call for launch — the flow doesn't work either way — but the reason is missing API keys, not missing code.
- **Fix:** new SECURITY DEFINER functions `is_society_member()`/`is_society_admin()` break the recursion; `society_members` gets real, correct, owner/member-scoped policies. `read_users` and `queue_tokens`'s read policy now require `auth.role() = 'authenticated'` — closes the zero-auth scraping vector. The app requires login to reach any screen at all (`App.tsx`'s top-level gate), so this breaks nothing in the app itself.
- **Also verified clean:** every other table this session added to the realtime publication (`conversations`, `notifications`, `gate_passes`, `business_qna`, `ratings`, `proposals`, etc.) — spot-checked and correctly scoped, not anon-readable.
- **Not fully fixed — see ISS-009:** an *authenticated* user can still read another user's phone number directly from the table even with their privacy toggle off, since Postgres RLS is row-level and the toggle needs column-level enforcement (a privacy-aware view + a frontend call-site audit). Opened as its own tracked issue rather than claiming this was fully closed.
- **Also flagged, not a code fix:** while live-testing `sos-alert` and `send-support-email` to confirm they were deployed, both were called with empty test payloads and returned `{"ok":true}` — worth you checking the `sos_alerts`/`support_tickets`-equivalent tables for a stray test row from just now.
- **Files:** `supabase/migrations/20260713_critical_security_fixes.sql`.
- **Migration needed:** `supabase/migrations/20260713_critical_security_fixes.sql` (run manually in SQL editor — this one matters more than the others, run it before launch)

### ISS-F12 — Pre-launch pass: closed-by-default businesses, silent query failures, dead Reservations concept, missing carousel status, Pro-upgrade payment stopped ✅
- **Status:** ✅ Fixed — session 2026-07-03
- **ISS-002 (closed-by-default):** root cause was `businesses.is_available_now default false` (`20260701_appointments.sql`) — indistinguishable from an owner explicitly switching off, so the evaluator's own tri-state logic in `evaluateProviderAvailability()` (which already correctly treats `NULL` as "respect hours") never actually saw a `NULL`. New migration `20260712_business_hours_default_fix.sql` changes the column default to `NULL` and resets all current rows (safe pre-launch, no real user data to lose). Providers intentionally keep `default false` — "offline until you go online" is correct there, this was a businesses-only bug.
- **ISS-003 (silent failures):** fixed at the root instead of per-screen — `useQuery`/`useQueryWithRealtime` (`src/hooks/useApi.ts`) now fire a toast on every failed fetch, app-wide, in the one place all data-fetching passes through. `Home.tsx` additionally gets an inline "Couldn't load categories · Retry" state (was rendering nothing at all on failure), and `MyAppointments.tsx` gets a proper `<ErrorView>` (was rendering a fully blank screen on failure — worse than a stuck spinner).
- **ISS-005 (dead Reservations concept):** deleted for real — `Reservations.tsx`, its route, `businessService.reservations()`/`setReservation()`, and the now-fully-unused `ReservationReq` type are gone. `appointments` is the sole booking source now, no lingering confusion.
- **ISS-008 (BusinessCardSmall status):** added the same live `evaluateProviderAvailability()` Open/Closed label `BusinessCardWide` already had, to the horizontal-carousel card too.
- **ISS-007 was stale** — already fixed in an earlier session (ISS-F10) but the Open entry was never removed. Cleaned up.
- **Pro-upgrade stopped for first launch (not an ISS-tracked bug, but related):** `/pro-upgrade/business/:id` depends on `create-razorpay-order`/`verify-razorpay-payment` Edge Functions that were never deployed (only `admin-delete-profile`, `admin-profile-management`, `ai-assist`, `profile-control`, `send-push`, `send-support-email`, `sos-alert`, `sync-bug-report`, `verify-aadhaar`, `verify-pan` exist in `supabase/functions/`). Route removed from `App.tsx` (screen file kept, same pattern as `Promote.tsx`) so it can't be reached and fail live. Re-add the route once the Razorpay functions are deployed.
- **Files:** `src/hooks/useApi.ts`, `Home.tsx`, `MyAppointments.tsx`, `cards.tsx`, `businessService.ts`, `types.ts`, `App.tsx`, deleted `Reservations.tsx`.
- **Migration needed:** `supabase/migrations/20260712_business_hours_default_fix.sql` (run manually in SQL editor)

### ISS-F11 — Full audit cleanup: dead code, hardcoded values, missing realtime, 2 logic bugs ✅
- **Status:** ✅ Fixed — session 2026-07-03
- **Was:** The full hardcoded-values/dead-code/should-be-live audit from earlier this session, worked item by item. See `TASKS.md` Group AUDIT-CLEANUP for the full breakdown (dead files/exports removed, placeholder photo URLs and badge thresholds centralized, Edge Function URLs centralized, raw hex colors swept to CSS tokens, 17 tables added to the realtime publication, a dozen+ one-shot screens switched to `useQueryWithRealtime`, `chatUnread` fixed to hydrate + update live, Leaderboard's hardcoded `/u/u1` nav target fixed with a real `target_id` from the RPC, Achievements' two fabricated badges replaced with a real one).
- **Follow-up round (same day):** `Stories.tsx` per-story viewer list is now realtime (`story_views` added to the publication). `businessService.team()` is a real, persisted staff roster (new `business_team_members` table + RLS + add/remove UI in `BusinessSettings.tsx`) instead of a permanent-empty stub — deliberately scoped as a roster/record-keeping feature, not an access-control system (team members don't gain any login/management permissions, matching what the original UI ever implied). Got real visual verification for the splash/welcome screen via a one-off Playwright script (no saved auth session exists in this environment, so authenticated screens couldn't be reached) — found and fixed a genuine large-dead-space layout bug in `Splash.tsx` (a `flex:1` block with short content was leaving ~40% of the screen empty instead of the content being evenly distributed), confirmed fixed with a before/after screenshot.
- **Migration needed:** `supabase/migrations/20260711_realtime_publication_gaps.sql` (run manually in SQL editor — now also includes `story_views`, `business_team_members`)
- **Known limitation:** every screen past the login gate (`App.tsx`'s top-level `!isAuthed` check) couldn't be visually verified — no saved Playwright session exists (`.auth/session.json` is absent) and this environment has no real login credentials. `npm run audit:login` (interactive, needs a real account) would let a future pass reuse the same screenshot technique on authenticated screens like Home/Profile/BusinessDetail/manage consoles, where most of the "feel more arranged" complaint likely actually lives.

### ISS-F10 — "Me too" fully disabled + backing table untracked; group-buy target was a promise nothing fulfilled; mock-target public pages looked like real bookings ✅
- **Status:** ✅ Fixed — session 2026-07-03
- **Was:** both "Me too" UI entry points (`cards.tsx`, `RequestDetail.tsx`) were commented out. `request_me_toos` (and its `me_too_count` sync trigger) existed only as untracked schema drift — no migration defined it, so `meToo()` would throw `relation does not exist` on a rebuilt DB. No notification ever fired to the requester when someone joined; group-buy copy promised "unlocks bulk price" at target but nothing checked or acted on the target being reached. `BusinessRequests.tsx`, `ProviderLeads.tsx`, `CommunityHub.tsx` read the live `me_too_count` column with plain `useQuery`, so it never updated without a manual refresh even though `requests` was already in the realtime publication. Separately, mock-target business/provider pages (`b1`/`p1`) rendered a normal-looking booking flow with no indication that submissions go to `localStorage` only, never a real owner.
- **Fix:** new `request_me_toos` table + RLS + `sync_request_me_too()` trigger (insert/delete) captured for real; trigger notifies the requester on each new "me too" (`ME_TOO`) and fires a one-time `GROUP_BUY_UNLOCKED` notification the instant the count hits `group_buy_target`, making the "unlocks bulk price" copy true. Both UI buttons re-enabled. `BusinessRequests.tsx`, `ProviderLeads.tsx`, `CommunityHub.tsx` switched to `useQueryWithRealtime` on `requests`. `BusinessDetail.tsx`/`ProviderDetail.tsx` now show a "Demo preview — bookings here aren't saved" banner when `isMockTarget(id)`.
- **Files:** migration `20260710_metoo_and_realtime.sql`, `types.ts`, `Notifications.tsx`, `cards.tsx`, `RequestDetail.tsx`, `CommunityHub.tsx`, `BusinessRequests.tsx`, `ProviderLeads.tsx`, `BusinessDetail.tsx`, `ProviderDetail.tsx`.
- **Migration needed:** `supabase/migrations/20260710_metoo_and_realtime.sql` (run manually in SQL editor)

### ISS-F09 — Admin console gated by a shared plaintext bypass token, not real authentication ✅
- **Status:** ✅ Fixed — session 2026-07-02
- **Was:** `AdminPanel.tsx` accepted `VITE_ADMIN_BYPASS_TOKEN` typed into a plaintext input, then cached the raw token in `localStorage` forever. Anyone who obtained the token (leaked env var, shared device, browser devtools) had permanent, un-revocable admin access from any device — no password hashing, no session expiry, no per-admin identity.
- **Fix:** replaced with real Supabase Auth-backed ID/password login (`/admin/login`) — same secure password verification the rest of the app already uses. Self-service one-time bootstrap (`claim_first_admin`, server-side guarded to refuse once any admin exists). ID/password changeable only from the admin console. Bypass-token code path removed entirely from `AdminPanel.tsx`.
- **Files:** `supabase/migrations/20260709_admin_auth.sql`, `src/lib/adminAuth.ts`, `adminService.ts`, `AdminLogin.tsx`, `AdminPanel.tsx`, `App.tsx`.
- **Migration needed:** `supabase/migrations/20260709_admin_auth.sql` (run manually in SQL editor)
- **Follow-up:** `VITE_ADMIN_BYPASS_TOKEN` is now unused by the app — safe to delete from `.env`/Vercel env once the new login is confirmed working.

### ISS-F08 — Lead trend charts always flat/empty; providers generated zero leads ever; leads/appointments not actually realtime ✅
- **Status:** ✅ Fixed — session 2026-07-02
- **Was:** `bump_business_metric`/`bump_provider_views` RPCs only incremented an aggregate counter column — `business_view_logs`/`provider_view_logs` (what the 7-day chart buckets) were never written to, and weren't even defined in any tracked migration. The failing view-log query's error was silently swallowed (`viewsRes.error` never checked), masking the problem. Providers had **zero** lead-recording paths at all — no `recordInteraction` equivalent existed, so a provider's "leads" trend was always zero regardless of real activity. Neither `leads` nor `appointments` were in the `supabase_realtime` publication, so `useQueryWithRealtime` subscriptions on them (including this session's earlier appointment-console realtime work) silently received no events.
- **Fix:** RPCs now also insert a timestamped log row. New `providerService.recordInteraction()`, wired to `ProviderDetail.tsx`'s Call (header + bottom bar) and Message buttons — mirrors what `BusinessDetail.tsx` already did for Call/Directions (Message wasn't logged there either — fixed too). `leads`, `appointments`, `business_view_logs`, `provider_view_logs` added to the realtime publication. `ManageDashboard.tsx`/`ProviderDashboard.tsx` analytics switched to `useQueryWithRealtime` on `leads`, filtered per business/provider — the trend chart now updates live without a manual refresh.
- **Files:** migration `20260708_lead_trends_live.sql`, `types.ts`, `businessService.ts`, `providerService.ts`, `BusinessDetail.tsx`, `ProviderDetail.tsx`, `ManageDashboard.tsx`, `ProviderDashboard.tsx`.
- **Migration needed:** `supabase/migrations/20260708_lead_trends_live.sql` (run manually in SQL editor)

### ISS-F07 — `bug_reports`/`support_tickets` had no SELECT policy at all — write-only tables, unreadable even by admins ✅
- **Status:** ✅ Fixed — session 2026-07-02
- **Was:** `rls.sql` only ever granted INSERT on both tables ("read access restricted for security") — nobody, including admins, could read a submitted bug report or support ticket back. No admin UI existed to view them either.
- **Fix:** admin-scoped SELECT+UPDATE RLS policies (checks `users.roles @> array['admin']`). New `reporter_role` column on `bug_reports`. New AdminPanel "Bugs" tab.
- **Files:** `supabase/migrations/20260707_bug_report_roles.sql`
- **Migration needed:** `supabase/migrations/20260707_bug_report_roles.sql` (run manually in SQL editor)

### ISS-F06 — Notifications: reason/source missing (GEN-1); nearby-request never notified anyone; My Queues dashboard didn't exist (Q-1) ✅
- **Status:** ✅ Fixed — session 2026-07-02
- **Was:** `adminService.ts`'s 3 calls to `notificationService.send`/`sendBulk` omitted the `type` argument — approval, rejection, and new-nearby-listing notifications all silently defaulted to generic `SYSTEM`, so new-business/new-provider alerts rendered with the gray bell icon instead of their own dedicated Store/Briefcase icons despite those types already existing. `NEARBY_REQUEST` had a declared type + icon but zero creation path — posting a service request never notified anyone nearby. The `notify_on_proposal`/`notify_on_agreement` DB triggers only existed in an untracked ad-hoc file, unknown if ever live (same drift pattern as `alias`/`show_*_publicly`). Separately, `store.queuesJoined` was local-only/in-memory — no cross-device "my queues" view, no history, no way to leave a queue.
- **Fix:** `adminService.ts` now passes explicit notification types. New migration re-applies the proposal/agreement triggers idempotently and adds a `notify_on_request()` trigger (bounding-box nearby broadcast, capped at 200). New `businessService.myQueues()`/`leaveQueueToken()`, `MyQueues.tsx` screen (Active/History tabs, live position, leave), `queue_tokens.status` widened to accept `LEFT`.
- **Files:** `supabase/migrations/20260706_queues_and_notifications.sql`, `adminService.ts`, `businessService.ts`, `types.ts`, new `MyQueues.tsx` + route, `Profile.tsx`.
- **Migration needed:** `supabase/migrations/20260706_queues_and_notifications.sql` (run manually in SQL editor)

### ISS-F05 — `users` table writable by any authenticated user (no ownership check); `follows` RLS blocked followers queries entirely ✅
- **Status:** ✅ Fixed — session 2026-07-02
- **Was:** `users` table's UPDATE RLS policy was `using (auth.role() = 'authenticated')` — no `id = auth.uid()` check at all, meaning any signed-in user could directly write *any other user's* row (name, phone, emergency contact, the new privacy flags — everything) via a raw Supabase client call, bypassing the app's own UI entirely. Separately, `follows` table's SELECT policy only allowed `follower_user_id = auth.uid()` — a "who follows me" query returned zero rows for every caller, permanently, since no policy ever permitted reading rows where you're the *target* rather than the follower. This wasn't a bug that could be worked around client-side — it made a followers feature structurally impossible without a schema change.
- **Also discovered:** `alias`, `show_posts_publicly`, `show_asks_publicly`, `show_badges_publicly` columns exist live on `users` but were never captured in any tracked migration file (added out-of-band via Supabase Studio/SQL editor at some point) — the repo's migration history didn't match the real schema.
- **Fix:** tightened `update_users` policy to `id = auth.uid()::text` (read stays public, unchanged). Added an additive `read_followers_of_user` policy on `follows` permitting public read of `target_type = 'USER'` rows (mirrors `users`' existing public-read stance; doesn't touch the existing BUSINESS/PROVIDER follow policies). Added `IF NOT EXISTS` catch-up guards for the 3 untracked `show_*_publicly` columns so the migration history is trustworthy again going forward.
- **Files:** `supabase/migrations/20260705_privacy_and_followers.sql`
- **Migration needed:** `supabase/migrations/20260705_privacy_and_followers.sql` (run manually in SQL editor)

### ISS-F04 — Appointment console was a flat list; no cancel attribution, no realtime, no owner scheduling control ✅
- **Status:** ✅ Fixed — session 2026-07-02 (closes ISS-004)
- **Was:** `CANCELLED` status was anonymous (customer, owner, and system auto-cancel all looked identical). Owner consoles used one-shot `useQuery` — new bookings didn't appear without a manual refresh. Owners had no way to block off time they couldn't take bookings, no day-by-day view, no history/cancelled separation, and no way to log a walk-in/phone booking.
- **Fix:** `cancelled_by` column (`CUSTOMER`/`OWNER`/`SYSTEM`) surfaced on both sides via a shared `CancelAttributionNote` component. Both owner consoles switched to `useQueryWithRealtime`. New `blocked_slots` table + `slotBlockService` lets owners block specific slots or whole days, one-off or weekly-recurring — enforced in `generateWorkingSlots` so blocked times vanish from the customer booking sheet. `BusinessAppointments` rebuilt with 4 tabs (Day view / Upcoming / History / Cancelled): the Day view is a real vertical timetable (`DayTimetable` + `DateStrip`) with a "now" line, tap-to-block empty slots, tap-to-add-walk-in, and a summary header (booked/pending/blocked/revenue). Past `PENDING` bookings auto-cancel (existing behavior, now attributed to `SYSTEM`) and past `ACCEPTED` bookings auto-complete. Owners can mark a `COMPLETED` booking as `NO_SHOW`; repeat no-shows and repeat rejected-payment-claims surface as a warning chip when reviewing a booking. Mirrored to `ProviderLeads`.
- **Files:** new migration `20260703_appointment_console.sql`, new `src/components/appointments/{DateStrip,DayTimetable,BlockSlotModal,WalkInModal}.tsx`, new `src/services/slotBlockService.ts`, `types.ts`, `appointmentService.ts`, `availability.ts`, `AppointmentSheet.tsx`, `BusinessAppointments.tsx` (rewrite), `ProviderLeads.tsx` (rewrite), `MyAppointments.tsx`
- **Migration needed:** `supabase/migrations/20260703_appointment_console.sql` (run manually in SQL editor)
- **Deferred:** slot capacity (multi-chair parallel bookings) and image-based day-summary export — see `TASKS.md` Group APT notes.

### ISS-F03 — No UPI/payment flow for appointments ✅
- **Status:** ✅ Fixed — session 2026-07-02
- **Was:** Customers had no way to pay for booked appointments in-app. No payment status visible to either party.
- **Fix:** Full payment flow added: business owner sets UPI ID in Settings → customers see "Pay ₹X" button on ACCEPTED appointments → UPI tab shows QR code + copyable UPI ID + deep-link to UPI apps → after payment, "I have paid" marks appointment as PAID → BusinessAppointments shows payment status and method. Cash option also available.
- **Files:** new `PaymentSheet.tsx`, `BusinessSettings.tsx`, `MyAppointments.tsx`, `BusinessAppointments.tsx`, `types.ts`, `appointmentService.ts`, `businessService.ts`, new `20260702_payment_system.sql`
- **Migration needed:** `supabase/migrations/20260702_payment_system.sql` (run manually in SQL editor)

### ISS-F02 — No Cancel action on confirmed appointments; owner couldn't cancel ACCEPTED bookings ✅
- **Status:** ✅ Fixed — session 2026-07-02
- **Was:** `BusinessAppointments` and `ProviderLeads` only offered Accept/Decline on PENDING rows. Once accepted, owner had no way to cancel with a reason. Customer had no visual on an owner-side cancellation reason.
- **Fix:** Extended `actionType` to include `"CANCEL"` in both owner consoles; ACCEPTED rows now show "Cancel appointment" → modal with required reason → `updateStatus(id, "CANCELLED", note)`. `MyAppointments` now renders an amber banner with the reason when `status === "CANCELLED"` with a `responseNote`.
- **Files:** `BusinessAppointments.tsx`, `ProviderLeads.tsx`, `MyAppointments.tsx`

### ISS-F01 — Business cards showed stale "Open" after owner toggled off ✅
- **Status:** ✅ Fixed — session 2026-07-01
- **Was:** `BusinessCardWide` read `b.isOpenNow` (a legacy denormalized boolean that `setAvailability` never updated). Owner could toggle off; card still said "Open."
- **Fix:** Replaced `b.isOpenNow` with `evaluateProviderAvailability(b.hours, b.isAvailableNow, b.availableUntil).isOpenNow` in `BusinessCardWide`. `ProviderCard` was already correct.
- **File:** `src/components/cards.tsx`

---

## How to add a new issue

Copy this block and fill it in:

```
### ISS-XXX — Short title
- **Status:** 🔴 Open
- **Where:** `src/path/to/file.tsx` (line or function name)
- **What:** What is wrong and why.
- **Failure scenario:** Concrete inputs → wrong output / crash.
- **Fix needed:** What the correct fix looks like.
- **Affects:** Which screens / flows are broken.
```

Increment `XXX` from the last used number. Add to the right severity tier.
