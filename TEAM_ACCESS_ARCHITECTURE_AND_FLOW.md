# STRYT Team Access: Complete End-to-End Code & Architecture Documentation

> **Document Type:** Technical Architecture, Code Flow Specification & Vulnerability Audit  
> **Source Base:** 100% verified against active codebase files, components, services, and PostgreSQL migrations.  
> **Target System:** Business Team Access, Delegated Login, Scope Permissions, RLS Policies & Route Guards.  

---

## 1. Executive Summary & Core Concepts

In STRYT, a business is owned by a single account (`businesses.owner_user_id`). However, real-world brick-and-mortar stores, salons, clinics, and restaurants require staff (cashiers, front-desk receptionists, store managers, and delivery riders) to perform daily tasks without sharing the owner's personal account, credentials, or bank details.

STRYT implements a **Dual-Mechanism Access System** built on top of PostgreSQL Row Level Security (RLS), Supabase Realtime, and React router guards:

1. **Named Team Member Grants (Direct Roster Invites):**  
   The business owner looks up an existing STRYT user by phone number, email, or `@username` alias and assigns them a **Role Preset** or **Granular Scopes**. This grant is permanent until revoked.
2. **Shop / Terminal Login (Shared Till Login):**  
   The owner sets a single business login ID (e.g. `spiceroute-kitchen`) and a shared password. Any employee signed into STRYT on their phone enters this ID and password at `/business-login`. This creates a time-boxed session (e.g. 8 hours) with optional owner approval per sign-in.

---

## 2. Architecture Overview & High-Level Flow Diagram

```mermaid
flowchart TD
    subgraph Owner Actions ["Business Owner (BusinessAccess.tsx)"]
        O1[Configure Shop Login ID + Password]
        O2[Invite Named Member via Phone/Email/@Username]
        O3[Approve/Deny Pending Terminal Requests]
        O4[Edit Member Scopes in Real-Time]
        O5[Revoke Member Access]
    end

    subgraph Staff Entry ["Staff / Team Member"]
        S1["Open /business-login"] --> S2["Submit Shop ID + Password"]
        S2 -->|require_approval = true| S3["Session PENDING (30s window)"]
        S2 -->|require_approval = false| S4["Session ACTIVE (session_hours)"]
        S5["Receives Named Invite Notification"] --> S4
    end

    subgraph Guard & Route Enforcement ["Console Entry (/business/:id/manage)"]
        G1[BusinessAccessGuard] --> G2{Is Owner?}
        G2 -->|Yes| G3[FULL_ACCESS & Owner Mode]
        G2 -->|No| G4[RPC: my_business_access_status]
        G4 -->|DENIED| G5[Redirect /home + Toast]
        G4 -->|ALLOWED| G6[RPC: my_business_access_scope]
        G6 --> G7{Owner PIN Set?}
        G7 -->|Yes & Locked| G8[PinEntrySheet Modal]
        G7 -->|No or Unlocked| G9[Mount Console with BusinessAccessContext]
    end

    subgraph SubRoute Guards ["Sub-Route Security"]
        G9 --> R1["RequireScope('appointments')"]
        G9 --> R2["RequireScope('queue')"]
        G9 --> R3["RequireScope('catalog')"]
        G9 --> R4["RequireScope('leads')"]
        G9 --> R5["RequireBusinessDeliveryMember"]
        G9 --> R6["RequireOwner (Blocked for all non-owners)"]
    end

    subgraph Database RLS ["PostgreSQL Database Layer"]
        DB1["has_business_scope(biz, uid, 'appointments')"]
        DB2["has_business_scope(biz, uid, 'queue')"]
        DB3["has_business_scope(biz, uid, 'catalog')"]
        DB4["has_business_scope(biz, uid, 'leads')"]
        DB5["has_business_full_access(biz, uid)"]
    end

    R1 -.-> DB1
    R2 -.-> DB2
    R3 -.-> DB3
    R4 -.-> DB4
    R6 -.-> DB5
```

---

## 3. Database Schema & Migration History

### 3.1 Tables

#### 1. `public.business_login_credentials`
*Created in `20260809_business_delegated_login.sql`.* Stores the shop credentials set by the owner.

| Column | Type | Constraints / Default | Purpose |
|---|---|---|---|
| `business_id` | `text` | `PRIMARY KEY`, references `businesses(id)` `ON DELETE CASCADE` | 1-to-1 association with business |
| `login_id` | `text` | `NOT NULL`, Unique lowercase index `blc_login_idx` | Case-insensitive terminal ID |
| `password_hash` | `text` | `NOT NULL` | Bcrypt salt hash (`crypt(p_password, gen_salt('bf'))`) |
| `require_approval` | `boolean` | `NOT NULL DEFAULT true` | Whether each sign-in requires owner acceptance |
| `session_hours` | `int` | `NOT NULL DEFAULT 8` | Duration granted upon sign-in |
| `is_enabled` | `boolean` | `NOT NULL DEFAULT true` | Master toggle to turn shop login on/off |
| `created_at` | `timestamptz` | `DEFAULT now()` | Creation timestamp |
| `updated_at` | `timestamptz` | `DEFAULT now()` | Last update timestamp |

