# P13 — Device, accessibility & browser QA

**Who:** the owner (or testers) runs checks on real devices; the agent prepares checklists, builds, triages and fixes
**Size:** 2–4 sessions, plus tester time
**Depends on:** P12

## Goal
Prove the app works on real phones and browsers, including what automation can't see:
- push notifications;
- permissions;
- the camera;
- dialing;
- background and resume;
- slow networks;
- screen readers;
- large fonts.

Every problem found becomes a ledger row and gets fixed through the P09 loop.

## Why
- `docs/launch/ANDROID_LAUNCH_BLOCKERS.md` BLOCKER 3: "Nothing has been tested on a device".
- Realtime, GPS and push behaviour can only be half-verified from a terminal (`EXECUTION_PHASE_PLAN.md` caveat 3).

## Preconditions
| Check | Command | Expected |
|---|---|---|
| Branch | `git switch -c phase/13-device-qa origin/develop` | Switched |
| Suites green | `npm run verify`, `npm run e2e` | exit 0 |
| A test build exists | Android debug or internal-testing build pointing at **staging** (step 2) | Installable APK |

## Read first
- `docs/launch/ANDROID_LAUNCH_BLOCKERS.md`
- `capacitor.config.ts` (`CapacitorUpdater` `updateUrl`, plugins)
- `android/app/src/main/AndroidManifest.xml` (permissions, `<queries>`)
- `tests/e2e/COVERAGE.md` (flows to walk)
- D1, D2 in `DECISIONS.md`

## Steps

### 13.A — Prepare (agent)
1. Write `docs/qa/DEVICE_MATRIX.md`:

   | Device class | Example | Android | Notes |
   |---|---|---|---|
   | Low-end | 2–3 GB RAM | 9 or 10 | minSdk is 24 |
   | Mid-range | | 13 | |
   | Recent | | 14 or 15 | |
   | Small screen | ≤360 dp wide | | |

   **Web:**
   - Chrome on Android;
   - Safari on iPhone (web only, per D1);
   - desktop Chrome, Edge, Firefox;
   - installed PWA on Android.
2. Add a **staging build variant**:
   - make `capacitor.config.ts` read an optional env var (e.g. `CAP_ENV=staging`) that points `server`/`updateUrl` and the web build at staging;
   - production stays the default when the variable is unset;
   - prove the production output is unchanged: diff `android/app/src/main/assets/capacitor.config.json` after `cap sync` with and without the variable.

   Add `npm run cap:build:staging`, which produces a debug APK against staging.
3. Write `docs/qa/DEVICE_CHECKLIST.md`: one section per flow in COVERAGE.md, plus these native checks, each with expected results:
   - **Install and first run:** splash, onboarding, the location permission prompt with its in-app explanation shown first, and the notification permission prompt on Android 13+ (`POST_NOTIFICATIONS`).
   - **Push:** receive a booking notification with the app in the foreground, background and killed; tapping it opens the right screen (deep link); the badge count updates.
   - **Dialing:** "Call" buttons on booking/queue/delivery cards open the dialer (Android 11+ `<queries>`).
   - **Camera/QR:** scan a claim-pass QR; deny the camera permission and see a helpful message.
   - **Photos:** upload from gallery and camera; a large photo gets compressed or rejected with a message.
   - **Maps:** location on and off, pan and zoom, tap a pin, recenter.
   - **Live location sharing** (My People) per D2: start, stop, auto-expiry.
   - **Delivery runs:** if D2 defers them, confirm they're hidden; if they ship, background location behaves as declared.
   - **Lifecycle:** background for 10 minutes, then resume (session kept, data refreshes); Android back button on every major screen; screen rotation if not locked.
   - **Network:** airplane mode shows error states and retry; a slow-3G profile still loads, with skeletons; a request times out gracefully.
   - **Keyboard:** inputs aren't hidden behind the keyboard on booking, chat and ask compose.
   - **OTA update:** covered by the P14 drill; only confirm here that the installed app reports its bundle version in settings/about, if shown.
   - **Accessibility:**
     - TalkBack reads every button on the top 15 screens with a meaningful label;
     - font scale 130% causes no clipped text or overlapping buttons;
     - touch targets are ≥44 dp;
     - contrast is AA on text.
   - **Web:** keyboard-only navigation of sign-in, search and booking; visible focus; PWA install and offline shell.

### 13.B — Run (owner / testers)
4. Install the staging build on at least **two** device classes from the matrix. Walk the checklist and record PASS/FAIL per row in `docs/qa/results/<date>_<device>.md`. For each FAIL, attach a screenshot or screen recording and the exact steps.
5. Run the web sections on the listed browsers.

### 13.C — Triage and fix (agent)
6. For each FAIL, add a ledger row `QA-###` with severity (P0 blocks a flow or loses data; P1 major; P2 minor; P3 cosmetic), steps, device and OS.
7. Fix through the **P09 loop**: test first where possible, otherwise document the manual check. Rebuild the staging APK. The owner re-tests just the failed rows and records the results.
8. Repeat until the Definition of Done holds.

## Verification
| Artefact | Expected |
|---|---|
| `docs/qa/results/*` | Every checklist row PASS on ≥2 Android device classes and on each listed browser |
| `node scripts/gaps/ledger-summary.mjs` | 0 `OPEN` `QA-` rows at P0/P1 |
| Production build config diff (step 2) | Unchanged without `CAP_ENV` |
| `npm run verify`, `npm run e2e` | exit 0 |

## Definition of Done
- [ ] Device matrix and checklist committed.
- [ ] The staging build variant exists and production config is proven unchanged.
- [ ] All rows pass on ≥2 Android device classes and all listed browsers (results committed).
- [ ] 0 open P0/P1 QA findings; P2/P3 fixed or deferred with a decision id.

## Stop and ask if
- A native issue needs a new permission, a plugin, or an Android manifest change beyond fixing a declared behaviour.
- Push can't be tested on staging (no staging FCM project). Agree on a production-safe test with the owner.

## Checker checklist
- Confirm results files exist for ≥2 devices, with dates and tester names.
- Re-test 5 random previously-failed rows on one device (owner) or review their recordings.
- Verify the production `capacitor.config.json` is identical to `origin/main`'s.
