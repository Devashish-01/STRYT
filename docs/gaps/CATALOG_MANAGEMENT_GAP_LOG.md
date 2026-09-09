# Catalog & Price List Management — Bug & Gap Log

**Purpose:** Documenting every architectural defect, data loss hazard, mobile touch accident, inventory desync, and catalog management deficiency in **Flow 7.2: Catalog & Price List Management** (`src/screens/business/manage/CatalogManager.tsx`, `src/screens/provider/manage/ProviderCatalog.tsx`, `src/services/marketplace/businessService.ts`, `src/services/marketplace/providerService.ts`, `src/screens/business/BusinessDetail.tsx`, `src/screens/business/BizCatalogGrid.tsx`, `src/components/CartCheckoutSheet.tsx`, and Supabase migrations `schema.sql`, `migration_writes.sql`, `20260720_provider_catalog_and_remove_packages.sql`, `20260804_catalog_inventory.sql`, `20260835_appointment_line_items_and_inventory.sql`, `20260841_business_team_scopes.sql`, `20260855_slot_capacity_and_party_size.sql`).

---

## Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **CAT-1** | Irreversible Sale Price & Photo Cleared Due to `undefined` Payload Dropping | 🔴 P0 (Data Loss & Update Failure) | In `CatalogManager.tsx:213-214`, `salePrice: sale ? Number(sale) : undefined` and `image: image \|\| undefined`. When a merchant edits an item to remove a discount or photo, passing `undefined` causes PostgREST to omit the column from the `UPDATE` query. As a result, PostgreSQL **never sets `sale_price` or `image` to `NULL`**. Once a sale price or image is saved, the merchant cannot remove it—the discount is permanently stuck on the listing unless the item is deleted and recreated. |
| **CAT-2** | Dangerous One-Tap Accidental Deletion Without Confirmation | 🔴 P0 (Destructive Data Loss Hazard) | In `CatalogManager.tsx:51-59, 129`, the 34px red trash icon sits immediately adjacent to the 34px edit pencil in a tight vertical stack (`col gap-8`). Tapping the trash icon **immediately invokes `service.deleteCatalogItem(id, item.id)` with zero confirmation dialog or undo option**. On mobile touchscreens, a minor finger slip while attempting to tap "Edit" instantly and permanently destroys the product, its descriptions, pricing, and photo. |
| **CAT-3** | Zero Catalog Ordering Controls & Arbitrary Heap Fluctuation | 🟠 P1 (Merchandising & Display Disorder) | Although `public.catalog_items` contains a `sort_order` column (`schema.sql:114`), `businessService.get(id)` queries `catalog:catalog_items(*)` without an `.order()` clause. PostgreSQL returns rows in arbitrary table heap order, causing products to jump to different positions whenever edited. Furthermore, `CatalogManager.tsx` provides **zero drag handles, zero up/down reorder arrows, and zero manual sorting controls**. Merchants have no way to feature items or order menus logically. |
| **CAT-4** | Inability to Pause/Disable Sales for Finite Stock Items | 🟠 P1 (Inventory & Operations Lock) | In `CatalogManager.tsx:237-240`, `save()` unconditionally overrides `stockStatus` based strictly on `quantity > 0` (`stockStatus: (finiteQty ?? 0) > 0 ? "IN_STOCK" : "OUT_OF_STOCK"`). On the list view, the stock button opens the full edit sheet rather than toggling availability. If a shop has 10 units in stock but needs to temporarily halt online orders for the afternoon, they **cannot set `stockStatus = 'OUT_OF_STOCK'` without zeroing out their quantity**, destroying their physical inventory record. |
| **CAT-5** | Unbounded Cart Stepper Allows Customers to Exceed Available Finite Stock | 🟠 P1 (Checkout Crash & Cart Rejection) | In `BizCatalogGrid.tsx:62-76` and `BusinessDetail.tsx:714-730`, the customer cart stepper (`+` button) allows customers to increment quantity without checking `item.quantity`. A customer can add 10 units of an item that has only 2 in stock. When submitting the order, `reserve_catalog_items` throws an uncaught `INSUFFICIENT_STOCK` database exception, crashing the checkout submission. |
| **CAT-6** | Missing Catalog Search and Category Grouping for Large Inventories | 🟡 P2 (Merchant Usability Bottleneck) | In `CatalogManager.tsx:73-133`, all listings render in a single flat vertical list without a search input or filter. Retail shops, salons, and restaurants with 40–100+ items must scroll through the entire page to find and update a single item. |
| **CAT-7** | Lack of Realtime Catalog Updates Across Devices | 🟡 P2 (Multi-Staff Inventory Desync) | In `CatalogManager.tsx:22`, `useQuery` fetches the entity only once on mount. When online bookings decrement finite inventory via `reserve_catalog_items`, or when another staff member updates stock on another terminal, `CatalogManager` remains stale until manually refreshed. |
| **CAT-8** | Unhandled File Input Re-Selection & Dark Mode Styling Polish | 🟢 P3 (Touch Polish & Theme Consistency) | In `pickImage` (`CatalogManager.tsx:191`), `e.target.value = ""` is omitted, preventing re-selection of the same image file if an upload fails. In `BizCatalogGrid.tsx:66, 70` and `BusinessDetail.tsx:717, 724`, hardcoded `#fff` produces stark white blocks in dark mode. |

