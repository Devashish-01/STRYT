# Bugfix Requirements Document

## Introduction

Users report that STRYT "is not throwing notifications" — the OS-level push banner never appears on their device (including when the app is closed or backgrounded), even though the in-app notifications page correctly shows a new notification row. This affects both the native Android (Capacitor + FCM) delivery path and the browser Web Push (PWA) path.

The delivery chain is:

```
notifications row inserted
  → DB trigger trg_push_on_notification
  → pg_net POST to send-push edge function
  → FCM v1 messages:send (Android) and/or Web Push (browser)
  → device displays banner
```

The in-app row appears, which proves the notification is created and the app is otherwise healthy. The failure is isolated to the last hops of the chain — the OS-level push is never displayed. Investigation identified defects in two independent delivery paths plus backend configuration prerequisites:

1. **Android (native, closed-app):** `send-push` targets FCM notification `channel_id = "stryt_default"`, but that notification channel is never created anywhere in the app, and no `default_notification_channel_id` meta-data exists in `AndroidManifest.xml`. On Android 8+ (API 26) a notification targeting a non-existent channel is dropped by the OS, so the banner never shows.
2. **Web (PWA):** `VITE_VAPID_PUBLIC_KEY` is empty, so `registerPush()` returns before creating a `push_subscriptions` row. With no subscription, the `send-push` function has nothing to deliver to, so web push can never fire.
3. **Backend configuration:** The DB GUCs `app.settings.functions_url` and `app.settings.service_role_key` must be set or the trigger silently no-ops; the edge function secrets `FIREBASE_SERVICE_ACCOUNT` (native) and `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` (web) must be set or `send-push` skips that delivery path. These cannot be verified from the repository and must be validated as part of the fix.

The goal of this bugfix is to make both the native and web push paths deliver a visible OS-level banner whenever a notification row is created, while preserving all existing in-app notification behavior and unrelated app functionality.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a notification row is inserted for a user with a valid Android FCM token and the app is closed or backgrounded THEN the system sends an FCM message targeting channel `stryt_default`, which does not exist, and the OS silently drops it so no banner is displayed.

1.2 WHEN the app runs on Android 8+ (API 26+) and a push targets the non-existent `stryt_default` channel THEN the system fails to display any notification because no notification channel was created and no `default_notification_channel_id` meta-data is declared in `AndroidManifest.xml`.

1.3 WHEN `registerPush()` runs on the web (browser/PWA) path with `VITE_VAPID_PUBLIC_KEY` empty THEN the system returns early, never subscribes via `pushManager.subscribe`, and never creates a `push_subscriptions` row, so the user can never receive web push.

1.4 WHEN a notification row is inserted for a web user THEN the system finds no `push_subscriptions` row for that user (because 1.3 prevented its creation) and delivers no web push banner.

1.5 WHEN the backend GUCs `app.settings.functions_url` or `app.settings.service_role_key` are unset THEN the `push_on_notification_insert` trigger silently returns without calling `send-push`, so no push of any kind is delivered.

1.6 WHEN the edge function secret `FIREBASE_SERVICE_ACCOUNT` is unset (native) or the `VAPID_*` secrets are unset (web) THEN `send-push` skips that delivery path and no banner is displayed for it.

### Expected Behavior (Correct)

2.1 WHEN a notification row is inserted for a user with a valid Android FCM token and the app is closed or backgrounded THEN the system SHALL deliver an FCM message that targets a notification channel that actually exists on the device, resulting in a visible heads-up banner with sound.

2.2 WHEN the app runs on Android 8+ (API 26+) THEN the system SHALL ensure the `stryt_default` notification channel is created (or the message SHALL target a channel guaranteed to exist via `default_notification_channel_id` meta-data in `AndroidManifest.xml`) so the OS displays the banner instead of dropping it.

2.3 WHEN `registerPush()` runs on the web path and a valid VAPID public key is configured THEN the system SHALL request permission, subscribe via `pushManager.subscribe`, and upsert a `push_subscriptions` row for the user.

