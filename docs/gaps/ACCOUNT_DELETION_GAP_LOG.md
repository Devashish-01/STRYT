# STRYT — Flow 11.5: Account Deletion & Data Privacy Gap Log

**Audit Date:** September 9, 2026  
**Flow Identifier:** Flow 11.5 — Domain 11 (Account, Multi-Role & Platform Security)  
**Primary Components:** [`DataSettings.tsx`](file:///d:/zetax/name/STRYT/src/screens/settings/DataSettings.tsx), [`DeletionPending.tsx`](file:///d:/zetax/name/STRYT/src/screens/auth/DeletionPending.tsx), [`App.tsx`](file:///d:/zetax/name/STRYT/src/App.tsx)  
**Backend Services & Tables:** [`profileControlService.ts`](file:///d:/zetax/name/STRYT/src/services/core/profileControlService.ts), [`userService.ts`](file:///d:/zetax/name/STRYT/src/services/core/userService.ts), [`accountDeletion.ts`](file:///d:/zetax/name/STRYT/src/lib/accountDeletion.ts), `supabase/functions/purge-deleted-accounts/index.ts`, `supabase/functions/admin-delete-profile/index.ts`, `public.profile_deletion_requests`, `public.users`, `public.businesses`, `public.providers`, `public.agreements`, `public.payments`  
**Launch Readiness Status:** 🔴 **Critical Audit Blockers (Merchant Storefronts Left Active During 30-Day Deletion Grace Period, Edge Function Purge Crash on Un-Cascaded Foreign Keys, Incomplete Data Portability Export Violating GDPR, Deletion-Pending Route Trap Blocking Legal Document Access)**

---

## 1. Executive Summary

Flow 11.5 governs user data export, self-serve account deletion, 30-day grace period lifecycle management, and permanent data purging across STRYT. It ensures compliance with Apple App Store and Google Play Store account deletion policies, as well as statutory data protection regulations (GDPR / CCPA / DPDP). The flow comprises:
1. **Data Management & Export Hub ([`DataSettings.tsx`](file:///d:/zetax/name/STRYT/src/screens/settings/DataSettings.tsx)):** Located at `/settings/data`. Offers a one-tap JSON data export ("Take a copy") and self-serve account deletion modal ("Close your account").
2. **Deletion Pending Route Guard ([`App.tsx:334-344`](file:///d:/zetax/name/STRYT/src/App.tsx#L334-L344)):** Intercepts authenticated users whose account status is in `PENDING` deletion, routing them exclusively to the warning screen.
3. **Deletion Pending & Grace Period Console ([`DeletionPending.tsx`](file:///d:/zetax/name/STRYT/src/screens/auth/DeletionPending.tsx)):** Located at `/auth/deletion-pending`. Informs the user of their remaining grace period days, allows one-tap cancellation ("Keep account & continue"), or automatically triggers permanent purging if the grace period has elapsed.
4. **Backend Purge Workers (`purge-deleted-accounts` & `admin-delete-profile` Edge Functions):** Executes deep deletion and anonymization across `users`, `businesses`, `providers`, Supabase Storage buckets, and Supabase Auth identities (`sb.auth.admin.deleteUser`).

While STRYT's deletion workflow implements several sophisticated safety checks (such as escrow hold gating, dispute verification, and grace-period scheduling), rigorous end-to-end code auditing revealed severe structural gaps, potential purge crash loops, and regulatory non-compliance:

1. **Merchant & Provider Storefronts Abandoned During Deletion Grace Period (P0):** When a user requests account deletion, `DataSettings.tsx` calls `profileControlService.requestDeletion("CUSTOMER", null, deleteReason)`. This only checks for active consumer agreements and held escrow, setting `customer_enabled = false` on `users`. It completely ignores whether the user owns active businesses (`ownedBusinessIds`) or provider listings (`ownedProviderId`). During the 30-day grace period, the storefront remains public and active. Customers can place orders, book appointments, and submit requests to an abandoned business whose owner cannot access or fulfill them, creating broken customer transactions.
2. **Edge Function Purge Crashes on Un-Cascaded Foreign Keys (P0):** In `purge-deleted-accounts/index.ts:125-131` and `admin-delete-profile/index.ts:133-138`, `purgeCustomerAccount` deletes owned businesses via `sb.from("businesses").delete().eq("id", biz.id)`. However, `20260900_bulk_deal_campaigns.sql` adds a foreign key `business_id references public.businesses(id)` *without* `ON DELETE CASCADE`. If the merchant ever created a bulk deal campaign, deleting the business throws a Postgres Foreign Key Constraint Violation, failing the purge and bricking the account in an un-deletable loop.
3. **Incomplete Data Portability Export Violates GDPR Art. 20 (P1):** In `DataSettings.tsx:36-66`, `exportData()` only extracts user profile, bookmarks, lists, follows, appointments, and requests. It omits all chat messages (`messages`), customer reviews (`ratings`), past orders (`orders`), signed agreements (`agreements`), digital queue tokens (`queue_tokens`), emergency contacts, and location sharing history.
4. **Deletion-Pending Route Trap Blocks Legal Document Transparency (P1):** In `App.tsx:334-340`, the deletion pending check redirects *all* pathnames other than `/auth/deletion-pending`. If a user attempts to read the legal explanation of what gets deleted (`/legal/account-deletion`), the Privacy Policy (`/legal/privacy`), or Terms of Service (`/legal/terms`), they are instantly redirected back to `/auth/deletion-pending`.
5. **`cancelDeletion()` Overwrites Prior User Privacy Preferences (P1):** In `profileControlService.ts:122-126`, cancelling account deletion unconditionally updates `customer_enabled: true`. If a user had previously disabled customer discoverability via `/settings/privacy`, restoring their account silently overrides their prior privacy choice and exposes their customer profile to neighborhood searches.
6. **Zero Authentication Challenge Prior to Account Deletion (P2):** Initiating account deletion in `DataSettings.tsx` requires only typing an optional text reason and clicking "Delete". It does not prompt for password re-entry, biometric verification, or console PIN confirmation, leaving unlocked devices vulnerable to malicious or accidental deletion.

---

## 2. Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **DEL-1** | Active Storefronts Left Running During Deletion Grace Period | 🔴 P0 (Critical Business & Consumer Risk) | Account deletion ignores owned businesses and providers. Storefronts remain open for 30 days while owners are locked out, allowing customers to place unfulfillable orders. |
| **DEL-2** | Purge Edge Function Crashes on Un-Cascaded Foreign Keys | 🔴 P0 (Data Integrity & Purge Failure) | Deleting a business fails with FK violation if `bulk_deal_campaigns` exist, preventing permanent account purge and leaving user data stranded in Postgres. |
| **DEL-3** | Incomplete Data Export Violates Data Portability (GDPR Art. 20) | 🟠 P1 (Regulatory Non-Compliance) | `exportData()` omits chat messages, orders, reviews, agreements, and emergency contacts, providing an incomplete personal data export. |
| **DEL-4** | Deletion-Pending Route Guard Traps Users and Blocks Legal Links | 🟠 P1 (Broken Navigation & Legal Block) | `App.tsx` redirects all non-`/auth/deletion-pending` routes, preventing users from viewing `/legal/account-deletion` or privacy policies during grace period. |
| **DEL-5** | `cancelDeletion()` Forcibly Flips `customer_enabled` Overriding Privacy | 🟠 P1 (Privacy Preference Overwrite) | Restoring an account sets `customer_enabled: true` unconditionally, exposing profiles that were intentionally kept hidden prior to deletion. |
| **DEL-6** | Missing Re-Authentication Challenge on Account Deletion Modal | 🟡 P2 (Security & Accidental Action Hazard) | Deletion can be scheduled with zero credentials re-entered, creating a risk on shared or unattended mobile devices. |

---

## 3. Detailed Findings & Root Cause Analysis

---

### 🔴 DEL-1 (P0): Active Storefronts Left Running During Deletion Grace Period

- **Location:** [`src/screens/settings/DataSettings.tsx:68-82`](file:///d:/zetax/name/STRYT/src/screens/settings/DataSettings.tsx#L68-L82), [`src/services/core/profileControlService.ts:57-88`](file:///d:/zetax/name/STRYT/src/services/core/profileControlService.ts#L57-L88)
- **Root Cause:**
  1. In `DataSettings.tsx`:
     ```tsx
     async function handleSubmitDeleteRequest() {
       setSubmittingDelete(true);
       try {
         await profileControlService.requestDeletion("CUSTOMER", null, deleteReason);
         ...
         nav("/auth/deletion-pending", { replace: true });
     ```
  2. In `profileControlService.ts`:
     ```ts
     if (targetType === "CUSTOMER") {
       const uid = session.user.id;
       // Validates consumer agreements and held escrow
       ...
       const { error: userErr } = await sb
         .from("users")
         .update({ customer_enabled: false })
         .eq("id", session.user.id);
     }
     ```
  3. Notice that `requestDeletion` checks only consumer-side agreements and escrow payments.
  4. It does NOT check whether the user owns businesses (`ownedBusinessIds`) or provider profiles (`ownedProviderId`).
  5. It does NOT deactivate or close active storefronts (`businesses.is_active` or opening hours).
  6. The moment `handleSubmitDeleteRequest` succeeds, `user.deletionScheduledAt` is populated.
  7. When the user opens STRYT, `App.tsx:336` traps them on `/auth/deletion-pending`. They cannot access `/business/:id/manage` to manage incoming orders, dispatch packages, or notify customers.
  8. Meanwhile, their business storefront remains fully discoverable in the search index and neighborhood feed. Customers can continue ordering items, paying for delivery, and booking appointments that will never be serviced!
- **Remediation Plan:**
  - Before permitting account deletion in `DataSettings.tsx`, check if the user owns active businesses or provider listings.
  - If owned businesses exist, require the owner to close the business, fulfill all pending orders/appointments, or transfer ownership before scheduling deletion.
  - Automatically set `is_active: false` on all owned businesses upon deletion request scheduling.

---

### 🔴 DEL-2 (P0): Purge Edge Function Crashes on Un-Cascaded Foreign Keys

- **Location:** [`supabase/functions/purge-deleted-accounts/index.ts:125-131`](file:///d:/zetax/name/STRYT/supabase/functions/purge-deleted-accounts/index.ts#L125-L131), [`supabase/functions/admin-delete-profile/index.ts:131-138`](file:///d:/zetax/name/STRYT/supabase/functions/admin-delete-profile/index.ts#L131-L138), [`supabase/migrations/20260900_bulk_deal_campaigns.sql:95`](file:///d:/zetax/name/STRYT/supabase/migrations/20260900_bulk_deal_campaigns.sql#L95)
- **Root Cause:**
  1. In `purgeCustomerAccount`:
     ```ts
     const { data: ownedBusinesses } = await sb.from("businesses").select("id").eq("owner_user_id", targetId);
     for (const biz of ownedBusinesses || []) {
       await sb.from("catalog_items").delete().eq("business_id", biz.id);
       await sb.from("offers").delete().eq("business_id", biz.id);
       await sb.from("stories").delete().eq("owner_id", biz.id).eq("owner_type", "business");
       await sb.from("businesses").delete().eq("id", biz.id);
     }
     ```
  2. In migration `20260900_bulk_deal_campaigns.sql`:
     ```sql
     create table if not exists public.bulk_deal_campaigns (
       id             text primary key default ('bdc_' || substr(md5(random()::text), 1, 16)),
       business_id    text references public.businesses(id),
       ...
     );
     ```
  3. Notice `business_id text references public.businesses(id)` has NO `ON DELETE CASCADE`.
  4. When `sb.from("businesses").delete().eq("id", biz.id)` runs for a business that ran a campaign, Postgres throws:
     `ERROR: update or delete on table "businesses" violates foreign key constraint on table "bulk_deal_campaigns"`
  5. The error is thrown to the outer handler, the user's deletion status remains `PENDING`, and subsequent cron runs or client mount triggers repeatedly crash on the same user.
- **Remediation Plan:**
  - Add `on delete cascade` to `bulk_deal_campaigns.business_id` in a migration, or explicitly delete from `bulk_deal_campaigns` prior to deleting from `businesses` in the purge function.

---

### 🟠 DEL-3 (P1): Incomplete Data Export Violates Data Portability (GDPR Art. 20)

- **Location:** [`src/screens/settings/DataSettings.tsx:36-66`](file:///d:/zetax/name/STRYT/src/screens/settings/DataSettings.tsx#L36-L66)
- **Root Cause:**
  1. In `DataSettings.tsx`:
     ```ts
     async function exportData() {
       setExporting(true);
       try {
         const [appointments, myRequests] = await Promise.all([
           user.id ? appointmentService.listForCustomer(user.id) : Promise.resolve([]),
           requestService.mine().catch(() => []),
         ]);
         const payload = {
           exportedAt: new Date().toISOString(),
           profile: {
             id: user.id, name: user.name, alias: user.alias, email: user.email,
             phone: user.phone, area: user.area, language: user.language,
           },
           bookmarks, lists, follows, appointments, requests: myRequests,
         };
     ```
  2. The generated JSON file contains only 6 data categories: profile, bookmarks, lists, follows, appointments, and requests.
  3. It omits:
     - 1:1 direct messages and media attachments (`chatService.listConversations`).
     - Customer reviews and ratings posted (`ratings`).
     - Orders and digital token queue receipts (`orders`, `queue_tokens`).
     - Handshake contracts and agreements (`agreements`).
     - Emergency contacts (`emergencyService`).
     - Location share grants (`locationService`).
  4. Article 20 of GDPR mandates that data subjects have the right to receive *all* personal data concerning them that they have provided to a controller in a structured, commonly used, and machine-readable format.
- **Remediation Plan:**
  - Expand `exportData()` to fetch user's reviews, active orders, agreements, and conversation summaries.

---

### 🟠 DEL-4 (P1): Deletion-Pending Route Guard Traps Users and Blocks Legal Links

- **Location:** [`src/App.tsx:334-344`](file:///d:/zetax/name/STRYT/src/App.tsx#L334-L344)
- **Root Cause:**
  1. In `App.tsx`:
     ```tsx
     const isDeletionPending = isAuthed && user.id && user.deletionScheduledAt;
     if (isDeletionPending) {
       if (location.pathname !== "/auth/deletion-pending") {
         return <Navigate to="/auth/deletion-pending" replace />;
       }
     }
     ```
  2. If a user is on the deletion pending screen and taps on the link to read the account deletion terms (`LEGAL_ROUTES.accountDeletion = "/legal/account-deletion"`) or privacy policy (`/legal/privacy`), `location.pathname` becomes `/legal/account-deletion`.
  3. Because `/legal/account-deletion !== "/auth/deletion-pending"`, the router immediately replaces the route with `/auth/deletion-pending`.
  4. The user is trapped in an inescapable loop and cannot read the company's data retention and deletion policies.
- **Remediation Plan:**
  - Whitelist public legal routes in the route guard:
    ```tsx
    const isLegalPath = location.pathname.startsWith("/legal/");
    if (isDeletionPending && !isLegalPath && location.pathname !== "/auth/deletion-pending") {
      return <Navigate to="/auth/deletion-pending" replace />;
    }
    ```

---

### 🟠 DEL-5 (P1): `cancelDeletion()` Forcibly Flips `customer_enabled` Overriding Privacy

- **Location:** [`src/services/core/profileControlService.ts:109-127`](file:///d:/zetax/name/STRYT/src/services/core/profileControlService.ts#L109-L127)
- **Root Cause:**
  1. In `profileControlService.ts`:
     ```ts
     async cancelDeletion(): Promise<void> {
       ...
       const { error: userErr } = await sb
         .from("users")
         .update({ customer_enabled: true })
         .eq("id", session.user.id);
       throwIfError(userErr);
     }
     ```
  2. When an account deletion is scheduled, `customer_enabled` was set to `false`.
  3. But a user may have intentionally turned off `customer_enabled` months prior via `/settings/privacy` so that strangers in the neighborhood could not search for their customer profile.
  4. If they subsequently schedule deletion and later cancel it, their account is restored with `customer_enabled: true`, forcibly making their profile public without their consent.
- **Remediation Plan:**
  - Store the prior state of `customer_enabled` in `profile_deletion_requests` (e.g. `prior_state` jsonb), or do not unconditionally set `customer_enabled: true` unless it was originally enabled.

---

### 🟡 DEL-6 (P2): Missing Re-Authentication Challenge on Account Deletion Modal

- **Location:** [`src/screens/settings/DataSettings.tsx:117-158`](file:///d:/zetax/name/STRYT/src/screens/settings/DataSettings.tsx#L117-L158)
- **Root Cause:**
  1. Opening `/settings/data` and tapping "Delete account" opens a bottom sheet with an optional reason textarea and a red "Delete" button.
  2. Clicking "Delete" immediately schedules the account for deletion.
  3. No password, OTP, biometric check, or confirmation PIN is demanded.
  4. On an unlocked phone or tablet, a passerby or toddler can place the entire account into deletion pending in two clicks.
- **Remediation Plan:**
  - If an entity password exists (from Flow 11.4), prompt for PIN verification before scheduling deletion.
  - Require the user to type a confirmation phrase (e.g. `DELETE` or their account handle) before enabling the submit button.

---

## 4. Verification & Validation Plan

### Automated Regression Verification
- [ ] Run `npm run check-colors` to guarantee zero raw hex color leaks in `DataSettings.tsx` and `DeletionPending.tsx`.
- [ ] Run `npx tsc --noEmit` to verify type safety across `DataSettings.tsx`, `profileControlService.ts`, and `accountDeletion.ts`.

### Manual Test Steps
1. **Merchant Deletion Gate:**
   - Log in as an account with an active business profile.
   - Navigate to `/settings/data` and click "Delete account".
   - Verify the system warns that active storefronts must be closed or unfulfilled orders resolved before scheduling deletion.
2. **Legal Route Whitelist:**
   - With an account in deletion pending status, navigate to `/legal/account-deletion`.
   - Verify the legal policy document renders cleanly without being redirected back to `/auth/deletion-pending`.
3. **Data Export Integrity:**
   - In `/settings/data`, click "Download my data".
   - Inspect the downloaded JSON file and confirm all user activity (reviews, orders, agreements, chats) is properly exported.
4. **Cancellation Privacy Preservation:**
   - Set `customer_enabled: false` in `/settings/privacy`.
   - Schedule account deletion, then click "Keep account & continue" in `/auth/deletion-pending`.
   - Confirm `customer_enabled` remains `false` and does not automatically expose the profile.
