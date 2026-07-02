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
- **Status:** 🔴 Open
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

### ISS-006 — Notifications: reason/source missing or broken (GEN-1)
- **Status:** 🔴 Open
- **Where:** `src/services/notificationService.ts`, `src/screens/Notifications.tsx`, Supabase DB triggers
- **What:** Notifications don't clearly convey why they were sent. Some rows may be missing `type`, `reason`, or deep-link back to the source action. Users can't tell what triggered a notification or where to go.
- **Failure scenario:** User receives a push notification → taps it → lands on a generic Notifications list with no indication of what the notification was about or which appointment/request triggered it.
- **Fix needed:** Audit notification creation path (DB triggers + `notificationService.create`) and rendering in `Notifications.tsx`. Ensure each row has `type` + human-readable reason + deep link. See TASKS.md → GEN-1.
- **Affects:** `Notifications.tsx`, `notificationService.ts`, possibly Supabase triggers

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
