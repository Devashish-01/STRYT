# Play Store — remaining action items (code-level review)

**Date:** 2026-10-18 · **App:** STRYT `in.stryt.app` · **HEAD:** `e556e01` (1.0.70, last commit 2026-09-20)
**Method:** read the auth/phone-OTP path end to end, the Android project, CI workflows, Capacitor config, legal/policy docs and
Play declarations; ran `npm run lint`, `tsc`, the full test suite (63 files / 940 tests, all pass), `eslint . --max-warnings 0`
(clean), `npm run build` (passes, generates the static privacy policy), `npm audit`, and the Supabase security advisors on
production (`gnswxlfmcwyhmzlfipql`). Companion plan: [PHONE_AUTH_HARDENING_PLAN.md](../plans/PHONE_AUTH_HARDENING_PLAN.md).

**Not verified (cannot be from the repo):** Play Console state, anything on a physical device, Firebase/Supabase dashboard
settings (secrets, Auth providers), the Deno runtime of the new edge function (only its pure helpers are unit-tested).

---

## 0. Verdict

The app builds, lints and tests clean. Nothing in the *code* is a hard blocker by itself. What stands between today and an
uploaded closed-test build is **release plumbing and declarations**, plus one **unfinished feature (phone sign-in) whose backend
has never been deployed**:

1. **Nothing has been committed since 2026-09-20.** The working tree holds phone sign-in, the static privacy-policy page, the
   `/legal` rewrite + CSP change, the native Firebase config and the new home wordmark. CI builds from `main`, so none of it
   is in 1.0.70.
2. **`firebase-phone-auth` is not deployed** — not on production, not on staging (verified via MCP, 2026-10-18). Today a phone
   login from the working-tree app would 404.
3. **Policy documents contradict the app** once phone sign-in ships (see P0-4).
4. **The 12-tester × 14-day closed test has not started** (per tracker, last updated 2026-09-25 — treat as stale).

---

## 1. What was implemented in this pass (working tree, uncommitted, not deployed)

| Area | Change | Verified by |
|---|---|---|
| Identity (G1/G5/G7) | Edge function resolves the user by `auth.users.phone` through `auth_user_id_by_phone()`; it never reads `public.users.phone`; `listUsers()` removed | SQL test on staging (rolled back), unit tests |
| Abuse (G2/G3/G6) | Per-IP (30/10 min) and per-phone (10/10 min) limits; token must be `sign_in_provider=phone`, ≤5 min old, `+91[6-9]…`; `FIREBASE_PROJECT_ID` now required (no hardcoded fallback) | unit tests (13) |
| Race (G4) | Per-user lease around the password-rotation session mint; dead-password rotation in `finally`; session user id asserted | SQL test on staging |
| Migration | `20260998_phone_auth_bridge.sql` + rollback; lint passes; all new functions `service_role` only | `lint-migrations`, staging dry run |
| Client UX (G8/G9) | auto-submit on 6th digit; 5-wrong-code cap; reload-proof resend cooldown + 5 sends/session cap; stranded code screen redirects to phone entry; translated error messages (en/hi/mr) — raw Firebase/edge text is never shown | unit tests (11), i18n parity tests |
| Android | handles instant verification / SMS auto-retrieval (previously "Send code" could hang forever); resend uses `resendCode`; Firebase session dropped after the bridge; **native Firebase sign-out on logout** (was missing — old Google account would have been reused by the picker) | typecheck, eslint — **needs a device test** |
| Web | phone sessions no longer flagged as "Google bridge" (would have made silent-refresh try to re-bridge a phone token as Google) | review |
| Profile | `ensureProfile` no longer seeds the phone/email as display name (matches migration 20260876) | review |
| Client fix | edge-function HTTP errors are now read from the response body (supabase-js hides them behind "non-2xx") | review |

