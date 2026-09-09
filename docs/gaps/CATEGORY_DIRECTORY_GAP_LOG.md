# Category Directory & Taxonomy — Bug & Gap Log

**Purpose:** Documenting every defect, data corruption hazard, scalability bottleneck, and UX issue in **Flow 1.4: Category Directory & Taxonomy** (`src/screens/AllCategories.tsx`, `src/screens/CategoryListing.tsx`, `src/services/marketplace/catalogService.ts`, and `src/services/marketplace/discoveryService.ts`).

---

## Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **C1** | Destructive User Profile Overwrite on Category Browsing | 🔴 P0 (Data Integrity Hazard) | In `AllCategories.tsx:30-38` and `CategoryListing.tsx:47-55`, moving the radius slider triggers `userService.update({ notificationRadiusKm: radius })`. Simply adjusting the search radius while browsing permanently mutates the user's permanent push notification subscription radius, causing alert spam or silencing. |
| **C2** | Full Table Scan & Client-Side Memory Dump in `catalogService.getCategoryCounts` | 🔴 P0 (Scalability & Mobile Freeze) | In `catalogService.ts:51-70`, `getCategoryCounts` executes an unconstrained `select("category_id, lat, lng")` on all active businesses and providers across the entire nation, streaming thousands of records over mobile data and computing trigonometric `haversineKm` on the JS thread. |
| **C3** | Shallow Child ID Resolution Drops Multi-Tier Subcategories | 🟠 P1 (Taxonomy Traversal Defect) | In `CategoryListing.tsx:57-58`, `matchIds = sub ? [sub] : [id, ...childIds]` only queries immediate children (`cat?.children?.map`). Any businesses or providers registered under grandchild subcategories (depth ≥ 2) are omitted when browsing the parent category. |
| **C4** | Dual-Cursor Desync & Disruptive Layout Shift on "Load More" | 🟠 P1 (Pagination & UX Hazard) | In `CategoryListing.tsx:227-238`, a single "Load more" button simultaneously loads `extraProv` and `extraBiz`. Newly fetched providers are prepended above businesses, triggering abrupt layout shifts that displace the items the user was viewing. |
| **C5** | Silent Fallback to Pune Coordinates on Missing Location | 🟠 P1 (Discovery Deception) | In `CategoryListing.tsx:61-69`, missing user coordinates pass `undefined` to `discoveryService.businesses` and `providers`, which silently default to Pune (`DEFAULT_LAT = 18.536`, `DEFAULT_LNG = 73.893`). Users in other cities with location disabled are served distant Pune shops without warning. |
| **C6** | Dead-End Empty State When Parent Category Has No Local Spots | 🟡 P2 (Missing Actionable CTAs) | In `CategoryListing.tsx:204-222`, when viewing a parent category with zero local businesses or providers, the `action` prop is `undefined`. Users face a dead end with no CTA to expand radius, post an Ask, or suggest a new place. |
| **C7** | Fragile Back Navigation & Missing Category Breadcrumb | 🟡 P2 (Navigation Fragility) | In `CategoryListing.tsx:169`, tapping back uses `nav(-1)`. Deep-linking directly to `/category/:id` leaves no breadcrumb context and causes `nav(-1)` to exit the web app. |
| **C8** | Phantom Category ID Generated on Proposal Insert Failure | 🟡 P2 (Data Integrity Hazard) | In `catalogService.ts:90-94`, if `sb.from("categories").insert` fails due to RLS restrictions or network error, it returns a fake mock object `{ id: "prop_" + Date.now(), status: "PROPOSED" }`. Referencing this unpersisted ID breaks database foreign key constraints. |

---

## Detailed Gap Analyses

---

### #C1 — Destructive User Profile Overwrite on Category Browsing

**Area:** `src/screens/AllCategories.tsx:30-38`, `src/screens/CategoryListing.tsx:47-55`  
**Severity:** 🔴 P0 (Data Integrity Hazard)

