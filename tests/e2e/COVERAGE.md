# E2E coverage — 52 tracked flows

Source of flows: `docs/gaps/MASTER_FLOW_AUDIT_TRACKER.md`. All specs run on **staging** as the synthetic personas.

**Levels**
- **Journey** — the flow's main action is performed through the UI, checked from every affected persona's side, and
  persisted (reload / other persona / database).
- **Screen** — `flows/screens.spec.ts` only: the screen opens for the right persona (or is correctly blocked), loads,
  and raises no page error, failing API call or error toast. The main action is **not** exercised yet.
- **Deferred / decision** — intentionally not tested (see note).

`knownBug(...)` marks are listed per flow; none are open at the time of writing (all found bugs were fixed and their
tests turned green, except where noted).

| Flow | Name | Spec(s) | Persona(s) | Level | Notes |
|---|---|---|---|---|---|
| 0.1 | Customer onboarding | `critical/customer-onboarding` | newcomer | Journey | OTP → terms → street → interests → home |
| 0.2 | Business onboarding | `critical/business-onboarding` | customer2, admin, customer1 | Journey | submit → admin approve → catalog item → found in search |
| 0.3 | Provider registration | `flows/screens` | customer1 | Screen | action spec TODO |
| 0.4 | Guest browsing & wall | `critical/guest-wall`, `flows/first-visit`, `flows/screens` | guest | Journey | E2E-003, E2E-008 |
| 1.1 | Home feed | `flows/screens`, `critical/customer-onboarding` | guest, customer1 | Screen+ | nearby places asserted after onboarding |
| 1.2 | Search | `critical/guest-wall`, `critical/business-onboarding`, `flows/screens` | guest, customer1 | Journey | find by name |
| 1.3 | Map | `flows/screens` | guest, customer1 | Screen | action spec TODO |
| 1.4 | Categories | `flows/screens` | guest, customer1 | Screen | action spec TODO |
| 1.5 | User-submitted places | `flows/screens` | customer1 | Screen | action spec TODO |
| 2.1 | Booking sheet | `critical/booking-accept`, `booking-decline-reason`, `booking-reschedule-paid`, `booking-daily-limit` | customer1, customer2, owner1 | Journey | E2E-009 |
| 2.2 | My appointments | same as 2.1 | customer1 | Journey | |
| 2.3 | Business appointments console | `critical/booking-*`, `critical/team-access` | owner1, staff | Journey | E2E-007, E2E-010 |
| 2.4 | Provider jobs | `flows/screens` | provider1 | Screen | action spec TODO |
| 2.5 | Slot blocking & holidays | `flows/screens` | owner1 | Screen | action spec TODO |
| 3.1 | Customer live queue | `critical/queue` | customer1, customer2, guest | Journey | E2E-011 |
| 3.2 | Merchant queue console | `critical/queue`, `critical/team-access` | owner1, staff_queue | Journey | |
| 4.1 | Ask / request creation | `critical/request-proposal-agreement`, `critical/admin-moderation` | customer1 | Journey | E2E-019 |
| 4.2 | Proposals & quotes | `critical/request-proposal-agreement` | provider1, customer1 | Journey | E2E-020, 022, 023, 035 |
| 4.3 | Agreements | `critical/request-proposal-agreement` | customer1, provider1 | Journey | E2E-025, 026 |
| 5.1 | Merchant delivery dispatch | `flows/screens` | owner1, staff | Deferred | D2: delivery deferred to v1.1 — test asserts the routes stay hidden |
| 5.2 | Rider console | `flows/screens` | customer1 | Deferred | D2 — route hidden |
| 5.3 | Live delivery tracking | — | — | Deferred | D2 |
| 6.1 | Chat | `critical/chat` | customer2, owner1 | Journey | E2E-013, 014, 015 |
| 7.1 | Team & delegated access | `critical/team-access`, `flows/screens` | owner1, customer2, staff | Journey | E2E-012 |
| 7.2 | Catalog management | `critical/business-onboarding` (add item), `flows/screens` | customer2, owner1 | Journey | edit/delete TODO |
| 7.3 | Store hours | `flows/screens` | owner1 | Screen | action spec TODO |
| 7.4 | Bulk deals | `critical/bulk-deal` | owner1, customer1, customer2 | Journey | E2E-005, E2E-038 |
| 7.5 | Storefront profile | `flows/screens` | owner1 | Screen | action spec TODO |
| 7.6 | Portfolio | `flows/screens` | owner1 | Screen | action spec TODO (needs upload, E2E-015 fixed) |
| 7.7 | Q&A management | `flows/screens` | owner1 | Screen | action spec TODO |
| 7.8 | Inventory alerts | `flows/screens` | owner1 | Screen | action spec TODO |
| 7.9 | Broadcast radius | `flows/screens` | owner1 | Screen | action spec TODO |
| 7.10 | Business verification | `flows/screens` | owner1 | Screen | action spec TODO |
| 8.1 | Provider packages | `flows/screens` | provider1 | Screen | action spec TODO |
| 8.2 | Provider availability | `flows/screens` | provider1 | Screen | action spec TODO |
| 8.3 | Provider portfolio | `flows/screens` | provider1 | Screen | action spec TODO |
| 8.4 | Leads inbox | `flows/screens` | provider1 | Screen | action spec TODO |
| 8.5 | Provider money | `flows/screens` | provider1 | Screen | E2E-006 fixed; action spec TODO |
| 8.6 | Provider verification | `flows/screens` | provider1 | Screen | action spec TODO |
| 9.1 | Community feed & posts | `flows/screens` | guest, customer1 | Screen | E2E-017/018 verified at DB level; action spec TODO |
| 9.2 | Review & rating (jobs) | `critical/request-proposal-agreement` | customer1, provider1 | Journey | E2E-027 |
| 9.3 | Owner review replies | `critical/ratings-reviews` | customer1, owner1 | Journey | E2E-016 |
| 9.4 | Vouches & trust | — | — | Missing | action spec TODO |
| 9.5 | Bookmarks & lists | `flows/screens` | customer1 | Screen | action spec TODO |
| 10.1 | Emergency contacts | `flows/screens` | customer1 | Screen | action spec TODO |
| 10.2 | Live location sharing | `flows/screens` | customer1 | Screen | live share start verified at DB level (E2E-014); action spec TODO |
| 11.1 | Role & hat switching | `critical/team-access`, `critical/request-proposal-agreement` | owner1, provider1 | Journey | E2E-022 |
| 11.2 | Profile & privacy | `flows/screens` | customer1 | Screen | E2E-004 fixed; action spec TODO |
| 11.3 | Notifications | used by most journeys | all | Journey | |
| 11.4 | Entity passwords & security | `flows/screens` | customer1 | Screen | action spec TODO |
| 11.5 | Account deletion | `critical/account-deletion` | owner1, guest | Journey | E2E-029 |
| 11.6 | Admin moderation | `critical/admin-moderation`, `critical/business-onboarding` | admin1, customers | Journey | E2E-030, 031, 036, 037 (decision) |

**Not written, by decision:** `critical/me-too-group-buy` — customer group-buy creation was retired (2da328a) and the
"Me too" button has had no entry point since bb5c22e (E2E-028, owner decision).

**Totals:** Journey 27 · Screen 21 · Deferred 3 · Missing 1 (of 52). Action specs for the 21 screen-only flows and 9.4 are
the remaining P07 work.