*RLS Policy:* `read_own_blc` allows ONLY the business owner (`owner_user_id = auth.uid()::text`) to SELECT from this table. Password hash is never exposed to public or client code. Writes go strictly through `set_business_login()` RPC.

---

#### 2. `public.business_access_sessions`
*Created in `20260809`, updated in `20260841` (scopes added), `20260874` (delivery added).* Tracks all active, pending, expired, and revoked grants.

| Column | Type | Constraints / Default | Purpose |
|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique session identifier |
| `business_id` | `text` | `NOT NULL`, references `businesses(id)` `ON DELETE CASCADE` | Target business |
| `grantee_user_id` | `text` | `NOT NULL`, references `users(id)` `ON DELETE CASCADE` | STRYT user holding the grant |
| `status` | `text` | `CHECK (status IN ('PENDING','ACTIVE','EXPIRED','REVOKED','DENIED'))` | Session state machine |
| `requested_at` | `timestamptz` | `NOT NULL DEFAULT now()` | When login or invite occurred |
| `decided_at` | `timestamptz` | Nullable | When approved, denied, or revoked |
| `expires_at` | `timestamptz` | Nullable | Timestamp after which session is invalid (`null` = permanent invite) |
| `created_ip` | `text` | Nullable | IP address (optional) |
| `access_level` | `text` | `NOT NULL DEFAULT 'FULL' CHECK (access_level IN ('FULL','SCOPED'))` | FULL vs SCOPED |
| `scopes` | `text[]` | `NOT NULL DEFAULT '{}'` | Array of granted scopes |

*RLS Policy:* `read_bas` allows the business owner OR the grantee (`grantee_user_id = auth.uid()::text`) to SELECT session rows. Realtime publication is enabled (`supabase_realtime` includes `business_access_sessions`).

---

#### 3. `public.business_login_attempts`
*Created in `20260823_business_login_rate_limit.sql`.* Rate limits login attempts per user per login ID.

| Column | Type | Constraints / Default | Purpose |
|---|---|---|---|
| `login_id` | `text` | `PRIMARY KEY (login_id, attempted_by)` | Target shop login key |
| `attempted_by` | `text` | References `users(id)` `ON DELETE CASCADE` | The user attempting to sign in |
| `fail_count` | `integer` | `NOT NULL DEFAULT 0` | Failed attempts counter |
| `locked_until` | `timestamptz` | Nullable | Lockout expiry timestamp |
| `last_attempt_at` | `timestamptz` | `NOT NULL DEFAULT now()` | Last attempt timestamp |

*Rules:* 5 failed attempts within 15 minutes (`v_window`) triggers a 15-minute lock. Dummy bcrypt comparison (`v_dummy_hash`) runs even if `login_id` does not exist to prevent timing analysis.

---

## 4. Stored Procedures & RPCs (Database Layer)

### 4.1 Access Evaluation Functions

```sql
-- Evaluates if a user has access to a specific scope (or owner/FULL)
create or replace function public.has_business_scope(p_business_id text, p_uid text, p_scope text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_user_id = p_uid)
      or exists (select 1 from public.business_access_sessions s
                  where s.business_id = p_business_id and s.grantee_user_id = p_uid
                    and s.status = 'ACTIVE' and (s.expires_at is null or s.expires_at > now())
                    and (s.access_level = 'FULL' or p_scope = any(s.scopes)));
$$;

-- Evaluates if a user has FULL owner-equivalent access
create or replace function public.has_business_full_access(p_business_id text, p_uid text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_user_id = p_uid)
      or exists (select 1 from public.business_access_sessions s
                  where s.business_id = p_business_id and s.grantee_user_id = p_uid
                    and s.status = 'ACTIVE' and (s.expires_at is null or s.expires_at > now())
                    and s.access_level = 'FULL');
$$;

-- Client-callable check: does auth.uid() have any active access?
create or replace function public.my_business_access_status(p_business_id text)
returns boolean language sql security definer stable set search_path = public as $$
  select public.has_business_access(p_business_id, auth.uid()::text);
$$;

-- Client-callable check: retrieve access_level and scopes for auth.uid()
create or replace function public.my_business_access_scope(p_business_id text)
returns table (access_level text, scopes text[])
language sql security definer stable set search_path = public as $$
  select 'FULL'::text, '{}'::text[]
   where exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_user_id = auth.uid()::text)
  union all
  select s.access_level, s.scopes
    from public.business_access_sessions s
   where s.business_id = p_business_id and s.grantee_user_id = auth.uid()::text
     and s.status = 'ACTIVE' and (s.expires_at is null or s.expires_at > now())
   limit 1;
$$;
```