**Root cause:**
1. Both `AllCategories.tsx` and `CategoryListing.tsx` provide a `RadiusSelector` slider so users can expand or narrow their category browsing distance (e.g. from 5 km to 25 km to find a specialist hospital or hobby store).
2. However, both components attach an effect that saves the slider value directly to the user's permanent backend profile:
   ```ts
   // AllCategories.tsx:30-38 & CategoryListing.tsx:47-55
   useEffect(() => {
     localStorage.setItem("settings_radius", String(radius));
     if (user.id && radius !== user.notificationRadiusKm) {
       void userService.update({ notificationRadiusKm: radius }).catch(() => {
         showToast(t("explore_radius_save_failed"));
       });
     }
   }, [radius, user.id, user.notificationRadiusKm]);
   ```
3. `notificationRadiusKm` is the database configuration on the `users` table that dictates the radius for receiving push notifications and local broadcast alerts (community requests, safety updates, nearby announcements).
4. Because of this hook, casually sliding the radius slider while browsing categories mutates the user's permanent account push notification radius.
5. If the user widens the slider to 50 km, they will subsequently be inundated with push notifications from 50 km away. Conversely, if they shrink it to 1 km to find a nearby kiosk, their push notification radius is permanently reduced to 1 km, silencing relevant neighborhood alerts.

**Reproduction Steps:**
1. Log in as an authenticated customer with default notification radius of 5 km.
2. Navigate to `/categories` or `/category/:id`.
3. Slide the radius selector to 25 km to look for businesses across town.
4. Check the `users` table or Account Settings: `notification_radius_km` has been updated to 25 km on the backend database.

**Fix Recommendation:**
- Decouple category browsing radius from push notification preferences.
- Persist category filter radius in a component-level state or a distinct localStorage key (`category_browse_radius_km`). Do not call `userService.update({ notificationRadiusKm })`.

---

### #C2 — Full Table Scan & Client-Side Memory Dump in `catalogService.getCategoryCounts`

**Area:** `src/services/marketplace/catalogService.ts:51-70`, `src/screens/AllCategories.tsx:42-44`  
**Severity:** 🔴 P0 (Scalability & Mobile Freeze)

**Root cause:**
1. When visiting `/categories`, `AllCategories.tsx` loads counts of active businesses and providers per category:
   ```ts
   // catalogService.ts:51-70
   async getCategoryCounts(lat?: number, lng?: number, radius?: number) {
     const sb = getSupabase();
     const [{ data: bizRows }, { data: provRows }] = await Promise.all([
       sb.from("businesses").select("category_id, lat, lng").eq("status", "ACTIVE"),
       sb.from("providers").select("category_id, lat, lng").eq("status", "ACTIVE"),
     ]);
     const tally = (rows: any[] | null) => {
       const c: Record<string, number> = {};
       for (const r of rows ?? []) {
         if (!r.category_id) continue;
         if (lat != null && lng != null && radius != null && radius < 5000) {
           const dist = (r.lat && r.lng) ? haversineKm(lat, lng, r.lat, r.lng) : 0;
           if (dist > radius) continue;
         }
         c[r.category_id] = (c[r.category_id] ?? 0) + 1;
       }
       return c;
     };
     return { bizCounts: tally(bizRows), provCounts: tally(provRows) };
   }
   ```
2. This query has no spatial bounding box filter, no limit, and no pagination. It requests every active business and provider in the entire platform database.
3. In production with thousands of listings, every client visiting `/categories` downloads a massive JSON payload over cellular data.
4. The client then runs an unoptimized JavaScript loop performing trigonometric `haversineKm` calculations for every row on the main UI thread, causing UI jank and memory spikes on mobile devices.

