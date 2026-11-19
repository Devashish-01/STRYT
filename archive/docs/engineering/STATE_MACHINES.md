# STRYT — Implicit State Machines

> Updated 2026-11-19. 35 state machines found across DB, services, and client store.

---

## Contents

1. [Formally Modelled](#1-formally-modelled)
2. [DB-Enforced](#2-db-enforced)
3. [Client-Side Only](#3-client-side-only)
4. [Derived / Computed](#4-derived--computed)
5. [Key Observations](#5-key-observations)
6. [Summary Table](#6-summary-table)

---

## 1. Formally Modelled

Located in `src/lib/machines/`. These explicitly declare terminal states, guard functions, and document the server as the authority.

### 1.1 AccountGate
**File:** `src/lib/machines/accountGate.ts`, `src/lib/machines/accountGate.test.ts`  
**States:** `DELETION_PENDING` | `TERMS` | `ONBOARD` | `READY`  
**Transitions (computed from user fields, evaluated in order):**
- `deletionScheduledAt` set → `DELETION_PENDING`
- `termsAcceptedVersion !== LEGAL_VERSION` → `TERMS`
- `onboardingCompletedAt === null` → `ONBOARD`
- Otherwise → `READY`  
*Taxonomy Note:* Structured as a deterministic priority decision waterfall / gate evaluated from snapshot user fields, rather than a stateful FSM with discrete event-driven transitions.

### 1.2 Appointment
**Files:** `src/types/console.ts`, `src/lib/machines/appointment.ts`, `src/lib/machines/appointmentMachine.test.ts`, `src/lib/statusBadges.ts`  
**DB:** `appointments` table · migrations `20260703_appointment_console.sql`, `20261005_delivery_order_lifecycle.sql`, `20261015_visit_outcome.sql`  
**States:** `PENDING` | `ACCEPTED` | `REJECTED` | `COMPLETED` | `CANCELLED` | `NO_SHOW`  
**Transitions:**
- Customer: `PENDING/ACCEPTED` → `CANCELLED` (blocked if delivery in progress)
- Manager/owner: `PENDING` → `ACCEPTED` | `REJECTED`; `ACCEPTED` → `CANCELLED`
- Shop (visit outcome): `ACCEPTED` → `COMPLETED` (from 60 min before slot), `ACCEPTED` → `NO_SHOW` (after slot start), `COMPLETED` → `NO_SHOW` (correction)
- Cron/auto sweep (`sweep_my_appointments` / `sweep_stale_appointments`): `PENDING` → `CANCELLED` (`cancelled_by = 'SYSTEM'` when slot time elapses and not ASAP); `ACCEPTED` → `COMPLETED` (6 h after slot start, fallback)
- Initial: starts as `PENDING` only (enforced by trigger `guard_appointment_state_columns`)
*Delivery Decoupling Note:* For home deliveries (`fulfillmentType === 'DELIVERY'`), `appointments.status` remains `ACCEPTED`; order delivery completion is tracked solely via `appointment_deliveries.status = 'DELIVERED'` (§2.7).

### 1.3 Agreement
**Files:** `src/types/requests.ts`, `src/lib/machines/agreement.ts`, `src/lib/machines/agreementMachine.test.ts`, `src/lib/statusBadges.ts`  
**DB:** `agreements` table · migrations `20260707_agreement_payment_confirmation.sql`, `20260824_booking_and_rpc_security.sql`  
**States:** `PENDING` | `ACTIVE` | `DEPOSIT_PAID` | `IN_PROGRESS` | `REVIEW` | `COMPLETED` | `CANCELLED` | `DISPUTED`  
**Transitions:**
- All transitions via SECURITY DEFINER RPCs only (`agreement_active`, `agreement_cancel`, `agreement_complete`, `agreement_dispute`, `admin_resolve_agreement_dispute`, `cancel_expired_agreements`)
- Happy path: `PENDING → ACTIVE → DEPOSIT_PAID → IN_PROGRESS → REVIEW → COMPLETED`
- `CANCELLED` and `DISPUTED` reachable from multiple live states
- `COMPLETED` / `CANCELLED` / `DISPUTED` are terminal ("closed" for parties)
- Automated build-time drift tests assert agreement closed states against SQL invariants in `agreementMachine.test.ts`

---

## 2. DB-Enforced

Transitions enforced via Postgres triggers, CHECK constraints, and SECURITY DEFINER RPCs.

### 2.1 Request Status
**Files:** `src/types/requests.ts`, `src/lib/statusBadges.ts`  
**DB:** `requests` table · `request_status` Postgres enum · migration `20261014_request_proposal_status_guard.sql`  
**States:** `OPEN` | `IN_PROGRESS` | `AGREED` | `COMPLETED` | `CANCELLED` | `EXPIRED`  
**Transitions:**
- Clients: insert only as `OPEN`; status never changes via direct UPDATE (enforced by `guard_deal_status` trigger)
- Via RPCs: `OPEN → IN_PROGRESS` (proposal accepted), `→ AGREED`, `→ COMPLETED`; `→ CANCELLED` / `→ EXPIRED` from open/active states
- Admins bypass the guard

### 2.2 Proposal Status
**Files:** `src/types/requests.ts`, `src/lib/statusBadges.ts`  
**DB:** `proposals` table · migration `20261014_request_proposal_status_guard.sql`  
**States:** `SUBMITTED` | `ACCEPTED` | `REJECTED` | `WITHDRAWN`  
**Transitions:**
- Clients: insert only as `SUBMITTED`; `request_id` and `responder` columns are immutable
- Via RPCs: `SUBMITTED → ACCEPTED` (requester accepts) | `REJECTED` | `WITHDRAWN` (responder withdraws)

### 2.3 Entity Status
**Files:** `src/types/marketplace.ts`  
**DB:** `entity_status` Postgres enum shared across `businesses`, `providers`, `places`, `bulk_deals`, `categories` · migrations `20260877_delete_business.sql` (adds `DELETED`), `20261011_listing_status_guard.sql`  
**States:** `DRAFT` | `PENDING` | `ACTIVE` | `REJECTED` | `SUSPENDED` | `DELETED`  
**Transitions:**
- Businesses: start `PENDING` or `DRAFT`; admin approves → `ACTIVE`; rejects → `REJECTED`; suspends → `SUSPENDED`; owner resubmits → `PENDING`; deleted → `DELETED`
- Providers: created directly as `ACTIVE`, `PENDING`, or `DRAFT`; can transition `DRAFT → PENDING | ACTIVE`
- Categories: created as `PENDING`; admin approves → `ACTIVE`
- Enforced by `guard_listing_status()` trigger on client writes across `businesses`, `providers`, and `categories`

### 2.4 Verification Status
**Files:** `src/types/marketplace.ts`  
**DB:** `businesses.verification_status`, `providers.verification_status` · migration `20260815_manual_verification.sql`  
**States:** `NONE` | `UNDER_REVIEW` | `APPROVED` | `REJECTED`  
**Transitions:**
- `NONE → UNDER_REVIEW` (owner submits documents)
- `UNDER_REVIEW → APPROVED` | `REJECTED` (admin only via `verification-review` Edge Function; DB trigger blocks direct writes to `APPROVED`/`REJECTED`)

### 2.5 Queue Token Status
**Files:** `src/types/marketplace.ts`  
**DB:** `queue_tokens` · migrations `20260706_queues_and_notifications.sql`, `20260803_queue_auto_close_and_cancel.sql`, `20261013_queue_token_transitions.sql`  
**States:** `WAITING` | `CALLED` | `SERVED` | `LEFT` | `EXPIRED`  
**Transitions:**
- Staff: `WAITING → CALLED | SERVED | LEFT`; `CALLED → SERVED | LEFT`
- Customer: `WAITING | CALLED → LEFT`
- Cron (`close_stale_queue_tokens`): → `EXPIRED`
- `SERVED`, `LEFT`, `EXPIRED` are terminal for clients

### 2.6 Payment / Deposit Status
**Files:** `src/types/console.ts` (`PaymentStatus`), `src/types/bulk.ts` (`DepositStatus` aliased to `PaymentStatus`)  
**DB:** `appointments`, `queue_tokens`, `agreements`, `custom_payments`, `bulk_deal_pledges`  
**States:** `UNPAID` | `PENDING_CONFIRM` | `PAID` | `REJECTED`  
**Transitions:**
- Anyone: `UNPAID/REJECTED → PENDING_CONFIRM` (make a payment claim); `PENDING_CONFIRM → UNPAID` (undo unconfirmed claim)
- Staff/owner: `PENDING_CONFIRM → PAID | REJECTED`; `UNPAID/REJECTED → PAID` (direct cash settlement)
- `PAID` is terminal for clients
- Note: `CustomPayment` starts at `PENDING_CONFIRM` (not `UNPAID`) per its DB CHECK

### 2.7 Delivery Lifecycle Status
**Files:** `src/services/engagement/deliveryService.ts`, `src/lib/deliveryStatus.ts`  
**DB:** `appointment_deliveries` · migration `20260845_delivery_agent_phase1_groundwork.sql`  
**States:** `ASSIGNED` | `EN_ROUTE` | `ARRIVED` | `DELIVERED` | `CANCELLED`  
**Transitions:**
- Rider pushes `live_status` → trigger maps to lifecycle (`LEAVING/ON_THE_WAY → EN_ROUTE`, `ARRIVED → ARRIVED`, `DONE → DELIVERED`)
- `CANCELLED` from any active state

### 2.8 Delivery Live Status
**Files:** `src/services/engagement/deliveryService.ts`  
**DB:** `appointment_deliveries.live_status`  
**States:** `LEAVING` | `ON_THE_WAY` | `ARRIVED` | `DONE`  
**Transitions:**
- Pushed by rider via `appointment_update_delivery_status` RPC
- Drives `DeliveryStatus` lifecycle transitions (see §2.7)

### 2.9 Delivery Batch Status
**Files:** `src/services/engagement/deliveryService.ts`  
**DB:** `delivery_batches` · migration `20260848_delivery_batches_phase4.sql`  
**States:** `PENDING_ACCEPTANCE` | `ACCEPTED` | `DECLINED` | `IN_PROGRESS` | `COMPLETED` | `CANCELLED`  
**Transitions:**
- `PENDING_ACCEPTANCE → ACCEPTED | DECLINED` (all-or-nothing)
- `ACCEPTED → IN_PROGRESS` (rider starts the run)
- `IN_PROGRESS → COMPLETED | CANCELLED`

### 2.10 Job Live Status
**Files:** `src/types/requests.ts`  
**DB:** `agreements.live_status` · RPC `agreement_update_live_status`  
**States:** `CONFIRMED` | `LEAVING` | `ON_THE_WAY` | `ARRIVED` | `WORKING` | `DONE`  
**Transitions:**
- Provider pushes via `agreement_update_live_status` RPC
- Initial default on agreements: `CONFIRMED`

### 2.11 Business Access Session Status
**Files:** `src/services/marketplace/businessAccessService.ts`  
**DB:** `business_access_sessions` · migration `20260809_business_delegated_login.sql`  
**States:** `PENDING` | `ACTIVE` | `EXPIRED` | `REVOKED` | `DENIED`  
**Transitions:**
- Created as `PENDING` (approval required) or directly `ACTIVE` (no approval needed)
- Owner: `PENDING → ACTIVE | DENIED`; `ACTIVE → REVOKED`
- System: `ACTIVE → EXPIRED`

### 2.12 Account Appeal Status
**Files:** `src/services/core/appealService.ts`  
**DB:** `account_appeals` · migration `20260726_account_appeals.sql`  
**States:** `PENDING` | `APPROVED` | `REJECTED`  
**Transitions:**
- Created as `PENDING`; admin resolves → `APPROVED` (entity re-activated to `ACTIVE`) | `REJECTED`

### 2.13 Provider Verification Check Status
**DB:** `provider_verifications` · migration `20240901_trust_layer.sql`  
**States:** `PENDING` | `VERIFIED` | `REJECTED`  
**Transitions:**
- Document submitted → `PENDING`; reviewer decision → `VERIFIED` | `REJECTED`

### 2.14 Report Status
**Files:** `src/services/core/adminService.ts`  
**DB:** `reports`  
**States:** `OPEN` | `REVIEWING` | `ACTION_TAKEN` | `DISMISSED`  
**Transitions:**
- Created as `OPEN`; admin moderates → `REVIEWING → ACTION_TAKEN | DISMISSED`

### 2.15 Bug Report Status
**Files:** `src/services/core/adminService.ts`  
**DB:** `bug_reports` (DEFAULT `'OPEN'`, no CHECK constraint)  
**States:** `OPEN` | `REVIEWING` | `RESOLVED` | `DISMISSED`  
**Transitions:**
- Created as `OPEN`; admin resolves → `REVIEWING → RESOLVED | DISMISSED`

### 2.16 Live Location Share Status
**Files:** `src/services/engagement/emergencyService.ts`  
**DB:** `live_shares` · migration `20261016_expiry_sweeps.sql`  
**States:** `ACTIVE` | `ENDED`  
**Transitions:**
- Created as `ACTIVE`; user ends it → `ENDED`; cron sweep when `expires_at` passes → `ENDED`

### 2.17 Location Share Grant Status
**Files:** `src/services/engagement/locationService.ts`  
**DB:** `location_share_grants` · migrations `20260719_location_share_grants.sql`, `20261016_expiry_sweeps.sql`  
**States:** `PENDING` | `APPROVED` | `DENIED` | `REVOKED` | `EXPIRED`  
**Transitions:**
- Requester asks → `PENDING`
- Owner: `PENDING → APPROVED | DENIED`; `APPROVED → REVOKED`
- Cron sweep: `APPROVED` past `expires_at` → `EXPIRED`
- `myStatusToward()` treats `EXPIRED` as `NONE` (virtual reset state for requester UI)

### 2.18 Group Buy Token Status
**Files:** `src/types/bulk.ts`  
**DB:** `bulk_deal_tokens` · migrations `20260826_bulk_buying.sql`, `20260900_bulk_deal_campaigns.sql`  
**States:** `ISSUED` | `REDEEMED` | `EXPIRED`  
**Transitions:**
- Minted as `ISSUED`; business scans → `REDEEMED`; validity expires → `EXPIRED`

### 2.19 Business Location Review Status
**DB:** `businesses.location_review_status` · migration `20260833_business_location_review.sql`  
**States:** `NONE` | `PENDING`  
**Transitions:**
- Default `NONE`; owner submits pending location change → `PENDING`; admin approves/rejects → `NONE` (staging columns cleared)

### 2.20 Support Ticket Status
**Files:** `src/types/database.types.ts`, `src/services/core/adminService.ts`  
**DB:** `support_tickets.status` · migrations `20260707_bug_report_roles.sql`, `20261020_retention.sql`  
**States:** `OPEN` | `REVIEWING` | `RESOLVED` | `DISMISSED`  
**Transitions:**
- User submits support request → `OPEN`
- Support agent / admin updates → `REVIEWING → RESOLVED | DISMISSED`

### 2.21 Subscription Status
**Files:** `src/types/database.types.ts`  
**DB:** `subscriptions.status`, `subscription_logs.status`  
**States:** `ACTIVE` | `PAUSED` | `CANCELLED`  
**Transitions:**
- Initiated as `ACTIVE`
- Parties pause service → `PAUSED`
- Termination → `CANCELLED`

### 2.22 Gate Pass Status
**Files:** `src/types/database.types.ts`  
**DB:** `gate_passes.status`  
**States:** `PENDING` | `APPROVED` | `REJECTED` | `EXPIRED`  
**Transitions:**
- Provider/resident requests entry → `PENDING`
- Resident or society security → `APPROVED | REJECTED`
- Time validity elapses (`valid_until < now()`) → `EXPIRED`

### 2.23 Profile Deletion Request Status
**Files:** `src/types/database.types.ts`  
**DB:** `profile_deletion_requests.status` · migrations `20260880_perf_indexes_and_rls.sql`, `20260981_deletion_request_prev_visibility.sql`  
**States:** `PENDING` | `APPROVED` | `REJECTED` | `COMPLETED`  
**Transitions:**
- Account owner submits deletion request → `PENDING`
- Verification / clearance → `APPROVED` | `REJECTED`
- Data purging engine finishes purge → `COMPLETED`

### 2.24 Emergency Alert Resolution
**Files:** `src/types/database.types.ts`, `src/services/engagement/emergencyService.ts`  
**DB:** `sos_alerts.resolved` (binary flag acting as lifecycle state) · migration `20240901_trust_layer.sql`  
**States:** `OPEN (resolved=false)` | `RESOLVED (resolved=true)`  
**Transitions:**
- Emergency trigger creates active alert with `resolved = false`
- Admin or emergency contact confirms safety → `resolved = true`

---

## 3. Client-Side Only

No DB column. Lives in React state or a Zustand/custom store.

### 3.1 Delivery Tracking Status (GPS runner)
**File:** `src/features/delivery-tracking/trackingStore.ts`  
**States:** `idle` | `starting` | `on` | `declined` | `lost` | `offline`  
**Transitions:**
- `idle → starting` (delivery needs tracking)
- `starting → on` (GPS fix received and sent) | `declined` (permission denied)
- `on → lost` (no fix) | `offline` (server unreachable) | `idle` (no active delivery)
- `lost / offline → on` (fix resumes) | `idle`

### 3.2 Guest Location Status
**File:** `src/store/useGuestLocation.ts`  
**States:** `idle` | `asking` | `granted` | `denied`  
**Transitions:**
- `idle → asking` (auto-request on first guest-mode activation)
- `asking → granted` (GPS fix) | `denied` (permission refused)
- `setManual()` → `granted` (from any state)

### 3.3 Business Access Guard (UI)
**File:** `src/components/BusinessAccessGuard.tsx`  
**States:** `checking` | `allowed` | `denied` | `retry`  
**Transitions:**
- Owners start `allowed`; others start `checking`
- `checkAccess()` result → `allowed` | `denied` | `retry` (on network error)

---

## 4. Derived / Computed

No stored state — computed on the fly from other machine values.

### 4.1 Order Stage
**File:** `src/lib/deliveryStage.ts`  
**States:** `placed` | `accepted` | `packed` | `assigned` | `picked_up` | `on_the_way` | `delivered`  
**Derived from:** `AppointmentRecord.status` + `DeliveryStatus` + `readyAt` timestamp

### 4.2 Customer Milestone
**File:** `src/lib/orderJourney.ts`  
**States:** `placed` | `packing` | `rider` | `on_the_way` | `delivered`  
**Derived from:** OrderStage (see §4.1)

### 4.3 Rider Mission Step
**File:** `src/lib/riderMission.ts`  
**States:** `pickup` | `on_way` | `arrive` | `handover` (+ implicit done when `step >= MISSION_STEPS.length`)  
**Derived from:** `DeliveryStatus`, `pickedUpAt`, `handoffVerified`, `amountDue`, `cashCollectedAt`, `orderReadyAt`

### 4.4 Day Appointment Status (calendar dot)
**File:** `src/components/appointments/DateStrip.tsx`  
**States:** `none` | `confirmed` | `pending` | `blocked`  
**Derived from:** Appointments and blocked slots for that date

### 4.5 Feature Status (business console)
**File:** `src/lib/businessFeatures.ts`  
**States:** `on` | `off` | `todo` | `tool`  
**Derived from:** `FeatureContext` (business settings snapshot)

---

## 5. Key Observations

### FSM vs Decision Waterfall vs Derived Pipeline Taxonomy
State management across STRYT divides into three distinct categories:
1. **True State Machines:** Stateful entities governed by transition tables and authority guards (`Appointment`, `Agreement`, `QueueToken`, `DeliveryLifecycle`).
2. **Deterministic Decision Waterfalls:** Evaluation cascades deriving a gate status from snapshot attributes (`AccountGate`, `BusinessAccessGuard`).
3. **Derived Pipelines:** Pure linear projections summarizing complex multi-table states into customer/rider progress steps (`OrderStage`, `CustomerMilestone`, `RiderMission`).

### Delivery Lifecycle Decoupling
On `appointment_deliveries`, `DeliveryStatus` (lifecycle §2.7) and `DeliveryLiveStatus` (real-time §2.8) run simultaneously on the same row. Crucially, when an appointment has `fulfillmentType === 'DELIVERY'`, the `appointments.status` remains `ACCEPTED`, while completion is exclusively tracked via `appointment_deliveries.status = 'DELIVERED'`.

### Shared PaymentStatus Vocabulary Across 5 Tables
`UNPAID → PENDING_CONFIRM → PAID / REJECTED` is reused on `appointments`, `queue_tokens`, `agreements`, `custom_payments`, and `bulk_deal_pledges`. In TypeScript, `DepositStatus` in `src/types/bulk.ts` is unified as a direct alias of `PaymentStatus` from `src/types/console.ts` to avoid type divergence.

### Shared EntityStatus Enum Across 5 Tables
`entity_status` enum is shared across `businesses`, `providers`, `places`, `bulk_deals`, and `categories`. The trigger `guard_listing_status()` polices initial state rules at the database boundary:
- Businesses → start `PENDING` or `DRAFT`
- Providers → start `ACTIVE`, `PENDING`, or `DRAFT`
- Categories → start `PENDING`
- Bulk deals → start `DRAFT`
`DELETED` is supported in both the database enum and the TypeScript `EntityStatus` definition.

### Drift-Prevention Machine Tests
To prevent frontend code from drifting away from database security rules, both `appointmentMachine.test.ts` and `agreementMachine.test.ts` execute build-time assertions directly against PostgreSQL migration files.

### Cron-Driven Terminal Transitions
Several machines have system-driven expiry transitions not visible in the UI client code:
- `queue_tokens`: `WAITING/CALLED → EXPIRED`
- `live_shares`: `ACTIVE → ENDED`
- `location_share_grants`: `APPROVED → EXPIRED`
- `agreements`: `ACTIVE → CANCELLED` (expired agreements)
- `appointments`: `PENDING → CANCELLED` (unanswered slot time elapses) & `ACCEPTED → COMPLETED` (6 h fallback sweep)

---

## 6. Summary Table

| # | Name | TS file | DB table | States |
|---|------|---------|----------|--------|
| 1 | AccountGate | `src/lib/machines/accountGate.ts` | — | DELETION_PENDING, TERMS, ONBOARD, READY |
| 2 | Appointment | `src/types/console.ts` | `appointments` | PENDING, ACCEPTED, REJECTED, COMPLETED, CANCELLED, NO_SHOW |
| 3 | Agreement | `src/types/requests.ts` | `agreements` | PENDING, ACTIVE, DEPOSIT_PAID, IN_PROGRESS, REVIEW, COMPLETED, CANCELLED, DISPUTED |
| 4 | Request | `src/types/requests.ts` | `requests` | OPEN, IN_PROGRESS, AGREED, COMPLETED, CANCELLED, EXPIRED |
| 5 | Proposal | `src/types/requests.ts` | `proposals` | SUBMITTED, ACCEPTED, REJECTED, WITHDRAWN |
| 6 | Entity Status | `src/types/marketplace.ts` | `businesses` / `providers` / `places` / `bulk_deals` / `categories` | DRAFT, PENDING, ACTIVE, REJECTED, SUSPENDED, DELETED |
| 7 | Verification | `src/types/marketplace.ts` | `businesses.verification_status` | NONE, UNDER_REVIEW, APPROVED, REJECTED |
| 8 | Queue Token | `src/types/marketplace.ts` | `queue_tokens` | WAITING, CALLED, SERVED, LEFT, EXPIRED |
| 9 | Payment / Deposit | `src/types/console.ts` / `bulk.ts` | 5 tables | UNPAID, PENDING_CONFIRM, PAID, REJECTED |
| 10 | Delivery Lifecycle | `deliveryService.ts` | `appointment_deliveries` | ASSIGNED, EN_ROUTE, ARRIVED, DELIVERED, CANCELLED |
| 11 | Delivery Live | `deliveryService.ts` | `appointment_deliveries.live_status` | LEAVING, ON_THE_WAY, ARRIVED, DONE |
| 12 | Delivery Batch | `deliveryService.ts` | `delivery_batches` | PENDING_ACCEPTANCE, ACCEPTED, DECLINED, IN_PROGRESS, COMPLETED, CANCELLED |
| 13 | Job Live Status | `src/types/requests.ts` | `agreements.live_status` | CONFIRMED, LEAVING, ON_THE_WAY, ARRIVED, WORKING, DONE |
| 14 | Business Access Session | `businessAccessService.ts` | `business_access_sessions` | PENDING, ACTIVE, EXPIRED, REVOKED, DENIED |
| 15 | Account Appeal | `appealService.ts` | `account_appeals` | PENDING, APPROVED, REJECTED |
| 16 | Provider Verification | — | `provider_verifications` | PENDING, VERIFIED, REJECTED |
| 17 | Report | `adminService.ts` | `reports` | OPEN, REVIEWING, ACTION_TAKEN, DISMISSED |
| 18 | Bug Report | `adminService.ts` | `bug_reports` | OPEN, REVIEWING, RESOLVED, DISMISSED |
| 19 | Live Share | `emergencyService.ts` | `live_shares` | ACTIVE, ENDED |
| 20 | Location Grant | `locationService.ts` | `location_share_grants` | PENDING, APPROVED, DENIED, REVOKED, EXPIRED |
| 21 | Group Buy Token | `src/types/bulk.ts` | `bulk_deal_tokens` | ISSUED, REDEEMED, EXPIRED |
| 22 | Location Review | — | `businesses.location_review_status` | NONE, PENDING |
| 23 | Support Ticket | `adminService.ts` | `support_tickets` | OPEN, REVIEWING, RESOLVED, DISMISSED |
| 24 | Subscription | `database.types.ts` | `subscriptions` / `subscription_logs` | ACTIVE, PAUSED, CANCELLED |
| 25 | Gate Pass | `database.types.ts` | `gate_passes` | PENDING, APPROVED, REJECTED, EXPIRED |
| 26 | Profile Deletion | `database.types.ts` | `profile_deletion_requests` | PENDING, APPROVED, REJECTED, COMPLETED |
| 27 | Emergency SOS Alert | `emergencyService.ts` | `sos_alerts` (resolved flag) | OPEN, RESOLVED |
| 28 | Delivery Tracking (GPS) | `trackingStore.ts` | — (client store) | idle, starting, on, declined, lost, offline |
| 29 | Guest Location | `useGuestLocation.ts` | — (useState) | idle, asking, granted, denied |
| 30 | Business Access Guard | `BusinessAccessGuard.tsx` | — (useState) | checking, allowed, denied, retry |
| 31 | Order Stage | `deliveryStage.ts` | — (derived) | placed, accepted, packed, assigned, picked_up, on_the_way, delivered |
| 32 | Customer Milestone | `orderJourney.ts` | — (derived) | placed, packing, rider, on_the_way, delivered |
| 33 | Rider Mission Step | `riderMission.ts` | — (derived) | pickup, on_way, arrive, handover |
| 34 | Day Status | `DateStrip.tsx` | — (derived) | none, confirmed, pending, blocked |
| 35 | Feature Status | `businessFeatures.ts` | — (derived) | on, off, todo, tool |
