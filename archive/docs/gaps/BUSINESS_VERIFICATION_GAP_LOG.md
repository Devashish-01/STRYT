# STRYT — Flow 7.10: Business KYC & Verification Center Gap Log

**Audit Date:** September 9, 2026  
**Flow Identifier:** Flow 7.10 — Domain 7 (Storefront Console & Merchant Operations)  
**Primary Components:** [`VerificationCenter.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/manage/VerificationCenter.tsx), [`VerificationPanel.tsx`](file:///d:/zetax/name/STRYT/src/components/VerificationPanel.tsx), [`BusinessProfileHub.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BusinessProfileHub.tsx)  
**Backend Services & Tables:** `businessService.ts`, `providerService.ts`, `uploadService.ts`, `public.businesses`, Supabase Private Storage (`verification` bucket), DB trigger (`trg_protect_verification_status`)  
**Launch Readiness Status:** 🟡 **Audited & Blocked by P0 Cache Desync & Missing Submission Status Feedback**

---

## 1. Executive Summary

Flow 7.10 governs trust and merchant credentialing on STRYT (`/business/:id/manage/verify`). Through `VerificationCenter.tsx` and the shared `VerificationPanel.tsx`, shop owners submit identity proofs, GST certificates, business registration licenses, and shopfront photographs to achieve "STRYT Verified" status. A database trigger (`trg_protect_verification_status`) strictly enforces that only the automated backend verification worker or an authorized admin can grant `APPROVED` or `REJECTED` status.

While the zero-trust private bucket architecture (`uploadPrivate`) and review status banners are well-conceived, key operational and state management gaps hinder the verification experience:
1. **Cache Lock Keeps Status Stale Post-Submission:** When documents are submitted, `businessService.submitVerification()` updates `businesses.verification_status` to `UNDER_REVIEW`. However, it fails to invoke `bustBusinessGetCache(id)` or `invalidateQueryCache('business:${id}')`. When returning to `BusinessProfileHub.tsx`, the cached business record still displays "Get verified" rather than "Under review".
2. **Profile Hub Status Blindness:** `BusinessProfileHub.tsx:59` computes the verification hint as `b?.isVerified ? "Verified ✓" : "Get verified"`. It completely ignores `UNDER_REVIEW` and `REJECTED` statuses, misleading merchants into believing their submission failed.
3. **No File Size Validation on PDFs:** Document selection accepts `application/pdf` alongside images. While images are compressed client-side, PDFs bypass compression and are uploaded raw. Unchecked multi-megabyte PDFs exceed Supabase storage limits and trigger cryptic upload failures without explanatory guidance.
4. **No Submission Withdrawal or Document Replacement:** Once in `UNDER_REVIEW`, merchants cannot cancel a submission, replace an erroneous file, or view previously uploaded document names.

---

## 2. Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **VER-1** | Missing Cache Invalidation Keeps Profile Hub and Verification Panel Desynchronized | 🔴 P0 (Stale UI & Resubmission Confusion) | `submitVerification()` does not bust coalesced in-flight promises or invalidate `queryCache('business:${id}')`. The merchant sees "Documents submitted" toast, but navigating back to Profile Hub displays "Get verified", prompting repeated duplicate submissions. |
| **VER-2** | Profile Hub Ignores "Under Review" Status | 🔴 P0 (Misleading Verification State) | `BusinessProfileHub.tsx:59` only checks `b?.isVerified`. When verification is pending, it displays "Get verified" instead of "Under review ⏳", giving false feedback that the merchant has not applied. |
| **VER-3** | Unvalidated PDF File Size Triggers Storage Rejection | 🟠 P1 (Silent / Cryptic Upload Failure) | `VerificationPanel.tsx:86` accepts PDFs without verifying file size. Large scanned licenses (> 5MB) trigger unhandled PostgREST storage quota errors. |
| **VER-4** | Inability to View Submitted Documents or Withdraw Pending Review | 🟡 P2 (Merchant Workflow Blindspot) | When status is `UNDER_REVIEW`, the screen shows only a static clock icon. The merchant cannot see which files were uploaded or withdraw an accidental submission. |
| **VER-5** | Dark Mode Theme Inconsistencies on Status Cards | 🟢 P3 (Visual Contrast Polish) | Status cards use hardcoded light backgrounds (`var(--green-100)`, `var(--red-50)`, `var(--brand-50)`) that do not invert cleanly in dark themes. |

