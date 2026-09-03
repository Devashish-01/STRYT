# 13 — Business Onboarding & Verification

**Priority:** P0.
**Screens:** `BusinessOnboard`, `VerificationCenter`, plus the admin review
side (`AdminPanel`, workflow 21).

## Flow A — Onboarding

| # | Step | Expected |
|---|------|----------|
| 1 | `/onboard/business` | 4-step flow |
| 2 | Step: category/package selection | Determines which console features later appear (e.g. `showCartStepper` gates the Bulk deals tile — see workflow 16) |
| 3 | Step: profile basics (name, description, photos) | Required fields enforced |
| 4 | Step: Hours | **Same card + heading** as Settings → Hours (consistency check, was flagged in feedback) |
| 5 | Step: Opening date | **Native date picker** — no free-text typing allowed |
| 6 | Confirm there is **no** "Import from Google Maps" option anywhere in onboarding | Was explicitly removed |
| 7 | Location step | Pin placement, address resolution |
| 8 | Submit | Business created in a **pending/submitted** state, not live yet |

## Flow B — Review → live

| # | Step | Expected |
|---|------|----------|
| 1 | As A7 (admin), open the business approval queue | New submission appears |
| 2 | **Open the review screen and check it shows the actual submitted data** | This was Feedback item #9 — historically unreproducible (zero pending submissions existed at time of writing). This is the run that finally exercises it — if it shows blank/wrong fields, capture the submitted values and what the review screen shows, side by side |
| 3 | Approve | Business flips to live — findable in Search/Map/Explore |
| 4 | Reject with a reason | Business owner sees the rejection reason, can resubmit |
| 5 | As the owner, check the review screen from their side while pending | Shows submitted status clearly, not a dead end |

## Flow C — Post-launch verification (KYC-style docs)

| # | Step | Expected |
|---|------|----------|
| 1 | `VerificationCenter` → upload docs | Upload succeeds to Storage |
| 2 | Status while pending | Clear "under review" state |
| 3 | Admin approves/rejects (workflow 21) | Owner's status updates, notification sent |

## Flow D — Location-change request

| # | Step | Expected |
|---|------|----------|
| 1 | Owner requests a location change post-launch | Goes to admin for approval, doesn't move instantly |
| 2 | Admin approves | Business's map/search location updates |
