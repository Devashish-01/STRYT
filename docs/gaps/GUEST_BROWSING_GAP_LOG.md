# Guest Browsing & Conversion Wall — Bug & Gap Log

**Purpose:** Documenting every defect, session desync, geolocation failure, authentication trap, and conversion loss in **Flow 0.4: Guest Browsing & Conversion Wall** (`GuestOrAuthLayout`, `src/hooks/useRequireAuth.ts`, `src/store.tsx`, `src/store/useGuestLocation.ts`, `src/lib/guestMode.ts`, `src/lib/returnTo.ts`, `src/components/BottomNav.tsx`, `src/components/GuestSignInPrompt.tsx`, `src/components/GuestRadiusNotice.tsx`, `src/screens/business/BusinessDetail.tsx`, `src/screens/auth/UserOnboard.tsx`, and `src/App.tsx`).

---

## Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **G1** | Post-Onboarding Return-To Desync Strands Converted Guests on Home | 🔴 P0 (Conversion Funnel Break) | When a guest taps an action on a business or service page, `useRequireAuth()` stores `returnTo`. But during Google auth, `PublicOnlyLayout` immediately consumes `returnTo`. If the user is new, they are routed to `/auth/terms` and `/auth/onboard`. At the end of `UserOnboard.tsx:127-129`, `finish()` hardcodes `nav("/home")`, permanently losing their intended destination. |
| **G2** | Guest Geolocation Denial/Timeout Silently Traps Visitors in Pune | 🔴 P0 (Discovery Distortion) | In `useGuestLocation.ts:40-70`, when GPS is denied or times out, `guestLocation` remains `null`. `store.tsx:286-294` falls back to `seedUser` (`lat: 0, lng: 0`). In `discoveryService`, coordinates of `0` default to `DEFAULT_LAT = 18.536, DEFAULT_LNG = 73.893` (Pune, Maharashtra). Visitors in Delhi, Mumbai, or Bengaluru who deny GPS are silently served Pune businesses. |
| **G3** | LocationPickerSheet 401 Error Blocks Guests from Setting Location | 🔴 P0 (Guest Flow Blocker) | In `LocationPickerSheet.tsx:55, 79`, selecting an area or using GPS unconditionally invokes `userService.setLocation()`. For guests (`!user.id`), this throws a 401 unauthenticated error (`"Couldn't set location"`). Guests have zero ability to set or change their neighborhood when GPS fails. |
| **G4** | BottomNav Chats Tab Bounces Guests Abruptly to Login Without Warning | 🟠 P1 (Abrupt UX Trap) | In `BottomNav.tsx:66-73`, the mobile "Chats" tab is rendered for guests as an unguarded `<NavLink to="/chats">`. Clicking it triggers a route change to `/chats`, which `ProtectedLayout` immediately redirects to `/auth/phone` with no explanatory toast, modal, or context. |
| **G5** | Live Walk-In Queue Hides Action Button Instead of Conversion Hook | 🟠 P1 (Lost Conversion Hook) | In `BusinessDetail.tsx:536-540`, guests see the live queue wait time, but line 536 explicitly renders `isGuest ? null : ...`. Rather than providing a clear "Sign in to join queue" button or `GuestSignInPrompt`, the button is completely absent. |
| **G6** | Catalog Booking and Ordering Buttons Completely Stripped for Guests | 🟠 P1 (Dead-End Catalog Discovery) | In `BusinessDetail.tsx:693, 714`, `!isGuest` gates both the booking CTA (`Book appointment`) and the cart stepper (`ADD`). For guests, catalog items appear as static, un-orderable text. There is no conversion hook informing guests that items can be booked or ordered upon signing in. |
| **G7** | Missing In-Context Auth Modal Discards Ephemeral Browsing State | 🟡 P2 (Browsing State Loss) | `useRequireAuth` always navigates away via full page transition to `nav("/auth/phone")`. If a guest was viewing a photo gallery, had filters open, or was mid-scroll, full page navigation destroys their transient UI state instead of opening an in-context sign-in modal. |
| **G8** | Hardcoded `#fff` Tokens in Guest Surfaces | 🟢 P3 (Design System) | Hardcoded `#ffffff` and `rgba(0,0,0,0.5)` in `BottomNav.tsx:84, 96`, `AppShellSkeleton:247`, and `BusinessDetail.tsx:717, 724` violate dark mode and semantic token rules. |

