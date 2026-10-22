# Home Feed & Neighborhood Discovery — Bug & Gap Log

**Purpose:** Documenting every defect, operational hazard, guest mode failure, and architectural flaw in **Flow 1.1: Home Feed & Neighborhood Discovery** (`src/screens/Home.tsx`, `src/components/LocationPickerSheet.tsx`, `src/services/marketplace/discoveryService.ts`, `src/services/core/userService.ts`, `src/components/cards.tsx`, and `src/hooks/useApi.ts`).

---

## Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **H1** | Guest Mode Location Selection Fails With 401 Unauthenticated Error | 🔴 P0 (Guest Flow Blocker) | In `LocationPickerSheet.tsx:55, 79`, picking an area or tapping "Use current GPS location" unconditionally calls `userService.setLocation()`, which throws a 401 unauthenticated error for all guest visitors. The modal displays `"Couldn't set location"` or `"Got GPS fix, but couldn't save it"`, preventing guests from ever setting their discovery neighborhood. |
| **H2** | Stale & Cross-City Cache Pollution via Shared Cache Keys | 🔴 P0 (Data Integrity Hazard) | Cache keys `home:nearby-biz:${user.id}` and `home:nearby-prov:${user.id}` collapse to `home:nearby-biz:` for all guest visitors regardless of device or location. For authenticated users, coordinates (`lat/lng`) are omitted from the cache key, causing users who switch neighborhoods or travel between cities to be served stale listings from their previous city. |
| **H3** | Unfiltered Realtime Subscriptions & Personal Query Avalanche on Guest Mount | 🟠 P1 (Performance & Socket Leak) | `Home.tsx:117-135` fires 9 concurrent queries on mount. For guest users (`user.id === ""`), personal queries (`appointmentService.listForCustomer("")`, `businessService.myQueues()`, `locationService.pendingForMe()`) still execute. Crucially, `useQueryWithRealtime` registers wildcard subscriptions to `queue_tokens`, `location_share_grants`, and `notifications` without row filters, causing every guest client to wake and refetch whenever any customer in the system updates a token. |
| **H4** | Silent Fallback to Pune Coordinates When Location Is Missing | 🟠 P1 (Discovery Deception) | In `discoveryService.ts:67-68, 113-114`, missing coordinates fallback to `DEFAULT_LAT = 18.536`, `DEFAULT_LNG = 73.893` (Pune). If a user in Delhi, Bangalore, or Mumbai skips location during onboarding or denies GPS, the backend PostGIS RPC queries Pune, returning Pune listings at 0.5 km while Delhi shops appear at 1,400 km away. |
| **H5** | Silent Disappearance of Discovery Rail on Network or RPC Failure | 🟡 P2 (Resilience & Error Handling) | In `Home.tsx:121, 126`, error objects from `useQuery` for `nearbyBiz` and `nearbyProv` are not destructured or handled. If an offline or RPC failure occurs, the loading skeleton vanishes and nothing renders—no error toast, no retry card, and no empty state. |
| **H6** | Mixed Entity Clutter (Businesses & Providers) in Single Rail | 🟡 P2 (UX & Mental Model Conflict) | `Home.tsx:617-620, 888-892` dumps up to 6 `BusinessCardSmall` and 6 `ProviderCardSmall` into a single horizontal scroll rail without visual division. On standard mobile displays, users must scroll through ~960px of businesses before discovering that individual service providers exist. |
| **H7** | Hardcoded `#fff` Color Literals & Non-Semantic Design Token Violations | 🟢 P3 (Design System) | Raw `#fff` color strings and hardcoded rgba values in `Home.tsx` (lines 284, 295, 303, 325, 326, 329, 337, 341, 351, 676, 726, 917) and `LocationPickerSheet.tsx` (lines 104, 152) violate dark mode support and theme token rules. |

---

## Detailed Gap Analyses

---

### #H1 — Guest Mode Location Selection Fails With 401 Unauthenticated Error

**Area:** `src/components/LocationPickerSheet.tsx:48-64, 66-96`, `src/services/core/userService.ts:260-281`, `src/store.tsx:286-294`  
**Severity:** 🔴 P0 (Guest Flow Blocker)

