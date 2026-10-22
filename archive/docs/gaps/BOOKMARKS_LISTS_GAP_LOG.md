# STRYT — Flow 9.5: Curated Bookmarks & Custom Lists Gap Log

**Audit Date:** September 9, 2026  
**Flow Identifier:** Flow 9.5 — Domain 9 (Community, Social Trust, Ratings & Reviews)  
**Primary Components:** [`Bookmarks.tsx`](file:///d:/zetax/name/STRYT/src/screens/Bookmarks.tsx), [`Lists.tsx`](file:///d:/zetax/name/STRYT/src/screens/Lists.tsx), [`AddToListSheet.tsx`](file:///d:/zetax/name/STRYT/src/components/AddToListSheet.tsx), [`Profile.tsx`](file:///d:/zetax/name/STRYT/src/screens/Profile.tsx), [`BusinessDetail.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/BusinessDetail.tsx), [`ProviderDetail.tsx`](file:///d:/zetax/name/STRYT/src/screens/provider/ProviderDetail.tsx)  
**Backend Services & Tables:** `store.tsx`, `useCommerceSlice.ts`, `useSocialSlice.ts`, `public.bookmarks`, `public.user_lists`, `public.user_list_items`  
**Launch Readiness Status:** 🔴 **Critical Audit Blockers (Unregistered /lists Route 404, Zero Deletion Mechanism, Promise.all N+1 Waterfall)**

---

## 1. Executive Summary

Flow 9.5 governs customer curation, saved entities, and custom list organization in STRYT. The experience is bifurcated into two systems:
1. **Flat Bookmarks (`/bookmarks`, `Bookmarks.tsx`):** Quick-save toggling (`toggleBookmark`) for businesses, service providers, community requests, and saved posts.
2. **Custom Curated Lists (`/lists`, `Lists.tsx`, `AddToListSheet.tsx`):** User-named thematic collections (e.g. "Weekend Dining", "Home Repairs") backed by `user_lists` and `user_list_items`.

While both data models exist in PostgreSQL with cascading foreign keys and RLS policies, flow tracing revealed catastrophic routing and data management failures:
1. **Unregistered `/lists` Route in `App.tsx` (P0):** In `Profile.tsx:166`, a primary action row ("My lists") executes `nav("/lists")`. The screen component `src/screens/Lists.tsx` is completely implemented on disk, but **never registered in `src/App.tsx`**. Clicking "My lists" from the customer profile hits an immediate 404 not found dead end.
2. **Zero Deletion Mechanics for Lists or Items (P0):** Once a customer creates a custom list or adds an item, there is **no delete button anywhere in the application**. Neither `Lists.tsx` nor `AddToListSheet.tsx` offers item removal. Furthermore, `useCommerceSlice.ts` does not even implement `deleteList` or `removeFromList` methods. All created lists and items are permanently trapped as undeletable zombie data.
3. **Promise.all N+1 Network Request Waterfall in `Bookmarks.tsx` (P0):** `Bookmarks.tsx` fetches saved businesses and providers by mapping IDs through `businessService.get(id)` and `providerService.get(id)` concurrently via `Promise.all`. A customer with 40 saved items triggers 40 simultaneous HTTP requests, threatening mobile performance and socket limits.
4. **Provider Profile Missing "Add to List" Integration (P1):** While `BusinessDetail.tsx` renders `AddToListSheet`, `ProviderDetail.tsx` has no "Add to list" entry point, preventing customers from organizing technicians and service pros into curated lists.
5. **Severed List Sharing (P1):** While lists display a "shared" badge in the UI, list sharing is disabled because RLS policies restrict queries to `user_id = auth.uid()`, and no public viewer route exists.

---

## 2. Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **LIST-1** | Unregistered `/lists` Route in `App.tsx` Triggers 404 from Profile Hub | 🔴 P0 (Broken Route / Dead End) | Clicking "My lists" on `Profile.tsx` navigates to `/lists`, which is missing from `App.tsx`, showing a blank 404 page. |
| **LIST-2** | Complete Absence of Deletion Functions for Custom Lists and Items | 🔴 P0 (Permanent Data Trap) | Neither the UI (`Lists.tsx`, `AddToListSheet.tsx`) nor the client store (`useCommerceSlice.ts`) implements `deleteList` or `removeFromList`. Saved items cannot be deleted. |
| **LIST-3** | Massive Promise.all N+1 Query Waterfall in `Bookmarks.tsx` | 🔴 P0 (Network Congestion / Performance) | Every bookmarked business and provider triggers an independent HTTP fetch in parallel instead of a single batched `.in("id", ids)` query. |
| **LIST-4** | Provider Profile Lacks "Add to List" Action Sheet | 🟠 P1 (Feature Parity Gap) | Customers can bookmark providers but cannot add them to custom lists from `ProviderDetail.tsx`. |
| **LIST-5** | Optimistic Dummy ID Desync in `createList` | 🟠 P1 (Foreign Key Failure on Save) | If `createList` network insert fails, items added to the list trigger database foreign key errors, losing items on refresh. |
| **LIST-6** | Severed List Sharing & Missing Public List View | 🟠 P1 (Social Feature Blindspot) | Curated lists cannot be shared with neighbors due to restrictive RLS and missing public list route. |
| **LIST-7** | Emoji Picker Keyboard & Touch Accessibility | 🟡 P2 (Accessibility / Mobile Polish) | Emoji picker buttons lack focus indicators, `aria-label`s, and standard 44px touch targets. |

---

## 3. Detailed Findings & Root Cause Analysis

---

### 🔴 LIST-1 (P0): Unregistered `/lists` Route in `App.tsx` Triggers 404 from Profile Hub

- **Location:** [`src/App.tsx:624-633`](file:///d:/zetax/name/STRYT/src/App.tsx#L624-L633), [`src/screens/Profile.tsx:166`](file:///d:/zetax/name/STRYT/src/screens/Profile.tsx#L166), [`src/screens/Lists.tsx`](file:///d:/zetax/name/STRYT/src/screens/Lists.tsx)
- **Root Cause:**
  1. In `src/screens/Profile.tsx:166`:
     ```tsx
     { icon: <ListChecks size={20} />, label: "My lists", sub: lists.length > 0 ? ..., onClick: () => nav("/lists") }
     ```
  2. In `src/App.tsx`, routes around line 628 are:
     ```tsx
     <Route path="/notifications" element={<Notifications />} />
     <Route path="/bookmarks" element={<Bookmarks />} />
     <Route path="/followers" element={<Followers />} />
     <Route path="/queues" element={<MyQueues />} />
     <Route path="/my-activity" element={<MyActivity />} />
     ```
  3. `<Route path="/lists" element={<Lists />} />` was never registered.
  4. Lazy import `const Lists = lazy(() => import("./screens/Lists"));` is missing.
  5. Any customer tapping "My lists" from Profile hits the catch-all route and sees a 404 dead end.
- **Remediation Plan:**
  Import `Lists` lazily in `App.tsx` and register `<Route path="/lists" element={<Lists />} />`.

---

### 🔴 LIST-2 (P0): Complete Absence of Deletion Functions for Custom Lists and Items

- **Location:** [`src/screens/Lists.tsx:74-90`](file:///d:/zetax/name/STRYT/src/screens/Lists.tsx#L74-L90), [`src/components/AddToListSheet.tsx:39`](file:///d:/zetax/name/STRYT/src/components/AddToListSheet.tsx#L39), [`src/store/useCommerceSlice.ts:77-111`](file:///d:/zetax/name/STRYT/src/store/useCommerceSlice.ts#L77-L111)
- **Root Cause:**
  1. In `useCommerceSlice.ts`:
     ```typescript
     return {
       ...
       lists, setLists, createList, addToList, isInAnyList,
     };
     ```
     `deleteList` and `removeFromList` are completely omitted from the state slice.
  2. In `AddToListSheet.tsx:39`:
     `onClick={() => { if (!has) addToList(l.id, type, id); onClose(); }}`
     If an item is already in the list, tapping it is a no-op. It cannot be toggled off.
  3. In `Lists.tsx`, individual items render with only a `ChevronRight` navigation arrow. There is no swipe-to-delete, trash icon, or remove action.
  4. In `Lists.tsx`, there is no "Delete list" button on list detail or on list cards.
  5. Customers who create lists or add items are unable to delete them, permanently polluting their profile state.
- **Remediation Plan:**
  - Implement `removeFromList(listId: string, type: BookmarkTarget, id: string)` in `useCommerceSlice.ts` calling `delete().from("user_list_items")`.
  - Implement `deleteList(listId: string)` in `useCommerceSlice.ts` calling `delete().from("user_lists")`.
  - Add a remove button on item cards in `Lists.tsx`, and a "Delete list" option in the list header.
  - Allow toggling off in `AddToListSheet.tsx` if `has === true`.

---

### 🔴 LIST-3 (P0): Massive Promise.all N+1 Query Waterfall in `Bookmarks.tsx`

- **Location:** [`src/screens/Bookmarks.tsx:41-55`](file:///d:/zetax/name/STRYT/src/screens/Bookmarks.tsx#L41-L55)
- **Root Cause:**
  ```typescript
  const { data: bizData, loading: bizLoading } = useQuery(async () => {
    const rows = await Promise.all(bizIds.map((id) => businessService.get(id).catch(() => undefined)));
    return rows.filter((b): b is Business => !!b);
  }, [bizIds.join(",")], `bookmarks:biz-by-id:${user.id}:${bizIds.join(",")}`);
  ```
  Instead of executing a single batch query (`sb.from("businesses").select(...).in("id", bizIds)`), the client calls `businessService.get(id)` for each bookmarked ID individually.
  For a user with 20 bookmarked businesses, 15 bookmarked providers, and 10 saved requests, opening `/bookmarks` triggers **45 parallel HTTP network requests**. On mobile connections, this causes severe latency, thread contention, and frequent request drops.
- **Remediation Plan:**
  Add batch query methods:
  - `businessService.getByIds(ids: string[])`
  - `providerService.getByIds(ids: string[])`
  - `requestService.getByIds(ids: string[])`
  and update `Bookmarks.tsx` and `Lists.tsx` to use batch fetching.

---

### 🟠 LIST-4 (P1): Provider Profile Lacks "Add to List" Action Sheet

- **Location:** [`src/screens/provider/ProviderDetail.tsx:195-205`](file:///d:/zetax/name/STRYT/src/screens/provider/ProviderDetail.tsx#L195-L205)
- **Root Cause:**
  In `BusinessDetail.tsx`, users have both a bookmark toggle and an "Add to list" modal (`AddToListSheet`).
  In `ProviderDetail.tsx`, there is only a bookmark button. `AddToListSheet` is never imported or rendered. Users cannot save providers to custom collections (e.g. "Electricians", "Salon at home").
- **Remediation Plan:**
  Import `AddToListSheet` into `ProviderDetail.tsx` and render an "Add to list" option in the header or action menu.

---

### 🟠 LIST-5 (P1): Optimistic Dummy ID Desync in `createList`

- **Location:** [`src/store/useCommerceSlice.ts:60-72`](file:///d:/zetax/name/STRYT/src/store/useCommerceSlice.ts#L60-L72)
- **Root Cause:**
  In `createList`:
  ```typescript
  let realId = "sl" + Math.random().toString(36).slice(2, 7);
  if (uid) {
    const { data } = await getSupabase().from("user_lists").insert({ user_id: uid, name, emoji }).select("id").single();
    if (data?.id) realId = data.id;
  }
  setLists((p) => [...p, { id: realId, name, emoji, shared: false, items: [] }]);
  return realId;
  ```
  If the network request fails, `data?.id` is undefined. The code silently falls back to the random string `realId` and appends it to state. When the user subsequently calls `addToList(realId, ...)`, the insert into `user_list_items` fails foreign key validation, resulting in silent data loss on refresh.
- **Remediation Plan:**
  Throw on error in `createList` and only append to `lists` state when a valid database ID is returned.

---

### 🟠 LIST-6 (P1): Severed List Sharing & Missing Public List View

- **Location:** [`src/screens/Lists.tsx:50-54`](file:///d:/zetax/name/STRYT/src/screens/Lists.tsx#L50-L54), [`supabase/legacy/migration_r8.sql:96`](file:///d:/zetax/name/STRYT/supabase/legacy/migration_r8.sql#L96)
- **Root Cause:**
  `user_lists` RLS policy enforces `user_id = auth.uid()::text`.
  A user cannot share a curated list with a friend or neighbor because anyone else querying `user_lists` or `user_list_items` receives an empty set.
  The UI displays a `Users` shared icon, but the feature is non-functional.
- **Remediation Plan:**
  Add a `shared = true` clause to `read_lists` and `read_list_items` RLS policies, and register `/list/:id` for public list sharing.

---

## 4. Master Tracker Registration

- **Domain:** Domain 9 — Community, Social Trust, Ratings & Reviews
- **Flow Identifier:** Flow 9.5 — Curated Bookmarks & Custom Lists
- **Audit Date:** September 9, 2026
- **Status:** 🔴 **Audited — Blocked by P0 Unregistered /lists Route, P0 Undeletable Data & N+1 Waterfall**
- **Gap Log File:** [`docs/gaps/BOOKMARKS_LISTS_GAP_LOG.md`](file:///d:/zetax/name/STRYT/docs/gaps/BOOKMARKS_LISTS_GAP_LOG.md)