Not done on purpose: App Check (monitor-first, decision D3), OTP funnel events (needs a migration to the `events` name whitelist),
moving `client_secret_*.json` out of git (needs a `git rm --cached`, i.e. an index change you should approve).

---

## 1b. Update — auth surface reduced to Firebase phone OTP + Google (2026-10-18, evening)

Done in the working tree: removed email-OTP, email sign-up, the email branch of the code screen, the legacy `refresh()` and the
email return-URL helper (staff email+password on `/admin/login` stays — 7 live accounts depend on it). Privacy policy
(`legal/privacy-policy.md` §3.1, §8.2), both Data Safety docs and the old MessageCentral plan now match the app (**P0-4 done in
text; `LEGAL_VERSION` deliberately NOT bumped** — the onboarding RPC hardcodes `'2026-08-26'`, so a bump needs a new migration
first). Old APKs that still have `skipNativeAuth: true` now get a clear "update the app or use Google" message instead of a
generic failure (**P1-3 handled in code**). OTP funnel events (`otp_sent` / `otp_verified` / `otp_failed`) added to the client;
migration `20260999` applied to staging, **not** to production (blocked) — until it is, the events are dropped silently.

### Only you can do these (everything else is done)

1. **Supabase prod → Auth → Providers → Phone: remove the Twilio credentials / SMS provider.** Verified live: a direct call to
   `/auth/v1/otp` still reaches Twilio. Keep the Phone provider *enabled*.
2. **Apply `supabase/migrations/20260999_otp_funnel_events.sql` to production** (or add a permission rule for the MCP).
3. **Supabase prod → Auth → Providers → Email:** turn off "Allow new users to sign up" (keep the provider on for staff
   password login). Customers never use email, and open email sign-up is an abuse surface.
4. **Firebase console → Authentication → Settings → Authorized domains:** `stryt.in`, `www.stryt.in` present; remove `localhost`
   and any stale preview domains from the production project.
5. **Firebase console → Project settings → Android app `in.stryt.app`:** add the **Play App Signing SHA-1 + SHA-256** (Play Console →
   Setup → App signing) plus upload-key and debug fingerprints. Without these Google and phone sign-in fail on Play-installed builds.
6. **Google Cloud → Billing → Budgets & alerts** (50/80/100%) — on Blaze there is no spending cap.
7. **Google Cloud → APIs & Services → Credentials:** restrict the Firebase **web API key** to HTTP referrers (`stryt.in/*`) and the
   Android key to package `in.stryt.app` + SHA-1; restrict both to Identity Toolkit / Firebase APIs. (Firebase web keys are not
   secret, but unrestricted keys can be abused for SMS and quota.)
8. **Commit and release** (I did not commit): the reviewed working tree → CI builds the AAB. Native config changed
   (`skipNativeAuth: false`), so this needs a **new AAB**, not just OTA; publish the OTA only after the new build is out.
9. **Upgrade Capacitor to ≥ 8.4.3** (critical advisory) and rebuild; **real-SIM test**: Google login, phone login (incl. Android
   auto-verify, wrong code, resend, reload), logout→login, account deletion.
10. Remaining store/console items: P0-6…P0-10, P1-1, P1-2, P1-4…P1-7 below.

## 2. P0 — must be done before uploading the closed-test build