**Root cause:**
1. A guest visitor browses the Home screen. They tap on the location pill in the living sky header or the `"Set your neighborhood"` card to select their area.
2. The user taps `"Use current GPS location"` or selects a nearby neighborhood from the list:
   ```ts
   // LocationPickerSheet.tsx:48-64
   async function handleSelect(p: GeoPlace) {
     if (onPick) { ... return; }
     try {
       await userService.setLocation(p.lat, p.lng, p.area);
       await refreshUser();
       setArea(p.area);
       ...
     } catch {
       showToast("Couldn't set location");
     }
   }
   ```
3. `userService.setLocation` explicitly enforces user authentication:
   ```ts
   // userService.ts:260-264
   async setLocation(lat: number, lng: number, area?: string) {
     const sb = getSupabase();
     const uid = await currentUserId();
     if (!uid) throw toApiError({ code: "UNAUTHENTICATED", message: "Not signed in" }, 401);
     ...
   }
   ```
4. For any guest user, `uid` is null. `userService.setLocation` throws an unauthenticated 401 error.
5. The catch block in `LocationPickerSheet` intercepts the rejection and triggers an error toast:
   - When picking an area: `"Couldn't set location"`.
   - When using GPS: `"Got GPS fix, but couldn't save it — check connection & retry"`.
6. As a result, guests can **never** change their location or use GPS from the Home screen. Their discovery feed remains locked to the hardcoded default Pune coordinates, breaking the entire first-time guest exploration experience.

**Recommended Fix:**
- Check `isGuest` inside `LocationPickerSheet.tsx`.
- For guests, bypass `userService.setLocation` and `refreshUser()`. Directly update the in-memory/session state (e.g. `setGuestLocation({ lat: p.lat, lng: p.lng })` and `setArea(p.area)`).
- Provide a `setGuestLocation` dispatch in `useApp()` store so guest coordinates immediately update `viewUser.lat`, `viewUser.lng`, and `area` without attempting a database write.

---

### #H2 — Stale & Cross-City Cache Pollution via Shared Cache Keys

**Area:** `src/screens/Home.tsx:121-130`, `src/hooks/useApi.ts:16-35`  
**Severity:** 🔴 P0 (Data Integrity & Caching Defect)

**Root cause:**
1. In `Home.tsx:121-130`:
   ```ts
   const { data: nearbyBizPage, loading: nearbyBizLoading, refetch: refetchNearbyBiz } = useQuery(
     () => discoveryService.businesses({ lat: user.lat || undefined, lng: user.lng || undefined, sort: "nearby" }),
     [user.lat, user.lng],
     `home:nearby-biz:${user.id}`
   );
   const { data: nearbyProvPage, loading: nearbyProvLoading, refetch: refetchNearbyProv } = useQuery(
     () => discoveryService.providers({ lat: user.lat || undefined, lng: user.lng || undefined, sort: "nearby" }),
     [user.lat, user.lng],
     `home:nearby-prov:${user.id}`
   );
   ```
2. For all guests, `user.id` is `""`. The cache key resolves to `home:nearby-biz:`.
3. If Guest A in Bandra, Mumbai opens the app, Mumbai businesses are cached in-memory under `home:nearby-biz:`. If the guest subsequently selects Andheri or moves cities, or if another session opens on the same device, `useQuery` immediately serves the stale Bandra listings from the cache.
4. For authenticated users, the cache key is `home:nearby-biz:${user.id}`. The user's coordinates (`lat/lng`) and selected `area` are **omitted** from the key string.
5. If an authenticated user travels from Mumbai to Bangalore, or updates their neighborhood in `LocationPickerSheet`, `useQuery` sees a cache hit for `home:nearby-biz:${user.id}` and continues to display Mumbai businesses until cache TTL expires.

**Recommended Fix:**
- Incorporate geocoordinates into the cache keys:
  ```ts
  const geoKey = `${(user.lat ?? 0).toFixed(2)}:${(user.lng ?? 0).toFixed(2)}`;
  const bizCacheKey = `home:nearby-biz:${user.id || "guest"}:${geoKey}`;
  const provCacheKey = `home:nearby-prov:${user.id || "guest"}:${geoKey}`;
  ```

---

### #H3 — Unfiltered Realtime Subscriptions & Personal Query Avalanche on Guest Mount

