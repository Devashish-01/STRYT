# STRYT — Flow 9.3: Owner Response to Storefront Reviews Gap Log

**Audit Date:** September 9, 2026  
**Flow Identifier:** Flow 9.3 — Domain 9 (Community, Social Trust, Ratings & Reviews)  
**Primary Components:** [`ReviewsManager.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/manage/ReviewsManager.tsx), [`BusinessProfileHub.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BusinessProfileHub.tsx), [`BusinessDashboard.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BusinessDashboard.tsx), [`ManageNav.tsx`](file:///d:/zetax/name/STRYT/src/components/navigation/ManageNav.tsx)  
**Backend Services & Tables:** `businessService.ts`, `public.ratings`, DB RPC `reply_to_rating` (migration `20260861_rating_owner_reply.sql` and `20260912_notify_business_community_gaps.sql`)  
**Launch Readiness Status:** 🔴 **Critical Audit Blockers (Orphaned Route, Console Bottom Nav Stripped, Zero Provider Support)**

---

## 1. Executive Summary

Flow 9.3 governs merchant and provider reputation management, specifically enabling business owners and service professionals to review customer ratings, post official public replies, and report abusive or policy-violating reviews. The backend foundation includes a dedicated column pair (`owner_reply`, `owner_reply_at`), a PostgreSQL `SECURITY DEFINER` RPC (`reply_to_rating`), and an automated notification trigger that alerts customers when a business replies to their review.

However, comprehensive flow tracing revealed that the merchant-facing interface is almost entirely disconnected from the application:
1. **Orphaned Route (P0):** Route `/business/:id/manage/reviews` is declared in `src/App.tsx:714`, but **not a single link or button exists anywhere in the entire codebase** leading to it. In `BusinessProfileHub.tsx:108`, a teaser card explicitly reads `"{reviews?.length} reviews — open Business tab to reply"`, but the text is static and unclickable.
2. **Console Bottom Navigation Stripped (P0):** `ReviewsManager.tsx` uses bare `<div className="screen">` and omits `<ManageNav bizId={id} />`. Entering the screen strips the merchant console bottom bar.
3. **Provider Console Missing Route & UI (P0):** While the database RPC `reply_to_rating` explicitly supports providers (`elsif v_ratee_type = 'PROVIDER'`), there is no `/provider/:id/manage/reviews` route or UI component for solo providers to view or reply to reviews.
4. **Replies Cannot Be Edited or Removed (P1):** Once an owner submits a reply, `ReviewsManager.tsx` renders a read-only bubble. If an owner makes a typo or wants to update an apology/resolution, the UI provides no "Edit" or "Delete" option.
5. **No Authorization Guard on Screen (P1):** Anyone who enters the URL can view the management screen and see active "Reply" textareas, failing with an unhandled `FORBIDDEN` toast only upon submit.
6. **Missing Empty State Component (P1):** On zero reviews or empty star filters, the screen renders an empty white container with zero visual feedback or guidance.

---

## 2. Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **RMGR-1** | Orphaned Route: `/business/:id/manage/reviews` Has Zero In-App Entry Points | 🔴 P0 (Dead Feature / Unreachable UI) | The review management screen exists in isolation. Merchants have no UI entry point from Dashboard, Profile Hub, Settings, or Navigation bar. |
| **RMGR-2** | Console Bottom Navigation Bar Stripped on Reviews Manager | 🔴 P0 (Navigation Trap) | `ReviewsManager.tsx` omits `<ManageNav bizId={id} />`, trapping the merchant and breaking console workflow. |
| **RMGR-3** | Solo Providers Excluded from Review Management Despite Backend RPC Support | 🔴 P0 (Incomplete Pro Parity) | The database supports provider replies, but solo providers have no route, console link, or screen to reply to customer reviews. |
| **RMGR-4** | Submitted Owner Replies Are Permanently Immutable in UI | 🟠 P1 (Operational Rigidity) | Once posted, `r.ownerReply` renders as a static card with no edit or delete option. Typos or outdated resolutions cannot be corrected. |
| **RMGR-5** | Missing Screen Authorization & Role Checks | 🟠 P1 (Permissive UI State) | Unprivileged users can access the route and see reply input fields, experiencing cryptic error toasts on submission. |
| **RMGR-6** | Complete Absence of Empty States for Zero Reviews or Empty Filters | 🟠 P1 (Degraded UX) | When there are no reviews or when filtering yields no results, the screen renders a blank whitespace with no explanation. |
| **RMGR-7** | Delegated Team Members Forbidden from Replying to Reviews | 🟡 P2 (Team Role Inflexibility) | `reply_to_rating` RPC checks only `businesses.owner_user_id`, rejecting authorized managers and support delegates. |
| **RMGR-8** | Star Filter Header Disconnect | 🟡 P2 (Visual Polish) | Selecting a star filter does not update the subtitle review count to reflect the filtered set. |

---

## 3. Detailed Findings & Root Cause Analysis

---

### 🔴 RMGR-1 (P0): Orphaned Route: `/business/:id/manage/reviews` Has Zero In-App Entry Points

- **Location:** [`src/App.tsx:714`](file:///d:/zetax/name/STRYT/src/App.tsx#L714), [`src/screens/business/manage/BusinessProfileHub.tsx:105-110`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BusinessProfileHub.tsx#L105-L110), [`src/screens/business/manage/BusinessDashboard.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BusinessDashboard.tsx)
- **Root Cause:**
  1. In `src/App.tsx`:
     ```tsx
     <Route path="/business/:id/manage/reviews" element={<ReviewsManager />} />
     ```
  2. A global grep across `src/` reveals that no component navigates to or links to `/business/:id/manage/reviews`.
  3. In `BusinessProfileHub.tsx:105-110`:
     ```tsx
     {(reviews ?? []).length > 0 && (
       <div>
         <div className="profile-eyebrow">Recent reviews</div>
         <div className="tiny muted" style={{ marginBottom: 8 }}>{reviews?.length} review{(reviews?.length ?? 0) === 1 ? "" : "s"} — open Business tab to reply</div>
       </div>
     )}
     ```
     The author wrote a hint stating `"open Business tab to reply"`, but failed to add a navigation handler or button.
  4. Merchants cannot access `ReviewsManager.tsx` through any standard in-app navigation.
