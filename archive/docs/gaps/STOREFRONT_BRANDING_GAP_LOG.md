# STRYT — Flow 7.5: Storefront Branding & Profile Hub Gap Log

**Audit Date:** September 9, 2026  
**Flow Identifier:** Flow 7.5 — Domain 7 (Storefront Console & Merchant Operations)  
**Primary Components:** [`BusinessProfileHub.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BusinessProfileHub.tsx), [`ProfileEditor.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/manage/ProfileEditor.tsx), [`BroadcastRadius.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BroadcastRadius.tsx)  
**Backend Services & Tables:** `businessService.ts`, `uploadService.ts`, `businesses`, Supabase Storage (`business-photo`)  
**Launch Readiness Status:** 🟡 **Audited & Blocked by P0 Cache Invalidation & P1 Storage Fallback Gaps**

---

## 1. Executive Summary

Flow 7.5 provides local merchants with their central profile hub and storefront branding editor. Through this surface, owners manage their public business page, store name, description, cover photo, contact details (phone, WhatsApp), service radius, and admin-reviewed map pin location.

While the location review flow with `MiniMap` staging and the instant cover upload feature are good architectural foundations, critical data integrity and caching gaps remain:
1. Saving profile updates or service radius changes fails to invalidate the `business:${id}` query cache or in-flight service cache, serving stale information across the hub, public storefront, and editor sessions.
2. The image upload service silently falls back to encoding full-resolution images as raw Base64 data URLs on network or storage errors, writing megabyte-sized strings directly into database rows and severely degrading discovery query performance.
3. The Profile Hub route is locked behind `<RequireOwner />`, preventing team members from viewing the business identity hub or using the integrated Hat Switcher, despite component-level guards specifically designed for staff.
4. Phone, WhatsApp, and pincode inputs have zero validation or sanitization, permitting corrupted contact information to be published.

---

## 2. Detailed Findings & Gap Analysis

### 🔴 PRF-1 (P0): Stale Query Cache Serves Un-Updated Profile Data Across App

- **Location:** [`ProfileEditor.tsx:109-132`](file:///d:/zetax/name/STRYT/src/screens/business/manage/ProfileEditor.tsx#L109-L132), [`BroadcastRadius.tsx:25-35`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BroadcastRadius.tsx#L25-L35), [`businessService.ts:635-651`](file:///d:/zetax/name/STRYT/src/services/marketplace/businessService.ts#L635-L651)
- **Problem:**
  When an owner updates their business profile (name, category, description, address, city) in [`ProfileEditor.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/manage/ProfileEditor.tsx):
  ```typescript
  await businessService.update(id, {
    name, description: desc, addressLine1: address, city, pincode, phone, whatsapp, broadcastRadius,
    categoryId: cat ?? undefined,
    categoryName: newCat?.name ?? b?.categoryName,
  });
  showToast("Profile saved");
  ```
  Neither `bustBusinessGetCache(id)` nor `invalidateQueryCache('business:${id}')` is invoked. `businessService.update` also does not clear the cached entry.
  When the merchant navigates back to [`BusinessProfileHub.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BusinessProfileHub.tsx) or views their public storefront, `useQuery` immediately serves the stale cached `business:${id}` record.
  If the merchant re-opens `ProfileEditor.tsx` during the same session, `useQuery` re-seeds the form with the old cached values, causing subsequent edits to overwrite previous changes.
- **Impact:** Merchants see their changes vanish immediately after saving, leading to user frustration, duplicate submissions, and data clobbering.
- **Remediation:** In `businessService.update()`, `ProfileEditor.save()`, and `BroadcastRadius.save()`, call `invalidateQueryCache('business:${id}', () => bustBusinessGetCache(id))` and trigger `refetch()`.

---

### 🟠 PRF-2 (P1): Unchecked Upload Fallback Injects Multi-Megabyte Base64 Data into DB

- **Location:** [`uploadService.ts:106-110`](file:///d:/zetax/name/STRYT/src/services/core/uploadService.ts#L106-L110), [`ProfileEditor.tsx:43-47`](file:///d:/zetax/name/STRYT/src/screens/business/manage/ProfileEditor.tsx#L43-L47)
- **Problem:**
  In [`uploadService.ts`](file:///d:/zetax/name/STRYT/src/services/core/uploadService.ts):
  ```typescript
  try {
    const { error } = await sb.storage.from(BUCKET).upload(path, f, { contentType, upsert: true });
    if (!error) {
      const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
      if (data?.publicUrl) return data.publicUrl;
    }
    console.warn("Storage upload error, falling back to data URL:", error?.message);
  } catch (err) {
    console.warn("Storage upload failed, falling back to data URL:", err);
  }
  return await fileToDataUrl(f); // <-- Dangerous fallback
  ```
  If Supabase Storage upload encounters a network drop, timeout, or RLS policy rejection, it catches the error and converts the full compressed image file into a Base64 data URL string (`data:image/jpeg;base64,...`).
  In [`ProfileEditor.tsx:46-47`](file:///d:/zetax/name/STRYT/src/screens/business/manage/ProfileEditor.tsx#L46-L47), this Base64 string is written directly into `businesses.cover_image` and `businesses.gallery`.
- **Impact:** A single store cover photo can inject a 500 KB to 2 MB raw string into the `businesses` table. Every query fetching nearby businesses (`businesses_nearby`, search, home feed) loads these gigantic strings over the wire, causing app lag, excessive mobile bandwidth usage, and Supabase egress cost spikes.
- **Remediation:** Remove the `fileToDataUrl` fallback for persistent entity records. Throw an explicit error asking the merchant to retry if storage upload fails.

---

### 🟠 PRF-3 (P1): Route Guard Locks Out Delegated Staff from Profile Hub

- **Location:** [`App.tsx:699-700`](file:///d:/zetax/name/STRYT/src/App.tsx#L699-L700), [`BusinessProfileHub.tsx:89-103`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BusinessProfileHub.tsx#L89-L103)
- **Problem:**
  In [`App.tsx`](file:///d:/zetax/name/STRYT/src/App.tsx):
  ```tsx
  <Route element={<RequireOwner />}>
    <Route path="/business/:id/manage/profile" element={<BusinessProfileHub />} />
    <Route path="/business/:id/manage/edit-profile" element={<ProfileEditor />} />
  ```
  Both routes are wrapped in `<RequireOwner />`.
  However, [`BusinessProfileHub.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BusinessProfileHub.tsx) is explicitly structured to support non-owner staff:
  - It wraps owner-only settings in `{isOwner && ...}` conditionals.
  - It renders `<HatSwitcherCard />` so staff members can switch roles between their personal account and delegated business roles.
  Because `<RequireOwner />` guards the route at the router level, any staff member who taps on the Profile tab in the merchant console navigation (`ManageNav.tsx`) is immediately redirected to `/business/:id/manage` with an unauthorized toast.