**Area:** `src/screens/Home.tsx:117-136`, `src/hooks/useApi.ts:120-167`  
**Severity:** 🟠 P1 (Performance & Socket Leak Hazard)

**Root cause:**
1. `Home.tsx` concurrently triggers 9 queries on mount:
   - `catalogService.getCategories()`
   - `requestService.agreements()`
   - `discoveryService.businesses(...)`
   - `discoveryService.providers(...)`
   - `appointmentService.listForCustomer(user.id)`
   - `businessService.myQueues()`
   - `bulkService.myPledgedDeals(...)`
   - `locationService.pendingForMe()`
   - `notificationService.getUnreadCount({ scope: "CUSTOMER" })`
2. For guest users (`user.id === ""`), personal queries execute pointlessly:
   - `appointmentService.listForCustomer("")` queries localStorage and returns any orphaned entries where `!a.customerId`.
   - `requestService.agreements()` executes a database cleanup sweep (`sweepExpired(sb)`) before returning `[]`.
3. More critically, lines 132-135 establish realtime WebSocket subscriptions:
   ```ts
   const { data: myQueuesData, refetch: refetchQueues } = useQueryWithRealtime(
     () => businessService.myQueues(),
     "queue_tokens",
     [user.id],
     user.id ? `customer_user_id=eq.${user.id}` : undefined,
     `home:queues:${user.id}`
   );
   ```
4. For guests, `user.id` is empty, so `filter` is passed as `undefined`.
5. In `useApi.ts:147`, an undefined filter registers a wildcard subscription on the entire `queue_tokens` table:
   `sb.channel(channelName).on("postgres_changes", { event: "*", schema: "public", table: "queue_tokens" })`.
6. Every time **any customer across the entire platform** joins a queue, is called, or leaves a queue, all guest app instances receive a realtime broadcast and trigger an unnecessary `businessService.myQueues()` round-trip.
7. The same issue affects `location_share_grants` (`locationService.pendingForMe()`) and `notifications`.

**Recommended Fix:**
- Short-circuit personal queries when `!user.id` or `isGuest`:
  ```ts
  const { data: myQueuesData } = useQueryWithRealtime(
    () => user.id ? businessService.myQueues() : Promise.resolve([]),
    "queue_tokens",
    [user.id],
    user.id ? `customer_user_id=eq.${user.id}` : undefined,
    user.id ? `home:queues:${user.id}` : undefined
  );
  ```
- In `useQueryWithRealtime`, do not establish a WebSocket channel if `!filter` on user-scoped tables, or if the user is unauthenticated.

---

### #H4 — Silent Fallback to Pune Coordinates When Location Is Missing

**Area:** `src/services/marketplace/discoveryService.ts:29-32, 67-68, 113-114`, `src/config.ts:13-16`  
**Severity:** 🟠 P1 (Discovery Deception)

**Root cause:**
1. In `src/config.ts`:
   ```ts
   defaultLocation: {
     lat: Number(env.VITE_DEFAULT_LAT ?? 18.536),
     lng: Number(env.VITE_DEFAULT_LNG ?? 73.893),
   }
   ```
2. In `discoveryService.ts`:
   ```ts
   const userLat = p.lat ?? DEFAULT_LAT;
   const userLng = p.lng ?? DEFAULT_LNG;
   ```
3. When a user in Delhi, Kolkata, or Bangalore skips location permissions or chooses to explore without granting GPS, `p.lat` and `p.lng` are undefined.
4. `discoveryService.businesses` automatically injects Pune coordinates into the PostGIS RPC call (`businesses_nearby` with `GLOBAL_RADIUS_KM = 20000`).
5. The UI displays: `"Location off: showing unranked nearby businesses"`.
6. In reality, the listings are not unranked; they are ranked by distance from Pune center. Pune businesses appear at 0.5 km – 2 km away, while local Delhi businesses appear at 1,400 km away.
7. This causes severe user confusion on newly launched cities because users assume the app only works in Pune or that their local neighborhood has zero businesses.

**Recommended Fix:**
- When `p.lat` and `p.lng` are undefined, do not silently query `businesses_nearby` with Pune coordinates.
- Instead, query active businesses ordered by `rating_avg` or `is_new` (non-spatial discovery), or display a clear city selector banner prompting the user to pick their city rather than defaulting to Pune.

