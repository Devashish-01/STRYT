# STRYT — Flow 7.4: Bulk Deals & Group Buy Management Gap Log

**Audit Date:** September 9, 2026  
**Flow Identifier:** Flow 7.4 — Domain 7 (Storefront Console & Merchant Operations)  
**Primary Components:** [`BulkDealsManager.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BulkDealsManager.tsx), [`BulkDealDetail.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BulkDealDetail.tsx), [`BulkOrderSheet.tsx`](file:///d:/zetax/name/STRYT/src/components/BulkOrderSheet.tsx), [`bulkService.ts`](file:///d:/zetax/name/STRYT/src/services/marketplace/bulkService.ts)  
**Backend Services & Tables:** `bulk_deals`, `bulk_deal_pledges`, `bulk_deal_tokens`, `group_buy_tokens`, `20260900_bulk_deal_campaigns.sql`, `20260913_bulk_deal_delete_notify_pledgers.sql`  
**Launch Readiness Status:** 🟡 **Audited & Blocked by P0 Auto-Close and Token Issuance Flaws**

---

## 1. Executive Summary

Flow 7.4 allows local merchants to launch bulk-buying / wholesale campaigns (e.g. minimum order quantity pools, tiered pricing discounts, flat reservation deposits) and manage pledged orders, deadline extensions, and QR claim-pass redemptions upon customer pickup.

While the consumer-facing pledging UX and tier progress visualizations are well-structured, our architectural audit uncovered severe defects in backend campaign resolution, permissions, and handover accounting:
1. Any bulk deal created without an upfront deposit (a common and supported setting) will **never mint claim passes** when closed or fulfilled. The database closing logic strictly queries for `deposit_status = 'PAID'`, completely ignoring all pledges for no-deposit deals.
2. Deleting a completed campaign cascades and wipes all active customer QR tokens from the database, invalidating vouchers held by paying customers.
3. Delegated staff members cannot close or extend campaigns due to hardcoded `v_deal.owner_user_id <> v_uid` checks in database RPCs.
4. The QR redemption scanner validates that a pass is valid, but completely omits the remaining balance due, leaving shop staff with no way to know what amount of money to collect from the customer at handover.

---

## 2. Detailed Findings & Gap Analysis

### 🔴 BLK-1 (P0): Zero Claim Passes Issued for No-Deposit Campaigns

- **Location:** [`20260900_bulk_deal_campaigns.sql:340-349, 364-376`](file:///d:/zetax/name/STRYT/supabase/migrations/20260900_bulk_deal_campaigns.sql#L340-L376), [`BulkOrderSheet.tsx:35-41`](file:///d:/zetax/name/STRYT/src/components/BulkOrderSheet.tsx#L35-L41)
- **Problem:**
  Setting an upfront deposit is optional when creating a bulk deal. When a deal has no deposit (`deposit_amount IS NULL`), customer pledges are created with `deposit_status = 'UNPAID'` (default).
  In `_bulk_deal_close_internal`:
  ```sql
  select coalesce(sum(quantity), 0) into v_paid_qty
    from public.bulk_deal_pledges
   where deal_id = p_deal_id and deposit_status = 'PAID';

  if p_outcome is null and v_paid_qty >= v_deal.moq then
    p_outcome := 'FULFILLED';
  end if;

  if p_outcome = 'FULFILLED' then
    ...
    for m in
      select user_id, quantity from public.bulk_deal_pledges
       where deal_id = p_deal_id and deposit_status = 'PAID'
    loop
      insert into public.bulk_deal_tokens (...) values (...);
      ...
    end loop;
  end if;
  ```
  Because `deposit_status` is `'UNPAID'` for every pledge on a no-deposit deal:
  1. `v_paid_qty` always evaluates to 0. Auto-close triggers (`trg_check_bulk_deal_target`) and deadline sweeps (`close_expired_bulk_deals`) never mark the campaign as `FULFILLED`.
  2. If the owner manually closes the deal and marks it "Close & fulfil", `p_outcome` is set to `'FULFILLED'`. But the token insertion loop queries `WHERE deposit_status = 'PAID'` and finds **0 matching rows**!
  3. **Zero claim passes are minted.** Customers who pledged never receive their QR passes in `/community/activity` and receive no notification.
- **Impact:** Entire class of no-deposit group buy / wholesale campaigns fails completely upon completion. Customers cannot claim products, and merchants cannot scan vouchers.
- **Remediation:** Update `_bulk_deal_close_internal` and `check_bulk_deal_target_and_close` to recognize pledges where `(v_deal.deposit_amount IS NULL OR deposit_status = 'PAID')`.

---

### 🔴 BLK-2 (P0): Cascade Delete Destroys Active Claim Passes Without Safeguard

- **Location:** [`20260913_bulk_deal_delete_notify_pledgers.sql:44-46`](file:///d:/zetax/name/STRYT/supabase/migrations/20260913_bulk_deal_delete_notify_pledgers.sql#L44-L46), [`BulkDealsManager.tsx:197-241`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BulkDealsManager.tsx#L197-L241)
- **Problem:**
  When a merchant taps the trash can on a deal in [`BulkDealsManager.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BulkDealsManager.tsx), it invokes `bulk_deal_delete(p_deal_id)`:
  ```sql
  -- FK cascade removes bulk_deal_pledges/bulk_deal_tokens for this deal.
  delete from public.bulk_deals where id = p_deal_id;
  ```
  `bulk_deal_delete` checks if any deposits were `PAID` and sends a notification, but does **not** block deletion if the campaign was already fulfilled and active unredeemed tokens (`status = 'ISSUED'`) exist in `bulk_deal_tokens`.
  Due to the foreign key `on delete cascade` on `bulk_deal_tokens`, deleting the campaign row immediately wipes every issued customer QR voucher.
- **Impact:** Customers arrive at the storefront with a valid order, but their QR pass has disappeared from their app. Manual entry or scanning returns `TOKEN_NOT_FOUND`.
- **Remediation:** In `bulk_deal_delete`, check if unredeemed tokens exist (`EXISTS (SELECT 1 FROM bulk_deal_tokens WHERE deal_id = p_deal_id AND status = 'ISSUED')`). If so, raise an exception or require merchant confirmation to archive instead of deleting.

---

### 🟠 BLK-3 (P1): Delegated Managers Blocked from Closing or Extending Campaigns

- **Location:** [`20260900_bulk_deal_campaigns.sql:410, 440`](file:///d:/zetax/name/STRYT/supabase/migrations/20260900_bulk_deal_campaigns.sql#L410), [`App.tsx:699-706`](file:///d:/zetax/name/STRYT/src/App.tsx#L699-L706)
- **Problem:**
  In [`20260900_bulk_deal_campaigns.sql`](file:///d:/zetax/name/STRYT/supabase/migrations/20260900_bulk_deal_campaigns.sql):
  ```sql
  -- bulk_deal_close:
  if v_deal.owner_user_id <> v_uid then raise exception 'NOT_OWNER'; end if;
  -- bulk_deal_extend:
  if v_deal.owner_user_id <> v_uid then raise exception 'NOT_OWNER'; end if;
  ```
  Unlike `bulk_deal_delete` (which verifies `has_business_scope(business_id, uid, 'catalog')`), `bulk_deal_close` and `bulk_deal_extend` strictly require `v_deal.owner_user_id = v_uid`.
  Additionally, in [`App.tsx:699-706`](file:///d:/zetax/name/STRYT/src/App.tsx#L699-L706), `/business/:id/manage/bulk-deals` is enclosed within `<RequireOwner />`, which bounces all delegated managers. However, [`ManageDashboard.tsx:158-160`](file:///d:/zetax/name/STRYT/src/screens/business/manage/ManageDashboard.tsx#L158-L160) displays pending deposit action counts under the `catalog` scope:
  ```tsx
  (hasScope("catalog") ? bulkDepositClaims.length : 0);
  ```
- **Impact:** Store managers and staff invited to operate the shop cannot manage, close, or extend campaigns, creating a permission conflict and unhandled RPC rejections.
- **Remediation:** Update `bulk_deal_close` and `bulk_deal_extend` to allow users with `catalog` scope or admin privileges (`has_business_scope(v_deal.business_id, v_uid, 'catalog') OR is_admin()`). Align route guard in `App.tsx` to `RequireScope scope="catalog"`.

---

### 🟠 BLK-4 (P1): Blind Redemption — Scanner Lacks Remaining Balance Due

- **Location:** [`BulkDealsManager.tsx:91-103`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BulkDealsManager.tsx#L91-L103), [`20260900_bulk_deal_campaigns.sql:89-105`](file:///d:/zetax/name/STRYT/supabase/migrations/20260900_bulk_deal_campaigns.sql#L89-L105)
- **Problem:**
  In a wholesale campaign, customers pay a small reservation deposit (e.g. ₹50) upfront. When the group buy hits target, the unit price drops to the unlocked tier (e.g. ₹150/unit). A customer with 4 units owes 4 × ₹150 = ₹600, minus the ₹50 deposit = **₹550 remaining balance**.
  When merchant staff scan the QR code in `BulkDealsManager.tsx`, the success card displays only:
  ```tsx
  {lastRedeemed.tokenCode} accepted
  {lastRedeemed.itemLabel} · {lastRedeemed.quantity} units
  ```
  Neither the UI nor the `bulk_deal_tokens` table tracks or computes the deposit paid, unit price total, or balance remaining to be collected at the counter.
- **Impact:** Staff hand over bulk orders without collecting the remaining balance, incurring direct financial loss for the business.
- **Remediation:** Store `unit_price`, `deposit_paid`, and `balance_due` on the token (or compute it via join to the pledge), and prominently display `Balance to collect: ₹XXX` on the redemption confirmation sheet.

---

### 🟡 BLK-5 (P2): Cross-Store Voucher Leak for Multi-Location Businesses

- **Location:** [`bulkService.ts:456-467`](file:///d:/zetax/name/STRYT/src/services/marketplace/bulkService.ts#L456-L467), [`20260900_bulk_deal_campaigns.sql:541-546`](file:///d:/zetax/name/STRYT/supabase/migrations/20260900_bulk_deal_campaigns.sql#L541-L546)
- **Problem:**
  `bulkService.redeemToken(tokenCode)` only submits the code string without passing the current business ID context (`p_business_id`).
  The RPC `bulk_deal_token_redeem` checks:
  ```sql
  if not (
    v_token.issuer_user_id = v_uid
    or (v_token.business_id is not null and public.has_business_scope(v_token.business_id, v_uid, 'appointments'))
  ) then raise exception 'NOT_AUTHORIZED_TO_REDEEM';
  ```
  If an owner has two distinct storefronts (Store A and Store B), a customer can present a voucher issued for Store B at Store A. Because `v_token.issuer_user_id = v_uid` matches the merchant for both stores, Store A redeems Store B's pass.
- **Impact:** Inventory accounting discrepancies and fulfillment errors between branches.
- **Remediation:** Pass `p_business_id` to `bulk_deal_token_redeem` and assert `v_token.business_id = p_business_id`.

---

### 🟡 BLK-6 (P2): Raw Database Exceptions & Past Date Bug on Deadline Extension

- **Location:** [`BulkDealDetail.tsx:148-162, 264-268`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BulkDealDetail.tsx#L148-L162)
- **Problem:**
  The deadline extension field in `BulkDealDetail.tsx` uses `<input type="datetime-local">` with no `min` validation.
  If an owner accidentally selects a past timestamp or an invalid date, the database RPC returns `DEADLINE_MUST_BE_FUTURE`. If they attempt to extend an already fulfilled deal, it returns `DEAL_ALREADY_RESOLVED`.
  The UI displays `showToast(e?.message)`, displaying raw capitalized Postgres error codes to the merchant.
- **Impact:** Unpolished error states and user confusion.
- **Remediation:** Set `min={new Date().toISOString().slice(0, 16)}` on the input element and map error strings to human-friendly feedback.

---

### 🟢 BLK-7 (P3): Hardcoded `#fff` Modal Sheet Background in Dark Mode

- **Location:** [`BulkDealsManager.tsx:284`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BulkDealsManager.tsx#L284)
- **Problem:**
  The `DealComposer` bottom-sheet container specifies:
  ```tsx
  background: "#fff"
  ```
  In dark theme, opening "Edit campaign" presents a blinding bright white sheet that breaks dark mode consistency.
- **Impact:** Visual design inconsistency.
- **Remediation:** Replace `#fff` with `var(--surface)`.

---

## 3. Maturation Roadmap & Action Plan

| Gap ID | Priority | Description | Action Item |
| :--- | :---: | :--- | :--- |
| **BLK-1** | 🔴 P0 | No-deposit bulk deals never mint claim passes | Update `_bulk_deal_close_internal` to issue tokens for all pledges when `deposit_amount IS NULL`. |
| **BLK-2** | 🔴 P0 | Deleting campaign wipes customer QR passes | Prevent deleting campaigns with unredeemed `ISSUED` passes; archive instead. |
| **BLK-3** | 🟠 P1 | Delegated managers blocked from closing/extending | Add `catalog` scope check to `bulk_deal_close` & `bulk_deal_extend`; update `App.tsx` route guard. |
| **BLK-4** | 🟠 P1 | Redemption scanner omits remaining balance due | Compute balance due and display amount to collect on the pass redemption success card. |
| **BLK-5** | 🟡 P2 | Cross-store redemption voucher leak | Enforce `business_id` matching in `bulk_deal_token_redeem`. |
| **BLK-6** | 🟡 P2 | Raw server exceptions on deadline extension | Add `min` constraint on datetime picker and translate PostgreSQL error codes. |
| **BLK-7** | 🟢 P3 | Hardcoded `#fff` in DealComposer sheet | Replace `#fff` with `var(--surface)`. |