| # | Item | Why / how |
|---|---|---|
| P0-1 | **Commit and push the working tree** (after reviewing it) | Without it the Play AAB has no phone sign-in, no static privacy page, old Firebase native config. I did not commit (standing rule). Split into logical commits; `main` = release, so confirm the target first. |
| P0-2 | **Deploy phone-auth backend, in this order** | (a) Supabase → Edge Functions → Secrets: set `FIREBASE_PROJECT_ID=zetax-52843` (the function now refuses to run without it). (b) Supabase Dashboard → Auth → Providers → **Phone must be enabled** — the session mint uses `signInWithPassword({phone})`; if it is off, every phone login fails with "Phone logins are disabled". (c) apply `20260998` then deploy `firebase-phone-auth` to **staging first** (`laswruzdyqehziyupmdm`), run one real login with a real SIM, then prod. Owner runs prod deploys (classifier blocks them for me). (d) After applying: record in `supabase/APPLY_LOG.md`, take a snapshot. |
| P0-3 | **Upgrade Capacitor ≥ 8.4.3** | `npm audit`: **critical** GHSA-rvm3-566m-v7fv (remote content loadable at the app origin via the internal HTTP proxy path) affects `@capacitor/android`/`ios` `>=8.3.5 <8.4.3`; installed is **8.4.1**. `npm i @capacitor/core@latest @capacitor/android@latest @capacitor/cli@latest @capacitor/ios@latest`, `npx cap sync android`, rebuild, smoke-test. A native dependency change → needs a new AAB, not OTA. |
| P0-4 | ✅ *text updated 2026-10-18 (see §1b)* **Fix the legal/declaration text for phone sign-in** | `legal/privacy-policy.md:35` says "Google Sign-In is currently the only way to sign in … a phone number is optional". `DATA_SAFETY.md:70` lists phone as **Optional**. After this release phone is a sign-in route (SMS via Firebase/Google) and the onboarding RPC **requires** it (20260997). Misdeclared Data Safety is a rejection/suspension risk. Update both, then decide whether to bump `LEGAL_VERSION` (`src/lib/legal.ts:12`, currently `2026-08-26`) — bumping forces every user to re-accept terms. |
| P0-5 | **Register the Play App Signing SHA-1 and SHA-256 in Firebase** | Firebase → Project settings → Android app `in.stryt.app`. Play re-signs the AAB, so the key your local/CI builds use is *not* what Play-installed devices present. If only the upload key is registered, **both Google sign-in and phone auth (Play Integrity) fail for Play-installed users** while working fine in your own APK. Also register the debug/upload keys. Get the Play key from Play Console → Setup → App signing. |
| P0-6 | **`/legal/*` must return 200 to Play's crawler** | Tracker (2026-09-25) recorded a 429. The working tree adds a static `/legal/privacy-policy.html` + rewrite (`vercel.json`), but it is uncommitted. After deploy: open `https://stryt.in/legal/privacy-policy` and `/legal/account-deletion` in an incognito window and with an Android UA; Vercel → Deployment Protection must not cover them. |
| P0-7 | **Legacy `service_role` key** | Tracker 🔴: a working key is in git history (`efd5031`). Order: create secret key → swap `SUPABASE_SERVICE_ROLE_KEY` in GitHub Actions → confirm OTA green → disable legacy key. |
| P0-8 | **Keystore password rotation** | `docs/launch/KEYSTORE_ROTATION.md` (three GitHub secrets). Do before the first Play upload — the upload key can't be changed casually afterwards. |
| P0-9 | **Store listing** (the last of 11 App-content items) | Texts and graphics are in `playstore-assets/`; `APP_TITLE_AND_DESCRIPTIONS_EN.txt` is modified in the tree — confirm the 79/80 and 2,792/4,000 character counts still hold before pasting. |
| P0-10 | **Pull the AAB from the Android workflow artifact** | Newest local is 1.0.68. The workflow sets `versionCode = run_number`; fine for a first upload, but never mix local and CI uploads (Play rejects reused or lower codes). |
| P0-11 | **Fresh-signup test on a real phone** | Never been walked by a new user (tracker §3). Do it twice: Google and phone OTP with a real SIM. Include: instant-verification case, wrong code, resend, airplane mode, reload mid-flow, logout then re-login (checks the native sign-out fix), account deletion. |

## 3. P1 — before the closed test is *counted* / before production

