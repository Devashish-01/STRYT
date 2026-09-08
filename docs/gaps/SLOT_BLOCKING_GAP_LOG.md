# Owner Slot Blocking & Holiday Overrides — Bug & Gap Log

**Purpose:** Documenting every defect, broken state, missing validation, and operational hazard in the **Owner Slot Blocking & Holiday Overrides Flow** (`BlockSlotModal.tsx`, `DayTimetable.tsx`, `slotBlockService.ts`, `HoursEditor.tsx`, `WeeklyHoursEditor.tsx`, and associated SQL triggers). Strictly focused on **maturing the existing implementation** for business owners and practitioners.

---

## Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **S1** | Server-Side Database Booking Trigger Does Not Enforce `blocked_slots` | 🔴 P0 (Critical) | `enforce_slot_capacity` trigger checks capacities and party size, but never queries `blocked_slots`. Race conditions or open client sheets can book into blocked slots. |
| **S2** | Blocking Whole Day Completely Hides Existing Bookings from Timetable | 🔴 P0 (Critical) | `DayTimetable` early-returns on `wholeDayBlock`, wiping existing customer appointments from view. Owners cannot see who was booked, message them, or cancel them. |
| **S3** | No Conflict Warning When Blocking Slot/Day with Active Bookings | 🟠 P1 (High) | `BlockSlotModal` allows blocking a slot or whole day without warning the owner that active client appointments already exist on that slot/day. |
| **S4** | Inverted Time Ranges (`from >= to`) & Overlapping Shifts in Hours Editor | 🟠 P1 (High) | `WeeklyHoursEditor` permits setting start time after end time (silently generating 0 slots) and overlapping split shifts (generating duplicate slots). |
| **S5** | Hardcoded `#fff` Color Literals in Modal & Timetable Elements | 🟢 P3 (Design System) | `BlockSlotModal.tsx`, `DayTimetable.tsx`, and `WeeklyHoursEditor.tsx` contain hardcoded `#fff` color strings. |

---

## Detailed Gap Analyses

---

### #S1 — Server-Side Database Booking Trigger Does Not Enforce `blocked_slots`

**Area:** `supabase/migrations/20260855_slot_capacity_and_party_size.sql:70-137`, `supabase/migrations/20260936_appointment_booking_flow_maturity.sql`  
**Severity:** 🔴 P0 (Critical Database Gap)

**Root cause:**
1. The `public.blocked_slots` table stores specific dates (`date`), recurring weekdays (`weekday`), and time labels (`time_label`).
2. Client-side code queries `slotBlockService.list` and filters slots in `AppointmentSheet`.
3. However, PostgreSQL's `enforce_slot_capacity()` trigger—the authoritative server-side gate on `appointments`—only checks `v_capacity`, `v_max_party`, and `v_ceiling`.
4. It **never checks `public.blocked_slots`**. If a customer has an open booking sheet, or reschedules, or if an RPC is called directly, the database permits the insert into a blocked slot with zero server-side errors.

**Recommended Fix:**
Update `enforce_slot_capacity()` to check if `scheduled_for` falls on a blocked whole day or matches a blocked time slot for the target (`date` or recurring `weekday`), throwing exception `SLOT_BLOCKED` if matched.

---

### #S2 — Blocking Whole Day Completely Hides Existing Bookings from Timetable

**Area:** `src/components/appointments/DayTimetable.tsx:89-99`  
**Severity:** 🔴 P0 (Critical Usability Hazard)

**Root cause:**
1. In `DayTimetable.tsx`:
   ```tsx
   if (wholeDayBlock) {
     return (
       <div className="card col center" ...>
         Closed — blocked for the whole day
         ...
       </div>
     );
   }
   ```
2. If an owner blocks a day that already has 4 confirmed customer bookings, this early return hides the entire timetable grid and all bookings.
3. The owner cannot view customer names, notes, packages, or phone numbers, and cannot click into appointments to cancel or message clients.

**Recommended Fix:**
When `wholeDayBlock` is active, display the "Closed — blocked for the whole day" banner at the top, but continue rendering any existing bookings below it so the owner can manage them.

---

### #S3 — No Conflict Warning When Blocking Slot/Day with Active Bookings

**Area:** `src/components/appointments/BlockSlotModal.tsx:12-60`, `src/screens/business/manage/BusinessAppointments.tsx:850-860`  
**Severity:** 🟠 P1 (High)

**Root cause:**
When an owner clicks "Block this slot" or "Block whole day", `BlockSlotModal` provides no count or warning of active appointments currently scheduled in that time window.

**Recommended Fix:**
Pass existing active appointments for that day/slot into `BlockSlotModal` and display an amber warning banner:
*"⚠️ You have {N} active appointment(s) scheduled for this time. Blocking will stop new bookings, but you will need to cancel or notify existing customers."*

---

### #S4 — Inverted Time Ranges (`from >= to`) & Overlapping Shifts in Hours Editor

**Area:** `src/components/WeeklyHoursEditor.tsx:106-110, 197-205`, `src/utils/availability.ts:40-100`  
**Severity:** 🟠 P1 (High)

**Root cause:**
1. `WeeklyHoursEditor` does not validate that `from < to`. Setting `from = "18:00"` and `to = "09:00"` passes validation and serializes into `w.days`.
2. In `availability.ts`, slot generation loop `for (let m = fromMin; m + slotDurationMin <= toMin; m += slotDurationMin)` fails immediately, resulting in 0 slots generated.
3. If a merchant adds a second shift (e.g. 09:00-14:00 and 12:00-18:00), the overlapping hours generate duplicate slots at 12:00, 12:30, 13:00, 13:30, allowing double-bookings.

**Recommended Fix:**
Add validation in `WeeklyHoursEditor`:
- Ensure `from < to` for every shift range (display warning if inverted).
- Ensure second shift `from >= first shift to` (preventing overlapping shifts).

---

### #S5 — Hardcoded `#fff` Color Literals

**Area:** `src/components/appointments/BlockSlotModal.tsx:20, 50`, `src/components/appointments/DayTimetable.tsx:252, 289`, `src/components/WeeklyHoursEditor.tsx:45, 150`  
**Severity:** 🟢 P3 (Design System)

**Root cause:**
Inline styles use raw `#fff` color strings.

**Recommended Fix:**
Replace with `var(--surface)`.
