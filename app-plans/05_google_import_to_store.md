# Task 5 — Move Google Import from Verification → Store

## Goal
The "Import profile data from Google Maps" feature currently lives on the
Verification page (confusing — it implies importing = verifying). Move it to the
**Store** management hub where owners manage their storefront, so it's clearly a
data-import convenience, not a verification path.

## Current state (verified)
- `GoogleBusinessVerifyCard` is defined in `src/components/VerificationPanel.tsx`
  and only rendered there (VerificationCenter → VerificationPanel).
- Import calls `businessService.verifyAndSyncFromGoogle()` (already fixed to
  import data only, no self-verify).
- Store hub: `src/screens/business/manage/BusinessStoreHub.tsx` — a section list.

## Reconciliation with Task 7 (location freeze)
Imported `lat/lng` must NOT overwrite the live location (frozen). The import
must exclude coordinates, or route them through `requestLocationChange()` for
admin approval. Decision: **exclude lat/lng from the Store import** (owner uses
the map picker + admin flow to move location). Import name/address text/phone/
hours/photos only.

## Steps
- [ ] Extract `GoogleBusinessVerifyCard` into its own component
      `src/components/GoogleImportCard.tsx` (reusable, no verification framing).
- [ ] Remove it from `VerificationPanel` (verification page shows document upload
      + manual review only).
- [ ] Add it to `BusinessStoreHub` as a clear card ("Import details from Google
      Maps") near the top / under Business details.
- [ ] Ensure the import path used from Store excludes `lat/lng` (respect freeze).
- [ ] Copy: "Import" not "Verify". No verification side-effects.

## Risk
Low — component move + prop tweak. Build-verify.
