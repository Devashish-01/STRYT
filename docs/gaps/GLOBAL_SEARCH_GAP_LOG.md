# Global Search & Live Autocomplete — Bug & Gap Log

**Purpose:** Documenting every defect, operational hazard, spatial search flaw, and accessibility issue in **Flow 1.2: Global Search & Live Autocomplete** (`src/screens/Search.tsx`, `src/screens/MapView/SearchBar.tsx`, `src/services/marketplace/discoveryService.ts`, and `src/services/marketplace/catalogService.ts`).

---

## Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **S1** | Missing Spatial Bounds & Arbitrary Disk Ordering in Search RPC | 🔴 P0 (Core Discovery Failure) | In `discoveryService.ts:216-218`, `search()` queries `businesses` and `providers` globally with no PostGIS distance constraint (`ST_DWithin`) and no SQL `order by`. Results are returned in arbitrary PostgreSQL heap/disk order across India. A customer in Pune searching for "salon" or "bakery" can receive shops in Delhi or Bangalore 1,500 km away on page 1, while a shop 200m away is buried or omitted. |
| **S2** | Catalog Items, Subcategories & Service Packages Search Blindspot | 🔴 P0 (Search Coverage Defect) | In `discoveryService.ts:217-218`, the search filter is strictly `or(name.ilike, category_name.ilike)`. It does not search `sub_category` (e.g. "Bakery", "Plumber", "Dentist"), nor does it search `catalog_items` (dishes, retail products, service packages). Searches for trending terms like "Birthday cake", "Biryani", or "AC repair" return 0 results unless the business literally contains those words in its legal name. |
| **S3** | Non-English Trending Chips Yield 100% False Zero-Result Screens | 🟠 P1 (Localization Failure) | In `Search.tsx:212-216`, trending chips use localized i18n keys. In Hindi and Marathi (`i18n.tsx:1477, 2596`), these evaluate to Devanagari script strings ("बिरयानी", "प्लम्बर", "सलून", "बर्थडे केक", "एसी रिपेयर", "ट्यूटर"). Because database records are in English, clicking any trending chip in Hindi or Marathi searches `name.ilike.%बिरयानी%` and returns 0 results 100% of the time. |
| **S4** | False Zero-Result Trap When "Open Now" Is Filtered Client-Side | 🟠 P1 (Pagination Deadlock) | In `Search.tsx:114-119, 243-256`, `openOnly` filtering executes client-side *after* fetching 10 rows from the database. If the first 10 businesses are currently closed, `bizResults` is empty (`total === 0`), triggering the EmptyState (`"No open results found"`). The "Load more" button is unmounted, permanently trapping the user and preventing access to open businesses on subsequent pages. |
| **S5** | Silent No-Op & Misleading Toast on Guest "Save Search" | 🟠 P1 (Guest State Deception) | In `discoveryService.ts:238-239`, `saveSearch()` silently exits if `!uid`. When an unauthenticated guest taps the bell icon in `Search.tsx:261`, `Search.tsx` displays `"We'll notify you when new places matching '{query}' open nearby!"`, falsely assuring the guest that alerts are set when nothing was saved. |
| **S6** | Missing URL Search Param Sync (`?q=`) Breaks Deep Links | 🟡 P2 (Routing & Deep-Linking) | `Search.tsx:29` initializes with `useState("")` and completely ignores `useSearchParams` / `location.search`. Deep links and in-app routes (e.g. `QrScannerSheet.tsx:76` navigating to `/search?q=@handle`) have their query parameter dropped, opening an empty search box. |
| **S7** | Dual-Cursor Desync & Asymmetric Layout Shift on "Load More" | 🟡 P2 (Layout & Pagination Defect) | A single "Load more" button controls both `bizCursor` and `provCursor`. Because `provResults` render above `bizResults`, new provider cards are inserted in the middle of the screen, pushing businesses down by ~1000px while reading. Furthermore, changing a query while pagination is in-flight sends the old cursor with the new query string. |
| **S8** | Missing Entity Segmentation Tabs ("All", "Shops", "Services") | 🟡 P2 (UX Mental Model Conflict) | `Search.tsx` groups all matching providers at the top and all businesses at the bottom without filter tabs. Users looking for physical shops must scroll past all freelance providers before seeing storefront results. |
| **S9** | Mobile Virtual Keyboard Dismissal & Missing Form Semantics | 🟢 P3 (Mobile Touch & UX) | The search input lacks `type="search"`, `enterKeyHint="search"`, and a `<form onSubmit>` wrapper. Pressing "Search" / "Go" on Android or iOS soft keyboards fails to dismiss the keyboard, obscuring search results. |

