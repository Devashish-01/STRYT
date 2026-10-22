# Phone auth hardening plan

**Status (2026-10-18):** Phases 1–4 and the unit/SQL tests are **implemented in the working tree, uncommitted and not deployed**. Phase 0 was run live (see [PLAY_STORE_ACTION_ITEMS_2026-10-18.md](../launch/PLAY_STORE_ACTION_ITEMS_2026-10-18.md) §5): `firebase-phone-auth` was never deployed, no G1 contamination in prod. Changes from this plan: no `phone_verified_at` column (users has table-level UPDATE grants, `auth.users.phone_confirmed_at` already records it); OTP funnel events deferred (needs an `events` whitelist migration); App Check and Phase 6 console/git items remain owner actions.
**Written:** 2026-10-18
**Scope:** the live phone-OTP flow (Firebase SMS → `firebase-phone-auth` edge function → Supabase session)
**Source:** code audit of `authService.ts`, `nativeAuth.ts`, `firebaseWeb.ts`, `PhoneEntry.tsx`, `OtpVerify.tsx`, `supabase/functions/firebase-phone-auth/index.ts`, migration `20260997`.
**Not verified live:** the Supabase MCP returned *Unauthorized* during the audit. Phase 0 closes that.

Related: [MESSAGECENTRAL_ONBOARDING_OTP_PLAN.md](MESSAGECENTRAL_ONBOARDING_OTP_PLAN.md) (written before Firebase phone auth shipped; see Decision D1).

---

## 0. How the flow works today

```
PhoneEntry ─ sendOtp ─▶ Firebase SMS (web: invisible reCAPTCHA · Android: Capacitor plugin)
OtpVerify  ─ verifyOtp ─▶ Firebase confirms code ─▶ Firebase ID token
           ─▶ POST /functions/v1/firebase-phone-auth {idToken}      (verify_jwt = false)
                 verify JWT vs Google JWKS ─▶ phone_number
                 resolve user BY public.users.phone ◀── gap 1
                 else admin.createUser ─▶ listUsers() (page 1 only) ◀── gap 5
                 set temp password ─▶ signInWithPassword ─▶ dead password ◀── gap 4
           ─▶ sb.auth.setSession ─▶ ensureProfile ─▶ Protected guard ─▶ /auth/onboard (new users)
```

Signup and login are the same path. "Signup" = first time the phone is seen; onboarding follows.

---

## 1. Gap register

| # | Gap | Sev | Phase |
|---|---|---|---|
| G1 | Edge function resolves identity by `public.users.phone`, which onboarding lets any client write unverified (`20260997`). Attacker can plant a victim's number → victim's phone login lands in the attacker's account; also squats the number. No unique index, `maybeSingle()` errors on duplicates. | Critical | 1 |
| G2 | No SMS-pumping / cost protection: region policy, App Check, per-phone/IP limits, budget alerts unconfirmed. Resend timer is client-only. | Critical | 3 |
| G3 | Edge function has no rate limiting and does several admin writes per unauthenticated call. | Critical | 3 |
| G4 | Session minted by rotating the user's password: races on concurrent logins, destroys any real password, relies on Supabase phone provider being enabled. | High | 2 |
| G5 | `admin.listUsers()` unpaginated → users past page 1 fail with "Unable to resolve user". | High | 1 |
| G6 | Token checks loose: no `sign_in_provider === "phone"`, no `auth_time` freshness, hardcoded fallback project id `zetax-52843`. | High | 3 |
| G7 | Accounts merge on an unverified phone (Google/email user whose profile phone matches). Same root cause as G1. | High | 1 |
| G8 | OTP UX: no auto-submit, no autofill, raw Firebase error text shown, no wrong-code counter. | Medium | 4 |
| G9 | Web `ConfirmationResult` is module state; reload mid-flow dead-ends with "request a new OTP". Cooldown resets on reload. | Medium | 4 |
| G10 | Android Play-signing / release SHA-256 fingerprints not confirmed in Firebase (Play Integrity). | Medium | 6 |
| G11 | No tests on the bridge, no alerting, no OTP funnel metrics. | Medium | 5 |
| G12 | `android/app/client_secret_44008185…json` is tracked in git despite `.gitignore`. Inspected: type `installed`, **contains no `client_secret`** — only client_id/project_id. Low risk, but it violates the repo's own rule. | Low | 6 |
| G13 | ~~Phone auth beyond free quota needs Blaze~~ — **resolved: owner confirmed Blaze is active (2026-10-18).** Remaining: project ownership is single-account. **Side effect: Blaze means SMS is billed per message, so G2/G3 are now direct-money risks, not just abuse risks.** | Low (billing) / raises G2 | 3, 6 |

