# STRYT — Flow 8.6: Provider Identity & Badges Verification Gap Log

**Audit Date:** September 9, 2026  
**Flow Identifier:** Flow 8.6 — Domain 8 (Provider / Freelancer Console Operations)  
**Primary Components:** [`ProviderVerification.tsx`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderVerification.tsx), [`VerificationPanel.tsx`](file:///d:/zetax/name/STRYT/src/components/VerificationPanel.tsx), [`ProviderProfileHub.tsx`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderProfileHub.tsx), [`ProviderDashboard.tsx`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderDashboard.tsx)  
**Backend Services & Tables:** `providerService.ts`, `uploadService.ts`, `public.providers`, Supabase Private Storage (`verification-docs` bucket), DB trigger (`trg_enforce_verification_provider`)  
**Launch Readiness Status:** 🟡 **Audited & Blocked by P0 Cache Desynchronization & P0 Console Bottom Nav Stripping**

---

## 1. Executive Summary

Flow 8.6 governs trust credentialing, identity verification, and badge issuance for solo service providers (`/provider/:id/manage/verify`). Through `ProviderVerification.tsx` and the shared `VerificationPanel.tsx`, independent service professionals (technicians, electricians, beauticians, wellness coaches, photographers) upload identity proofs and vocational credentials to earn the "STRYT Verified" trust badge. A PostgreSQL trigger (`trg_enforce_verification_provider`) enforces zero-trust security: only the manual review process running with `service_role` permissions can approve or reject submissions or toggle `is_verified = true`.

While the zero-trust database trigger and private storage architecture (`uploadPrivate`) are robust, several key operational and UI flaws undermine the verification experience:
1. **Cache Desynchronization Post-Submission (P0):** When documents are submitted, `providerService.submitVerification()` transitions the provider's status to `UNDER_REVIEW`. However, it fails to invoke `bustProviderGetCache(id)` or `invalidateQueryCache('provider:${id}')`. When returning to `ProviderProfileHub.tsx`, the cached provider record still shows "Get the ✓ badge" rather than "Under review", misleading the provider into believing the upload failed.
2. **Console Bottom Navigation Stripped (P0):** `ProviderVerification.tsx` wraps its content in a bare `<div className="screen">` and omits `<ProviderManageNav pid={id} />`. Navigating to the verification screen strips the bottom navigation bar and traps the user.
3. **Provider Dashboard Blindness to Pending Review (P1):** On the main provider dashboard (`ProviderDashboard.tsx`), the Grow tile checks only `!p?.isVerified`. When a provider's documents are currently in `UNDER_REVIEW`, the tile continues urging them to "Get verified" rather than reflecting "Verification in review ⏳".
4. **Unchecked PDF File Sizes Cause Silent Upload Failures (P1):** Document picking accepts raw `application/pdf` files without client-side size validation. Uncompressed multi-megabyte document scans exceed storage limits and fail with cryptic errors.
5. **No Submission Withdrawal or Document Visibility (P1):** When in `UNDER_REVIEW`, the screen renders a static clock banner. The provider cannot see which files were uploaded or withdraw an accidental submission.
6. **Commercial Copy Clashes with Freelancer Needs (P2):** The upload prompt suggests "(ID, GST, license…)", which is shop-centric. Solo providers need identity proofs, trade certifications, or police verification documents.

---

## 2. Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **PVER-1** | Missing Cache Invalidation Leaves Profile Hub & Dashboard Stale Post-Submission | 🔴 P0 (Stale UI & Resubmission Confusion) | `submitVerification()` does not bust coalesced in-flight promises or invalidate `queryCache('provider:${id}')`. Returning to Profile Hub or Dashboard displays "Get the ✓ badge", prompting unnecessary duplicate submissions. |
| **PVER-2** | Console Bottom Navigation Bar Stripped on Verification Screen | 🔴 P0 (Navigation Trap) | `ProviderVerification.tsx` omits `<ProviderManageNav pid={id} />` and uses bare `<div className="screen">`, stripping the console navigation bar and trapping the provider. |
| **PVER-3** | Provider Dashboard Grow Tile Blind to Pending Review State | 🟠 P1 (Contradictory Dashboard Guidance) | `ProviderDashboard.tsx:625-627` checks only `!p?.isVerified`. When verification is `UNDER_REVIEW`, it still renders "Get verified", giving false feedback that documents were never received. |
| **PVER-4** | Unchecked PDF File Sizes Trigger Storage Rejections | 🟠 P1 (Silent / Cryptic Upload Failure) | Scanned PDF trade licenses bypass client-side compression. Uploading files > 5MB triggers unhandled storage errors with vague error toasts. |
| **PVER-5** | Inability to View Submitted Documents or Withdraw Review | 🟠 P1 (Workflow Blindspot) | Once submitted, the screen displays a static clock icon. Providers cannot see file names or cancel an accidental submission before review. |
| **PVER-6** | Merchant-Centric Document Prompt Clashes with Solo Provider Reality | 🟡 P2 (Copy Disconnect) | Placeholder copy prompts for "GST, license…", which solo technicians and freelancers do not possess. Should prompt for ID, trade certificate, or skill diploma. |
| **PVER-7** | Dark Mode Theme Inconsistencies on Status Banners | 🟢 P3 (Visual Polish) | Status cards use hardcoded light backgrounds (`var(--green-100)`, `var(--red-50)`, `var(--brand-50)`) that cause contrast issues in dark theme mode. |

---

## 3. Detailed Findings & Root Cause Analysis

---

### 🔴 PVER-1 (P0): Missing Cache Invalidation Leaves Profile Hub & Dashboard Stale Post-Submission

- **Location:** [`providerService.ts:199-214`](file:///d:/zetax/name/STRYT/src/services/marketplace/providerService.ts#L199-L214), [`VerificationPanel.tsx:56-60`](file:///d:/zetax/name/STRYT/src/components/VerificationPanel.tsx#L56-L60)
- **Root Cause:**
  1. In `providerService.ts`:
     ```typescript
     async submitVerification(id: string, files: File[]) {
       ...
       const { error } = await sb.from("providers").update({
         verification_status: "UNDER_REVIEW",
         verification_documents: paths,
         verification_document_url: paths[0],
         verification_reason: null,
       }).eq("id", id);
       throwIfError(error);
       return { ok: true };
     }
     ```
  2. `bustProviderGetCache(id)` is never invoked.
  3. `invalidateQueryCache('provider:${id}')` is never invoked.
  4. In `VerificationPanel.tsx:59`, `await load()` calls `providerService.get(entityId)`. If an in-flight promise was present, it returns the pre-update provider record.
  5. Returning to `ProviderProfileHub.tsx` displays the stale cached record where `verificationStatus` is still `"NONE"`. The hint displays `"Get the ✓ badge"`.
  6. The provider assumes their document upload was lost and submits again.
- **Remediation Plan:**
  Call `bustProviderGetCache(id)` inside `submitVerification()`, and trigger `invalidateQueryCache('provider:${id}', () => bustProviderGetCache(id))` upon successful submission.

---

### 🔴 PVER-2 (P0): Console Bottom Navigation Bar Stripped on Verification Screen

- **Location:** [`ProviderVerification.tsx:16-22`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderVerification.tsx#L16-L22)
- **Root Cause:**
  ```tsx
  return (
    <div className="screen">
      <AppBar title="Verification" />
      <VerificationPanel entityType="PROVIDER" entityId={id} />
    </div>
  );
  ```
  The screen renders in `<div className="screen">` rather than `<div className="screen with-nav">` and completely omits `<ProviderManageNav pid={id} />`.
  Unlike `ProviderProfileHub`, `ProviderMoney`, `ProviderJobs`, and `ProviderDashboard`, entering verification removes the bottom navigation bar. Providers cannot switch to Today, Jobs, or Money without tapping the top AppBar back button.
- **Remediation Plan:**
  Wrap in `<div className="screen with-nav">` and append `<ProviderManageNav pid={id} />`.

---

### 🟠 PVER-3 (P1): Provider Dashboard Grow Tile Blind to Pending Review State

- **Location:** [`ProviderDashboard.tsx:625-627`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderDashboard.tsx#L625-L627)
- **Root Cause:**
  ```tsx
  {!p?.isVerified
    ? <GrowTile icon={BadgeCheck} color="var(--green-600)" label="Get verified" onClick={() => nav(`${base}/verify`)} />
    : <GrowTile icon={FileText} color="var(--brand-600)" label="Edit profile" onClick={() => nav(`${base}/edit-profile`)} />}
  ```
  The logic treats all unverified providers identically. If a provider's application is currently `UNDER_REVIEW`, the dashboard still renders an eager green "Get verified" tile, prompting them to apply again.
- **Remediation Plan:**
  Update the GrowTile label and state:
  ```tsx
  p?.verificationStatus === "UNDER_REVIEW"
    ? <GrowTile icon={Clock} color="var(--brand-600)" label="Verification in review ⏳" onClick={() => nav(`${base}/verify`)} />
    : p?.verificationStatus === "REJECTED"
    ? <GrowTile icon={AlertTriangle} color="var(--red-600)" label="Resubmit verification" onClick={() => nav(`${base}/verify`)} />
    : !p?.isVerified
    ? <GrowTile icon={BadgeCheck} color="var(--green-600)" label="Get verified" onClick={() => nav(`${base}/verify`)} />
    : <GrowTile icon={FileText} color="var(--brand-600)" label="Edit profile" onClick={() => nav(`${base}/edit-profile`)} />
  ```

---

### 🟠 PVER-4 (P1): Unchecked PDF File Sizes Trigger Storage Rejections

- **Location:** [`VerificationPanel.tsx:39-43`](file:///d:/zetax/name/STRYT/src/components/VerificationPanel.tsx#L39-L43), [`uploadService.ts:151-168`](file:///d:/zetax/name/STRYT/src/services/core/uploadService.ts#L151-L168)
- **Root Cause:**
  `addFiles` selects up to 5 files with no file size checks. Image files are compressed with `compressImage()`, but PDF files cannot be compressed in-browser and are uploaded raw. High-resolution document scans (> 5MB) trigger storage rejections or network timeouts, surfacing a generic "Couldn't submit documents" error without informing the user that the file is too large.
- **Remediation Plan:**
  Add a client-side 5MB size limit check in `addFiles()` with immediate user feedback.

---

### 🟠 PVER-5 (P1): Inability to View Submitted Documents or Withdraw Review

- **Location:** [`VerificationPanel.tsx:76-116`](file:///d:/zetax/name/STRYT/src/components/VerificationPanel.tsx#L76-L116)
- **Root Cause:**
  When `status === "PENDING"`, the UI renders only a static clock icon. The provider cannot see the filenames of their submitted documents, review when they were uploaded, or withdraw an erroneous submission before review begins.
- **Remediation Plan:**
  Render a list of submitted document paths or count with upload date, and provide a "Withdraw submission" action.

---

### 🟡 PVER-6 (P2): Merchant-Centric Document Prompt Clashes with Solo Provider Reality

- **Location:** [`VerificationPanel.tsx:150`](file:///d:/zetax/name/STRYT/src/components/VerificationPanel.tsx#L150)
- **Root Cause:**
  The upload prompt reads `"Add a document (ID, GST, license…)"`. Solo service professionals (hair stylists, electricians, fitness trainers) do not have GST registrations.
- **Remediation Plan:**
  Conditionally tailor the prompt:
  ```tsx
  {entityType === "PROVIDER" ? "Add a document (ID, certificate, license…)" : "Add a document (ID, GST, license…)"}
  ```

---

### 🟢 PVER-7 (P3): Dark Mode Theme Inconsistencies on Status Banners

- **Location:** [`VerificationPanel.tsx:93, 119`](file:///d:/zetax/name/STRYT/src/components/VerificationPanel.tsx#L93)
- **Root Cause:**
  Status cards use hardcoded light backgrounds (`var(--green-100)`, `var(--red-50)`, `var(--brand-50)`), causing high-contrast glare in dark mode.
- **Remediation Plan:**
  Replace with semantic theme-aware token classes.

---

## 4. Verification & Testing Checklist

- [ ] Navigating to `/provider/:id/manage/verify` displays the bottom navigation bar (`ProviderManageNav`).
- [ ] Submitting verification documents immediately busts the query cache and updates `ProviderProfileHub` hint to "Under review".
- [ ] `ProviderDashboard.tsx` displays "Verification in review ⏳" when status is `UNDER_REVIEW`.
- [ ] Attempting to upload a PDF larger than 5MB shows a clear validation toast before attempting network upload.
- [ ] Document upload prompt displays provider-appropriate terminology ("ID, certificate, license…").
- [ ] Rejected applications display the reviewer's note with actionable resubmission instructions.
- [ ] Run `npm run check-colors` and `npx tsc --noEmit` to verify type and design token compliance.
