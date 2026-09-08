# Customer Appointment Booking Flow — Bug & Gap Log

**Purpose:** Documenting every real defect, broken control, financial discrepancy, silent error, and usability gap in the **Customer Appointment Booking Flow** (`AppointmentSheet.tsx`, `appointmentService.ts`, `availability.ts`, `BusinessDetail.tsx`, `ProviderDetail.tsx`, and associated SQL booking RPCs). Strictly focused on **maturing the existing implementation** and making booking robust, reliable, and production-ready for real customers without introducing feature creep.

---

## Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Classification | Impact on Ready-to-Use |
| :--- | :--- | :--- | :--- |
| **#1** | ~~Rescheduling an appointment wipes payment details (`PAID` → `UNPAID`)~~ | 🟢 **Resolved** | Preserved via Migration 20260935, AppointmentSheet logic, and local fallback |
| **#2** | ~~Rescheduling an appointment overwrites package name & price with `NULL`~~ | 🟢 **Resolved** | Pre-selected in UI, passed in payload, preserved via SQL coalesce, and verified via tests |
| **#3** | ~~Multi-spot party size ignores pricing and hardcodes quantity 1 in SQL~~ | 🟢 **Resolved** | Multiplies activePrice by partySize; Migration 20260936 sets quantity = partySize in line items |
| **#4** | ~~Date selector stays on "Today" after hours when zero slots remain~~ | 🟢 **Resolved** | Auto-advances dayOffset to tomorrow/next open day when today has passed or has 0 available slots |
| **#5** | ~~Out-of-service-area distance check hard-blocks in-store visits~~ | 🟢 **Resolved** | Distance check restricted strictly to DELIVERY; in-store bookings permitted with soft distance notice |
| **#6** | ~~Delivery option disabled with zero user feedback when pin not dropped~~ | 🟢 **Resolved** | Initialized from user coordinates; button text indicates missing step and confirms on complete pin |
| **#7** | ~~Time-of-day period filter sticks across dates, trapping user on empty screen~~ | 🟢 **Resolved** | Automatically resets slotPeriod to 'all' when switching dates or when period has 0 slots |
| **#8** | ~~Raw database error strings displayed to customer on booking exceptions~~ | 🟢 **Resolved** | appointmentService.create maps SQL error codes to friendly customer-facing toast messages |
| **#9** | ~~Photo re-uploaded to Supabase Storage on every retry + memory leak~~ | 🟢 **Resolved** | Caches uploadedUrl across retries; revokes object URLs on photo removal, change, and unmount |
| **#10** | ~~Mobile virtual keyboard obscures notes and delivery address inputs~~ | 🟢 **Resolved** | Added 80px bottom scroll padding so inputs scroll smoothly above sticky footer & mobile keyboard |
| **#11** | Multi-staff / specific practitioner appointment allocation | *Deferred (By Design)* | Local service shops operate single unified schedules; individual staff selection is deferred |
| **#12** | Recurring weekly/monthly automatic appointment booking | *Deferred (By Design)* | Atomic single bookings match customer trust; recurring bookings handled via subscription service |
| **#13** | Google Calendar / Apple iCal synchronization (.ics export) | *Deferred (By Design)* | In-app reminders and notifications satisfy launch requirements |

---

## Detailed Gap Analyses

---

### #1 — Rescheduling an appointment wipes payment details (`PAID` → `UNPAID`)

**Status:** 🟢 **Resolved** (Migration `20260935_reschedule_preserve_payment_and_package.sql`, `AppointmentSheet.tsx`, `appointmentService.ts`, `appointmentService.reschedule.test.ts`)  
**Area:** `supabase/migrations/20260935_reschedule_preserve_payment_and_package.sql`, `src/components/AppointmentSheet.tsx:382-388`, `src/services/engagement/appointmentService.ts:331-356`

**Root cause:**
In the PostgreSQL RPC `public.reschedule_appointment`, when an existing booking was retimed:
1. It cancelled the original appointment (`status = 'CANCELLED'`).
2. It inserted `v_new`, but **omitted** `payment_status`, `payment_method`, `payment_amount`, and `payment_reference`.
3. Consequently, the replacement row defaulted to `payment_status = 'UNPAID'`, `payment_method = NULL`, and `payment_amount = NULL`.
4. If the customer had already paid upfront or paid a deposit, that payment record remained trapped on the cancelled original row.
5. In `AppointmentSheet.tsx`, `if (paymentTiming === "AT_BOOKING")` unconditionally opened `PaymentSheet` immediately upon reschedule, demanding the customer pay a second time for an already paid booking.

