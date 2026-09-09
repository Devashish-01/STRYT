# STRYT — Flow 11.3: In-App Notification Center & Badges Gap Log

**Audit Date:** September 9, 2026  
**Flow Identifier:** Flow 11.3 — Domain 11 (Account, Multi-Role & Platform Security)  
**Primary Components:** [`Notifications.tsx`](file:///d:/zetax/name/STRYT/src/screens/Notifications.tsx), [`NotificationSettings.tsx`](file:///d:/zetax/name/STRYT/src/screens/settings/NotificationSettings.tsx), [`NotificationRow.tsx`](file:///d:/zetax/name/STRYT/src/components/NotificationRow.tsx), [`NotificationContent.tsx`](file:///d:/zetax/name/STRYT/src/components/NotificationContent.tsx), [`DesktopSidebar.tsx`](file:///d:/zetax/name/STRYT/src/components/DesktopSidebar.tsx)  
**Backend Services & Tables:** [`notificationService.ts`](file:///d:/zetax/name/STRYT/src/services/engagement/notificationService.ts), [`userService.ts`](file:///d:/zetax/name/STRYT/src/services/core/userService.ts), `send-push` Edge Function, `public.notifications`, `public.users`  
**Launch Readiness Status:** 🔴 **Critical Audit Blockers (Unfiltered Realtime Unread Count Queries Triggering Platform-Wide Query Storms, Desktop Sidebar Bell Badge Cross-Talk with Chat Unread, Un-debounced Radius Slider Network Flooding, Unscoped Navigation Badge Cache Freezes)**

---

## 1. Executive Summary

Flow 11.3 governs in-app alert delivery, multi-context scoped notification feeds, unread badge counters, swipe-to-delete dismissals, and user alert preferences across STRYT. The notification architecture spans:
1. **The Notification Center ([`Notifications.tsx`](file:///d:/zetax/name/STRYT/src/screens/Notifications.tsx)):** Scoped feed supporting customer personal alerts (`scope=CUSTOMER`), business store operations (`scope=BUSINESS&id=...`), and provider service requests (`scope=PROVIDER&id=...`), categorized into chronological day sections (*Today*, *Yesterday*, weekday/date).
2. **Notification Settings ([`NotificationSettings.tsx`](file:///d:/zetax/name/STRYT/src/screens/settings/NotificationSettings.tsx)):** User preferences controlling discovery alert radius (`notificationRadiusKm`), new shop notices, nearby asks, deals/offers, neighbourhood alerts, silent delivery, and quiet hours.
3. **Interactive Notification Rows ([`NotificationRow.tsx`](file:///d:/zetax/name/STRYT/src/components/NotificationRow.tsx)):** Touch swipe-to-delete with haptic feedback, quick-delete hover affordance, unread indicators, and rich metadata chips ([`NotificationContent.tsx`](file:///d:/zetax/name/STRYT/src/components/NotificationContent.tsx)).
4. **Unread Counter Badges:** Positioned on header bells across [`Home.tsx`](file:///d:/zetax/name/STRYT/src/screens/Home.tsx#L309), [`Profile.tsx`](file:///d:/zetax/name/STRYT/src/screens/Profile.tsx#L237), [`ManageDashboard.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/manage/ManageDashboard.tsx#L428), [`ProviderDashboard.tsx`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderDashboard.tsx#L327), and [`DesktopSidebar.tsx`](file:///d:/zetax/name/STRYT/src/components/DesktopSidebar.tsx#L124).

While the underlying schema design leverages automated triggers and scoped routing (`entity_type`, `entity_id` via `derive_notification_scope()`), deep architectural auditing uncovered severe real-time performance risks, badge cross-talk bugs, and touch interaction hazards:

1. **Unfiltered Realtime Channel Triggers Platform-Wide Thundering Herd Storms (P0):** In [`Home.tsx:135`](file:///d:/zetax/name/STRYT/src/screens/Home.tsx#L135), [`Profile.tsx:136`](file:///d:/zetax/name/STRYT/src/screens/Profile.tsx#L136), [`ManageDashboard.tsx:89`](file:///d:/zetax/name/STRYT/src/screens/business/manage/ManageDashboard.tsx#L89), and [`ProviderDashboard.tsx:82`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderDashboard.tsx#L82), `useQueryWithRealtime` subscribes to the `notifications` table with `filter = undefined`. Under Supabase Realtime, omitting the filter causes the client to receive Postgres change events for **every notification created, updated, or deleted platform-wide across all users**. Whenever any notification is created in STRYT, every active user's device simultaneously refetches `notificationService.getUnreadCount()`. At production scale, this creates massive query stampedes that will saturate database connection pools.
2. **Desktop Sidebar Bell Badge Displays `chatUnread` Instead of Notifications (P0):** In [`DesktopSidebar.tsx:124`](file:///d:/zetax/name/STRYT/src/components/DesktopSidebar.tsx#L124), the Notifications navigation item defines `badge: chatUnread || undefined`. The desktop sidebar Bell icon displays the user's unread chat messages instead of unread notifications! If a user has 5 unread chat messages and 0 notifications, the Bell displays a red badge of "5". Clicking the Bell lands on `/notifications` with zero unread alerts.
3. **Un-debounced Slider in `NotificationSettings` Floods Database on Drag (P1):** In [`NotificationSettings.tsx:43-48`](file:///d:/zetax/name/STRYT/src/screens/settings/NotificationSettings.tsx#L43-L48), dragging the radius slider continuously triggers `setRadius()`, which immediately executes `userService.update({ notificationRadiusKm: radius })` inside `useEffect` on every single pixel movement. A standard 1-second drag fires 20–30 simultaneous database writes without debouncing.
4. **Unscoped `/notifications` Navigation Fails to Invalidate Scoped Badge Caches (P1):** When a user navigates to `/notifications` without query parameters (e.g. from the desktop sidebar link `/notifications`), `scope` is `undefined`. Consequently, `badgeCacheKey` evaluates to `undefined`. When notifications are read or marked all read, `invalidateQueryCache()` is skipped, leaving header badges on Home, Profile, and Manage hubs displaying stale unread counts.
5. **Hard 50-Item Cap Without Pagination Strands Older Alerts (P1):** In [`notificationService.ts:50`](file:///d:/zetax/name/STRYT/src/services/engagement/notificationService.ts#L50), `list()` queries with `.limit(50)`. Neither pagination nor a "Load older notifications" button exists. Active users with more than 50 alerts have all older notifications permanently stranded and inaccessible.
6. **Failed Swipe-to-Delete Displaces Row to Feed Bottom (P1):** When a swipe-to-delete fails due to network drop, [`Notifications.tsx:210`](file:///d:/zetax/name/STRYT/src/screens/Notifications.tsx#L210) appends the recovered item `[...p, n]` to the bottom of the list rather than restoring it to its original chronological position.

---

## 2. Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **NOTIF-1** | Realtime Unread Count Queries Lack `user_id` Filter, Triggering Platform Query Storms | 🔴 P0 (Critical Architecture & Database Scalability) | Header badges subscribe to `table: 'notifications'` globally without `filter`. Any notification created anywhere causes all connected clients to simultaneously query `getUnreadCount()`. |
| **NOTIF-2** | Desktop Sidebar Notifications Item Displays `chatUnread` Badge | 🔴 P0 (Critical UX & Badge Cross-Talk) | Desktop sidebar Bell icon is wired to `chatUnread`. Clicking a badge showing "5" opens an empty notification center with 0 alerts. |
| **NOTIF-3** | Slider Drag in `NotificationSettings` Floods Database With Un-debounced Writes | 🟠 P1 (Network & Concurrency Flaw) | Dragging the radius slider fires dozens of simultaneous `userService.update()` requests on every touch move. |
| **NOTIF-4** | Unscoped `/notifications` Navigation Skips Badge Cache Invalidation | 🟠 P1 (Stale Badge UI Desync) | Navigating without `?scope=` leaves `badgeCacheKey` undefined, preventing mark-as-read from updating badges on Home/Profile. |
| **NOTIF-5** | Hard 50-Item Cap Without Pagination Strands Older Notifications | 🟠 P1 (Data Truncation & Unreachable Alerts) | Queries hardcode `.limit(50)` with no cursor or "Load more" button, permanently burying older notifications. |
| **NOTIF-6** | Failed Swipe-to-Delete Appends Restored Row to Feed Bottom | 🟠 P1 (UI Ordering Glitch) | Reverting a failed delete appends the notification to the end of `items`, breaking calendar day grouping. |
| **NOTIF-7** | "Mark all read" Text Button Violates 44px Minimum Touch Target | 🟡 P2 (Accessibility & Touch Usability) | Button has ~16px height with no padding, causing frequent mis-clicks on mobile touchscreens. |

---

## 3. Detailed Findings & Root Cause Analysis

---

### 🔴 NOTIF-1 (P0): Realtime Unread Count Queries Lack `user_id` Filter, Triggering Platform Query Storms

- **Location:** [`src/screens/Home.tsx:135`](file:///d:/zetax/name/STRYT/src/screens/Home.tsx#L135), [`src/screens/Profile.tsx:136`](file:///d:/zetax/name/STRYT/src/screens/Profile.tsx#L136), [`src/screens/business/manage/ManageDashboard.tsx:89`](file:///d:/zetax/name/STRYT/src/screens/business/manage/ManageDashboard.tsx#L89), [`src/screens/provider/manage/ProviderDashboard.tsx:82`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderDashboard.tsx#L82), [`src/hooks/useApi.ts:150-163`](file:///d:/zetax/name/STRYT/src/hooks/useApi.ts#L150-L163)
- **Root Cause:**
  1. In `src/hooks/useApi.ts:120-163`:
     ```typescript
     export function useQueryWithRealtime<T>(
       fn: () => Promise<T>,
       tableName: string,
       deps: unknown[] = [],
       filter?: string,
       cacheKey?: string
     ): QueryState<T> {
       ...
       const channel = sb
         .channel(channelName)
         .on(
           "postgres_changes" as any,
           {
             event: "*",
             schema: "public",
             table: tableName,
             ...(filter ? { filter } : {}),
           },
           () => {
             if (active) refetchRef.current();
           }
         )
         .subscribe(...);
     ```
  2. Notice that if `filter` is `undefined`, the channel subscribes to all events on `tableName` across the entire database without restriction.
  3. Look at how the four dashboard screens invoke `useQueryWithRealtime` for notification unread counts:
     - [`Home.tsx:135`](file:///d:/zetax/name/STRYT/src/screens/Home.tsx#L135):
       `useQueryWithRealtime(() => notificationService.getUnreadCount({ scope: "CUSTOMER" }), "notifications", [], undefined, "notif:customer")`
     - [`Profile.tsx:136`](file:///d:/zetax/name/STRYT/src/screens/Profile.tsx#L136):
       `useQueryWithRealtime(() => notificationService.getUnreadCount({ scope: "CUSTOMER" }), "notifications", [], undefined, "notif:customer")`
     - [`ManageDashboard.tsx:89`](file:///d:/zetax/name/STRYT/src/screens/business/manage/ManageDashboard.tsx#L89):
       `useQueryWithRealtime(() => notificationService.getUnreadCount({ scope: "BUSINESS", id }), "notifications", [id], undefined, `notif:business:${id}`)`
     - [`ProviderDashboard.tsx:82`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderDashboard.tsx#L82):
       `useQueryWithRealtime(() => notificationService.getUnreadCount({ scope: "PROVIDER", id }), "notifications", [id], undefined, `notif:provider:${id}`)`
  4. In all four screens, the 4th argument `filter` is explicitly passed as `undefined`!
  5. Contrast this with [`Notifications.tsx:148`](file:///d:/zetax/name/STRYT/src/screens/Notifications.tsx#L148):
     `user.id ? 'user_id=eq.${user.id}' : undefined`
  6. **The Consequence:** Every active client is subscribed to the global firehose of the `notifications` table. When User A receives a notification (e.g. someone liked their post, or a walk-in queue token was updated), a Realtime broadcast event is sent to User B, User C, User D... and every single connected client fires `refetchRef.current()`, executing `notificationService.getUnreadCount()`. This creates a catastrophic thundering herd query storm on Postgres for every notification event.
- **Recommended Remediation:**
  - Update all 4 call sites to pass `user.id ? `user_id=eq.${user.id}` : undefined` as the 4th argument (`filter`) to `useQueryWithRealtime`.

---

### 🔴 NOTIF-2 (P0): Desktop Sidebar Notifications Item Displays `chatUnread` Badge

- **Location:** [`src/components/DesktopSidebar.tsx:124`](file:///d:/zetax/name/STRYT/src/components/DesktopSidebar.tsx#L124)
- **Root Cause:**
  1. In `src/components/DesktopSidebar.tsx:117-128`:
     ```typescript
     // Default Customer context
     return [
       { to: "/home", label: t("home") || "Home", icon: Home, exact: true },
       { to: "/explore", label: "Explore", icon: UserCircle },
       { to: "/map", label: t("map") || "Map", icon: Map },
       { to: "/community-hub?view=deals", label: "Bulk & group buys", icon: Package },
       { to: "/community-hub", label: "Community", icon: ImageIcon },
       { to: "/notifications", label: "Notifications", icon: Bell, badge: chatUnread || undefined },
       { to: "/queues", label: "My Queues", icon: Plus },
       { to: "/profile", label: t("profile") || "Profile", icon: User },
       { to: "/settings", label: "Settings", icon: Settings },
     ];
     ```
  2. The navigation item for Notifications explicitly sets:
     `badge: chatUnread || undefined`!
  3. `chatUnread` is the number of unread direct chat conversations loaded from `chatService`.
  4. If a user receives 3 unread messages in chat, the Bell icon shows a badge of "3". When the user clicks the Bell icon, they navigate to `/notifications`, where there are 0 unread alerts.
  5. If the user has 5 unread alerts in Notifications but 0 unread chats, the Bell icon shows no badge at all.
- **Recommended Remediation:**
  - Query customer notification unread count in `DesktopSidebar.tsx` using `notificationService.getUnreadCount({ scope: "CUSTOMER" })` with a user-scoped realtime filter.
  - Wire `badge: notifUnread || undefined` to the Notifications navigation item.
  - Provide a dedicated Chats navigation item if chat access is needed in the sidebar.

---

### 🟠 NOTIF-3 (P1): Slider Drag in `NotificationSettings` Floods Database With Un-debounced Writes

- **Location:** [`src/screens/settings/NotificationSettings.tsx:43-48`](file:///d:/zetax/name/STRYT/src/screens/settings/NotificationSettings.tsx#L43-L48)
- **Root Cause:**
  1. In `NotificationSettings.tsx`:
     ```typescript
     const [radius, setRadius] = useState(() => {
       const saved = localStorage.getItem("settings_radius");
       return saved ? Number(saved) : (user.notificationRadiusKm || 5);
     });
     ...
     useEffect(() => {
       localStorage.setItem("settings_radius", String(radius));
       if (user.id && radius !== user.notificationRadiusKm) {
         void userService.update({ notificationRadiusKm: radius }).catch(() => {});
       }
     }, [radius, user.id, user.notificationRadiusKm]);
     ```
  2. When a user drags the `RadiusSelector` slider on mobile or desktop, `setRadius` is called on every mouse move / touch move tick.
  3. Because the `useEffect` has `radius` in its dependency array without any debounce timer or commit barrier, every fractional increment dispatches an asynchronous HTTP `userService.update()` call to Supabase.
  4. A continuous slide from 1km to 20km fires 20–30 rapid concurrent update requests. These requests can complete out of order, resulting in an older slider value overwriting the final released position.
- **Recommended Remediation:**
  - Add a 400ms debounce timer inside `useEffect`:
    ```typescript
    useEffect(() => {
      localStorage.setItem("settings_radius", String(radius));
      if (!user.id || radius === user.notificationRadiusKm) return;
      const t = setTimeout(() => {
        void userService.update({ notificationRadiusKm: radius }).catch(() => {});
      }, 400);
      return () => clearTimeout(t);
    }, [radius, user.id, user.notificationRadiusKm]);
    ```

---

### 🟠 NOTIF-4 (P1): Unscoped `/notifications` Navigation Skips Badge Cache Invalidation

- **Location:** [`src/screens/Notifications.tsx:123-143, 181, 209, 230`](file:///d:/zetax/name/STRYT/src/screens/Notifications.tsx#L123-L143)
- **Root Cause:**
  1. In `Notifications.tsx:123-139`:
     ```typescript
     const rawScope = params.get("scope");
     const scope: NotifScope | undefined =
       rawScope === "BUSINESS" ? { scope: "BUSINESS", id: params.get("id") ?? "" }
       : rawScope === "PROVIDER" ? { scope: "PROVIDER", id: params.get("id") ?? "" }
       : rawScope === "CUSTOMER" ? { scope: "CUSTOMER" }
       : undefined;
     ...
     const badgeCacheKey =
       scope?.scope === "CUSTOMER" ? "notif:customer"
       : scope?.scope === "BUSINESS" ? `notif:business:${scope.id}`
       : scope?.scope === "PROVIDER" ? `notif:provider:${scope.id}`
       : undefined;
     ```
  2. If a user navigates to `/notifications` without URL search params (e.g. from the desktop sidebar link, direct URL entry, or browser history), `rawScope` is `null`.
  3. `scope` is `undefined`, causing `badgeCacheKey` to be `undefined`.
  4. When the user taps a notification to open it, deletes an alert, or taps "Mark all read":
     `if (badgeCacheKey) invalidateQueryCache(badgeCacheKey);`
  5. Because `badgeCacheKey` is `undefined`, the cached queries for `notif:customer`, `notif:business:*`, etc., are never invalidated.
  6. When the user navigates back to Home or Profile, the unread badge continues to show the old unread count until page reload.
- **Recommended Remediation:**
  - Default `scope` to `{ scope: "CUSTOMER" }` when `rawScope` is not specified:
    ```typescript
    const scope: NotifScope =
      rawScope === "BUSINESS" ? { scope: "BUSINESS", id: params.get("id") ?? "" }
      : rawScope === "PROVIDER" ? { scope: "PROVIDER", id: params.get("id") ?? "" }
      : { scope: "CUSTOMER" };
    ```

---

### 🟠 NOTIF-5 (P1): Hard 50-Item Cap Without Pagination Strands Older Notifications

- **Location:** [`src/services/engagement/notificationService.ts:50`](file:///d:/zetax/name/STRYT/src/services/engagement/notificationService.ts#L50), [`src/screens/Notifications.tsx:250-285`](file:///d:/zetax/name/STRYT/src/screens/Notifications.tsx#L250-L285)
- **Root Cause:**
  1. In `src/services/engagement/notificationService.ts:44-53`:
     ```typescript
     async list(scope?: NotifScope): Promise<AppNotification[]> {
       ...
       const { data, error } = await q.order("created_at", { ascending: false }).limit(50);
       ...
     }
     ```
  2. The service query hardcodes `.limit(50)`.
  3. Neither `notificationService.list()` nor `Notifications.tsx` supports pagination, offset, cursor, or infinite scrolling.
  4. If a user receives more than 50 notifications, older alerts are completely cut off and can never be viewed or reached by the user in the app.
- **Recommended Remediation:**
  - Add optional cursor pagination to `notificationService.list(scope, beforeTimestamp, limit = 50)`.
  - In `Notifications.tsx`, if the returned items count reaches 50, render a "Load older notifications" button at the bottom of the feed to append the next batch.

---

### 🟠 NOTIF-6 (P1): Failed Swipe-to-Delete Appends Restored Row to Feed Bottom

- **Location:** [`src/screens/Notifications.tsx:199-214`](file:///d:/zetax/name/STRYT/src/screens/Notifications.tsx#L199-L214)
- **Root Cause:**
  1. In `Notifications.tsx:199-214`:
     ```typescript
     function remove(n: AppNotification) {
       setExitingIds((s) => new Set(s).add(n.id));
       setTimeout(() => {
         setItems((p) => p.filter((x) => x.id !== n.id));
         ...
       }, 220);
       ...
       notificationService.remove(n.id).catch(() => {
         setItems((p) => (p.some((x) => x.id === n.id) ? p : [...p, n]));
         showToast("Couldn't delete — try again");
       });
     }
     ```
  2. If the network call to `notificationService.remove(n.id)` fails, the catch block attempts to roll back the optimistic deletion by appending `n` to the end of `items` (`[...p, n]`).
  3. Because `sections` is computed using `groupByDay(items, ...)`, appending `n` places the item at the very bottom of the feed (often under an older date heading like "Last week"), violating chronological order and confusing the user.
- **Recommended Remediation:**
  - When rolling back a failed delete, insert `n` in sorted chronological order by `createdAt`, or call `refetch()`.

---

### 🟡 NOTIF-7 (P2): "Mark all read" Text Button Violates 44px Minimum Touch Target

- **Location:** [`src/screens/Notifications.tsx:223-241`](file:///d:/zetax/name/STRYT/src/screens/Notifications.tsx#L223-L241)
- **Root Cause:**
  1. The "Mark all read" button in the AppBar right slot:
     ```tsx
     <button
       className="tiny semi"
       style={{ color: "var(--brand-700)" }}
       onClick={...}
     >
       {t("mark_all_read")}
     </button>
     ```
  2. The element has no padding or explicit touch bounding box. Its computed height is only ~16px.
  3. Mobile touch standards (WCAG 2.5.5, Apple HIG) mandate a minimum 44x44px interactive tap area. Users with larger fingers or walking while using the app regularly miss this button or accidentally trigger the AppBar header.
- **Recommended Remediation:**
  - Wrap the button in a standard touch target style: `padding: "8px 12px", minHeight: 44, display: "flex", alignItems: "center"`.

---

## 4. Validation & Non-Regression Checks

- **TypeScript Compilation:** Run `npx tsc --noEmit` to verify type signatures across `Notifications.tsx`, `NotificationSettings.tsx`, `NotificationRow.tsx`, and `DesktopSidebar.tsx`.
- **Design Token Compliance:** Run `npm run check-colors` to confirm that all alert icons, badges, tone pills, and swipe containers strictly utilize platform design tokens (`var(--brand-*)`, `var(--orange-*)`, `var(--green-*)`).

---

## 5. Summary & Next Immediate Actions

1. **Register Gap Log:** Log recorded as `docs/gaps/NOTIFICATION_CENTER_GAP_LOG.md`.
2. **Master Tracker Update:** Advance Flow 11.3 from `Ready to Audit` to `AUDITED` in [`docs/gaps/MASTER_FLOW_AUDIT_TRACKER.md`](file:///d:/zetax/name/STRYT/docs/gaps/MASTER_FLOW_AUDIT_TRACKER.md) (Domain 11: 3/6, Platform Total: 49/52, ~94%).
3. **Execute Verification Commands:** Confirm clean type compilation and styling checks.
4. **Proceed to Flow 11.4:** Begin audit of Flow 11.4 (Entity Password & Security Settings: `/settings/security`, `SecuritySettings.tsx`).
