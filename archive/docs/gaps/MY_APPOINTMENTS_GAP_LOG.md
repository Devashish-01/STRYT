# Customer Bookings Hub (Upcoming/Past) — Bug & Gap Log

**Purpose:** Documenting every defect, broken state, missing UX, financial discrepancy, and performance issue in the **Customer Bookings Hub** (`MyAppointments.tsx`, `appointmentService.ts`, and related components). Strictly focused on **maturing the existing implementation** for production reliability.

---

## Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **A1** | Broken "Cancel" & "Reschedule" on Past-Due / Completed Unpaid Bookings | 🔴 P0 | Users click Cancel/Reschedule on completed unpaid cards in Upcoming tab and get dead-end `INVALID_TRANSITION` errors. |
| **A2** | Provider UPI ID Completely Omitted When Opening Payment | 🔴 P0 | `openPay()` only fetches business UPI IDs; paying independent providers (trainers, tutors, freelancers) passes null UPI ID. |
| **A3** | Deposit Support Omitted in Payment Sheet from Hub | 🟠 P1 | `depositPercent` is omitted when invoking `PaymentSheet`, forcing 100% full payment even when target requires 20% deposit. |
| **A4** | Reschedule & Book-Again Silently Drop Delivery & Party Size | 🟠 P1 | `openRebook()` does not pass `deliveryEnabled`, `deliveryTime`, `initialFulfillmentType`, or `initialPartySize` to `AppointmentSheet`. |
| **A5** | Missing Receipt / Payment Proof View for Confirmed (`PAID`) Bookings | 🟠 P1 | When payment is `PAID`, `PaymentStatusCard` hides the transaction reference ID, payment method, and date, leaving no receipt to show shop staff. |
| **A6** | Cancellation Dialog Provides No Reason & Misses Pending Payment Warning | 🟡 P2 | Cancel confirmation always sends empty `responseNote` and does not warn users whose payments are in `PENDING_CONFIRM` state. |
| **A7** | "Book Again" Leaves Customer Stuck on Past Tab Without Feedback | 🟡 P2 | `handleBooked` does nothing; rebooking from the Past tab leaves the user looking at past bookings with no feedback. |
| **A8** | Supabase Realtime Channel Reconnects on Every Render | 🟡 P2 | `useQueryWithRealtime` has unmemoized `refetch` in dependency array, churning WebSocket channels on every typing or state change. |
| **A9** | Party Size Indicator Missing from Appointment Cards | 🟡 P2 | Group bookings (`partySize > 1`) show combined price but no spot count (e.g. `👥 3 spots`), confusing customers. |
| **A10** | Hardcoded `#fff` Color Token in Cancellation Button | 🟢 P3 | Cancel modal button uses raw `#fff` instead of design system token `var(--surface)`. |

---

## Detailed Gap Analyses

---

### #A1 — Broken "Cancel" & "Reschedule" on Past-Due / Completed Unpaid Bookings

**Area:** `src/screens/requests/MyAppointments.tsx:273, 392-411`  
**Severity:** 🔴 P0 (Critical)

**Root cause:**
1. In `MyAppointments.tsx`, `isUnpaidActionable` keeps appointments whose slot has already passed in the `UPCOMING` tab so customers can still pay:
   ```ts
   const pastDueUnpaid = tab === "UPCOMING" && isUnpaidActionable(apt) && !isUpcoming(apt);
   ```
2. However, the action bar in `tab === "UPCOMING"` unconditionally renders **Cancel** and **Reschedule** buttons for all cards in that tab.
3. If an appointment is past-due (already auto-transitioned to `COMPLETED` by `sweep_my_appointments`), clicking "Cancel" calls `appointment_transition(..., 'CANCELLED')` which rejects with `INVALID_TRANSITION`. The user sees: *"Couldn't cancel. Try again."*
4. Clicking "Reschedule" calls `reschedule_appointment`, which also rejects with `INVALID_TRANSITION` because `v_original.status` is not in `('PENDING', 'ACCEPTED')`.

**Recommended Fix:**
For `pastDueUnpaid` cards, hide the "Cancel" and "Reschedule" buttons. Instead, display:
- **"Pay Now"** (Primary CTA)
- **"Dismiss"** (Local hide)
- **"Book Again"** (Fresh booking, bypassing the reschedule constraint)

---

### #A2 — Provider UPI ID Completely Omitted When Opening Payment

**Area:** `src/screens/requests/MyAppointments.tsx:196-211`  
**Severity:** 🔴 P0 (Critical)

**Root cause:**
1. In `openPay(apt: AppointmentRecord)`:
   ```ts
   let upiId: string | null = null;
   if (apt.targetType === "BUSINESS") {
     const biz = await businessService.get(apt.targetId);
     upiId = biz?.upiId ?? null;
   }
   setPayBizUpiId(upiId);
   ```
2. There is NO check for `apt.targetType === "PROVIDER"`.
3. When paying for a provider appointment (e.g. personal trainer, salon stylist, tutor), `upiId` remains `null`.
4. `PaymentSheet` receives `businessUpiId = null`, preventing UPI QR codes, UPI IDs, and direct payment apps from loading.

