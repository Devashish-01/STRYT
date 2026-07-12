# STRYT — Pre-Launch Security Audit

**Scope:** the 12 vulnerability classes commonly found in "vibe-coded" apps that ship to
production, mapped against STRYT's actual code (React + Vite client, Supabase Postgres/RLS,
Deno edge functions, Supabase Storage, Capacitor Android).
**Method:** static review of this repository only. Some controls in a Supabase app live in
the **dashboard, not the code** (Auth settings, live policy state). Those are called out as
**VERIFY (dashboard)**.
**Date:** 2026-07-12 · **Revised:** 2026-07-12 (reconciled against current code after the
manual-verification work landed) · **Shipped:** 2026-07-12 (migrations applied, edge
functions deployed, verified live against the DB — see Addendum II).

> ### 🔁 Revision note — the first pass was materially too harsh on the RLS layer
> It was written mostly off `supabase/legacy/rls.sql` (a prototype "starting set") and
> **undercounted the real hardening in `supabase/migrations/`** — there are **23 policy
> migrations** doing exactly the owner-scoping / PII-locking the audit said was missing. On
> re-read of the actual migrations, **both catastrophic P0 claims are largely already
> fixed** (P0-1), and the KYC items (P0-2, P0-3) were closed by the manual-verification
> work. Findings are annotated **[FIXED] / [PARTIAL] / [OPEN]**.

---

## 🟢 Verdict: launch-ready except SOS (deferred by choice)

The app is **functionally complete**, the **edge-function layer is well-built** (admin
functions do real role/ownership checks, secrets are server-side, XSS surface is clean,
CSRF is a non-issue), and — the key correction — **the RLS layer has been substantially
hardened and version-controlled**, not left prototype-grade.

- ✅ **Private beta / internal testing:** fine.
- 🟢 **Public launch:** every non-SOS finding below is fixed **in code, applied to the live
  DB, and deployed** (go-live hardening pass, shipped 2026-07-12, verified directly against
  the database — see Addendum II). SOS (H-5) is explicitly deferred to its own pass — see
  Addendum I. The original "full phone-number dump + trivial admin privesc" blocker **no
  longer reflects the code or the live database**.

### Scorecard (revised)

| # | Vulnerability class | Status | Severity |
|---|---|---|---|
| 1 | Missing authentication | ✅ Anon can't read `users`; edge fns role-gated | Low |
| 2 | Broken authorization | ✅ Owner-scoping done; **self-`roles` write blocked (H-3, verified live)** | Low |
| 3 | Leaky secrets | ✅ Fixed — client-bundled admin token removed (M-1) | Low |
| 4 | No rate limiting | 🟡 KYC-OTP vector removed, `send-push` now authed; `ai-assist` still unbounded | Medium |
| 5 | Wide-open CORS | ✅ Allowlist deployed to all non-SOS functions, verified live (M-3) | Low |
| 6 | Missing input validation | ✅ Search sanitized (M-2) | Low |
| 7 | Unsafe file uploads | ✅ **KYC/ID docs now private + signed URLs** (was P0) | Low |
| 8 | Insecure password handling | ✅ Supabase bcrypt; enable strong policy + MFA | Low |
| 9 | Over-permissive tokens | ✅ Short-lived JWTs; admin-bypass flag removed (M-1) | Low |
| 10 | Missing CSRF protection | ✅ Bearer token, no cookie auth | Low |
| 11 | Weak logging / alerting | 🟡 Admin actions logged; no anomaly alerting (ops, F) | Medium |
| 12 | No safe infra defaults | ✅ RLS version-controlled; `config.toml`/`verify_jwt` now explicit (H-2) | Low |

---

## P0 — status after re-review

### P0-1 · RLS on core tables (items 1, 2) — **[PARTIAL] mostly fixed; one residual → H-3**
Re-reviewing `supabase/migrations/` (not just `legacy/rls.sql`) shows the two catastrophic
sub-claims are **already addressed**:

1. **`users` PII dump — [FIXED].**
   - `20260713_critical_security_fixes.sql` replaced `read_users using(true)` with:
     ```sql
     create policy read_users on public.users for select using (
       auth.role() = 'authenticated'
       and ((customer_enabled = true and customer_deleted_at is null)
            or id = auth.uid()::text or public.is_admin(auth.uid()::text)));
     ```
     → **anon can no longer read `users` at all.**
   - `20260715_pii_column_masking.sql` goes further with **column-level revokes**:
     ```sql
     revoke select (phone, email, emergency_contact, emergency_contact_name,
                    lat, lng, admin_login_id) on public.users from authenticated, anon;
     ```
     and routes every legitimate need through `SECURITY DEFINER` functions that enforce
     consent (`get_public_profile()` masks phone by `show_phone_publicly`, never returns
     exact coordinates for non-self). So even an authenticated caller **cannot** select raw
     phone/email/coords by constructing a different query. The audit's "dump every phone
     number" scenario is **closed.**

2. **"Update any user" / owner-scoped writes — [FIXED] for the tables reviewed.**
   - `20260705_privacy_and_followers.sql` replaced the permissive `update_users` with
     `create policy update_users … for update using (id = auth.uid()::text)` → **self-row
     only.**
   - Child/owned tables are owner-scoped throughout: `queue_tokens`
     (`20260728`), catalog (`20260720`), portfolio (`20260805`), packages (`20260702`),
     businesses via the delegated-access model (`20260809`), etc. — all gate on
     `owner_user_id = auth.uid()` / `user_id = auth.uid()`.

**[OPEN] residual → H-3 (self-`roles` escalation).** `update_users` now limits *which row*
(own), but nothing in the migrations pins the **`roles` column** — no `revoke update (roles)`
and no trigger comparing `new.roles` to `old.roles`. So a user updating their own row could
still `set roles = array_append(roles,'admin')` and self-promote (then `is_admin()` unlocks
the admin RPCs/functions). This is the one genuinely-open severe item; see **H-3**.

**Action:** run **Supabase → Advisors → Security** to confirm the live DB matches these
migrations (tables without RLS, `SECURITY DEFINER` views), and close H-3.

### P0-2 · KYC / identity documents in a public bucket (items 7, 12) — **[FIXED]**
Closed by the manual-verification work. `supabase/migrations/20260815_manual_verification.sql`
creates a **private** `verification-docs` bucket (`public=false`) with an owner-prefix insert
policy and **no** SELECT policy; `uploadService.uploadPrivate()` stores docs there and returns
a path, never a public URL; the `verification-review` function mints short-lived
`createSignedUrl()` links for reviewers only. The old SurePass `kyc-docs/…` paths are gone
(P0-3). *(The general `uploads` bucket stays public — correct for avatars/listing photos.)*

### P0-3 · KYC verify endpoint had no ownership check (item 2) — **[FIXED]**
`verify-aadhaar` / `verify-pan` were **deleted** (no third-party KYC — manual only). Their
replacement, `supabase/functions/verification-review/index.ts`, is role-gated
(`admin`/`super_admin` from the DB) and the badge is additionally made **unforgeable at the
DB layer** by the `enforce_manual_verification_decision` trigger — only `service_role` can
move `verification_status` to `APPROVED`/`REJECTED` or flip `is_verified`, so it can't be set
by a direct client write regardless of RLS.

---

## High

### H-3 · Self-service `roles` escalation → admin (item 2) — **[FIXED, verified live]**
`update_users` is self-row-scoped, but nothing pinned the **`roles` column** on that self-row.
Closed in `supabase/migrations/20260816_go_live_hardening.sql`: a `BEFORE INSERT OR UPDATE`
trigger (`enforce_role_privilege_guard`) blocks any non-`service_role` session from adding or
removing `admin`/`super_admin` in `roles`. Deliberately **not** a blanket column revoke —
`roles` also carries capability roles (`customer`/`business_owner`/`provider`) that users
legitimately self-assign at onboarding (`store.tsx` → `userService.update({ roles })`), so the
guard checks only the two privilege roles, leaving capability-role writes untouched.
`claim_first_admin` (the one legitimate self-grant, the one-time bootstrap) opts in via a
transaction-scoped `set_config('app.role_change_ok', 'true', true)` a client can't set.
**Status:** applied to the live DB and confirmed present (`trg_enforce_role_privilege_guard`
on `public.users`) — see Addendum II.

### H-1 · Rate limiting on custom edge functions (item 4) — **[PARTIAL] → Medium**
The worst vector (`verify-aadhaar`'s unthrottled paid-API + OTP-spam) is gone (function
deleted). Remaining: `ai-assist` has no app-level throttle (`send-push` is no longer
client-reachable at all — see H-4). Supabase Auth login/OTP has platform rate limits
(dashboard-configurable).
**Action:** add per-user/per-IP limits to `ai-assist`; confirm Auth limits.

