# 22 — Android Platform Checks

**Priority:** P0. This is the "largest untested risk" per
`PLAY_SUBMISSION_CHECKLIST.md` — **nothing in this file has been run on
physical hardware** as of the last reconciliation pass (3 Sep 2026).

## Flow A — Install & cold start

| # | Step | Expected |
|---|------|----------|
| 1 | Install the release AAB/APK on a **clean** device | Installs, launches |
| 2 | Cold start time | No white flash before first paint |
| 3 | Upgrade **over** an older install | Stays signed in, no forced re-login |
| 4 | Check for a Service Worker registered inside the WebView | Should be **none** — SW is a web-only concern, confirm it doesn't leak into the native shell |

## Flow B — Permissions

| # | Step | Expected |
|---|------|----------|
| 1 | Every permission prompt (location, notifications, camera/gallery for uploads) | Appears **in context**, with an in-app disclosure **before** the OS dialog — never a cold prompt at launch |
| 2 | **Deny** each permission in turn | App degrades gracefully per-feature, never crashes |
| 3 | Revoke a permission in OS Settings **while the app is running/backgrounded** | Detected cleanly on next relevant action, not a silent failure |
| 4 | Background location specifically | Only ever requested from the My People sharing flow (workflow 10) — confirm no other code path triggers it |
| 5 | `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | Should **never appear** this release — its permission entry is commented out of the manifest and its only call site (delivery on-duty) is unreachable (workflow 20) |

## Flow C — Background behaviour

| # | Step | Expected |
|---|------|----------|
| 1 | Background the app 30 minutes, return | Resumes correctly, no stale/broken state |
| 2 | Low-end device (Xiaomi/Oppo/Vivo, if available) with an active foreground service (My People share) | FGS survives — these OEMs are the most aggressive at killing background work |
| 3 | Airplane mode, reopen the app | Offline shell renders, doesn't hang on a spinner |

## Flow D — Push notifications

| # | Step | Expected |
|---|------|----------|
| 1 | Trigger a push while the app is **foregrounded** | Arrives, correct content |
| 2 | While **backgrounded** | Arrives as an OS notification |
| 3 | While **fully killed** | Still arrives |
| 4 | Tap any of the three | Cold/warm-starts the app to the **correct** deep-linked screen |
| 5 | **This is the single most likely thing to break right now**: the push trigger → `send-push` edge function path was re-plumbed onto the new Supabase secret key this cycle. Confirm end to end that a real push actually arrives — the DB trigger swallows errors, so a failure here is **silent**, a notification insert never rolls back to tell you it failed |

## Flow E — Deep links

| # | Step | Expected |
|---|------|----------|
| 1 | Cold-start the app via a deep link (not already running) | Lands on the correct screen, not a bounce to Home |
| 2 | `/track/:token` specifically | Opens **signed out** — the one anonymous RPC left in place |

## Flow F — OTA updates

| # | Step | Expected |
|---|------|----------|
| 1 | Publish an OTA bundle, background then foreground the app | Picks it up |
| 2 | Publish a **broken** bundle | App still boots — rollback safety, doesn't brick installs |

## Flow G — Web deploy pipeline (if the PWA/web build is also live)

Full script: `MANUAL_TEST_PLAN.md` §1.10 (P0).

| # | Step | Expected |
|---|------|----------|
| 1 | Deploy a visible change to Vercel with the app open | — |
| 2 | Wait ≤1h or background/foreground | Page reloads itself onto the new build |
| 3 | Hard-close and reopen | New version, no manual refresh needed |
| 4 | DevTools → Service Workers | Nothing stuck in "waiting" |
| 5 | Console on every main screen | No CSP violations (map + area-name resolution specifically exercise `connect-src`) |

## Flow H — Responsive / device matrix

| # | Step | Expected |
|---|------|----------|
| 1 | 360px width | No horizontal scroll anywhere |
| 2 | 390 / 414 / tablet / desktop | Layout holds |
| 3 | Landscape | Doesn't break (P2, spot-check) |
| 4 | Safe areas (notch, gesture bar) | Content never sits under them |
| 5 | Back button / gesture from every screen | Behaves correctly, never dead-ends |
| 6 | Font scaling 150% | Doesn't break layout (P2) |
| 7 | Long names / emoji / RTL-ish input | Doesn't overflow or break layout (P2) |