---

## 2. Decisions needed from the owner

| ID | Decision | Recommendation |
|---|---|---|
| D1 | Keep Firebase for SMS, or switch to MessageCentral per the August plan? | **DECIDED 2026-10-18: Firebase Auth, Blaze plan active.** Reasoning kept: it is built and working; the August plan predates it and would redo ~Phase 1–2 work. Mark that plan *superseded/alternative*. Revisit only if Firebase India SMS cost or delivery is bad (Phase 5 metrics tell us). |
| D2 | How to mint the Supabase session (Phase 2) | Hardened password-grant with a lease lock (2A). Replace later only if a clean primitive appears. |
| D3 | App Check: enforce now or monitor-first? | **Monitor-first** until the 12-tester/14-day Play gate is done; enforcing can lock testers out. Flip to enforce after a clean week of metrics. |
| D4 | `users.phone` stays *unverified contact info* (the 2026-09-20 decision) | **Keep that decision.** This plan only stops the *identity* path reading it. No "verified" badge from `users.phone`; verified status comes from `auth.users.phone_confirmed_at`. |

---

## 3. Rules that apply (from memory / HANDOFF)

- Migration file ≠ applied. Verify live state through the MCP before and after; take a snapshot; write a rollback in `supabase/rollbacks/`. Next free number: **20260998**.
- `DROP FUNCTION` before widening a `RETURNS TABLE`; `REVOKE ... FROM anon` (and `public`) on every new function.
- `users.id` is `text` = `auth.uid()::text`.
- Production deploys and pushes are blocked for me by the classifier — **owner runs** edge-function deploys, migrations on prod, and OTA/push, or grants a narrow rule.
- Commit/push only when explicitly asked; confirm target (main = release to all users).
- Gemini edits this tree concurrently — re-check `git status` before each phase.
- i18n: grep `\[t,` before wiring strings in any file (the `t` shadow bug). New strings go in en/hi/mr.
- Colours as CSS vars only (`check-hardcoded-colors.js`).
- **Backward compatibility is mandatory.** Shipped clients (OTA 1.0.70, web) POST `{idToken}` and read `{ok, session, user, message}`. Every edge-function change must keep that contract; new fields are additive.
- Play gate: 12 testers × 14 days. Do not break sign-in mid-window. Server-side phases (1, 2, 3) deploy without an app release and are individually rollback-able.

---

## Phase 0 — Verify live state (½ day, read-only) — BLOCKER for 1–3

Needs a valid Supabase MCP token (re-auth the `supabase` MCP, or use the `claude.ai Supabase` connector). Run and record results in `supabase/APPLY_LOG.md`:

1. `list_edge_functions` → is `firebase-phone-auth` deployed, which version, `verify_jwt` actually false?
2. Duplicates / contamination:
   ```sql
   -- same contact phone on >1 profile
   select phone, count(*) from public.users where phone is not null group by 1 having count(*) > 1;
   -- profile phone that differs from the verified auth phone
   select u.id, u.phone as profile_phone, a.phone as auth_phone, a.phone_confirmed_at, a.email
   from public.users u join auth.users a on a.id::text = u.id
   where u.phone is not null and (a.phone is null or '+'||a.phone <> u.phone);
   -- profile phones that match ANOTHER account's verified auth phone (live G1 victims)
   select u.id, u.phone, a.id as auth_owner
   from public.users u join auth.users a on '+'||a.phone = u.phone and a.id::text <> u.id;
   ```
3. Users with a real password: `select count(*) from auth.users where encrypted_password is not null and encrypted_password <> '' and email is not null;` (feeds D2/G4 impact).
4. Indexes on `users.phone`; `get_advisors` (security) for the function/table.
5. Supabase Dashboard → Auth → Providers → Phone: enabled? SMS provider set? (If enabled with *no* provider, `signInWithOtp({phone})` from the anon key is an extra surface; disable direct client use if possible.)
6. Firebase console: SMS region policy, test phone numbers present?, App Check status, usage/quota, billing plan, registered SHA-1/SHA-256 list.

**Exit:** a written findings block. If query 2c returns rows → G1 is being exploited or probed; escalate Phase 1 to same-day.

