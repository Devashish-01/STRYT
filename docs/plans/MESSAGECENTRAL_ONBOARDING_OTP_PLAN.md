# MessageCentral Phone OTP — Full Auth Implementation Plan

**Status:** Planned — not implemented
**Created:** 2026-08-15
**Provider:** MessageCentral VerifyNow (SMS, India `+91`)
**Scope:** Full authentication surface — signup, login, session, phone linking, step-up re-auth, account deletion
**Budget:** ₹0 to validate with free credits, ₹500 first production top-up

---

## 1. Scope

Phone OTP becomes a **first-class authentication method alongside Google**, not just an onboarding field.

| Flow | Phone OTP role | Status |
|---|---|---|
| Signup (new user) | Primary identity | In scope |
| Login (returning user) | Primary identity | In scope |
| Session restore / refresh | Standard Supabase session | In scope |
| Link phone to a Google account | Ownership proof | In scope |
| Step-up re-auth before account deletion | Identity challenge | In scope |
| Change verified phone number | Old + new number challenge | In scope |
| Logout | Existing `signOut()` | No change |
| Admin login (`/admin/login`) | **Explicitly excluded** | Out of scope |
| Business/provider console password + switch PIN | Unrelated (entity auth) | No change |
| Marketing / promotional SMS | Never | Out of scope |
| WhatsApp fallback, voice, MFA | Later phase | Out of scope |

### The central technical constraint

MessageCentral VerifyNow **generates and validates its own OTP** using its own sender ID and fixed template. It cannot deliver a Supabase-generated code, so Supabase's `sb.auth.verifyOtp({ type: "sms" })` can never verify a MessageCentral code, and the [Send SMS Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook) is unusable (it hands the provider a Supabase-generated OTP).

Every RLS policy in this project resolves identity from `auth.uid()::text` (`read_users`, `update_users`, `get_own_profile()`, `ce_insert`, and roughly 190 migrations of the same pattern). A token not signed by this Supabase project makes `auth.uid()` NULL and the entire app fails closed.

**Therefore:** a server-side Edge Function verifies the code with MessageCentral and then **mints a genuine Supabase session** for the resolved auth user. The client receives standard `access_token` / `refresh_token` and calls `setSession()`. From that moment every existing mechanism — `useAuthSession`, `tokenStore`, `sb.realtime.setAuth`, RLS, route guards — works unchanged.

---

## 2. What already exists (do not rebuild)

Verified in the codebase:

| Asset | Path | Reuse |
|---|---|---|
| `OtpVerify` — working 6-box OTP screen, paste-fill, resend timer, `sessionStorage` phone fallback | `src/screens/auth/OtpVerify.tsx` | Adapt — already routed at `/auth/otp`, currently unreachable |
| `PhoneEntry` — Google-only, phone input removed for launch | `src/screens/auth/PhoneEntry.tsx` (see comment L17–18) | Restore phone input |
| `authService` with `sendOtp`/`verifyOtp`/`normalizePhone`/`ensureProfile`/`mirrorSession` | `src/services/core/authService.ts` | Repoint at MessageCentral |
| `normalizePhone()` → E.164 `+91XXXXXXXXXX` | `authService.ts` L55–60 | Reuse as-is |
| Session state machine, `onAuthStateChange`, foreground refresh, healing | `src/store/useAuthSession.ts` | No change needed |
| Route guards: `PublicOnlyLayout`, `GuestOrAuthLayout`, `ProtectedLayout` + gate order (deletion → terms → onboarding) | `src/App.tsx` | No change needed |
| `returnTo` deep-link memory | `src/lib/returnTo.ts` | Reuse |
| Guest-mode funnels to `/auth/phone` | `useRequireAuth`, `GuestSignInPrompt`, `BottomNav`, `DesktopSidebar` | No change |
| Deletion flow: row → sheet → `requestDeletion` → `purge-deleted-accounts` → `DeletionPending` | `DataSettings.tsx`, `profileControlService.ts`, `supabase/functions/purge-deleted-accounts/` | Insert re-auth |
| Read-only phone field + "Verified Login" badge | `src/screens/ProfileEdit.tsx` L355–383 | Make it actionable |
| Code-entry sheet precedent | `src/components/PinEntrySheet.tsx`, `HandoffCodeInput.tsx` | Pattern for re-auth sheet |
| Rate-limit pattern (attempts table, `for update`, commit-safe typed returns) | `supabase/migrations/20260823_business_login_rate_limit.sql` | Copy shape |
| Edge Function boilerplate: `secretKey()`, CORS allowlist, `{ ok, message }` | `supabase/functions/purge-deleted-accounts/index.ts` | Copy verbatim |
| i18n keys `mobile_phone`, `mobile_phone_placeholder`, `verify_label_phone` in all 3 languages | `src/lib/i18n.tsx` | Reuse |

Non-negotiable project conventions:

