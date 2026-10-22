# Interactive Map & Pin Radar — Bug & Gap Log

**Purpose:** Documenting every defect, operational hazard, guest mode failure, and architectural flaw in **Flow 1.3: Interactive Map & Pin Radar** (`src/screens/MapView/index.tsx`, `src/screens/MapView/MapControllers.tsx`, `src/screens/MapView/MapMarkers.tsx`, `src/screens/MapView/MapCarousel.tsx`, `src/screens/MapView/MapFilterStrip.tsx`, `src/screens/MapView/MapSheet.tsx`, and `src/screens/MapView/useLocationPinDrop.ts`).

---

## Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **M1** | Recenter Button Permanently Overwrites User Profile in Database & Crashes for Guests | 🔴 P0 (Destructive Profile Mutation & Guest Crash) | In `MapControllers.tsx:75-76`, tapping the map's Recenter button unconditionally calls `userService.setLocation()`. For guest visitors, this throws a 401 unauthenticated error and shows `"Failed to update GPS location"`. For authenticated users, merely recentering the camera to current device GPS permanently overwrites the user's permanent home address in the database, corrupting their Home feed and appointment defaults whenever they open the map away from home. |
| **M2** | Location Pin Drop Confirm Throws 401 Unauthenticated Error for Guests | 🔴 P0 (Guest Flow Blocker) | In `useLocationPinDrop.ts:69-70`, `confirmPickMode()` unconditionally invokes `userService.setLocation()`. When an unauthenticated guest drops a pin or long-presses on the map, the confirmation fails with 401 and displays an error toast (`"Couldn't set location — try again"`), preventing guests from ever selecting or exploring custom coordinates. |
| **M3** | Hard Capped at 20 Pins per Area With No Pagination or Clustering | 🟠 P1 (Discovery Blindspot) | `MapView/index.tsx:437-450` queries `discoveryService.businesses` and `discoveryService.providers` without cursor pagination (`limit = 20`). In commercial districts with 50+ shops or providers, only the first 20 pins are rendered; the remaining 60%+ of businesses in the searched circle are permanently omitted from both the map and the results tray. Furthermore, pins do not cluster when zoomed out, causing dense visual overlap. |
| **M4** | Permanent Blank Canvas on OpenFreeMap Network Failure When Mapbox Token Is Unset | 🟠 P1 (Basemap Reliability) | In `MapView/index.tsx:271-285, 834-837`, if OpenFreeMap vector tiles fail to load or are blocked by client firewalls, fallback to Mapbox is skipped if `config.mapboxToken` is empty. The loading veil unmounts after 2.5s (`MAP_VEIL_MAX_MS`), leaving a completely blank white/grey canvas with no raster fallback (e.g. OpenStreetMap tiles) and no error notification or list view switch. |
| **M5** | Disconnect Between Camera Viewport and Active Results in Bottom Sheet | 🟡 P2 (Spatial Context Desync) | When panning the map, `viewport.hasMoved` turns true and shows "Search this area", but results in the bottom sheet (`MapSheet.tsx` at `half` or `full` detent) continue showing pins from the previous search area. Users expanding the sheet cannot tell whether the listed places are in the currently visible map view or miles away. |
| **M6** | Pointer Drag Collisions Between MapSheet and Browser Overscroll | 🟡 P2 (Gesture Conflict) | `MapSheet.tsx:120` applies `translateY` on pointer drag without setting `overscroll-behavior: contain` on the sheet container. Dragging down on mobile browsers can trigger browser-level pull-to-refresh or conflict with system navigation bars. |
| **M7** | Hardcoded `#fff` Color Literals in Pin Popups | 🟢 P3 (Design System) | `MapMarkers.tsx:246, 270, 290, 312` use inline `color: "#fff"` on popup action buttons instead of design token `var(--text-on-accent)` or `var(--surface)`. |

---

## Detailed Gap Analyses

---

### #M1 — Recenter Button Permanently Overwrites User Profile in Database & Crashes for Guests

**Area:** `src/screens/MapView/MapControllers.tsx:69-92`  
**Severity:** 🔴 P0 (Destructive Profile Mutation & Guest Crash)