---

## Detailed Gap Analyses

---

### #S1 — Missing Spatial Bounds & Arbitrary Disk Ordering in Search RPC

**Area:** `src/services/marketplace/discoveryService.ts:202-233`, `src/screens/Search.tsx:44-50`, `src/screens/MapView/SearchBar.tsx:89-93`  
**Severity:** 🔴 P0 (Core Discovery Failure)

**Root cause:**
1. In `discoveryService.search()`:
   ```ts
   const [bizRes, provRes] = await Promise.all([
     sb.from("businesses").select("*", { count: "exact" }).eq("status", "ACTIVE").eq("owner_enabled", true).is("deleted_at", null).or(`name.ilike.${term},category_name.ilike.${term}`).range(bizFrom, bizTo),
     sb.from("providers").select("*", { count: "exact" }).eq("status", "ACTIVE").eq("owner_enabled", true).is("deleted_at", null).or(`display_name.ilike.${term},category_name.ilike.${term}`).range(provFrom, provTo),
   ]);
   ```
2. The query has **zero spatial filtering** and **zero `order()` clause**.
3. It performs a full table scan on `businesses` and `providers` across the entire nation, returning rows in whatever physical order PostgreSQL pages read them off disk.
4. If there are 50 active businesses matching "bakery" across India, the first 10 rows might be in Delhi, Jaipur, or Chennai, while the bakery 500 meters away from the customer in Pune is on page 4 or never returned.
5. The `withDistance` helper on lines 227 & 230 calculates distance *after* slicing the 10 arbitrary rows from the database.
6. The `radius` option is accepted in the function signature (`opts: { lat?: number; lng?: number; radius?: number ... }`), but is completely unused.

**Recommended Fix:**
- Introduce a PostGIS search RPC `businesses_search(in_lng, in_lat, in_query, in_radius_km, in_limit, in_offset)` that filters by `ST_DWithin` and orders by `ST_Distance(geom, point) asc`.
- If `lat` and `lng` are absent, fall back to ordering by `rating_avg desc` or `is_boosted desc`, rather than returning arbitrary disk order.

---

### #S2 — Catalog Items, Subcategories & Service Packages Search Blindspot

**Area:** `src/services/marketplace/discoveryService.ts:212-221`  
**Severity:** 🔴 P0 (Search Coverage Defect)

**Root cause:**
1. In `discoveryService.ts:217-218`:
   ```ts
   .or(`name.ilike.${term},category_name.ilike.${term}`)
   ```
2. The search only inspects `name` and `category_name`.
3. In STRYT's schema, businesses have `sub_category` (e.g. "Bakery", "Ice Cream", "Dentist", "Plumber"), and a child table `catalog_items` (dishes, retail inventory, grocery items). Providers have `provider_packages` (services offered).
4. If a user searches for an item like "croissant", "cold coffee", "oil change", or "hair spa", `discoveryService.search` matches nothing unless the shop is literally named "The Croissant Shop".
5. This breaks user expectation for a neighborhood local search app.

**Recommended Fix:**
- Expand the search query to include `sub_category.ilike.${term}`.
- Query matching `catalog_items` (e.g. `sb.from("catalog_items").select("business_id").ilike("name", term)`) and include those `business_id`s in the business search query.

---

### #S3 — Non-English Trending Chips Yield 100% False Zero-Result Screens