- `users.id` is **`text`**, holding the auth uid. Always compare `auth.uid()::text`.
- `SELECT` on `users.phone` is **revoked** from `authenticated`/`anon` (`20260715_pii_column_masking.sql`). Phone reads go through `get_own_profile()` or service role.
- No component library, no form library, no toast library. Local `useState` + `try/catch/finally`.
- **All colours must be CSS custom properties.** `scripts/check-hardcoded-colors.js` fails the build on a literal hex.
- Icons only from the `@/components/Icons` barrel.
- Edge Functions are self-contained; there is no `_shared/`.
- Migrations are a synthetic monotonic counter — next file is `20260947_…`. Idempotent DDL. Run manually or via MCP.
- Do **not** edit `supabase/CONSOLIDATED_SPRINT_1_TO_6_MIGRATIONS.sql`.
- Never give MessageCentral secrets a `VITE_` prefix — that ships them in the bundle.

---

## 3. Provider activation (blocking prerequisite)

Nothing below should be built until these are answered **in writing**.

1. Create the MessageCentral account with the founder's real details (pre-incorporation startup, no fabricated CIN/GST/DLT).
2. Email `support@messagecentral.com`:
   - Can a pre-incorporation/individual account run production VerifyNow?
   - Can we send to real Indian `+91` numbers with **no** DLT registration, PE ID, sender header, or template of our own?
   - Which KYC documents, if any, are required?
   - Exact per-OTP India price including GST; minimum top-up; are failed/undelivered/resent messages charged?
   - Account, daily, per-number and per-IP limits.
   - Confirm `otpLength` can be set to **6** (docs say 4–8, default 4) — our UI is 6 boxes.
   - Confirm the configurable validity/resend window (docs indicate 20–300s, default 60s).
   - Sender ID customers will see (India default appears to be `UTOMOB`) and whether the brand-name field unlocks after top-up.
3. Test delivery on Jio / Airtel / Vi / BSNL using free credits before paying.
4. Top up ₹500. Enable low-balance alerts. Do **not** enable uncapped auto-recharge.

