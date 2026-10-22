# STRYT — Flow 7.6: Portfolio & Visual Gallery Manager Gap Log

**Audit Date:** September 9, 2026  
**Flow Identifier:** Flow 7.6 — Domain 7 (Storefront Console & Merchant Operations)  
**Primary Components:** [`BusinessPortfolio.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BusinessPortfolio.tsx), [`BusinessStoreHub.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BusinessStoreHub.tsx), [`BusinessDetail.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/BusinessDetail.tsx)  
**Backend Services & Tables:** `businessService.ts`, `uploadService.ts`, `curatedImages.ts`, `business_portfolio_items`, Supabase Storage (`portfolio` bucket)  
**Launch Readiness Status:** 🟡 **Audited & Blocked by P0 Phantom Item Bleed & P0 Unconfirmed Deletion Gaps**

---

## 1. Executive Summary

Flow 7.6 provides merchants with their visual portfolio and past-work showcase manager. Through `/business/:id/manage/portfolio`, store owners and authorized catalog staff upload photographs of their completed work, custom creations, salon styling results, and shop ambiance. These samples are displayed prominently on the public storefront (`/b/:id`) within the dedicated **Work** tab and interactive full-screen photo viewer.

While the photo upload and thumbnail grid offer a clean starting point, auditing the codebase uncovered severe data integrity, caching, and mobile touch safety defects:
1. **Phantom Fallback Bleed:** When a shop has not yet uploaded portfolio items, `businessService.get(id)` invokes `enrichBusinessPortfolio()`, generating synthetic items with fake IDs (`bp_fb_...`). These mock items bleed directly into the owner's management console. Merchants cannot delete them (the deletion no-ops in SQL and the items resurrect on refetch) and cannot save captions to them.
2. **One-Tap Accidental Deletion:** The 28×28px trash icon sits immediately beside the 28×28px edit pencil. Tapping it instantly and permanently destroys the portfolio record with zero confirmation prompt, undo toast, or safety net.
3. **No Row Assertion on Mutations:** `businessService.updatePortfolio()` and `deletePortfolio()` perform PostgREST operations without verifying affected row counts. When RLS rejects an update or an invalid ID is passed, the UI displays false positive "Saved" or "Removed" toasts.
4. **Cache Clashing & Stale Views:** Uploading, modifying, or removing items does not invoke `bustBusinessGetCache(id)` or `invalidateQueryCache('business:${id}')`, resulting in stale storefronts and desynchronized management sessions.
5. **Storage Fallback Base64 Injection:** If storage uploads fail or time out, `uploadService.upload()` falls back to full Base64 data URLs, injecting multi-megabyte strings into `business_portfolio_items.url` and degrading fetch performance.

---

## 2. Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **PORT-1** | Phantom Fallback Items Bleed into Management Console & Break Deletions/Edits | 🔴 P0 (Data Illusion & Operation Failure) | When a business has no uploaded samples, `enrichBusinessPortfolio` generates synthetic items with IDs like `bp_fb_${businessId}_${i}`. The management screen renders these as if they are the owner's real items. Deleting them attempts a DELETE on non-existent IDs, and on `refetch()` the exact same synthetic items re-appear. Caption edits also silently fail. |
| **PORT-2** | Dangerous One-Tap Accidental Deletion on 28px Mobile Touch Target | 🔴 P0 (Destructive Data Loss Hazard) | In `BusinessPortfolio.tsx:136-142`, tapping the 28px trash icon immediately executes `deletePortfolio(id, item.id)`. On mobile touchscreens, a minor finger slip next to the 28px edit pencil instantly and irreversibly destroys the portfolio record from the database. |
| **PORT-3** | Silent No-Op Mutations Due to Missing Row Count Assertions | 🟠 P1 (False Positive UI State) | In `businessService.ts:788-799`, `updatePortfolio` and `deletePortfolio` do not verify that a row was actually modified. If PostgREST returns 0 affected rows (due to an RLS policy block, session timeout, or synthetic ID), the service returns successfully and toasts "Removed from portfolio" or "Saved", masking write failures. |
| **PORT-4** | Stale Query Cache & Coalescing Lock After Upload, Edit, or Deletion | 🟠 P1 (Stale Management & Public Storefront) | Mutations in `BusinessPortfolio.tsx` call `refetch()`, but neither `bustBusinessGetCache(id)` nor `invalidateQueryCache('business:${id}')` is called. In-flight coalescing maps retain pre-write promises, and navigating to `BusinessDetail.tsx` or `BusinessStoreHub.tsx` continues serving stale portfolio items. |
| **PORT-5** | Base64 Fallback Contaminating Database on Storage Errors | 🟠 P1 (Database Bloat & Performance Degrade) | When network issues or bucket configuration errors occur, `uploadService.ts` falls back to `fileToDataUrl()`. This writes a multi-megabyte raw Base64 string directly into `business_portfolio_items.url`, which is subsequently loaded by all public storefront visitors. |
| **PORT-6** | Caption Editor Lacks Cancel, Discard, or Escape Key Handling | 🟡 P2 (Trapped Edit State) | When editing a caption (`editingCaption === item.id`), the UI displays only a checkmark save button. There is no cancel button, backdrop tap-away, or Escape key handler. The merchant cannot discard accidental edits without submitting or reloading. |
| **PORT-7** | Missing Sort Order & Hero Portfolio Item Controls | 🟡 P2 (Merchandising Disorder) | `business_portfolio_items` lacks a `sort_order` column, and `businessService.get` queries the table without an explicit order clause. Portfolio items fluctuate in arbitrary PostgreSQL heap order whenever updated. Merchants cannot designate a primary hero sample. |
| **PORT-8** | Touch Target Size & Dark Mode Styling Inconsistencies | 🟢 P3 (Accessibility & Contrast) | The edit and delete buttons are 28×28px (violating the 44×44px WCAG mobile touch target standard). Hardcoded backgrounds (`rgba(255,255,255,0.92)` and `rgba(0,0,0,0.75)`) cause high-contrast clashes in dark mode. |

---

## 3. Detailed Findings & Root Cause Analysis

---

### 🔴 PORT-1 (P0): Phantom Fallback Items Bleed into Management Console & Break Deletions/Edits

- **Location:** [`BusinessPortfolio.tsx:29`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BusinessPortfolio.tsx#L29), [`businessService.ts:232`](file:///d:/zetax/name/STRYT/src/services/marketplace/businessService.ts#L232), [`curatedImages.ts:1246-1268`](file:///d:/zetax/name/STRYT/src/lib/curatedImages.ts#L1246-L1268)
- **Root Cause:**
  1. In [`businessService.ts:232`](file:///d:/zetax/name/STRYT/src/services/marketplace/businessService.ts#L232):
     ```typescript
     b.portfolio = enrichBusinessPortfolio(b.id, b.portfolio ?? [], b.name, b.categoryName);
     ```
  2. If the business has no real rows in `business_portfolio_items`, `enrichBusinessPortfolio` generates synthetic sample items:
     ```typescript
     return fallback.gallery.map((url, i) => ({
       id: `bp_fb_${businessId}_${i}`,
       url,
       caption: i === 0 ? "Storefront & Ambiance" : "Service & Quality Showcase",
     }));
     ```
  3. In [`BusinessPortfolio.tsx:29`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BusinessPortfolio.tsx#L29):
     ```typescript
     const portfolio = b?.portfolio ?? [];
     ```
  4. The management console renders these synthetic fallback items as if they were uploaded by the merchant. The empty state (`No samples yet. Add photos of your past work...`) never displays.
  5. When the merchant taps "Delete" on one of these items:
     ```typescript
     await businessService.deletePortfolio(id, "bp_fb_...");
     ```
     This executes `DELETE FROM business_portfolio_items WHERE id = 'bp_fb_...'`. Because no such row exists, 0 rows are affected.
  6. The app toasts `"Removed from portfolio"` and calls `refetch()`. Because the database is still empty, `enrichBusinessPortfolio` generates the exact same fallback items again! The item instantly reappears, convincing the user that deletion is broken.
  7. When the merchant tries to edit the caption of a fallback item, `updatePortfolio` updates 0 rows.
- **Remediation Plan:**
  1. For management consoles, provide a dedicated query or flag that returns only real database rows (e.g. `businessService.getRaw(id)` or `isSynthetic` item tagging), or filter out synthetic items whose `id` starts with `bp_fb_` or `mock_`.
  2. In `BusinessPortfolio.tsx`, only display real uploaded items. If there are 0 real items, render the empty state and encourage uploading.

---

### 🔴 PORT-2 (P0): Dangerous One-Tap Accidental Deletion on 28px Mobile Touch Target

- **Location:** [`BusinessPortfolio.tsx:135-142`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BusinessPortfolio.tsx#L135-L142)
- **Root Cause:**
  ```tsx
  <div className="row gap-6" style={{ position: "absolute", bottom: 8, right: 8 }}>
    <button
      className="icon-btn"
      style={{ width: 28, height: 28, background: "rgba(255,255,255,0.92)" }}
      onClick={() => { setEditingCaption(item.id); setCaptionVal(item.caption); }}
      title="Edit caption"
    >
      <Pencil size={13} />
    </button>
    <button
      className="icon-btn"
      style={{ width: 28, height: 28, background: "rgba(255,255,255,0.92)", color: "var(--red-600)" }}
      onClick={() => deleteItem(item.id)}
      title="Delete"
    >
      <Trash2 size={13} />
    </button>
  </div>
  ```
  The delete icon button is tiny (28×28px) and positioned 6px away from the edit button. Tapping it directly executes `deleteItem(item.id)` without confirmation. On touchscreens, attempting to tap "Edit caption" frequently triggers an unintended deletion, destroying the merchant's work sample irreversibly.
- **Remediation Plan:**
  1. Implement a two-step confirmation dialog or modal sheet before calling `deletePortfolio()`.
  2. Ensure touch targets meet minimum accessibility guidelines (44×44px interactive area).

---

### 🟠 PORT-3 (P1): Silent No-Op Mutations Due to Missing Row Count Assertions

- **Location:** [`businessService.ts:788-799`](file:///d:/zetax/name/STRYT/src/services/marketplace/businessService.ts#L788-L799)
- **Root Cause:**
  ```typescript
  async updatePortfolio(_id: string, itemId: string, patch: Partial<PortfolioItem>) {
    const sb = getSupabase();
    const { data, error } = await sb.from("business_portfolio_items").update(toSnake(patch)).eq("id", itemId).select().maybeSingle();
    throwIfError(error);
    return toCamel<PortfolioItem>(data);
  },
  async deletePortfolio(_id: string, itemId: string) {
    const sb = getSupabase();
    const { error } = await sb.from("business_portfolio_items").delete().eq("id", itemId);
    throwIfError(error);
    return { ok: true };
  }
  ```
  In PostgreSQL with RLS enabled, if a user lacks update or delete permissions on a row, or if the row ID does not match, the query succeeds with 0 affected rows (`data: null`, `error: null`).
  Unlike `updateQueueToken` (which explicitly checks `data.length === 0` and throws `assertRowsUpdated`), `updatePortfolio` and `deletePortfolio` treat 0 affected rows as total success.
- **Remediation Plan:**
  Add `select("id")` and `assertRowsUpdated` / `assertRowUpdated` to both `updatePortfolio` and `deletePortfolio`.

---

### 🟠 PORT-4 (P1): Stale Query Cache & Coalescing Lock After Upload, Edit, or Deletion

- **Location:** [`BusinessPortfolio.tsx:39, 52, 110`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BusinessPortfolio.tsx#L39), [`businessService.ts:77-81`](file:///d:/zetax/name/STRYT/src/services/marketplace/businessService.ts#L77-L81)
- **Root Cause:**
  When a merchant uploads, edits, or deletes a portfolio item:
  - `bustBusinessGetCache(id)` is never invoked.
  - `invalidateQueryCache('business:${id}')` is never invoked.
  - If another screen (e.g., `BusinessDetail`, `BusinessStoreHub`) was already visited in the same session, `useQuery` continues serving stale cached data.
- **Remediation Plan:**
  Call `bustBusinessGetCache(id)` inside `addPortfolio`, `updatePortfolio`, and `deletePortfolio`, and call `invalidateQueryCache('business:${id}', () => bustBusinessGetCache(id))` upon mutation completion.

---

### 🟠 PORT-5 (P1): Base64 Fallback Contaminating Database on Storage Errors

- **Location:** [`BusinessPortfolio.tsx:36`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BusinessPortfolio.tsx#L36), [`uploadService.ts:106-110`](file:///d:/zetax/name/STRYT/src/services/core/uploadService.ts#L106-L110)
- **Root Cause:**
  If Supabase storage upload fails due to network degradation or token expiry, `uploadService.upload()` catches the error and silently converts the file into a Base64 data URL.
  This multi-megabyte string is saved to `business_portfolio_items.url`. Subsequent queries load megabytes of string data across the network, severely slowing down initial page loads and increasing memory pressure.
- **Remediation Plan:**
  Throw an error when cloud storage upload fails for persistent entity galleries, prompting the merchant to retry rather than persisting bloated data URLs.

---

### 🟡 PORT-6 (P2): Caption Editor Lacks Cancel, Discard, or Escape Key Handling

- **Location:** [`BusinessPortfolio.tsx:93-119`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BusinessPortfolio.tsx#L93-L119)
- **Root Cause:**
  When entering edit mode:
  ```tsx
  {editingCaption === item.id ? (
    <div style={{ ... }}>
      <input ... autoFocus />
      <button className="icon-btn" onClick={...}><Check size={14} /></button>
    </div>
  ) : ...}
  ```
  There is no `X` or `Cancel` button. Pressing `Escape` does not exit edit mode. If a merchant taps "Edit caption" by mistake, they must click "Save" (running an unnecessary database update) or refresh the browser.
- **Remediation Plan:**
  Add a cancel button (`X`), listen for `Escape` on the input, and support `Enter` to submit.

---

### 🟡 PORT-7 (P2): Missing Sort Order & Hero Portfolio Item Controls

- **Location:** [`business_portfolio_items` table](file:///d:/zetax/name/STRYT/supabase/migrations/20260805_business_portfolio.sql), [`businessService.ts:223`](file:///d:/zetax/name/STRYT/src/services/marketplace/businessService.ts#L223)
- **Root Cause:**
  The `business_portfolio_items` schema has no `display_order` or `sort_order` column. Furthermore, `businessService.get` joins `portfolio:business_portfolio_items(*)` without `.order("created_at")`.
  Items are returned in unpredictable heap order, and owners cannot choose which item appears first as their hero sample.
- **Remediation Plan:**
  Add explicit `.order("created_at", { ascending: false })` in queries, and in future iterations support manual sorting or a "Hero / Cover" badge.

---

### 🟢 PORT-8 (P3): Touch Target Size & Dark Mode Styling Inconsistencies

- **Location:** [`BusinessPortfolio.tsx:91, 94, 97, 105, 129, 137`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BusinessPortfolio.tsx#L129)
- **Root Cause:**
  Hardcoded values like `background: "rgba(255,255,255,0.92)"` and `background: "rgba(0,0,0,0.75)"` clash with dark mode themes. Buttons have 28×28px dimensions, violating mobile touch guidelines. `SafeImg` is missing an accessible `alt` text.
- **Remediation Plan:**
  Replace hardcoded styles with semantic CSS variables (`var(--card-bg)`, `var(--text-primary)`), expand touch hitboxes to 44px, and supply meaningful `alt` attributes.

---

## 4. Verification & Testing Checklist

- [ ] New shop with 0 portfolio items shows the clean empty state ("No samples yet") rather than synthetic placeholder cards.
- [ ] Tapping "Delete" opens a confirmation prompt; cancelling preserves the item.
- [ ] Confirming deletion removes the item from the database, busts the query cache, and refetches the list without phantom resurrecting.
- [ ] Editing caption allows pressing `Escape` or tapping `Cancel` to discard changes.
- [ ] Pressing `Enter` in the caption input saves the update.
- [ ] Failed uploads do not write Base64 data URLs to the database.
- [ ] Run `npm run check-colors` to ensure zero hardcoded color leaks.
- [ ] Run `npx tsc --noEmit` to verify zero TypeScript compilation regressions.