- **Remediation Plan:**
  - In `BusinessProfileHub.tsx`, make the "Recent reviews" section a clickable `SettingsRow` or card navigating to `${base}/manage/reviews`.
  - In `BusinessSettings.tsx`, add a "Customer reviews" row under the Profile section.
  - On `BusinessDetail.tsx` (when viewed by the owner), add a "Manage reviews" shortcut button on the Reviews tab.

---

### 🔴 RMGR-2 (P0): Console Bottom Navigation Bar Stripped on Reviews Manager

- **Location:** [`src/screens/business/manage/ReviewsManager.tsx:31-49`](file:///d:/zetax/name/STRYT/src/screens/business/manage/ReviewsManager.tsx#L31-L49)
- **Root Cause:**
  ```tsx
  return (
    <div className="screen">
      <AppBar title="Reviews" subtitle={`${avg}★ • ${reviews.length} reviews`} />
      <div className="screen-scroll">
        ...
      </div>
    </div>
  );
  ```
  `ReviewsManager.tsx` wraps its view in `<div className="screen">` and omits `<ManageNav bizId={id} />`.
  Unlike all other merchant console screens, entering reviews strips the persistent bottom navigation bar.
- **Remediation Plan:**
  Change outer wrapper to `<div className="screen with-nav">` and render `<ManageNav bizId={id} />` at the bottom of the screen.

---

### 🔴 RMGR-3 (P0): Solo Providers Excluded from Review Management Despite Backend RPC Support

- **Location:** [`supabase/migrations/20260912_notify_business_community_gaps.sql:83-84`](file:///d:/zetax/name/STRYT/supabase/migrations/20260912_notify_business_community_gaps.sql#L83-L84), [`src/App.tsx`](file:///d:/zetax/name/STRYT/src/App.tsx)
- **Root Cause:**
  1. The database RPC `reply_to_rating` explicitly handles both entity types:
     ```sql
     if v_ratee_type = 'BUSINESS' then
       select owner_user_id, name into v_owner, v_ratee_name from public.businesses where id = v_ratee_id;
     elsif v_ratee_type = 'PROVIDER' then
       select user_id, display_name into v_owner, v_ratee_name from public.providers where id = v_ratee_id;
     ...
     ```
  2. However, the frontend router only registers `/business/:id/manage/reviews`.
  3. There is no `/provider/:id/manage/reviews` route, and `ReviewsManager.tsx` exclusively calls `businessService.reviews(id)` and `businessService.replyToReview()`.
  4. Solo professionals have no way to exercise their backend capability to reply to customer feedback.
- **Remediation Plan:**
  Generalize `ReviewsManager.tsx` to support both `entityType="BUSINESS"` and `entityType="PROVIDER"` (or accept an optional prop / route check), and register `/provider/:id/manage/reviews` in `App.tsx` linked from `ProviderProfileHub.tsx`.

---

### 🟠 RMGR-4 (P1): Submitted Owner Replies Are Permanently Immutable in UI

- **Location:** [`src/screens/business/manage/ReviewsManager.tsx:84-88`](file:///d:/zetax/name/STRYT/src/screens/business/manage/ReviewsManager.tsx#L84-L88)
- **Root Cause:**
  ```tsx
  {r.ownerReply ? (
    <div className="card card-condensed" style={{ marginTop: 10, background: "var(--ink-50)", border: "none" }}>
      <div className="tiny semi" style={{ color: "var(--brand-700)" }}>Owner reply</div>
      <p className="small" style={{ marginTop: 2 }}>{r.ownerReply}</p>
    </div>
  ) : ...
  ```
  When `r.ownerReply` exists, the component renders plain text with no action buttons.
  The underlying PostgreSQL function `reply_to_rating` allows updates to `owner_reply`, but the UI provides no "Edit reply" button to reopen the textarea.
- **Remediation Plan:**
  Add an "Edit reply" button next to `Owner reply` that sets `replying = true` with `reply = r.ownerReply`.

---

### 🟠 RMGR-5 (P1): Missing Screen Authorization & Role Checks

- **Location:** [`src/screens/business/manage/ReviewsManager.tsx:12-25`](file:///d:/zetax/name/STRYT/src/screens/business/manage/ReviewsManager.tsx#L12-L25)
- **Root Cause:**
  `ReviewsManager.tsx` performs zero identity or role checks on mount.
  If an unauthenticated user or unrelated customer navigates to the URL, they see all review cards with active "Reply" buttons.
  Tapping "Post reply" triggers an unhandled RPC exception (`FORBIDDEN`).
- **Remediation Plan:**
  Verify that the authenticated user is the owner or an authorized team member before rendering reply controls, or redirect unauthorized visitors to the public storefront.

---

### 🟠 RMGR-6 (P1): Complete Absence of Empty States for Zero Reviews or Empty Filters

- **Location:** [`src/screens/business/manage/ReviewsManager.tsx:42-46`](file:///d:/zetax/name/STRYT/src/screens/business/manage/ReviewsManager.tsx#L42-L46)
- **Root Cause:**
  ```tsx
  {!loading && !error && (
    <div className="page-pad col gap-14">
      {list.map((r) => <ReviewItem key={r.id} r={r} onReplied={refetch} />)}
    </div>
  )}
  ```
  If `list.length === 0`:
  - New businesses with no reviews see an empty void below the filter bar.
  - Filtering by a star rating with 0 matching reviews (e.g. 1★) shows a blank screen.
- **Remediation Plan:**
  Render an `EmptyState` component:
  ```tsx
  {list.length === 0 ? (
    <EmptyState
      emoji="⭐"
      title={filter ? `No ${filter}-star reviews` : "No reviews yet"}
      text={filter ? "Try selecting another rating filter." : "Reviews from customers will appear here."}
    />
  ) : (
    list.map(...)
  )}
  ```

---

### 🟡 RMGR-7 (P2): Delegated Team Members Forbidden from Replying to Reviews

- **Location:** [`supabase/migrations/20260912_notify_business_community_gaps.sql:89`](file:///d:/zetax/name/STRYT/supabase/migrations/20260912_notify_business_community_gaps.sql#L89)
- **Root Cause:**
  In `reply_to_rating`:
  `if v_owner is null or v_owner != v_uid then raise exception 'FORBIDDEN'; end if;`
  This check solely verifies `businesses.owner_user_id`.
  Team members granted manager roles in `business_team` cannot reply on behalf of the store.
- **Remediation Plan:**
  Update the RPC to also check `exists (select 1 from public.business_team where business_id = v_ratee_id and user_id = v_uid and role in ('OWNER', 'MANAGER'))`.

---

## 4. Master Tracker Registration

- **Domain:** Domain 9 — Community, Social Trust, Ratings & Reviews
- **Flow Identifier:** Flow 9.3 — Owner Response to Storefront Reviews
- **Audit Date:** September 9, 2026
- **Status:** 🔴 **Audited — Blocked by P0 Orphaned Route, P0 Nav Stripping & Pro Gap**
- **Gap Log File:** [`docs/gaps/REVIEWS_MANAGER_GAP_LOG.md`](file:///d:/zetax/name/STRYT/docs/gaps/REVIEWS_MANAGER_GAP_LOG.md)