**Root cause:**
1. In `MapControllers.tsx`:
   ```ts
   onClick={() => {
     nativeGeolocation.getCurrentPosition(
       async (pos) => {
         const { latitude, longitude } = pos.coords;
         try {
           const areaName = await reverseGeocode(latitude, longitude);
           await userService.setLocation(latitude, longitude, areaName || "Current Location");
           await refreshUser();
           showToast(tf("map_location_set_gps", { area: areaName || "Current Location" }));
           recenterMap(latitude, longitude);
           onRecentered?.(latitude, longitude);
         } catch (err) {
           showToast(t("map_gps_update_failed"));
           recenterMap(latitude, longitude);
           onRecentered?.(latitude, longitude);
         }
       }, ...
     );
   }}
   ```
2. In mapping applications (Google Maps, Apple Maps), tapping a "Recenter / GPS" button simply moves the map camera to the device's current location.
3. In STRYT's `RecenterButton`, tapping this button executes a **permanent profile write** (`userService.setLocation()`) to the `users` table in Supabase.
4. **Impact on Guests:** For guest users, `userService.setLocation()` throws a 401 unauthenticated error. The code falls into `catch (err)` and triggers the toast: `"Failed to update GPS location"`.
5. **Impact on Authenticated Users:** If a user living in Pune travels to Mumbai for a weekend and opens the map to look around, tapping Recenter permanently rewrites their registered home profile to Mumbai. When they return home, all Home feed queries and appointment defaults are corrupted and point to Mumbai.

**Recommended Fix:**
- Remove `userService.setLocation()` and `refreshUser()` from `RecenterButton`.
- Recenter should solely pan the camera (`recenterMap(latitude, longitude)`) and call `onRecentered?.(latitude, longitude)` so the viewport updates its live search without mutating the user's permanent profile.

---

### #M2 — Location Pin Drop Confirm Throws 401 Unauthenticated Error for Guests

**Area:** `src/screens/MapView/useLocationPinDrop.ts:65-83`, `src/screens/MapView/index.tsx:163-165`  
**Severity:** 🔴 P0 (Guest Flow Blocker)

**Root cause:**
1. In `useLocationPinDrop.ts`:
   ```ts
   const confirmPickMode = useCallback(async () => {
     if (!pickCenter) return;
     setConfirming(true);
     try {
       await userService.setLocation(pickCenter.lat, pickCenter.lng, address || "Custom location");
       await refreshUser();
       showToast(`Location set — ${address || "Custom location"}`);
       onLocationSet?.(pickCenter.lat, pickCenter.lng);
       setPickMode(false);
       ...
     } catch {
       showToast("Couldn't set location — try again");
     } finally {
       setConfirming(false);
     }
   }, ...);
   ```
2. When a guest visitor taps the `MapPinPlus` FAB or long-presses on the map, the crosshair overlay appears.
3. Upon tapping "Confirm Location", `confirmPickMode()` invokes `userService.setLocation()`.
4. Because guests are unauthenticated, Supabase rejects the update with 401.
5. The UI shows `"Couldn't set location — try again"`, and `setPickMode(false)` is never reached, leaving the user stuck in pick mode.

**Recommended Fix:**
- Pass `isGuest` to `useLocationPinDrop`.
- If `isGuest`, bypass `userService.setLocation` and `refreshUser()`, invoke `onLocationSet?.(pickCenter.lat, pickCenter.lng)`, and dismiss pick mode cleanly.

---

### #M3 — Hard Capped at 20 Pins per Area With No Pagination or Clustering

**Area:** `src/screens/MapView/index.tsx:437-450`, `src/services/marketplace/discoveryService.ts:64-90`  
**Severity:** 🟠 P1 (Discovery Blindspot)

**Root cause:**
1. In `MapView/index.tsx:437-450`:
   ```ts
   const { data: bizPage, loading: bizLoading } = useQuery(
     () => isWorld
       ? discoveryService.businesses({ sort: "new" })
       : discoveryService.businesses({ lat: centerLat, lng: centerLng, radius: searchRadiusKm }),
     [centerLat, centerLng, searchRadiusKm],
     `map:biz:${geoCacheKey}`
   );
   ```
