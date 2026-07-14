# STRYT — Production Readiness Report

**Date:** 2026-07-14 · **Reviewer:** automated pre-launch audit (code + live Supabase + git state)
**Scope:** ship-readiness of the whole product — not just security (that has its own
`SECURITY_AUDIT.md`, which is green). This report covers the gaps that actually stand between
the current state and a safe public launch.

---

## 🟢 Update — 2026-07-14 (post-action pass)

Since the original audit below, most of it is resolved:
- ✅ **Env confirmed live** — `VITE_USE_MOCKS=false` + real keys set in Vercel; production working.
- ✅ **Deploy topology resolved** — `main` already had the full session's work via PR #2
  (`8689cc7`); the Razorpay-removal commit was fast-forwarded onto `main` too (`4e4e3df`).
- ✅ **Razorpay removed** end-to-end (commit `09436cd`) — payments are UPI-deeplink only.
- ✅ **Android backup hardened** — `allowBackup="false"` (M-8), on branch (`1e9a62c`).
- ✅ **Dead scaffolding removed** — empty `admin-profile-management` / `sync-bug-report` dirs.
- ✅ **Security re-verified** — advisor shows no new issues; the new live-location RPCs are
  `authenticated`-only (not public); only pre-existing `spatial_ref_sys` ERROR remains (stock
  PostGIS table, intentionally untouched).

**What's left is purely manual (dashboard) + optional follow-ups — see the checklist at the
bottom.** The app is functionally live; the residual items are hygiene and scale-hardening, not
blockers.

---

## 🔴 Original verdict (pre-action) — kept for the record

The code is in good shape and security is closed. But there is **one hard blocker that can
break production right now**, plus a handful of pre-launch items. None are architectural.
Realistic distance to launch: **~1–2 focused days**, most of it verification and one merge.

| # | Finding | Severity | Blocks launch? |
|---|---|---|---|
| 1 | Feature branch is **50 commits ahead of `main`, unmerged** — backend already changed, frontend maybe not | 🔴 P0 | **Yes** |
| 2 | `VITE_USE_MOCKS` must be `false` in the Vercel prod env (unverifiable from here) | 🔴 P0 | **Yes** |
| 3 | Orphaned `sos-alert` function still live on the dashboard + MSG91 secrets | 🟠 P1 | Yes (hygiene/safety) |
| 4 | ~~Razorpay unversioned/unreviewed~~ — **REMOVED 2026-07-14** (payments are UPI-deeplink only); dashboard function-delete pending | 🟢 done | — |
| 5 | Live-location "background" capability **not actually installed** (foreground-only today) | 🟠 P1 | Depends on framing |
| 6 | No functional / regression QA pass has been done | 🟠 P1 | Yes (unknown risk) |
| 7 | DB performance: **497 advisor warnings** (auth-init-plan, permissive policies, unindexed FKs) | 🟡 P2 | No (scale risk) |
| 8 | Ops hardening: MFA, password policy, alerting, key rotation, Android backup | 🟡 P2 | No |
| 9 | `ai-assist` has no rate limit | 🟡 P2 | No |
| 10 | Hygiene: uncommitted `index.css`, empty fn dirs, 159 `as any`, DEFINER sweep | ⚪ P3 | No |

---

## 🔴 P0 — Hard blockers

### 1. The branch is not merged — backend/frontend split-brain risk
`reorg/codebase-priority-0-4` is **50 commits ahead of `origin/main`** and not merged, and
`origin/HEAD → main`. Everything from this session — the security fixes, the SOS removal, the
whole live-location feature, the logo — lives only on this branch.

**Why this is dangerous, not just incomplete:** the **database was already changed** (I applied
migrations directly to the live project via MCP — `sos_alerts`, `emergency_contact` columns and
`get_own_emergency_contact()` are **dropped**). But the **old frontend code still on `main`**
still calls `requestService.sosAlert()` → `get_own_emergency_contact()` → the `sos-alert`
function. If Vercel production deploys from `main`, the live site now has frontend code that
calls DB objects that no longer exist → the SOS button **errors at runtime in production right
now**.

**Solution (pick one, then verify the live domain):**
- **Recommended:** merge `reorg/codebase-priority-0-4` → `main` (PR or fast-forward) so frontend
  and backend match, then let Vercel redeploy production.
- Or point the Vercel *Production* branch at `reorg/codebase-priority-0-4` in project settings.
- Then load the production URL and confirm: new "My People" header toggle is present, no old SOS
  button, security headers present (DevTools → Network → response headers).

