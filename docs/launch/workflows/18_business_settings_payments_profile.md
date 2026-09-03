# 18 — Business: Settings, Payments, Profile, Verification

**Priority:** P0/P1.
**Screens:** `BusinessProfileHub`, `ProfileEditor`, `BroadcastRadius`,
`ReviewsManager`, `BusinessPayments`, `VerificationCenter`,
`BusinessSettings`. All **owner-only** (`RequireOwner`) — a scoped team
member must never reach any of these.

## Flow A — Profile & broadcast

| # | Step | Expected |
|---|------|----------|
| 1 | `ProfileEditor` | Name, cover, contact, location editable |
| 2 | `BroadcastRadius` | Sets how far the business's posts/alerts reach; persists |
| 3 | `BusinessProfileHub` | Central hub linking into the above |

## Flow B — Reviews

| # | Step | Expected |
|---|------|----------|
| 1 | `ReviewsManager` | All reviews listed |
| 2 | Reply to a review (if supported) | Visible publicly |
| 3 | Report an abusive review | Reaches admin |

## Flow C — Payments setup

| # | Step | Expected |
|---|------|----------|
| 1 | `BusinessPayments` — set UPI ID | Saved, used in every payment QR/deep-link across the app (appointments, queue, bulk-deal deposits) |
| 2 | Set a deposit percentage/policy for bookings | Reflected in the customer `AppointmentSheet` payment step |
| 3 | Payment timing settings | Respected |

## Flow D — Verification

| # | Step | Expected |
|---|------|----------|
| 1 | `VerificationCenter` | Upload/status — see workflow 13 Flow C for the full loop |

## Flow E — Settings

| # | Step | Expected |
|---|------|----------|
| 1 | `BusinessSettings` — booking capacity (`max_concurrent_bookings`) | Enforced across all services combined, not just per-item |
| 2 | Delivery toggle | Confirm current v1.0 state: `DELIVERY_AGENT_ENABLED` is `false` this release — toggling it should not expose anything reachable (see workflow 20) |
| 3 | Privacy toggles | Persist, respected on the public page |
| 4 | **Delete business** — full script (`MANUAL_TEST_PLAN.md` §1.6, P1) | With an upcoming ACCEPTED booking → refused, naming the count → cancel the booking → retry → confirm sheet requires typing DELETE exactly → deleted → gone from search/map/explore/switcher → team access revoked → **customer's past booking with that shop still visible** (history must survive) |