---

## Detailed Gap Analyses

---

### #G1 — Post-Onboarding Return-To Desync Strands Converted Guests on Home

**Area:** `src/screens/auth/UserOnboard.tsx:127-129`, `src/App.tsx:353-376, 402`, `src/lib/returnTo.ts`  
**Severity:** 🔴 P0 (Conversion Funnel Break)

**Root cause:**
1. A guest browses a specific storefront (`/business/biz_dental_clinic`) or service provider (`/provider/pro_carpenter`) and clicks an action (e.g. "Book appointment").
2. `useRequireAuth()` intercepts the click:
   ```ts
   // useRequireAuth.ts:31-33
   returnTo.remember(location.pathname + location.search);
   if (message) showToast(message);
   nav("/auth/phone");
   ```
   `sessionStorage.setItem("stryt_return_to", "/business/biz_dental_clinic")` is recorded.
3. The guest signs in via Google OAuth.
4. When auth completes, the app mounts `PublicOnlyLayout`:
   ```ts
   // App.tsx:402-403
   const dest = returnTo.consume();
   return <Navigate to={dest === "/home" ? contextHomePath(activeContext) : dest} replace />;
   ```
5. `returnTo.consume()` reads `"/business/biz_dental_clinic"` AND deletes it from `sessionStorage`.
6. Because the user is a brand-new sign-up, `ProtectedLayout` intercepts navigation:
   - Line 357: `termsOutstanding` redirects to `/auth/terms`.
   - Line 374: `needsOnboard` redirects to `/auth/onboard`.
7. The intended destination is now gone from `sessionStorage`.
8. When the user finishes the 3 onboarding beats (Name, Location, Interests) in `UserOnboard.tsx`:
   ```ts
   // UserOnboard.tsx:127-129
   if (reduced) { nav("/home", { replace: true }); return; }
   setRevealing(true);
   revealTimer.current = setTimeout(() => nav("/home", { replace: true }), 1100);
   ```
9. `nav("/home")` is hardcoded!
10. The user who specifically created an account to book an appointment at `biz_dental_clinic` is dumped on the generic Home feed. They must manually re-search and re-locate the business they were just viewing.

**Reproduction Steps:**
1. Open an incognito tab (guest session).
2. Browse to any business or provider page (e.g. `/business/biz_123`).
3. Tap "Sign in to book or message".
4. Complete Google authentication as a new user.
5. Accept Terms and complete the User Onboard steps.
6. Observe that you land on `/home` instead of `/business/biz_123`.

**Fix Recommendation:**
- Do not consume `returnTo` in `PublicOnlyLayout` if the user still requires terms acceptance or onboarding.
- In `UserOnboard.tsx:finish()`, inspect `returnTo.consume()`. If a valid return path exists (and is not `"/home"`), navigate to `dest` rather than hardcoding `"/home"`.

---

### #G2 — Guest Geolocation Denial/Timeout Silently Traps Visitors in Pune

**Area:** `src/store/useGuestLocation.ts:40-70`, `src/store.tsx:286-294`, `src/services/marketplace/discoveryService.ts:67-68, 113-114`  
**Severity:** 🔴 P0 (Discovery Distortion)

**Root cause:**
1. When a guest first lands on STRYT, `useGuestLocation` automatically requests browser geolocation:
   ```ts
   // useGuestLocation.ts:53-59
   nativeGeolocation.getCurrentPosition(
     (p) => { ... },
     () => {
       // Denied or unavailable. Guests still get to browse...
       setStatus("denied");
     },
     { timeout: 8000 }
   );
   ```
2. If the user clicks "Block" on the browser location permission dialog, or if GPS resolution times out after 8 seconds (common indoors or on desktop), `guestLocation` remains `null`.
3. In `store.tsx`:
   ```ts
   const viewUser = useMemo<CurrentUser>(() => {
     if (!isGuest || !guestLocation) return user;
     return {
       ...user,
       lat: guestLocation.lat,
       lng: guestLocation.lng,
       notificationRadiusKm: GUEST_RADIUS_KM,
     };
   }, [isGuest, guestLocation, user]);
   ```