### 2. `VITE_USE_MOCKS` must be `false` in production
`.env.example` ships `VITE_USE_MOCKS=true` (correct for local dev). In mock mode, OAuth login,
personal-data hydration (bookmarks/follows/lists) and photo uploads **do not hit the real
backend**. This is a host-env setting (Vercel → Project Settings → Environment Variables) and
**cannot be verified from the repo.**

**Solution:** confirm in Vercel that Production has `VITE_USE_MOCKS=false` **and** real
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `VITE_MAPBOX_TOKEN` / `VITE_VAPID_PUBLIC_KEY` /
`VITE_FIREBASE_*`. Then smoke-test a real login + a photo upload on the deployed site.

---

## 🟠 P1 — Fix before public launch

### 3. Orphaned `sos-alert` edge function still live
`list_edge_functions` still shows `sos-alert` ACTIVE (version 16). It's dead (nothing calls it,
its DB target is dropped) but it's an unauthenticated-by-design SMS relay that should not exist.
There is **no MCP tool to delete a function** — must be done in the dashboard.

**Solution:** Supabase → Edge Functions → delete `sos-alert`; remove the `MSG91_AUTH_KEY` /
`MSG91_SOS_TEMPLATE_ID` secrets.

### 4. ~~Payment functions unversioned/unreviewed~~ — RESOLVED (Razorpay removed)
STRYT takes payments via **UPI deeplinks** (`DealUpiSheet` / `PaymentSheet` /
`QueuePaymentSheet` + the claim→confirm `PaymentStatusCard` flow), not Razorpay. The unused/
half-wired Razorpay surface was removed on 2026-07-14 (commit `09436cd`): dead
`paymentService.ts` deleted, checkout + `purchasePlan`/`activatePlan` stripped from
`proService`/`BusinessProUpgrade`, agreement copy relabelled to UPI, and
`checkout.razorpay.com` dropped from the CSP. Build + `tsc` clean.

**Residual (manual):** delete the now-orphaned `create-razorpay-order` and
`verify-razorpay-payment` edge functions from the Supabase dashboard and remove any
`RAZORPAY_*` secrets (no MCP delete-function tool).

### 5. Live-location "background" is not actually shipped
The safety feature is marketed as sharing location "until you turn it off," implying it keeps
working when the phone is locked. The code *prefers* `@capacitor-community/background-geolocation`
via a guarded import — but that package is **not in `package.json`**, so on the real Android app
it falls back to **foreground-only** updates (stops when the app is backgrounded / screen locks).
For a personal-safety feature this is a meaningful gap.

**Solution (pick one):**
- Ship it properly: `npm i @capacitor-community/background-geolocation && npx cap sync`, wire the
  Android foreground-service, add the **Play Store background-location disclosure**, and
  **device-test** lock-screen updates. (Manifest permissions are already added.)
