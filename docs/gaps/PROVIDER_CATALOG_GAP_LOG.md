# STRYT — Flow 8.1: Service Packages & Provider Catalog Gap Log

**Audit Date:** September 9, 2026  
**Flow Identifier:** Flow 8.1 — Domain 8 (Provider / Freelancer Console Operations)  
**Primary Components:** [`ProviderCatalog.tsx`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderCatalog.tsx), [`CatalogManager.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/manage/CatalogManager.tsx), [`ProviderProfileHub.tsx`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderProfileHub.tsx), [`ProviderDetail.tsx`](file:///d:/zetax/name/STRYT/src/screens/provider/ProviderDetail.tsx)  
**Backend Services & Tables:** `providerService.ts`, `uploadService.ts`, `public.catalog_items` (scoped by `provider_id`; `provider_packages` was retired in `20260720`), RLS policy (`write_catalog`)  
**Launch Readiness Status:** 🟡 **Audited & Blocked by P0 Cache Desync, P0 Destructive Deletions & P1 Navigation Loss**

---

## 1. Executive Summary

Flow 8.1 governs how solo professionals, technicians, tutors, artisans, and freelancers publish their services, pricing packages, and service options (`/provider/:id/manage/catalog`). While early architectural drafts utilized a dedicated `provider_packages` table, migration `20260720_provider_catalog_and_remove_packages.sql` unified businesses and providers onto a single normalized `catalog_items` table with a `provider_id` foreign key. `ProviderCatalog.tsx` delegates directly to the shared `<CatalogManager kind="provider" />`.

Although the shared component architecture reduces code duplication, provider-specific auditing identified severe gaps across caching, mobile touch safety, navigation shell integrity, and package modeling:
1. **Provider Query Cache Lock:** Adding, modifying, or deleting service listings does not call `bustProviderGetCache(id)` or `invalidateQueryCache('provider:${id}')`. When returning to `ProviderProfileHub.tsx` or `ProviderDashboard.tsx`, cached service counts and outdated service prices persist.
2. **Accidental One-Tap Deletion:** The 34×34px red trash icon sits immediately beside the 34×34px edit pencil. A minor touchscreen slip permanently and instantly deletes the service listing and all associated configuration without confirmation.
3. **Unasserted Mutations & Silent RLS Rejections:** `providerService.updateCatalogItem()` and `deleteCatalogItem()` fail to verify affected row counts, returning false-positive success toasts when writes are rejected by RLS or expired credentials.
4. **Permanent Sale Price & Photo Cleared Bug:** In `CatalogManager.tsx:212-214`, clearing an existing discount or photo passes `undefined`, which is stripped from the JSON payload. PostgREST never executes `SET sale_price = NULL`, permanently locking discounts onto the service.
5. **Stripped Provider Navigation Shell:** `CatalogManager.tsx` omits `<ProviderManageNav pid={id} />` and uses `<div className="screen">`. Navigating into Services completely strips the provider's bottom navigation bar, leaving the screen isolated.
6. **Zero Tiered Packaging Capabilities:** Despite the flow's mandate ("Service Packages & Tiered Pricing"), `catalog_items` offers no package tiers (e.g. Basic, Standard, Premium), duration fields, or custom reordering controls.

---

## 2. Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **PCAT-1** | Missing Cache Invalidation Causes Provider Console & Storefront Stale Desync | 🔴 P0 (Stale UI & Pricing Inconsistency) | In `providerService.ts:255-273`, mutations do not invoke `bustProviderGetCache(id)` or `invalidateQueryCache('provider:${id}')`. The `ProviderProfileHub` badge remains stale, and customers browsing `/p/:id` continue seeing obsolete or deleted prices until cache TTL expires. |
| **PCAT-2** | Dangerous One-Tap Accidental Deletion on 34px Mobile Target | 🔴 P0 (Destructive Data Loss Hazard) | In `CatalogManager.tsx:129`, tapping the 34px trash icon immediately executes `service.deleteCatalogItem(id, item.id)`. On mobile touchscreens, accidental taps while aiming for the edit pencil irreversibly destroy services and pricing data. |
| **PCAT-3** | Silent No-Op Mutations Mask Failed Updates and Deletions | 🔴 P0 (False-Positive Write Feedback) | `providerService.updateCatalogItem()` and `deleteCatalogItem()` do not assert affected row counts. When an RLS policy rejects a write or session drops, PostgREST returns 0 rows without error, prompting a misleading "Item updated" toast. |
| **PCAT-4** | Undefined Payload Dropping Traps Sale Prices and Images Forever | 🟠 P1 (Irreversible Field Configuration) | `salePrice: sale ? Number(sale) : undefined` and `image: image \|\| undefined` strip keys from PostgREST updates. As a result, PostgreSQL never sets columns to `NULL`. Once a promotional price or image is added, the provider cannot remove it without deleting and recreating the item. |
| **PCAT-5** | Missing Navigation Bar Isolates Provider in Services Screen | 🟠 P1 (Shell Inconsistency & Trapped Navigation) | `CatalogManager.tsx:73` renders `<div className="screen">` without `<ProviderManageNav pid={id} />`. Navigating from `ProviderProfileHub` or `ProviderDashboard` destroys the bottom navigation bar. |
| **PCAT-6** | Base64 Fallback Contaminates Database on Storage Errors | 🟠 P1 (Database Bloat & Performance Degradation) | If image upload drops, `uploadService.upload()` falls back to `fileToDataUrl()`, writing raw multi-megabyte Base64 strings into `catalog_items.image`. |
| **PCAT-7** | Lack of Tiered Packaging & Service Duration Attributes | 🟡 P2 (Freelancer Pricing Inflexibility) | Freelancers cannot group services into tiers (Basic / Standard / Premium) or specify estimated service duration (e.g., "45 mins", "Half day"), which are critical for appointment scheduling. |
| **PCAT-8** | Unbounded Order Fluctuation in PostgreSQL Heap Order | 🟡 P2 (Merchandising Disorder) | `providerService._getUncoalesced` queries `catalog:catalog_items(*)` without `.order("created_at")` or sort order controls. Services jump positions unpredictably when edited. |
| **PCAT-9** | File Input Reselection Bug on Failed Uploads | 🟢 P3 (Minor Touch Polish) | In `pickImage`, omitting `fileRef.current.value = ""` prevents re-selecting the same image file if an upload fails. |

---

## 3. Detailed Findings & Root Cause Analysis

---

### 🔴 PCAT-1 (P0): Missing Cache Invalidation Causes Provider Console Desync

- **Location:** [`providerService.ts:255-273`](file:///d:/zetax/name/STRYT/src/services/marketplace/providerService.ts#L255-L273), [`CatalogManager.tsx:22-26, 55, 66`](file:///d:/zetax/name/STRYT/src/screens/business/manage/CatalogManager.tsx#L22-L26)
- **Root Cause:**
  `providerService` defines a cache buster at line 85:
  ```typescript
  export function bustProviderGetCache(id: string) {
    for (const key of [...inFlightProviderGet.keys()]) {
      if (key.startsWith(`${id}:`)) inFlightProviderGet.delete(key);
    }
  }
  ```
  However, `addCatalogItem`, `updateCatalogItem`, and `deleteCatalogItem` never call `bustProviderGetCache(id)`.
  In `CatalogManager.tsx`, calling `refetch()` updates only the local screen's `useQuery` state. It does not invoke `invalidateQueryCache('provider:${id}')`.
  When the provider navigates back to `ProviderProfileHub.tsx`:
  ```tsx
  <SettingsRow label="Services" hint={`${p?.catalog?.length ?? 0} services`} onClick={() => nav(`${base}/catalog`)} />
  ```
  `ProviderProfileHub` serves the stale cached `p` entity, displaying the old count. Furthermore, customers viewing `ProviderDetail.tsx` (`/p/:id`) see stale prices or deleted items until their cache expires.
- **Remediation Plan:**
  Call `bustProviderGetCache(id)` in all mutation methods in `providerService.ts`, and call `invalidateQueryCache('provider:${id}', () => bustProviderGetCache(id))` upon mutation completion.

---

### 🔴 PCAT-2 (P0): Dangerous One-Tap Accidental Deletion on 34px Mobile Target

- **Location:** [`CatalogManager.tsx:51-59, 127-130`](file:///d:/zetax/name/STRYT/src/screens/business/manage/CatalogManager.tsx#L127-L130)
- **Root Cause:**
  ```tsx
  <div className="col gap-8">
    <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={() => setEditing(item)}><Pencil size={15} /></button>
    <button className="icon-btn" style={{ width: 34, height: 34, color: "var(--red-600)" }} onClick={() => remove(item)}><Trash2 size={15} /></button>
  </div>
  ```
  The delete icon is 34×34px and positioned directly under the edit button. Tapping it calls:
  ```typescript
  async function remove(item: CatalogItem) {
    await service.deleteCatalogItem(id, item.id);
    showToast("Item removed");
    refetch();
  }
  ```
  There is no confirmation dialog, alert sheet, or undo option. On mobile touchscreens, a minor slip instantly and permanently deletes the service listing.
- **Remediation Plan:**
  Add a confirmation modal or native `window.confirm` before invoking `deleteCatalogItem`.

---

### 🔴 PCAT-3 (P0): Silent No-Op Mutations Mask Failed Updates and Deletions

- **Location:** [`providerService.ts:262-273`](file:///d:/zetax/name/STRYT/src/services/marketplace/providerService.ts#L262-L273)
- **Root Cause:**
  ```typescript
  async updateCatalogItem(id: string, itemId: string, patch: Partial<CatalogItem>) {
    const sb = getSupabase();
    const { data, error } = await sb.from("catalog_items").update(toSnake(patch)).eq("id", itemId).select().maybeSingle();
    throwIfError(error);
    return toCamel<CatalogItem>(data);
  },
  async deleteCatalogItem(id: string, itemId: string) {
    const sb = getSupabase();
    const { error } = await sb.from("catalog_items").delete().eq("id", itemId);
    throwIfError(error);
    return { ok: true };
  }
  ```
  Neither method asserts that rows were actually modified. If PostgREST returns 0 affected rows (due to an RLS mismatch, unauthenticated session, or invalid ID), `throwIfError(null)` does not throw. The UI displays false-positive "Item updated" or "Item removed" toasts.
- **Remediation Plan:**
  Add `select("id")` and assert affected rows via `assertRowsUpdated(data)`.

---

### 🟠 PCAT-4 (P1): Undefined Payload Dropping Traps Sale Prices and Images

- **Location:** [`CatalogManager.tsx:212-214`](file:///d:/zetax/name/STRYT/src/screens/business/manage/CatalogManager.tsx#L212-L214)
- **Root Cause:**
  ```typescript
  price: Number(price),
  salePrice: sale ? Number(sale) : undefined,
  image: image || undefined,
  ```
  In JavaScript object serialization, keys with `undefined` values are stripped from the payload. Supabase PostgREST receives an `UPDATE catalog_items` statement that omits `sale_price` and `image`.
  PostgreSQL never sets `sale_price` or `image` to `NULL`. Once a promotional price or image is saved, deleting the input text has no effect—the old price or image remains stuck forever.
- **Remediation Plan:**
  Pass `null` instead of `undefined` when optional fields are cleared:
  ```typescript
  salePrice: sale.trim() ? Number(sale) : null,
  image: image ? image : null,
  ```

---

### 🟠 PCAT-5 (P1): Missing Navigation Bar Isolates Provider in Services Screen

- **Location:** [`CatalogManager.tsx:73`](file:///d:/zetax/name/STRYT/src/screens/business/manage/CatalogManager.tsx#L73), [`ProviderManageNav.tsx:12`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderManageNav.tsx#L12)
- **Root Cause:**
  `ProviderManageNav.tsx` registers `/catalog` in `profileSubRoutes`.
  However, `CatalogManager.tsx` renders `<div className="screen">` with no bottom navigation bar for either business or provider.
  Navigating to Services strips the bottom navigation bar, breaking navigation continuity.
- **Remediation Plan:**
  When `kind === "provider"`, wrap the container in `<div className="screen with-nav">` and render `<ProviderManageNav pid={id} />` at the bottom of the screen (or `<ManageNav bizId={id} />` when `kind === "business"`).

---

## 4. Verification & Testing Checklist

- [ ] Adding, updating, or deleting a service immediately busts `providerService` cache and updates `ProviderProfileHub` counts.
- [ ] Tapping "Delete" shows a confirmation prompt; canceling preserves the listing.
- [ ] Clearing the sale price input sets `sale_price = NULL` in PostgreSQL and removes the discounted price on the public storefront.
- [ ] Clearing the service image resets `image = NULL` in the database.
- [ ] Bottom navigation (`ProviderManageNav`) renders consistently on `/provider/:id/manage/catalog`.
- [ ] Run `npm run check-colors` and `npx tsc --noEmit` to verify zero theme or type errors.