**Fix Recommendation:**
- Implement a server-side PostgreSQL function (e.g. `rpc('get_category_counts', { user_lat, user_lng, radius_km })`) utilizing PostGIS spatial indexing (`ST_DWithin`) and `GROUP BY category_id`.
- The database returns only a compact map of `[{ category_id: string, biz_count: number, prov_count: number }]`, eliminating full table downloads and client-side geospatial math.

---

### #C3 — Shallow Child ID Resolution Drops Multi-Tier Subcategories

**Area:** `src/screens/CategoryListing.tsx:57-58`  
**Severity:** 🟠 P1 (Taxonomy Traversal Defect)

**Root cause:**
1. In `AllCategories.tsx:15-17`, category ID collection is implemented recursively:
   ```ts
   function getAllIds(cat: Category): string[] {
     return [cat.id, ...(cat.children ?? []).flatMap(getAllIds)];
   }
   ```
2. In contrast, `CategoryListing.tsx` only retrieves immediate 1st-level children:
   ```ts
   // CategoryListing.tsx:57-58
   const childIds = cat?.children?.map((c) => c.id) ?? [];
   const matchIds = sub ? [sub] : [id, ...childIds];
   ```
3. If the taxonomy tree has multiple tiers (e.g., `Healthcare -> Medical Clinics -> Dental`), `cat.children` only includes `Medical Clinics`.
4. Any business or service provider registered under `Dental` will have `category_id = "Dental"`. When a user visits the top-level `Healthcare` page, `matchIds` will not contain `"Dental"`, causing dental clinics to be omitted from the results.

**Fix Recommendation:**
- Implement a recursive ID collector in `CategoryListing.tsx` (identical to `getAllIds` in `AllCategories.tsx`), ensuring all descendant subcategory IDs are passed to the discovery queries.

---

### #C4 — Dual-Cursor Desync & Disruptive Layout Shift on "Load More"

**Area:** `src/screens/CategoryListing.tsx:74-129, 227-238`  
**Severity:** 🟠 P1 (Pagination & UX Hazard)

**Root cause:**
1. `CategoryListing.tsx` renders two distinct collections in a single vertical list: first `prov` (individual providers), followed by `biz` (storefronts).
2. A single shared "Load more" button controls pagination for both:
   ```tsx
   {(bizHasMore || provHasMore) && (
     <button
       className="btn btn-outline btn-block"
       disabled={loadingMoreBiz || loadingMoreProv}
       onClick={() => {
         if (bizHasMore && !loadingMoreBiz) loadMoreBiz();
         if (provHasMore && !loadingMoreProv) loadMoreProv();
       }}
     >
       {loadingMoreBiz || loadingMoreProv ? t("catlist_loading_more") : t("catlist_load_more")}
     </button>
   )}
   ```
3. When tapped, if `provHasMore` is true, new providers are appended to `extraProv`. Because providers are rendered above businesses in the DOM, adding new providers pushes the entire business list down by hundreds of pixels.
4. Users who were reading business cards experience a severe layout shift.
5. If one collection has more pages than the other (e.g. 5 pages of businesses but only 1 page of providers), `provHasMore` becomes false while `bizHasMore` remains true, yet the single button label does not clarify what is loading.

**Fix Recommendation:**
- Introduce view tabs (e.g., `All`, `Businesses (${biz.length})`, `Services (${prov.length})`) or separate the screen into distinct sections with dedicated pagination triggers.
- Alternatively, paginate providers and businesses independently within separated UI sections.

---

### #C5 — Silent Fallback to Pune Coordinates on Missing Location

**Area:** `src/screens/CategoryListing.tsx:61-70`, `src/services/marketplace/discoveryService.ts:67-68, 113-114`  
**Severity:** 🟠 P1 (Discovery Deception)