**Resolution:**
1. Created Migration `20260935_reschedule_preserve_payment_and_package.sql` updating `reschedule_appointment` to copy `payment_status`, `payment_method`, `payment_amount`, and `payment_reference` from `v_original` into `v_new`. Also coalesces `package_id`, `package_name`, and `package_price` so package details are preserved.
2. In `AppointmentSheet.tsx`, updated conditional: `if (paymentTiming === "AT_BOOKING" && (!isReschedule || created.paymentStatus !== "PAID"))` to bypass redundant payment sheets for already-paid bookings.
3. Updated local/mock fallback in `appointmentService.create` to copy payment details and package metadata when `rescheduledFrom` is specified.
4. Added automated regression unit tests in `src/services/engagement/appointmentService.reschedule.test.ts`.

---

### #2 — Rescheduling an appointment overwrites package name & price with `NULL`

**Status:** 🟢 **Resolved** (Migration `20260935_reschedule_preserve_payment_and_package.sql`, `MyAppointments.tsx`, `AppointmentSheet.tsx`, `appointmentService.ts`, `appointmentService.reschedule.test.ts`)  
**Area:** `src/screens/requests/MyAppointments.tsx:450-458`, `supabase/migrations/20260935_reschedule_preserve_payment_and_package.sql:59-61`, `src/services/engagement/appointmentService.ts:354-356`

**Root cause:**
When opening the reschedule sheet in `MyAppointments.tsx`:
1. `initialPackage` was not provided to `AppointmentSheet`.
2. `AppointmentSheet` initialized `selectedPkg` to `null`.
3. When the customer picked a slot and clicked "Reschedule", `selectedPkg` was `null`. `appointmentService.create` passed `packageId: undefined`, `packageName: undefined`, `packagePrice: undefined`.
4. `reschedule_appointment` inserted `p_package_id, p_package_name, p_package_price` directly without coalescing with `v_original`.
5. As a result, the new booking's package name and price were permanently overwritten with `NULL`, turning the customer's specific booking into an unpriced generic "Appointment".

**Resolution:**
1. In `MyAppointments.tsx`, pre-populate and pass `initialPackage`:
   ```tsx
   initialPackage={
     rebook.apt.packageId || rebook.apt.packageName
       ? rebook.packages.find((p) => p.id === rebook.apt.packageId || p.name === rebook.apt.packageName) || {
           id: rebook.apt.packageId || "pkg_custom",
           name: rebook.apt.packageName || "",
           price: rebook.apt.packagePrice ?? 0,
         }
       : undefined
   }
   ```
2. In `supabase/migrations/20260935_reschedule_preserve_payment_and_package.sql`, coalesced package metadata:
   ```sql
   coalesce(p_package_id, v_original.package_id),
   coalesce(p_package_name, v_original.package_name),
   coalesce(p_package_price, v_original.package_price)
   ```
3. In `AppointmentSheet.tsx`, displayed the currently booked package name and price in the reschedule reference card.
4. In `appointmentService.ts`, preserved package metadata in the local/offline mock fallback.
5. Added automated regression unit tests in `src/services/engagement/appointmentService.reschedule.test.ts`.

---

### #3 — Multi-spot party size ignores pricing and hardcodes quantity 1 in SQL

**Status:** 🟢 **Resolved** (Migration `20260936_appointment_booking_flow_maturity.sql`, `AppointmentSheet.tsx:241-245, 342, 970-975`, `appointmentService.gaps.test.ts`)  
**Area:** `src/components/AppointmentSheet.tsx`, `supabase/migrations/20260936_appointment_booking_flow_maturity.sql`

**Root cause:**
1. In `AppointmentSheet.tsx`:
   `activePrice` evaluated to `selectedPkg.price` regardless of `partySize`.
2. When booking multiple spots for a package (e.g. 3 spots @ ₹400 = ₹1,200), the customer was charged ₹400 instead of ₹1,200.
3. In SQL `appointment_create` and `appointment_create_walk_in`, line items synthesis hardcoded `'quantity', 1`.

**Resolution:**
1. In `AppointmentSheet.tsx`:
   - Updated `activePrice`:
     ```tsx
     const activePrice =
       items && items.length > 0
         ? items.reduce((s, it) => s + it.price * it.quantity, 0)
         : selectedPkg
         ? selectedPkg.price * (canPickParty ? partySize : 1)
         : null;
     ```
   - Passed `packagePrice: activePrice ?? undefined` in booking payload.
   - Enhanced party size picker UI to display total price and per-spot breakdown (`• ₹1,200 (₹400/spot)`).
