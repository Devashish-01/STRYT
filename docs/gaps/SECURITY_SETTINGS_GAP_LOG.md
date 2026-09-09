# STRYT — Flow 11.4: Entity Password & Security Settings Gap Log

**Audit Date:** September 9, 2026  
**Flow Identifier:** Flow 11.4 — Domain 11 (Account, Multi-Role & Platform Security)  
**Primary Components:** [`SecuritySettings.tsx`](file:///d:/zetax/name/STRYT/src/screens/settings/SecuritySettings.tsx), [`PinGateSheet.tsx`](file:///d:/zetax/name/STRYT/src/components/PinGateSheet.tsx), [`PinEntrySheet.tsx`](file:///d:/zetax/name/STRYT/src/components/PinEntrySheet.tsx), [`PasswordRecoverySheet.tsx`](file:///d:/zetax/name/STRYT/src/components/entity-password/PasswordRecoverySheet.tsx), [`RecoveryBackfillSheet.tsx`](file:///d:/zetax/name/STRYT/src/components/entity-password/RecoveryBackfillSheet.tsx), [`RecoveryQuestionStep.tsx`](file:///d:/zetax/name/STRYT/src/components/entity-password/RecoveryQuestionStep.tsx)  
**Backend Services & Tables:** [`entityPasswordService.ts`](file:///d:/zetax/name/STRYT/src/services/core/entityPasswordService.ts), [`entityPasswordRecovery.ts`](file:///d:/zetax/name/STRYT/src/lib/entityPasswordRecovery.ts), `public.users`, `public.entity_password_attempts`, `public.entity_recovery_attempts`, `supabase/migrations/20260850_entity_passwords.sql`, `supabase/migrations/20260856_entity_password_recovery.sql`  
**Launch Readiness Status:** 🔴 **Critical Audit Blockers (Client-Side-Only PIN Gate with Zero Server RLS Enforcement, Shared Rate-Limit Window Enabling Staff DoS on Store Owner, Instant Destructive Removal of Password & Recovery Without Confirmation, Predictable Lockout Window Without Exponential Backoff)**

---

## 1. Executive Summary

Flow 11.4 manages merchant and provider console credentials ("Entity Passwords") and backup recovery questions across STRYT. It controls access security when switching into business storefront consoles (`/business/:id/manage`) or provider profiles (`/provider/:id/dashboard`). The flow encompasses:
1. **Security Settings Hub ([`SecuritySettings.tsx`](file:///d:/zetax/name/STRYT/src/screens/settings/SecuritySettings.tsx)):** Enables business owners and solo service providers to configure, change, or remove console passwords, monitor protection status, and manage backup security questions.
2. **Context Switch Interceptor ([`PinGateSheet.tsx`](file:///d:/zetax/name/STRYT/src/components/PinGateSheet.tsx)):** Intercepts role and context switches from `store.tsx:attemptSwitchContext`, presenting a PIN entry sheet whenever an entity password is required.
3. **PIN Entry & First-Time Setup Wizard ([`PinEntrySheet.tsx`](file:///d:/zetax/name/STRYT/src/components/PinEntrySheet.tsx)):** Handles PIN entry, current PIN verification, password confirmation, and mandatory backup question creation for new password setups.
4. **Password Recovery & Backfill Flow ([`PasswordRecoverySheet.tsx`](file:///d:/zetax/name/STRYT/src/components/entity-password/PasswordRecoverySheet.tsx), [`RecoveryBackfillSheet.tsx`](file:///d:/zetax/name/STRYT/src/components/entity-password/RecoveryBackfillSheet.tsx)):** Allows owners to reset forgotten console passwords by answering predefined or custom security questions.

While the backend architecture uses bcrypt hashing (`crypt()`), constant-time dummy comparisons (`v_dummy_hash`) to defeat timing attacks, and normalized recovery answers, detailed line-by-line inspection of the implementation revealed critical security, authorization, and denial-of-service vulnerabilities:

1. **Client-Side-Only PIN Gate with Zero Server-Side Enforcement (P0):** `verify_business_password` and `verify_provider_password` return only a boolean (`true`/`false`). Neither function issues a cryptographically signed token, session claim, or temporary database unlock grant. In `PinGateSheet.tsx`, successful verification simply runs `confirmPendingSwitch()`, which persists the new context to `localStorage`. PostgreSQL Row Level Security (RLS) policies on `businesses`, `catalog_items`, `agreements`, `orders`, and `delivery_batches` only check account ownership or active delegation grants—they never check whether an entity password was supplied. Any direct browser navigation to `/business/:id/manage` or automated API script completely bypasses the PIN gate.
2. **Team Member Guess Lockout Locks Out the Business Owner (DoS Vector) (P0):** In `20260850_entity_passwords.sql`, rate limiting in `entity_password_attempts` is keyed strictly on `(owner_user_id, kind)`. When any delegated team member fails 5 password attempts, the owner's record is locked for 15 minutes (`locked_until`). Because verification checks `v_attempt.locked_until > now()`, **the store owner themselves is locked out of their own business console**, creating an easy DoS vector for rogue or confused staff during peak rush hours.
3. **Instant Password & Recovery Deletion Without Secondary Confirmation (P1):** In `SecuritySettings.tsx` and `clear_entity_password`, entering the current PIN once immediately wipes both the password hash AND the backup recovery question (`business_recovery_question_id = null`, `answer_hash = null`) with no confirmation modal, no cooldown, and no email/SMS alert.
4. **Short Lockout Window Enables Distributed PIN Brute-Force (P1):** `_verify_entity_password` locks for 15 minutes after 5 failures and then completely resets. For 4-to-6 digit PINs, an attacker gets 480 attempts per day with no exponential backoff or owner alert.
5. **Recovery Question Character Length Mismatch (P2):** DB enforces `3 <= length(custom_question) <= 120` and `length(answer) >= 3`. In `RecoveryQuestionStep.tsx`, textarea allows 120 chars, but inputs allow 80 chars for answer, and failure messages from DB exception strings surface raw SQL exceptions if length constraints fail.
6. **Stale Recovery Question Label Cache in Security Settings (P2):** When a user updates their recovery question in `RecoveryBackfillSheet`, the `EntityPasswordSecurityCard` child component in `SecuritySettings.tsx` does not refetch the question text, continuing to display the stale question prompt until the entire screen is unmounted or refreshed.

---

## 2. Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **SEC-1** | Client-Side-Only PIN Gate with Zero Server RLS Enforcement | 🔴 P0 (Critical Security Bypass) | `verify_business_password` returns a boolean without issuing an auth token or session grant. Direct URL navigation or REST requests to `/business/:id/manage` bypass PIN protection entirely. |
| **SEC-2** | Shared Rate Limiter Locks Out Store Owner on Staff Failed Guesses | 🔴 P0 (Severe Availability / DoS) | `entity_password_attempts` keys rate limits by `(owner_user_id, kind)`. 5 failed attempts by any delegated team member locks out the owner from their own business during peak hours. |
| **SEC-3** | Instant Destructive Removal of Password & Recovery Without Confirmation | 🟠 P1 (Data Loss & Security Weakening) | `clear_entity_password` permanently drops password and recovery questions in one click without a secondary warning dialog, cooldown, or audit notification. |
| **SEC-4** | Static 15-Minute Lockout Window Enables Distributed PIN Brute-Force | 🟠 P1 (Brute-Force Risk) | After 15 minutes, `locked_until` expires and failed count resets. Permits 480 automated attempts per day with zero exponential backoff or owner security alert. |
| **SEC-5** | Recovery Q&A Length Mismatch & Raw SQL Exception Surfacing | 🟡 P2 (UX Exception Leak) | Database throws uncaught Postgres exceptions if answer > 80 chars or custom question < 3 chars, surfacing raw database errors or generic failure toasts. |
| **SEC-6** | Stale Recovery Question Label Cache in Security Settings Hub | 🟡 P2 (State Synchronization Gap) | Updating recovery questions in `RecoveryBackfillSheet` does not refresh the `recoveryLabel` state in `EntityPasswordSecurityCard`, showing stale prompts until reload. |

---

## 3. Detailed Findings & Root Cause Analysis

---

### 🔴 SEC-1 (P0): Client-Side-Only PIN Gate with Zero Server-Side RLS Enforcement

- **Location:** [`src/components/PinGateSheet.tsx:40-44`](file:///d:/zetax/name/STRYT/src/components/PinGateSheet.tsx#L40-L44), [`src/store.tsx:attemptSwitchContext`](file:///d:/zetax/name/STRYT/src/store.tsx), [`supabase/migrations/20260850_entity_passwords.sql:119-134`](file:///d:/zetax/name/STRYT/supabase/migrations/20260850_entity_passwords.sql#L119-L134)
- **Root Cause:**
  1. In `PinGateSheet.tsx`, when a PIN is verified:
     ```tsx
     function finishSwitch() {
       const dest = confirmPendingSwitch();
       if (dest) nav(dest);
     }
     ```
  2. `confirmPendingSwitch()` simply mutates React state and writes to `localStorage`:
     ```ts
     localStorage.setItem("activeContext", JSON.stringify(pendingContextSwitch.ctx));
     setActiveContext(pendingContextSwitch.ctx);
     ```
  3. The backend RPC `verify_business_password` returns `boolean`:
     ```sql
     create or replace function public.verify_business_password(p_business_id text, p_password text)
     returns boolean
     ...
     return public._verify_entity_password('business', v_owner, p_password);
     ```
  4. Notice that no temporary grant row, signed session token, or cookie is stored.
  5. In Supabase RLS policies across `businesses`, `catalog_items`, `agreements`, `orders`, and `delivery_batches`, policies grant access whenever `auth.uid() = owner_user_id` or an active record exists in `business_access_sessions`. The database RLS engine has no knowledge of whether an entity password was ever entered.
  6. If an unauthorized person on a shared device navigates directly to `http://localhost:5173/business/biz_123/manage`, the client router mounts `BusinessManager.tsx` directly without triggering `PinGateSheet`, and Supabase executes all queries successfully!
- **Remediation Plan:**
  - In `PinGateSheet` and routing guards, enforce that protected routes verify password unlock state in session memory.
  - Implement a server-side session unlock verification table (`entity_password_unlocks` with `user_id`, `entity_id`, `unlocked_until`) or signed session token so RLS or Edge Functions can validate unlock validity before executing sensitive administrative actions (e.g. payout modification, staff delegation).

---

### 🔴 SEC-2 (P0): Shared Rate Limiter Locks Out Store Owner on Staff Failed Guesses (DoS Vector)

- **Location:** [`supabase/migrations/20260850_entity_passwords.sql:60-112, 119-131`](file:///d:/zetax/name/STRYT/supabase/migrations/20260850_entity_passwords.sql#L60-L112)
- **Root Cause:**
  1. In `20260850_entity_passwords.sql`, `_verify_entity_password` checks and records lockouts:
     ```sql
     select * into v_attempt from public.entity_password_attempts
      where owner_user_id = p_owner_user_id and kind = p_kind for update;
     if v_attempt.locked_until is not null and v_attempt.locked_until > now() then
       return false;
     end if;
     ```
  2. In `verify_business_password`:
     ```sql
     if p_business_id is null then
       v_owner := auth.uid()::text;
     else
       select owner_user_id into v_owner from public.businesses where id = p_business_id;
     end if;
     return public._verify_entity_password('business', v_owner, p_password);
     ```
  3. When a delegated staff member attempts to unlock the business console, `v_owner` is the store owner's UUID.
  4. If the staff member mistypes the PIN 5 times (or an employee is terminated and maliciously inputs 5 wrong PINs), `entity_password_attempts` sets `locked_until = now() + 15 minutes` for the OWNER's account.
  5. The real owner of the business, sitting at their POS register during peak lunch rush, attempts to open their console or change settings. Because `locked_until > now()`, the owner's own correct PIN returns `false`!
- **Remediation Plan:**
  - Partition rate-limiting records by `(owner_user_id, caller_user_id, kind)` in `entity_password_attempts`.
  - A delegated user failing 5 attempts must only lock out *their own user account* from accessing the business, while leaving the business owner's direct access unblocked.

---

### 🟠 SEC-3 (P1): Instant Destructive Removal of Password & Recovery Without Confirmation

- **Location:** [`src/screens/settings/SecuritySettings.tsx:34-45`](file:///d:/zetax/name/STRYT/src/screens/settings/SecuritySettings.tsx#L34-L45), [`supabase/migrations/20260856_entity_password_recovery.sql:440-485`](file:///d:/zetax/name/STRYT/supabase/migrations/20260856_entity_password_recovery.sql#L440-L485)
- **Root Cause:**
  1. In `SecuritySettings.tsx`:
     ```tsx
     async function handleRemovePassword(kind: EntityPasswordKind, pin: string) {
       setRemovingPin(true);
       try {
         await entityPasswordService.clear(kind, pin);
         await refreshEntityPasswordStatus();
         showToast(`${kind === "business" ? "Business" : "Provider"} password removed`);
         setPinSheet(null);
       }
     ```
  2. In `clear_entity_password`:
     ```sql
     if p_kind = 'business' then
       update public.users
          set business_password_hash = null,
              business_recovery_question_id = null,
              business_recovery_question_text = null,
              business_recovery_answer_hash = null
        where id = v_uid;
     ```
  3. Once the current PIN is verified, the password AND all configured recovery credentials are deleted instantly with zero confirmation prompt, zero undo window, and zero security alert notification sent to the owner's phone or email.
  4. If a merchant accidentally clicks "Remove" and verifies their PIN assuming they were changing it, their entire recovery question setup is wiped and must be recreated from scratch.
- **Remediation Plan:**
  - Add a distinct confirmation step in `SecuritySettings.tsx` explaining that removing the password permanently deletes the backup recovery question.
  - Require explicit acknowledgment before calling `clear()`.

---

### 🟠 SEC-4 (P1): Static 15-Minute Lockout Window Enables Distributed PIN Brute-Force

- **Location:** [`supabase/migrations/20260850_entity_passwords.sql:72-109`](file:///d:/zetax/name/STRYT/supabase/migrations/20260850_entity_passwords.sql#L72-L109)
- **Root Cause:**
  1. The lockout algorithm uses fixed constants:
     ```sql
     v_max_attempts constant integer := 5;
     v_window constant interval := interval '15 minutes';
     ```
  2. When 5 attempts fail, `locked_until` is set to `now() + 15 minutes`.
  3. Crucially, after 15 minutes pass:
     ```sql
     when entity_password_attempts.last_attempt_at <= now() - v_window
       or entity_password_attempts.locked_until is not null
     then 1 else entity_password_attempts.fail_count + 1 end
     ```
  4. The failure count completely resets to 1.
  5. For 4-digit numeric PINs (10,000 possibilities) or short 6-digit PINs, an automated attacker can submit 5 attempts every 15 minutes = 20 attempts/hour = 480 attempts/day. Over a few weeks, a low-entropy PIN will be cracked without ever triggering an account freeze or security warning alert.
- **Remediation Plan:**
  - Introduce progressive exponential backoff (5 failures = 15m, 10 failures = 1 hour, 15 failures = 24 hours).
  - Emit an in-app security notification (`notificationService`) to the owner upon entering any lockout state.

---

### 🟡 SEC-5 (P2): Recovery Q&A Length Mismatch & Raw SQL Exception Surfacing

- **Location:** [`supabase/migrations/20260856_entity_password_recovery.sql:85-91, 281-285`](file:///d:/zetax/name/STRYT/supabase/migrations/20260856_entity_password_recovery.sql#L85-L91), [`src/components/entity-password/RecoveryQuestionStep.tsx`](file:///d:/zetax/name/STRYT/src/components/entity-password/RecoveryQuestionStep.tsx)
- **Root Cause:**
  1. The database strictly enforces:
     ```sql
     if length(v_normalized) < 3 then raise exception 'Answer must be at least 3 characters'; end if;
     if length(v_normalized) > 80 then raise exception 'Answer must be at most 80 characters'; end if;
     ```
  2. In `RecoveryQuestionStep.tsx`, client-side input validation fails to enforce the exact same 3-character minimum or 80-character maximum before submitting to the RPC.
  3. When an input violates this rule, Supabase returns a Postgres exception that is surfaced directly to the user as a raw string or an uninformative error banner.
- **Remediation Plan:**
  - Enforce `maxLength={80}` and `minLength={3}` directly on the input element in `RecoveryQuestionStep.tsx`.
  - Provide immediate inline validation feedback if an answer is too short or too long before enabling the submit button.

---

### 🟡 SEC-6 (P2): Stale Recovery Question Label Cache in Security Settings Hub

- **Location:** [`src/screens/settings/SecuritySettings.tsx:148-160`](file:///d:/zetax/name/STRYT/src/screens/settings/SecuritySettings.tsx#L148-L160)
- **Root Cause:**
  1. `EntityPasswordSecurityCard` maintains local state:
     ```tsx
     const [recoveryLabel, setRecoveryLabel] = useState<string | null>(null);

     useEffect(() => {
       if (!passwordIsSet || !recoveryIsSet) {
         setRecoveryLabel(null);
         return;
       }
       let cancelled = false;
       void entityPasswordService.getRecoveryQuestion(kind).then((q) => {
         if (cancelled || !q) return;
         setRecoveryLabel(recoveryQuestionLabel(q.questionId, q.questionText));
       });
       return () => { cancelled = true; };
     }, [kind, passwordIsSet, recoveryIsSet]);
     ```
  2. Notice the dependency array: `[kind, passwordIsSet, recoveryIsSet]`.
  3. When a user who already has recovery set opens `RecoveryBackfillSheet` and updates their question to a new one, `recoveryIsSet` remains `true`.
  4. Upon saving, `onSaved={() => setRecoveryBackfill(null)}` runs. Neither `passwordIsSet` nor `recoveryIsSet` has toggled.
  5. The `useEffect` does NOT re-run, leaving the card displaying the *previous* recovery question until the screen is refreshed.
- **Remediation Plan:**
  - Add a refresh trigger counter or include an explicit refetch callback in `EntityPasswordSecurityCard` triggered on `RecoveryBackfillSheet.onSaved`.

---

## 4. Verification & Validation Plan

### Automated Regression Verification
- [ ] Run `npm run check-colors` to guarantee zero raw hex color leaks in security sheets.
- [ ] Run `npx tsc --noEmit` to verify type safety across `entityPasswordService.ts`, `PinGateSheet.tsx`, and `SecuritySettings.tsx`.

### Manual Test Steps
1. **Direct Route Traversal:**
   - With an entity password set on business `biz_test`, navigate directly to `/business/biz_test/manage` in the browser bar.
   - Verify that access is gated by the PIN challenge sheet rather than rendering the management screen.
2. **Staff Lockout Isolation:**
   - Log in as a delegated staff member.
   - Intentionally fail 5 PIN attempts on the business console.
   - Verify the staff member is locked out for 15 minutes.
   - Log in as the business owner; verify the owner can still log in and switch into their console without being locked out.
3. **Password Removal Confirmation:**
   - In `/settings/security`, tap "Remove" on a protected console.
   - Confirm a confirmation modal appears warning that backup questions will also be cleared.
   - Proceed and verify status indicators update cleanly to "Not set".
4. **Recovery Question Refresh:**
   - Update backup question from preset to custom.
   - Verify the question preview updates immediately without requiring a browser page refresh.