---

## 3. Detailed Findings & Root Cause Analysis

---

### 🔴 VER-1 (P0): Missing Cache Invalidation Keeps Profile Hub Desynchronized

- **Location:** [`businessService.ts:742-757`](file:///d:/zetax/name/STRYT/src/services/marketplace/businessService.ts#L742-L757), [`VerificationPanel.tsx:56-60`](file:///d:/zetax/name/STRYT/src/components/VerificationPanel.tsx#L56-L60)
- **Root Cause:**
  In `businessService.ts`:
  ```typescript
  async submitVerification(id: string, files: File[]) {
    ...
    const { error } = await sb.from("businesses").update({
      verification_status: "UNDER_REVIEW",
      verification_documents: paths,
      verification_document_url: paths[0],
      verification_reason: null,
    }).eq("id", id);
    throwIfError(error);
    return { ok: true };
  }
  ```
  Neither `bustBusinessGetCache(id)` nor `invalidateQueryCache('business:${id}')` is called.
  When `VerificationPanel` calls `load()` using `svc.get(entityId)`, if an in-flight promise was present, it resolves to the pre-update entity.
  Furthermore, when navigating back to `BusinessProfileHub.tsx`, the cached business profile is displayed without the pending status.
- **Remediation Plan:**
  In `submitVerification`, call `bustBusinessGetCache(id)` and `invalidateQueryCache('business:${id}', () => bustBusinessGetCache(id))`.

---

### 🔴 VER-2 (P0): Profile Hub Ignores "Under Review" Status

- **Location:** [`BusinessProfileHub.tsx:59, 93`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BusinessProfileHub.tsx#L59)
- **Root Cause:**
  ```typescript
  const verifyLabel = b?.isVerified ? "Verified ✓" : "Get verified";
  ```
  The logic treats every unverified business as "Get verified", completely ignoring `b?.verificationStatus`:
  - If `b?.verificationStatus === "UNDER_REVIEW"`, it should say `"Under review ⏳"`.
  - If `b?.verificationStatus === "REJECTED"`, it should say `"Action needed ⚠️"`.
  As a result, an owner who just submitted documents sees "Get verified" upon returning to the hub and assumes their submission was lost.
- **Remediation Plan:**
  Update `verifyLabel`:
  ```typescript
  const verifyLabel = b?.isVerified
    ? "Verified ✓"
    : b?.verificationStatus === "UNDER_REVIEW"
    ? "Under review ⏳"
    : b?.verificationStatus === "REJECTED"
    ? "Action needed ⚠️"
    : "Get verified";
  ```

---

### 🟠 VER-3 (P1): Unvalidated PDF File Size Triggers Storage Rejection

- **Location:** [`VerificationPanel.tsx:39-43`](file:///d:/zetax/name/STRYT/src/components/VerificationPanel.tsx#L39-L43), [`uploadService.ts:151-168`](file:///d:/zetax/name/STRYT/src/services/core/uploadService.ts#L151-L168)
- **Root Cause:**
  `addFiles` selects any PDF or image file up to 5 items. Images are compressed with `compressImage()`, but PDFs cannot be compressed client-side.
  If a merchant uploads a 10MB or 25MB scan of their registration document, `sb.storage.from(PRIVATE_BUCKET).upload()` fails with an entity size limit exception.
  The toast displays a vague failure without indicating that the file was too large.
- **Remediation Plan:**
  Add client-side size checking in `addFiles`:
  ```typescript
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
  const oversized = picked.find(f => f.size > MAX_FILE_SIZE);
  if (oversized) {
    showToast(`${oversized.name} is too large (max 5 MB)`);
    return;
  }
  ```

---

## 4. Verification & Testing Checklist

- [ ] Submitting verification documents immediately busts query cache and updates `BusinessProfileHub` label to "Under review ⏳".
- [ ] Attempting to upload a PDF larger than 5 MB shows a clear validation toast before attempting network upload.
- [ ] Rejected applications display the reviewer's note with high-contrast alert styling.
- [ ] Tapping "Submit for review" disables the button and displays a loading spinner during document upload.
- [ ] Run `npm run check-colors` and `npx tsc --noEmit` to verify type and design token compliance.