2. In Migration `20260936_appointment_booking_flow_maturity.sql`:
   - Updated `appointment_create` and `appointment_create_walk_in` line items synthesis:
     ```sql
     'unit_price', case when coalesce(p_party_size, 1) > 1 and coalesce(p_package_price, 0) > 0
                        then round(coalesce(p_package_price, 0) / coalesce(p_party_size, 1), 2)
                        else coalesce(p_package_price, 0) end,
     'quantity', coalesce(p_party_size, 1)
     ```
3. Added automated unit tests in `src/services/engagement/appointmentService.gaps.test.ts`.

---

### #4 — Date selector stays on "Today" after hours when zero slots remain

**Status:** 🟢 **Resolved** (`AppointmentSheet.tsx:273-290`)  
**Area:** `src/components/AppointmentSheet.tsx`

**Root cause:**
`isWorkingDay` only evaluated whether the weekday has open hours in its schedule. If opened at 8:00 PM when the business closed at 7:00 PM, Tuesday was still considered a working day. `dayOffset` stayed at `0` ("Today"), displaying a broken-looking grid with 0 available slots rather than auto-selecting tomorrow.

**Resolution:**
In `AppointmentSheet.tsx`, enhanced the initial auto-select effect using `generateWorkingSlots(availabilityNote, dates[0])`:
```tsx
const hasAutoAdvancedRef = useRef(false);
useEffect(() => {
  if (hasAutoAdvancedRef.current) return;
  if (dayOffset !== 0) return;
  const todaySlots = generateWorkingSlots(availabilityNote, dates[0]);
  const hasAvailableToday = isWorkingDay(availabilityNote, dates[0]) && todaySlots.some((s) => s.isAvailable);
  if (!hasAvailableToday) {
    const firstOpen = dates.findIndex((d, idx) => idx > 0 && isWorkingDay(availabilityNote, d));
    if (firstOpen > 0) {
      setDayOffset(firstOpen);
      hasAutoAdvancedRef.current = true;
    }
  } else {
    hasAutoAdvancedRef.current = true;
  }
}, [availabilityNote]);
```
If today is closed or all slots for today have expired, it immediately auto-advances to tomorrow (or the first available working day).

---

### #5 — Out-of-service-area distance check hard-blocks in-store visits

**Status:** 🟢 **Resolved** (Migration `20260936_appointment_booking_flow_maturity.sql`, `AppointmentSheet.tsx:525-546, 1090-1110`)  
**Area:** `src/components/AppointmentSheet.tsx`, `supabase/migrations/20260936_appointment_booking_flow_maturity.sql`

**Root cause:**
`outOfRange` check was unconditionally disabling the confirm button and throwing `OUT_OF_SERVICE_AREA` in the SQL RPC even for `IN_STORE` visits, preventing customers located >5km away from scheduling in-store salon, clinic, or shop visits.

**Resolution:**
1. In Migration `20260936_appointment_booking_flow_maturity.sql`, restricted `OUT_OF_SERVICE_AREA` check strictly to `p_fulfillment_type = 'DELIVERY'`.
2. In `AppointmentSheet.tsx`:
   - Updated button disabled condition: only disables for `fulfillmentType === "DELIVERY" && outOfRange`.
   - Updated warning banner: displays an amber advisory distance notice for in-store visits while keeping booking enabled, and a red blocker notice for delivery.

---

### #6 — Delivery option disabled with zero user feedback when pin not dropped

**Status:** 🟢 **Resolved** (`AppointmentSheet.tsx:120-125, 320-330, 646-654, 1098-1120`)  
**Area:** `src/components/AppointmentSheet.tsx`

**Root cause:**
When selecting "Home delivery", `deliveryLat` and `deliveryLng` started as `null`, and `storedLat`/`storedLng` were not passed to `LocationPicker`. If the user typed an address but did not drop a pin, the confirm button was silently disabled with zero hint or feedback.

**Resolution:**
1. Initialized `deliveryLat` and `deliveryLng` with `user?.lat ?? null` and `user?.lng ?? null` (and address with `user?.address || ""`).
2. Passed `storedLat={user?.lat ?? undefined}` and `storedLng={user?.lng ?? undefined}` to `LocationPicker`.
3. Updated confirm button label to provide clear instructional feedback:
   `!deliveryAddressReady ? (deliveryAddressLine.trim().length <= 2 ? "Enter Delivery Address" : "Pin Location on Map") : ...`