**Area:** `src/screens/Search.tsx:208-216`, `src/lib/i18n.tsx:1477, 2596`  
**Severity:** 🟠 P1 (Localization Failure)

**Root cause:**
1. In `Search.tsx:212-216`:
   ```tsx
   {TREND_KEYS.map((key) => {
     const word = t(key);
     return <button key={key} className="chip" onClick={() => setQ(word)}>🔥 {word}</button>;
   })}
   ```
2. When the user switches the app language to Hindi (`hi`) or Marathi (`mr`), `t("search_trend_1")` returns `"बिरयानी"`, `t("search_trend_2")` returns `"प्लम्बर"`, etc.
3. Tapping the chip immediately sets `q = "बिरयानी"` and runs `discoveryService.search("बिरयानी")`.
4. In the database, merchant business names, provider display names, and categories are stored in English (e.g. "PK Biryani House", "Quick Fix Plumber").
5. The PostgreSQL ILIKE query searches for `%बिरयानी%` and returns 0 matches.
6. The user is presented with a dead-end empty state on the app's own curated trending suggestions.

**Recommended Fix:**
- Maintain an internal English search term mapping for each trend key:
  ```ts
  const TREND_ITEMS = [
    { key: "search_trend_1", query: "Biryani" },
    { key: "search_trend_2", query: "Plumber" },
    { key: "search_trend_3", query: "Salon" },
    { key: "search_trend_4", query: "Cake" },
    { key: "search_trend_5", query: "AC repair" },
    { key: "search_trend_6", query: "Tutor" },
  ];
  ```
- Alternatively, include alias / transliteration matching in the search service.

---

### #S4 — False Zero-Result Trap When "Open Now" Is Filtered Client-Side

**Area:** `src/screens/Search.tsx:114-119, 243-256`  
**Severity:** 🟠 P1 (Pagination Deadlock)

**Root cause:**
1. In `Search.tsx`:
   ```ts
   const rawBizResults = [...(results?.businesses.data ?? []), ...extraBiz];
   const bizResults = openOnly
     ? rawBizResults.filter((b) => evaluateProviderAvailability(b.hours, b.isAvailableNow, b.availableUntil).isOpenNow)
     : rawBizResults;
   ```
2. The `openOnly` filter is purely client-side and runs *after* fetching 10 rows.
3. Suppose there are 30 matching cafes in the city. The first 10 returned in the initial page happen to be closed right now.
4. `bizResults` has length 0, and `total === 0`.
5. In line 243:
   ```tsx
   } : total === 0 && catResults.length === 0 ? (
     openOnly && rawTotal > 0 ? (
       <div className="col center"> ... </div>
     )
   ```
6. The UI renders the `EmptyState`. The "Load more" button is inside `{bizHasMore || provHasMore}` at line 295, which is only rendered when `total > 0`.
7. Even though cafes 11 through 30 in the database might be open right now, the user can never load them.

**Recommended Fix:**
- Either render a "Check next places" / "Load more" action inside the `openOnly && rawTotal > 0` empty state, or filter `is_available_now` directly in the database query when `openOnly` is active.

---

### #S5 — Silent No-Op & Misleading Toast on Guest "Save Search"

**Area:** `src/screens/Search.tsx:145-160, 261-265, 289-291`, `src/services/marketplace/discoveryService.ts:236-245`  
**Severity:** 🟠 P1 (Guest State Deception)

**Root cause:**
1. In `discoveryService.saveSearch`:
   ```ts
   async saveSearch(query: string, lat?: number, lng?: number, radiusKm = 5): Promise<void> {
     const uid = await currentUserId();
     if (!uid) return;
     ...
   ```
2. In `Search.tsx:145-160`:
   ```ts
   async function toggleSaveSearch() {
     if (!debounced) return;
     try {
       if (isSaved) { ... }
       else {
         await discoveryService.saveSearch(debounced, user.lat || undefined, user.lng || undefined);
         showToast(tf("search_will_notify", { query: debounced }));
       }
     } ...
   }
   ```
