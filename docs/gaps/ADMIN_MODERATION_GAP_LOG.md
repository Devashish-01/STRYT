# STRYT — Flow 11.6: Admin Moderation & Content Appeals Gap Log

**Audit Date:** September 9, 2026  
**Flow Identifier:** Flow 11.6 — Domain 11 (Account, Multi-Role & Platform Security)  
**Primary Components:** [`AdminPanel.tsx`](file:///d:/zetax/name/STRYT/src/screens/admin/AdminPanel.tsx), [`AdminLogin.tsx`](file:///d:/zetax/name/STRYT/src/screens/admin/AdminLogin.tsx), [`ReportSheet.tsx`](file:///d:/zetax/name/STRYT/src/components/ReportSheet.tsx)  
**Backend Services & Tables:** [`adminService.ts`](file:///d:/zetax/name/STRYT/src/services/core/adminService.ts), [`appealService.ts`](file:///d:/zetax/name/STRYT/src/services/core/appealService.ts), [`profileControlService.ts`](file:///d:/zetax/name/STRYT/src/services/core/profileControlService.ts), `public.reports`, `public.account_appeals`, `public.admin_action_logs`, `public.businesses`, `public.providers`, `public.community_posts`, `public.post_comments`, `public.requests`, `public.agreements`, `supabase/migrations/20260916_admin_report_moderation.sql`, `supabase/migrations/20260927_community_backend_gaps.sql`, `supabase/functions/verification-review/index.ts`  
**Launch Readiness Status:** 🔴 **Critical Audit Blockers (Silent Content Removal Without Author Notification, Unhandled Report Target Types (USER, PROPOSAL, RATING) Silently Resolving with Zero Action, Content Moderation Actions Bypassing Audit Logging, Blind Moderation Queue Lacking Content Previews, Appeals Excluded for Customers & Community Authors)**

---

## 1. Executive Summary

Flow 11.6 provides platform administrators with operational control over community moderation, business and provider approvals, dispute adjudication, location changes, and content appeals across STRYT. The flow encompasses:
1. **Admin Console Hub ([`AdminPanel.tsx`](file:///d:/zetax/name/STRYT/src/screens/admin/AdminPanel.tsx)):** Located at `/admin`. Houses 10 operational consoles: Overview, Queue (onboarding review), Verification (KYC doc review), Location changes, Disputes, Appeals, Reports, Bugs, Profiles (directory & hard-delete), and Account settings.
2. **Community & Content Reporting ([`ReportSheet.tsx`](file:///d:/zetax/name/STRYT/src/components/ReportSheet.tsx)):** Accessible from any post, comment, storefront, provider listing, proposal, or review card to submit an anonymous violation report.
3. **Appeals & Review Pipeline ([`appealService.ts`](file:///d:/zetax/name/STRYT/src/services/core/appealService.ts)):** Manages structured review requests submitted by suspended entities, allowing administrators to review reasons, add notes, and reactivate profiles.
4. **Verification & Dispute Engines ([`adminService.ts`](file:///d:/zetax/name/STRYT/src/services/core/adminService.ts)):** Connects with `verification-review` Edge Function for badge approval and `admin_resolve_agreement_dispute` for escrow settlement.

While STRYT's admin panel exhibits significant depth across business onboarding and escrow dispute settlement, exhaustive code and schema analysis identified severe systemic gaps in moderation integrity, transparency, and accountability:

1. **Silent Content Removal Without Author Notification or Violation Explanation (P0):** When an admin takes action on reported content in `AdminReports` (`takeAction`), deletion RPCs (`admin_delete_post`, `admin_cancel_request`, `admin_delete_comment`) permanently delete or cancel the item. `resolveReport` notifies the *reporter* that action was taken, but the *author* of the deleted post, comment, or cancelled request receives **zero notification, zero explanation, and zero guideline violation notice**. Their content silently vanishes without trace, misleading users into believing the app suffered a deletion bug.
2. **Unhandled Report Target Types (`USER`, `PROPOSAL`, `RATING`) Silently Resolve with Zero Action (P0):** `ReportSheet.tsx` allows users to flag `USER`, `PROPOSAL`, and `RATING` (reviews). In `AdminReports:535-556`, `takeAction` only implements branches for `BUSINESS`, `PROVIDER`, `POST`, `REQUEST`, and `COMMENT`. If an admin reviews a report for a predatory user, a scam proposal, or a defamatory fake rating and clicks "Take action", the code executes nothing and marks the report as `ACTION_TAKEN`. Abusive content remains live on the platform while administrators believe it was moderated.
3. **Content Moderation Bypasses Admin Audit Trail (`admin_action_logs`) (P0):** Unlike hard profile deletions and document verifications, content moderation actions (post deletes, comment wipes, request cancellations, and business suspensions from reports) do not write to `admin_action_logs`. If an admin account is compromised or an insider maliciously purges content, there is no immutable audit trail of which admin initiated the action or what report triggered it.
4. **Blind Moderation Hazard (Zero Content Preview or Reporter Details in Queue) (P1):** In `AdminReports:563-584`, report cards display target name, target type, reason, and reporter name. The actual text content, image media, or body of the reported post, comment, or review is **never retrieved or rendered**. Furthermore, `r.details` (the reporter's specific explanation) is omitted from the UI. Admins are forced to take permanent destructive action completely blind without reading the alleged violation.
5. **Appeals System Strictly Excludes Customers and Community Members (P1):** In `appealService.ts:5`, `AppealEntityType` is typed strictly as `"BUSINESS" | "PROVIDER"`. Regular consumers, community contributors, and freelancers whose posts, comments, or customer accounts are suspended or moderated have zero pathway to submit an appeal.
6. **Non-Atomic Moderation Resolution Race Condition (P1):** In `AdminPanel.tsx`, `takeAction` executes the deletion RPC first, followed by a separate client request to `resolve(r.id, "ACTION_TAKEN")`. If the second call fails due to network disconnection, the target content is permanently deleted while the report remains `OPEN`. Subsequent attempts to resolve the report fail because the underlying database row no longer exists.

---

## 2. Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **MOD-1** | Silent Content Removal Without Author Notification or Explanation | 🔴 P0 (Critical Transparency & User Trust) | Moderating posts, comments, or requests silently wipes content with zero notice or explanation to the author, causing user confusion and complaints. |
| **MOD-2** | Unhandled Report Target Types (`USER`, `PROPOSAL`, `RATING`) No-Op | 🔴 P0 (Platform Safety & Abuse Vulnerability) | Flagged fake ratings, scam proposals, and abusive users fall through unhandled in `takeAction`, resolving reports as "action taken" while leaving abusive content live. |
| **MOD-3** | Moderation Actions Bypass Audit Trail (`admin_action_logs`) | 🔴 P0 (Compliance & Security Accountability) | Deleting posts, comments, and cancelling requests from the reports queue leaves no entry in `admin_action_logs`, creating insider abuse risk. |
| **MOD-4** | Blind Moderation Hazard (Zero Content Preview or Details in Reports) | 🟠 P1 (Operational Accuracy Hazard) | Admins cannot preview reported text, images, or reporter details in `AdminReports`, forcing blind destructive decisions. |
| **MOD-5** | Content Appeals Architecture Excludes Customers and Regular Users | 🟠 P1 (Fairness & Platform Governance) | `appealService` only permits business and provider review requests. Community posters and customers have no recourse to contest removals. |
| **MOD-6** | Non-Atomic Moderation Resolution Creates Orphaned Open Reports | 🟠 P1 (Queue Consistency Gap) | Deleting content before updating report status leaves reports permanently stuck open if the second network call fails. |

---

## 3. Detailed Findings & Root Cause Analysis

---

### 🔴 MOD-1 (P0): Silent Content Removal Without Author Notification or Explanation

- **Location:** [`src/screens/admin/AdminPanel.tsx:535-556`](file:///d:/zetax/name/STRYT/src/screens/admin/AdminPanel.tsx#L535-L556), [`src/services/core/adminService.ts:297-315`](file:///d:/zetax/name/STRYT/src/services/core/adminService.ts#L297-L315), [`supabase/migrations/20260916_admin_report_moderation.sql:24-54`](file:///d:/zetax/name/STRYT/supabase/migrations/20260916_admin_report_moderation.sql#L24-L54)
- **Root Cause:**
  1. In `AdminReports`:
     ```tsx
     async function takeAction(r: AdminReport) {
       try {
         const sb = getSupabase();
         if (r.targetType === "BUSINESS" || r.targetType === "PROVIDER") {
           const table = r.targetType === "BUSINESS" ? "businesses" : "providers";
           await sb.from(table).update({ status: "SUSPENDED" }).eq("id", r.targetId);
         } else if (r.targetType === "POST") {
           await sb.rpc("admin_delete_post", { p_id: r.targetId });
         } else if (r.targetType === "REQUEST") {
           await sb.rpc("admin_cancel_request", { p_id: r.targetId });
         } else if (r.targetType === "COMMENT") {
           await sb.rpc("admin_delete_comment", { p_id: r.targetId });
         }
         await resolve(r.id, "ACTION_TAKEN");
     ```
  2. In `adminService.resolveReport`:
     ```ts
     if (data?.reporter_user_id) {
       await notificationService.send(
         data.reporter_user_id,
         "Your report was reviewed",
         `Status: ${status.replace(/_/g, " ").toLowerCase()}${data.target_name ? ` — re: ${data.target_name}` : ""}`,
         "",
         "SYSTEM"
       );
     }
     ```
  3. Notice that `resolveReport` sends a notification ONLY to `reporter_user_id`.
  4. In `admin_delete_post`, `admin_cancel_request`, and `admin_delete_comment`, the database functions delete the target rows directly:
     ```sql
     create or replace function public.admin_delete_post(p_id text)
     ...
     delete from public.community_posts where id = p_id;
     ```
  5. The author of the post/comment or requester is NEVER queried, notified, or alerted.
  6. A user logs into STRYT and finds their community post or request completely missing with zero notification, zero record of removal, and no explanation of what rule they broke.
- **Remediation Plan:**
  - Update `admin_delete_post`, `admin_delete_comment`, and `admin_cancel_request` (or `takeAction`) to resolve the author/owner ID and dispatch a notification:
    `notificationService.send(authorId, "Content removed by moderation", "Your post was removed for violating community guidelines.", "", "SYSTEM")`.

---

### 🔴 MOD-2 (P0): Unhandled Report Target Types (`USER`, `PROPOSAL`, `RATING`) No-Op

- **Location:** [`src/screens/admin/AdminPanel.tsx:535-556`](file:///d:/zetax/name/STRYT/src/screens/admin/AdminPanel.tsx#L535-L556), [`src/components/ReportSheet.tsx:22`](file:///d:/zetax/name/STRYT/src/components/ReportSheet.tsx#L22)
- **Root Cause:**
  1. In `ReportSheet.tsx`, users can report:
     ```tsx
     targetType: BookmarkTarget | "PROPOSAL" | "USER" | "POST" | "RATING" | "COMMENT";
     ```
  2. In `AdminPanel.tsx`, `takeAction` checks:
     ```tsx
     if (r.targetType === "BUSINESS" || r.targetType === "PROVIDER") {
       ...
     } else if (r.targetType === "POST") {
       ...
     } else if (r.targetType === "REQUEST") {
       ...
     } else if (r.targetType === "COMMENT") {
       ...
     }
     await resolve(r.id, "ACTION_TAKEN");
     ```
  3. If `r.targetType` is `"RATING"` (a customer reported an abusive, extortive, or fake review), `"PROPOSAL"` (a scam quote), or `"USER"` (harassment by a user account), it matches NONE of the `if` branches!
  4. The code falls straight through and executes `await resolve(r.id, "ACTION_TAKEN")`.
  5. The report is marked resolved with status `ACTION_TAKEN`.
  6. In reality, **ZERO action was taken**! The abusive review remains prominently displayed on the merchant's profile, and the scam proposal remains open.
- **Remediation Plan:**
  - Add explicit handling for `RATING` (soft-delete/hide review via `ratings.is_hidden`), `PROPOSAL` (reject/archive proposal), and `USER` (toggle suspension or freeze customer profile).
  - Add a fallback check: if `targetType` is unrecognized or unhandled, prevent resolving the report as `ACTION_TAKEN` and alert the admin.

---

### 🔴 MOD-3 (P0): Moderation Actions Bypass Audit Trail (`admin_action_logs`)

- **Location:** [`src/screens/admin/AdminPanel.tsx:535-556`](file:///d:/zetax/name/STRYT/src/screens/admin/AdminPanel.tsx#L535-L556), [`supabase/migrations/20260916_admin_report_moderation.sql`](file:///d:/zetax/name/STRYT/supabase/migrations/20260916_admin_report_moderation.sql)
- **Root Cause:**
  1. The platform maintains an `admin_action_logs` table for administrative accountability.
  2. In `admin-delete-profile` and `verification-review`, every action logs:
     ```sql
     insert into public.admin_action_logs (admin_user_id, action, target_type, target_id, reason) ...
     ```
  3. However, `takeAction` in `AdminReports` and the RPCs `admin_delete_post`, `admin_cancel_request`, `admin_delete_comment` do not record any row in `admin_action_logs`.
  4. Suspending a business from `AdminReports` or deleting community posts leaves zero record in the audit log of which administrator authorized the deletion.
  5. If an admin account credential leaks or an admin abuses their authority, there is no audit log to investigate or attribute the incident.
- **Remediation Plan:**
  - Instrument `admin_delete_post`, `admin_cancel_request`, and `admin_delete_comment` to record the acting `v_uid` into `admin_action_logs` inside the database transaction.

---

### 🟠 MOD-4 (P1): Blind Moderation Hazard (Zero Content Preview or Details in Reports)

- **Location:** [`src/screens/admin/AdminPanel.tsx:563-584`](file:///d:/zetax/name/STRYT/src/screens/admin/AdminPanel.tsx#L563-L584), [`src/services/core/adminService.ts:277-295`](file:///d:/zetax/name/STRYT/src/services/core/adminService.ts#L277-L295)
- **Root Cause:**
  1. In `adminService.reports()`:
     ```ts
     return (data ?? []).map((r: any) => ({
       id: r.id,
       targetType: r.target_type,
       targetId: r.target_id,
       targetName: r.target_name,
       reason: r.reason,
       reporter: r.reporter?.name || "Anonymous",
       status: r.status as AdminReport["status"],
       time: relDate(r.created_at),
     }));
     ```
  2. The query selects `*`, but maps only high-level metadata.
  3. `r.details` (the reporter's text explanation from `ReportSheet.tsx:73`) is dropped from the returned object.
  4. In `AdminReports`:
     ```tsx
     <div className="semi small" style={{ marginTop: 8 }}>{r.targetName}</div>
     <div className="tiny muted">{r.targetType} • reported by {r.reporter}</div>
     <div className="row gap-8" style={{ marginTop: 12 }}>
       <button ... onClick={() => resolve(r.id, "DISMISSED")}>Dismiss</button>
       <button ... onClick={() => takeAction(r)}>Take action</button>
     </div>
     ```
  5. The card provides no link to view the post, no text snippet of what was written, and no media thumbnail.
  6. An administrator has no ability to evaluate whether the report is legitimate or frivolous without manually navigating to database tables.
- **Remediation Plan:**
  - Include `details` in `AdminReport` and render it in `AdminReports`.
  - Add contextual preview (e.g. fetching post snippet or comment body) and a deep-link to the content so admins can inspect before taking action.

---

### 🟠 MOD-5 (P1): Content Appeals Architecture Excludes Customers and Regular Users

- **Location:** [`src/services/core/appealService.ts:5, 36`](file:///d:/zetax/name/STRYT/src/services/core/appealService.ts#L5), [`src/screens/admin/AdminPanel.tsx:718-782`](file:///d:/zetax/name/STRYT/src/screens/admin/AdminPanel.tsx#L718-L782)
- **Root Cause:**
  1. In `appealService.ts`:
     ```ts
     export type AppealEntityType = "BUSINESS" | "PROVIDER";
     ```
  2. The review submission function is scoped:
     ```ts
     async submit(entityType: AppealEntityType, entityId: string, reason: string): Promise<void>
     ```
  3. In `account_appeals` table, `entity_type` has a check constraint restricting it to `'BUSINESS'` and `'PROVIDER'`.
  4. When a customer's community post or review is removed by moderation, or a customer account is suspended, there is no UI and no API endpoint for them to submit an appeal.
  5. In `AdminAppeals`, only business and provider review requests are listed.
- **Remediation Plan:**
  - Expand `AppealEntityType` to include `"USER"`, `"POST"`, and `"RATING"`.
  - Provide an "Appeal removal" button in the notification delivered when content is moderated.

---

### 🟠 MOD-6 (P1): Non-Atomic Moderation Resolution Race Condition

- **Location:** [`src/screens/admin/AdminPanel.tsx:535-556`](file:///d:/zetax/name/STRYT/src/screens/admin/AdminPanel.tsx#L535-L556)
- **Root Cause:**
  1. In `takeAction`:
     ```tsx
     await sb.rpc("admin_delete_post", { p_id: r.targetId });
     await resolve(r.id, "ACTION_TAKEN");
     ```
  2. The action consists of two independent, un-batched network requests.
  3. If the first call (`admin_delete_post`) succeeds but the second (`resolve`) fails due to a network glitch, timeout, or page closure:
     - The post is permanently deleted from `community_posts`.
     - The report remains `status: 'OPEN'` in `reports`.
  4. On reload, the report appears again in the open queue. If the admin clicks "Take action" again, `admin_delete_post` fails or is a no-op, but the error toast displays "Couldn't take action — try again", trapping the report in limbo.
- **Remediation Plan:**
  - Create a unified atomic RPC `admin_resolve_report_with_action(p_report_id, p_action)` that performs the content action and updates the report record in a single database transaction.

---

## 4. Verification & Validation Plan

### Automated Regression Verification
- [ ] Run `npm run check-colors` to guarantee zero raw hex color leaks in `AdminPanel.tsx`.
- [ ] Run `npx tsc --noEmit` to verify type safety across `AdminPanel.tsx`, `adminService.ts`, and `appealService.ts`.

### Manual Test Steps
1. **Report Content Preview:**
   - Submit a report on a community post with custom details via `ReportSheet`.
   - Open `/admin` -> Reports tab.
   - Verify the card displays the reporter's explanation details and a content preview.
2. **Unhandled Target Type Safety:**
   - Submit a report on a proposal or review rating.
   - Verify that clicking "Take action" either executes a valid moderation handler or clearly alerts that manual review is required, rather than silently doing nothing.
3. **Audit Trail Verification:**
   - Execute a moderation action in `AdminReports`.
   - Query `admin_action_logs` and verify an audit log row is created with `admin_user_id`, `action`, `target_type`, and timestamp.
4. **Author Notification:**
   - Moderate a user's test post from the admin console.
   - Log in as the author; verify an in-app notification is received explaining that the content was removed by moderation.
