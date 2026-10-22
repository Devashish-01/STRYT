# STRYT — Flow 9.4: Vouches & Neighborhood Trust Scores Gap Log

**Audit Date:** September 9, 2026  
**Flow Identifier:** Flow 9.4 — Domain 9 (Community, Social Trust, Ratings & Reviews)  
**Primary Components:** [`ProviderDetail.tsx`](file:///d:/zetax/name/STRYT/src/screens/provider/ProviderDetail.tsx), [`PublicProfile.tsx`](file:///d:/zetax/name/STRYT/src/screens/PublicProfile.tsx), [`useSocialSlice.ts`](file:///d:/zetax/name/STRYT/src/store/useSocialSlice.ts)  
**Backend Services & Tables:** `socialService.ts`, `userService.ts`, `public.vouches`, `public.endorsements`, `public.providers`, `public.users`  
**Launch Readiness Status:** 🔴 **Critical Audit Blockers (Double-Counting Math, Well-Vouched Semantic Inversion, Swallowed Write Errors)**

---

## 1. Executive Summary

Flow 9.4 governs peer-to-peer neighborhood trust signals in STRYT, specifically **Vouches** (a neighbor attesting to a provider's overall credibility and character) and **Skill Endorsements** (neighbors verifying specific vocational capabilities such as plumbing, electrical work, or styling). Unlike anonymous ratings, vouches are designed to reflect accountable, localized social capital—displaying real neighbor avatars and names.

While the underlying tables (`public.vouches`, `public.endorsements`) with cascade foreign keys and `supabase_realtime` subscriptions exist, end-to-end tracing exposed critical mathematical errors, semantic inversions, and unhandled silent failures:

1. **Double-Counting & Avatar Duplication in `ProviderDetail.tsx` (P0):** The component computes total vouches as `vouchList.length + (hasVouched ? 1 : 0)`. Because `vouchList` already contains the active user's vouch record from PostgreSQL, the user's vouch is counted twice (e.g. 1 vouch displays as 2). In the avatar stack, both the user's avatar and a synthetic green `(+)` bubble render side-by-side for the same vouch.
2. **Semantic Inversion in User Public Profile (P0):** In `userService.ts`, the profile query counts `sb.from("vouches").eq("from_user_id", id)`—which measures **vouches given** to others. It maps this count to `u.vouchCount` on `PublicProfile.tsx` and awards the recipient the badge `"Well Vouched"`. Clicking vouch on 3 providers falsely awards the user an inbound reputation badge indicating they are heavily trusted by the community.
3. **Swallowed Write Failures in `socialService.ts` (P0):** In `addVouch`, `removeVouch`, `addEndorsement`, and `removeEndorsement`, Supabase return objects `{ error }` are completely ignored without checking `throwIfError(error)`. If RLS or database constraints reject the write, the client treats it as a success, leaving the local state desynchronized.
4. **No Database Guard Against Self-Vouching (P1):** Neither `vouches` nor `endorsements` contains a database check constraint or trigger preventing `from_user_id` from matching the provider's `user_id`. Providers can vouch for their own profile via direct API requests.
5. **Vouches Capped at 20 in UI Header (P1):** `socialService.vouches()` limits queries to `.limit(20)`. The header counter ("X neighbors vouch for...") relies on `vouchList.length` rather than an exact database count, capping all popular providers at 20 vouches.
6. **Unendorsed Skills Hidden from Endorsement (P1):** Skills listed on a provider profile that have 0 endorsements never appear in `endorsements` query results, preventing neighbors from initiating the first endorsement on newly added skills.

---

## 2. Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **VOUCH-1** | Double-Counting & Duplicate Avatar Stack in Provider Detail | 🔴 P0 (Visual & Mathematical Bug) | `vouchList.length + (hasVouched ? 1 : 0)` counts the logged-in user twice. Both their avatar and a green `(+)` bubble render simultaneously. |
| **VOUCH-2** | Semantic Inversion: "Well Vouched" Badge Awarded for Giving Outbound Vouches | 🔴 P0 (Integrity / Reputation Inversion) | `userService.ts` checks `from_user_id = id` (vouches given). Giving 3 vouches incorrectly awards the user the community trust badge `"Well Vouched"`. |
| **VOUCH-3** | Swallowed Write Errors in `socialService` Vouch and Endorsement Methods | 🔴 P0 (Silent Failure / State Desync) | `addVouch`, `removeVouch`, and endorsement methods discard `{ error }`. Network or RLS rejections leave optimistic state permanently wrong. |
| **VOUCH-4** | Absence of DB Constraints Against Self-Vouching & Self-Endorsement | 🟠 P1 (Gaming / Trust Manipulation) | Database lacks validation that `from_user_id` does not equal `providers.user_id`, allowing providers to artificially boost their own trust metrics. |
| **VOUCH-5** | Hard Query Limit Capping Vouch Counter at 20 | 🟠 P1 (Reputation Under-Reporting) | `vouches()` query uses `.limit(20)`. Highly vouched providers show max 20 vouches in the headline counter. |
| **VOUCH-6** | Unendorsed Provider Skills Excluded from Endorsement UI | 🟠 P1 (Workflow Dead-End) | Only skills with existing rows in `endorsements` render in `ProviderDetail.tsx`. Newly added skills cannot be endorsed by neighbors. |
| **VOUCH-7** | Missing Composite Neighborhood Trust Score | 🟡 P2 (Architecture Gap) | Vouches and reviews operate in silos without a composite trust score algorithm. |

---

## 3. Detailed Findings & Root Cause Analysis

---

### 🔴 VOUCH-1 (P0): Double-Counting & Duplicate Avatar Stack in Provider Detail

- **Location:** [`src/screens/provider/ProviderDetail.tsx:136-137, 415-430`](file:///d:/zetax/name/STRYT/src/screens/provider/ProviderDetail.tsx#L136-L137)
- **Root Cause:**
  1. In `ProviderDetail.tsx`:
     ```tsx
     const vouchList = vouches ?? [];
     const hasVouched = vouched.includes(p.id);
     ...
     <span className="semi small row gap-6">
       <Handshake size={16} color="var(--green-500)" />
       {tf("neighbors_vouch_for", { count: vouchList.length + (hasVouched ? 1 : 0), name: p.displayName.split(" ")[0] })}
     </span>
     ```
  2. `vouchList` is loaded from `socialService.vouches(id)`. If the current user has vouched in the database, `vouchList` already contains `{ byUserId: user.id, byName, byAvatar }`.
  3. Adding `+ (hasVouched ? 1 : 0)` increments the count by 1 again, displaying `N + 1` vouches.
  4. In the avatar stack:
     ```tsx
     {vouchList.slice(0, 6).map((v) => (
       <SafeImg key={v.byUserId} src={v.byAvatar} ... />
     ))}
     {hasVouched && (
       <div style={{ ... }}>
         <Plus size={16} />
       </div>
     )}
     ```
     The user sees their avatar in `vouchList.slice(0, 6)` AND a separate green plus circle at the end of the stack.
- **Remediation Plan:**
  - Check if the user is already present in `vouchList`:
    ```typescript
    const userInList = vouchList.some((v) => v.byUserId === user.id);
    const effectiveVouchCount = vouchList.length + (hasVouched && !userInList ? 1 : 0) - (!hasVouched && userInList ? 1 : 0);
    ```
  - Only render the synthetic indicator if `hasVouched && !userInList`.

---

### 🔴 VOUCH-2 (P0): Semantic Inversion: "Well Vouched" Badge Awarded for Giving Outbound Vouches

- **Location:** [`src/services/core/userService.ts:297, 357-362`](file:///d:/zetax/name/STRYT/src/services/core/userService.ts#L297), [`src/screens/PublicProfile.tsx:377-378`](file:///d:/zetax/name/STRYT/src/screens/PublicProfile.tsx#L377-L378)
- **Root Cause:**
  1. In `userService.ts`:
     ```typescript
     sb.from("vouches").select("*", { count: "exact", head: true }).eq("from_user_id", id),
     ...
     vouchCount: vouchRes.count ?? 0,
     badges: [
       ...((vouchRes.count ?? 0) >= PROFILE_BADGE_THRESHOLDS.wellVouched ? ["Well Vouched"] : []),
     ]
     ```
  2. The query filters by `from_user_id = id`, which is the user who clicked vouch for someone else.
  3. In `PublicProfile.tsx`, this metric is rendered as:
     ```tsx
     <span className="bold" style={{ fontSize: 18, color: "var(--red-500)" }}>{u.vouchCount}</span>
     <span className="tiny semi muted">{t("vouches_label")}</span>
     ```
  4. Displaying outbound vouches given under the label "Vouches" creates the false impression that `u.vouchCount` neighbors have vouched for this user.
  5. Awarding `"Well Vouched"` based on outbound vouches reverses the core meaning of community endorsement.
- **Remediation Plan:**
  - Rename the profile badge to `"Vouch Giver"` or `"Active Supporter"`.
  - On `PublicProfile.tsx`, clarify the label to `"Vouches Given"` (matching `socialService.ts:76`'s `"Vouch Giver"` achievement title).

---

### 🔴 VOUCH-3 (P0): Swallowed Write Errors in `socialService` Vouch and Endorsement Methods

- **Location:** [`src/services/engagement/socialService.ts:413-428, 448-463`](file:///d:/zetax/name/STRYT/src/services/engagement/socialService.ts#L413-L428)
- **Root Cause:**
  ```typescript
  async addVouch(providerId: string): Promise<void> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return;
    await sb.from("vouches").upsert(
      { from_user_id: uid, provider_id: providerId },
      { onConflict: "from_user_id,provider_id" }
    );
  }
  ```
  The return value of `.upsert()` is not destructured. `const { error } = await ...; throwIfError(error);` is omitted.
  The same flaw exists in `removeVouch`, `addEndorsement`, and `removeEndorsement`.
  When a write fails (e.g. invalid foreign key, RLS denial, network disconnection), the method resolves without throwing. In `useSocialSlice.ts`, the `try/catch` block never triggers its rollback branch, and the user believes their vouch was saved.
- **Remediation Plan:**
  Add `const { error } = await ...; throwIfError(error);` to all four mutation methods.

---

### 🟠 VOUCH-4 (P1): Absence of DB Constraints Against Self-Vouching & Self-Endorsement

- **Location:** [`supabase/legacy/migration_r9.sql:42-70`](file:///d:/zetax/name/STRYT/supabase/legacy/migration_r9.sql#L42-L70)
- **Root Cause:**
  `public.vouches` and `public.endorsements` tables do not enforce that `from_user_id` must not be the owner of the `provider_id`.
  A provider who knows their own provider UUID can submit `addVouch(theirProviderId)` and `addEndorsement(theirProviderId, skill)` using their own auth session, bypassing client UI guards.
- **Remediation Plan:**
  Add a PostgreSQL `BEFORE INSERT` trigger or check constraint ensuring `new.from_user_id <> (select user_id from public.providers where id = new.provider_id)`.

---

### 🟠 VOUCH-5 (P1): Hard Query Limit Capping Vouch Counter at 20

- **Location:** [`src/services/engagement/socialService.ts:404`](file:///d:/zetax/name/STRYT/src/services/engagement/socialService.ts#L404)
- **Root Cause:**
  `socialService.vouches()` appends `.limit(20)`.
  In `ProviderDetail.tsx:418`, the total vouch count displayed to visitors is derived from `vouchList.length`.
  Any provider with more than 20 vouches will permanently display a maximum count of 20 (or 21 due to the double-counting bug).
- **Remediation Plan:**
  Return `{ list: Vouch[], totalCount: number }` from `socialService.vouches()`, using `{ count: "exact" }` on the Supabase select query.

---

### 🟠 VOUCH-6 (P1): Unendorsed Provider Skills Excluded from Endorsement UI

- **Location:** [`src/screens/provider/ProviderDetail.tsx:383-412`](file:///d:/zetax/name/STRYT/src/screens/provider/ProviderDetail.tsx#L383-L412), [`src/services/engagement/socialService.ts:431-445`](file:///d:/zetax/name/STRYT/src/services/engagement/socialService.ts#L431-L445)
- **Root Cause:**
  1. In `socialService.endorsements(providerId)`:
     The function queries `from("endorsements").select("skill, from_user_id").eq("provider_id", providerId)`.
  2. If a provider lists skills in `p.skills` (e.g. `["Carpentry", "Painting", "Masonry"]`), but no neighbor has endorsed them yet, `endorsements` table contains 0 rows for those skills.
  3. `socialService.endorsements` returns `[]`.
  4. In `ProviderDetail.tsx:383`:
     `{endorseList.length > 0 && (`
     The entire Endorsements section is hidden! Neighbors can never see or click the "Endorse" button to give the first endorsement on a provider's skill!
- **Remediation Plan:**
  Merge `p.skills` with database endorsement counts in `ProviderDetail.tsx` (or inside `socialService.endorsements(providerId, providerSkills)`), so all listed skills render with a default count of `0` and an active "Endorse" button.

---

## 4. Master Tracker Registration

- **Domain:** Domain 9 — Community, Social Trust, Ratings & Reviews
- **Flow Identifier:** Flow 9.4 — Vouches & Neighborhood Trust Scores
- **Audit Date:** September 9, 2026
- **Status:** 🔴 **Audited — Blocked by P0 Double-Counting, Reputation Inversion & Swallowed Errors**
- **Gap Log File:** [`docs/gaps/VOUCHES_TRUST_GAP_LOG.md`](file:///d:/zetax/name/STRYT/docs/gaps/VOUCHES_TRUST_GAP_LOG.md)