**Recommended Fix:**
Add `else if (apt.targetType === "PROVIDER")` to fetch `await providerService.get(apt.targetId)` and retrieve the provider's `upiId` and `depositPercent`.

---

### #A3 — Deposit Support Omitted in Payment Sheet from Hub

**Area:** `src/screens/requests/MyAppointments.tsx:474-482`  
**Severity:** 🟠 P1 (High)

**Root cause:**
1. `PaymentSheet` supports `depositPercent` (e.g. 20% upfront deposit).
2. In `MyAppointments.tsx`, `depositPercent` is never retrieved in `openPay` and never passed to `<PaymentSheet />`.
3. Customers opening payment from the hub are charged 100% of the price even when the seller configured a deposit policy.

**Recommended Fix:**
Store `depositPercent` in payment state and pass `depositPercent={payDepositPercent}` to `PaymentSheet`.

---

### #A4 — Reschedule & Book-Again Silently Drop Delivery & Party Size

**Area:** `src/screens/requests/MyAppointments.tsx:155-194, 443-470`  
**Severity:** 🟠 P1 (High)

**Root cause:**
1. When opening rebook/reschedule, `b.deliveryEnabled` and `b.deliveryTime` are fetched from the business but never saved in `RebookTarget`.
2. `AppointmentSheet` does not receive `deliveryEnabled`, so it defaults to `false`. Delivery bookings are converted to in-store.
3. `rebook.apt.partySize` is not passed to `AppointmentSheet`, resetting party size to 1 and bypassing capacity checks.

**Recommended Fix:**
Pass `deliveryEnabled`, `deliveryTime`, `initialFulfillmentType={rebook.apt.fulfillmentType}`, and `initialPartySize={rebook.apt.partySize}` to `AppointmentSheet`.

---

### #A5 — Missing Receipt / Payment Proof View for Confirmed (`PAID`) Bookings

**Area:** `src/screens/requests/MyAppointments.tsx:343-352`, `src/components/PaymentStatusCard.tsx:74-83`  
**Severity:** 🟠 P1 (High)

**Root cause:**
When an appointment has `paymentStatus === "PAID"`, `PaymentStatusCard` renders:
```tsx
<span className="tiny semi" style={{ color: "var(--green-600)" }}>
  Payment confirmed{paymentAmount ? ` · ${inr(paymentAmount)}` : ""}
</span>
```
It hides `paymentReference` (UTR), `paymentMethod`, date, and merchant details. When customers arrive at the venue, staff frequently demand to see the payment reference / receipt.

**Recommended Fix:**
Add a "View Receipt" button that opens a clean `PaymentReceiptModal` showing:
- Booking Reference ID
- Date & Time
- Package Name & Quantity
- Payment Method & UTR Reference
- Merchant Name

---

### #A6 — Cancellation Dialog Provides No Reason & Misses Pending Payment Warning

**Area:** `src/screens/requests/MyAppointments.tsx:127-140, 485-502`  
**Severity:** 🟡 P2 (Medium)

**Root cause:**
1. Cancelling sends `responseNote = undefined`. The seller console always displays *"No reason was provided"*.
2. If the customer already sent a payment that is `PENDING_CONFIRM`, the modal does not warn them that their claimed payment will be discarded.

**Recommended Fix:**
- Add quick cancellation reason chips ("Schedule conflict", "Change of plans", "Booked wrong slot", "Other").
- Add a warning banner if `paymentStatus === "PENDING_CONFIRM"`.

---

### #A7 — "Book Again" Leaves Customer Stuck on Past Tab Without Feedback

**Area:** `src/screens/requests/MyAppointments.tsx:217, 467-468`  
**Severity:** 🟡 P2 (Medium)

**Root cause:**
`handleBooked()` is an empty stub. Rebooking from the `PAST` tab creates an appointment in `UPCOMING`, but the UI stays on `PAST`.

**Recommended Fix:**
In `handleBooked()`, switch `tab` to `"UPCOMING"` and trigger a success notification.

---

### #A8 — Supabase Realtime Channel Reconnects on Every Render

**Area:** `src/hooks/useApi.ts:117, 167`  
**Severity:** 🟡 P2 (Performance)

**Root cause:**
In `useApi.ts`, `useQuery` returns a new `refetch` function reference on every render. `useQueryWithRealtime` lists `refetch` in its dependency array, destroying and reconnecting the WebSocket channel on every render.

**Recommended Fix:**
Use a ref for `refetch` or memoize with `useCallback` in `useQuery`.

---

### #A9 — Party Size Indicator Missing from Appointment Cards

**Area:** `src/screens/requests/MyAppointments.tsx:306-312`  
**Severity:** 🟡 P2 (Usability)

**Root cause:**
Multi-person bookings (`partySize > 1`) do not display the number of spots booked on the card.

**Recommended Fix:**
Render `👥 {apt.partySize} spots` alongside package details.

---

### #A10 — Hardcoded `#fff` Color Token in Cancellation Button

**Area:** `src/screens/requests/MyAppointments.tsx:495`  
**Severity:** 🟢 P3 (Design System)

**Root cause:**
Inline style uses `color: "#fff"`.

**Recommended Fix:**
Replace with `var(--surface)`.
