# Provider Jobs & Service Bookings — Bug & Gap Log

**Purpose:** Documenting every defect, broken state, missing information, financial discrepancy, and performance hazard in the **Provider Jobs & Service Bookings Console** (`ProviderJobs.tsx`, `appointmentService.ts`, and related components). Strictly focused on **maturing the existing implementation** for service providers and freelancers.

---

## Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **P1** | Booked Service Package Name & Price Completely Omitted from Cards | 🔴 P0 (Critical) | `renderAppointmentCard` never renders `apt.packageName` or `apt.packagePrice`. Providers cannot see what service/tier the customer booked or how much was charged. |
| **P2** | O(n²) Unmemoized Array Scanning on Every Card Render | 🟠 P1 (Performance) | `rejectedClaimsCount` and `noShowCount` re-filter the entire `appointments` array twice for every card render, causing UI lag and battery drain on long histories. |
| **P3** | In-Person Cash Payment Blocked for Customer Bookings | 🔴 P0 (Critical) | Providers can only record cash for `isWalkIn`. For clients who pay cash in person during their session, provider cannot mark `PAID`. |
| **P4** | Fragile Ad-Hoc Regex for Walk-In Slot Time Parsing | 🟡 P2 (Resilience) | Line 209 parses time using `/(\d+):(\d+)\s?(AM|PM)/i`, failing on non-standard formats and scheduling walk-ins at 00:00 midnight. |
| **P5** | Hardcoded `#fff` Color Literals in Cancel and Reject Modals | 🟢 P3 (Design System) | Lines 566 and 597 use inline style `color: "#fff"` instead of design system token `var(--surface)`. |
| **P6** | Walk-in Phone Number Not Clickable in Provider Console | 🟡 P2 (Usability) | Phone numbers captured for walk-ins are rendered as plain text in `notes` without a click-to-call (`tel:`) affordance. |
| **P7** | Direct 1:1 Client Messaging Shortcut Missing on Job Cards | 🟡 P2 (Operations) | Providers have no direct quick-link to open a chat thread (`/chat/${apt.customerId}`) with the client to coordinate locations or timing. |

---

## Detailed Gap Analyses

---

### #P1 — Booked Service Package Name & Price Completely Omitted from Cards

**Area:** `src/screens/provider/manage/ProviderJobs.tsx:260-320`  
**Severity:** 🔴 P0 (Critical Missing Information)

**Root cause:**
1. In `BusinessAppointments.tsx`, lines 387-391 render:
   ```tsx
   {apt.packageName && (
     <div className="tiny semi" style={{ color: "var(--brand-700)" }}>
       📦 {apt.packageName}{apt.packagePrice ? ` • ₹${apt.packagePrice}` : ""}
     </div>
   )}
   ```
2. In `ProviderJobs.tsx`, `renderAppointmentCard(apt)` renders the customer avatar, name, date, notes, and photo reference, but **completely omits** `apt.packageName` and `apt.packagePrice`.
3. An independent provider (trainer, tutor, therapist, stylist) opening their jobs console sees that a booking exists, but **cannot see what service or package was booked** or what price was agreed upon.

**Recommended Fix:**
Render the package badge `📦 {apt.packageName} • ₹{apt.packagePrice}` on all provider booking cards across Upcoming, Today, History, and Cancelled tabs.

---

### #P2 — O(n²) Unmemoized Array Scanning on Every Card Render

**Area:** `src/screens/provider/manage/ProviderJobs.tsx:132-137, 254-255`  
**Severity:** 🟠 P1 (Performance Hazard)

**Root cause:**
1. In `ProviderJobs.tsx`:
   ```ts
   function rejectedClaimsCount(customerId: string): number {
     return appointments.filter((a) => a.customerId === customerId && a.paymentStatus === "REJECTED").length;
   }
   function noShowCount(customerId: string): number {
     return appointments.filter((a) => a.customerId === customerId && a.status === "NO_SHOW").length;
   }
   ```
2. These functions are invoked inside `renderAppointmentCard` for every single appointment in every tab.
3. For $N$ appointments, this executes $2 \times N$ complete array scans ($O(N^2)$). In `BusinessAppointments.tsx`, this was replaced with precomputed `useMemo` frequency maps.

**Recommended Fix:**
Precompute `rejectedClaimsByCustomer` and `noShowsByCustomer` into `Map<string, number>` inside a `useMemo` hook, reducing complexity from $O(N^2)$ to $O(N)$.

---

### #P3 — In-Person Cash Payment Blocked for Customer Bookings

**Area:** `src/screens/provider/manage/ProviderJobs.tsx:327-344`  
**Severity:** 🔴 P0 (Critical Operational Gap)

**Root cause:**
1. In `ProviderJobs.tsx:331`:
   ```tsx
   {apt.isWalkIn && (apt.packagePrice || apt.paymentAmount) ? (
     <button onClick={() => handleRecordWalkInPayment(apt)}>Record cash received</button>
   ) : !apt.isWalkIn ? (
     <button onClick={() => handleNudgePayment(apt)}>🔔 Request payment</button>
   ) : ...}
   ```
2. If a customer books a session on the app and pays physical cash at the end of the session, the provider cannot mark it as paid.
3. The booking stays stuck in `UNPAID` status, and provider earnings calculations omit the revenue.

**Recommended Fix:**
Allow providers to record cash received for any appointment with an agreed package price, and ensure the backend RPC permits provider owners to record in-person payment.

---

### #P4 — Fragile Ad-Hoc Regex for Walk-In Slot Time Parsing

**Area:** `src/screens/provider/manage/ProviderJobs.tsx:209-216`  
**Severity:** 🟡 P2 (Resilience)

**Root cause:**
Walk-in creation uses ad-hoc regex `/(\d+):(\d+)\s?(AM|PM)/i`. If a slot label is formatted without AM/PM or in 24h format, hours fail to parse and the appointment defaults to 00:00 midnight.

**Recommended Fix:**
Use `parseTimeToMinutes(walkInModal.timeLabel)` from `src/utils/availability.ts`.

---

### #P5 — Hardcoded `#fff` Color Literals in Cancel and Reject Modals

**Area:** `src/screens/provider/manage/ProviderJobs.tsx:566, 597`  
**Severity:** 🟢 P3 (Design System)

**Root cause:**
Buttons use inline styles with `color: "#fff"`.

**Recommended Fix:**
Replace with `var(--surface)`.

---

### #P6 — Walk-in Phone Number Not Clickable in Provider Console

**Area:** `src/screens/provider/manage/ProviderJobs.tsx:298-302`  
**Severity:** 🟡 P2 (Usability)

**Root cause:**
Walk-in phone numbers stored in `notes` are rendered as static text with no click-to-call (`tel:`) link.

**Recommended Fix:**
Extract phone numbers from `notes` (or when `isWalkIn`) and render a direct click-to-call link.

---

### #P7 — Direct 1:1 Client Messaging Shortcut Missing on Job Cards

**Area:** `src/screens/provider/manage/ProviderJobs.tsx:260-285`  
**Severity:** 🟡 P2 (Operations)

**Root cause:**
Providers have no button to message the client directly from the job card to coordinate appointments.

**Recommended Fix:**
Add a "Message" action linking to `/chat/${apt.customerId}` for customer bookings.