| # | Item | Note |
|---|---|---|
| P1-1 | **Recruit and keep 12 opted-in testers for 14 continuous days** | The real gate. Invite 15–20 for drop-off. Every day of delay moves the launch date. |
| P1-2 | **Budget alerts on the billing account** | You said "later". On Blaze there is no spending cap and the SMS endpoint is public; alerts only notify. Do this before inviting testers. Region allow-list (done) and quota are the real brakes. |
| P1-3 | ✅ *handled in code 2026-10-18 (see §1b); still publish the OTA after the new build* **Sideloaded APK + OTA mismatch** | `capacitor.config.ts` changed `skipNativeAuth` true→false. That is a *native* setting, not OTA-able. Old APKs that receive the new JS via OTA can send the SMS but cannot complete phone login (`getIdToken` returns nothing). Google sign-in is unaffected. Gate the phone option on a minimum native `versionCode`, or publish the OTA only after the new AAB/APK is out. |
| P1-4 | **Background-location declaration + demo video** | Docs and script are ready in `playstore-assets/policy-and-declarations/`. In-app disclosure exists (`BackgroundLocationDisclosure.tsx`). Find where Console asks (sensitive permissions at release time). |
| P1-5 | **App Access credentials** | Reviewers use a Google test account (`APP_ACCESS.md`): 2-Step Verification off, signed in once on a real device beforehand so Google does not challenge a new device. Phone OTP needs no reviewer credential. |
| P1-6 | **Leaked-password protection** (Supabase Auth) | Still flagged by the advisor. 7 email+password accounts exist. Plan-dependent; enable if the plan allows. |
| P1-7 | **Update the tracker** | `docs/trackers/PLAY_RELEASE_TRACKER.md` is dated 2026-09-25 — "0 testers, 0 days" may be stale; the repo cannot see Console. |

## 4. P2 — known, non-blocking

- **Production database is in Tokyo (`ap-northeast-1`)**; a Mumbai project (`STRYT`, `ap-south-1`) exists and is currently the staging
  environment. Latency for Indian users and DPDP data-residency posture; see `docs/plans/SERVER_LOCATION_MUMBAI.md`.
- **`npm audit`**: after the Capacitor fix, remaining highs are `firebase`/`@grpc/grpc-js` via `@capacitor-firebase/authentication`
  (Firestore is unused in STRYT — low real exposure; the "fix" is a major downgrade, don't take it) and `react-router` (moderate,
  open-redirect via backslash — upgrade to 7.18.x on its own release).
- **R8/ProGuard off** (`minifyEnabled false`) — larger APK, easier to reverse. Not required; enable and regression-test later.
- **948 hardcoded user-facing strings** (limit 970 in CI); Hindi/Marathi listings and switcher stay off (`LANGUAGES_ENABLED=false`).
- **Tracked-but-gitignored files:** `android/app/google-services.json` and `android/app/client_secret_44008185…json`
  (inspected: the latter contains only the client id — no secret). Hygiene fix: `git rm --cached` both.