3. For guest visitors (`!uid`), `saveSearch` returns early with no database write.
4. `toggleSaveSearch` displays the success toast: `"We'll notify you when new places matching '{query}' open nearby!"`.
5. No record is saved in `saved_searches`, and no push notification will ever be sent.
6. The user is deceived into believing their alert is active.

**Recommended Fix:**
- Wrap `toggleSaveSearch` with `requireAuth(() => toggleSaveSearch(), "Sign in to get alerts for new nearby spots")`.

---

### #S6 — Missing URL Search Param Sync (`?q=`) Breaks Deep Links

**Area:** `src/screens/Search.tsx:1-35`  
**Severity:** 🟡 P2 (Routing & Deep-Linking)

**Root cause:**
1. `Search.tsx` only imports `useNavigate`. It does not import `useSearchParams` from `react-router-dom`.
2. State is initialized as `const [q, setQ] = useState("")`.
3. When `QrScannerSheet.tsx:76` navigates to `/search?q=${encodeURIComponent(path)}`, or when a user clicks a notification linking to `/search?q=pizza`, `Search.tsx` never reads the `q` URL search param.
4. The search input remains empty and no search is performed.

**Recommended Fix:**
- Read initial query from `useSearchParams`:
  ```ts
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const [q, setQ] = useState(initialQ);
  ```
- Sync `setSearchParams({ q: debounced }, { replace: true })` when `debounced` changes.

---

### #S7 — Dual-Cursor Desync & Asymmetric Layout Shift on "Load More"

**Area:** `src/screens/Search.tsx:75-110, 293-306`  
**Severity:** 🟡 P2 (Layout & Pagination Defect)

**Root cause:**
1. Providers are rendered first (`provResults.map(...)`), followed by businesses (`bizResults.map(...)`).
2. A single "Load more" button at the bottom calls both `loadMoreBiz()` and `loadMoreProv()`.
3. If new providers are returned, they are appended to `extraProv`, inserting cards into the middle of the page above the businesses. This causes an unexpected ~1000px downward layout shift while the user is reading business cards.
4. If a user types a new character in the search box while `loadMore` is executing, the old cursors collide with the new search term.

**Recommended Fix:**
- Provide segmented views (Tabs: "All", "Shops", "Services") so pagination only applies to the actively viewed list.
- Interleave or sort all results by `distanceKm` rather than rendering all providers above all shops.

---

### #S8 — Missing Entity Segmentation Tabs ("All", "Shops", "Services")

**Area:** `src/screens/Search.tsx:278-306`  
**Severity:** 🟡 P2 (UX Mental Model Conflict)

**Root cause:**
- Shops (physical walk-in stores with inventory, queues, and tables) and individual freelance providers (at-home handymen, tutors, electricians) require different user intents. Dumping all providers ahead of all shops creates unnecessary friction.

**Recommended Fix:**
- Add a segmented filter bar above results: `[ All (N) | Shops (N) | Service Pros (N) ]`.

---

### #S9 — Mobile Virtual Keyboard Dismissal & Missing Form Semantics

**Area:** `src/screens/Search.tsx:165-186`  
**Severity:** 🟢 P3 (Mobile Touch & UX)

**Root cause:**
- The search bar is a bare `<input>` inside a `<div>`. On mobile devices, pressing "Enter" / "Search" on the virtual keyboard does not trigger a form submit or blur the input. The virtual keyboard remains open, obscuring 50% of the screen.

**Recommended Fix:**
- Wrap the input in a `<form onSubmit={(e) => { e.preventDefault(); (document.activeElement as HTMLElement)?.blur(); }}>`.
- Add `type="search"` and `enterKeyHint="search"`.

---

## Verification & Validation Plan

### Automated Regression Tests
1. **URL Param Hydration:** Test that `/search?q=pizza` initializes `q` to `"pizza"` and triggers the search query immediately.
2. **Guest Save Search Gate:** Test that tapping save search as a guest invokes `requireAuth` and does not display the false confirmation toast.
3. **Open-Now Filter with Empty First Page:** Verify that when page 1 items are closed, the UI allows paginating to find open businesses.