References: [India API guide](https://messagecentral.com/en-in/product/verify-now/api-india) · [India pricing](https://messagecentral.com/en-in/product/verify-now/pricing/india) · [VerifyNow FAQ](https://messagecentral.com/product/verify-now/faqs)

### Provider API shape (three calls)

| Step | Method + path | Notes |
|---|---|---|
| Token | `GET /auth/v1/authentication/token?customerId=&key=&scope=NEW&country=91` | `key` is the base64-encoded password. Returns `{ status, token }`. |
| Send | `POST /verification/v3/send?countryCode=91&flowType=SMS&mobileNumber=&otpLength=6` | Header `authToken`. Returns `data.verificationId`, `data.timeout`, `data.transactionId`. |
| Validate | `GET /verification/v3/validateOtp?verificationId=&code=` | Header `authToken`. Returns `data.verificationStatus` (`VERIFICATION_COMPLETED`). |

Provider error codes to map: `501` invalid customer, `505` invalid verificationId, `506` request already exists, `508`/`805` insufficient credits, `511` invalid country, `700` verification failed, `702` wrong OTP, `703` already verified, `705` expired, `800` daily max reached.

---

## 4. Architecture

```
┌──────────────────────────────── Client (React / Capacitor) ───────────────────────────────┐
│  PhoneEntry ──► OtpVerify ──► setSession() ──► ensureProfile() ──► signIn() ──► returnTo   │
│  ProfileEdit ──► PhoneChangeSheet                                                          │
│  DataSettings ──► ReauthOtpSheet ──► requestDeletion(reauthId)                              │
│                         │ anon key + (optional) Bearer session                              │
└─────────────────────────┼───────────────────────────────────────────────────────────────────┘
                          ▼
        ┌──────────────── Supabase Edge Functions (service role) ────────────────┐
        │  phone-otp-send      verify_jwt = false   (login must work signed-out) │
        │  phone-otp-verify    verify_jwt = false                                │
        │    ├─ rate-limit via RPC (attempts table, SECURITY DEFINER)            │
        │    ├─ MessageCentral: token → send → validateOtp                        │
        │    ├─ resolve/create auth user by phone                                 │
        │    ├─ MINT Supabase session                                             │
        │    └─ write users.phone / phone_verified_at / provider                  │
        └────────────────────────────────┬───────────────────────────────────────┘
                                         ▼
                         Postgres: users, phone_otp_attempts,
                         phone_reauth_grants, RLS unchanged
```

Client never talks to MessageCentral. Credentials live only in Edge Function secrets.

### 4.1 Session minting — the critical decision

After MessageCentral confirms the code, the function must produce a real Supabase session.

**Path A — password-grant rotation (default for customer accounts).**

1. Resolve the target auth user id (§4.2).
2. `sb.auth.admin.updateUserById(id, { phone, phone_confirm: true })`.
3. Generate a 48-byte cryptographically random password.
4. `sb.auth.admin.updateUserById(id, { password })`.
5. With a **second client built on the anon key**, `auth.signInWithPassword({ phone, password })` → real session with `refresh_token`.
6. Immediately rotate the password to a fresh random value so the one used is dead on arrival.
7. Return `{ access_token, refresh_token }`.

**Path B — magic-link token hash (for accounts that must not have their password touched).**

`sb.auth.admin.generateLink({ type: "magiclink", email })` → `hashed_token` → `sb.auth.verifyOtp({ token_hash, type: "magiclink" })`. No password mutation, but requires the auth user to have an email.

**Hard safety rule.** `src/screens/admin/AdminLogin.tsx` authenticates with email + password. Path A would silently destroy that credential. Therefore:

- Reject phone OTP login for any user whose `users.roles` contains `admin` or `super_admin` — return a generic failure and route them to `/admin/login`.
- Reject it for any account intended to keep a human-known password.
- Prefer Path B when the target user has an email identity and any possibility of password login.

Both paths must be proven on a **staging/branch project before production**. If neither is acceptable, the fallback is Supabase-native phone OTP with a provider that can transmit our own OTP text — which reintroduces DLT and is out of scope.

### 4.2 Identity resolution (prevents duplicate and hijacked accounts)

Given a MessageCentral-verified `phone_e164`, resolve in strict order:

1. `public.users` where `phone_e164 = :phone` **and** `phone_verified_at is not null` → that `id` is the target.
2. Else `auth.users` where `phone = :phone` → that id (repair the `users` row).
3. Else **create** a new auth user: `admin.createUser({ phone, phone_confirm: true })`, then `ensureProfile`-equivalent insert.

Guards:

- **Reject the purge sentinel.** `purgeCustomerAccount()` sets `phone = "0000000000"` on anonymized rows permanently. Never match it, and exclude it from any unique index (partial index `where phone_verified_at is not null and phone_e164 <> '+910000000000'`).
- **Never merge two auth users.** If the phone is verified on account X while a *different* signed-in account Y attempts to link it, fail with a neutral "This number is already in use" and offer support/recovery. Do not disclose whose.
- A `deletionScheduledAt` account **must be allowed to sign in** — that is how a user cancels deletion. `ProtectedLayout` already routes them to `/auth/deletion-pending`.
- New phone users get `onboarding_completed_at = null`, so `ProtectedLayout` sends them to `/auth/onboard` automatically. No new routing.

---

## 5. API contracts

Both functions are declared in `supabase/config.toml`.

```toml
[functions.phone-otp-send]
# Login must work for a signed-out user, so the JWT gateway cannot guard this.
# The function is responsible for its own abuse controls — see phone_otp_attempts.
verify_jwt = false

[functions.phone-otp-verify]
verify_jwt = false
```

Because `verify_jwt = false`, **the rate limiter is the only thing standing between a bot and your wallet.** Treat it as security-critical.

Shared purposes:

| `purpose` | Session required | Effect on success |
|---|---|---|
| `LOGIN` | No | Mints a Supabase session (signup or login) |
| `LINK` | Yes | Attaches a verified phone to the current account |
| `CHANGE` | Yes | Replaces the verified phone (old number challenged first) |
| `REAUTH` | Yes | Issues a short-lived re-auth grant for a destructive action |

### 5.1 `POST /functions/v1/phone-otp-send`

Request:
```json
{ "phone": "+919876543210", "purpose": "LOGIN", "deviceId": "opaque-uuid" }
```
Headers: `apikey: <anon>`, plus `Authorization: Bearer <session>` for `LINK` / `CHANGE` / `REAUTH`.

Server sequence:

1. Validate `purpose`; require a session for non-`LOGIN`.
2. Normalize to E.164, reject anything that is not a valid Indian mobile, reject the sentinel.
3. Call the rate-limit RPC on `(phone, userId, deviceId, ip)`. On limit → `429`.
4. `LOGIN` only: resolve the target; if the target has `admin`/`super_admin`, return the generic failure.
5. `LINK` / `CHANGE`: reject if the number is already verified on another account.
6. MessageCentral token → send (`otpLength: 6`).
7. Insert `phone_otp_attempts` row (server-side `verificationId`, purpose, expiry).
8. Respond.

Response `200`:
```json
{ "ok": true, "attemptId": "uuid", "maskedPhone": "+91 ******3210",
  "expiresInSec": 60, "resendAfterSec": 60, "otpLength": 6 }
```

`attemptId` is ours. **`verificationId` never leaves the server.**

Errors: `400` invalid phone/purpose · `401` missing session · `409` number in use · `429` rate limited (`retryAfterSec`) · `502` provider failure · `503` insufficient provider balance.

### 5.2 `POST /functions/v1/phone-otp-verify`

Request:
```json
{ "attemptId": "uuid", "code": "123456" }
```

Server sequence:

1. Load the attempt. Reject if missing, consumed, expired, replaced, or blocked.
2. For non-`LOGIN`, assert the attempt belongs to the caller's `auth.uid()`.
3. Enforce max verification attempts; increment failures **so the counter commits** (see the `20260823` lesson).
4. MessageCentral `validateOtp`. Require `VERIFICATION_COMPLETED`.
5. Branch by purpose:
   - `LOGIN` → resolve/create user → mint session (§4.1) → write `phone_e164`, `phone_verified_at`, `phone_verification_provider`, legacy `phone` → return session.
   - `LINK` / `CHANGE` → write the phone columns → return `{ ok: true }`.
   - `REAUTH` → insert `phone_reauth_grants` (5-minute TTL) → return `{ reauthId }`.
6. Mark the attempt consumed.

Response for `LOGIN`:
```json
{ "ok": true, "purpose": "LOGIN", "isNewUser": true,
  "session": { "access_token": "…", "refresh_token": "…" } }
```

Errors: `400` wrong/expired code (`remainingAttempts`) · `401` bad session · `403` attempt not yours · `409` number in use · `423` locked out · `429` rate limited · `502` provider failure.

Security requirements:

- Response bodies must be indistinguishable between "number not registered" and "number registered". Never leak account existence.
- Never log the OTP, the provider `authToken`, the account key, or full phone numbers.
- Return `retryAfterSec` without revealing exact remaining-attempt internals to unauthenticated callers.

### 5.3 Deletion re-auth is enforced server-side

Today `profileControlService.requestDeletion()` writes tables directly from the client, so a client-side OTP prompt would be trivially bypassable.

Add a `SECURITY DEFINER` RPC `public.request_account_deletion(p_reason text, p_reauth_id uuid)` that:

1. Resolves `auth.uid()::text`.
2. Validates the `phone_reauth_grants` row: belongs to the caller, purpose `DELETE_ACCOUNT`, unconsumed, unexpired.
3. Consumes the grant.
4. Runs the existing pre-flight checks (non-terminal `agreements`, `payments.escrow_status = 'HELD'`, duplicate `PENDING`).
5. Inserts `profile_deletion_requests` and sets `users.customer_enabled = false`, `businesses.owner_enabled = false`, `providers.owner_enabled = false` — the DEL-1 behaviour.
6. `revoke execute … from public, anon; grant execute … to authenticated;`

`profileControlService.requestDeletion()` becomes a thin caller of this RPC. Accounts with no verified phone (existing Google-only users) must have a defined fallback — see §11.

---

## 6. Database changes — `supabase/migrations/20260947_phone_otp_auth.sql`

Idempotent, with the standard `-- ===` header block.

### 6.1 `public.users` additions

```sql
alter table public.users
  add column if not exists phone_e164 text,
  add column if not exists phone_verified_at timestamptz,
  add column if not exists phone_verification_provider text;

create unique index if not exists users_phone_e164_verified_uniq
  on public.users (phone_e164)
  where phone_verified_at is not null
    and phone_e164 is not null
    and phone_e164 <> '+910000000000';
```

The partial index is what makes "one verified number, one account" enforceable while surviving repeated purges.

Then mirror the existing PII posture:

```sql
revoke select (phone_e164) on public.users from authenticated, anon;
```

`get_own_profile()` is `select * from public.users …`, so the new columns flow to the owner automatically — no RPC change required.

### 6.2 `public.phone_otp_attempts`

Columns: `id uuid pk`, `user_id text null references public.users(id) on delete cascade` (null for signed-out `LOGIN`), `phone_e164 text not null`, `purpose text not null check (…)`, `provider text not null default 'messagecentral'`, `provider_verification_id text`, `provider_transaction_id text`, `status text not null default 'PENDING' check (…)`, `send_count int not null default 1`, `fail_count int not null default 0`, `device_id text`, `ip_hash text`, `created_at`, `expires_at`, `last_sent_at`, `consumed_at`.

```sql
alter table public.phone_otp_attempts enable row level security;
revoke all on table public.phone_otp_attempts from public, anon, authenticated;
```

Service role only — the client addresses attempts exclusively through the Edge Functions.

Store `ip_hash`, never a raw IP. Never store the code.

### 6.3 `public.phone_otp_rate_limits`

Keyed on `(scope, subject)` where `scope ∈ ('PHONE','USER','DEVICE','IP')`, plus `send_count`, `fail_count`, `window_started_at`, `locked_until`, `last_attempt_at`. Same lockdown as above.

Wrap it in `SECURITY DEFINER` functions `phone_otp_rate_check(...)` / `phone_otp_rate_record(...)` using `select … for update`, and **return typed status rows on expected denial instead of raising** — raising rolls back the counter increment, exactly the bug documented in `20260823_business_login_rate_limit.sql`.

### 6.4 `public.phone_reauth_grants`

`id uuid pk`, `user_id text not null references public.users(id) on delete cascade`, `purpose text not null` (`DELETE_ACCOUNT`, `CHANGE_PHONE`), `attempt_id uuid`, `created_at`, `expires_at` (5 minutes), `consumed_at`. RLS enabled, all grants revoked; only the definer RPC and Edge Functions touch it.

### 6.5 Cleanup and purge integration

- A cleanup function (pg_cron, or opportunistic deletion on each send) removes attempts and grants older than ~24 hours.
- **`purgeCustomerAccount()` in `supabase/functions/purge-deleted-accounts/index.ts` must additionally delete `phone_otp_attempts`, `phone_otp_rate_limits` (USER scope), and `phone_reauth_grants` for the target, and clear `phone_e164` / `phone_verified_at` alongside the existing `phone = "0000000000"` anonymization.** The FK cascade covers user-linked rows, but the anonymized `users` row must not retain a verified number.
- Regenerate `src/types/database.types.ts` or the typed `sb.from(...)` calls will not compile.

---

## 7. Backend files to add

```
supabase/functions/phone-otp-send/index.ts
supabase/functions/phone-otp-verify/index.ts
supabase/migrations/20260947_phone_otp_auth.sql
supabase/config.toml                          (edit — two new blocks)
supabase/functions/purge-deleted-accounts/index.ts  (edit — purge new tables)
```

Each function copies the house boilerplate: `secretKey()` reading `SUPABASE_SECRET_KEYS.default` with the legacy fallback, the inline `ALLOWED_ORIGINS` allowlist (`https://stryt.in`, `https://www.stryt.in`, `https://localhost` for the Capacitor WebView, the two localhost dev ports), `OPTIONS` short-circuit, one `try/catch`, and `{ ok, message }` responses.

New Edge Function secrets (Supabase Dashboard, and documented in the `.env.example` server-side comment block):

```
MESSAGECENTRAL_CUSTOMER_ID
MESSAGECENTRAL_KEY          # base64-encoded account password
MESSAGECENTRAL_BASE_URL     # https://cpaas.messagecentral.com
MESSAGECENTRAL_OTP_LENGTH   # 6
PHONE_OTP_PEPPER            # for ip_hash
```

No `VITE_` prefix. Ever.

---

## 8. Frontend files to add or change

```
src/services/core/phoneOtpService.ts   NEW  — fetch wrapper over both functions
src/services/core/authService.ts       EDIT — MessageCentral login + setSession
src/services/core/profileControlService.ts EDIT — requestDeletion(reason, reauthId)
src/services/index.ts                  EDIT — export phoneOtpService
src/screens/auth/PhoneEntry.tsx        EDIT — restore phone input
src/screens/auth/OtpVerify.tsx         EDIT — purpose-aware, 6-digit, provider timings
src/components/auth/ReauthOtpSheet.tsx NEW  — step-up challenge sheet
src/components/auth/PhoneChangeSheet.tsx NEW — link / change number
src/screens/settings/DataSettings.tsx  EDIT — re-auth before deletion
src/screens/ProfileEdit.tsx            EDIT — phone row becomes actionable
src/lib/i18n.tsx                       EDIT — new keys ×3 languages
```

### 8.1 `phoneOtpService.ts` (new)

Two methods, both plain `fetch` to `functionUrl("phone-otp-send" | "phone-otp-verify")` — matching the existing convention in `profileControlService` (not `sb.functions.invoke`):

- `send({ phone, purpose })` → attaches `apikey: config.supabaseAnonKey`, plus `Authorization: Bearer <access_token>` when a session exists.
- `verify({ attemptId, code })` → same headers.

Both normalize failures into `Error(message)` so screens keep using the existing `showToast(e instanceof Error ? e.message : "…")` idiom.

### 8.2 `authService.ts` changes

Repoint the phone methods and add the session bridge. Keep `normalizePhone`, `ensureProfile`, `mirrorSession`, `logout`, `refresh` untouched.

```ts
async sendPhoneOtp(phone: string, purpose: OtpPurpose = "LOGIN") { … }

async verifyPhoneOtpAndSignIn(attemptId: string, code: string) {
  const res = await phoneOtpService.verify({ attemptId, code });
  const sb = getSupabase();
  const { data, error } = await sb.auth.setSession({
    access_token: res.session.access_token,
    refresh_token: res.session.refresh_token,
  });
  if (error) throw toApiError(error);
  mirrorSession(data.session?.access_token, data.session?.refresh_token);
  await ensureProfile(data.user?.id, res.phone, null, null);
  return { isNewUser: res.isNewUser };
}
```

`setSession()` fires `onAuthStateChange`, which `useAuthSession` already handles: `tokenStore.set(...)`, `sb.realtime.setAuth(...)`, `setIsAuthed(true)`. Nothing in the session layer needs to change.

Two notes:

- Keep the legacy Supabase-native `sendOtp`/`verifyOtp` methods only if something still calls them; otherwise remove them so there are not two OTP paths.
- The `SIGNED_OUT` healing branch in `useAuthSession` calls `firebaseSilentRefresh()` first. For a MessageCentral-minted session that has a genuine `refresh_token`, Supabase's own refresh succeeds earlier in the chain, and `firebaseSilentRefresh()` returns false harmlessly when there is no Firebase user. No change required — but verify it during testing.

---

## 9. UI/UX — exact screens, buttons and behaviour

All new UI uses existing classes (`btn btn-primary btn-block`, `btn btn-outline`, `btn btn-red`, `input`, `field`, `card`, `overlay`, `sheet`, `sheet-grab`, `row`/`col`/`gap-N`/`grow`/`center`, `h1`/`h2`/`small`/`tiny`/`muted`/`bold`), the `Icons` barrel, `useApp().showToast`, and `var(--…)` colours only.

### 9.1 `/auth/phone` — PhoneEntry (login + signup)

The single entry point for both signup and login. There is no separate signup screen, matching today's design.

Layout, mobile, top to bottom:

1. Existing brand lockup and dusk-street ambience — unchanged.
2. **Primary: phone form.**
   - Label: "Mobile number".
   - Fixed `+91` prefix chip on the left (non-editable — `defaultCountry` is `IN`).
   - `<input className="input" type="tel" inputMode="numeric" autoComplete="tel" maxLength={10} placeholder="e.g. 9876543210">` using the existing `mobile_phone_placeholder` key.
   - Inline helper: "We'll text you a 6-digit code."
   - Button: `btn btn-primary btn-block` → **"Continue"**, disabled until 10 digits, showing `<Loader className="spin" size={18} />` while sending.
3. Divider: "or".
4. **Secondary: existing Google button**, visually subordinate but unchanged in behaviour.
5. Legal line: "By continuing you agree to our Terms and Privacy Policy" with links to `LEGAL_ROUTES`.

Behaviour:

- On success → `sessionStorage.setItem("otp_phone", e164)` (the existing key, which survives the SMS-app switch), then `nav("/auth/otp", { state: { phone: e164, purpose: "LOGIN", attemptId, expiresInSec, resendAfterSec } })`.
- On failure → `showToast(...)`, stay put, keep the typed number.
- `429` → toast "Too many attempts. Try again in N minutes." and disable the button for the returned window.
- The Google path is untouched, so a Google-only user is never forced onto phone login.

Copy rule: the screen must not say "Sign in" versus "Sign up" for the phone path, because the same code both creates and restores an account. "Continue" is honest for both.

### 9.2 `/auth/otp` — OtpVerify (adapt the existing screen)

Keep the existing 6-box input, paste-fill `set()` handler, `inputMode="numeric"`, `autoComplete="one-time-code"` on the first box, and the back button. Change:

- Read `attemptId` and `purpose` from `location.state`, with the existing `sessionStorage` phone fallback for reloads. If `attemptId` is missing after a reload, show "Your code request expired" and route back to `/auth/phone` — do not silently resend.
- Replace the hardcoded 55-second timer with `resendAfterSec` from the server.
- Show a masked destination: "Code sent to +91 ******3210".
- Show remaining validity from `expiresInSec`; when it hits zero, disable **Verify** and surface **Resend code**.
- `verify()` → `authService.verifyPhoneOtpAndSignIn(attemptId, code)` → `sessionStorage.removeItem("otp_phone")` → `signIn()` → `nav(returnTo.consume(), { replace: true })`. The existing `ProtectedLayout` chain then handles terms → onboarding automatically.
- `resend()` → `phoneOtpService.send({ phone, purpose })`, store the new `attemptId`, reset the timer, toast "Code sent again". Drop the current `phone.includes("@")` email branch unless email OTP is being kept.
- On wrong code: toast, clear the boxes, focus box 1, and show "N attempts left" **only when the server returns it**.
- On lockout (`423`): replace the input with a calm explanation and a "Try another number" action.

Android hardware BACK already dismisses the topmost `.overlay`, so no extra wiring is needed for the sheets below.

### 9.3 `ProfileEdit` — phone becomes actionable

Today the field is `readOnly disabled` with a Lock icon and a "Verified Login" badge.

- **Verified phone present:** keep the locked field and badge. Add a right-aligned `btn btn-sm btn-outline` **"Change"** that opens `PhoneChangeSheet`. Update the helper copy from "cannot be changed directly in profile settings" to "Changing it needs a code sent to both your old and new number."
- **No verified phone (existing Google-only users):** show an unlocked field with an amber "Not verified" chip and a `btn btn-sm btn-primary` **"Verify"** that opens `PhoneChangeSheet` in `LINK` mode.

### 9.4 `PhoneChangeSheet` (new) — link and change

Standard `overlay` + `sheet` + `sheet-grab`. Steps inside one sheet:

- **LINK:** enter number → **"Send code"** → 6-box code → **"Verify"** → `showToast("Number verified")` → `refreshUser()` → close.
- **CHANGE:** step 1 challenges the **old** number (`REAUTH`, purpose `CHANGE_PHONE`); step 2 verifies the **new** number (`CHANGE`, carrying the grant). Two codes, because a hijacked session must not be able to move the account's identity on its own.
- Conflict (`409`) → neutral message: "That number is already in use on another account." Offer support. Never name the other account.
- Footer buttons: `btn btn-outline grow` **"Cancel"** first, `btn btn-primary grow` **"Verify"** second.

### 9.5 `ReauthOtpSheet` (new) — step-up challenge

A reusable sheet that takes `purpose`, sends an OTP to the account's verified number, collects the code, and resolves with a `reauthId`.

Header: "Confirm it's you". Body: "For your security, enter the 6-digit code we sent to +91 ******3210." Footer: `btn btn-outline grow` **"Cancel"**, `btn btn-primary grow` **"Confirm"**.

### 9.6 `DataSettings` — deletion gains a real identity check

The entry path is unchanged: `AccountSettings` "Delete account" row → `/settings/data?action=delete` → existing confirm sheet.

Insert one step **between** the confirm sheet and the write:

1. Existing sheet keeps its grace-period explanation, the amber business/provider warning, the optional reason textarea, the "What gets deleted, and what's kept" link, and the safe-option-first buttons (`btn btn-outline grow` "Keep my account" / `btn btn-red grow` "Delete").
2. Tapping **Delete** no longer calls `requestDeletion` directly. It opens `ReauthOtpSheet` with `purpose: "DELETE_ACCOUNT"`.
3. On success → `profileControlService.requestDeletion("CUSTOMER", null, reason, reauthId)` → existing toast → `nav("/auth/deletion-pending", { replace: true })`.
4. If the account has **no verified phone**, fall back per §11 rather than blocking deletion. Store-policy self-serve deletion must never become unreachable.

`DeletionPending` (cancel, auto-purge at grace end, sign out) needs no change. Cancelling deletion stays a single tap and is deliberately **not** OTP-gated — recovery must be easier than destruction.

### 9.7 States every new surface must handle

Invalid number · number in use · send cooldown · rate limited · locked out · wrong code · expired code · attempt already consumed · attempt replaced by resend · provider unavailable · provider balance exhausted · offline · app backgrounded mid-flow · app restarted mid-flow · session expired during a `LINK`/`REAUTH` flow · admin account attempting phone login.

---

## 10. Security and cost controls

Because `phone-otp-send` is unauthenticated, these are mandatory before any real traffic.

| Control | Starting value |
|---|---|
| Resend cooldown | 60s (align to the provider's validity window) |
| Sends per phone | 3 per 10 min, 5 per hour, 10 per day |
| Sends per device | 5 per hour |
| Sends per IP-hash | 10 per hour |
| Sends per account (`LINK`/`CHANGE`/`REAUTH`) | 5 per hour |
| Verify attempts per attempt row | 5, then the attempt is dead |
| Lockout after repeated failures | 15 min, matching `business_login_attempts` |
| Daily account-wide OTP ceiling | Hard cap; refuse sends beyond it and alert |

Also required:

- Rate-limit **before** calling MessageCentral, so blocked traffic costs ₹0.
- Neutral, non-enumerating responses.
- Constant-ish behaviour between existing and non-existing numbers.
- Secrets only in Edge Function config; never in `VITE_*`, never in a table the client can read.
- Never log OTP, provider token, account key, `reauthId`, or full phone.
- Log security telemetry in the established style — `client_errors` for client faults, `admin_action_logs` for privileged actions.
- Consider CAPTCHA / Turnstile on `phone-otp-send` if abuse appears; the endpoint's openness makes it the app's most attackable surface.
- Alert on send-volume spikes, verification-failure spikes, provider auth failures, and low balance.

---

## 11. Migration of existing users

Existing accounts are Google-based and `users.phone` is free-form, unnormalized, unverified, and sometimes the purge sentinel.

Decisions to make explicit:

1. **Do not** treat any pre-existing `users.phone` as verified. Backfill `phone_e164` only where the value parses cleanly to a valid Indian mobile, and leave `phone_verified_at` NULL.
2. A Google user who signs in by phone with a number that is unverified on their own account should be linked to that same account only after a successful OTP — never matched on the unverified legacy value alone.
3. Prompt existing users to verify their number opportunistically (Profile, or a one-time card) rather than blocking the app.
4. **Deletion re-auth fallback for accounts with no verified phone.** Options: allow deletion with the existing typed-confirmation only; or require a typed `DELETE <name>` string, mirroring `admin-delete-profile`. Pick one before shipping — leaving it undecided would either break deletion or leave it unprotected.

---

## 12. Implementation sequence

**Phase 0 — Provider (blocking).** Account approval, written no-DLT confirmation, pricing, free-credit delivery test, `otpLength: 6` confirmed.

**Phase 1 — Session-minting spike (highest risk first).** On a Supabase branch, prove Path A and Path B end to end: mint a session, `setSession()` on the client, confirm `auth.uid()` resolves, RLS reads work, `get_own_profile()` returns the row, `refreshSession()` works after an hour, and `AdminLogin` password auth is provably untouched. **Do not proceed until this passes.**

**Phase 2 — Database.** `20260947_phone_otp_auth.sql`, regenerate `database.types.ts`, extend `purgeCustomerAccount()`.

**Phase 3 — Rate limiting.** RPCs plus tables, with the commit-safe typed-return pattern. Unit-test the counter under rollback.

**Phase 4 — Edge Functions.** `phone-otp-send`, `phone-otp-verify`, `config.toml`, secrets. Test with free credits via curl before touching the UI.

**Phase 5 — Service layer.** `phoneOtpService`, `authService` bridge, `profileControlService` + the deletion RPC.

**Phase 6 — Login UI.** `PhoneEntry` phone form, `OtpVerify` adaptation. First real end-to-end signup and login.

**Phase 7 — Link / change.** `PhoneChangeSheet`, `ProfileEdit` wiring.

**Phase 8 — Step-up re-auth.** `ReauthOtpSheet`, `DataSettings` integration, no-phone fallback.

**Phase 9 — Hardening.** Limits tuned, telemetry, alerts, privacy copy, i18n ×3.

**Phase 10 — Rollout.** Internal → 10 → 50 → 100 → general, watching delivery rate, completion rate, and ₹/completed login.

---

## 13. Testing plan

**Session minting:** new phone user; returning phone user; Google user linking their number; Google user then signing in by phone; token refresh after expiry; foreground resume after device sleep; `realtime` subscriptions still receive rows; admin account rejected from phone login and admin password login still works.

**Identity:** duplicate number blocked neutrally; purge sentinel never matched; deleted-then-recreated number; two devices racing the same number; deletion-pending user can sign in and cancel.

**OTP mechanics:** correct, wrong, expired, reused, replaced-by-resend, cooldown, per-phone/device/IP/account limits, lockout and recovery, `otpLength` mismatch, provider balance exhausted, provider timeout, provider `506` duplicate request.

**Flows:** signup → terms → onboarding → deep-link `returnTo`; login → deep link; link; change (both codes); re-auth → deletion → grace → cancel; re-auth → deletion → purge, verifying the new tables are cleaned.

**Client:** app backgrounded during OTP; app killed and reopened; reload losing `location.state`; offline mid-verify; Android BACK dismissing each sheet; paste-fill; SMS autofill on Android.

**Non-functional:** `npm run lint` and `npm run build` pass, including the hardcoded-colour and undefined-token gates; no OTP/secret/full-phone in logs; carrier matrix across Jio, Airtel, Vi, BSNL.

---

## 14. Cost

At an advertised ₹0.30 per delivered India OTP, assuming a 20% resend allowance:

| Event volume | Sends | Cost before tax |
|---:|---:|---:|
| 100 logins/signups | 120 | ₹36 |
| 1,000 | 1,200 | ₹360 |
| 5,000 | 6,000 | ₹1,800 |
| 10,000 | 12,000 | ₹3,600 |

Cost discipline, given that login is now OTP-driven:

- Sessions persist and auto-refresh — never send an OTP on app open.
- Google remains a zero-SMS path; keep it prominent.
- Step-up re-auth fires only on destructive actions.
- Rate limits reject abuse **before** the provider call.
- Start at ₹500; raise only after observing real completion rates.

---

## 15. Decisions required before coding

1. Path A or Path B for session minting — and the rule for choosing per account.
2. Confirmation that no non-admin customer account relies on an email + password login that Path A would rotate.
3. Is phone verification mandatory at signup, or skippable?
4. Deletion re-auth fallback for accounts with no verified phone.
5. Final OTP length (6) and validity window.
6. Final rate-limit numbers.
7. Behaviour when MessageCentral is down: block login, or fall back to Google only?
8. Whether Supabase-native email OTP / password methods in `authService` are retired or kept.
9. Retention period for attempt and grant rows.
10. Whether `users.phone` (legacy) stays in sync with `phone_e164` or is deprecated.
11. Who receives balance and abuse alerts.

---

## 16. Definition of done

- MessageCentral production account approved with written confirmation that no STRYT DLT registration is required.
- A phone-OTP session is a genuine Supabase session: `auth.uid()` resolves, RLS passes, refresh works, Realtime receives rows.
- Signup, login, link, change, and step-up re-auth all work on a physical Android device across major Indian carriers.
- `AdminLogin` and the business/provider password + PIN flows are provably unaffected.
- One verified number maps to exactly one account, enforced by the partial unique index.
- Deletion requires server-validated re-auth, and cancellation still works in one tap.
- `purge-deleted-accounts` removes all new OTP data and clears the verified number.
- Rate limits demonstrably block abuse before any provider call is billed.
- No OTP, secret, or full phone number appears in any log.
- Privacy/consent copy shipped; i18n complete in all three languages.
- `npm run lint` and `npm run build` pass.
- Cost per completed login measured and within budget.

---

## 17. Future phases

WhatsApp fallback via VerifyNow · voice OTP · phone MFA for high-value actions · provider failover and routing · additional countries · silent network auth · migration to a DLT-registered domestic route once the company is incorporated and volume justifies it.

---

## 18. References

**Provider:** [India API guide](https://messagecentral.com/en-in/product/verify-now/api-india) · [India overview](https://messagecentral.com/product/verify-now/overview-india) · [India pricing](https://messagecentral.com/en-in/product/verify-now/pricing/india) · [FAQ](https://messagecentral.com/product/verify-now/faqs) · [SDK guide](https://messagecentral.com/en-in/product/verify-now/verify-users-otp-sdk)

**Supabase:** [Auth overview](https://supabase.com/docs/guides/auth) · [Phone login](https://supabase.com/docs/guides/auth/phone-login) · [Send SMS Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook) · [admin.createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser) · [admin.updateUserById](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid) · [Identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking) · [Going into prod](https://supabase.com/docs/guides/deployment/going-into-prod)

**Internal:** `src/services/core/authService.ts` · `src/store/useAuthSession.ts` · `src/App.tsx` (guards) · `src/screens/auth/OtpVerify.tsx` · `src/screens/auth/PhoneEntry.tsx` · `src/screens/settings/DataSettings.tsx` · `src/services/core/profileControlService.ts` · `supabase/functions/purge-deleted-accounts/index.ts` · `supabase/config.toml` · `supabase/migrations/20260715_pii_column_masking.sql` · `supabase/migrations/20260823_business_login_rate_limit.sql` · `supabase/legacy/migration_r14.sql`

Provider documentation was summarized and rephrased for compliance with licensing restrictions.
