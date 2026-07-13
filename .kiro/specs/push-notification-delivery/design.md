# Push Notification Delivery Bugfix Design

## Overview

STRYT creates an in-app notification row correctly, but the OS-level push banner never appears on the device on either delivery path. The in-app row proving the notification pipeline is healthy up to the point where `send-push` hands off to FCM (native) and Web Push (browser). The failure is isolated to the final delivery hops.

Two independent code defects, plus a set of backend configuration prerequisites, break the last leg of the chain:

1. **Android native (Capacitor + FCM):** `send-push` sends every FCM message with `android.notification.channel_id = "stryt_default"`, but that notification channel is never created anywhere in the native app, and no `default_notification_channel_id` meta-data is declared in `AndroidManifest.xml`. On Android 8+ (API 26+) a notification targeting a non-existent channel is silently dropped by the OS, so no banner shows.
2. **Web PWA:** `VITE_VAPID_PUBLIC_KEY` is empty, so `registerPush()` returns early before calling `pushManager.subscribe`, and no `push_subscriptions` row is ever created. With no subscription, `send-push` has nothing to deliver to and web push can never fire.
3. **Backend configuration prerequisites:** The DB GUCs `app.settings.functions_url` / `app.settings.service_role_key` must be set (or the trigger silently no-ops), and the edge function secrets `FIREBASE_SERVICE_ACCOUNT` (native) and `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` (web) must be set (or `send-push` skips that path). These cannot be verified from the repository and must be validated as part of the fix.

The fix strategy is deliberately narrow: create the missing Android notification channel (and declare a default channel fallback), configure the web VAPID public key so subscriptions are created, and document/verify the backend prerequisites. All existing behavior — in-app row creation, non-blocking fire-and-forget inserts, stale-token/subscription cleanup, deep-link routing, and type-based coalescing — must remain byte-for-byte unchanged for every non-buggy input.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — a push that *should* be displayable (backend configured, valid credentials) is not delivered as an OS banner because of the missing Android channel or the never-created web subscription. Formalized by `isBugCondition(X)`.
- **Property (P)**: The desired behavior for buggy inputs — when `isBugCondition(X)` holds, the fixed delivery chain produces a visible OS-level banner (`osBannerDisplayed = true`).
- **Preservation**: All behavior for non-buggy inputs (`NOT isBugCondition(X)`) — in-app row creation, non-blocking inserts, stale-token cleanup, deep-link routing, and type coalescing — must be identical between the original chain `F` and the fixed chain `F'`.
- **`send-push`**: The Supabase edge function in `supabase/functions/send-push/index.ts` that loads a user's `push_subscriptions` (web) and `fcm_tokens` (native) and delivers a push on each configured path.
- **`registerPush`**: The client function in `src/lib/pushNotifications.ts` that, on web, subscribes via `pushManager.subscribe` and upserts a `push_subscriptions` row; on native, registers the FCM token into `fcm_tokens`.
- **`push_on_notification_insert` / `trg_push_on_notification`**: The Postgres trigger (in `supabase/migrations/20260731_push_on_every_notification.sql`) that fires `pg_net` async POST to `send-push` after any `notifications` insert. It no-ops silently if the GUCs are unset and swallows all errors so the insert never rolls back.
- **Notification channel (`stryt_default`)**: The Android 8+ (API 26+) `NotificationChannel` that a notification must target to be displayed. Currently referenced by `send-push` but never created on-device.
- **VAPID key**: The Voluntary Application Server Identification key pair for Web Push. `VITE_VAPID_PUBLIC_KEY` (client) must match `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (edge function secrets).

## Bug Details

### Bug Condition

The bug manifests when a notification row is inserted for a user who *should* be able to receive an OS-level push — the backend is configured for their platform and (for native) they have a valid FCM token — but no banner is displayed. On Android the `send-push` message targets the non-existent `stryt_default` channel and the OS drops it; on web `registerPush()` never created a `push_subscriptions` row because `VITE_VAPID_PUBLIC_KEY` is empty, so there is no subscription to deliver to.

**Formal Specification:**
```
FUNCTION isBugCondition(X)
  INPUT: X of type NotificationDelivery
         { platform: 'android' | 'web',
           hasValidToken: boolean,      // FCM token (android) OR push_subscriptions row (web)
           appState: 'open' | 'background' | 'closed',
           backendConfigured: boolean } // GUCs + edge secrets set for X.platform
  OUTPUT: boolean

  IF X.platform = 'android' THEN
    // Android 8+ drops the push because channel "stryt_default" does not exist.
    RETURN X.backendConfigured AND X.hasValidToken
  ELSE IF X.platform = 'web' THEN
    // Web subscription is never created because VITE_VAPID_PUBLIC_KEY is empty,
    // so hasValidToken is forced false by the bug itself.
    RETURN X.backendConfigured
  END IF

  RETURN false