**Root cause:**
1. When a user has not granted GPS location or has not selected a neighborhood, `user.lat` and `user.lng` are `undefined`.
2. `CategoryListing.tsx` calls `discoveryService.businesses` and `discoveryService.providers` with `lat: undefined, lng: undefined`.
3. In `discoveryService.ts`, missing coordinates fall back to `DEFAULT_LAT = 18.536, DEFAULT_LNG = 73.893` (Pune, Maharashtra).
4. A user in Delhi, Mumbai, or Kolkata browsing a category without active location is silently served Pune listings located hundreds of kilometers away, with no banner or indicator stating that the location is unset.

**Fix Recommendation:**
- Detect when `user.lat` or `user.lng` is missing.
- Render a friendly prompt banner at the top of the listing: `"Set your location to see spots near you"` with a button that opens `LocationPickerSheet`.

---

### #C6 — Dead-End Empty State When Parent Category Has No Local Spots

**Area:** `src/screens/CategoryListing.tsx:204-222`  
**Severity:** 🟡 P2 (Missing Actionable CTAs)

**Root cause:**
1. When browsing a subcategory (`sub !== null`), if no results are found, the empty state displays a CTA: `"View all in [Category]"`.
2. However, when viewing the parent category (`sub === null`), the `action` prop is `undefined`:
   ```tsx
   action={
     sub ? (
       <button
         className="btn btn-secondary btn-sm"
         onClick={() => {
           haptics.selection();
           setSub(null);
         }}
       >
         {tf("catlist_view_all_in", { name: cat.name })}
       </button>
     ) : undefined
   }
   ```
3. The user reaches a dead end. There is no option to increase the search radius, post a request for that category, or add a listing.

**Fix Recommendation:**
- When `sub === null` and no spots are found, provide actionable options:
  1. `"Expand Search Radius"` (e.g. expand to 25 km).
  2. `"Post an Ask"` (navigate to `/ask` with pre-filled category).
  3. `"Suggest a Place"` (navigate to `/place/new`).

---

### #C7 — Fragile Back Navigation & Missing Category Breadcrumb

**Area:** `src/screens/CategoryListing.tsx:169`  
**Severity:** 🟡 P2 (Navigation Fragility)

**Root cause:**
1. The back button in `CategoryListing.tsx` calls `nav(-1)`:
   ```tsx
   <button className="icon-btn" onClick={() => nav(-1)}>←</button>
   ```
2. If a customer enters `/category/:id` via a direct URL, notification, or shared social link, `window.history.length` has no prior in-app history, causing `nav(-1)` to exit the app or fail.
3. Furthermore, when browsing deep subcategories, there is no breadcrumb navigation indicating the parent-child hierarchy (e.g., `Categories > Services > Pet Care`).

**Fix Recommendation:**
- Implement safe fallback navigation: `if (window.history.length > 1) nav(-1); else nav("/categories");`.
- Display a compact breadcrumb trail above the title for nested subcategories.

---

### #C8 — Phantom Category ID Generated on Proposal Insert Failure

**Area:** `src/services/marketplace/catalogService.ts:72-95`  
**Severity:** 🟡 P2 (Data Integrity Hazard)

**Root cause:**
1. When proposing a new category via `catalogService.proposeCategory`:
   ```ts
   const { data, error } = await sb.from("categories").insert({...}).select().maybeSingle();
   if (error) {
     console.warn("proposeCategory insert failed (may need RLS policy):", error.message);
     return { id: "prop_" + Date.now(), status: "PROPOSED" };
   }
   ```
2. If the user lacks permissions or the Supabase RLS policy rejects the insert, the function catches the error and returns an in-memory phantom object with `id: "prop_" + Date.now()`.
3. If a calling form (e.g., place submission or business onboarding) uses this generated ID to associate a business or listing, that entity will reference a non-existent category in the database, breaking foreign key constraints or orphaning the record.

**Fix Recommendation:**
- Ensure proper RLS policies for category proposals (or a dedicated `category_proposals` table).
- Throw a clear `ApiError` when the insert fails rather than synthesizing an ephemeral fake ID.
