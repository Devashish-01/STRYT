# STRYT — Flow 8.3: Provider Portfolio & Testimonials Gap Log

**Audit Date:** September 9, 2026  
**Flow Identifier:** Flow 8.3 — Domain 8 (Provider / Freelancer Console Operations)  
**Primary Components:** [`ProviderPortfolio.tsx`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderPortfolio.tsx), [`ProviderProfileHub.tsx`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderProfileHub.tsx), [`ProviderDetail.tsx`](file:///d:/zetax/name/STRYT/src/screens/provider/ProviderDetail.tsx)  
**Backend Services & Tables:** `providerService.ts`, `uploadService.ts`, `curatedImages.ts`, `public.portfolio_items`, Supabase Storage (`portfolio` bucket)  
**Launch Readiness Status:** 🟡 **Audited & Blocked by P0 Synthetic Item Bleed & P0 Unconfirmed Deletions**

---

## 1. Executive Summary

Flow 8.3 governs a solo service provider's past-work visual gallery and reputation showcase (`/provider/:id/manage/portfolio`). Through this screen, technicians, barbers, makeup artists, photographers, and fitness trainers upload photographs of completed projects, on-site jobs, and craft results. These photos are displayed prominently on the public provider page (`/p/:id`) within the **Work / Portfolio** tab.

While the mobile photo grid and caption editor mirror the merchant portfolio interface, auditing revealed significant architectural flaws:
1. **Synthetic Item Bleed & Resurrecting Deletions:** When a provider has no uploaded work, `providerService.get()` invokes `enrichProviderPortfolio()`, populating the portfolio with synthetic items (`pp_def_${providerId}_1`, `_2`). These fake items bleed into the management screen. Deleting them targets non-existent database rows and no-ops in PostgreSQL, causing the items to resurrect immediately on `refetch()`.
2. **Accidental Deletion Risk:** The 28×28px trash icon sits 6px from the 28×28px edit pencil. A minor finger slip on a mobile touchscreen permanently destroys a provider's portfolio photo without confirmation or undo.
3. **Missing Cache Invalidation:** Uploading, deleting, or captioning photos does not call `bustProviderGetCache(id)` or `invalidateQueryCache('provider:${id}')`, leaving `ProviderProfileHub` and public storefronts out-of-sync.
4. **Base64 Storage Fallback Risk:** Failed storage uploads fall back to `fileToDataUrl()`, saving megabyte-sized raw Base64 strings into `portfolio_items.url`.
5. **Absence of Testimonials Feature:** Despite the flow's mandate ("Provider Portfolio & Testimonials"), `ProviderPortfolio.tsx` contains zero controls for testimonials, customer quotes, or pinned reviews.
6. **Ignored `sort_order` Column:** `portfolio_items` contains a `sort_order` column, but `providerService` queries the table without an order clause, causing images to jump positions unpredictably.

---

## 2. Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **PPORT-1** | Synthetic Fallback Items Bleed into Console & Resurrect on Deletion | 🔴 P0 (Data Illusion & Delete Failure) | When a provider has no real photos, `enrichProviderPortfolio` injects mock items (`pp_def_...`). The management screen renders them as the provider's own. Tapping "Delete" issues a DELETE for non-existent IDs, and on `refetch()`, the synthetic items reappear, creating an illusion of broken deletion. |
| **PPORT-2** | Dangerous One-Tap Accidental Deletion on 28px Mobile Target | 🔴 P0 (Destructive Data Loss Hazard) | In `ProviderPortfolio.tsx:140-144`, tapping the 28px trash icon immediately deletes the item from PostgreSQL. On mobile touchscreens, attempting to tap "Edit caption" frequently triggers irreversible deletion. |
| **PPORT-3** | Missing Query Cache Invalidation Desynchronizes Hub and Public Profile | 🟠 P1 (Stale Management & Public Showcase) | Photo mutations never call `bustProviderGetCache(id)` or `invalidateQueryCache('provider:${id}')`. Navigating to `ProviderProfileHub` or customer booking pages continues serving stale cached portfolio lists. |
| **PPORT-4** | Silent No-Op Mutations Mask Write Failures | 🟠 P1 (False-Positive Confirmation) | In `providerService.ts:295-306`, `updatePortfolio` and `deletePortfolio` do not assert affected row counts. When RLS blocks writes or an invalid ID is passed, the UI displays false-positive success toasts. |
| **PPORT-5** | Base64 Fallback Contaminates Database on Storage Errors | 🟠 P1 (Database Bloat & Performance Degradation) | `uploadService.upload()` falls back to `fileToDataUrl()`, writing raw multi-megabyte Base64 strings directly into `portfolio_items.url` during network drops. |
| **PPORT-6** | Caption Editor Traps Provider Without Cancel or Escape Support | 🟡 P2 (Trapped Edit State) | When editing a caption (`editingCaption === item.id`), there is no cancel button (`X`), backdrop tap dismissal, or `Escape` key listener. |
| **PPORT-7** | "Testimonials" Feature Missing from Portfolio Surface | 🟡 P2 (Reputation Showcase Omission) | The flow is titled "Provider Portfolio & Testimonials", but the screen only manages photos. Providers have no ability to pin positive reviews, neighbor vouches, or customer quotes alongside their work. |
| **PPORT-8** | Arbitrary Order Fluctuation Despite Existing `sort_order` Column | 🟡 P2 (Merchandising Disorder) | `public.portfolio_items` has a `sort_order` column, but `providerService` does not apply an `.order()` clause, and the UI lacks reorder handles or hero image selection. |
| **PPORT-9** | Touch Target Size & Dark Mode Styling Inconsistencies | 🟢 P3 (Accessibility & Contrast) | Buttons are 28×28px (violating WCAG 44×44px standard), `SafeImg` lacks descriptive `alt` tags, and hardcoded `rgba` backgrounds clash in dark themes. |

---

## 3. Detailed Findings & Root Cause Analysis

---

### 🔴 PPORT-1 (P0): Synthetic Fallback Items Bleed into Console & Resurrect on Deletion

- **Location:** [`ProviderPortfolio.tsx:71, 88-96`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderPortfolio.tsx#L88-L96), [`providerService.ts:153`](file:///d:/zetax/name/STRYT/src/services/marketplace/providerService.ts#L153), [`curatedImages.ts:1286-1310`](file:///d:/zetax/name/STRYT/src/lib/curatedImages.ts#L1286-L1310)
- **Root Cause:**
  `providerService.get(id)` automatically invokes `enrichProviderPortfolio(prov.id, prov.portfolio ?? [])`.
  If a provider has zero photos in `portfolio_items`, `enrichProviderPortfolio` generates synthetic sample items:
  ```typescript
  return [
    { id: `pp_def_${providerId}_1`, url: "...", caption: "Professional on-site service delivery" },
    { id: `pp_def_${providerId}_2`, url: "...", caption: "Quality tools & finished craft" }
  ];
  ```
  `ProviderPortfolio.tsx` renders `p.portfolio` directly. The empty state never renders.
  When the provider taps "Delete":
  ```typescript
  await providerService.deletePortfolio(id, "pp_def_...");
  ```
  PostgreSQL deletes 0 rows. PostgREST returns no error. The UI toasts `"Removed from portfolio"` and calls `refetch()`.
  Upon refetch, the DB is still empty, so `enrichProviderPortfolio` generates the same synthetic items again, making it appear that deletion failed.
- **Remediation Plan:**
  Filter out synthetic items whose `id` starts with `pp_def_` or `mock_` in `ProviderPortfolio.tsx` (or pass a flag to `providerService.get` to bypass enrichment for management consoles). Display the empty state when real item count is 0.

---

### 🔴 PPORT-2 (P0): Dangerous One-Tap Accidental Deletion on 28px Mobile Target

- **Location:** [`ProviderPortfolio.tsx:138-146`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderPortfolio.tsx#L138-L146)
- **Root Cause:**
  ```tsx
  <div className="row gap-6" style={{ position: "absolute", bottom: 8, right: 8 }}>
    <button className="icon-btn" style={{ width: 28, height: 28, background: "rgba(255,255,255,0.92)" }} onClick={() => { setEditingCaption(item.id); setCaptionVal(item.caption); }} title="Edit caption">
      <Pencil size={13} />
    </button>
    <button className="icon-btn" style={{ width: 28, height: 28, background: "rgba(255,255,255,0.92)", color: "var(--red-600)" }} onClick={() => deleteItem(item.id)} title="Delete">
      <Trash2 size={13} />
    </button>
  </div>
  ```
  The delete icon is 28×28px and sits 6px from the edit button. Tapping it directly invokes `deleteItem(item.id)` without confirmation. On mobile screens, attempting to edit the caption frequently triggers unintended deletion.
- **Remediation Plan:**
  Add a confirmation modal or prompt before calling `deletePortfolio()`. Expand interactive touch target size to 44×44px.

---

### 🟠 PPORT-3 (P1): Missing Query Cache Invalidation Desynchronizes Hub and Public Profile

- **Location:** [`ProviderPortfolio.tsx:37, 51, 116`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderPortfolio.tsx#L37), [`providerService.ts:85-89`](file:///d:/zetax/name/STRYT/src/services/marketplace/providerService.ts#L85-L89)
- **Root Cause:**
  `bustProviderGetCache(id)` exists in `providerService.ts` but is never called by `addPortfolio`, `deletePortfolio`, or `updatePortfolio`.
  `invalidateQueryCache('provider:${id}')` is also never called.
  When returning to `ProviderProfileHub.tsx`, stale cached portfolio items are served.
- **Remediation Plan:**
  In `addPortfolio`, `deletePortfolio`, and `updatePortfolio`, call `bustProviderGetCache(id)` and `invalidateQueryCache('provider:${id}', () => bustProviderGetCache(id))`.

---

### 🟠 PPORT-4 (P1): Silent No-Op Mutations Mask Write Failures

- **Location:** [`providerService.ts:295-306`](file:///d:/zetax/name/STRYT/src/services/marketplace/providerService.ts#L295-L306)
- **Root Cause:**
  `updatePortfolio` and `deletePortfolio` do not check affected row counts. If RLS blocks the write or an invalid ID is passed, PostgREST returns 0 rows without error. The UI displays false-positive success toasts.
- **Remediation Plan:**
  Add `assertRowsUpdated(data)` to both methods.

---

### 🟠 PPORT-5 (P1): Base64 Fallback Contaminates Database on Storage Errors

- **Location:** [`ProviderPortfolio.tsx:34-35`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderPortfolio.tsx#L34-L35), [`uploadService.ts:106-110`](file:///d:/zetax/name/STRYT/src/services/core/uploadService.ts#L106-L110)
- **Root Cause:**
  When network drops or Supabase bucket permission issues occur during `uploadService.upload(file, "portfolio")`, the service catches the failure and falls back to `fileToDataUrl()`.
  This writes a multi-megabyte raw Base64 data URL directly into `portfolio_items.url`. Subsequent queries to `providerService.get()` transfer megabytes of string data across the wire, severely degrading mobile page performance and bloating database storage.
- **Remediation Plan:**
  Throw an explicit storage error rather than falling back to Base64 data URLs for persistent portfolio galleries, allowing the provider to retry upload cleanly.

---

### 🟡 PPORT-6 (P2): Caption Editor Traps Provider Without Cancel or Escape Support

- **Location:** [`ProviderPortfolio.tsx:100-121`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderPortfolio.tsx#L100-L121)
- **Root Cause:**
  When `editingCaption === item.id`, the UI renders only an input field and a green checkmark button:
  ```tsx
  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.75)", ... }}>
    <input className="input" value={captionVal} ... />
    <button className="icon-btn" onClick={async () => { ... }}>
      <Check size={14} />
    </button>
  </div>
  ```
  There is no cancel button (`X`), no backdrop dismissal, and no `onKeyDown` listener for the `Escape` key. If a provider accidentally opens caption editing, they cannot discard changes without either saving or refreshing the page.
- **Remediation Plan:**
  Add a cancel button next to the checkmark and handle the `Escape` key to call `setEditingCaption(null)`.

---

### 🟡 PPORT-7 (P2): "Testimonials" Feature Missing from Portfolio Surface

- **Location:** [`ProviderPortfolio.tsx:1-157`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderPortfolio.tsx#L1-L157)
- **Root Cause:**
  Flow 8.3 is designated "Provider Portfolio & Testimonials". However, the portfolio screen contains only a photo grid. There is no affordance for providers to pin top reviews, show verified client quotes, or feature neighbor vouches alongside their craft photos.
- **Remediation Plan:**
  Add a "Featured Reviews & Testimonials" section allowing providers to select up to 3 verified customer reviews to pin to their showcase.

---

### 🟡 PPORT-8 (P2): Arbitrary Order Fluctuation Despite Existing `sort_order` Column

- **Location:** [`providerService.ts:148`](file:///d:/zetax/name/STRYT/src/services/marketplace/providerService.ts#L148), `public.portfolio_items` table
- **Root Cause:**
  `portfolio_items` contains a `sort_order` column, but `providerService.get(id)` selects `portfolio:portfolio_items(*)` without ordering:
  ```typescript
  const { data, error } = await sb.from("providers").select("*, portfolio:portfolio_items(*), catalog:catalog_items(*)").eq("id", id).maybeSingle();
  ```
  PostgreSQL returns joined rows in arbitrary physical disk heap order. Every time an item is captioned or touched, its position can shift unpredictably in the provider's showcase.
- **Remediation Plan:**
  Apply `.order("sort_order", { ascending: true })` or sort `prov.portfolio` by `sort_order || created_at` in the service layer.

---

### 🟢 PPORT-9 (P3): Touch Target Size & Dark Mode Styling Inconsistencies

- **Location:** [`ProviderPortfolio.tsx:101, 130-146`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderPortfolio.tsx#L130-L146)
- **Root Cause:**
  Action buttons (`Pencil`, `Trash2`, `Check`) use fixed 28×28px dimensions, violating the 44×44px mobile touch target accessibility standard. Furthermore, hardcoded `background: "rgba(255,255,255,0.92)"` and `rgba(0,0,0,0.75)` bypass design tokens (`var(--surface)`, `var(--text)`), creating jarring contrast artifacts in dark mode.
- **Remediation Plan:**
  Expand interactive padding to 44×44px hitboxes and migrate inline RGBA styles to semantic design token classes.

---

## 4. Verification & Testing Checklist

- [ ] Providers with zero photos see the clean empty state ("No samples yet") rather than synthetic sample cards.
- [ ] Tapping "Delete" opens a confirmation prompt; canceling preserves the photo.
- [ ] Confirming deletion removes the item from PostgreSQL, busts the query cache, and refetches without phantom resurrection.
- [ ] Editing caption allows pressing `Escape` or tapping `Cancel` to discard changes.
- [ ] Failed storage uploads do not write Base64 data URLs to `portfolio_items.url`.
- [ ] Portfolio items maintain deterministic ordering by `sort_order` or upload date.
- [ ] Run `npm run check-colors` and `npx tsc --noEmit` to verify type and design token compliance.
