# STRYT — Flow 7.8: Inventory Low-Stock Alerts & Stock Management Gap Log

**Audit Date:** September 9, 2026  
**Flow Identifier:** Flow 7.8 — Domain 7 (Storefront Console & Merchant Operations)  
**Primary Components:** [`InventoryAlerts.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/manage/InventoryAlerts.tsx), [`CatalogManager.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/manage/CatalogManager.tsx), [`BusinessStoreHub.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BusinessStoreHub.tsx)  
**Backend Services & Tables:** `businessService.ts`, `providerService.ts`, `public.catalog_items`  
**Launch Readiness Status:** 🟡 **Audited & Blocked by P0 Cache Desync & Stepper Lockout Gaps**

---

## 1. Executive Summary

Flow 7.8 provides shop owners and authorized inventory staff with their centralized stock management console (`/business/:id/manage/inventory`). Designed to transform passive alert notifications into actionable control, the screen lists all catalog items categorized by health status (Out of stock, Running low, In stock) and offers quick one-tap inline stock toggles and quantity steppers without forcing the user to open the full product editor.

While the categorized breakdown and inline controls are convenient, auditing uncovered several severe operational friction points and state synchronization defects:
1. **Missing Query Cache Invalidation & Storefront Desync:** Inline quantity updates and availability toggles do not invoke `bustBusinessGetCache(id)` or `invalidateQueryCache('business:${id}')`. When the merchant navigates back to the catalog, store hub, or customer-facing storefront, stale stock numbers and out-of-date low-stock badges persist.
2. **Restock Stepper Lockout on Sold-Out Items:** Once an item is marked out of stock (`stockStatus === "OUT_OF_STOCK"`), the quantity stepper controls (`+` / `-`) are completely hidden. If a merchant receives a shipment of 30 units, they cannot simply increment the stock; they must tap "Back in stock" (which resets quantity to 1), and then tap `+` 29 times, or open the full modal form.
3. **Missing Console Navigation Bar:** `InventoryAlerts.tsx` omits `<ManageNav bizId={id} />` and uses `<div className="screen">`, stripping the bottom navigation bar and trapping merchants in a sub-page without quick access to other console tabs.
4. **Absolute Overwrite Race Conditions:** Quantity nudges write absolute numbers (`quantity: next`) rather than delta adjustments. Concurrent updates between staff members or rapid offline taps clobber true inventory levels.
5. **Hardcoded Threshold & Missing Search:** The low-stock threshold is globally hardcoded to 5 units (`LOW_STOCK_THRESHOLD = 5`), ignoring business context (e.g. bulk groceries vs. high-value electronics), and large inventories lack a search filter.

---

## 2. Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **INV-1** | Missing Cache Invalidation Causes Cross-Console Stock Desynchronization | 🔴 P0 (Stale Data & Over-Selling Hazard) | In `InventoryAlerts.tsx:72-74`, `updateCatalogItem` updates the database and calls local `refetch()`. However, `bustBusinessGetCache(id)` and `invalidateQueryCache('business:${id}')` are not called. The Store Hub badge (`BusinessStoreHub.tsx:20-22`) and customer storefront (`BusinessDetail.tsx`) serve cached stale stock, allowing customers to continue purchasing depleted items. |
| **INV-2** | Restock Stepper Lockout on Out-of-Stock Items | 🔴 P0 (Operational Friction & Workflow Block) | In `InventoryAlerts.tsx:142`, `{finite && !out && ...}` hides the quantity counter when an item is out of stock. Merchants receiving bulk restocks cannot input or step the new inventory count directly on the row, forcing cumbersome multi-tap workarounds. |
| **INV-3** | Missing Bottom Console Navigation Traps Merchants | 🟠 P1 (Inconsistent Layout & Navigation Friction) | `InventoryAlerts.tsx:155` lacks `<ManageNav bizId={id} />`. Entering inventory management removes the primary bottom navigation bar, breaking consistency with `CatalogManager` and `HoursEditor`. |
| **INV-4** | Absolute Quantity Overwrite Clashes During Concurrent Updates | 🟠 P1 (Inventory Drift & Data Clobbering) | In `nudge()`, `next = Math.max(0, (item.quantity ?? 0) + delta)` calculates the new quantity on the client and executes `UPDATE catalog_items SET quantity = next`. If two staff members update stock on separate devices, the second write clobbers the first rather than applying an atomic increment. |
| **INV-5** | Hardcoded 5-Unit Alert Threshold Without Customization | 🟡 P2 (Inflexible Inventory Warning) | `LOW_STOCK_THRESHOLD = 5` is hardcoded. Grocers selling 100 kg of rice daily receive no warning at 6 kg, while high-value boutique items trigger false warnings at 4 units. |
| **INV-6** | Lack of Search and Category Filters for Large Stores | 🟡 P2 (Merchant Usability Bottleneck) | Shops with 50+ items must scroll through three unindexed lists to find a specific product to update stock. |

---

## 3. Detailed Findings & Root Cause Analysis

---

### 🔴 INV-1 (P0): Missing Cache Invalidation Causes Cross-Console Stock Desynchronization

- **Location:** [`InventoryAlerts.tsx:67-80`](file:///d:/zetax/name/STRYT/src/screens/business/manage/InventoryAlerts.tsx#L67-L80), [`businessService.ts:767-772`](file:///d:/zetax/name/STRYT/src/services/marketplace/businessService.ts#L767-L772)
- **Root Cause:**
  ```typescript
  async function patch(item: CatalogItem, changes: Partial<CatalogItem>, okMsg: string) {
    ...
    try {
      await serviceFor(kind).updateCatalogItem(id, item.id, changes);
      showToast(okMsg);
      refetch();
    } ...
  }
  ```
  `updateCatalogItem` does not invoke `bustBusinessGetCache(id)`.
  The local `refetch()` updates the current view, but does not invalidate the shared `business:${id}` query cache entry used across the application.
  When the merchant returns to `BusinessStoreHub.tsx`, `flaggedCount` is computed from the stale cached `business.catalog` array, continuing to display `"X items need restocking"`.
  More critically, customer sessions viewing `BusinessDetail.tsx` or `CartCheckoutSheet.tsx` continue reading stale inventory data, allowing checkout attempts that crash with `INSUFFICIENT_STOCK`.
- **Remediation Plan:**
  In `businessService.updateCatalogItem()` and `patch()`, call `bustBusinessGetCache(id)` and `invalidateQueryCache('business:${id}', () => bustBusinessGetCache(id))`.

---

### 🔴 INV-2 (P0): Restock Stepper Lockout on Out-of-Stock Items

- **Location:** [`InventoryAlerts.tsx:142-148`](file:///d:/zetax/name/STRYT/src/screens/business/manage/InventoryAlerts.tsx#L142-L148)
- **Root Cause:**
  ```tsx
  {finite && !out && (
    <div className="row gap-6 center-v">
      <button type="button" className="btn btn-sm btn-outline" onClick={() => nudge(item, -1)}>−</button>
      <span className="semi small">{item.quantity ?? 0}</span>
      <button type="button" className="btn btn-sm btn-outline" onClick={() => nudge(item, 1)}>+</button>
    </div>
  )}
  ```
  Because the condition includes `!out`, once an item is marked sold out, the entire stepper UI disappears.
  To restock, the merchant must:
  1. Tap `"Back in stock"`, which executes `patch(..., { stockStatus: "IN_STOCK", quantity: 1 })`.
  2. Wait for the network request and refetch to complete.
  3. Locate the item (which has now jumped into the "Running low" section).
  4. Tap the `+` button repeatedly to reach the actual stock count, or tap the item to open the full modal sheet.
- **Remediation Plan:**
  Keep the quantity counter visible for finite items even when out of stock. Allow tapping `+` on an out-of-stock finite item to automatically increment from 0 to 1 and flip `stockStatus` to `IN_STOCK` in a single action.

---

### 🟠 INV-3 (P1): Missing Bottom Console Navigation Traps Merchants

- **Location:** [`InventoryAlerts.tsx:154-212`](file:///d:/zetax/name/STRYT/src/screens/business/manage/InventoryAlerts.tsx#L154-L212)
- **Root Cause:**
  The component renders `<div className="screen">` without `<ManageNav bizId={id} />`.
  Unlike `CatalogManager`, `BusinessPortfolio`, and `HoursEditor`, navigating to `/inventory` strips the merchant's bottom navigation bar, leaving the screen isolated.
- **Remediation Plan:**
  Change outer container to `<div className="screen with-nav">` and render `<ManageNav bizId={id} />` at the bottom of the screen.

---

### 🟠 INV-4 (P1): Absolute Quantity Overwrite Clashes During Concurrent Updates

- **Location:** [`InventoryAlerts.tsx:95-104`](file:///d:/zetax/name/STRYT/src/screens/business/manage/InventoryAlerts.tsx#L95-L104)
- **Root Cause:**
  `nudge()` reads `item.quantity` from component props and sends an absolute value:
  `{ quantity: next, stockStatus: "IN_STOCK" }`.
  If Staff Member A adjusts stock by +5 while Staff Member B sells 2 units, whoever's network request resolves last completely overwrites the other's quantity rather than applying atomic increments.
- **Remediation Plan:**
  Implement an RPC or server-side atomic update (`increment_catalog_stock(item_id, delta)`), or add optimistic locking via updated_at / version column.

---

## 4. Verification & Testing Checklist

- [ ] Updating quantity or stock status immediately busts query cache and updates `BusinessStoreHub` badges.
- [ ] Tapping `+` on an out-of-stock finite item increments quantity and marks it in-stock without layout jumping.
- [ ] `<ManageNav bizId={id} />` renders correctly at the bottom of the inventory management screen.
- [ ] Inline stock updates disable buttons during in-flight mutations to prevent rapid double-tap desync.
- [ ] Run `npm run check-colors` and `npx tsc --noEmit` to ensure zero compilation or theme regressions.