---

## Detailed Gap Analyses

---

### #CAT-1 — Irreversible Sale Price & Photo Cleared Due to `undefined` Payload Dropping

**Area:** `src/screens/business/manage/CatalogManager.tsx:209-244`, `src/services/marketplace/businessService.ts:767-772`  
**Severity:** 🔴 P0 (Data Loss & Update Failure)

**Root cause:**
1. In `CatalogManager.tsx:209-244`:
   ```tsx
   const payload: Partial<CatalogItem> = {
     name,
     description: desc,
     price: Number(price),
     salePrice: sale ? Number(sale) : undefined,
     image: image || undefined,
     ...
   };
   if (item) await service.updateCatalogItem(targetId, item.id, payload);
   ```
2. When an existing item has an active sale price (e.g. ₹150 instead of regular ₹200), and the merchant wants to end the promotion, they delete the text in the "Sale price ₹" input, making `sale === ""`.
3. At line 213, `sale ? Number(sale) : undefined` evaluates to `undefined`.
4. In `businessService.ts:769`:
   ```ts
   const { data, error } = await sb.from("catalog_items").update(toSnake(patch)).eq("id", itemId).select().maybeSingle();
   ```
5. In JavaScript object manipulation and JSON serialization, keys with `undefined` values are stripped from `toSnake(patch)`.
6. Supabase PostgREST receives an `UPDATE catalog_items` statement that **does not mention `sale_price`**!
7. PostgreSQL leaves `sale_price` completely untouched. The promotional price remains active forever.
8. The same issue occurs with `image`: if a merchant wishes to remove an uploaded photo, passing `undefined` prevents PostgreSQL from clearing the `image` column to `NULL`. Furthermore, `CatalogManager.tsx` lacks a "Remove Photo" button once an image is chosen.

**Remediation Plan:**
1. In `CatalogManager.tsx`, pass `null` instead of `undefined` when an optional field is cleared:
   ```tsx
   salePrice: sale.trim() ? Number(sale) : null,
   image: image ? image : null,
   ```
2. Add a clear "Remove Photo" button on the image preview in `ItemEditor`.

---

### #CAT-2 — Dangerous One-Tap Accidental Deletion Without Confirmation

**Area:** `src/screens/business/manage/CatalogManager.tsx:51-59, 127-130`  
**Severity:** 🔴 P0 (Destructive Data Loss Hazard)

**Root cause:**
1. In `CatalogManager.tsx:127-130`:
   ```tsx
   <div className="col gap-8">
     <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={() => setEditing(item)}><Pencil size={15} /></button>
     <button className="icon-btn" style={{ width: 34, height: 34, color: "var(--red-600)" }} onClick={() => remove(item)}><Trash2 size={15} /></button>
   </div>
   ```
2. In `CatalogManager.tsx:51-59`:
   ```tsx
   async function remove(item: CatalogItem) {
     try {
       await service.deleteCatalogItem(id, item.id);
       showToast("Item removed");
       refetch();
     } catch (e: any) {
       showToast(e?.message || "Couldn't remove — try again");
     }
   }
   ```
