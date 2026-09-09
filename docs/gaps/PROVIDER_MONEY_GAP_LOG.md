# STRYT — Flow 8.5: Provider Money & Receipts Tracking Gap Log

**Audit Date:** September 9, 2026  
**Flow Identifier:** Flow 8.5 — Domain 8 (Provider / Freelancer Console Operations)  
**Primary Components:** [`ProviderMoney.tsx`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderMoney.tsx), [`PaymentStatusCard.tsx`](file:///d:/zetax/name/STRYT/src/components/PaymentStatusCard.tsx), [`ProviderDashboard.tsx`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderDashboard.tsx)  
**Backend Services & Tables:** `providerService.ts`, `appointmentService.ts`, `uploadService.ts`, `public.settlements`, `public.appointments`, `public.providers`  
**Launch Readiness Status:** 🔴 **Audited & Blocked by P0 Appointment Earnings Omission & P0 LocalStorage QR Anti-Pattern**

---

## 1. Executive Summary

Flow 8.5 provides solo service providers with their financial hub (`/provider/:id/manage/money`). This screen acts as the provider's cash register and financial command center: tracking offline earnings, displaying week-to-date income, confirming or disputing customer payment claims, managing payout handles (UPI VPA and custom QR codes), and setting upfront booking deposit policies.

While the UI is well-structured with clear cards and status pills, deep architectural auditing revealed two critical P0 accounting and persistence defects:
1. **Critical Appointment Earnings Omission (P0):** The earnings summary ("Earned offline", "This week") and the "Earnings history" ledger query exclusively from the `public.settlements` table. However, `settlements` are populated *only* when a custom work agreement is marked `COMPLETED`. When a provider fulfills direct service appointments (Flow 2.1 / 2.3) and confirms customer payments (`payment_status = 'PAID'`), **zero rows are created in `settlements`**. Consequently, a provider who completes ₹25,000 in direct appointment bookings sees **₹0** in total earnings, **₹0** this week, and an empty ledger.
2. **LocalStorage Anti-Pattern for Payment QR (P0):** When a provider uploads their payment QR image, the URL is stored exclusively in the browser's `localStorage` (`stryt_upi_qr_${id}`). It is never written to PostgreSQL. Customers on other devices cannot see the QR, switching phones wipes the configuration, and upload fallbacks inject multi-megabyte Base64 data into `localStorage`, risking quota exhaustion.
3. **Trapped In-Person Cash Settlements (P1):** For appointments in "Awaiting payment", providers have no button to record cash received in person. If a client leaves without submitting a claim in their app, the appointment remains permanently stuck in "UNPAID".
4. **Missing Cache Invalidation (P1):** Updates to UPI ID, payment timing, or deposit percentages do not bust in-flight coalesced caches or invalidate React query keys, serving stale configurations to clients and hub screens.
5. **Unvalidated UPI VPA Ingestion (P1):** The UPI field accepts arbitrary unvalidated strings (e.g. `"hello"`, `"1234"`), creating malformed `upi://pay` deep links and broken dynamic QR codes.

---

## 2. Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **MONEY-1** | Appointment Earnings Excluded from Provider Earnings Summary & Ledger | 🔴 P0 (Accounting Black Hole) | `analytics.earnings` and `earningsLedger()` query only `public.settlements` (which records only agreements). All direct appointment booking revenue is excluded. Providers with dozens of paid bookings see ₹0 earnings and an empty ledger. |
| **MONEY-2** | LocalStorage Anti-Pattern for Custom Payment QR Code | 🔴 P0 (Phantom Configuration) | Custom QR codes are saved only in `localStorage.setItem("stryt_upi_qr_" + id, url)`. The URL is never persisted to Supabase. Customers on external devices cannot see it, device switching wipes it, and Base64 fallback triggers storage quota crashes. |
| **MONEY-3** | In-Person Cash Payments Trapped with No Owner Record Action | 🟠 P1 (Uncloseable Booking Loop) | "Awaiting payment" bookings only permit customer claims. The provider has no "Record Cash Received" action for standard appointments (RPC `appointment_record_walk_in_payment` blocks non-walk-in bookings). Appointments get stuck in UNPAID indefinitely. |
| **MONEY-4** | Missing Cache Invalidation on Payment & Configuration Updates | 🟠 P1 (Stale Public Storefront) | Saving UPI ID, payment timing, or deposit percentage does not invoke `bustProviderGetCache(id)` or `invalidateQueryCache('provider:${id}')`. Public storefronts and management dashboards continue serving stale payment data. |
| **MONEY-5** | Unvalidated UPI ID Allows Corrupt VPA Ingestion | 🟠 P1 (Broken Customer Checkout) | `saveUpi()` performs no syntax validation. Invalid strings break UPI deep-linking and dynamic QR code generation in customer checkout. |
| **MONEY-6** | Mismatched Realtime Channel on Earnings Ledger | 🟡 P2 (Stale Live Feedback) | The earnings ledger subscribes to `settlements`, so confirming appointment payments never updates the earnings ledger in real time. |
| **MONEY-7** | Unbounded Upfront Deposit Percentage Input | 🟡 P2 (Data Integrity) | The deposit input field lacks inline constraints and clear helper copy for values outside 0–100%. |
| **MONEY-8** | Substandard Button Touch Targets on Mobile | 🟢 P3 (Accessibility) | Config action buttons (`btn-sm`) measure ~32px in height, violating the 44px WCAG mobile touch target recommendation. |

---

## 3. Detailed Findings & Root Cause Analysis

---

### 🔴 MONEY-1 (P0): Appointment Earnings Excluded from Provider Earnings Summary & Ledger

- **Location:** [`providerService.ts:377-380, 405-422`](file:///d:/zetax/name/STRYT/src/services/marketplace/providerService.ts#L377-L380), [`ProviderMoney.tsx:81-83, 178-196`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderMoney.tsx#L178-L196)
- **Root Cause:**
  1. In [`providerService.ts:377-380`](file:///d:/zetax/name/STRYT/src/services/marketplace/providerService.ts#L377-L380):
     ```typescript
     const [..., settleRes, ...] = await Promise.all([
       ...
       sb.from("settlements").select("amount").eq("user_id", uid),
     ]);
     const earnings = (settleRes.data ?? []).reduce((sum: number, s: any) => sum + (s.amount ?? 0), 0);
     ```
  2. In [`providerService.ts:405-422`](file:///d:/zetax/name/STRYT/src/services/marketplace/providerService.ts#L405-L422):
     ```typescript
     async earningsLedger(id: string): Promise<EarningEntry[]> {
       ...
       const { data, error } = await sb
         .from("settlements")
         .select("id, amount, tip, mode, note, created_at, agreement_id")
         .eq("user_id", uid)
         .order("created_at", { ascending: false });
     ```
  3. `public.settlements` is *only* written by the trigger `trg_settlements` on `public.agreements` when a custom request is completed.
  4. When a customer books an appointment and the provider clicks "Confirm payment" in `ProviderMoney.tsx` (`appointmentService.confirmPayment()`), the database executes `appointment_confirm_payment()`, updating `appointments.payment_status = 'PAID'`.
  5. **No row is ever inserted into `settlements` for appointments.**
  6. In contrast, `walletService.transactions()` correctly queries both `settlements` and `appointments` (`eq("payment_status", "PAID")`).
  7. Because `providerService` queries only `settlements`, all appointment revenue is missing from:
     - `analytics.earnings` ("Earned offline")
     - `thisWeek` calculation
     - `earningsLedger` ("Earnings history" table)
- **Remediation Plan:**
  Unify `providerService.analytics()` and `providerService.earningsLedger()` to aggregate both `settlements` (custom agreements) and `appointments` where `target_id = id AND payment_status = 'PAID'`.

---

### 🔴 MONEY-2 (P0): LocalStorage Anti-Pattern for Custom Payment QR Code

- **Location:** [`ProviderMoney.tsx:57, 123-125, 135`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderMoney.tsx#L123-L125), [`ProviderDashboard.tsx:644`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderDashboard.tsx#L644)
- **Root Cause:**
  ```typescript
  async function handleQrUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingQr(true);
    try {
      const url = await uploadService.upload(file, "verification");
      localStorage.setItem("stryt_upi_qr_" + id, url);
      setCustomQrUrl(url);
      showToast("Custom QR code uploaded!");
  ```
  1. The custom QR URL is stored solely in the current browser's `localStorage` key `stryt_upi_qr_${id}`.
  2. The `providers` table has no column for `payment_qr_url` or `custom_qr_url`.
  3. Because it only exists in the provider's local browser storage, prospective customers visiting `/p/:id` from their own phones or computers never see this QR code.
  4. If the provider uses a different phone or clears browser cache, the QR image disappears.
  5. If `uploadService.upload()` fails due to network drop, it falls back to `fileToDataUrl()`. Writing a 3MB Base64 string into `localStorage` throws an unhandled `QuotaExceededError` on iOS Safari and mobile Chrome.
- **Remediation Plan:**
  1. Add `payment_qr_url text` column to `public.providers` (and `public.businesses`).
  2. Update `providerService.update()` to persist `paymentQrUrl` directly to Supabase.
  3. Read `p.paymentQrUrl` across `ProviderMoney.tsx`, `ShareCard.tsx`, and customer-facing payment sheets.

---

### 🟠 MONEY-3 (P1): In-Person Cash Payments Trapped with No Owner Record Action

- **Location:** [`ProviderMoney.tsx:230-248`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderMoney.tsx#L230-L248), [`20260841_business_team_scopes.sql:308`](file:///d:/zetax/name/STRYT/supabase/migrations/20260841_business_team_scopes.sql#L308)
- **Root Cause:**
  In `ProviderMoney.tsx`, appointments awaiting payment are rendered as read-only cards:
  ```tsx
  {awaitingPayment.map((apt) => (
    <div key={apt.id} className="card row between center-v" style={{ padding: 12 }}>
      ...
      <span className="badge badge-amber">{inr(apt.packagePrice ?? 0)}</span>
    </div>
  ))}
  ```
  The database RPC `appointment_record_walk_in_payment` has an explicit guard:
  ```sql
  if not v_allowed or not v_appointment.is_walk_in then raise exception 'NOT_WALK_IN_MANAGER'; end if;
  ```
  If a customer booked online, received service, and paid the provider ₹500 in physical cash without opening their phone to submit an in-app payment claim, the provider has no way to mark the payment received. The booking sits in "Awaiting payment" indefinitely.
- **Remediation Plan:**
  Introduce an owner action on awaiting payment cards: "Record Cash Payment", backed by a dedicated transition RPC or allowing owners to record offline cash receipt on completed appointments.

---

### 🟠 MONEY-4 (P1): Missing Cache Invalidation on Payment & Configuration Updates

- **Location:** [`ProviderMoney.tsx:108, 145, 159`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderMoney.tsx#L108), [`providerService.ts:183-190`](file:///d:/zetax/name/STRYT/src/services/marketplace/providerService.ts#L183-L190)
- **Root Cause:**
  `providerService.update()` updates the `providers` row but does not call `bustProviderGetCache(id)`.
  In `ProviderMoney.tsx`, neither `saveUpi()`, `savePaymentTiming()`, nor `saveDepositPercent()` calls `invalidateQueryCache('provider:${id}')`.
  Consequently, `ProviderProfileHub`, `ProviderDashboard`, and public booking sheets continue serving pre-mutation cached settings.
- **Remediation Plan:**
  Call `bustProviderGetCache(id)` inside `providerService.update()`, and trigger `invalidateQueryCache('provider:${id}')` upon configuration saves.

---

### 🟠 MONEY-5 (P1): Unvalidated UPI ID Allows Corrupt VPA Ingestion

- **Location:** [`ProviderMoney.tsx:105-115`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderMoney.tsx#L105-L115)
- **Root Cause:**
  ```typescript
  async function saveUpi() {
    setSavingUpi(true);
    try {
      await providerService.update(id, { upiId: upiId.trim() || null } as any);
  ```
  There is no format validation. A provider can type `"abc"`, `"test"`, or an email address without an `@handle`.
  This corrupt string is saved to the database. When a customer attempts to pay on `/p/:id`, UPI intent deep links (`upi://pay?pa=...`) fail to open or error out in banking apps, breaking payments completely.
- **Remediation Plan:**
  Validate the UPI handle format (`/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/`) before saving, displaying an actionable error if the handle is invalid.

---

### 🟡 MONEY-6 (P2): Mismatched Realtime Channel on Earnings Ledger

- **Location:** [`ProviderMoney.tsx:30-36`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderMoney.tsx#L30-L36)
- **Root Cause:**
  The ledger query listens to `"settlements"`. When an appointment payment is confirmed, only the `appointments` table changes. The earnings history never refreshes live.
- **Remediation Plan:**
  Subscribe to both `"settlements"` and `"appointments"`, or trigger refetch of ledger and analytics on payment confirmation.

---

### 🟡 MONEY-7 (P2): Unbounded Upfront Deposit Percentage Input

- **Location:** [`ProviderMoney.tsx:327-334`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderMoney.tsx#L327-L334)
- **Root Cause:**
  While `saveDepositPercent` clamps to 0–100 on submit, the input field allows typing arbitrary values (e.g. `999`), creating visual confusion without immediate inline validation warnings.
- **Remediation Plan:**
  Enforce numeric clamp `min={0} max={100}` on change and provide visual indication of deposit balance.

---

### 🟢 MONEY-8 (P3): Substandard Button Touch Targets on Mobile

- **Location:** [`ProviderMoney.tsx:260, 274, 278, 335`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderMoney.tsx#L260)
- **Root Cause:**
  Configuration buttons use `btn-sm` measuring ~32px, below the 44×44px mobile touch target standard.
- **Remediation Plan:**
  Increase vertical padding to ensure comfortable mobile hitboxes.

---

## 4. Verification & Testing Checklist

- [ ] Confirming an appointment payment updates total earnings and adds an entry to the earnings history ledger.
- [ ] Uploading a custom QR code persists the image URL to `providers.payment_qr_url` in Supabase (not just localStorage).
- [ ] Customers visiting the public provider profile can view and scan the provider's custom payment QR code.
- [ ] Providers can record in-person cash receipt for completed appointments awaiting payment.
- [ ] Saving UPI ID validates VPA format (`handle@bank`) and rejects invalid input with clear feedback.
- [ ] Saving UPI, payment timing, or deposit percentage invalidates the provider cache across the app.
- [ ] Deposit percentage is strictly bounded between 0% and 100%.
- [ ] Run `npm run check-colors` and `npx tsc --noEmit` to verify type and design token compliance.