END FUNCTION
```

### Examples

- **Android, closed app, valid FCM token, backend configured** → `send-push` posts an FCM v1 message with `channel_id: "stryt_default"`; on API 26+ the OS finds no such channel and silently drops the notification. Expected: heads-up banner with sound. Actual: nothing.
- **Web user, backend configured** → on login `registerPush(userId)` runs, `VITE_VAPID_PUBLIC_KEY` is empty, so it returns at the `if (!vapidKey ...) return;` guard. No `push_subscriptions` row exists, `send-push` finds `subs.length === 0`, delivers nothing. Expected: SW `showNotification` banner. Actual: nothing.
- **Web user with valid VAPID key configured (post-fix expectation)** → `registerPush` subscribes and upserts a `push_subscriptions` row; a later notification insert delivers a Web Push the SW displays. Expected and actual: banner shown.
- **Edge case — Android app in foreground** → in-app row still shows regardless; heads-up banner behavior for a foregrounded app is OS/launcher dependent and is not the target of this fix (the fix targets closed/backgrounded delivery per requirement 2.1).

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- In-app notification row creation and display on the notifications page, regardless of push delivery success or failure (req 3.1).
- Non-blocking, fire-and-forget insert semantics: the trigger uses `pg_net` async POST and swallows all errors, so a push failure or a `send-push` error never rolls back or errors the `notifications` insert (req 3.2).
- Stale-credential cleanup: web subscriptions returning 404/410 are deleted from `push_subscriptions`; FCM tokens returning `UNREGISTERED`/`INVALID_ARGUMENT` are deleted from `fcm_tokens` (req 3.3).
- Deep-link routing on tap: native dispatches the `push-nav` CustomEvent for SPA navigation (no full reload); web SW posts `{ type: "NAVIGATE", path }` to the client or opens a window (req 3.4).
- Type-based coalescing: web SW groups banners by `tag: data.type`; the FCM `data.type` payload is preserved so same-type bursts coalesce (req 3.5).
- Per-platform independence: a user configured on only one platform still receives on that path irrespective of the other path's configuration (req 3.6).

**Scope:**
All inputs where `NOT isBugCondition(X)` must be completely unaffected by this fix. This includes:
- Any notification insert whose in-app row already renders (the row write path is untouched).
- Delivery attempts that fail for reasons unrelated to the two defects (network errors, invalid tokens) — they must still clean up and never block.
- Non-push app behavior: OAuth deep-linking, foreground app messaging listeners, and unrelated service worker caching routes.

**Note:** The expected *correct* behavior for buggy inputs is defined in the Correctness Properties section (Property 1). This section captures what must NOT change.

## Hypothesized Root Cause

Based on the bug analysis and code inspection, the causes are:

1. **Missing Android notification channel (native path):** `send-push/index.ts` sends `android.notification.channel_id = "stryt_default"`, but `MainActivity.java` is an empty `BridgeActivity` that never creates a `NotificationChannel`, and `AndroidManifest.xml` declares no `com.google.firebase.messaging.default_notification_channel_id` meta-data. On API 26+ the OS drops notifications to unknown channels.
   - The channel must be created at app startup (before any push can arrive) with matching id `stryt_default`, HIGH importance, sound, and vibration.
   - A `default_notification_channel_id` meta-data entry provides a guaranteed-existing fallback channel for messages that omit or mismatch a channel.

2. **Empty client VAPID public key (web path):** `VITE_VAPID_PUBLIC_KEY` is blank in `.env` / `.env.example`, so `registerPush()` short-circuits at `if (!vapidKey || ...) return;` and never subscribes or upserts a `push_subscriptions` row.
   - Configuring a valid VAPID public key (matching the edge function's private key) lets `pushManager.subscribe` and the `push_subscriptions` upsert run.

3. **Backend GUCs unset (both paths):** If `app.settings.functions_url` or `app.settings.service_role_key` is empty, `push_on_notification_insert` returns without calling `send-push`, so no push of any kind fires. Must be set once via `alter database`.

4. **Edge function secrets unset (per path):** If `FIREBASE_SERVICE_ACCOUNT` is unset the native branch is skipped; if `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` are unset the web branch is skipped. Must be set via `supabase secrets set`.

## Correctness Properties

Property 1: Bug Condition - Displayable Push Produces an OS Banner

_For any_ notification delivery `X` where the bug condition holds (`isBugCondition(X)` returns true — backend configured, and for native a valid FCM token), the fixed delivery chain `deliverPush'(X)` SHALL result in a visible OS-level banner (`osBannerDisplayed = true`): on Android the FCM message targets a notification channel that actually exists on the device so the OS displays a heads-up banner with sound, and on web `registerPush` has created a `push_subscriptions` row so `send-push` delivers a Web Push that the service worker displays via `showNotification`.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**