4. Because `guestLocation` is `null`, `viewUser` is `user` (`seedUser`), where `lat = 0, lng = 0`.
5. When `discoveryService.businesses` or `providers` is called:
   ```ts
   // discoveryService.ts:67-68
   const userLat = p.lat ?? DEFAULT_LAT; // DEFAULT_LAT = 18.536 (Pune)
   const userLng = p.lng ?? DEFAULT_LNG; // DEFAULT_LNG = 73.893 (Pune)
   ```
6. The user is silently relocated to Pune, Maharashtra.
7. A guest visitor in Delhi, Mumbai, or Kolkata who denies GPS is shown shops in Pune without any warning or indication that their location could not be determined.

**Fix Recommendation:**
- When `guestLocationStatus === "denied"`, render a persistent, polite banner on Home and Map: `"Location access blocked — choose your neighborhood to see spots near you"` with an action to manually select an area.
- Do not silently query Pune PostGIS coordinates when location is unknown.

---

### #G3 — LocationPickerSheet 401 Error Blocks Guests from Setting Location

**Area:** `src/components/LocationPickerSheet.tsx:48-64, 78-85`, `src/services/core/userService.ts:260-264`  
**Severity:** 🔴 P0 (Guest Flow Blocker)

**Root cause:**
1. A guest whose GPS failed or was denied notices Pune listings on Home.
2. They tap the location pill in the header to select their neighborhood (e.g. "Koramangala, Bangalore" or "Connaught Place, Delhi").
3. `LocationPickerSheet` renders search results and recent areas.
4. When the guest selects a neighborhood, line 55 executes:
   ```ts
   // LocationPickerSheet.tsx:55
   await userService.setLocation(p.lat, p.lng, p.area);
   ```
5. `userService.setLocation` enforces an authenticated session:
   ```ts
   // userService.ts:260-263
   async setLocation(lat: number, lng: number, area?: string) {
     const uid = await currentUserId();
     if (!uid) throw toApiError({ code: "UNAUTHENTICATED", message: "Not signed in" }, 401);
     ...
   ```
6. For guests, `uid` is null. The call throws a 401 error.
7. `LocationPickerSheet` catches the error and triggers a toast: `"Couldn't set location"`.
8. The selection is rejected. Guests have no way to manually select an area to browse.

**Fix Recommendation:**
- In `LocationPickerSheet`, check `if (isGuest)`:
  - Save the selected coordinates to `sessionStorage.setItem("guest_location", JSON.stringify({ lat, lng, area }))`.
  - Update the store's `guestLocation` state directly.
  - Bypass `userService.setLocation()`.

---

### #G4 — BottomNav Chats Tab Bounces Guests Abruptly to Login Without Warning

**Area:** `src/components/BottomNav.tsx:66-73`, `src/App.tsx:745`  
**Severity:** 🟠 P1 (Abrupt UX Trap)

**Root cause:**
1. In `BottomNav.tsx`, the five main tabs are rendered:
   - Home (`/home`) — browsable for guests.
   - Map (`/map`) — browsable for guests.
   - Create (+) — protected via `requireAuth(...)`.
   - Chats (`/chats`) — `<NavLink to="/chats">` (unintercepted).
   - Profile / Sign In — renders `guestSignInTab` (`/auth/phone`).
2. Tapping the "Chats" tab navigates directly to `/chats`.
3. In `App.tsx:745`, `/chats` is registered inside `<ProtectedLayout />`.
4. `ProtectedLayout` immediately runs:
   ```ts
   if (!isAuthed && !isAuthCallback) {
     returnTo.remember(location.pathname + location.search);
     return <Navigate to="/auth/phone" replace />;
   }
   ```
5. The guest is violently bounced to `/auth/phone` with zero contextual message or explanation.
6. In `DesktopSidebar.tsx:107-115`, the desktop nav cleanly excludes the `Chats` link for guests. Mobile `BottomNav` was neglected.

**Fix Recommendation:**
- In `BottomNav.tsx`, attach `requireAuth` to the Chats tab:
  ```tsx
  <button
    className="nav-item"
    onClick={requireAuth(() => nav("/chats"), "Sign in to view your messages")}
  >
    <MessageSquare size={22} className="nav-item__icon" />
    <span>{t("chats")}</span>
  </button>
  ```

---

