# STRYT — Flow 9.2: Customer Review & Rating Flow Gap Log

**Audit Date:** September 9, 2026  
**Flow Identifier:** Flow 9.2 — Domain 9 (Community, Social Trust, Ratings & Reviews)  
**Primary Components:** [`RateScreen.tsx`](file:///d:/zetax/name/STRYT/src/screens/requests/RateScreen.tsx), [`ReviewSheet.tsx`](file:///d:/zetax/name/STRYT/src/components/ReviewSheet.tsx), [`BusinessDetail.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/BusinessDetail.tsx), [`ProviderDetail.tsx`](file:///d:/zetax/name/STRYT/src/screens/provider/ProviderDetail.tsx), [`MyAppointments.tsx`](file:///d:/zetax/name/STRYT/src/screens/requests/MyAppointments.tsx), [`AgreementScreen.tsx`](file:///d:/zetax/name/STRYT/src/screens/requests/AgreementScreen.tsx), [`Agreements.tsx`](file:///d:/zetax/name/STRYT/src/screens/requests/Agreements.tsx)  
**Backend Services & Tables:** `requestService.ts`, `businessService.ts`, `providerService.ts`, `public.ratings`, `public.businesses`, `public.providers`, `public.users`, `public.appointments`, `public.agreements`, DB trigger `trg_notify_on_rating`  
**Launch Readiness Status:** 🔴 **Critical Audit Blockers (Zero Rating Recomputation Trigger, Missing RLS UPDATE Policy, Responder Self-Rating Inversion)**

---

## 1. Executive Summary

Flow 9.2 governs the reputation, customer review, and star-rating engine across STRYT. The platform offers three distinct rating pathways:
1. **Direct Custom Agreements (`/rate/:id`, `RateScreen.tsx`):** Mutual rating and optional offline tipping after completing custom work contracts (Domain 4).
2. **Storefront Business Reviews (`BusinessDetail.tsx` -> `ReviewSheet.tsx` -> `businessService.addReview`):** Star ratings, verified booking badges, and written testimonials for local brick-and-mortar storefronts (Domain 7).
3. **Service Provider Reviews (`ProviderDetail.tsx` -> `ReviewSheet.tsx` -> `providerService.addReview`):** Reviews for solo professionals, technicians, and freelancers (Domain 8).

While the schema includes foundational attributes (e.g. `is_verified_booking` checking completed appointments in PostgreSQL, unique index `ratings_one_per_agreement`), rigorous end-to-end tracing exposed critical systemic breakdowns across the database trigger layer, RLS policies, and client components:

1. **Zero Database Rating Recomputation (P0):** Codebase documentation in `providerService.ts:424` claims: *"Submit a star rating + comment for a provider. Trigger recomputes rating_avg/count."* However, **no database trigger or RPC exists anywhere** to recompute `rating_avg` or `rating_count` on `businesses`, `providers`, or `users`. Real customer reviews are stored in `ratings`, but all storefront star badges, search ranking weights, and leaderboard filters (`where p.rating_count >= 1`) remain frozen at static seed values or 0.
2. **Missing RLS UPDATE Policy on `public.ratings` (P0):** In `businessService.addReview` and `providerService.addReview`, existing reviews are detected and updated (`sb.from("ratings").update(...)`). However, `supabase/legacy/ratings.sql` only declares `read_ratings` (SELECT) and `ins_ratings` (INSERT). There is **no UPDATE policy** on `public.ratings` for authenticated users. All review edits and updates are silently blocked or discarded by PostgreSQL RLS.
3. **Agreements Inversion Bug in `RateScreen.tsx` (P0):** In `RateScreen.tsx`, the component is hardcoded to rate `a.responderUserId`. When a *responder* (freelancer/technician) clicks the completed agreement rating button in `Agreements.tsx` (`rate_person`), `RateScreen` displays their own avatar, asks "How was [Your Own Name]?", offers a tip picker for themselves, and executes `requestService.rate(a.responderUserId, ...)`—**submitting a rating for themselves instead of rating the customer**.
4. **Missing Review CTA on Completed Appointments (P1):** While the backend has a `is_verified_booking` mechanism, `MyAppointments.tsx` (Past tab) has no "Rate & Review" CTA on completed bookings (`COMPLETED`). Customers have no direct bridge to review the business or provider they booked, stranding verified review generation.
5. **Notification Omission for Businesses and Providers (P1):** Database trigger `notify_on_rating()` only executes `if new.ratee_type = 'USER'`. Business owners (`owner_user_id`) and service providers (`user_id`) never receive a push/in-app notification when a customer submits a review on their profile.
6. **Owner Replies Dropped by Provider Reviews & Hidden on Storefronts (P1):** `providerService.reviews()` completely omits `owner_reply` and `owner_reply_at` from its `.select()`, and neither `ProviderDetail.tsx` nor `BusinessDetail.tsx` renders owner replies in their public reviews list, defeating the owner reply system built in `reply_to_rating`.

---

## 2. Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **CRAT-1** | Zero Rating Recomputation Trigger Leaves `rating_avg` & `rating_count` Permanently Stale | 🔴 P0 (Broken Reputation System) | Reviews insert into `ratings`, but `businesses.rating_avg`, `providers.rating_avg`, and `users.rating_avg` are never recalculated. All storefront headers, search sort orders, and leaderboards stay frozen. |
| **CRAT-2** | Missing RLS UPDATE Policy on `public.ratings` Silently Discards Review Edits | 🔴 P0 (Data Loss / RLS Rejection) | `addReview` attempts to update existing user reviews. Without a `FOR UPDATE` RLS policy matching `rater_user_id = auth.uid()::text`, Postgres RLS blocks all review updates. |
| **CRAT-3** | Responder Rating Inversion in `RateScreen.tsx` Submits Self-Rating | 🔴 P0 (Data Corruption / Critical UX Bug) | `RateScreen.tsx` hardcodes `a.responderUserId`. Responders rating clients on completed agreements see their own avatar and submit ratings/tips targeting themselves. |
| **CRAT-4** | Missing "Rate & Review" CTA on Completed Appointments (`MyAppointments.tsx`) | 🟠 P1 (Broken Conversion Loop) | Customers who complete an appointment have no rating action in their appointments history (`MyAppointments.tsx`). Verified reviews require tedious manual profile discovery. |
| **CRAT-5** | Notification Trigger Ignores `BUSINESS` and `PROVIDER` Ratees | 🟠 P1 (Notification Failure) | `trg_notify_on_rating` exclusively checks `ratee_type = 'USER'`. Merchants and solo providers are never notified when reviews are submitted. |
| **CRAT-6** | Provider Service Drops `owner_reply` & Public Storefronts Omit Replies | 🟠 P1 (Feature Invisibility) | `providerService.reviews()` drops `owner_reply`, and public detail screens never render merchant replies, leaving owner responses invisible to shoppers. |
| **CRAT-7** | Missing Cache Invalidation Post-Review in `businessService` & `providerService` | 🟠 P1 (Stale Local State) | Submitting a review does not bust `businessGetCache` or `providerGetCache`, leaving the active user with a stale cached profile upon return. |
| **CRAT-8** | `ReviewSheet` Blank on Existing Reviews & Missing Error Granularity | 🟡 P2 (UX Regression) | When re-reviewing, `ReviewSheet` defaults to 0 stars and blank comment instead of pre-populating existing text, overwriting content on submit. |
| **CRAT-9** | Touch Target & Accessibility Violations on Star Rating Pickers | 🟡 P2 (Accessibility / Mobile Polish) | Star picker buttons in `RateScreen.tsx` and `ReviewSheet.tsx` lack `aria-label`s and minimum 44x44px touch bounding boxes. |

---

## 3. Detailed Findings & Root Cause Analysis

---

### 🔴 CRAT-1 (P0): Zero Rating Recomputation Trigger Leaves `rating_avg` & `rating_count` Permanently Stale

- **Location:** [`src/services/marketplace/providerService.ts:424`](file:///d:/zetax/name/STRYT/src/services/marketplace/providerService.ts#L424), [`supabase/legacy/ratings.sql`](file:///d:/zetax/name/STRYT/supabase/legacy/ratings.sql)
- **Root Cause:**
  1. In `providerService.ts`:
     ```typescript
     /** Submit a star rating + comment for a provider. Trigger recomputes rating_avg/count. */
     async addReview(id: string, rating: number, comment: string): Promise<void> { ... }
     ```
  2. The code assumes a PostgreSQL trigger recalculates aggregate ratings whenever a row is inserted, updated, or deleted in `public.ratings`.
  3. Grep analysis across all migrations in `supabase/migrations/` and `supabase/legacy/` confirms that **no aggregate trigger exists**.
  4. The only trigger on `public.ratings` is `trg_notify_on_rating` (from migration `20260909_notify_request_agreement_gaps.sql`), which only handles notifications.
  5. As a direct consequence:
     - When a customer leaves a 5-star review, a row is saved in `public.ratings`.
     - `public.businesses.rating_avg`, `public.businesses.rating_count`, `public.providers.rating_avg`, and `public.providers.rating_count` remain unchanged.
     - Leaderboards (which query `where p.rating_count >= 1`), search rankings, and profile headers ("⭐ 4.8 (24)") never update in production.
- **Remediation Plan:**
  Create a PostgreSQL trigger function `recompute_rating_aggregates()` on `public.ratings` (`AFTER INSERT OR UPDATE OR DELETE`):
  - When `ratee_type = 'BUSINESS'`, update `public.businesses` setting `rating_avg = round(coalesce(avg(rating), 0), 2)`, `rating_count = count(*)` from `public.ratings where ratee_type = 'BUSINESS' and ratee_id = target_id`.
  - When `ratee_type = 'PROVIDER'`, update `public.providers` similarly.
  - When `ratee_type = 'USER'`, update `public.users` similarly.

---

### 🔴 CRAT-2 (P0): Missing RLS UPDATE Policy on `public.ratings` Silently Discards Review Edits

- **Location:** [`supabase/legacy/ratings.sql:22-31`](file:///d:/zetax/name/STRYT/supabase/legacy/ratings.sql#L22-L31), [`src/services/marketplace/businessService.ts:1046-1049`](file:///d:/zetax/name/STRYT/src/services/marketplace/businessService.ts#L1046-L1049)
- **Root Cause:**
  1. In `businessService.addReview()` and `providerService.addReview()`:
     ```typescript
     const { data: existing } = await sb.from("ratings").select("id").eq("rater_user_id", uid).eq("ratee_type", "BUSINESS").eq("ratee_id", id).maybeSingle();
     if (existing?.id) {
       const { error } = await sb.from("ratings").update({ rating, comment: comment || null, is_verified_booking: isVerifiedBooking }).eq("id", existing.id);
       throwIfError(error);
       return;
     }
     ```
  2. In `ratings.sql`, the RLS policies are:
     ```sql
     create policy read_ratings on public.ratings for select using (true);
     create policy ins_ratings on public.ratings for insert with check (rater_user_id = auth.uid()::text);
     ```
  3. There is **no `for update` policy** on `public.ratings`.
  4. In PostgreSQL RLS, if an UPDATE statement is executed without an UPDATE policy, the operation affects 0 rows (or raises a policy violation). Because Supabase `.update()` without `.select()` returns `{ data: null, error: null }` when 0 rows match RLS filters, the client believes the review was updated, but the database discards the update silently.
- **Remediation Plan:**
  Add an RLS update policy for authenticated users:
  ```sql
  create policy upd_ratings on public.ratings
    for update using (rater_user_id = auth.uid()::text)
    with check (rater_user_id = auth.uid()::text);
  ```

---

### 🔴 CRAT-3 (P0): Responder Rating Inversion in `RateScreen.tsx` Submits Self-Rating

- **Location:** [`src/screens/requests/RateScreen.tsx:15, 51, 64-66`](file:///d:/zetax/name/STRYT/src/screens/requests/RateScreen.tsx#L15), [`src/screens/requests/Agreements.tsx:88-96`](file:///d:/zetax/name/STRYT/src/screens/requests/Agreements.tsx#L88-L96)
- **Root Cause:**
  1. In `Agreements.tsx`:
     ```tsx
     const otherName = a.isRequester ? a.responderName : a.requesterName;
     ...
     {a.status === "COMPLETED" && (
       <button onClick={(e) => { e.stopPropagation(); nav(`/rate/${a.id}`); }}>
         {tf("rate_person", { name: otherName })}
       </button>
     )}
     ```
  2. When the responder (freelancer) completes the job, `otherName` correctly resolves to the client/requester (`a.requesterName`). The button invites them to rate the client.
  3. Tapping the button navigates to `/rate/:id`.
  4. In `RateScreen.tsx`:
     ```tsx
     const { data: a, loading } = useQuery(() => requestService.getAgreement(id), [id], `agreement:${id}`);
     ...
     <SafeImg src={a.responderAvatar} />
     <h2>How was {a.responderName}?</h2>
     ...
     await requestService.rate(a.responderUserId, rating, ...);
     ```
  5. `RateScreen.tsx` never checks whether the active logged-in user is `a.requesterUserId` or `a.responderUserId`. It assumes the user is always the requester rating the responder.
  6. When the responder rates the client:
     - They see their own face and name.
     - They are prompted to tip themselves.
     - Submitting inserts `ratee_id = a.responderUserId` (their own user ID), rating themselves instead of the client.
- **Remediation Plan:**
  Extract active user identity:
  ```typescript
  const isRequester = user.id === a.requesterUserId;
  const targetUserId = isRequester ? a.responderUserId : a.requesterUserId;
  const targetName = isRequester ? a.responderName : a.requesterName;
  const targetAvatar = isRequester ? a.responderAvatar : a.requesterAvatar;
  ```
  Only display the tipping picker if `isRequester === true`, and pass `targetUserId` to `requestService.rate()`.

---

### 🟠 CRAT-4 (P1): Missing "Rate & Review" CTA on Completed Appointments (`MyAppointments.tsx`)

- **Location:** [`src/screens/requests/MyAppointments.tsx:413-431`](file:///d:/zetax/name/STRYT/src/screens/requests/MyAppointments.tsx#L413-L431)
- **Root Cause:**
  1. When viewing `MyAppointments.tsx` on the `PAST` tab, appointments with `status === "COMPLETED"` only render two action buttons:
     - `openRebook(apt, "AGAIN")` ("Book again")
     - `nav('/${apt.targetType.toLowerCase()}/${apt.targetId}')` ("View shop" / "View profile")
  2. STRYT enforces `is_verified_booking` on reviews by checking whether the rater has an appointment with `status === 'COMPLETED'`.
  3. However, the app never provides a "Rate your experience" or "Write a review" button on the completed appointment card itself.
  4. Verified customers must exit their appointments screen, search for or click "View shop", scroll down past products, map, and hours to find the "Write a review" button in the reviews tab.
- **Remediation Plan:**
  Add a primary "Rate & review" button on completed appointment cards in `MyAppointments.tsx` that opens `ReviewSheet` directly (or navigates to the target reviews tab with `reviewing=true`).

---

### 🟠 CRAT-5 (P1): Notification Trigger Ignores `BUSINESS` and `PROVIDER` Ratees

- **Location:** [`supabase/migrations/20260909_notify_request_agreement_gaps.sql:323-337`](file:///d:/zetax/name/STRYT/supabase/migrations/20260909_notify_request_agreement_gaps.sql#L323-L337)
- **Root Cause:**
  1. Trigger function `public.notify_on_rating()` contains:
     ```sql
     if new.ratee_type = 'USER' and new.rater_user_id is not null then
       insert into public.notifications (user_id, type, title, body, deep_link)
       values (new.ratee_id, 'RATING', ...);
     end if;
     ```
  2. When a customer reviews a store (`new.ratee_type = 'BUSINESS'`) or service provider (`new.ratee_type = 'PROVIDER'`), `new.ratee_type` is not `'USER'`.
  3. The trigger exits without inserting a notification row.
  4. Shop owners (`businesses.owner_user_id`) and solo providers (`providers.user_id`) are never informed that their business received feedback.
- **Remediation Plan:**
  Update `notify_on_rating()` to resolve recipient user ID dynamically:
  - If `new.ratee_type = 'BUSINESS'`, look up `owner_user_id` from `public.businesses where id = new.ratee_id`.
  - If `new.ratee_type = 'PROVIDER'`, look up `user_id` from `public.providers where id = new.ratee_id`.
  - Insert notification with deep link to `/business/:id/manage/reviews` or `/provider/:id`.

---

### 🟠 CRAT-6 (P1): Provider Service Drops `owner_reply` & Public Storefronts Omit Replies

- **Location:** [`src/services/marketplace/providerService.ts:167`](file:///d:/zetax/name/STRYT/src/services/marketplace/providerService.ts#L167), [`src/screens/business/BusinessDetail.tsx:898-914`](file:///d:/zetax/name/STRYT/src/screens/business/BusinessDetail.tsx#L898-L914), [`src/screens/provider/ProviderDetail.tsx:527-542`](file:///d:/zetax/name/STRYT/src/screens/provider/ProviderDetail.tsx#L527-L542)
- **Root Cause:**
  1. Migration `20260861_rating_owner_reply.sql` introduced `owner_reply` and `reply_to_rating` RPC so merchants and providers can respond to customer reviews.
  2. However, in `providerService.ts:167`:
     ```typescript
     .select("id, rating, comment, created_at, is_verified_booking, rater:users!rater_user_id(name, alias, avatar, show_name_publicly)")
     ```
     `owner_reply` and `owner_reply_at` are omitted from the query.
  3. In `BusinessDetail.tsx` and `ProviderDetail.tsx`, the review rendering loops render `rv.raterName`, `rv.rating`, `rv.isVerifiedBooking`, and `rv.comment`, but **never render `rv.ownerReply`**.
  4. Owner replies are only visible to the merchant inside `ReviewsManager.tsx`. To customers reading reviews before booking, merchant responses do not exist.
- **Remediation Plan:**
  - Add `owner_reply, owner_reply_at` to `providerService.reviews()`.
  - Render an on-brand reply bubble (`card card-condensed` with `Owner reply`) beneath reviews in both `BusinessDetail.tsx` and `ProviderDetail.tsx` whenever `rv.ownerReply` is present.

---

### 🟠 CRAT-7 (P1): Missing Cache Invalidation Post-Review in `businessService` & `providerService`

- **Location:** [`src/services/marketplace/businessService.ts:1025-1061`](file:///d:/zetax/name/STRYT/src/services/marketplace/businessService.ts#L1025-L1061), [`src/services/marketplace/providerService.ts:425-460`](file:///d:/zetax/name/STRYT/src/services/marketplace/providerService.ts#L425-L460)
- **Root Cause:**
  1. Both `businessService.addReview()` and `providerService.addReview()` perform raw table writes.
  2. Neither method calls `bustBusinessGetCache(id)` or `bustProviderGetCache(id)`.
  3. Neither method invokes `invalidateQueryCache('biz:${id}')` or `invalidateQueryCache('provider:${id}')`.
  4. Even after DB aggregates are fixed, navigating back to the storefront will continue to render the stale cached entity.
- **Remediation Plan:**
  Import and invoke `bustBusinessGetCache(id)` and `invalidateQueryCache('biz:${id}')` in `businessService.addReview()`, and corresponding provider functions in `providerService.addReview()`.

---

### 🟡 CRAT-8 (P2): `ReviewSheet` Blank on Existing Reviews & Missing Error Granularity

- **Location:** [`src/components/ReviewSheet.tsx:13-32`](file:///d:/zetax/name/STRYT/src/components/ReviewSheet.tsx#L13-L32)
- **Root Cause:**
  1. `ReviewSheet` receives `targetName`, `onSubmit`, and `onClose`, but has no `initialRating` or `initialComment` props.
  2. If a customer already rated a business 5 stars with a comment and clicks "Write a review" to update it, the sheet opens completely blank.
  3. Submitting overwrites their previous comment with `null` if they don't re-type it.
  4. In `submit()`, the `catch` block swallows the error object and displays generic toast `"Couldn't submit. Try again."`.
- **Remediation Plan:**
  Accept `initialRating?: number` and `initialComment?: string` props, pre-fill local state, and pass error messages to toast.

---

### 🟡 CRAT-9 (P2): Touch Target & Accessibility Violations on Star Rating Pickers

- **Location:** [`src/screens/requests/RateScreen.tsx:71-78`](file:///d:/zetax/name/STRYT/src/screens/requests/RateScreen.tsx#L71-L78), [`src/components/ReviewSheet.tsx:44-57`](file:///d:/zetax/name/STRYT/src/components/ReviewSheet.tsx#L44-L57)
- **Root Cause:**
  1. Star picker buttons are rendered as bare `<button key={i} onClick={...}>` with no `aria-label` (e.g. `aria-label="${i} stars"`).
  2. Buttons rely solely on the icon dimensions (40px) without a padded 44x44px touch target bounding box required for mobile accessibility.
  3. Bottom action bar in `RateScreen.tsx:120` uses `background: "#fff"` and lacks `paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))"`.
- **Remediation Plan:**
  Add `aria-label`, style buttons with `minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center"`, and use CSS tokens with iOS safe area padding.

---

## 4. Master Tracker Registration

- **Domain:** Domain 9 — Community, Social Trust, Ratings & Reviews
- **Flow Identifier:** Flow 9.2 — Customer Review & Rating Flow
- **Audit Date:** September 9, 2026
- **Status:** 🔴 **Audited — Blocked by P0 Rating Recomputation & P0 RLS UPDATE Policy Gaps**
- **Gap Log File:** [`docs/gaps/CUSTOMER_RATINGS_GAP_LOG.md`](file:///d:/zetax/name/STRYT/docs/gaps/CUSTOMER_RATINGS_GAP_LOG.md)