Property 2: Preservation - Non-Buggy Delivery Behavior Unchanged

_For any_ input `X` where the bug condition does NOT hold (`isBugCondition(X)` returns false), the fixed chain `deliverPush'(X)` SHALL produce exactly the same result as the original chain `deliverPush(X)`, preserving in-app notification row creation, non-blocking fire-and-forget insert semantics, stale token/subscription cleanup (web 404/410, FCM `UNREGISTERED`/`INVALID_ARGUMENT`), deep-link tap routing (native `push-nav`, web SW `NAVIGATE` postMessage), and type-based coalescing (web `tag`, FCM `data.type`).

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming the root cause analysis is correct, the fix touches the native channel, the web VAPID configuration, and the backend prerequisite documentation. No change is made to the notification-row write path, the trigger's non-blocking contract, the cleanup branches, the tap-routing handlers, or the coalescing tags.

**Change 1 — Create the Android notification channel (native path)**

**File**: `android/app/src/main/java/in/stryt/app/MainActivity.java`

**Specific Changes**:
1. Override `onCreate` in `MainActivity` (still extending `BridgeActivity`) to create the `stryt_default` `NotificationChannel` on API 26+ before any push can arrive.
   - Channel id: `"stryt_default"` (must match the `channel_id` in `send-push/index.ts`).
   - Importance: `NotificationManager.IMPORTANCE_HIGH` (heads-up banner).
   - Enable sound (default) and vibration to match the intended `PRIORITY_HIGH` behavior.
   - Guard with `Build.VERSION.SDK_INT >= Build.VERSION_CODES.O` and register via `getSystemService(NotificationManager.class).createNotificationChannel(...)`. Creating an existing channel is a safe no-op, so this is idempotent across app launches.

**Change 2 — Declare a default channel fallback (native path, defense in depth)**

**File**: `android/app/src/main/AndroidManifest.xml`

**Specific Changes**:
2. Add a `<meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="stryt_default" />` entry inside `<application>` so FCM messages that omit or mismatch a channel still land on a guaranteed channel. (Requires the channel from Change 1 to exist; the two changes are complementary.)

**Change 3 — Configure the web VAPID public key (web path)**

**File**: `.env` (and document in `.env.example`)

**Specific Changes**:
3. Populate `VITE_VAPID_PUBLIC_KEY` with the VAPID public key that pairs with the edge function's `VAPID_PRIVATE_KEY`. This lifts the early return in `registerPush()` so `pushManager.subscribe` runs and a `push_subscriptions` row is upserted. No code change to `pushNotifications.ts` is required — the guard is correct; the value was simply missing.
   - Keep `.env.example` documenting the key (generated via `npx web-push generate-vapid-keys`) without committing the real value.

**Change 4 — Set and verify backend GUCs (both paths, setup requirement)**

**File**: operational (Supabase SQL editor) — documented in the migration header of `supabase/migrations/20260731_push_on_every_notification.sql`

**Specific Changes**:
4. Run once, substituting project values:
   - `alter database postgres set app.settings.functions_url = 'https://<project-ref>.functions.supabase.co';`
   - `alter database postgres set app.settings.service_role_key = '<service_role_key>';`
   - Verify via `select current_setting('app.settings.functions_url', true);` returning a non-empty value.

**Change 5 — Set and verify edge function secrets (per path, setup requirement)**

**File**: operational (`supabase secrets set`)

**Specific Changes**:
5. Set the secrets the corresponding branch in `send-push` reads:
   - Native: `FIREBASE_SERVICE_ACCOUNT` (full service account JSON).
   - Web: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (public key must match `VITE_VAPID_PUBLIC_KEY` from Change 3).
   - Verify by observing `send-push` logs report a non-zero `fcmSent`/`webSent` on a test insert.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on the unfixed code/config, then verify the fix delivers a banner for buggy inputs and preserves all existing behavior for non-buggy inputs. Because the defects span native OS behavior and external delivery services, some checks are device/integration tests while the delivery-chain contracts (channel targeting, subscription creation, cleanup, coalescing) are covered by unit and property-based tests around the pure/observable logic.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix, and confirm or refute the root cause analysis. If refuted, re-hypothesize.

**Test Plan**: Exercise each delivery path against the unfixed code and configuration and assert an OS banner is displayed. Observe the failures to confirm the missing-channel and missing-subscription causes.