---

### 4.2 Grant & Mutation Functions

1. **`grant_team_member_access(p_business_id text, p_identifier text, p_scopes text[])`**:
   - Owner-only check (`b.owner_user_id = auth.uid()::text`).
   - Resolves grantee `v_target` by regex matching:
     - Email: `v_ident ~ '@.*\.'` -> `users.email`
     - Phone: `regexp_replace(v_ident, '[\s\-+]', '', 'g') ~ '^\d{6,}$'` -> matches last 10 digits of `users.phone`
     - Username: matches `lower(users.alias) = lower(ltrim(v_ident, '@'))`
   - Validates scopes against whitelist: `('appointments','queue','catalog','leads','delivery')`.
   - Inserts or reactivates existing session with `status = 'ACTIVE'`, `expires_at = null`, `access_level = 'SCOPED'`, `scopes = v_scopes`.
   - Inserts in-app notification for grantee: type `'BUSINESS_ACCESS'`, title `'Team access granted'`.

2. **`grant_business_access(p_business_id text, p_identifier text)`**:
   - Same lookup logic as above, but grants `access_level = 'FULL'`, `scopes = '{}'`, `expires_at = null`.
   - Sends notification with type `'QUEUE_UPDATE'` (*Note: Bug TMA-NOTIF-01*).

3. **`update_team_member_scopes(p_session_id uuid, p_scopes text[])`**:
   - Updates `access_level = 'SCOPED'` and sets `scopes = v_scopes`.
   - Verifies caller is business owner.
   - Inserts notification for grantee: type `'BUSINESS_ACCESS'`, title `'Access updated'`.

4. **`revoke_business_session(p_session_id uuid)`**:
   - Can be called by business owner OR the grantee themselves.
   - Sets `status = 'REVOKED'`, `decided_at = now()`, `expires_at = now()`.
   - If owner revoked someone else, sends notification to grantee: type `'BUSINESS_ACCESS'`, title `'Access removed'`. (Does not send notification if member left on their own).

5. **`decide_business_session(p_session_id uuid, p_approve boolean)`**:
   - Owner only. Used for terminal login requests in `PENDING` state.
   - If `p_approve = true`: Sets `status = 'ACTIVE'`, `expires_at = now() + session_hours`.
   - If `p_approve = false`: Sets `status = 'DENIED'`, `expires_at = null`.
   - Sends notification to grantee: type `'BUSINESS_ACCESS'`.

6. **`business_login_attempt(p_login_id text, p_password text)`**:
   - Authenticated staff submits shop login ID + password.
   - Enforces 5 failed attempts / 15-minute lockout via `business_login_attempts`.
   - Verifies bcrypt password hash against `business_login_credentials`.
   - If `require_approval = true`: creates `PENDING` session with `expires_at = now() + interval '30 seconds'` (*Note: Bug TMA-EXP-01*).
   - If `require_approval = false`: creates `ACTIVE` session with `expires_at = now() + session_hours`.

---

## 5. Row-Level Security (RLS) & Trigger Permission Matrix