4. Added an instructional hint below the button: `"📍 Pin your delivery address on the map above to confirm"`.
5. In `handleConfirm()`, added specific toasts directing the user to enter address text or pin location on the map.

---

### #7 — Time-of-day period filter sticks across dates, trapping user on empty screen

**Status:** 🟢 **Resolved** (`AppointmentSheet.tsx:292-303`)  
**Area:** `src/components/AppointmentSheet.tsx`

**Root cause:**
If the user filtered by "Morning" on Day 1, and switched to Day 2 where the business opens only in the afternoon, `displayedSlots` evaluated to empty, and the morning button disappeared, leaving the user on an empty card.

**Resolution:**
In `AppointmentSheet.tsx`, added an automatic reset effect:
```tsx
useEffect(() => {
  if (slotPeriod !== "all") {
    if (
      (slotPeriod === "morning" && morningSlots.length === 0) ||
      (slotPeriod === "afternoon" && afternoonSlots.length === 0) ||
      (slotPeriod === "evening" && eveningSlots.length === 0)
    ) {
      setSlotPeriod("all");
    }
  }
}, [dayOffset, slotPeriod, morningSlots.length, afternoonSlots.length, eveningSlots.length]);
```
When changing dates or when the active period has no slots on that date, it automatically resets to `"all"`.

---

### #8 — Raw database error strings displayed to customer on booking exceptions

**Status:** 🟢 **Resolved** (`appointmentService.ts:315-355`, `appointmentService.gaps.test.ts`)  
**Area:** `src/services/engagement/appointmentService.ts`

**Root cause:**
Booking and rescheduling RPC exceptions like `INVALID_APPOINTMENT_TIME`, `NOT_ACCEPTING_APPOINTMENTS`, `DELIVERY_NOT_OFFERED`, `DELIVERY_ADDRESS_REQUIRED`, `INVALID_TRANSITION`, `APPOINTMENT_NOT_FOUND`, `NOT_YOUR_BOOKING` displayed raw uppercase database error codes in customer toasts.

**Resolution:**
Added comprehensive error mapping in `appointmentService.create()`:
- `INVALID_APPOINTMENT_TIME` → *"This slot has already passed or is invalid. Please pick an upcoming time."*
- `NOT_ACCEPTING_APPOINTMENTS` → *"This business is temporarily not accepting new appointments."*
- `DELIVERY_NOT_OFFERED` → *"Home delivery is not offered for this service. Please choose store visit."*
- `DELIVERY_ADDRESS_REQUIRED` → *"Please provide a complete delivery address with a pinned map location."*
- `INVALID_TRANSITION` → *"This booking cannot be rescheduled because its status has changed."*
- `APPOINTMENT_NOT_FOUND` → *"The original appointment could not be found."*
- `NOT_YOUR_BOOKING` → *"You can only reschedule your own appointments."*
- `UNAUTHENTICATED` → *"Please sign in to complete your booking."*
- `INVALID_PARTY_SIZE` → *"Please enter a valid party size (1 or more)."*

---

### #9 — Photo re-uploaded to Supabase Storage on every retry + memory leak

**Status:** 🟢 **Resolved** (`AppointmentSheet.tsx:126, 305-320, 335-345`)  
**Area:** `src/components/AppointmentSheet.tsx`

**Root cause:**
1. If booking creation failed (e.g. slot collision), retrying re-uploaded `photoFile` repeatedly to Supabase Storage.
2. `removePhoto()` failed to revoke `photoPreview` object URLs, leaking memory.

**Resolution:**
1. Added `cachedPhotoUrl` state: reuses the already-uploaded storage URL across retry attempts.
2. In `handlePhotoSelect()` and `removePhoto()`, invoked `URL.revokeObjectURL(photoPreview)` to release browser object URLs immediately.
3. Cleared `cachedPhotoUrl` whenever the user removes or selects a new photo.

---

### #10 — Mobile virtual keyboard obscures notes and delivery address inputs

**Status:** 🟢 **Resolved** (`AppointmentSheet.tsx:505`)  
**Area:** `src/components/AppointmentSheet.tsx`

**Root cause:**
The scrollable container `<div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 16px" }}>` had only 16px bottom padding, causing inputs and caret to be obscured by the sticky bottom confirm button and mobile virtual keyboard.

**Resolution:**
Increased bottom padding of the scrollable container to `80px` (`padding: "16px 20px 80px"`), ensuring notes, instructions, photo uploaders, and delivery address inputs can be smoothly scrolled well above the sticky footer and virtual keyboard on mobile devices.