---

## Phase 1 — Fix identity resolution (G1, G5, G7) — ~1 day

**Principle:** the only thing that proves a phone is a Firebase-verified token. Identity = `auth.users.phone`. `public.users.phone` is display/contact only and never read by the bridge.

### 1.1 Migration `20260998_auth_user_by_phone.sql`
- `public.auth_user_id_by_phone(p_phone text) returns text` — `security definer`, `set search_path = ''`, selects `id::text` from `auth.users` where `phone = ltrim(p_phone,'+')` (Supabase stores digits without `+` — confirm in Phase 0 sample row). `revoke all ... from public, anon, authenticated; grant execute to service_role`.
- No change to `public.users.phone` uniqueness (a unique index would hand attackers a way to block a victim's number at onboarding). Contact phone stays non-unique and unverified.
- Add `public.users.phone_verified_at timestamptz` (nullable), written only by the edge function (service role). Revoke `UPDATE (phone_verified_at)` from `authenticated` (column grant). Not used for auth decisions; lets UI show "verified" truthfully later.
- Data cleanup: **do not auto-delete.** For each row from Phase 0 query 2c, null the contaminated `users.phone` after owner review (list kept in APPLY_LOG).
- Rollback file + snapshot.

### 1.2 Edge function rewrite of resolution (`index.ts`)
1. After token verify → `phone` (E.164).
2. `const uid = await rpc('auth_user_id_by_phone', {p_phone: phone})`.
3. If none → `admin.createUser({phone, phone_confirm: true, user_metadata:{firebase_uid}})`. On `phone_exists` (race) → re-run the RPC (no `listUsers`). Delete the `listUsers` path entirely (G5).
4. **Never** read `public.users.phone`. Profile bootstrap: `upsert({id, phone, name:'New user', roles:['customer']}, {onConflict:'id', ignoreDuplicates:true})` — note name `'New user'`, not the phone (matches `20260876_stop_seeding_contact_as_name`; today's code seeds `name: phone`, a leftover).
5. Set `phone_verified_at = now()` on the user row.
6. Policy (G7): a Google/email account is **not** merged by phone. A phone login for number X always maps to the auth user whose verified phone is X. Account linking is an explicit future flow (MessageCentral plan §"link phone"), out of scope.

### 1.3 Client
- `PhoneEntry` / onboarding: when the session came from phone login, pre-fill and lock the phone field in onboarding (it is already verified). Onboarding for Google users keeps free-entry contact phone (D4). Add copy: "Contact number — not verified".
- `ensureProfile`: stop writing `phone` when it equals what the edge function already wrote (idempotent already; just verify it can't overwrite a verified value — `ignoreDuplicates:true` covers it).

### 1.4 Tests
- SQL: RPC returns uid for existing phone, null for none, not callable as `authenticated`/`anon`.
- Edge: planted-phone scenario — user A (Google) has `users.phone = +91B`; B logs in by phone → gets **B's own** account, not A's.
- Edge: 60+ users in auth → user #60 can log in (G5).

**Exit:** scenario test passes against a branch/staging DB; Phase 0 query 2c returns 0 after cleanup.

---

## Phase 2 — Safer session minting (G4) — ~½–1 day

Option **2A (recommended):** keep password-grant but make it safe.
- Lease lock: table `phone_login_lease(user_id text pk, leased_until timestamptz)`; RPC `try_lease_phone_login(uid, seconds=15)` returns bool via `insert ... on conflict do update ... where leased_until < now()`. If not acquired → `409 {message:"Sign-in already in progress, retry"}`. Eliminates concurrent-rotation races.
- Per-call random password; **always** dead-rotate in `finally` (today a thrown `signInWithPassword` path still rotates, but a crash between set and rotate leaves a live temp password — `finally` closes that).
- Preserve real passwords: if Phase 0 query 3 shows no phone-login users have a real password, nothing to preserve; if some do, skip rotation for them and use 2B for those.
- Add `iss/aal` sanity: after `signInWithPassword`, assert `session.user.id === uid`.

Option **2B (spike, time-boxed 2h):** `admin.generateLink` has no phone type; only viable with a synthetic email — rejected unless 2A proves flaky (pollutes `auth.users.email`).

**Exit:** 20 concurrent logins for the same phone → all return valid sessions or a clean 409, none fail with an auth error; `auth.users.encrypted_password` never left as a live temp value.

---

## Phase 3 — Abuse & cost protection (G2, G3, G6) — ~1–1.5 days

### 3.1 Edge function (server)
- Table `auth_bridge_attempts(id, key text, kind text, at timestamptz default now())` + RPC `bridge_rate_check(p_key text, p_kind text, p_limit int, p_window interval) returns boolean` (shape copied from `20260823_business_login_rate_limit.sql`; `for update`/advisory lock; commit-safe typed return, not exceptions). `service_role` only.
- Check **before** any admin write: per-IP (hash `x-forwarded-for`) e.g. 20/10 min, per-phone e.g. 10/10 min. Return `429 {ok:false, message:"Too many attempts. Try later.", retry_after}`. Never log raw phone — log `sha256(phone).slice(0,8)`.
- Token hardening (G6):
  - `FIREBASE_PROJECT_ID` required — **fail closed (500)** if unset; remove the `"zetax-52843"` fallback.
  - `payload.firebase.sign_in_provider === "phone"`.
  - `now - auth_time <= 300s` (fresh OTP, not a replayed old token).
  - `phone_number` matches `^\+91[6-9]\d{9}$` (launch is India-only; widen deliberately).
  - Constant-shape errors (don't reveal whether the number has an account).
- CORS: keep allowlist; add Android WebView origin if different (verify `capacitor://`/`https://localhost`).

### 3.2 Firebase / Google Cloud console (owner action)
- **SMS region policy → Allow list: India only** (kills toll-fraud to premium regions).
- Remove all **test phone numbers** from the prod project (they bypass SMS and are a known backdoor if codes leak) — keep a separate dev project, or document the list.
- Quotas: set daily SMS cap; Billing → budget alert (e.g. 50/80/100%). **Blaze is active, so there is no hard stop: an SMS-pumping attack bills the linked card until the budget alert is acted on.** Budget alerts only notify — they do not cap spend. Pair them with the region allow-list (above) and the edge/App Check limits, and set the Firebase Auth SMS quota to the lowest daily value that fits expected signups.
- Check Phase 0 item 6 for the current SMS usage/cost in Firebase → Authentication → Usage and Cloud Billing reports, to size the quota and learn whether abuse is already happening.
- **App Check** (D3, monitor-first): Android → Play Integrity; web → reCAPTCHA Enterprise. Add the SDK init, ship in "unenforced/monitor" mode, watch the verified-vs-unverified ratio for a week, then enforce for Identity Toolkit. Confirm exact provider support in current Firebase docs before building.
- Keep the invisible reCAPTCHA on web (already there).

### 3.3 Client
- Server-trusted cooldown can't exist client-side, but make the client honest: persist `otp_last_sent_at:<phone>` in `sessionStorage`; resend and "Send code" both honour it across reloads; cap 5 sends/phone/session.

**Exit:** burst of 50 requests from one IP → 429 after the limit; stale (>5 min) token rejected; non-phone Firebase token (Google) rejected; unset `FIREBASE_PROJECT_ID` → 500 not silent fallback.

---

## Phase 4 — OTP UX & state (G8, G9) — ~1 day (OTA)

- `OtpVerify`: auto-submit when the 6th digit is filled (guard against double submit with `verifying`); keep the button as fallback.
- Android: handle Firebase auto-retrieval / instant verification (plugin `phoneVerificationCompleted` event — confirm in the installed plugin version's docs); when it fires, skip the code screen and go straight to the bridge call. Web: `autoComplete="one-time-code"` already set; WebOTP needs a domain-bound SMS format Firebase's default template does not provide — do not promise it.
- `mapAuthError(code) → i18n key`: `auth/invalid-verification-code`, `auth/code-expired`, `auth/too-many-requests`, `auth/invalid-phone-number`, `auth/quota-exceeded`, `auth/captcha-check-failed`, network, edge 429/401/500. Strings in en/hi/mr. Never show raw `err.message`.
- Wrong-code counter: after 5 failures, clear digits, force "Resend", show a message.
- Reload dead-end (G9): if `_phoneConfirmationResult` is missing on `/auth/otp`, redirect to `/auth/phone` with the number prefilled and toast "Session expired — send a new code" (not an inert verify screen). Native `verificationId` already survives via `sessionStorage`; also persist its timestamp and expire after 10 min.
- Remove the stale email branch assumptions only if confirmed dead (`sendEmailOtp` has no screen) — otherwise leave; do not widen scope.

**Exit:** manual matrix on Android release build + Chrome + iOS Safari: happy path, wrong code ×5, expired code, resend, reload mid-flow, airplane mode, deep-link returnTo after login.

---

## Phase 5 — Tests & observability (G11) — ~1 day

- Refactor edge `index.ts` into pure helpers (`verifyFirebaseToken`, `resolveUser`, `mintSession`, `rateCheck`) + a thin handler → Deno unit tests (mock JWKS with a locally generated keypair, mock admin client).
- Vitest for `authService.verifyOtp` (mock firebase + `functions.invoke`): success, edge error → message, `setSession` error.
- Structured edge logs: `{event:"phone_bridge", outcome:"ok|bad_token|stale|rate_limited|resolve_fail|mint_fail", phone_hash, ms}`. Supabase log alert on `mint_fail`/`resolve_fail` spikes.
- Client funnel through the existing `product_analytics` (20260996): `otp_sent`, `otp_verified`, `otp_failed{code}`, `otp_resend`. Dashboard: send→verify conversion, failure code mix, SMS volume per day (also the cost check for D1).
- Sentry: tag auth errors with `area:phone_auth`; no PII.

**Exit:** CI runs the new tests; a deliberate failure in staging shows up in logs/alert within minutes.

---

## Phase 6 — Housekeeping (G10, G12, G13) — ~½ day

- **G10:** in Firebase → Project settings → Android app `in.stryt.app`, register SHA-1 + SHA-256 of: debug, upload key, **Play App Signing** key (from Play Console → App integrity). Re-download `google-services.json` only if it changes. Record fingerprints (public values) in `docs/launch/`.
- **G12:** `git rm --cached android/app/client_secret_44008185…json` (file has no secret; this is hygiene so `.gitignore` is honest). History rewrite **not** needed — confirm that with the owner; no force-push.
- **G13:** Blaze already active — nothing to do for billing. Confirm the billing account is linked to `zetax-52843` (not a different project) and add a second Owner to the Cloud project for continuity (see [GOOGLE_PROJECT_MIGRATION.md](../launch/GOOGLE_PROJECT_MIGRATION.md)).
- Docs: update `CODEBASE_MAP.md` auth section; mark the MessageCentral plan *Superseded by Firebase phone auth (D1)* with a pointer here; log gaps G1–G13 in `docs/gaps/GAPS_LOG.md`; record applied migration + edge deploy in `supabase/APPLY_LOG.md`.

---

## 4. Order, ownership, effort

| Order | Phase | Ships as | Owner action needed | Effort |
|---|---|---|---|---|
| 1 | 0 verify | — | re-auth Supabase MCP; Firebase console look | ½ d |
| 2 | 1 identity | migration + edge deploy (no app release) | run migration + deploy | 1 d |
| 3 | 3.2 console settings | console only | region allow-list, test numbers, quota, budget alert | 1 h |
| 4 | 3.1 + 2 edge hardening | edge deploy | deploy | 1.5–2 d |
| 5 | 4 client UX | OTA | OTA release | 1 d |
| 6 | 5 tests/metrics | CI + OTA | — | 1 d |
| 7 | 6 housekeeping | docs/console/git | fingerprints, billing | ½ d |
| 8 | App Check enforce | console flip | after clean monitor week + Play gate | 1 h |

Total ≈ 6–7 working days. Steps 2–4 are the launch-relevant core; **do them before the testers' 14-day window ends**, in small deploys, each independently revertible.

## 5. Rollback

- Edge function: keep the previous `index.ts` as `index.v1.ts.bak` outside `functions/` (or git tag `phone-auth-pre-hardening`); redeploy old = instant revert. Contract unchanged so clients don't care.
- Migrations: rollback files in `supabase/rollbacks/20260998_*.rollback.sql` (drop RPC/tables/column). Rate-limit tables can be dropped with the edge revert.
- Console settings: note previous values (region policy, quota) before changing.
- If Phase 3 rate limits lock out real users: raise limits via a single constants block, redeploy; do not disable the check.

## 6. Out of scope (deliberately)

- Verifying the onboarding contact phone for Google users (owner decision 2026-09-20; D4).
- Phone-link / change-number / step-up re-auth flows (MessageCentral plan §1) — future work, would build on Phase 1's `auth_user_id_by_phone`.
- WhatsApp/voice OTP, MFA.
- Admin login and business/provider console passwords.