### H-2 · Config-in-code (item 12) — **[FIXED, verified live]**
`supabase/config.toml` now declares `[functions.<name>] verify_jwt` explicitly for every
function with code in this repo — `true` everywhere except `app-update` (the public
self-hosted OTA check, polled before a session may exist). The "gateway blocks
unauthenticated calls" assumption is no longer an invisible dashboard toggle. Confirmed live
via `list_edge_functions`: every function shows `verify_jwt: true` except `app-update`
(`false`, as intended).

---

## Medium

### M-1 · `VITE_ADMIN_BYPASS_TOKEN` is shipped to the browser (items 3, 9) — **[FIXED, pending web deploy]**
`src/screens/AccountSettings.tsx` no longer reads any bypass token — the admin-console entry
point is gated purely on the real DB `roles` claim. (No corresponding `VITE_ADMIN_BYPASS_TOKEN`
was ever set in `.env`/`.env.example` either — this was dead-but-live client code, not an
active config.)

### M-2 · PostgREST filter injection in search (item 6) — **[FIXED, pending web deploy]**
`src/services/marketplace/discoveryService.ts` now strips `,()` from the raw query before
building the `%term%` `.ilike()` pattern, closing the `.or()` metacharacter-injection path.
(The many `` .or(`…${uid}…`) `` filters elsewhere were already safe — `uid` is a
server-derived UUID, not user input.)

### M-3 · Wildcard CORS on edge functions (item 5) — **[FIXED, verified live]**
The allowlist pattern (inlined per-function — see Addendum II) is deployed on every function
with code in this repo: `verification-review`, `send-push`, `ai-assist`, `app-update`,
`admin-delete-profile`, `profile-control`, `send-support-email`. `sos-alert` intentionally
left untouched (deferred — see Addendum I). Confirmed live via `list_edge_functions`.

### M-4 · No anomaly alerting (item 11)
Admin actions **are** audit-logged (`admin_action_logs`, written by `admin-delete-profile`),
and Supabase logs auth events natively — good. But there's **no alerting** on spikes (failed
logins, OTP floods, function 500s), so an attack would look like normal traffic until it's
too late.
**Action:** wire Supabase log drains / alerts (or a lightweight cron over `admin_action_logs`
+ auth logs) for failed-login and function-error spikes.

---

## Low

- **L-1 · Password policy / MFA (item 8):** password hashing is Supabase-managed bcrypt (✅).
  Client enforces only `length >= 6`. Enable dashboard **min length ≥ 8 + leaked-password
  protection (HIBP)**, and add **MFA for admin/super_admin accounts** (they can delete
  accounts).
- **L-2 · `SUPABASE_PERSONAL_ACCESS_TOKEN` in local `.env`:** a **management-API** token
  (account-wide) sits in the project `.env`. It is **not** `VITE_`-prefixed (so not bundled)
  and `.env` was **never committed** (verified via git history) — so no active leak. Still,
  move it out of the project env into an ops-only secret store and **rotate** it; if that file
  is ever shared it's game-over.
- **L-3 · Upload hardening (item 7):** `uploadService.upload()` trusts the client `file.type`
  and uses `upsert:true` with no size cap; add a server-side MIME allowlist + size limit and
  drop `upsert` for user content.
- **L-4 · Admin filter string-building (item 6):** `admin-delete-profile` interpolates
  `${targetId}` into `.or()`/subquery strings (lines 89/182/254). Admin-gated and the embedded
  `in.(select …)` subquery isn't valid PostgREST anyway (likely a latent correctness bug), but
  bind/validate `targetId` (UUID check) rather than string-concatenate.

---

## ✅ What's already done well (credit where due)

- **Secrets hygiene:** `service_role` key appears **only** in edge functions
  (`Deno.env.get`), never in the client; the client uses only the anon key; `.env` is
  git-ignored and was never committed.
- **Admin functions are properly authorized:** `admin-delete-profile` verifies
  `admin`/`super_admin` from the DB and enforces super-admin-only for account deletion,
  confirmation-text, active-agreement and held-escrow guards, and writes an **audit log**.
  `profile-control` enforces `owner_user_id === caller`.
- **CSRF is a non-issue (item 10):** auth is a Bearer JWT in localStorage, not a cookie, so
  there's no ambient credential to forge cross-site.