3. The Edit button (34×34px) and the Delete button (34×34px) are placed adjacent to each other in a vertical column with an 8px gap.
4. Tapping the trash icon executes `service.deleteCatalogItem()` immediately. There is **no `window.confirm`**, **no confirmation modal**, and **no undo snackbar**.
5. On mobile touchscreens, accidental taps while aiming for the Edit icon permanently erase the item, its photo URL, custom description, and pricing from the database.

**Remediation Plan:**
1. Introduce a deletion confirmation state:
   - When the user taps the trash icon, display a native confirmation sheet or modal: `"Delete [Item Name]?" "This listing will be permanently removed from your catalog." [Cancel] [Delete]`.
2. Disable the button during deletion to prevent double-tap race conditions.

---

### #CAT-3 — Zero Catalog Ordering Controls & Arbitrary Heap Fluctuation

**Area:** `src/screens/business/manage/CatalogManager.tsx:73-133`, `src/services/marketplace/businessService.ts:221-226`, `supabase/legacy/schema.sql:114`  
**Severity:** 🟠 P1 (Merchandising & Display Disorder)

**Root cause:**
1. `public.catalog_items` defines `sort_order int default 0`.
2. In `businessService.ts:221-226`:
   ```ts
   const { data, error } = await sb
     .from("businesses")
     .select("*, catalog:catalog_items(*), portfolio:business_portfolio_items(*)")
     .eq("id", id)
     .maybeSingle();
   ```
   PostgREST does not sort child relations unless explicitly specified via `.order("sort_order", { foreignTable: "catalog_items" })`.
3. In PostgreSQL, without an `ORDER BY` clause, rows are returned in physical heap order. Whenever a merchant edits an item, PostgreSQL writes a new row tuple at the end of the heap. As a result, edited items jump randomly to the bottom of the catalog.
4. `CatalogManager.tsx` provides no mechanism to reorder items (no drag handles, no up/down buttons, no `sort_order` adjustment). Merchants cannot group related items together or prioritize their most popular items.

**Remediation Plan:**
1. In `businessService.ts`, add `.order("sort_order", { foreignTable: "catalog_items", ascending: true })`.
2. In `CatalogManager.tsx`, add reordering arrows (Move Up / Move Down) or drag-and-drop reordering, persisting updated `sort_order` values via `service.updateCatalogItem()`.

---

### #CAT-4 — Inability to Pause/Disable Sales for Finite Stock Items

**Area:** `src/screens/business/manage/CatalogManager.tsx:109-125, 237-241`  
**Severity:** 🟠 P1 (Inventory & Operations Lock)

**Root cause:**
1. In `CatalogManager.tsx:237-241`:
   ```tsx
   // Finite items track availability by count: restocking above zero makes
   // it available again, dropping to zero hides it. Infinite items keep
   // whatever manual availability the row already had.
   ...(invType === "FINITE" ? { stockStatus: (finiteQty ?? 0) > 0 ? "IN_STOCK" : "OUT_OF_STOCK" } : {}),
   ```
2. For an item with `inventoryType === "FINITE"`, availability is strictly coupled to `quantity > 0`.
3. On the catalog screen (lines 109-116):
   ```tsx
   {item.inventoryType === "FINITE" ? (
     <button className="tiny semi" onClick={() => setEditing(item)}>
       {(item.quantity ?? 0) > 0 ? `● ${item.quantity} in stock` : "○ Sold out — tap to restock"}
     </button>
   ) : ( ... )}
   ```
4. If a merchant has 15 cakes or shirts in inventory, but needs to pause sales temporarily (e.g. kitchen refrigeration issue, store event, or temporary hold), they cannot toggle the item to "Unavailable".
5. The only way to stop customer orders is to edit the item and change `quantity` to 0, which erases their actual stock inventory count.

**Remediation Plan:**
1. Decouple `stockStatus` from `quantity`: allow a finite item to hold positive quantity while its `stockStatus` is manually set to `"OUT_OF_STOCK"`.
2. Provide a quick toggle on the item card for all items (finite and infinite) to pause/resume sales without erasing quantity.

---

### #CAT-5 — Unbounded Cart Stepper Allows Customers to Exceed Available Finite Stock