### #G5 — Live Walk-In Queue Hides Action Button Instead of Conversion Hook

**Area:** `src/screens/business/BusinessDetail.tsx:536-540`  
**Severity:** 🟠 P1 (Lost Conversion Hook)

**Root cause:**
1. In `BusinessDetail.tsx`, the Live Queue card displays the real-time queue length and estimated wait time.
2. For an authenticated customer, a `"Join Queue"` button is rendered.
3. For guests, line 536 explicitly evaluates:
   ```tsx
   : isGuest ? (
     // Guests see the live wait (that's the hook) but can't take a
     // spot in a real shop's line without an account behind it.
     null
   ) : !joiningQueue ? (
     <button className="btn btn-primary btn-sm" ...>{t("join_queue")}</button>
   ) : null
   ```
4. The button evaluates to `null`.
5. The guest sees the wait time, but there is no call-to-action explaining that signing in is required to join the queue.
6. The user assumes the queue is closed or restricted to staff.

**Fix Recommendation:**
- Replace `null` with a conversion button:
  ```tsx
  : isGuest ? (
    <button
      className="btn btn-primary btn-sm"
      onClick={requireAuth(() => {}, "Sign in to join the queue")}
    >
      Join Queue
    </button>
  )
  ```

---

### #G6 — Catalog Booking and Ordering Buttons Completely Stripped for Guests

**Area:** `src/screens/business/BusinessDetail.tsx:693, 714`  
**Severity:** 🟠 P1 (Dead-End Catalog Discovery)

**Root cause:**
1. In `BusinessDetail.tsx`, items in the business catalog display name, description, photo, and price.
2. For booking services:
   ```tsx
   // Line 693
   {!isOwner && !isGuest && bookingsOn && bizTheme.catalogItemCta.show && item.stockStatus !== "OUT_OF_STOCK" && (
     <button className="btn btn-outline btn-sm" onClick={() => ...}>{bizTheme.catalogItemCta.label}</button>
   )}
   ```
3. For ordering products:
   ```tsx
   // Line 714
   {isGuest || isOwner || !bizTheme.showCartStepper ? null : qty === 0 ? (
     <button className="btn btn-sm" onClick={() => add(item.id, 1)}>ADD</button>
   ) : ...}
   ```
4. For guests, both the appointment booking CTA and the product `ADD` button are hidden (`!isGuest` / `isGuest ? null`).
5. A visitor browsing a clinic or store sees a dead, inert catalog with no CTAs.
6. There is no indication that the shop accepts online appointments or orders.

**Fix Recommendation:**
- Keep the `Book` and `ADD` buttons visible for guests, wrapped with `useRequireAuth`:
  ```tsx
  onClick={requireAuth(() => handleBook(item), "Sign in to book an appointment")}
  ```

---

### #G7 — Missing In-Context Auth Modal Discards Ephemeral Browsing State

**Area:** `src/hooks/useRequireAuth.ts:28-35`  
**Severity:** 🟡 P2 (Browsing State Loss)

**Root cause:**
1. `useRequireAuth` always navigates away via `nav("/auth/phone")`.
2. If a guest was viewing a photo gallery (`PhotoViewer`), had active filter chips toggled on `/explore`, or was reading down an expansive list, full-page redirection destroys all transient component state.
3. Upon return, modal state, scroll position, and temporary query filters are reset.

**Fix Recommendation:**
- Implement an optional in-context modal sheet (`AuthGateModal`) that can prompt for phone/Google authentication in an overlay without forcing a full page transition when transient state is active.

---

### #G8 — Hardcoded `#fff` Tokens in Guest Surfaces

**Area:** `src/components/BottomNav.tsx:84, 96`, `src/App.tsx:247`, `src/screens/business/BusinessDetail.tsx:717, 724`  
**Severity:** 🟢 P3 (Design System)

**Root cause:**
1. `BottomNav.tsx:96`: `background: "#ffffff"`
2. `App.tsx:247` (`AppShellSkeleton`): `background: "#fff"`
3. `BusinessDetail.tsx:717, 724`: `background: "#fff"`, `color: "#fff"`
4. Raw color strings violate theme token architecture and cause visual glare or contrast bugs in dark mode.

**Fix Recommendation:**
- Replace `#fff` literals with `var(--bg-surface)` and `var(--ink-0)`.