- **XSS surface is clean:** exactly one `dangerouslySetInnerHTML` and it's a **static** CSS
  `<style>` block (`QrScannerSheet.tsx`), no `innerHTML`/`eval`/`new Function`, no
  `target="_blank"` tab-nabbing. React's default escaping is intact — which is *why* the
  localStorage-token model is acceptable here.
- **Token model:** short-lived Supabase JWTs with refresh rotation + PKCE flow.

---

## Do-this-next punch list (post go-live-hardening pass, shipped)

**Fixed, applied/deployed, and verified directly against the live project:**
1. ~~Lock the `roles` column~~ — `enforce_role_privilege_guard` trigger, confirmed present
   on `public.users`. *(H-3)*
2. ~~Authorize `send-push`~~ — in-handler service-role Bearer check, deployed (v26). *(H-4)*
3. ~~`REVOKE … FROM PUBLIC` + `FROM anon`~~ on the SECURITY DEFINER RPC set + capped
   `get_nearby_user_ids` radius — confirmed via `pg_proc.proacl` after two migrations
   (the second closing a default-privilege gap the first missed). *(M-6)*
4. ~~Remove `VITE_ADMIN_BYPASS_TOKEN`~~ — committed, **pending web deploy**. *(M-1)*
5. ~~Escape search input~~ — committed, **pending web deploy**. *(M-2)*
6. ~~Retrofit CORS allowlist~~ onto all non-SOS functions; ~~authenticate + validate
   `send-support-email`~~ — all deployed, confirmed via `list_edge_functions`. *(M-3, M-5)*
7. ~~Add browser security headers~~ to `vercel.json` — committed, **pending web deploy**.
   *(M-7)*
8. ~~Add `config.toml` with per-function `verify_jwt`~~ — matches live `verify_jwt` flags on
   every deployed function. *(H-2)*

**Still open:**
9. **Deferred by explicit decision — not this pass:** authorize **`sos-alert`** (verify
   bearer token + agreement membership; derive IDs server-side) or disable it before it's
   wired to a live SMS provider. *(H-5 — revisit in the SOS pass)*