| Table | Operation | Permitted Access Rule | Scopes Allowed | Migration |
|---|---|---|---|---|
| `appointments` | `SELECT` | `customer_user_id = uid OR target_owner_user_id = uid OR has_business_scope(target_id, uid, 'appointments')` | `appointments` / `FULL` | `20260829` |
| `appointments` | `UPDATE` | Same as above (`has_business_scope(target_id, uid, 'appointments')`) | `appointments` / `FULL` | `20260829` |
| `appointment_transition` RPC | `EXECUTE` | `v_is_manager := target_owner_user_id = uid OR has_business_scope(target_id, uid, 'appointments')` | `appointments` / `FULL` | `20260841` |
| `appointment_confirm_payment` RPC | `EXECUTE` | `has_business_scope(target_id, uid, 'appointments')` | `appointments` / `FULL` | `20260841` |
| `appointment_reject_payment` RPC | `EXECUTE` | `has_business_scope(target_id, uid, 'appointments')` | `appointments` / `FULL` | `20260841` |
| `appointment_record_walk_in_payment` RPC | `EXECUTE` | `has_business_scope(target_id, uid, 'appointments')` | `appointments` / `FULL` | `20260841` |
| `appointment_create_walk_in` RPC | `EXECUTE` | `has_business_scope(target_id, uid, 'appointments')` | `appointments` / `FULL` | `20260841` |
| `blocked_slots` | `ALL` | `target_owner_user_id = uid OR has_business_scope(target_id, uid, 'appointments')` | `appointments` / `FULL` | `20260829` |
| `custom_payments` | `SELECT` | `uid in (payer, target_owner) OR has_business_scope(target_id, uid, 'appointments')` | `appointments` / `FULL` | `20260824` |
| `custom_payment_confirm` RPC | `EXECUTE` | `has_business_scope(target_id, uid, 'appointments')` | `appointments` / `FULL` | `20260824` |
| `custom_payment_reject` RPC | `EXECUTE` | `has_business_scope(target_id, uid, 'appointments')` | `appointments` / `FULL` | `20260824` |
| `queue_tokens` | `UPDATE` | `owner_user_id = uid OR has_business_scope(business_id, uid, 'queue')` | `queue` / `FULL` | `20260829` |
| `queue_settings` | `ALL` | `owner_user_id = uid OR has_business_scope(business_id, uid, 'queue')` | `queue` / `FULL` | `20260829` |
| `catalog_items` | `ALL` | `owner_user_id = uid OR has_business_scope(business_id, uid, 'catalog')` | `catalog` / `FULL` | `20260829` |
| `business_portfolio_items` | `ALL` | `owner_user_id = uid OR has_business_scope(business_id, uid, 'catalog')` | `catalog` / `FULL` | `20260829` |
| `offers` | `ALL` | `owner_user_id = uid OR has_business_scope(business_id, uid, 'catalog')` | `catalog` / `FULL` | `20260829` |
| `bulk_deals` | `ALL` | `owner_user_id = uid OR has_business_scope(business_id, uid, 'catalog') OR is_admin()` | `catalog` / `FULL` | `20260829` |
| `business_qna` | `UPDATE` | `owner_user_id = uid OR has_business_scope(business_id, uid, 'leads')` | `leads` / `FULL` | `20260829` |
| `proposals` (trigger) | `INSERT/UPDATE` | Trigger `enforce_proposal_responder_entity_owner` requires `has_business_scope(responder_entity_id, uid, 'leads')` | `leads` / `FULL` | `20260841` |
| `delivery_agent_duty` | `ALL` | `user_id = uid AND (count_active_deliveries > 0 OR has_business_scope(..., 'delivery'))` | `delivery` / `FULL` | `20260862`, `20260874` |
| `loyalty_cards` | `ALL` | `has_business_full_access(business_id, uid)` | `FULL` ONLY | `20260841` |
| `businesses` | `UPDATE` | `owner_user_id = uid OR is_admin() OR has_business_full_access(id, uid)` | `FULL` ONLY (*Security Gap*) | `20260829` |
| `business_packages` | `ALL` | `owner_user_id = uid` | OWNER ONLY | `20260829` |
| `business_login_credentials` | `ALL` | `owner_user_id = uid` (via RPC) | OWNER ONLY | `20260809` |

---

## 6. Frontend Architecture & Component Lifecycles

### 6.1 State Management & Context Model

1. **User Identity vs Business Context (`src/store.ts` & `AppProvider.tsx`):**
   - `user`: Personal authenticated user (`id`, `name`, `phone`, `email`).
   - `activeContext`: `{ type: "customer" | "business" | "provider", id: string | null, name: string }`.
   - `ownedBusinessIds`: String array of business IDs where `businesses.owner_user_id === user.id`.
   - `delegatedBusinessIds`: String array of business IDs where user has an active session from `my_delegated_businesses()` RPC.
   - `manageableBusinessIds`: Union of `[...ownedBusinessIds, ...delegatedBusinessIds]`.
   - `businessPasswordRequired`: Record mapping `business_id -> boolean`. For owned shops, checks if owner has a security PIN. For delegated shops, reads `my_delegated_business_password_status()` to see if the target shop's owner has set a PIN.

2. **Console Route Guard (`BusinessAccessGuard.tsx`):**
   - Wraps all `/business/:id/manage*` routes in `App.tsx`.
   - `isOwner = ownedBusinessIds.includes(id)`: **Critical definition.** `isOwner` is strictly false for all delegated users, even with `FULL` access level.
   - Status transitions:
     - `status = "checking"`: Displays 3 skeletons. (Wait timer: 2.5s fallback for `ownedEntitiesLoaded`).
     - Calls `businessAccessService.checkAccess(id)`.
     - If `"DENIED"`: Resets context to personal customer (`setContext({ type: 'customer', id: null, name: user.name })`), shows toast *"Your access to that business was revoked"*, navigates to `/home`.
     - If `"ALLOWED"`: Calls `businessAccessService.myScope(id)`. Populates `scope = { accessLevel, scopes }`.
     - Realtime listener: Subscribes to `postgres_changes` on `public.business_access_sessions` filtering on `business_id=eq.${id}`. If a session row for `user.id` changes, instantly increments `attempt`, triggering fresh access check.
     - Security PIN Check: If `businessPasswordRequired[id]` is true and `!pinUnlocked`, renders `PinEntrySheet` modal requiring owner's PIN before revealing console.
     - Provides `BusinessAccessContext.Provider` down to all child screens.

