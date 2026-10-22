# STRYT Codebase Audit: Unimplemented & Mocked Workflows

This document lists all the components, functions, buttons, and workflows in STRYT that are currently stubbed, mocked (client-side only), or hardcoded.

---

## 1. Service Layer Stubs & Mocks

### [appointmentService.ts](file:///d:/zetax/name/STRYT/src/services/appointmentService.ts)
* **Status**: Client-side storage only.
* **Details**:
  * Uses `localStorage` (`stryt_appointments`) as its primary database.
  * `create(...)` pushes a record into local storage and attempts to sync a lead into the Supabase `leads` table in a fire-and-forget block.
  * `listForCustomer(...)`, `listForTarget(...)`, and `updateStatus(...)` run completely on local storage. No database tables exist to fetch or query appointments.

### [adminService.ts](file:///d:/zetax/name/STRYT/src/services/adminService.ts)
* **Status**: Partially hardcoded.
* **Details**:
  * The administrative overview metrics for `pushDelivery`, `dau`, and `mau` are hardcoded to `0` with the comment `// No analytics pipeline yet — these stay 0 until one is wired.`

### [businessService.ts](file:///d:/zetax/name/STRYT/src/services/businessService.ts)
* **Status**: Partially stubbed / mock fallbacks.
* **Details**:
  * `get(...)` and `reviews(...)` return hardcoded static data if the ID matches `"b1"` or starts with `"biz_mock_"`.
  * `submitForReview(...)` updates the business `status` directly to `"ACTIVE"`, bypassing any actual admin queue or approval step.
  * `reservations(...)` is a stub that always returns `[]`.
  * `setReservation(...)` is a stub that always returns `{ ok: false }`.
  * `team(...)` is a stub that always returns `[]`.
  * `buyBoost(...)` inserts directly into the `boosts` table without processing any financial checkout (labeled "billed offline / free for now").
  * `analytics(...)` has the `catalogViews` metric hardcoded to `0` because catalog item views are not tracked.

### [providerService.ts](file:///d:/zetax/name/STRYT/src/services/providerService.ts)
* **Status**: Partially stubbed / mock fallbacks.
* **Details**:
  * `get(...)` and `reviews(...)` return hardcoded static data if the ID matches `"p1"` or starts with `"prov_mock_"`.

### [socialService.ts](file:///d:/zetax/name/STRYT/src/services/socialService.ts)
* **Status**: Partially stubbed.
* **Details**:
  * `queue(...)` is a stub that always returns `undefined` (marked as a V2 feature: "Live queue has no backend table yet (V2)").
  * `collections(...)` is a stub that always returns `[]` (marked as a V2 feature: "Collections have no backend yet (V2)").

### [societyService.ts](file:///d:/zetax/name/STRYT/src/services/societyService.ts)
* **Status**: UI/API Input mismatch.
* **Details**:
  * `issueGatePass(...)` accepts a phone number entered in a text field on the UI and assigns it directly as `provider_user_id` in the database without looking up if the provider is registered as a user, causing placeholder values to be stored in the database.

---

## 2. User Interface Placeholders & Stubs

### [AgreementScreen.tsx](file:///d:/zetax/name/STRYT/src/screens/requests/AgreementScreen.tsx#L329-L331)
* **Status**: Commented out / disabled online payment.
* **Details**:
  * Razorpay payment buttons are completely commented out:
    ```tsx
    {/* Online payment (Razorpay) is disabled for v1 — settle offline.
        Re-enable once the create-razorpay-order / verify-razorpay-payment
        edge functions and the payments table escrow flow are live. */}
    ```
  * Replaced by a text banner instructing users to pay offline in person.

### [BusinessDetail.tsx](file:///d:/zetax/name/STRYT/src/screens/business/BusinessDetail.tsx#L467)
* **Status**: Cart checkout button disabled.
* **Details**:
  * When items are added to the cart, the cart checkout bar's button triggers a mock toast:
    ```tsx
    onClick={() => showToast("Checkout & in-app pay arrive in V3 — call the shop to order!")}
    ```

### [ManageHub.tsx](file:///d:/zetax/name/STRYT/src/screens/manage/ManageHub.tsx#L41)
* **Status**: Hardcoded metric.
* **Details**:
  * The business call metric count is hardcoded to `142` instead of pulling the dynamic `b.callCount` or `b.interactionCount`.
    ```tsx
    <span className="row gap-4"><Phone size={12} /> 142</span>
    ```

### [ManageDashboard.tsx](file:///d:/zetax/name/STRYT/src/screens/business/manage/ManageDashboard.tsx#L82)
* **Status**: Hardcoded metric.
* **Details**:
  * The questions KPI card value is hardcoded to `0` instead of query-fetching the total Q&As.
    ```tsx
    <Kpi icon={HelpCircle} color="#6366f1" value={0} label="Questions" trend="" />
    ```

### [Reservations.tsx](file:///d:/zetax/name/STRYT/src/screens/business/manage/Reservations.tsx#L13)
* **Status**: Screen displays empty state only.
* **Details**:
  * Fetches data via `businessService.reservations(id)`, which always returns `[]`. Thus, this screen can never display pending reservations or execute accept/decline actions.