**Area:** `src/screens/business/BizCatalogGrid.tsx:62-76`, `src/screens/business/BusinessDetail.tsx:714-730`  
**Severity:** 🟠 P1 (Checkout Crash & Cart Rejection)

**Root cause:**
1. In `BizCatalogGrid.tsx:69-75`:
   ```tsx
   <div className="row between" style={{ ... }}>
     <button onClick={() => add(item.id, -1)}><Minus size={14} /></button>
     <span className="bold">{qty}</span>
     <button onClick={() => add(item.id, 1)}><Plus size={14} /></button>
   </div>
   ```
2. When the user taps the `+` button, `add(item.id, 1)` increments `qty` without comparing against `item.quantity`.
3. If an item has `inventoryType === "FINITE"` and `item.quantity === 2`, a customer can increment `qty` to 10.
4. When the customer submits the order or makes a walk-in payment, `reserve_catalog_items` (`20260835_appointment_line_items_and_inventory.sql:99-101`) triggers:
   ```sql
   if coalesce(v_row.quantity, 0) < v_item.quantity then
     raise exception 'INSUFFICIENT_STOCK: %', v_row.name;
   end if;
   ```
5. The transaction aborts with an uncaught database error message, creating a jarring checkout failure.

**Remediation Plan:**
1. In `BizCatalogGrid.tsx` and `BusinessDetail.tsx`, cap the `+` button:
   ```tsx
   const maxQty = item.inventoryType === "FINITE" && item.quantity != null ? item.quantity : 99;
   const canAdd = qty < maxQty;
   ```
2. Disable the `+` button and display `"Max available reached"` when `qty === maxQty`.

---

### #CAT-6 — Missing Catalog Search and Category Grouping for Large Inventories

**Area:** `src/screens/business/manage/CatalogManager.tsx:73-133`  
**Severity:** 🟡 P2 (Merchant Usability Bottleneck)

**Root cause:**
1. In `CatalogManager.tsx`, items are rendered in a single flat list:
   ```tsx
   {catalog.map((item) => ( ... ))}
   ```
2. There is no search input field, no category filter tabs, and no sorting dropdown.
3. For merchants with dozens of items (supermarkets, restaurants, salons, hardware shops), updating a single price requires scrolling through up to 100 cards.

**Remediation Plan:**
1. Add a search bar at the top of `CatalogManager.tsx` filtering by item name and description.
2. Provide a quick filter for "In Stock", "Out of Stock", and "Featured".

---

### #CAT-7 — Lack of Realtime Catalog Updates Across Devices

**Area:** `src/screens/business/manage/CatalogManager.tsx:22-26`  
**Severity:** 🟡 P2 (Multi-Staff Inventory Desync)

**Root cause:**
1. In `CatalogManager.tsx:22`:
   ```tsx
   const { data: entity, loading, refetch } = useQuery(...)
   ```
2. `useQuery` performs a one-time data fetch on component mount.
3. If an online customer books or orders a finite item, `reserve_catalog_items` decrements `catalog_items.quantity` in the database.
4. The merchant looking at `CatalogManager.tsx` continues to see the old stock count until they manually navigate away and return or refresh the browser.

**Remediation Plan:**
1. Switch from `useQuery` to `useQueryWithRealtime` listening to `catalog_items` table changes for the current `business_id` or `provider_id`.

---

### #CAT-8 — Unhandled File Input Re-Selection & Dark Mode Styling Polish

**Area:** `src/screens/business/manage/CatalogManager.tsx:191-203, 267`, `src/screens/business/BizCatalogGrid.tsx:66, 70`  
**Severity:** 🟢 P3 (Touch Polish & Theme Consistency)

**Root cause:**
1. In `CatalogManager.tsx:191`:
   ```tsx
   async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
     const file = e.target.files?.[0];
     if (!file) return;
   ```
   `e.target.value = ""` is omitted. If the upload encounters a network error and the user tries to select the exact same file again, the browser ignores it because `value` hasn't changed.
2. In `BizCatalogGrid.tsx:66, 70`, hardcoded `background: "#fff"` and `color: "#fff"` violate dark mode CSS variables.

**Remediation Plan:**
1. Reset `e.target.value = ""` immediately after reading the file.
2. Replace hardcoded `#fff` with `var(--surface)` / `var(--card)`.
