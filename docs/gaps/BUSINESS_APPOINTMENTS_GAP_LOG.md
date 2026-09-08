# Business Appointment Calendar Console — Bug & Gap Log

**Purpose:** Documenting every defect, broken state, financial discrepancy, usability issue, and operational gap in the **Business Appointment Calendar Console** (`BusinessAppointments.tsx`, `WalkInModal.tsx`, `BlockSlotModal.tsx`, `DayTimetable.tsx`, and associated SQL RPCs). Strictly focused on **maturing the existing implementation** for merchant operations.

---

## Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **B1** | Walk-in Multi-Person Pricing Discrepancy | 🔴 P0 (Critical) | `WalkInModal` passes single unit price instead of `unitPrice * partySize`. Cash payment records fractional revenue (e.g. ₹400 instead of ₹1,200 for 3 spots). |
| **B2** | In-Person Cash Payment Blocked for Customer In-Store Bookings | 🔴 P0 (Critical) | Merchants can only record cash for `isWalkIn`. For app bookings paid in physical currency at the counter, merchant has no way to mark `PAID` (DB throws `NOT_WALK_IN_MANAGER`). |
| **B3** | Walk-In Phone Number Trapped in Plain Text Note | 🟡 P2 (Usability) | Phone numbers entered for walk-ins are stored in plain text notes with no click-to-call (`tel:`) or copy affordance. |
| **B4** | Fragile Ad-Hoc Regex for Walk-In Time Slot Parsing | 🟡 P2 (Resilience) | Line 293 uses ad-hoc regex `/(\d+):(\d+)\s?(AM|PM)/i` which fails on alternative time formats, defaulting bookings to midnight. |
| **B5** | Hardcoded `#fff` Color Literals in Batch Select & WalkInModal | 🟢 P3 (Design System) | Inline styles in `BusinessAppointments.tsx` and `WalkInModal.tsx` use `#fff` instead of `var(--surface)`. |
| **B6** | Direct 1:1 Chat / Call Affordance Missing on Appointment Cards | 🟡 P2 (Operations) | Merchant cannot initiate quick messaging or communication with customers running late for an upcoming booking. |

---

## Detailed Gap Analyses

---

### #B1 — Walk-in Multi-Person Pricing Discrepancy

**Area:** `src/components/appointments/WalkInModal.tsx:129`, `src/screens/business/manage/BusinessAppointments.tsx:195-206, 288-322`  
**Severity:** 🔴 P0 (Critical Financial Discrepancy)

**Root cause:**
1. In `WalkInModal.tsx`, when selecting party size (e.g. 3 people for a fitness or salon package @ ₹400/person):
   ```tsx
   onClick={() => onConfirm({
     name: name.trim(), phone: phone.trim(),
     packageId: selectedPkg?.id, packageName: selectedPkg?.name, packagePrice: selectedPkg?.price,
     partySize: canPickParty ? partySize : undefined,
   })}
   ```
2. `packagePrice` passes `selectedPkg?.price` (₹400), ignoring `partySize`.
3. When recorded via `appointment_create_walk_in`, the row is created with `package_price = 400` instead of `1,200`.
4. When the merchant taps **"Record cash received"**, `appointment_record_walk_in_payment` records ₹400 cash, causing a permanent revenue shortfall in the daily summary.

**Recommended Fix:**
In `WalkInModal.tsx`, multiply `selectedPkg.price * (canPickParty ? partySize : 1)` and display the computed total in the modal summary before confirmation.

---

### #B2 — In-Person Cash Payment Blocked for Customer In-Store Bookings

**Area:** `src/screens/business/manage/BusinessAppointments.tsx:426-438`, `supabase/migrations/20260841_business_team_scopes.sql:308`  
**Severity:** 🔴 P0 (Critical Operational Block)

**Root cause:**
1. In `BusinessAppointments.tsx`, the "Record cash received" button is wrapped in:
   ```tsx
   {apt.isWalkIn && (apt.packagePrice || apt.paymentAmount) ? (
     <button onClick={() => handleRecordWalkInPayment(apt)}>Record cash received</button>
   ) : !apt.isWalkIn ? (
     <button onClick={() => handleNudgePayment(apt)}>🔔 Request payment</button>
   ) : ...}
   ```
2. If a customer books an in-store appointment through the STRYT app and pays with cash at the store counter, the merchant has NO button to record the cash payment.
3. If the merchant tries to call `appointment_record_walk_in_payment`, PostgreSQL raises exception `NOT_WALK_IN_MANAGER` because line 308 enforces `not v_appointment.is_walk_in`.
4. The booking remains stuck in `UNPAID` status forever, and cash revenue is never reflected in the merchant's metrics.

**Recommended Fix:**
1. Create a migration updating the payment RPC to allow authorized business owners and managers to record in-person cash payments for any `IN_STORE` appointment.
2. In `BusinessAppointments.tsx`, display the "Record cash received" button for both walk-ins and in-store customer bookings.

---

### #B3 — Walk-In Phone Number Trapped in Plain Text Note

**Area:** `src/screens/business/manage/BusinessAppointments.tsx:393-397`  
**Severity:** 🟡 P2 (Usability)

**Root cause:**
Walk-in phone numbers are stored as `notes = 'Walk-in • 98765 43210'`. The appointment card renders this note inside a static grey box with no clickable phone link (`<a href="tel:...">`).

**Recommended Fix:**
Detect phone numbers in notes or render a direct `tel:` call button on walk-in appointment cards.

---

### #B4 — Fragile Ad-Hoc Regex for Walk-In Time Slot Parsing

**Area:** `src/screens/business/manage/BusinessAppointments.tsx:292-299`  
**Severity:** 🟡 P2 (Resilience)

**Root cause:**
Walk-in submission parses the time slot using:
```tsx
const [, hh, mm, ap] = /(\d+):(\d+)\s?(AM|PM)/i.exec(walkInModal.timeLabel) ?? [];
```
If the timeLabel arrives in 24-hour format (e.g. `14:00`), `hh` is null, resulting in the appointment being saved with default hours (00:00).

**Recommended Fix:**
Use `parseTimeToMinutes(walkInModal.timeLabel)` from `src/utils/availability.ts` to compute exact hours and minutes reliably.

---

### #B5 — Hardcoded `#fff` Color Literals

**Area:** `src/screens/business/manage/BusinessAppointments.tsx:665, 669, 884, 892`, `src/components/appointments/WalkInModal.tsx:51, 80`  
**Severity:** 🟢 P3 (Design System)

**Root cause:**
Multiple elements use hardcoded `#fff` strings instead of `var(--surface)` design tokens.

**Recommended Fix:**
Replace all `#fff` color strings with `var(--surface)`.

---

### #B6 — Direct 1:1 Chat / Call Affordance Missing on Appointment Cards

**Area:** `src/screens/business/manage/BusinessAppointments.tsx:348-360`  
**Severity:** 🟡 P2 (Operations)

**Root cause:**
For customer bookings, there is no shortcut to message the customer if the merchant is delayed or has a question.

**Recommended Fix:**
Add a quick "Message customer" button linking to `/chat/${apt.customerId}` for authenticated customer bookings.