**Test Cases**:
1. **Android missing-channel test**: With a valid FCM token and backend configured, insert a notification with the app closed. Assert a heads-up banner appears (will fail on unfixed code — OS drops the `stryt_default` message).
2. **Web missing-subscription test**: With `VITE_VAPID_PUBLIC_KEY` empty, log in and call `registerPush(userId)`; assert a `push_subscriptions` row exists (will fail on unfixed config — early return, no row).
3. **Web no-delivery test**: Insert a notification for a web user with no subscription; assert `send-push` reports `webSent > 0` (will fail — `subs.length === 0`).
4. **Backend prerequisite test (edge case)**: With GUCs unset, insert a notification; assert `send-push` was invoked (may fail — trigger no-ops silently).

**Expected Counterexamples**:
- Android: FCM v1 accepts the message but the OS drops it because channel `stryt_default` does not exist on-device.
- Web: `registerPush` returns at the empty-VAPID guard; no `push_subscriptions` row; `send-push` `webSent === 0`.
- Possible causes: missing Android `NotificationChannel` / `default_notification_channel_id` meta-data, empty `VITE_VAPID_PUBLIC_KEY`, unset GUCs/secrets.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed chain produces the expected behavior (an OS banner).

**Pseudocode:**
```
FOR ALL X WHERE isBugCondition(X) DO
  result := deliverPush'(X)
  ASSERT result.osBannerDisplayed = true
  // Android: message targets an existing "stryt_default" channel -> OS shows banner.
  // Web:     registerPush created a push_subscriptions row -> send-push delivers -> SW shows banner.
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed chain produces the same result as the original chain.

**Pseudocode:**
```
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT deliverPush(X) = deliverPush'(X)
  // In-app row creation, non-blocking insert, stale-token cleanup, deep-link
  // routing, and type-based coalescing are unchanged.
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many delivery inputs automatically across the platform/credential/appState/config domain.
- It catches edge cases (e.g., mixed valid/stale credentials, one-platform-only users) that hand-written unit tests might miss.
- It provides strong guarantees that the observable delivery contract is unchanged for all non-buggy inputs.

**Test Plan**: Observe behavior on the unfixed code first for the preserved behaviors (in-app row, non-blocking insert, cleanup, tap routing, coalescing), then write property-based tests that capture those invariants and re-run them after the fix.

**Test Cases**:
1. **In-app row preservation**: Observe that a notification insert always writes/renders the in-app row regardless of push outcome on unfixed code, then assert it still holds after the fix.
2. **Non-blocking insert preservation**: Observe that a failing/erroring `send-push` never rolls back the insert on unfixed code, then assert the insert still succeeds after the fix.
3. **Stale-credential cleanup preservation**: Observe that a web 404/410 deletes the `push_subscriptions` row and an FCM `UNREGISTERED`/`INVALID_ARGUMENT` deletes the `fcm_tokens` row on unfixed code, then assert unchanged after the fix.
4. **Deep-link routing preservation**: Observe native `push-nav` dispatch and web SW `NAVIGATE` postMessage on unfixed code, then assert unchanged after the fix.
5. **Coalescing preservation**: Observe web SW `tag = data.type` grouping and FCM `data.type` payload on unfixed code, then assert unchanged after the fix.

### Unit Tests

- Android: assert `MainActivity.onCreate` creates a `stryt_default` channel with `IMPORTANCE_HIGH`, sound, and vibration on API 26+, and is a no-op on older APIs.
- Manifest: assert `default_notification_channel_id` meta-data equals `stryt_default`.
- Web `registerPush`: with a valid VAPID key, assert `pushManager.subscribe` is called and a `push_subscriptions` upsert is issued; with an empty key, assert the early return (preservation of the guard).
- `send-push`: assert the FCM message body carries `channel_id: "stryt_default"` and `data.type`, and that the web branch tags by `type`.

### Property-Based Tests

- Generate `NotificationDelivery` inputs across `{platform, hasValidToken, appState, backendConfigured}` and assert: when `isBugCondition(X)` holds the fixed chain yields `osBannerDisplayed = true`, and when it does not hold the observable outcome (row written, insert non-blocking, cleanup performed, routing/coalescing metadata) matches the original.
- Generate mixed subscription/token sets (valid + stale) and assert stale entries are deleted and valid ones delivered, unchanged by the fix.
- Generate bursts of same-`type` notifications and assert web `tag` and FCM `data.type` coalescing metadata is stable across the fix.

### Integration Tests

- Full native flow: closed-app notification insert → `trg_push_on_notification` → `pg_net` → `send-push` → FCM v1 → device heads-up banner on the `stryt_default` channel; tap routes via `push-nav` to the deep link without a full reload.
- Full web flow: login → `registerPush` subscribes and upserts `push_subscriptions` → notification insert → `send-push` Web Push → SW `showNotification`; tap posts `NAVIGATE` and focuses/opens the deep link.
- Context/config independence: a user configured on only one platform receives on that path; unset GUCs/secrets degrade gracefully (no push, in-app row still written, insert still succeeds).