2.4 WHEN a notification row is inserted for a web user who has an active `push_subscriptions` row THEN the system SHALL deliver a Web Push message that the service worker displays as an OS-level banner.

2.5 WHEN the backend GUCs `app.settings.functions_url` and `app.settings.service_role_key` are set correctly THEN the system SHALL invoke the `send-push` edge function on every notification insert. (Validation/setup requirement — must be documented and verified.)

2.6 WHEN the edge function secrets `FIREBASE_SERVICE_ACCOUNT` (native) and `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` (web) are set correctly THEN the system SHALL attempt delivery on the corresponding path rather than skipping it. (Validation/setup requirement — must be documented and verified.)

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a notification row is inserted THEN the system SHALL CONTINUE TO create and display the in-app notification row on the notifications page exactly as before, regardless of push delivery success or failure.

3.2 WHEN a push delivery fails or the send-push function errors THEN the system SHALL CONTINUE TO complete the notification insert without rolling it back or erroring (the trigger's fire-and-forget, non-blocking behavior is preserved).

3.3 WHEN an FCM token is unregistered/invalid or a web subscription returns 404/410 THEN the system SHALL CONTINUE TO delete the stale token/subscription row as it does today.

3.4 WHEN a user taps a delivered push (native or web) THEN the system SHALL CONTINUE TO route to the notification's deep link via SPA navigation without a full reload.

3.5 WHEN a burst of same-type notifications arrives THEN the system SHALL CONTINUE TO group/coalesce them by `type` (Android `channel`/tag and web `tag`) as it does today.

3.6 WHEN a notification is delivered to a user with valid credentials on only one platform (native OR web) THEN the system SHALL CONTINUE TO deliver on the configured path independently of the other path's configuration state.

## Bug Condition Derivation

### Bug Condition Function

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type NotificationDelivery
         { platform: 'android' | 'web',
           hasValidToken: boolean,        // FCM token (android) or push_subscriptions row (web)
           appState: 'open' | 'background' | 'closed',
           backendConfigured: boolean }   // GUCs + edge secrets set for X.platform
  OUTPUT: boolean

  // A push SHOULD be displayable but is not, due to a code defect
  // (missing Android channel, or web subscription never created).
  IF X.platform = 'android' THEN
    // Android 8+ drops the push because channel "stryt_default" does not exist.
    RETURN X.backendConfigured AND X.hasValidToken
  ELSE IF X.platform = 'web' THEN
    // Web subscription is never created because VITE_VAPID_PUBLIC_KEY is empty.
    RETURN X.backendConfigured   // hasValidToken is forced false by the bug itself
  END IF

  RETURN false
END FUNCTION
```

### Property Specification (Fix Checking)

```pascal
// Property: Fix Checking — a push that should be displayable IS displayed.
FOR ALL X WHERE isBugCondition(X) DO
  result ← deliverPush'(X)
  ASSERT result.osBannerDisplayed = true
  // Android: message targets an existing notification channel → OS shows banner.
  // Web:     registerPush created a push_subscriptions row → send-push delivers → SW shows banner.
END FOR
```

### Preservation Specification (Preservation Checking)

```pascal
// Property: Preservation Checking — non-buggy inputs behave identically.
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT deliverPush(X) = deliverPush'(X)
  // In-app row creation, non-blocking insert, stale-token cleanup, deep-link
  // routing, and type-based coalescing are unchanged.
END FOR
```

**Key Definitions:**
- **F (`deliverPush`)**: The current push delivery chain — Android push dropped by OS (missing channel); web push never subscribed (empty VAPID key).
- **F' (`deliverPush'`)**: The fixed chain — Android channel created/declared so banners show; web VAPID key configured so subscriptions are created and delivered.
- **Counterexamples:** (a) Android user, app closed, valid FCM token, backend configured → no banner. (b) Web user, backend configured → `registerPush()` bails, no `push_subscriptions` row, no banner.