2. `discoveryService.businesses` calls `cursorToRange(undefined)` which defaults to `limit: 20`.
3. In `businesses_nearby` SQL function, `in_limit` is set to 20.
4. `MapView` has no cursor pagination state and no mechanism to request the next 20 pins.
5. In any neighborhood with more than 20 shops (e.g. high-street markets, malls, urban centers), only the 20 nearest shops appear on the map. The rest are invisible.
6. Furthermore, pins are rendered as individual HTML DOM elements (`<Marker>`) without MapLibre clustering. When zoomed out, 20 overlapping markers obscure each other completely.

**Recommended Fix:**
- Increase `limit` for map discovery queries (e.g. `limit: 60` or `100`), or integrate MapLibre GeoJSON clustering (`cluster: true`, `clusterMaxZoom: 14`, `clusterRadius: 50`) for smooth zoom transitions.

---

### #M4 — Permanent Blank Canvas on OpenFreeMap Network Failure When Mapbox Token Is Unset

**Area:** `src/screens/MapView/index.tsx:270-292, 834-837`, `src/config.ts:7`  
**Severity:** 🟠 P1 (Basemap Reliability)

**Root cause:**
1. The default map style is OpenFreeMap:
   `const FREE_MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";`
2. If the user's connection blocks `tiles.openfreemap.org`, or if the server experiences downtime:
   - `fallbackTimerRef` fires after 8 seconds.
   - If `config.mapboxToken` is blank (common in development, staging, or self-hosted setups), it does not switch styles.
   - The loading veil lifts after 2.5s (`MAP_VEIL_MAX_MS`), leaving a blank, unresponsive grey container.
3. There is no fallback to standard OSM raster tiles (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`), and no retry prompt is provided.

**Recommended Fix:**
- Add an `onError` handler to the `<Map>` component.
- If vector tile loading fails, fall back to a reliable raster OSM tile source, and display an inline banner notifying the user.

---

### #M5 — Disconnect Between Camera Viewport and Active Results in Bottom Sheet

**Area:** `src/screens/MapView/index.tsx:639-644`, `src/screens/MapView/MapSheet.tsx:46-138`  
**Severity:** 🟡 P2 (Spatial Context Desync)

**Root cause:**
1. A user searches in Indiranagar. Results appear on the map and in the carousel.
2. The user drags the map 10 km away to Koramangala.
3. The floating pill appears: `"Search this area"`.
4. If the user drags the bottom sheet upward to `half` or `full` detent to browse the list, the list continues displaying Indiranagar shops.
5. There is no indicator in the sheet header stating: `"Showing results for previous area — Tap 'Search this area' to update"`.

**Recommended Fix:**
- In `MapSheet.tsx`, if `viewport.hasMoved` is true, render a pinned top notice inside the sheet: `"Results from previous area [Update to current map view]"`.

---

### #M6 — Pointer Drag Collisions Between MapSheet and Browser Overscroll

**Area:** `src/screens/MapView/MapSheet.tsx:112-138`  
**Severity:** 🟡 P2 (Gesture Conflict)

**Root cause:**
- In `MapSheet.tsx`, dragging the grip handle down triggers CSS translation. On Android Chrome and WebViews, a downward drag near the top of the viewport can trigger the browser's native pull-to-refresh, conflicting with the sheet's detent transitions.

**Recommended Fix:**
- Add `touch-action: none; overscroll-behavior: contain;` to `.map-sheet__grip`.

---

### #M7 — Hardcoded `#fff` Color Literals in Pin Popups

**Area:** `src/screens/MapView/MapMarkers.tsx:246, 270, 290, 312`  
**Severity:** 🟢 P3 (Design System)

**Root cause:**
- Buttons in popups use inline `color: "#fff"`, violating the zero hardcoded hex constraint.

**Recommended Fix:**
- Replace `color: "#fff"` with `color: "var(--surface)"` or `var(--text-on-accent)`.

---

## Verification & Validation Plan

### Automated Regression Tests
1. **Recenter Camera Isolation:** Verify that `RecenterButton` does not call `userService.setLocation` and functions without errors for guest users.
2. **Guest Pin Drop:** Verify that dropping a location pin as a guest updates the viewport search without triggering 401 unauthenticated errors.
3. **Map Limits & Queries:** Test that MapView discovery requests an adequate pin limit and handles empty or failed basemap responses gracefully.