---

### #H5 — Silent Disappearance of Discovery Rail on Network or RPC Failure

**Area:** `src/screens/Home.tsx:121-130, 601-622, 875-893`  
**Severity:** 🟡 P2 (Resilience & Error Handling)

**Root cause:**
1. In `Home.tsx`:
   ```ts
   const { data: nearbyBizPage, loading: nearbyBizLoading, refetch: refetchNearbyBiz } = useQuery(...);
   const { data: nearbyProvPage, loading: nearbyProvLoading, refetch: refetchNearbyProv } = useQuery(...);
   ```
2. The `error` return values from `useQuery` are completely ignored.
3. In lines 608 & 883:
   ```tsx
   : (nearbyBiz.length > 0 || nearbyProv.length > 0) && (
     <div style={{ paddingTop: 18 }}> ... </div>
   )
   ```
4. If a network blip occurs, the PostGIS RPC times out, or the device is temporarily offline, `nearbyBizLoading` turns false and both arrays have length 0.
5. The section silently unmounts. The user is presented with a blank space between the launch tiles and empty CTA, with zero explanation and no retry button.

**Recommended Fix:**
- Capture `error: nearbyBizError` and `error: nearbyProvError`.
- If both fail, render a subtle inline retry card:
  `"Couldn't load nearby shops — Tap to retry"` with `refetchNearbyBiz()`.

---

### #H6 — Mixed Entity Clutter (Businesses & Providers) in Single Rail

**Area:** `src/screens/Home.tsx:617-620, 888-892`  
**Severity:** 🟡 P2 (UX & Mental Model Conflict)

**Root cause:**
1. In both mobile and desktop views:
   ```tsx
   <div className="hscroll" style={{ paddingTop: 10 }}>
     {nearbyBiz.slice(0, 6).map((b, idx) => <BusinessCardSmall key={b.id} b={b} ... />)}
     {nearbyProv.slice(0, 6).map((p, idx) => <ProviderCardSmall key={p.id} p={p} ... />)}
   </div>
   ```
2. Up to 6 physical shop cards (`BusinessCardSmall`, width 160px) are followed by up to 6 individual freelance provider cards (`ProviderCardSmall`, width 154px) in the exact same horizontal scroll container.
3. There is no section header, separator, or label distinguishing shops from independent tradespeople.
4. To see even the first provider card, a mobile user must horizontally scroll through ~960px of business cards. Most users will never discover that service providers exist on their street.

**Recommended Fix:**
- Provide two distinct rails with clear headings:
  1. `"Shops & Spots Near You"` (`nearbyBiz.slice(0, 8)`)
  2. `"Local Experts & Freelancers"` (`nearbyProv.slice(0, 8)`)
- Or provide a toggle pill (`"All"`, `"Shops"`, `"Services"`) above the rail to filter the view without horizontal burial.

---

### #H7 — Hardcoded `#fff` Color Literals & Non-Semantic Design Token Violations

**Area:** `src/screens/Home.tsx:284, 295, 303, 325, 326, 329, 337, 341, 351, 676, 726, 917`, `src/components/LocationPickerSheet.tsx:104, 152`  
**Severity:** 🟢 P3 (Design System Hygiene)

**Root cause:**
- Direct inline styles containing `#fff`, `rgba(255, 255, 255, 0.16)`, and hardcoded pixel shadows bypass CSS custom properties (`var(--surface)`, `var(--ink-white)`), creating visual inconsistencies when dark mode or alternate ambient themes are active.

**Recommended Fix:**
- Replace raw `#fff` with `var(--surface)` or semantic ambient text tokens (`var(--text-on-accent)`, `var(--white)`).

---

## Verification & Validation Plan

### Automated Regression Tests
1. **Guest Mode Location Selection:** Write a Vitest unit test verifying that `LocationPickerSheet` updates in-memory guest state without triggering `userService.setLocation` when `isGuest` is true.
2. **Cache Key Uniqueness:** Verify that `useQuery` generates distinct cache keys for different coordinates and does not share keys across guest sessions in different locations.
3. **Realtime Guard:** Assert that `useQueryWithRealtime` does not subscribe to user-scoped tables when the user is unauthenticated or has an empty `user.id`.
