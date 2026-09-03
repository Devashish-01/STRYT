# 19 — Provider Onboarding & Console

**Priority:** P0/P1 — same shape as the business flows (workflows 13–18),
service-funnel specific rather than storefront-specific. Don't re-run every
business check in full; focus on what's actually different.

**Screens:** `ProviderOnboard`; console: `ProviderDashboard`,
`ProviderProfileHub`, `ProviderProfileEditor`, `ProviderAvailability`,
`ProviderCatalog`, `ProviderInventory`, `ProviderPortfolio`, `LeadsInbox`
(shared), `ProviderJobs`, `ProviderFindWork`, `ProviderMoney`,
`ProviderCommunity`, `ProviderVerification`, `ProviderSettings`.

## Flow A — Onboarding

| # | Step | Expected |
|---|------|----------|
| 1 | `/onboard/provider` | Category/service selection, profile basics, location |
| 2 | Submit | Pending, then admin review (workflow 21), then live |

## Flow B — Availability (the actual difference from business)

| # | Step | Expected |
|---|------|----------|
| 1 | `ProviderAvailability` — toggle **Available now** (presence) | Separate concept from bookable working hours — toggling this does not change the hours grid |
| 2 | Set an "available until" time | Presence auto-clears after |
| 3 | Set working hours / availability note | Used for `generateWorkingSlots` — bookable slots reflect this, independent of the presence toggle |
| 4 | "Accepting appointments" toggle | Confirm distinct effect from both of the above — should gate whether new bookings can come in at all |

## Flow C — Packages, portfolio, jobs

| # | Step | Expected |
|---|------|----------|
| 1 | `ProviderCatalog` — add/edit/delete a package | Same shape as business catalog, `packages`/`addPackage`/`deletePackage` |
| 2 | `ProviderPortfolio` | Add/reorder/delete portfolio items |
| 3 | `ProviderJobs` | Accepted bookings/jobs list — mirrors `BusinessAppointments` (workflow 15) |
| 4 | `ProviderFindWork` | Browse open requests, submit a proposal (workflow 04) |

## Flow D — Money & community

| # | Step | Expected |
|---|------|----------|
| 1 | `ProviderMoney` | Payment setup/history — mirrors `BusinessPayments` (workflow 18) |
| 2 | `ProviderCommunity` | Provider's own posts view, "post to community" tile scopes the composer to the provider identity |

## Flow E — Verification & settings

| # | Step | Expected |
|---|------|----------|
| 1 | `ProviderVerification` | Same upload/review loop as business (workflow 13 Flow C) |
| 2 | `ProviderSettings` | Persist correctly |