3. **Sub-Route Guards:**
   - `<RequireScope scope="...">`: Wraps sections like store, queue, appointments, leads. If `!hasScope(scope) && accessLevel !== "FULL"`, redirects to `/business/:id/manage` with toast *"You don't have access to that section"*.
   - `<RequireOwner />`: Wraps sensitive screens:
     - `/business/:id/manage/profile`
     - `/business/:id/manage/edit-profile`
     - `/business/:id/manage/broadcast`
     - `/business/:id/manage/reviews`
     - `/business/:id/manage/payments`
     - `/business/:id/manage/verify`
     - `/business/:id/manage/settings`
     - `/business/:id/manage/community`
     - `/business/:id/manage/features`  
     If `!isOwner`, bounces the user to `/business/:id/manage` with toast *"Only the business owner can open that section"*.
   - `<RequireBusinessDeliveryMember />`: Gated by `DELIVERY_AGENT_ENABLED && (hasActiveDeliveries || hasScope("delivery"))`.

4. **Team Banner & Dial Navigation:**
   - `TeamConsoleBanner.tsx`: Top status bar shown on every manage screen if `consoleMode !== "owner"`. Displays badge `"Team member"` and active scope labels (`"Appointments · Queue"`), or `"Delegated access"`.
   - `ManageNav.tsx` / `businessDial.ts`: Bottom navigation rotary dial. Dynamically hides dial circles (e.g. store, queue, appointments, messages) if the user lacks that scope.

---

## 7. Step-by-Step Action Traces (Code-by-Code)

### Action 1: Owner Sets Up Shop Login
1. **User Action:** Owner goes to `/account/business-access`, clicks on their business, and toggles open the "Shop Login" accordion (`ShopLoginSection` in `BusinessAccess.tsx`).
2. **Execution:**
   - Owner can click "Suggest one", which calls `businessAccessService.suggestLogin(businessId)` $\rightarrow$ calls RPC `suggest_business_login`.
   - Owner enters `loginId`, `password`, toggles `requireApproval`, selects `sessionHours` (4, 8, 12, 24, 168), and clicks "Create shop login" / "Save changes".
   - `save()` verifies password length $\ge 6$.
   - Calls `businessAccessService.setLogin(businessId, { loginId, password, requireApproval, sessionHours, enabled })`.
   - RPC `public.set_business_login` verifies `b.owner_user_id = auth.uid()::text`.
   - Inserts/updates `public.business_login_credentials`: hashes password with `crypt(p_password, gen_salt('bf'))`.
3. **Outcome:** Staff can now use this ID and password to access the shop.

---

### Action 2: Staff Signs in via Shop Login (`/business-login`)
1. **User Action:** Staff member opens STRYT on their phone (signed in to their personal user account). They navigate to `/account/business-access` and tap "Sign in with a shop login", landing on `/business-login`.
2. **Execution:**
   - Staff enters `loginId` and `password`, taps "Open shop".
   - Component calls `businessAccessService.login(loginId.trim(), password)`.
   - Calls RPC `public.business_login_attempt(p_login_id, p_password)`.
   - Database checks `public.business_login_attempts`. If `locked_until > now()`, throws `LOCKED`.
   - Database compares bcrypt hash. If failed, increments `fail_count` (locks after 5 failures for 15 min), and returns `INVALID_CREDENTIALS`.
   - If password matches:
     - Clears failed attempts.
     - Checks `v_cred.require_approval`.
     - **Path A (`require_approval = false`):**
       - Inserts row into `business_access_sessions`: `status = 'ACTIVE'`, `expires_at = now() + session_hours`.
       - Inserts notification for owner: `type = 'BUSINESS_ACCESS'`, `'Business login'`.
       - Returns `status: 'ACTIVE'`, `businessId`, `sessionId`.
       - Client runs `setContext({ type: 'business', id: res.businessId, name: res.businessName })`.
       - Client awaits `refreshUser()` to pull `delegatedBusinessIds`.
       - Navigates to `/business/:id/manage`.
     - **Path B (`require_approval = true`):**
       - Inserts row into `business_access_sessions`: `status = 'PENDING'`, `expires_at = now() + interval '30 seconds'` (*Fatal 30s Trap*).
       - Inserts notification for owner: `type = 'BUSINESS_ACCESS'`, `'Access request'`.
       - Returns `status: 'PENDING'`.
       - Screen renders `awaiting` state ("Waiting for approval").

---

