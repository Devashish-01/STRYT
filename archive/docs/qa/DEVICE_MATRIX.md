# Device matrix

**For:** P13 — device, accessibility and browser QA · **Written:** 2026-09-18
**Why this exists:** `docs/launch/ANDROID_LAUNCH_BLOCKERS.md` BLOCKER 3 is "Nothing has been tested on a
device". The E2E suite proves 137 journeys in a desktop Chromium emulating a Pixel 7. It cannot prove push
delivery, a permission dialog, the camera, the dialler, what happens when Android kills the app in the
background, or what a screen reader reads out.

This is the *platform* half. The *functional* half — which flows to walk — is
[`../launch/MANUAL_TEST_PLAN.md`](../launch/MANUAL_TEST_PLAN.md), 420 lines of it. Do not repeat those here;
run them on one device from each class below.

---

## 1. What the build targets

Read from `android/variables.gradle` and `android/app/src/main/AndroidManifest.xml`:

| Setting | Value | What it means for testing |
|---|---|---|
| `minSdkVersion` | **24** (Android 7.0) | The oldest device that can install it. Anything you test on 7–8 is exercising code paths nothing else does. |
| `targetSdkVersion` | **36** | Android applies its newest runtime behaviour — notification permission, foreground-service types, background-location restrictions — in full. |
| `compileSdkVersion` | 36 | — |

**Permissions declared:** `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`,
`CAMERA`, `POST_NOTIFICATIONS`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`,
`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, `VIBRATE`, `INTERNET`.

Each of the first eight produces a **runtime dialog or a Settings trip** that no automated test sees. That is
the core of what this phase is for.

---

## 2. Device classes

The aim is not many devices. It is **one device from each row**, because each row breaks differently.

| # | Class | Example | Android | Why this row exists |
|---|---|---|---|---|
| 1 | **Low-end, old** | 2–3 GB RAM, Redmi 9A / Galaxy M02 | **7 or 8** | `minSdk` is 24. Pre-Android-10 background location has no separate prompt, and the map plus MapLibre WebGL is the heaviest thing the app does. If it is going to be unusably slow anywhere, it is here. |
| 2 | **Mid-range, current** | 4–6 GB, Redmi Note / Galaxy A-series | **12 or 13** | The volume device in India. Android 13 is where `POST_NOTIFICATIONS` became a runtime prompt — push silently never arrives if it is declined. |
| 3 | **Recent flagship-ish** | 8 GB+ | **14, 15 or 16** | Matches `targetSdk 36`. Strictest background-location and foreground-service enforcement. |
| 4 | **Aggressive OEM battery manager** | **Xiaomi (MIUI/HyperOS), Oppo, Vivo, Realme** | any | The single most likely cause of "push doesn't work" reports in India. These OEMs kill background processes regardless of Android's own rules, which is exactly what `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` (BLOCKER 1) is about. **Do not skip this row.** |
| 5 | **Tablet or foldable** | any | any | Only to confirm nothing is catastrophically broken at a wide viewport. The app is phone-first by design. |

### Browsers, for the web build (stryt.in)

| Browser | Why |
|---|---|
| Chrome, Android | The majority case, and the PWA install path. |
| Safari, iOS | Web push works differently and only for an installed PWA. Expect differences; record them rather than treating them as bugs. |
| Chrome, desktop | Where the owner will look at the admin panel. |
| Firefox, desktop | The one most likely to expose a CSS assumption. |

---

## 3. What only a device can prove

Ordered by how badly it hurts if it is wrong.

| # | Thing | Why automation cannot see it | Related |
|---|---|---|---|
| 1 | **Push actually arrives** — app closed, backgrounded, foregrounded | Delivery involves FCM, the OEM, and the system tray. `tests/push-delivery/` models the chain but cannot observe the banner. | `send-push` |
| 2 | **Notification permission** on Android 13+ | A runtime dialog. Declining it makes push fail silently for that install. | `POST_NOTIFICATIONS` |
| 3 | **Battery optimisation prompt** | BLOCKER 1 — the highest Play rejection risk in the whole app. Must appear only where it is justified. | `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` |
| 4 | **Background location during a live share** | BLOCKER 2. Needs the persistent notification present and the share still updating after the app is backgrounded. | `ACCESS_BACKGROUND_LOCATION` |
| 5 | **Dialling** | `tel:` hands off to the dialler. The `<queries>` entry exists; whether the intent resolves is a device question. | `openExternal.ts` keeps `tel:` on `_self` deliberately |
| 6 | **Camera** | Permission dialog plus a real capture. | `CAMERA` |
| 7 | **Kill and resume** | Android reclaims memory from a backgrounded app. State restoration and the auth session surviving are the risk. | — |
| 8 | **Slow and flaky networks** | Every timeout, spinner and retry path. Use throttling, and also airplane-mode mid-action. | — |
| 9 | **Screen reader (TalkBack)** | Whether anything is announced at all, and whether an icon-only button says what it does. | See the a11y section of the checklist |
| 10 | **Large font / display size** | Android's font scale up to 200%. Where fixed-height rows will clip. | — |
| 11 | **UPI app hand-off** | The `<queries>` block lists GPay, PhonePe, Paytm, BHIM. Whether the intent resolves on a device with them installed. | — |

---

## 4. What has already been proven, and how

State this plainly so device time is not spent re-proving it:

| Proven | By | Not proven |
|---|---|---|
| 137 user journeys across 21 spec files | E2E on staging, 2026-09-18, 0 failures | That any of them work on a real phone |
| The push *chain* is configured | `tests/push-delivery/` + a vault/secret check | That a banner appears |
| The map renders and pans | `critical/map-basemap.spec.ts` | Performance on a 2 GB device |
| No hardcoded colours, no undefined tokens | `npm run lint` | Contrast as actually rendered |

---

## 5. Builds to hand testers

| Build | Points at | Use |
|---|---|---|
| Android debug / internal-testing APK | **staging** | Everything in the checklist. Never test push or bookings against production. |
| `stryt.in` | production | Browser matrix only |

**Before handing anything out:** confirm the APK points at staging. A tester booking against production creates
real rows in a real merchant's console.
