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

### ISS-001 — Leaked secrets in repo / env
- **Status:** ✅ Fixed (local configs scrubbed; cloud tokens rotated by user)
- **Where:** `.env` root file + git remote URL
- **What:** `.env` contains `SUPABASE_AT=sbp_f03b03111...` (Supabase **service/admin token** — full DB access). Git remote URL has a GitHub **PAT** embedded. Neither should be in a client-side Vite build or version-controlled at all.
- **Risk:** If the repo or `.env` leaks (deploy logs, CI, accidental push), an attacker has full Supabase admin access and GitHub write access.
- **Fix:** Rotate both tokens now. Keep service token server-side only (Edge Function / backend) — never in `VITE_*` variables. Scrub PAT from the remote URL (`git remote set-url origin https://github.com/...` without token).
- **Affects:** entire project

---

## High (wrong behavior users will see)

### ISS-002 — Business shows "Closed" by default even during working hours ⚠️
- **Status:** 🔴 Open
- **Where:** `src/utils/availability.ts` → `evaluateProviderAvailability()`, consumed by `src/components/cards.tsx` (`BusinessCardWide`), `src/screens/business/BusinessDetail.tsx`
- **What:** `is_available_now` defaults to `false` in the DB. Any business that has never touched the toggle reads "Closed" on listing cards and the detail page — even if it's currently within its posted working hours. Providers work this way intentionally ("Offline until you go online"), but a *shop* should be Open during its own hours unless the owner explicitly closes it.
- **Failure scenario:** New business onboards, sets working hours Mon–Fri 10:00–22:00, never touches the toggle → customers see "Closed" all day Monday at 14:00.
- **Fix needed:** Change the evaluator (or add a separate `manually_closed` flag) so a business is Open when the current time is within its working hours AND the owner has not explicitly overridden to closed. This requires distinguishing `is_available_now = NULL/never set` from `is_available_now = false (owner turned off)`. Migration: make the column nullable; `NULL` = "respect hours", `true` = "force open", `false` = "force closed". See also: TASKS.md (no current task — needs a new one).
- **Affects:** all business listing cards, `BusinessDetail` open/closed pill

### ISS-003 — Errors swallowed silently; failed queries spin forever
- **Status:** 🔴 Open
- **Where:** `src/hooks/useApi.ts` (`useQuery`/`useMutation`) — consumed everywhere
- **What:** `useQuery` puts failures in `.error` but most screens don't render it. A failed Supabase query shows a permanent loading skeleton with no message. Affects category load, discovery feed, business/provider detail, appointments — any network hiccup becomes a silent broken state.
- **Failure scenario:** Supabase is unreachable → user opens the home discovery feed → skeletons spin indefinitely with no "something went wrong" message and no retry option.
- **Fix needed:** Add a global `<ErrorBanner>` or make the high-traffic screens (`Home`, `BusinessDetail`, `ProviderDetail`, `MyAppointments`) render an `<ErrorView>` when `error` is set. Also surface Supabase env-missing errors (currently also silent).
- **Affects:** every data-fetching screen

---

## Medium (UX broken or misleading)

### ISS-005 — Three overlapping "request" concepts; `reservations` is a dead stub
- **Status:** 🔴 Open
- **Where:** `src/services/` — `appointmentService.ts`, `reservationService.ts` (or equivalent), `leadService.ts`
- **What:** `reservations`/`setReservation`/`team` are stub methods that do nothing. `appointments` and `leads` partially overlap in purpose. This confuses the codebase and causes "why doesn't this show up" bugs when the wrong service is called.
- **Failure scenario:** A screen accidentally calls the reservation stub instead of `appointmentService.create` → booking silently does nothing.
- **Fix needed:** Delete the `reservations` stub and its screen (Appointments replaced it). Treat `appointments` as the single booking source. Document `leads` vs `appointments` distinction in `CODEBASE_MAP.md`.
- **Affects:** any screen that touches booking/scheduling

### ISS-007 — "Me Too" button commented out on RequestCard
- **Status:** 🔴 Open
- **Where:** `src/components/cards.tsx` line ~277–289 (`RequestCard`)
- **What:** The Me Too button block is wrapped in a `{/* ... */}` comment. The `meToos` store, `toggleMeToo`, and `requestService.meToo` are all wired and functional — the UI just isn't rendered.
- **Failure scenario:** Customer views a request post → no way to signal interest — core engagement feature invisible.
- **Fix needed:** Uncomment the button. Verify `requestService.meToo` writes to Supabase correctly before re-enabling. Low risk — all logic already exists.
- **Affects:** `RequestCard` in discovery/community feed

---

## Low / Polish

### ISS-008 — `BusinessCardSmall` doesn't show open/closed status
- **Status:** 🔴 Open
- **Where:** `src/components/cards.tsx` — `BusinessCardSmall` component (~line 84)
- **What:** `BusinessCardWide` now uses the live evaluator for open/closed. `BusinessCardSmall` (horizontal scroll carousels) shows no status at all — neither stale nor live. Minor inconsistency.
- **Fix needed:** Optionally add a small colored dot or "Open"/"Closed" chip to `BusinessCardSmall` using the same `evaluateProviderAvailability` call.
- **Affects:** carousel sections on Home/discovery

---

## Fixed

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
