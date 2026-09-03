# 03 — Appointments / Booking

**Priority:** P0 — this is the app's core commerce loop and the reference
fully-wired feature (`CODEBASE_MAP.md` §8).
**Screens:** `AppointmentSheet` (booking sheet, opened from `BusinessDetail`/
`ProviderDetail`), `MyAppointments` (customer hub), `RateScreen`.
**Service:** `appointmentService.ts` — Supabase `appointments` table with a
localStorage fallback for signed-out/mock ids.

## Flow A — Book end to end

| # | Step | Expected |
|---|------|----------|
| 1 | Business/provider detail → "Book" | `AppointmentSheet` opens |
| 2 | Pick a package/service | Price, duration shown |
| 3 | Pick a date | Only bookable dates selectable (respects hours + blocked dates) |
| 4 | Pick a slot | Slots reflect **remaining capacity** — a slot at capacity is not selectable; capacity is per catalogue item (`slot_capacity`) with a `default_slot_capacity` fallback |
| 5 | Party size (if the item supports `max_party_size` > 1) | Stepper respects the max |
| 6 | Add a photo (optional) | Uploads, attaches |
| 7 | Confirm | Appointment created, appears in `/appointments` under Upcoming |
| 8 | Business console (`BusinessAppointments`, see workflow 15) | New booking visible immediately |
| 9 | Book a **6th** appointment for the same customer on the same day | Server rejects with the daily-limit message (needs migration `20260897` applied — see workflow 23 item) |

## Flow B — Payment

| # | Step | Expected |
|---|------|----------|
| 1 | Booking with a business that has UPI configured | Payment step shows UPI deep link + QR (generated on-device) |
| 2 | Tap "Pay via UPI app" | Opens the UPI app with amount/payee pre-filled |
| 3 | Mark as paid (customer side) | Status → pending confirmation |
| 4 | Business confirms payment (workflow 15) | Status → paid, both sides reflect it |
| 5 | Business **rejects** a payment claim | Customer can re-claim (not stuck) |
| 6 | Cash / pay-on-arrival option, if offered | Skips the UPI step cleanly |

## Flow C — Reschedule / cancel

| # | Step | Expected |
|---|------|----------|
| 1 | `/appointments` → an upcoming booking → Reschedule | New date/slot picker, respects capacity same as booking |
| 2 | Confirm reschedule | Old slot freed, new slot booked, note added ("Rescheduled") — **read the current `reschedule_appointment` RPC**, not from memory, before touching this code; a prior same-session rewrite silently dropped 4 guards here (walk-in rejection, optimistic-concurrency check, the note, notes truncation) |
| 3 | Cancel a booking | Confirm dialog, then removed from Upcoming, appears in Past/Cancelled |
| 4 | Cancel an already-completed booking | Not offered — action shouldn't even appear |
| 5 | "Book again" from a past appointment | Pre-fills the same business/package into a fresh `AppointmentSheet` |

## Flow D — Queue (walk-in businesses)

| # | Step | Expected |
|---|------|----------|
| 1 | Business with a queue enabled → Join queue | Customer gets a live position |
| 2 | Business calls next (workflow 15) | Customer's position updates in near-real-time |
| 3 | Leave the queue voluntarily | Position freed, reflected on the business side |

## Flow E — Out-of-service-area

| # | Step | Expected |
|---|------|----------|
| 1 | Book a business/provider outside their stated service radius (if the concept applies — e.g. delivery-only or radius-capped) | Blocked or clearly flagged, not silently accepted then rejected later |

## Edge cases

- Two devices/tabs both attempt the last slot at the same time — only one
  succeeds (advisory-lock enforced, `trg_enforce_slot_capacity`).
- A rescheduled slot's old capacity is actually freed (book something else
  into it afterward and confirm it's available).
- Booking as a **guest** — hits the sign-in wall, returns here after sign-in.
