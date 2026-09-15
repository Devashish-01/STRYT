# Supabase Edge Functions Security Audit

**Project**: STRYT (`gnswxlfmcwyhmzlfipql`)  
**Audit Phase**: P05 (Step 5.D)  
**Date**: 2026-09-15  
**Scope**: All 8 production Supabase Edge Functions in `supabase/functions/`.

---

## 1. Edge Functions Inventory & Configuration Matrix

| Function Name | `verify_jwt` (`config.toml`) | In-Handler Auth Check | Authorization / Role Verification | CORS Configuration | Status |
|---|---|---|---|---|---|
| `admin-delete-profile` | `true` | `sb.auth.getUser(token)` | `users.roles` contains `admin` / `super_admin` | Restricted origin allowlist | ✅ SAFE |
| `ai-assist` | `true` | Gateway JWT | Aggregate SQL stats only (non-sensitive) | Restricted origin allowlist | ✅ SAFE |
| `app-update` | `false` | Public endpoint | Read-only check for OTA bundle manifest | Restricted origin allowlist | ✅ SAFE |
| `profile-control` | `true` | `sb.auth.getUser(token)` | Owner check: `biz.owner_user_id === uid`, `prov.user_id === uid` | Restricted origin allowlist | ✅ SAFE |
| `purge-deleted-accounts` | `false` | Secret key exact match OR `sb.auth.getUser(token)` | Cron secret OR caller's own 30-day expired request | Restricted origin allowlist | ✅ SAFE |
| `send-push` | `false` | Internal secret key exact match | Internal DB trigger only (`apikey === serviceKey`) | Restricted origin allowlist | ✅ SAFE |
| `send-support-email` | `true` | `sb.auth.getUser(token)` | Authenticated user session | Restricted origin allowlist | ✅ SAFE |
| `verification-review` | `true` | `sb.auth.getUser(token)` | `users.roles` contains `admin` / `super_admin` | Restricted origin allowlist | ✅ SAFE |

---

## 2. Common Security Controls Verified

1. **CORS Allowlist (Security Audit M-3)**:
   - None of the 8 edge functions use `Access-Control-Allow-Origin: *`.
   - All 8 functions enforce an inlined origin allowlist:
     ```ts
     const ALLOWED_ORIGINS = new Set([
       "https://stryt.in",
       "https://www.stryt.in",
       "https://localhost",       // Capacitor WebView
       "http://localhost:5173",   // Dev
       "http://localhost:4173",   // Preview
     ]);
     ```
   - Requests from unapproved origins default strictly to `"https://stryt.in"`, preventing cross-origin invocation by malicious web domains.

2. **Secret API Key Handling**:
   - Helper function `secretKey()` in all functions reads the injected `SUPABASE_SECRET_KEYS` map (`keys.default`), with graceful fallback to `SUPABASE_SERVICE_ROLE_KEY`.
   - No hardcoded tokens, passwords, or secret keys exist in source code.

3. **Input Validation & Sanitization**:
   - Strict length and type constraints on payloads.
   - HTML sanitization in mailers (e.g. `escapeHtml` in `send-support-email`) to eliminate HTML injection in operator inboxes.

---

## 3. Deep-Dive Function Audits

### 3.1 `admin-delete-profile`
- **Purpose**: Allows authorized administrators to soft/hard delete users, businesses, or provider profiles with clean asset disposal.
- **Authentication**:
  - Requires `Authorization: Bearer <jwt>`.
  - Validates session with `sb.auth.getUser(token)`.
- **Authorization**:
  - Queries `public.users` for the caller's ID and verifies `roles.includes("admin") || roles.includes("super_admin")`.
  - Full customer user account deletion is strictly restricted to `super_admin`.
  - Enforces explicit typed confirmation string matching (`DELETE <name>`).
  - Blocks deletion if active agreements or held escrow payments exist.
- **Audit Logs**: Every deletion writes an immutable entry to `public.admin_action_logs`.
- **Verdict**: **SAFE**.

### 3.2 `ai-assist`
- **Purpose**: Generates suggested pricing estimates based on historical platform proposals.
- **Authentication**:
  - Gated by API gateway (`verify_jwt = true`).
- **Authorization & Data Exposure**:
  - Takes `categoryId` and `area`, queries historical proposals, and returns aggregate statistics (`avg, low, high, count`).
  - No personal identifiable information (PII), customer names, or individual bid amounts are exposed.
- **Verdict**: **SAFE**.

### 3.3 `app-update`
- **Purpose**: Provides OTA (Over-The-Air) bundle check endpoint for Capacitor's `@capgo/capacitor-updater`.
- **Authentication & Gateway**:
  - `verify_jwt = false` because native mobile clients poll this endpoint on foreground before or during splash screen before any user login exists.