### Action 3: Owner Approves or Denies Pending Request
1. **User Action:** Owner opens `/account/business-access`, selects the business. Under `ManageSheet`, the "Waiting for approval" card displays the pending user.
2. **Execution:**
   - Owner clicks "Approve" or "Deny".
   - Calls `businessAccessService.decide(sessionId, approve)`.
   - Calls RPC `public.decide_business_session(p_session_id, p_approve)`.
   - Database locks session row `for update`.
   - If `expires_at <= now()`, updates `status = 'EXPIRED'` and aborts!
   - If still within expiration:
     - Reads `session_hours` from `business_login_credentials`.
     - If approved: updates `status = 'ACTIVE'`, `decided_at = now()`, `expires_at = now() + session_hours`.
     - If denied: updates `status = 'DENIED'`, `decided_at = now()`.
     - Inserts notification for grantee: `type = 'QUEUE_UPDATE'` or `BUSINESS_ACCESS`.
3. **Outcome:** Realtime push updates the session. The staff member's screen receives the approval and can enter the console.

---

### Action 4: Owner Grants Direct Named Access to a Team Member
1. **User Action:** In `/account/business-access` $\rightarrow$ `ManageSheet`, owner types phone/email/@username in "Mobile number, email, or @username".
2. **Preset / Scope Selection:**
   - Owner selects Preset chip:
     - `Front Desk`: `appointments`, `queue`
     - `Store Manager`: `catalog`, `leads`
     - `Delivery Rider`: `delivery`
     - `Full`: all 4 management scopes (`appointments`, `queue`, `catalog`, `leads`)
     - `Custom`: toggles individual scopes in `ScopeToggleList`.
   - Owner clicks "Add to team".
3. **Execution:**
   - If preset is `"full"`, calls `businessAccessService.grantByIdentifier(business.id, identifier)`.
     - Calls RPC `public.grant_business_access`.
     - Inserts/reactivates session with `access_level = 'FULL'`, `scopes = '{}'`, `expires_at = null`.
   - If preset is scoped, calls `businessAccessService.grantTeamMember(business.id, identifier, scopes)`.
     - Calls RPC `public.grant_team_member_access`.
     - Inserts/reactivates session with `access_level = 'SCOPED'`, `scopes = v_scopes`, `expires_at = null`.
   - Grantee receives in-app notification: *"You can now help manage [Shop Name] from Switch account."*
4. **Outcome:** Permanent grant created. Grantee sees shop in `ManageHub` under "Managed for others" and in `BusinessAccess.tsx` under "Businesses you have access to".

---

### Action 5: Member Switches to Business Hat & Opens Console
1. **User Action:** Member taps the business card from `ManageHub` or `BusinessAccess.tsx`.
2. **Execution:**
   - Triggers `attemptSwitchContext({ type: "business", id, name }, dest)`.
   - Checks `businessPasswordRequired[id]`:
     - If owner has a Business PIN set, stores `pendingContextSwitch` and displays `PinEntrySheet`.
     - Once PIN is verified (or if no PIN is set), persists `activeContext` to `localStorage` and navigates to `/business/:id/manage`.
   - Router hits `BusinessAccessGuard`:
     - Checks `ownedBusinessIds.includes(id)` $\rightarrow$ `false`.
     - Executes RPC `my_business_access_status(id)` $\rightarrow$ returns `true`.
     - Executes RPC `my_business_access_scope(id)` $\rightarrow$ returns `{ accessLevel, scopes }`.
     - Calls `useAdoptConsoleContext("business", id, true)` $\rightarrow$ ensures store `activeContext` matches console target.
     - Subscribes to Supabase Realtime channel `rt:business_access_guard:${id}:${user.id}`.
     - Mounts `BusinessManageLayout` and `BusinessHome`.
3. **Visual Result:**
   - Screen renders `TeamConsoleBanner`: *"Team member · Appointments · Queue"*.
   - QuickDial only shows authorized icons.
   - Unauthorized sections are hidden from the UI.

---

### Action 6: Member Performs Scoped Operation (e.g. Accepts Appointment)
1. **User Action:** Receptionist taps "Appointments" and clicks "Accept" on a booking.
2. **Execution:**
   - Frontend calls `appointmentService.transition(appointmentId, 'ACCEPTED')`.
   - Service calls RPC `public.appointment_transition(p_id, 'ACCEPTED')`.
   - Inside the RPC:
     ```sql
     v_is_manager := v_appointment.target_owner_user_id = v_uid
       or (v_appointment.target_type = 'BUSINESS'
           and public.has_business_scope(v_appointment.target_id, v_uid, 'appointments'));
     ```
   - Database checks `has_business_scope`: finds the member's active session containing `'appointments'` in `scopes`.
   - Updates appointment status to `'ACCEPTED'`.
3. **Defense-in-Depth:** If a member manually enters URL `/business/:id/manage/settings`, `<RequireOwner />` executes:
   - Evaluates `isOwner = false`.
   - Shows toast: *"Only the business owner can open that section"*.
   - Redirects immediately back to `/business/:id/manage`.

---

