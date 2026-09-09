# STRYT — Flow 10.2: Live Location Sharing & Auto-Expiry Gap Log

**Audit Date:** September 9, 2026  
**Flow Identifier:** Flow 10.2 — Domain 10 (Safety, Emergency & Location Sharing)  
**Primary Components:** [`useLiveShare.tsx`](file:///d:/zetax/name/STRYT/src/features/live-share/useLiveShare.tsx), [`LiveLocationCard.tsx`](file:///d:/zetax/name/STRYT/src/features/live-share/LiveLocationCard.tsx), [`LiveShareBanner.tsx`](file:///d:/zetax/name/STRYT/src/features/live-share/LiveShareBanner.tsx), [`MyPeopleToggle.tsx`](file:///d:/zetax/name/STRYT/src/features/live-share/MyPeopleToggle.tsx), [`SafetyHub.tsx`](file:///d:/zetax/name/STRYT/src/screens/safety/SafetyHub.tsx), [`LocationSettings.tsx`](file:///d:/zetax/name/STRYT/src/screens/settings/LocationSettings.tsx), [`BackgroundLocationDisclosure.tsx`](file:///d:/zetax/name/STRYT/src/features/live-share/BackgroundLocationDisclosure.tsx), [`LiveShareExplainer.tsx`](file:///d:/zetax/name/STRYT/src/features/live-share/LiveShareExplainer.tsx)  
**Backend Services & Tables:** `emergencyService.ts`, `locationService.ts`, `backgroundLocation.ts`, `public.live_shares`, `public.live_share_recipients`, `public.location_share_grants`, DB RPCs `start_live_share`, `update_live_share`, `stop_live_share`, `get_live_share`, `revoke_live_share_recipient`, `my_live_share_recipients`, `request_location_share`, `respond_location_share`, `renew_location_share`, `revoke_location_share`, `get_shared_location`  
**Launch Readiness Status:** 🔴 **Critical Audit Blockers (Indefinite Zombie Live Sessions, Stale Location Safety Hazard, Null Island Broadcast, Expired Grant Lockout Trap)**

---

## 1. Executive Summary

Flow 10.2 represents the real-time spatial safety architecture of STRYT, encompassing two complementary systems:
1. **Live Emergency Location Streaming ("My People"):** A continuous GPS streaming engine (`useLiveShare.tsx`, `emergencyService.ts`, `public.live_shares`) that broadcasts high-accuracy coordinates to designated emergency contacts as moving Leaflet map cards (`LiveLocationCard.tsx`) inside 1:1 chat threads.
2. **Consent-Gated Exact Coordinate Sharing:** A 24-hour auto-expiring permission system (`LocationSettings.tsx`, `locationService.ts`, `public.location_share_grants`) allowing neighbors, customers, and providers to request and grant exact profile coordinates.

While the architecture utilizes PostgreSQL `SECURITY DEFINER` RPCs and native Capgo background geolocation plugins, exhaustive code-level tracing revealed severe lifecycle failures, privacy leaks, and safety hazards:

1. **Indefinite Active Sessions & Missing Auto-Expiry on `live_shares` (P0):** Unlike industry-standard safety tools (WhatsApp, Telegram, Apple Find My) which enforce strict auto-expiry durations (e.g. 15m, 1h, 8h), `live_shares` has **zero auto-expiry column or logic**. If a phone battery dies or the app is killed, the session stays `ACTIVE` permanently. Upon reopening the app days later, `emergencyService.myActiveShareId()` detects the old session and silently begins streaming the user's fresh coordinates without prompt.
2. **Stale Location & False "Live" Safety Hazard (P0):** In `LiveLocationCard.tsx`, the card displays `Updated ${updatedLabel} · live` with an active pulsing amber dot regardless of how old the coordinates are. If a user's phone died 6 hours or 2 days ago, the contact sees `Updated 02:30 PM · live`, falsely believing the user is safe and actively at that position right now.
3. **Null Island (0,0) Cold-Start Broadcast (P0):** If `firstFix()` fails (timeout >12s, GPS disabled, or indoors), `useLiveShare.tsx` falls back to `emergencyService.startShare(fix?.lat ?? 0, fix?.lng ?? 0)`. The app broadcasts `(0, 0)` in the Atlantic Ocean off West Africa to all contacts instead of aborting with a location acquisition warning.
4. **Permanent Re-Request Lockout on Expired Grants (P0):** In `location_share_grants`, when a 24h approval expires (`expires_at < now()`), its table status remains `'APPROVED'`. When the requester calls `request_location_share`, the SQL `ON CONFLICT` clause evaluates `case when status = 'APPROVED' then 'APPROVED' else 'PENDING' end`. Because status is still `APPROVED`, the request is never set to `PENDING`, and the owner never receives it. The requester is permanently locked out from ever re-requesting access.
5. **Ghost Background GPS on Full Recipient Revocation (P1):** If an owner revokes every recipient individually in `SafetyHub.tsx`, `live_share_recipients` becomes empty, but `live_shares` remains `ACTIVE`. The device continues running background GPS tracking and uploading coordinates every 12 seconds to an empty recipient list.

---

## 2. Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **LOC-1** | Indefinite Active Sessions & Missing Auto-Expiry on `live_shares` | 🔴 P0 (Critical Privacy & Battery Leak) | Sessions never expire. A dead phone or force-killed app leaves sessions permanently ACTIVE. Reopening the app days later resumes background tracking without user intent. |
| **LOC-2** | False "Live" Status & Stale Coordinates on `LiveLocationCard` | 🔴 P0 (Life-Critical Safety Hazard) | If GPS updates stop, the chat card displays "Updated 02:30 PM · live" with a pulsing animation indefinitely, misleading emergency contacts during actual distress. |
| **LOC-3** | Null Island (0,0) Broadcast on Geolocation Lock Failure | 🔴 P0 (Data Integrity & Confusion) | When `firstFix()` times out, the app broadcasts (0, 0) in the Atlantic Ocean instead of aborting and warning the user that GPS signal was unavailable. |
| **LOC-4** | Expired Location Grants Permanently Lock Out Re-Requests | 🔴 P0 (Dead-End Permission State) | In `request_location_share`, expired `APPROVED` rows never reset to `PENDING` due to conflict update logic. Re-requesting location is permanently broken. |
| **LOC-5** | Ghost Background GPS Broadcast on Full Recipient Revocation | 🟠 P1 (Battery Drain & Zombie Process) | Revoking all recipients one-by-one in `SafetyHub.tsx` leaves `live_shares` active, broadcasting GPS fixes every 12 seconds to nobody. |
| **LOC-6** | Expired Grants Linger in "Currently Sharing With" Active Section | 🟠 P1 (Semantic Inversion / UI Desync) | `locationService.sharedByMe()` queries `status = 'APPROVED'` without checking `expires_at > now()`. Expired rows clutter the active list with red "Expired" tags. |
| **LOC-7** | Unfiltered Postgres Realtime Subscriptions on Location Grants | 🟠 P1 (Performance & Socket Avalanche) | `LocationSettings.tsx` and `Home.tsx` subscribe to `location_share_grants` without row filters, waking all connected clients on every platform grant update. |
| **LOC-8** | `LiveShareBanner.tsx` Hardcodes `top: 8` and Clips Safe Areas | 🟡 P2 (UI Glitch / Mobile Polish) | The banner ignores `env(safe-area-inset-top)`, rendering behind camera punch-holes/notches on mobile and overlapping `AppBar` back buttons. |
| **LOC-9** | Leaflet Memory Leak & StrictMode Re-Initialization Crash | 🟡 P2 (Stability & DOM Hygiene) | `LiveLocationCard.tsx` omits cleanup in the map initialization `useEffect`. Re-rendering or fast navigation risks `Map container is already initialized` crashes. |

---

## 3. Detailed Findings & Root Cause Analysis

---

### 🔴 LOC-1 (P0): Indefinite Active Sessions & Missing Auto-Expiry on `live_shares`

- **Location:** [`supabase/migrations/20260818_live_location_sharing.sql:31-45`](file:///d:/zetax/name/STRYT/supabase/migrations/20260818_live_location_sharing.sql#L31-L45), [`src/features/live-share/useLiveShare.tsx:75-90`](file:///d:/zetax/name/STRYT/src/features/live-share/useLiveShare.tsx#L75-L90), [`src/services/engagement/emergencyService.ts:155-167`](file:///d:/zetax/name/STRYT/src/services/engagement/emergencyService.ts#L155-L167)
- **Root Cause:**
  1. The `public.live_shares` table schema contains:
     ```sql
     create table if not exists public.live_shares (
       id              text primary key default ('ls_' || replace(gen_random_uuid()::text, '-', '')),
       sharer_user_id  text not null references public.users(id) on delete cascade,
       status          text not null default 'ACTIVE',   -- ACTIVE | ENDED
       lat             double precision,
       lng             double precision,
       accuracy        double precision,
       heading         double precision,
       started_at      timestamptz default now(),
       updated_at      timestamptz default now(),
       ended_at        timestamptz
     );
     ```
  2. There is **no `expires_at` column**, no maximum session duration (e.g., 1 hour, 8 hours, 24 hours), and no scheduled background job or database trigger that flips stale sessions to `ENDED`.
  3. In `useLiveShare.tsx:75-90`:
     ```typescript
     useEffect(() => {
       if (!isAuthed) {
         setActiveShareId(null);
         endWatch();
         return;
       }
       let alive = true;
       void emergencyService.myActiveShareId().then((id) => {
         if (!alive || !id) return;
         setActiveShareId(id);
         beginWatch();
       });
       return () => { alive = false; };
     }, [isAuthed, beginWatch, endWatch]);
     ```
  4. If a user starts a live share, and their phone battery depletes, device loses network, or the OS kills the process:
     - `public.live_shares` remains `status = 'ACTIVE'` in Supabase indefinitely.
     - When the user opens STRYT days or weeks later, `emergencyService.myActiveShareId()` finds the ancient session.
     - `useLiveShare` sets `activeShareId` and executes `beginWatch()`, activating background GPS and transmitting the user's current location to emergency contacts without the user explicitly initiating it!
- **Proof of Hazard:**
  - Start live share.
  - Kill browser tab or power down phone.
  - Wait 48 hours. Open app.
  - App immediately shows "Sharing live location" banner and starts pushing coordinates to contacts.
- **Recommended Remediation:**
  - Add `expires_at timestamptz not null default (now() + interval '8 hours')` to `public.live_shares`.
  - In `get_live_share`, check `s.status = 'ACTIVE' and s.expires_at > now()`; if expired, return `status = 'ENDED'`.
  - In `myActiveShareId()`, query `.eq("status", "ACTIVE").gt("expires_at", new Date().toISOString())`.
  - Add a pg_cron worker or DB trigger to flip expired rows to `status = 'ENDED'`.

---

### 🔴 LOC-2 (P0): False "Live" Status & Stale Coordinates on `LiveLocationCard`

- **Location:** [`src/features/live-share/LiveLocationCard.tsx:69-95`](file:///d:/zetax/name/STRYT/src/features/live-share/LiveLocationCard.tsx#L69-L95)
- **Root Cause:**
  1. In `LiveLocationCard.tsx`:
     ```typescript
     const name = view?.sharerName ?? "Someone";
     const updatedLabel = view?.updatedAt
       ? new Date(view.updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
       : "";
     ...
     <div className="tiny muted">
       {ended ? "Sharing has stopped" : updatedLabel ? `Updated ${updatedLabel} · live` : "Locating…"}
     </div>
     ...
     {!ended && (
       <span style={{
         width: 8, height: 8, borderRadius: "50%", background: "var(--accent-500)",
         boxShadow: "0 0 0 0 rgba(255,140,60,0.6)", animation: "livePulseRing 1.6s ease-out infinite",
       }} />
     )}
     ```
  2. `toLocaleTimeString()` formats *only* the time of day, omitting the date or elapsed duration.
  3. If a user pushes a fix at 2:30 PM, and their phone is then destroyed, stolen, or loses signal:
     - 6 hours later (8:30 PM), the recipient opens chat.
     - The card displays: `"Updated 02:30 PM · live"`.
     - The pulsing live amber ring animates continuously.
     - Emergency contacts are led to believe the user is actively at that location right now, when the device has been dark for hours.
- **Proof of Hazard:**
  - In an emergency or safety scenario, family members searching for a missing person will treat a stale fix as an active live ping.
- **Recommended Remediation:**
  - Calculate `stalenessMs = Date.now() - new Date(view.updatedAt).getTime()`.
  - If `stalenessMs > 5 * 60 * 1000` (5 minutes), cease the pulsing ring animation and render a warning pill: `"Offline · Last seen 45m ago"` (or date + time if >24h).
  - Provide an explicit "Directions / Open in Maps" button so emergency contacts can immediately navigate to the coordinates via Google Maps or Apple Maps.

---

### 🔴 LOC-3 (P0): Null Island (0,0) Broadcast on Geolocation Lock Failure

- **Location:** [`src/features/live-share/useLiveShare.tsx:23-31`](file:///d:/zetax/name/STRYT/src/features/live-share/useLiveShare.tsx#L23-L31), [`src/features/live-share/useLiveShare.tsx:98-105`](file:///d:/zetax/name/STRYT/src/features/live-share/useLiveShare.tsx#L98-L105)
- **Root Cause:**
  1. In `useLiveShare.tsx`:
     ```typescript
     function firstFix(): Promise<{ lat: number; lng: number } | null> {
       return new Promise((res) =>
         nativeGeolocation.getCurrentPosition(
           (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
           () => res(null),
           { timeout: 12000 },
         ),
       );
     }
     ...
     const fix = await firstFix();
     const id = await emergencyService.startShare(fix?.lat ?? 0, fix?.lng ?? 0);
     ```
  2. If the device cannot acquire a GPS fix within 12 seconds (e.g. indoors, underground transit, weak satellite lock), or if OS permissions were denied:
     - `firstFix()` returns `null`.
     - `fix?.lat ?? 0` evaluates to `0`.
     - `fix?.lng ?? 0` evaluates to `0`.
     - The app broadcasts coordinates `(0, 0)`—the coordinates of **Null Island** in the Gulf of Guinea / Atlantic Ocean.
  3. The database creates the session, fires push notifications to all emergency contacts, and renders map cards pinned to the middle of the ocean off the African coast.
- **Proof of Hazard:**
  - Disable location services or simulate timeout. Tap "Share live location".
  - Emergency contact receives push notification, opens chat, and sees map centered on (0, 0) with a live pin in the ocean.
- **Recommended Remediation:**
  - If `fix == null`, abort the share immediately.
  - Display user-facing toast: `"Could not acquire GPS position. Please check location permissions and try again."`
  - Never allow `start_live_share` to execute with fallback `(0, 0)` coordinates.

---

### 🔴 LOC-4 (P0): Expired Location Grants Permanently Lock Out Re-Requests

- **Location:** [`supabase/migrations/20260719_location_share_grants.sql:58-84`](file:///d:/zetax/name/STRYT/supabase/migrations/20260719_location_share_grants.sql#L58-L84), [`supabase/migrations/20260725_location_grant_expiry.sql:10-35`](file:///d:/zetax/name/STRYT/supabase/migrations/20260725_location_grant_expiry.sql#L10-L35)
- **Root Cause:**
  1. `20260725_location_grant_expiry.sql` introduced 24-hour auto-expiry for approved grants:
     ```sql
     update public.location_share_grants
       set status = case when p_approve then 'APPROVED' else 'DENIED' end,
           expires_at = case when p_approve then now() + interval '24 hours' else null end,
           updated_at = now()
     where owner_user_id = v_uid and requester_user_id = p_requester;
     ```
  2. However, the migration **failed to update `request_location_share`**, which remains as defined in `20260719_location_share_grants.sql`:
     ```sql
     insert into public.location_share_grants (owner_user_id, requester_user_id, status)
     values (p_owner, v_uid, 'PENDING')
     on conflict (owner_user_id, requester_user_id) do update
       set status = case when location_share_grants.status = 'APPROVED' then 'APPROVED' else 'PENDING' end,
           updated_at = now();
     ```
  3. When 24 hours elapse:
     - `expires_at` is in the past, so `get_shared_location` stops returning coordinates.
     - However, `location_share_grants.status` **remains `'APPROVED'`**.
     - The requester navigates to the user's profile and taps "Request location".
     - `request_location_share` fires: the `ON CONFLICT` clause evaluates `case when status = 'APPROVED' then 'APPROVED' else 'PENDING' end`.
     - Because `status` is `'APPROVED'`, it remains `'APPROVED'`. It is **never reset to `'PENDING'`**.
     - The owner's `pendingForMe()` inbox only queries `status = 'PENDING'`, so the owner never sees the request.
     - The requester is permanently locked out from ever obtaining access again.
- **Proof of Hazard:**
  - User A approves User B for 24h location sharing.
  - Grant expires.
  - User B taps "Request location" on User A's profile.
  - Request never appears in User A's `/settings/location` inbox. User B's status never changes.
- **Recommended Remediation:**
  - Update `request_location_share` SQL RPC to reset expired approved grants:
    ```sql
    set status = case
      when location_share_grants.status = 'APPROVED' and location_share_grants.expires_at > now() then 'APPROVED'
      else 'PENDING'
    end,
    expires_at = null,
    updated_at = now();
    ```

---

### 🟠 LOC-5 (P1): Ghost Background GPS Broadcast on Full Recipient Revocation

- **Location:** [`src/screens/safety/SafetyHub.tsx:48-56`](file:///d:/zetax/name/STRYT/src/screens/safety/SafetyHub.tsx#L48-L56), [`supabase/migrations/20260915_revoke_live_share_recipient.sql:10-35`](file:///d:/zetax/name/STRYT/supabase/migrations/20260915_revoke_live_share_recipient.sql#L10-L35)
- **Root Cause:**
  1. `20260915_revoke_live_share_recipient.sql` allows an owner to drop individual recipients from an active live share:
     ```sql
     delete from public.live_share_recipients
       where share_id = v_share and recipient_user_id = p_recipient_user_id;
     ```
  2. However, the RPC does not check whether any recipients remain.
  3. In `SafetyHub.tsx:48-56`:
     ```typescript
     async function onRevokeRecipient(userId: string, name: string) {
       try {
         await emergencyService.revokeShareRecipient(userId);
         showToast(`Stopped sharing with ${name}`);
         refetchRecipients();
       } catch {
         showToast("Couldn't update — try again");
       }
     }
     ```
  4. If an owner revokes every recipient one by one:
     - `live_share_recipients` becomes empty (`count = 0`).
     - Neither the DB RPC nor `SafetyHub` stops the session.
     - `useLiveShare.activeShareId` remains set, `LiveShareBanner` continues displaying "Sharing live location", and the device background watcher continues pushing GPS fixes every 12 seconds to nobody.
- **Recommended Remediation:**
  - In `revoke_live_share_recipient`, check:
    ```sql
    if not exists (select 1 from public.live_share_recipients where share_id = v_share) then
      perform public.stop_live_share();
    end if;
    ```
  - In `SafetyHub.tsx`, if `recipients.length === 1` and the user revokes them, call `stop()` and notify: `"Live location sharing stopped (no active recipients)"`.

---

### 🟠 LOC-6 (P1): Expired Grants Linger in "Currently Sharing With" Active Section

- **Location:** [`src/services/engagement/locationService.ts:85-107`](file:///d:/zetax/name/STRYT/src/services/engagement/locationService.ts#L85-L107), [`src/screens/settings/LocationSettings.tsx:137-173`](file:///d:/zetax/name/STRYT/src/screens/settings/LocationSettings.tsx#L137-L173), [`src/screens/PublicProfile.tsx:671-676`](file:///d:/zetax/name/STRYT/src/screens/PublicProfile.tsx#L671-L676)
- **Root Cause:**
  1. In `locationService.sharedByMe()`:
     ```typescript
     const { data, error } = await sb
       .from("location_share_grants")
       .select("id, owner_user_id, requester_user_id, status, created_at, updated_at, expires_at, requester:users!requester_user_id(name, avatar)")
       .eq("owner_user_id", uid)
       .eq("status", "APPROVED")
       .order("updated_at", { ascending: false });
     ```
  2. The query selects all rows where `status = 'APPROVED'`, regardless of whether `expires_at` is in the past.
  3. In `LocationSettings.tsx`, these rows are rendered under:
     `<Eye size={13} color="var(--green-500)" /> Currently sharing with`.
     Rows that expired weeks ago are shown with a red `· Expired` tag next to a green active eye icon.
  4. In `locationService.myStatusToward(ownerUserId)`:
     ```typescript
     const { data, error } = await sb
       .from("location_share_grants")
       .select("status")
       .eq("owner_user_id", ownerUserId)
       .eq("requester_user_id", uid)
       .maybeSingle();
     return (data?.status as any) ?? "NONE";
     ```
     It checks only `status`. If an approved grant expired, `myStatusToward` still returns `"APPROVED"`. On `PublicProfile.tsx:671`, this renders an active "View exact location" button. When tapped, `get_shared_location` returns `null` because it checks `expires_at > now()`, and the user is greeted with a cryptic toast: `"Location no longer shared"`.
- **Recommended Remediation:**
  - In `locationService.sharedByMe()`, filter by `.gt("expires_at", new Date().toISOString())`.
  - Move expired rows into `shareHistory()`.
  - In `locationService.myStatusToward()`, select `status, expires_at`. If `status === 'APPROVED'` but `expires_at < now()`, return `"EXPIRED"` (or `"NONE"`).

---

### 🟠 LOC-7 (P1): Unfiltered Postgres Realtime Subscriptions on Location Grants

- **Location:** [`src/screens/settings/LocationSettings.tsx:20-28`](file:///d:/zetax/name/STRYT/src/screens/settings/LocationSettings.tsx#L20-L28), [`src/screens/Home.tsx:134`](file:///d:/zetax/name/STRYT/src/screens/Home.tsx#L134)
- **Root Cause:**
  1. In `LocationSettings.tsx`:
     ```typescript
     const { data: pendingData } = useQueryWithRealtime(
       () => locationService.pendingForMe(), "location_share_grants", [user.id], undefined, `home:pending-loc:${user.id}`
     );
     const { data: activeShares } = useQueryWithRealtime(
       () => locationService.sharedByMe(), "location_share_grants", [user.id], undefined, `location:active-shares:${user.id}`
     );
     const { data: historyShares } = useQueryWithRealtime(
       () => locationService.shareHistory(), "location_share_grants", [user.id], undefined, `location:history:${user.id}`
     );
     ```
  2. The 4th argument `filter` is passed as `undefined`.
  3. `useApi.ts:150-163` registers a Postgres Realtime channel listening to all database changes on `public.location_share_grants`.
  4. Every user with `/settings/location` open receives realtime broadcasts for any grant created or updated across the entire platform, triggering 3 redundant API refetches per event.
  5. The exact same issue exists on `Home.tsx:134`, where every active customer receives platform-wide grant updates.
- **Recommended Remediation:**
  - Supply the filter argument: `filter: \`owner_user_id=eq.\${user.id}\``.

---

### 🟡 LOC-8 (P2): `LiveShareBanner.tsx` Hardcodes `top: 8` and Clips Safe Areas

- **Location:** [`src/features/live-share/LiveShareBanner.tsx:10-18`](file:///d:/zetax/name/STRYT/src/features/live-share/LiveShareBanner.tsx#L10-L18)
- **Root Cause:**
  1. In `LiveShareBanner.tsx`:
     ```typescript
     style={{
       position: "fixed", top: 8, left: "50%", transform: "translateX(-50%)",
       zIndex: 4000, background: "var(--accent-500)", color: "#fff",
       borderRadius: 999, padding: "7px 8px 7px 14px", display: "flex",
       alignItems: "center", gap: 10, fontSize: 12.5, fontWeight: 700,
       boxShadow: "0 4px 14px rgba(0,0,0,0.25)", maxWidth: "92vw",
     }}
     ```
  2. On modern mobile devices (iPhone Dynamic Island / notch, Android punch-holes), `top: 8` places the banner directly behind status bar clock and battery icons.
  3. Furthermore, on screens with a standard `AppBar`, the banner at `top: 8` floats directly over the navigation title and back button, obstructing touch events.
- **Recommended Remediation:**
  - Adjust top positioning to respect safe areas: `top: "max(12px, env(safe-area-inset-top))"`.
  - Add tap handler on the banner body navigating to `/safety` so users can inspect active recipients.

---

### 🟡 LOC-9 (P2): Leaflet Memory Leak & StrictMode Re-Initialization Crash

- **Location:** [`src/features/live-share/LiveLocationCard.tsx:40-67`](file:///d:/zetax/name/STRYT/src/features/live-share/LiveLocationCard.tsx#L40-L67)
- **Root Cause:**
  1. Leaflet map instantiation:
     ```typescript
     useEffect(() => {
       if (ended || !view || view.lat == null || view.lng == null || !mapEl.current) return;
       if (!mapRef.current) {
         const map = L.map(mapEl.current, ...).setView([view.lat, view.lng], 15);
         ...
         mapRef.current = map;
       }
       ...
     }, [view, ended]);
     ```
  2. Map cleanup is isolated in a separate effect:
     ```typescript
     useEffect(() => {
       if (ended && mapRef.current) {
         mapRef.current.remove();
         mapRef.current = null;
         markerRef.current = null;
       }
     }, [ended]);
     ```
  3. If the user navigates away from chat while the share is active, or if React 18 mounts and unmounts in Strict Mode, `mapRef.current.remove()` is never called.
  4. The underlying DOM container retains Leaflet internal properties (`_leaflet_id`). When re-mounting, `L.map(mapEl.current)` throws an uncaught exception: `Error: Map container is already initialized.`
- **Recommended Remediation:**
  - Add a proper return cleanup function to the map initialization `useEffect`:
    ```typescript
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    ```

---

## 4. Architectural Gaps & Database Schema Alignment

```
┌────────────────────────────────────────────────────────────────────────┐
│             STRYT Location Sharing & Consent Architecture              │
└────────────────────────────────────────────────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
    [Live Emergency Sharing]       [Consent Exact Coordinates]
       (public.live_shares)      (public.location_share_grants)
               │                               │
       ┌───────┴───────┐               ┌───────┴───────┐
       ▼               ▼               ▼               ▼
 [start_live_share] [useLiveShare] [request_loc]  [LocationSettings]
       │               │               │               │
       ▼               ▼               ▼               ▼
  ❌ No Expiry   ❌ (0,0) Fallback ❌ Re-Request   ❌ Expired Shown
   (Zombie GPS)  (Null Island)      Lockout Trap      as Active
```

---

## 5. Verification & Validation Steps

1. **Auto-Expiry Verification:**
   - Verify that `public.live_shares` has an `expires_at` column defaulting to 8 hours from creation.
   - Verify that `emergencyService.myActiveShareId()` rejects expired sessions.
2. **Cold-Start Fallback Verification:**
   - Simulate a geolocation failure/timeout in `firstFix()`.
   - Verify `useLiveShare.start()` returns `null` and shows an error toast without creating a (0, 0) database row.
3. **Grant Re-Request Verification:**
   - Create a grant, set `expires_at` to the past.
   - Call `request_location_share`.
   - Verify status resets to `PENDING` and appears in the owner's `pendingForMe()` query.
4. **Build & Token Verification:**
   - Run `npx tsc --noEmit` to ensure type completeness.
   - Run `npm run check-colors` to confirm design token conformance.
