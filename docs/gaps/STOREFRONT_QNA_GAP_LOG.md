# STRYT — Flow 7.7: Storefront Q&A Management Gap Log

**Audit Date:** September 9, 2026  
**Flow Identifier:** Flow 7.7 — Domain 7 (Storefront Console & Merchant Operations)  
**Primary Components:** [`QnaManager.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/manage/QnaManager.tsx), [`BusinessHub.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BusinessHub.tsx), [`LeadsInbox.tsx`](file:///d:/zetax/name/STRYT/src/screens/manage/LeadsInbox.tsx), [`BusinessDetail.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/BusinessDetail.tsx)  
**Backend Services & Tables:** `businessService.ts`, `public.business_qna`, `public.qna_upvotes`, Supabase triggers (`trg_notify_qna_answered`)  
**Launch Readiness Status:** 🟡 **Audited & Blocked by P0 Unasserted Updates & Navigation Isolation Gaps**

---

## 1. Executive Summary

Flow 7.7 empowers local merchants and designated staff (`leads` scope) to respond to public questions asked by prospective customers on their business storefront (`/business/:id/manage/qna`). When questions are answered, automated database triggers notify the original inquirer, and the verified response is published to the public shop profile to inform future visitors.

While the card layout, upvote sorting, and real-time subscription (`useQueryWithRealtime`) provide a modern baseline, several critical gaps undermine its reliability:
1. **Unasserted Updates & Silent RLS Rejections:** `businessService.answerQuestion()` performs an `UPDATE` on `business_qna` without checking affected row counts. If RLS rejects the update or the user session has desynchronized, PostgREST returns zero rows and no error. The UI toasts `"Answer posted"`, misleading the merchant while the database remains unchanged.
2. **Missing Console Navigation & Layout Breakage:** `QnaManager.tsx` lacks `<ManageNav bizId={id} />` and uses `<div className="screen">` rather than `<div className="screen with-nav">`. Entering the Q&A manager completely strips the bottom console navigation bar, trapping merchants with only browser history back navigation.
3. **Realtime State Clashing & Local Drift:** Upon posting an answer, `QaCard` toggles local component state without refetching parent query data. Because `data` in `QnaManager` retains `answer: null`, the card remains in the "unanswered" position in the sorted list until a separate realtime event or full page reload occurs.
4. **No Spam or Inappropriate Content Moderation:** Business owners have zero ability to hide, report, or delete abusive, spam, or defamatory questions posted to their shop profile. PostgreSQL has no `delete` policy on `business_qna` for merchants.
5. **No Cancel / Discard Affordance in Edit Mode:** Once a merchant taps "Edit" on an existing answer, there is no cancel button to discard changes and revert to the published answer.

---

## 2. Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **QNA-1** | Silent PostgREST No-Op Updates Mask Failed Answer Submissions | 🔴 P0 (False Positive Confirmation) | In `businessService.ts:899-907`, `answerQuestion` executes without checking whether any rows were updated. If the user's `leads` permission is revoked, session is expired, or row lock fails, PostgREST returns 0 rows. The UI displays `"Answer posted"`, but the customer never receives an answer or notification. |
| **QNA-2** | Missing Console Navigation Traps Merchants | 🔴 P0 (Broken Navigation & Shell Inconsistency) | In `QnaManager.tsx:24`, `<ManageNav bizId={id} />` is completely absent. Merchants navigating from `BusinessHub` or `LeadsInbox` lose their bottom console navigation bar, creating inconsistent navigation across the merchant portal. |
| **QNA-3** | Answer Posting Does Not Synchronize Parent List Sort Order | 🟠 P1 (UI State Drift & Misleading Priority) | In `QaCard.save()`, `q.answer` is not updated in the parent `data` array, nor is `refetch()` called. The question remains sorted among high-priority unanswered questions until the entire page is refreshed. |
| **QNA-4** | Zero Moderation or Deletion Controls for Malicious / Spam Questions | 🟠 P1 (Harassment & Defamation Exposure) | Competitors or trolls can post abusive questions to a storefront. `business_qna` lacks a `DELETE` policy for business owners, and `QnaManager.tsx` has no hide or report button, leaving shops helpless against public vandalism. |
| **QNA-5** | Edit Answer Mode Lacks Cancel or Discard Option | 🟡 P2 (Trapped Edit State) | When tapping "Edit" on an already answered question, the text area replaces the answer view. There is no cancel button or `Escape` key handler to discard changes and restore the previous text. |
| **QNA-6** | Untrimmed Whitespace and Unbounded Input Length | 🟡 P2 (Data Quality & Layout Flaw) | While submission is disabled for `< 2` characters, `answerQuestion()` transmits raw untrimmed text, saving trailing whitespace to the database. Very long questions also render without line clamping or expand/collapse toggles. |

---

## 3. Detailed Findings & Root Cause Analysis

---

### 🔴 QNA-1 (P0): Silent PostgREST No-Op Updates Mask Failed Answer Submissions

- **Location:** [`businessService.ts:899-907`](file:///d:/zetax/name/STRYT/src/services/marketplace/businessService.ts#L899-L907), [`QnaManager.tsx:50-62`](file:///d:/zetax/name/STRYT/src/screens/business/manage/QnaManager.tsx#L50-L62)
- **Root Cause:**
  ```typescript
  async answerQuestion(qId: string, answer: string) {
    const sb = getSupabase();
    const { error } = await sb
      .from("business_qna")
      .update({ answer, answered_at: new Date().toISOString() })
      .eq("id", qId);
    throwIfError(error);
    return { ok: true };
  }
  ```
  PostgREST does not raise an error when an `UPDATE` targets a row blocked by RLS (`upd_qna` in `20260829_fix_can_manage_business_overreach.sql:95`). It returns `data: []` and `error: null`.
  Because `answerQuestion` does not check `.select("id")` with `assertRowsUpdated()`, the function returns `{ ok: true }`.
  `QaCard.save()` executes:
  ```typescript
  setAnswered(true);
  setEditing(false);
  showToast("Answer posted");
  ```
  The merchant sees a successful green toast, but the database was never updated, and the `trg_notify_qna_answered` notification trigger never fires.
- **Remediation Plan:**
  Update `answerQuestion` to select the updated row ID and assert that at least 1 row was updated:
  ```typescript
  const { data, error } = await sb
    .from("business_qna")
    .update({ answer: answer.trim(), answered_at: new Date().toISOString() })
    .eq("id", qId)
    .select("id");
  throwIfError(error);
  assertRowsUpdated(data);
  ```

---

### 🔴 QNA-2 (P0): Missing Console Navigation Traps Merchants

- **Location:** [`QnaManager.tsx:24-40`](file:///d:/zetax/name/STRYT/src/screens/business/manage/QnaManager.tsx#L24-L40), [`ManageNav.tsx:43`](file:///d:/zetax/name/STRYT/src/screens/business/manage/ManageNav.tsx#L43)
- **Root Cause:**
  In `ManageNav.tsx`, `/qna` is explicitly registered under the business tab (`bizRoutes`).
  However, `QnaManager.tsx` wraps its content in a plain `<div className="screen">` without `<ManageNav bizId={id} />`:
  ```tsx
  return (
    <div className="screen">
      <AppBar title="Questions & Answers" />
      <div className="screen-scroll">
        ...
      </div>
    </div>
  );
  ```
  Navigating to Q&A destroys the bottom navigation bar. Merchants cannot switch back to Home, Catalog, Queue, or Bookings without pressing the browser's back button repeatedly.
- **Remediation Plan:**
  Change root wrapper to `<div className="screen with-nav">` and render `<ManageNav bizId={id} />` before closing the screen container.

---

### 🟠 QNA-3 (P1): Answer Posting Does Not Synchronize Parent List Sort Order

- **Location:** [`QnaManager.tsx:32-35, 50-61`](file:///d:/zetax/name/STRYT/src/screens/business/manage/QnaManager.tsx#L32-L35)
- **Root Cause:**
  `QnaManager` sorts questions so that unanswered questions appear at the top, followed by answered questions:
  ```typescript
  [...data].sort((a, b) => {
    if (!!a.answer !== !!b.answer) return a.answer ? 1 : -1;
    return b.upvotes - a.upvotes;
  })
  ```
  When an owner posts an answer in `QaCard`, only `QaCard`'s internal state (`answered`) is updated. The parent's `data` array is not mutated, and `refetch()` is not called.
  The answered question remains pinned among the unanswered questions at the top of the list until the user manually leaves and re-enters the screen.
- **Remediation Plan:**
  Pass `onAnswered: (answer: string) => void` or `onRefetch: () => void` from `QnaManager` to `QaCard`, invoking `refetch()` or performing an optimistic update on the parent question object.

---

### 🟠 QNA-4 (P1): Zero Moderation or Deletion Controls for Malicious / Spam Questions

- **Location:** [`schema.sql`](file:///d:/zetax/name/STRYT/supabase/migrations/20260829_fix_can_manage_business_overreach.sql#L94-L103), [`QnaManager.tsx:64-91`](file:///d:/zetax/name/STRYT/src/screens/business/manage/QnaManager.tsx#L64-L91)
- **Root Cause:**
  There is no `DELETE` policy on `public.business_qna` for business owners or staff. If an offensive or spam question is submitted to a store's public page, the merchant has no option to remove or hide it.
- **Remediation Plan:**
  1. Add an RLS policy and service method allowing business owners (`owner_user_id = auth.uid()`) to delete questions posted to their business.
  2. Add a trash/delete icon button with confirmation prompt on each `QaCard`.

---

### 🟡 QNA-5 (P2): Edit Answer Mode Lacks Cancel or Discard Option

- **Location:** [`QnaManager.tsx:78-89`](file:///d:/zetax/name/STRYT/src/screens/business/manage/QnaManager.tsx#L78-L89)
- **Root Cause:**
  When `editing === true`, `QaCard` displays only the `<textarea>` and a single `"Post answer"` button. There is no `"Cancel"` button.
  If the merchant clicks "Edit" by mistake or wants to revert modifications, they cannot exit edit mode without posting the modified text.
- **Remediation Plan:**
  Add a `"Cancel"` button alongside the submit button that resets `answer` to `q.answer ?? ""` and sets `editing = false`.

---

## 4. Verification & Testing Checklist

- [ ] Ensure `<ManageNav bizId={id} />` renders properly at the bottom of the Q&A manager screen.
- [ ] Verify that saving an answer asserts row update and displays error toast if write permissions are absent.
- [ ] Answering a question updates the list position so that answered questions move below unanswered questions.
- [ ] Tapping "Edit" on an answered question reveals both "Save" and "Cancel" buttons.
- [ ] Pressing "Cancel" restores original answer text and exits edit mode without database calls.
- [ ] Answering trims leading and trailing whitespace before database submission.
- [ ] Run `npm run check-colors` and `npx tsc --noEmit` to verify code hygiene.