- Or launch v1 honestly as foreground-only and say so in the UI ("keep STRYT open to keep
  sharing"), with background as a fast-follow.

### 6. No functional / regression QA has been done
This session only touched security, the live-location feature, and the logo. The core money-
making flows — onboarding, request → proposal → agreement → payment → rating, queues, appointments,
business/provider consoles, chat — have **not been exercised** this session. A Playwright harness
exists (`npm run audit:mobile` / `audit:desktop`) but wasn't run.

**Solution:** run the Playwright suite against the deployed app, then a manual pass of the top
5 flows on a real device. This is the single biggest *unknown*, even though nothing points to a
specific bug.

---

## 🟡 P2 — Should fix soon (scale + ops)

### 7. Database performance — 497 advisor warnings
Not launch blockers at 75 users, but they compound with growth. From `get_advisors(performance)`:

| Warning | Count | What it means / fix |
|---|---|---|
| **Auth RLS Initialization Plan** | 173 | Policies call `auth.uid()` **per row**. Wrap as `(select auth.uid())` so Postgres evaluates it once — the single highest-ROI DB fix. |
| **Multiple Permissive Policies** | 260 | Several permissive policies on the same table/role/action are each evaluated. Consolidate into one policy per action where possible. |
| **Unindexed foreign keys** | 28 | FKs without a covering index → slow joins and cascade deletes. Add indexes. |
| **Unused Index** | 32 | Dead indexes adding write overhead. Drop after confirming truly unused. |
| **Duplicate Index** | 4 | Redundant indexes. Drop the dupes. |

**Solution:** one "DB performance" migration wrapping `auth.uid()`/`auth.role()` in
sub-selects across policies and adding the 28 FK indexes gets most of the win. Schedule before
any growth push; safe to do post-launch.

### 8. Ops / dashboard hardening (no code)
- **Auth:** min password length ≥ 8 + leaked-password (HIBP) protection.
- **MFA for `admin` / `super_admin`** accounts (they can delete users).
- **Anomaly alerting:** log drains / a cron over `admin_action_logs` + auth logs for failed-login
  and function-error spikes.
- **Rotate** the Supabase management token + Firebase admin-SDK key; keep both out of the repo
  (`zetax-…-firebase-adminsdk-….json` is still present in the workspace — gitignored, not leaked,
  but move it to an ops-only store).
- **Android `allowBackup="true"`** (`AndroidManifest.xml:5`) — session/WebView data can be
  included in device backups; set `false` or add data-extraction rules, then test restore.

### 9. `ai-assist` has no rate limit
Low risk (pure SQL price aggregation, no paid API), but unbounded. Add a per-user/IP throttle.

---

## ⚪ P3 — Hygiene (non-blocking)

- **Uncommitted `src/index.css`** — the current brand-palette (Royal Purple) edit is unstaged.
  Commit or revert so the deploy is deterministic.
- **Empty function dirs** `supabase/functions/admin-profile-management/` and `sync-bug-report/`
  contain no code — delete the scaffolding to avoid confusion.
- **159 `as any` casts** across 229 source files — a type-safety smell, not a bug. Security-
  critical paths are server-enforced regardless, so this is tech-debt, not a blocker.
- **Wider `SECURITY DEFINER` sweep** — 58 lower-risk functions still `PUBLIC`-executable per the
  security advisor (the 10 highest-risk were locked down). Optional follow-up.
- Only **1 `console.log`** and 38 `console.error/warn` in the client — logging hygiene is good.

---

## ✅ What's already solid (so you know where the floor is)

- **Security:** all 12 vuln classes closed, verified live; SOS attack surface removed entirely
  (see `SECURITY_AUDIT.md`). Anon can't read PII; RPCs are `authenticated`-only; admin actions
  are role-checked + audit-logged.
- **Resilience:** root `ErrorBoundary`, offline banner, graceful degradation on failed reads,
  Vercel Analytics + Speed Insights wired.
- **Build:** `tsc` + `vite build` clean; hardcoded-color gate passing; PWA + service-worker
  configured (correctly disabled inside the native WebView).
- **Auth:** short-lived Supabase JWTs, PKCE, refresh rotation; native deep-link OAuth handled.

---

## 🚀 Remaining manual operations (only you can do these)

**Dashboard — Supabase (5 min):**
1. Delete 3 orphaned edge functions + their secrets: `sos-alert` (MSG91_*),
   `create-razorpay-order` + `verify-razorpay-payment` (RAZORPAY_*). No MCP delete tool exists.
2. Auth → enable **min password length ≥ 8** + **leaked-password (HIBP) protection**.
3. Add **MFA** to the `admin` / `super_admin` accounts.

**Git (you said you'll merge later):**
4. Merge `reorg/codebase-priority-0-4` → `main` to bring the **Android backup hardening**
   (`1e9a62c`) onto main. (Razorpay removal is already on main.) Then a native rebuild for the
   `allowBackup=false` + background-location manifest changes to take effect in the APK.

**Product decision — live-location background:**
5. Decide background vs foreground. For true lock-screen updates:
   `npm i @capacitor-community/background-geolocation && npx cap sync`, add the Play Store
   background-location disclosure, and device-test. Else relabel the UI as foreground-only.

**QA (highest-value remaining):**
6. Run `npm run audit:mobile` / `audit:desktop` (Playwright) against production + a manual pass
   of the top flows (onboarding → request → agreement → UPI pay → rating, queues, chat) on a
   real device. Nothing points to a specific bug, but this is the biggest *unverified* area.

**Optional follow-ups (safe post-launch, not blockers):**
7. DB performance migration — wrap `auth.uid()`→`(select auth.uid())` across policies (173
   findings) + add the 28 FK indexes. Do it reviewed (I skipped auto-DDL on live prod to avoid
   guessing column names).
8. Rotate Supabase management token + Firebase admin-SDK key (move out of workspace).
9. `ai-assist` rate limit; wider `SECURITY DEFINER` PUBLIC-execute sweep (58 lower-risk fns).

**Bottom line:** the product is **functionally live and secure**. Everything I could safely do
from here is done and pushed to the branch (Razorpay gone, backup hardened, dead code removed,
security re-verified). The remainder is **dashboard toggles, one git merge, a background-vs-
foreground decision, and a real QA pass** — none of it architectural, none of it blocking the
core app from being used today.