- **Supabase advisors (prod):** `rls_disabled_in_public` ERROR is the known `spatial_ref_sys` (GAPS_LOG #31, not fixable by us);
  the `*_security_definer_function_executable` warnings are covered by `docs/security/SECDEF_AUDIT.md`.
- **Phone-auth observability:** edge function logs structured `phone_bridge` lines; no alert is wired and OTP funnel events are not
  collected yet. Add a log alert on `internal_error`/`rate_limited` spikes after launch.
- **App Check** (monitor-first), then enforce after the Play gate.
- **Contact phone vs verified phone:** onboarding's phone stays unverified contact info (owner decision 2026-09-20). Production already
  shows 3 profiles whose contact phone differs from their own verified `auth.users.phone` (the auth trigger stores digits without `+`).
  Cosmetic, but don't ever display `users.phone` as "verified".

## 5. Production data check done for this review (read-only)

| Check | Result |
|---|---|
| Profiles / auth users | 36 profiles, 97 auth users |
| Profiles with a phone | 15 |
| Duplicate contact phones | 0 |
| Profile phone matching **another** account's verified phone (G1 victims) | **0** |
| Auth users with both email and phone | 0 |
| Email+password accounts (could be hit by password rotation if they ever phone-login) | 7, none of them phone users |
| `firebase-phone-auth` deployed | **No** (production or staging) |
| Index on `users.phone` | none (intentionally not added) |

## 5b. Phone-auth deployment status (updated 2026-10-18, later the same day)

| Step | Staging `laswruzdyqehziyupmdm` | Production `gnswxlfmcwyhmzlfipql` |
|---|---|---|
| Migration `20260998` | **applied** (via MCP, name `20260998_phone_auth_bridge`) | **applied 2026-10-18** — 2 tables + 4 functions present, only `service_role` can execute, `public.users` count unchanged (36) |
| `firebase-phone-auth` function | **deployed v1**, `verify_jwt=false` | **deployed v1 2026-10-18**, `verify_jwt=false` |
| `FIREBASE_PROJECT_ID` secret | **not set** — owner must add it | **set** (owner) — boot log `has_project_id: true` |
| Supabase Auth → Phone provider | enabled (public `/auth/v1/settings`) | enabled |
| Runtime credentials (boot log) | URL ✅ secret key ✅ publishable key ✅ — only project id missing | URL ✅ secret key ✅ publishable key ✅ project id ✅ |
| Behaviour | with secret missing fails closed: `500 server_config` (verified) | no token → `400 missing_token`; bad token → `401 invalid_token`; GET → `405`; rate-limit rows written (2 `ip` rows); no leases left over |
| Still unverified | positive path (real Firebase token → session) | **needs one real-SIM login** — the only untested part |

**Owner actions, in order (about 10 minutes):**
1. Supabase → each project → Edge Functions → Secrets: add `FIREBASE_PROJECT_ID` = `zetax-52843` (staging first).
2. Re-test staging: `POST` with `{"idToken":"abc.def.ghi"}` should now return `401 invalid_token` (not `server_config`).
3. Production: apply `supabase/migrations/20260998_phone_auth_bridge.sql`, deploy `supabase/functions/firebase-phone-auth/` (both
   `index.ts` and `lib.ts`, `verify_jwt=false`) — or add a narrow permission rule for the MCP calls so I can do it.
4. **Twilio (new finding):** both projects report `sms_provider: twilio` with the Phone provider enabled. That lets anyone holding the
   public key call Supabase's own `/auth/v1/otp` with any number and trigger a Twilio SMS — bypassing the Firebase region
   allow-list, the quota and every limit in this work. Phone must stay *enabled* (the bridge's session mint needs it), so instead:
   Supabase → Auth → Providers → Phone → **remove the Twilio credentials / SMS provider** (so Supabase cannot send any SMS), and
   check the Twilio console for unexpected sends. Firebase is the only SMS sender after that.
5. Real-SIM login test, then the rest of §6.

## 6. Pre-launch deploy runbook for phone auth (copy order)

1. Merge/commit the reviewed working tree.
2. Staging: set `FIREBASE_PROJECT_ID`; enable Auth → Phone; apply `20260998`; deploy `firebase-phone-auth`; real-SIM login; confirm a row appears in `auth_bridge_attempts` and `phone_login_lease` is empty afterwards.
3. Negative tests on staging: 31 rapid requests from one IP → 429; a Google ID token → 401 `wrong_provider`; a token older than 5 min → 401 `stale_token`.
4. Production: same secret + provider check, apply `20260998`, deploy function, smoke test, record in APPLY_LOG.
5. Build AAB from the merged commit; Capacitor ≥ 8.4.3; device-test (P0-11).
6. Only then publish the OTA (P1-3).

Rollback: redeploy the previous function (or delete it — clients then just show "couldn't verify"), then run
`supabase/rollbacks/20260998_phone_auth_bridge.rollback.sql`.