- **Impact:** Delegated staff members cannot access their profile hub, view business info, or access the hat switcher from the merchant console.
- **Remediation:** Move `/business/:id/manage/profile` outside `<RequireOwner />` to `<BusinessAccessGuard />`. Keep `/business/:id/manage/edit-profile` under `<RequireOwner />`.

---

### 🟡 PRF-4 (P2): Irreversible Location Change Lockout & Missing Rejection Reason

- **Location:** [`ProfileEditor.tsx:58-88, 227-240`](file:///d:/zetax/name/STRYT/src/screens/business/manage/ProfileEditor.tsx#L58-L88)
- **Problem:**
  When an owner submits a location change request via `LocationPicker`, `pending_lat`, `pending_lng`, and `location_review_status = 'PENDING'` are set on the `businesses` table.
  1. **No cancellation affordance:** Once submitted, the UI shows only a static banner: "Location change pending admin review". The owner cannot cancel, withdraw, or correct a misplaced pin while review is pending.
  2. **Silent rejection:** If an admin rejects the move (`locationReviewStatus === 'REJECTED'`), the condition `locationPending` evaluates to `false`. The UI simply renders the "Request location change" button again with zero notification, banner, or explanation of why the move was declined.
- **Impact:** Merchants are locked into accidental submissions, and receive no feedback on rejected relocation requests.
- **Remediation:** Add a "Cancel request" action that resets pending coordinates, and display an alert banner with `location_rejection_reason` when status is `REJECTED`.

---

### 🟡 PRF-5 (P2): Flattened Category Selector Discards Subcategories

- **Location:** [`ProfileEditor.tsx:118-123, 204-211`](file:///d:/zetax/name/STRYT/src/screens/business/manage/ProfileEditor.tsx#L118-L123)
- **Problem:**
  [`ProfileEditor.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/manage/ProfileEditor.tsx) renders categories as a flat row of chips iterating only top-level categories:
  ```tsx
  {cats.map((c) => (
    <button key={c.id} className={`chip ${cat === c.id ? "active" : ""}`} onClick={() => setCat(c.id)}>
      {c.icon} {c.name}
    </button>
  ))}
  ```
  1. If a business was registered under a specific subcategory (e.g. `salon_nails` under `Salons`), `cat` will not match any parent category ID, so no chip is rendered as active.
  2. Selecting any category chip overwrites the business's specific subcategory with a generic top-level category.
  3. `subCategory` is not managed in form state, causing specialized search and package suggestions to degrade.
- **Impact:** Businesses lose specific category precision upon saving their profile.
- **Remediation:** Implement a two-level category/subcategory picker or hierarchical modal matching the onboarding flow.

---

### 🟡 PRF-6 (P2): Missing Contact & Pincode Validation

- **Location:** [`ProfileEditor.tsx:107, 215, 242-243`](file:///d:/zetax/name/STRYT/src/screens/business/manage/ProfileEditor.tsx#L107)
- **Problem:**
  The form validation logic only requires:
  ```typescript
  const valid = name.trim().length > 1 && city.trim().length > 0;
  ```
  - `phone` and `whatsapp` inputs have no numeric regex stripping or 10-digit length validation. Any text or malformed sequence can be saved.
  - `pincode` strips non-digits on input, but has no 6-digit length requirement, allowing 1-digit or 12-digit pincodes.
- **Impact:** Corrupted contact numbers break public phone dialers, WhatsApp click-to-chat links, and pincode location filters.
- **Remediation:** Add regex validation `^\d{10}$` for Indian mobile numbers and `^\d{6}$` for Indian pincodes with inline validation hints.

---

### 🟢 PRF-7 (P3): Hardcoded `#fff` Tokens in Sticky Footers & Sheets

- **Location:** [`ProfileEditor.tsx:255, 264`](file:///d:/zetax/name/STRYT/src/screens/business/manage/ProfileEditor.tsx#L255)
- **Problem:**
  Lines 255 (sticky save bar) and 264 (location picker modal sheet) specify:
  ```tsx
  background: "#fff"
  ```
  In dark mode, this causes blinding bright white containers against dark app themes.
- **Impact:** Visual polish and theme consistency bug.
- **Remediation:** Replace `#fff` with `var(--surface)`.

---

## 3. Maturation Roadmap & Action Plan

| Gap ID | Priority | Description | Action Item |
| :--- | :---: | :--- | :--- |
| **PRF-1** | 🔴 P0 | Stale query cache serves outdated profile across app | Invalidate `business:${id}` query cache and bust service cache on save. |
| **PRF-2** | 🟠 P1 | Upload failure saves massive Base64 images to DB | Remove `fileToDataUrl` fallback; fail gracefully with retry prompt. |
| **PRF-3** | 🟠 P1 | Staff locked out of Profile Hub by `<RequireOwner />` | Move `/profile` route to `<BusinessAccessGuard />` so team members can access hub. |
| **PRF-4** | 🟡 P2 | No cancel action or rejection reason for location move | Add withdraw button for pending location and display rejection banner. |
| **PRF-5** | 🟡 P2 | Flattened category chips discard subcategories | Support hierarchical category & subcategory selection in profile editor. |
| **PRF-6** | 🟡 P2 | Missing phone, WhatsApp, and pincode validation | Enforce 10-digit phone and 6-digit pincode validation before save. |
| **PRF-7** | 🟢 P3 | Hardcoded `#fff` in sticky footer and location modal | Replace `#fff` with `var(--surface)`. |