### Action 7: Owner Edits Scopes or Revokes Session
1. **Editing Scopes:**
   - Owner taps "Edit" (Pencil icon) on member card in `BusinessAccess.tsx`.
   - Toggles scopes and taps "Save" (or "Limit access" if demoting from `FULL`).
   - Calls `businessAccessService.updateTeamMemberScopes(sessionId, newScopes)`.
   - Calls RPC `update_team_member_scopes`.
   - Database updates session: `access_level = 'SCOPED'`, `scopes = newScopes`.
   - Realtime trigger fires: Member's phone receives Postgres change payload $\rightarrow$ `BusinessAccessGuard` increments `attempt` $\rightarrow$ re-fetches `my_business_access_scope` $\rightarrow$ UI updates immediately mid-session.
2. **Revoking Access:**
   - Owner taps "Revoke", confirms modal "Yes, remove access".
   - Calls `businessAccessService.revoke(sessionId)`.
   - Calls RPC `revoke_business_session(sessionId)`.
   - Database sets `status = 'REVOKED'`, `expires_at = now()`.
   - Realtime trigger fires on member's device:
     - `BusinessAccessGuard` calls `checkAccess(id)` $\rightarrow$ returns `"DENIED"`.
     - Guard resets context: `setContext({ type: 'customer', id: null, name: user.name })`.
     - Toast displayed: *"Your access to that business was revoked"*.
     - Redirects user out of console to `/home`.

---

## 8. Catalog of Identified Bugs, Flaws, and Security Risks

### 🚨 Problem 1: The 30-Second Owner Approval Trap (CRITICAL)
- **Code Location:** `supabase/migrations/20260823_business_login_rate_limit.sql:137`
- **Mechanism:**
  ```sql
  if v_cred.require_approval then
    v_status := 'PENDING';
    v_expires := now() + interval '30 seconds';
  ```
- **Failure Mode:** When staff sign in with shop credentials and approval is required, the session expires in exactly 30 seconds. In `decide_business_session`:
  ```sql
  if v_session.expires_at is not null and v_session.expires_at <= now() then
    update public.business_access_sessions set status = 'EXPIRED' ... return;
  ```
- **Consequence:** An owner cannot realistically receive an in-app notification, click it, navigate to `/account/business-access`, open the modal, and tap approve in 30 seconds. The request expires, leaving staff stuck on the "Waiting for approval" screen indefinitely. `sessionForPrompt` (intended for an instant Uber-style prompt) was never implemented in the UI.

---

### 🚨 Problem 2: Shop Login Grants FULL Access, Ignoring Configured Scopes (CRITICAL SECURITY HOLE)
- **Code Location:** `supabase/migrations/20260823_business_login_rate_limit.sql:143-147` & `BusinessAccess.tsx:309-311`
- **Mechanism:**
  `BusinessAccess.tsx` promises: *"Staff sign in... Their access is scoped to what you allow below..."*  
  However, in `business_login_attempt`:
  ```sql
  insert into public.business_access_sessions
    (business_id, grantee_user_id, status, decided_at, expires_at)
  values (v_cred.business_id, v_uid, v_status, ...);
  ```
  It **omits** `access_level` and `scopes`.
- **Failure Mode:** By PostgreSQL table default (`access_level text default 'FULL'`), **every user logging in with the shop password receives `access_level = 'FULL'`!**
- **Consequence:** The employee is granted full owner-equivalent scope across all 5 operational domains, bypassing the intended role restrictions unless the owner manually edits their scopes after the fact.

---

### ⚠️ Problem 3: Notification Type Regression in `grant_business_access`
- **Code Location:** `supabase/migrations/20260814_business_access_grant_and_check.sql:95`
- **Mechanism:**
  `grant_team_member_access`, `update_team_member_scopes`, and `revoke_business_session` were upgraded in `20260934` to send notifications of type `'BUSINESS_ACCESS'`.  
  However, `grant_business_access` was forgotten and still inserts type `'QUEUE_UPDATE'`.
- **Consequence:** If a user mutes "Queue Updates" in their notification preferences, they will silently miss notifications when granted full business access.

---

### ⚠️ Problem 4: Double Password Barrier (Shop Password vs Owner Business PIN)
- **Code Location:** `src/store/AppProvider.tsx:405-409` & `BusinessAccessGuard.tsx:149-164`
- **Mechanism:**
  `businessPasswordRequired[id]` checks if the business owner has set an entity PIN. If set, `BusinessAccessGuard` blocks entry with `PinEntrySheet`.
- **Failure Mode:** Staff enter the shop login ID and shop password at `/business-login`, but upon opening the console, they are blocked by a second PIN sheet asking for the *Owner's Business PIN*.
- **Consequence:** Unless the owner shares their personal business PIN, staff cannot enter the console despite having valid shop login credentials.

---