- **Safety**:
  - Endpoint is strictly read-only: downloads `latest.json` from the `app-updates` bucket and checks `MIN_NATIVE_VERSION`.
  - Does not accept modifying commands or execute database mutations.
  - Returns safe `{ message: "no update available" }` on errors or legacy native builds.
- **Verdict**: **SAFE**.

### 3.4 `profile-control`
- **Purpose**: Enables users to disable or enable their own customer, business, or provider profile visibility.
- **Authentication**:
  - Validates session via `sb.auth.getUser(token)`.
- **Authorization**:
  - For `CUSTOMER`: updates only `users` where `id = auth.uid()`.
  - For `BUSINESS`: verifies `biz.owner_user_id === uid` before applying changes.
  - For `PROVIDER`: verifies `prov.user_id === uid` before applying changes.
  - Prevents IDOR (insecure direct object reference) by strictly checking profile ownership.
- **Verdict**: **SAFE**.

### 3.5 `purge-deleted-accounts`
- **Purpose**: Executes permanent deletion/anonymization for accounts that have passed the mandatory 30-day grace period.
- **Authentication**:
  - Gateway `verify_jwt = false` allows the daily cron job to execute using the project's secret API key.
  - Two distinct execution paths:
    1. **Cron / Service Path**: `isServiceCaller(req)` strictly matches `apikey === secretKey()` or `Bearer === secretKey()`. It never parses unverified JWT claims. Only purges accounts with `created_at <= now - 30 days`.
    2. **Self-Serve Path**: Validates user token via `sb.auth.getUser(token)` and enforces that the caller's own account has satisfied the 30-day grace period.
  - Verifies no active agreements or held payments before purging.
- **Verdict**: **SAFE**.

### 3.6 `send-push`
- **Purpose**: Delivers Web Push and FCM push notifications triggered by platform events.
- **Authentication & Internal Gating**:
  - `verify_jwt = false` in `config.toml` because secret keys are not JWTs.
  - Strict in-handler authentication:
    ```ts
    const authorized = !!serviceKey && (apiKeyHeader === serviceKey || bearer === serviceKey);
    if (!authorized) {
      return json({ error: "Forbidden: internal use only" }, 403, cors);
    }
    ```
  - Without the exact secret key, callers receive HTTP 403 Forbidden.
  - Prevents external actors from sending push notifications or spoofing system messages.
- **Privacy & User Controls**:
  - Gated by recipient push preferences (`notif_new_business`, `notif_nearby_requests`, `notif_offers`).
  - Respects quiet hours (`notif_quiet_hours`) and silent preferences (`notif_silent`).
- **Verdict**: **SAFE**.

### 3.7 `send-support-email`
- **Purpose**: Sends support inquiries and user complaints via SMTP.
- **Authentication**:
  - Gateway `verify_jwt = true` plus in-handler `sb.auth.getUser(token)` verification.
  - Rejects unauthenticated callers (401).
- **Input Sanitization & Injection Prevention**:
  - Category strictly restricted to `ALLOWED_CATEGORIES` allowlist.
  - Email format validated via regex.
  - Maximum character limits enforced on subject and message body.
  - Complete HTML entity escaping prevents email injection attacks.
- **Verdict**: **SAFE**.

### 3.8 `verification-review`
- **Purpose**: Administrative review workflow for business and provider KYC documents.
- **Authentication**:
  - Gateway `verify_jwt = true` plus in-handler `sb.auth.getUser(token)`.
- **Authorization**:
  - Strictly requires `roles.includes("admin") || roles.includes("super_admin")`.
  - Non-admins receive HTTP 403 Forbidden.
- **Document Access Security**:
  - Verification documents are kept in private bucket `verification-docs`.
  - Document viewing generates temporary, short-lived (300-second) signed URLs (`createSignedUrl(p, 300)`).
  - All review decisions (`APPROVE`, `REJECT`, `SUSPEND`) are logged in `admin_action_logs`.
  - Database trigger `enforce_manual_verification_decision` independently blocks non-admin status writes.
- **Verdict**: **SAFE**.

---

## 4. Audit Conclusion

All 8 Supabase Edge Functions implement robust defense-in-depth:
- JWT verification or secret-key exact matching on all endpoints.
- Role-based authorization (`admin` / `super_admin`) on privileged endpoints.
- Ownership checks on self-serve user endpoints.
- Strict CORS allowlists avoiding wildcard origins.
- Safe secret handling utilizing platform secret injection.
- Zero authorization or injection vulnerabilities identified.
