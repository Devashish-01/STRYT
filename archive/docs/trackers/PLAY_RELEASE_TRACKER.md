# Play Store release — live tracker

**Goal:** STRYT live on Google Play. This is the only goal until it is done.
**Package:** `in.stryt.app` · **Production build:** 1.0.70 · **Started tracking:** 2026-09-25
**Source of truth for Console state:** the owner's screenshots. Everything else here was verified
against the repo or the live database.

> Update this file whenever a Console step changes. The repo cannot see the Play Console, so a stale
> tick here is worse than no tick — date every change.

---

## The thing that sets the timeline

Google requires a **closed test with at least 12 testers, opted in, running for at least 14 continuous
days**, before you can even *apply* for production access. This is the gate, not the paperwork.

As of 2026-09-25: **0 testers opted in, 0 days elapsed.**

So the earliest possible production date is **14 days after the closed test starts with 12 testers
already in it** — and then Google's review on top. Nothing in the app or the repo shortens this. Every
day the closed test has not started is a day added to the launch date.

**Practical consequence:** recruiting 12 testers is on the critical path and nothing else is. It should
start before the remaining engineering work, not after.

---

## Status — 2026-10-24 (delivery ships in this release; everything the repo, database and CI can do is done)

The owner-only list is in [`../launch/OWNER_REMAINING_STEPS.md`](../launch/OWNER_REMAINING_STEPS.md). Done since the last check:

| Item | State |
|---|---|
| Delivery in this release | **Decided 2026-10-24: delivery ships.** `VITE_DELIVERY_AGENT_ENABLED=true` in both Android workflows; the delivery flow was rebuilt (GAPS #34–#37). |
| Capacitor | **Done:** 8.4.3 (critical advisory GHSA-rvm3-566m-v7fv closed; `npm audit` no longer lists a critical). A debug build against it compiled. The remaining audit items are in code the app does not run (Firestore/gRPC server code pulled in by the Firebase auth plugin; React Router server-side rendering) and their fixes are breaking downgrades — accepted. |
| Target SDK | 36 / compile 36 — meets the current Play target-API requirement. |
| Battery-optimisation permission | **Changed:** `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` is deliberately **not** declared (restricted by Play, delivery is not on its allowlist). Riders are sent to the system's battery settings page (`openBatterySettings`, no permission). |
| In-app delivery disclosure | **Corrected** to say the shop sees the rider's location and the customer gets an arrival time (customers never see a location). |
| Privacy policy / retention | **Updated** for delivery (privacy §3.12, §4, §5.2, §8.1; retention table). Still has placeholders pending the registered address in `legal/operator.yaml`. |
| Play documents | **Rewritten for delivery:** background-location declaration (two uses), demo-video script (two parts), App access (phone + fixed codes), Data safety text (no new data types), store-listing text, quick-copy answers. |
| Review accounts | Customer 9222222222, shop owner 9111111111 (owns Sharma General Store), delivery partner 9333333333 (delivery role) exist and are onboarded; the customer has the owner as its My People contact. |
| Account-deletion purge | `purge-deleted-accounts` ACTIVE v8 in production; daily workflow green. |
| `stryt.in` | **Still 429** on every URL: Vercel serves a bot challenge (`X-Vercel-Mitigated: challenge`). Owner step. |
| Database security advisor | No new findings from the delivery work. Known/accepted: `spatial_ref_sys` (owned by supabase_admin, GAPS #31), intentionally policy-less attempt-log tables, PostGIS/pg_net in `public`, public RPCs the app calls, Leaked Password Protection (dashboard setting). |

## Status check — 2026-10-21 (verified from the repo and the public internet; Console state is still unknown to me)

| Check | Result |
|---|---|
| `main` HEAD | **Updated 2026-10-22:** the working-tree backlog is now committed and pushed — `3a824b1` (phone sign-in, delivery work through migration 20261004, business console Home + quick dial, location-loading fix, offline rider queue) and `3b898d2` (lighter 4-step onboarding). The Android APK and OTA workflows built from them and succeeded; a Play AAB built from `main` now includes this code. (Earlier note, 2026-10-21: HEAD was `e556e01`, 1.0.70, with 204 uncommitted paths.) |
| Capacitor | still `^8.4.1` — the critical advisory needs ≥ 8.4.3 (new native build) |
| `https://stryt.in/`, `/legal/privacy-policy`, `/legal/account-deletion` | **all 429** to a plain GET with an Android UA (2026-10-21). Play's crawler would likely fail the privacy-policy check. Not verified as Play's own crawler — verify in an incognito browser after exempting `/legal/*`. |
| `npm run verify` | green on the working tree (lint, tsc, eslint 0 warnings, 84 test files, build) |
| Database | migrations through `20261004` applied in production (`20261004` applied 2026-10-22 by the owner in the SQL editor, APPLY_LOG row 67, after *Save terms* failed on the missing `delivery_proof_allowed` column with the delivery flag on; checked read-only, not yet exercised end to end). **`20261005_delivery_order_lifecycle` applied 2026-10-22 (row 69)** — fixes delivery orders vanishing after "Mark packed" (GAPS #34); behaviour test passed against production in a rolled-back transaction; its app half is uncommitted. Earlier note: until then it was "written, not applied, delivery is off in Play builds so the app does not depend on it" — true for Play, false for the web build once the flag is on. |
| Delivery agent flow | **Changed 2026-10-22 at the owner's request: also switched ON in the Android builds** — `VITE_DELIVERY_AGENT_ENABLED=true` added to the `.env` step of both `android-release.yml` and `ota-release.yml` (takes effect when pushed to `main`: the OTA reaches every installed app, so closed testers get delivery too). The manifest already declares `ACCESS_BACKGROUND_LOCATION` and the foreground-service location permissions; the Play Console background-location declaration must cover delivery runs (see the checklist item) before this goes to production review. To switch it off again, delete that line in both workflows. Earlier decision (D19) was "off in Play builds until after the closed test". **2026-10-22:** the owner is adding `VITE_DELIVERY_AGENT_ENABLED=true` to the Vercel *Production* env (web only) to test it by logging in; Play/OTA builds do not read Vercel's env. Test fixtures to remove afterwards: Firebase test numbers `+91 9111111111` / `9222222222` / `9333333333` (OTP 111111 / 222222 / 333333; owner / customer / rider), the three accounts they create in production, shop `b_deliverytest00000000000000000001` ("TEST Delivery Kirana") with its items and rider access. The Vercel variable can stay off or be deleted if delivery should go dark again. |
| Onboarding UI (2026-10-22) | First-run flow rebuilt on a white surface with `.onb-*` styles (old `.ob-*` removed); the identity step no longer shows the empty Google-email field and shows a known phone as a row with "Change". hi/mr strings for the new keys are unreviewed by a native speaker. Live on web and in the Android OTA. |
| **Web phone OTP root cause (2026-10-21)** | Browser sign-in failed at the SMS send step with `auth/invalid-app-credential` (3 failures in `events`, `provider` field now recorded). The web build was using the **Android** API key + Android app id from `google-services.json`; a **Web app** ("STRYT", `1:44008185482:web:e6fd867d0cdd1be0251773`, own key) already existed in Firebase `zetax-52843` and was unused. Reading Identity Toolkit's public config showed reCAPTCHA Enterprise **off** for phone (not the cause). Switched: local `.env` (gitignored), GitHub secrets `VITE_FIREBASE_API_KEY` / `VITE_FIREBASE_APP_ID`, Vercel production env (same two, type config — Firebase web keys are public). **Not yet confirmed working** — needs a real code received on the dev server; Vercel takes effect on the next production deploy. Web key is currently unrestricted. Firebase authorised domains still lack `www.stryt.in`. |
| **TEMPORARY test fixtures (remove after the real-SMS test)** | (1) Vercel preview `https://stryt-otp-test.vercel.app` (deployment `stryt-56hscnd1y-devashish-01s-projects.vercel.app`, production env, NOT production) — remove with `vercel remove stryt-56hscnd1y-devashish-01s-projects.vercel.app` + `vercel alias rm stryt-otp-test.vercel.app`. (2) `https://stryt-otp-test.vercel.app` in `ALLOWED_ORIGINS` of `firebase-phone-auth` (deployed v5; also in repo `index.ts`, marked TEMPORARY) — delete the line and redeploy. (3) Firebase authorised domain `stryt-otp-test.vercel.app` (console) — delete. (4) Local dev-only test number: `.env.development.local` (`VITE_FIREBASE_TEST_PHONES`, gitignored, never in a production bundle — verified 0 occurrences). |
| **OTP backend — PROVEN 2026-10-22** | With a Firebase test number (`+91 99999 99999` / `123456`, set up in the Firebase console) the whole chain works against production: Firebase verify → `firebase-phone-auth` v4 → real session → refresh token works → a second login does not sign the first session out (8/8 checks; throwaway account deleted afterwards). Three bugs found and fixed on the way: (1) `FIREBASE_PROJECT_ID` secret had stray characters → `unexpected "iss" claim` (secret re-entered; function now also trims it); (2) temp password was 75 chars, GoTrue max 72 → every login 500; (3) the "dead password rotation" after sign-in revoked the session it had just minted (`session_not_found`) — replaced by one fixed per-account password derived with HMAC from the service key (`lib.ts: derivedPassword`), never rotated per login. Supabase Send-SMS + Before-User-Created hooks enabled (probe returns 403 "SMS … sent by Firebase"). **Still unproven: real SMS delivery** — web on `localhost`/headless hits Google's reCAPTCHA puzzle or the upstream bug; needs the Android debug APK on a real phone (Firebase debug SHA-256 added by owner). |
| **OTP status, end of 2026-10-21 (superseded above)** | Web on `localhost` still fails: Identity Toolkit returns plain `INVALID_APP_CREDENTIAL` even with the web key — matches the open upstream bug [firebase-js-sdk#8387](https://github.com/firebase/firebase-js-sdk/issues/8387) (real numbers fail from `localhost`; test numbers and deployed domains work). **Real OTP never verified yet.** Debug APK built (`android/app/build/outputs/apk/debug/app-debug.apk`, debug SHA-1 `5C:27:FD:18:…:1B:77` IS registered in Firebase; its SHA-256 `03:5E:3D:1D:F8:08:F7:99:29:F8:68:FF:F1:54:A5:6C:B0:8B:AB:6B:49:26:B4:D1:21:46:F1:CC:A5:8B:1F:CC` could not be added — tool call denied; add it in Firebase → Project settings → `in.stryt.app`). The `SUPABASE_PERSONAL_ACCESS_TOKEN` in `.env` returns 401 (expired/revoked), so the two Supabase auth hooks are still not enabled (Twilio send path still open). |
| Testers opted in / days elapsed | unknown — last recorded 0 / 0 (2026-09-25) |
| **Phone OTP, production (2026-10-21)** | `firebase-phone-auth` v1 ACTIVE: no token → `400 missing_token`, bad token → `401 invalid_token` (fails closed). DB bridge functions + SMS/user-created hooks exist. Email provider off, Google + Phone on. **Telemetry: 0 `otp_sent`, 0 `otp_verified`, 1 `otp_failed` (2026-10-20 13:24 UTC); no function calls in the last 24 h — the positive path has never run on production.** App's Firebase project (`zetax-52843`) matches the function's expected id; `skipNativeAuth: false`. **Open: Supabase still sends SMS itself** — `POST /auth/v1/otp` reaches Twilio (`sms_provider: twilio`; the `hook_send_sms_blocked` hook is not active). Firebase console not inspectable from the repo (Phone provider, India region policy, authorized domains, Play App Signing SHA). OTP client code is uncommitted, so no Play/OTA build contains it yet. |

**Order to unblock the closed test:** review + commit the working tree → upgrade Capacitor → CI builds the AAB → fix `/legal` 429 →
Play App Signing SHA-1/256 into Firebase → keystore rotation → store listing → create the closed-test release → add testers.

---

## 1. App setup — 10 of 11 done

| | Item | State |
|---|---|---|
| ✅ | Privacy policy | done |
| ✅ | Sign-in details (App Access) | done |
| ✅ | Ads | done |
| ✅ | Content rating (IARC) | done |
| ✅ | Target audience | done |
| ✅ | Data safety | done |
| ✅ | Government apps | done |
| ✅ | Financial features | done |
| ✅ | Health | done |
| ✅ | App category + contact details | done |
| ⬜ | **Store listing** | **the last one — blocks closed testing** |

### Store listing — what to paste

| Field | Value |
|---|---|
| App name | `STRYT` (5/30) |
| Short description | from `playstore-assets/metadata/APP_TITLE_AND_DESCRIPTIONS_EN.txt` — **79/80, do not edit in the box** |
| Full description | same file — 2,792/4,000. **Use the current version**, which fixed the "My People" section (see below) |
| App icon | `playstore-assets/graphics/icon-512.png` — 512×512 ✓ |
| Feature graphic | `playstore-assets/graphics/feature-graphic-1024x500.png` — 1024×500 ✓ |
| Phone screenshots | `playstore-assets/graphics/screenshots/` ×4 — 1080×1920, 9:16 ✓ |
| Video / tablet / desktop / XR | optional — skip |

Do **not** upload the Hindi or Marathi listings yet. `LANGUAGES_ENABLED` is `false`, so the in-app
language switcher is hidden; a Hindi listing leading to a half-English app reads worse than English only.

---

## 2. Blockers — not in the Console, but must be done before shipping

| | Item | Why it matters |
|---|---|---|
| 🔴 | **Disable the legacy `service_role` key** | A working one is in git history (`efd5031`), confirmed active in August. It bypasses RLS entirely — every table, and the KYC documents. Legacy `anon` is already disabled and the publishable key is live, so this is the last one. **Order:** create a secret key → swap `SUPABASE_SERVICE_ROLE_KEY` in GitHub Actions → push once and confirm OTA is green → *then* disable the legacy key. Testing after disabling breaks the pipeline. |
| 🔴 | **`/legal/*` returns 429** | Verified 2026-09-25 and again 2026-10-24 (cause: Vercel bot challenge, `X-Vercel-Mitigated: challenge`), including with an Android browser User-Agent. Play's crawler checks the privacy policy URL itself; a 429 fails submission on "Privacy policy not accessible". Vercel → Settings → Deployment Protection → exempt the legal routes, then confirm in an incognito browser. |
| 🟡 | Keystore password rotation | `docs/launch/KEYSTORE_ROTATION.md` — three GitHub secrets |
| 🟡 | Leaked Password Protection | Supabase → Auth → enable. Still flagged by the security advisor |

---

## 3. Before the first closed-test upload

| | Item |
|---|---|
| ⬜ | **Fresh signup on a real device.** The four-step onboarding with the required phone field has never been run by an actual new user. Gates were verified on production and the whole flow on staging, but nobody has walked it on a phone. This is the highest-value single test. |
| ⬜ | Device pass — `docs/play_submission_checklist_report.md` §5. **Skip the delivery steps**, that flag is off |
| ⬜ | Pull the 1.0.70 AAB from the Android workflow artifact. Newest local is 1.0.68 |
| ⬜ | Verify where the **background-location declaration** lives. It is not in the 11-item setup list, so it likely appears at release time under sensitive permissions. Answers and the demo-video script are ready in `playstore-assets/policy-and-declarations/` |

---

## 4. Closed testing

| | Item | State |
|---|---|---|
| ⬜ | Publish a closed testing release | blocked on the store listing |
| ⬜ | **12 testers opted in** | **0 as of 2026-09-25** |
| ⬜ | 14 continuous days with 12 testers | not started |
| ⬜ | Apply for production | locked until the above |

"Opted in" means each tester accepted the invite and installed — not that they were emailed. Budget for
drop-off: invite more than 12.

---

## 5. Deliberately not doing

| Item | Why |
|---|---|
| ~~Delivery agent flow~~ | **Reversed 2026-10-24: delivery ships in this release** (see the status section above). The second background-location declaration, demo video and test accounts are prepared. |
| **Font scale rework** | Was done, then lost to an uncommitted reset. Body text is 13px where iOS uses 17. Real, but the app has shipped at these sizes; a rejection over launch timing costs more than small text. Do it after approval. |
| **Hindi / Marathi listings** | See store listing above. |
| **Admin dashboard for `marketplace_health()`** | 4 requests in 30 days — a screen for a number that moves weekly is not worth building yet. Read it from the database on demand. |

---

## 6. Known open issues that do not block launch

- **GAPS_LOG #31** — `anon` holds full DML on `public.spatial_ref_sys`. Cannot be fixed from our side
  (`supabase_admin` owns it). No user data; STRYT uses no `ST_Transform`, so wiping it does not break
  discovery. Documented, accepted for now.
- **GAPS_LOG #33** — the type-scale work, lost. See above.
- **25% answer rate** — 4 requests, 1 answered, 1 active seller in 30 days. Not a launch blocker, but it
  is the number that decides whether launching is worth anything. Supply, not software.