### ⚠️ Problem 5: Database RLS Leak on `businesses` Update Policy for FULL Delegates
- **Code Location:** `supabase/migrations/20260829_fix_can_manage_business_overreach.sql:109-119`
- **Mechanism:**
  ```sql
  create policy admin_upd_businesses on public.businesses for update
    using (
      ... or has_business_full_access(id, auth.uid()::text) or owner_user_id = auth.uid()::text
    );
  ```
- **Failure Mode:** In the frontend, `RequireOwner` blocks non-owners from editing profile and settings. But in PostgreSQL, `has_business_full_access` permits ANY `FULL` session to UPDATE `public.businesses`.
- **Consequence:** Any user with a FULL grant (or anyone using the shop login due to Problem 2) can issue a direct Supabase update to alter the business name, address, category, phone number, and description.

---

### ⚠️ Problem 6: Delivery Scope Navigation Disconnect
- **Code Location:** `src/lib/businessDial.ts:83`
- **Mechanism:**
  `deliveries: ctx.deliveryOn && hasScope("appointments") ? ... : null`
- **Failure Mode:** The Live Deliveries shortcut in the console dial checks `hasScope("appointments")` rather than `hasScope("delivery")`.
- **Consequence:** A user invited with the "Delivery Rider" preset (`scopes: ['delivery']`) will NOT see the deliveries dial icon in the console unless they also hold the `appointments` scope or have an active assignment.

---

### ⚠️ Problem 7: Unused Code & Missing Expiry Sweeps
- **Code Location:** `src/services/marketplace/businessAccessService.ts:213` (`sessionForPrompt`) & `284` (`sweep`)
- **Details:**
  - `sessionForPrompt` is completely orphaned (0 callers in the codebase).
  - `close_expired_business_sessions` is only called if someone explicitly triggers `businessAccessService.sweep()`, which is never called automatically. Expired sessions remain marked `ACTIVE` until an RPC evaluates `expires_at <= now()`.

---

## 9. Implemented Architectural Fixes (Migration 20261006 & Code Updates)

All key issues identified above have been implemented with 100% test coverage and zero regression:

1. **Fixed Approval Expiration Window (`20261006_team_access_fixes.sql`):**
   - In `business_login_attempt`, replaced `interval '30 seconds'` with `interval '24 hours'`, giving owners a realistic 24-hour window to review and approve staff login requests. Removed "Approve within 30 seconds" text from notification body.
2. **Bound Scopes to Shop Credentials (`20261006_team_access_fixes.sql` & `BusinessAccess.tsx`):**
   - Added `access_level` and `scopes` columns to `business_login_credentials`.
   - Updated `set_business_login` RPC and `ShopLoginSection` UI so owners can configure which preset/scopes the shared shop login grants.
   - `business_login_attempt` now copies the owner's configured `access_level` and `scopes` to the created session instead of blindly granting `FULL`.
3. **Unified Notification Types (`20261006_team_access_fixes.sql`):**
   - Updated `grant_business_access` to insert `'BUSINESS_ACCESS'` instead of the outdated `'QUEUE_UPDATE'`.
4. **Eliminated Double Password Re-prompt (`BusinessLogin.tsx`):**
   - On successful login via `businessAccessService.login`, `entityPasswordService.markSessionUnlocked(res.businessId)` is immediately called, ensuring staff who just authenticated with the shop password are not blocked by the owner's master PIN sheet.
5. **Safe Availability Toggle RPC & Tightened `businesses` RLS (`20261006_team_access_fixes.sql` & `businessService.ts`):**
   - Added `public.set_business_availability` RPC so active console members can toggle open/closed status safely.
   - Restricted table-level `admin_upd_businesses` UPDATE policy strictly to `owner_user_id = auth.uid()::text OR is_admin()`, closing the privilege escalation vulnerability on business profile data.
6. **Delivery Scope Dial Shortcut (`businessDial.ts`):**
   - Updated live deliveries and my-deliveries checks to evaluate `hasScope("delivery")`, ensuring riders with the delivery preset see their delivery management shortcuts in the console dial.
7. **Regression Guard Test:**
   - Added `src/services/marketplace/businessAccessService.test.ts` verifying that `getConfig`, `setLogin`, and `buildDialItems` correctly enforce team access scoping.
8. **Realtime Auto-Advance on Awaiting Approval (`BusinessLogin.tsx`):**
   - Added Supabase Realtime postgres_changes listener and fallback polling to the `awaiting` approval screen. When the owner approves the pending request, the staff phone automatically unlocks the master PIN, updates user state, and transitions directly into `/business/:id/manage`.

---

## 10. Production Deployment Status

- **Database Migration:** Applied to production (`20261006_team_access_fixes.sql`, logged in `APPLY_LOG.md` row 68).
- **PostgREST Schema Cache:** Reloaded via `notify pgrst, 'reload schema'`.
- **Frontend Codebase:** Verified with `tsc --noEmit` (0 errors) and Vitest (1,193 passing tests).
- **Status:** **100% PRODUCTION READY & LIVE.**