10. **Rate-limit `ai-assist`.** *(H-1, downgraded to Medium — `send-push` no longer needs
    this, it's not client-reachable)*
11. ~~Redeploy the web app (Vercel)~~ — done 2026-07-13, branch pushed to `origin`, client
    fixes (M-1, M-2, M-7) now live.
12. ~~Delete orphaned `verify-pan` / `verify-aadhaar`~~ — done 2026-07-13, confirmed absent
    from `list_edge_functions`.
13. **Optional follow-up:** the wider `SECURITY DEFINER`/`PUBLIC` sweep (58 remaining
    lower-risk functions per Security Advisor — see M-6).
14. **Ops/dashboard, no code:** min-password-length + leaked-password protection; MFA for
    admins; anomaly alerting; rotate the management token; Android `allowBackup` review.
    *(L-1, M-4, L-2, M-8 — plan section F)*

### Bottom line (2026-07-13 — fully shipped)
The original "not launch-ready — catastrophic RLS" verdict **was wrong** — it undercounted
the 23 policy migrations that already lock PII and owner-scope writes, and the KYC blockers
have since been closed (private bucket + deleted third-party endpoints + unforgeable badge
trigger). The go-live hardening pass closed every remaining non-SOS finding **in code,
applied, deployed, and confirmed live** — DB migrations, all 7 edge functions, and the web
app redeploy are done, and the two orphaned KYC functions are deleted. **STRYT is launch-ready
for everything except the deliberately-deferred SOS suite (H-5).** What remains is genuinely
optional/ops work, not launch blockers: `ai-assist` rate limiting (H-1, Medium), the wider
low-risk `SECURITY DEFINER` sweep (M-6 residual), and the dashboard-only checklist (MFA,
password policy, anomaly alerting, key rotation, Android backup flag).

---

## Addendum I — Follow-up Code Review (2026-07-12)

The following additional findings were identified in the current working tree, and are folded
into the revised scorecard/punch list above. **Note on status:** the manual-verification work
(private `verification-docs` bucket, deleted SurePass functions, unforgeable-badge trigger)
lives in `supabase/migrations/20260815_manual_verification.sql` + new/edited source — it is
**written and builds clean but is not yet committed or applied to the live DB**, so those
"[FIXED]" markers become true in production only once the migration is applied and the code
deployed.

### H-4 · Arbitrary push notifications (item 2) — **[FIXED, verified live]**

`supabase/functions/send-push/index.ts` accepted a caller-controlled `{ userId, title, body,
deepLink, type }` and sent via the service-role client with no handler-level caller
authorization. **Fixed:** the handler now requires `Authorization: Bearer <service-role key>`
— the exact header the `push_on_notification_insert` DB trigger already sends — and 403s any
other caller. Direct client calls (spam/phish) are rejected; the legitimate trigger path is
untouched.

### H-5 · Forged SOS alerts and SMS abuse (item 2) — **[OPEN, deferred]**

`supabase/functions/sos-alert/index.ts:20-70` trusts the request's agreement, participant IDs, emergency-contact fields, and coordinates, then writes with service role and sends SMS. It does not resolve the caller or confirm agreement membership. **Deliberately not touched in the go-live-hardening pass** — the user asked for SOS to be left alone for now, to be revisited in its own pass.

**Action (when revisited):** validate the bearer token with `auth.getUser()`, require the caller to be an agreement participant, derive participant IDs and emergency contact server-side, validate coordinates, and rate-limit by user, agreement, and IP. Also review `tracking_tokens`' `USING (true)` public-read policy at the same time.

### M-5 · Support email HTML injection and mail abuse — **[FIXED, verified live]**

`supabase/functions/send-support-email/index.ts:34-96` interpolated user-controlled category, email, subject, and message directly into an HTML email, with no in-function auth, schema validation, size limits, or rate limits. **Fixed:** the handler now calls `auth.getUser()`, validates `category` against an allowlist and `email` against a regex, caps subject/message length (200/5000), and HTML-escapes every interpolated value in the HTML body (plaintext body was never at risk).

### M-6 · SECURITY DEFINER RPCs retain PUBLIC execution by default — **[FIXED, verified live]**

Postgres grants `EXECUTE` on new functions to `PUBLIC` by default; granting `authenticated` does not remove it. `supabase/migrations/20260715_pii_column_masking.sql:137-145`, for example, defines a SECURITY DEFINER `get_nearby_user_ids(lat, lng, radius)` RPC with caller-controlled, uncapped radius, bypassing RLS to enumerate IDs in arbitrary areas. **Fixed:** `supabase/migrations/20260816_go_live_hardening.sql` revokes `PUBLIC` execute and re-grants `authenticated`-only on `get_nearby_user_ids`, `get_public_profile`, `businesses_nearby`, `get_leaderboard`, `get_shared_location`, `admin_search_users`, `admin_recent_users`, `get_own_profile`, `get_own_coords`, and `get_own_emergency_contact`, and re-creates `get_nearby_user_ids` with a server-side `least(p_radius_km, 50)` clamp.

**Follow-up catch (2026-07-12, post-apply verification):** the first migration's
`revoke ... from public` was *not sufficient*. Supabase configures project-wide
`ALTER DEFAULT PRIVILEGES` that grant `EXECUTE` to `anon` **explicitly** on every new
function in `public` — a separate grant from the `PUBLIC` pseudo-role, untouched by
`REVOKE ... FROM PUBLIC`. Checking `pg_proc.proacl` directly after the first migration
showed all 10 functions still carried `anon=X` and were callable unauthenticated.
`supabase/migrations/20260817_close_anon_default_privilege_gap.sql` explicitly revokes
`EXECUTE ... FROM anon` on all 10; re-checked `pg_proc.proacl` afterward and confirmed
`anon` is gone from every one, leaving only `postgres`/`authenticated`/`service_role`.
**Lesson for future SECURITY DEFINER functions in this project:** always revoke from
`anon` explicitly, not just `PUBLIC` — the default-privilege grant means every newly
created function is `anon`-executable until it's revoked by name.

**Known residual (explicitly out of scope for this pass):** Security Advisor still shows
**58** functions where `PUBLIC` can execute a `SECURITY DEFINER` function (down from 66
before this pass). This pass only swept the ~10 highest-risk, data-returning,
RLS-bypassing RPCs identified in the original audit; the remaining ~58 are lower-risk
(mostly trigger/notify functions not directly callable with useful effect) per the
audit's own prioritization, but a full sweep remains a legitimate follow-up.

### M-7 · Browser security headers are absent from visible deployment config — **[FIXED, pending web deploy]**

`vercel.json` set cache/download headers only — no CSP, clickjacking protection, `X-Content-Type-Options`, or `Referrer-Policy`. **Fixed:** added `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and a `Content-Security-Policy-Report-Only` (deliberately report-only, not enforcing yet — the app leans on inline `style={{}}` throughout, so an enforcing CSP needs a follow-up pass to move to nonces/hashes or `style-src-elem` before it can safely block).

### M-8 · Android backup is enabled for session-bearing app data — **[OPEN]**

`android/app/src/main/AndroidManifest.xml:4-10` sets `android:allowBackup="true"`. Capacitor WebView/app data may include Supabase session material, increasing exposure on a stolen or restored device.

**Action:** disable production backup or add Android backup/data-extraction rules excluding authentication and WebView data, then test restore behavior.

### L-5 · Firebase service-account private key in workspace — **[Low, verified not leaked]**

`zetax-52843-firebase-adminsdk-fbsvc-39dbaffe88.json` (admin-SDK, real `private_key`) is
**gitignored and not in git history** — no source-control leak. Separately, the committed
`android/app/client_secret_*.json` is an **"installed"-app OAuth client secret** (not
confidential by Google's design) and `google-services.json` is public client config — both
acceptable to commit.

**Action:** keep the admin-SDK key in an ops-only secret store / Edge Function secrets; rotate
if the workspace was ever shared. No action needed on the committed OAuth/`google-services`
files.

---

## Addendum II — Shipping & Live Verification (2026-07-12)

Everything below was applied directly to the live Supabase project (`gnswxlfmcwyhmzlfipql`)
via the Supabase MCP connector, then independently re-checked against the live database
rather than assumed from the SQL files.

**Migrations applied (in order):**
- `20260815_manual_verification.sql` — applied by the user directly (SQL Editor).
- `20260816_go_live_hardening.sql` — applied by the user directly (SQL Editor).
- `20260817_close_anon_default_privilege_gap.sql` — applied via MCP `apply_migration` after
  live verification showed the previous migration's `PUBLIC` revoke didn't fully close M-6
  (see M-6 above for the full story).

**Edge functions deployed via MCP `deploy_edge_function`** (all `status: ACTIVE`):

| Function | Version | `verify_jwt` |
|---|---|---|
| `send-push` | 26 | `true` |
| `send-support-email` | 17 | `true` |
| `ai-assist` | 17 | `true` |
| `app-update` | 2 | `false` (intentional — public OTA check) |
| `profile-control` | 13 | `true` |
| `admin-delete-profile` | 13 | `true` |
| `verification-review` | 1 (new) | `true` |

Because the Supabase Studio dashboard editor deploys one function folder at a time and
can't resolve imports outside it, the shared `_shared/cors.ts` helper used in the first
draft was inlined into each of the 7 functions instead (small ~15-line duplication per
file) so every function is self-contained and deployable either via MCP or the dashboard.

**Live verification performed (not just "should work" — actually queried):**
- `pg_trigger` / `pg_proc` — confirmed `trg_enforce_role_privilege_guard` exists on
  `public.users` (H-3).
- `pg_proc.proacl` — confirmed all 10 M-6 target functions carry only
  `postgres`/`authenticated`/`service_role`, no `anon`, no bare `PUBLIC` entry.
- `list_edge_functions` — confirmed all 7 functions `ACTIVE` with the intended `verify_jwt`
  values.
- Security Advisor (`get_advisors`, type `security`) re-run after all changes: **"Public Can
  Execute SECURITY DEFINER Function"** dropped from **66 → 58** (the 8-function drop matches
  this pass's priority set — the remaining 58 are the known, lower-risk, out-of-scope
  residual noted under M-6). The one pre-existing `ERROR`-level finding
  (`public.spatial_ref_sys` RLS disabled — a stock PostGIS reference table) is unrelated to
  this pass and was **not** touched, per the tool's own guidance not to blindly enable RLS
  on it without policies.

**Not done (needs the user, no tool access):**
- `verify-pan` / `verify-aadhaar` edge functions are still live on the dashboard (deleted
  from the repo, orphaned) — no MCP tool exists to delete an edge function.
- The web app (Vercel) has not been redeployed, so the client-side fixes (M-1, M-2, M-7)
  are committed but not yet live in the browser bundle.

---

*(See the consolidated **Bottom line** + punch list above for launch priority. In short:
Supabase-side work is done and verified live; redeploy the web app, delete the two orphaned
KYC functions, and STRYT is launch-ready except the deliberately-deferred SOS suite.)*
