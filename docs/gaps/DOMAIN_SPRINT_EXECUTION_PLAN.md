# STRYT — High-Accuracy Vertical Domain Sprint Execution Plan

**Author:** Antigravity AI Engine & Engineering Team  
**Date:** September 10, 2026  
**Target:** Production Hardening & Android Google Play Store Deployment  
**Master Trackers:** [`MASTER_FLOW_AUDIT_TRACKER.md`](./MASTER_FLOW_AUDIT_TRACKER.md) | [`GAPS_LOG.md`](./GAPS_LOG.md) | [`EXECUTION_PHASE_PLAN.md`](./EXECUTION_PHASE_PLAN.md)

---

## 🎯 1. Architectural Philosophy: Why Vertical Domain Sprints?

### The Context Dispersion Risk
Prior plans grouped tasks horizontally (e.g., fixing 21 swallowed `.catch()` blocks across 21 different screens in 12 different domains in one pass). For an agentic coding AI, jumping between dozens of unrelated files causes **context dispersion**, increasing the probability of:
1. Missing localized component state dependencies.
2. Introducing subtle prop or navigation regressions.
3. Writing inconsistent domain fixes without verifying the complete end-to-end data lifecycle.

### The Vertical Domain Solution
To guarantee **maximum accuracy, 100% test pass rates, and zero regressions**, this plan organizes the ~360 findings across 44 open flows into **6 Bounded Vertical Sprints**:
* Each sprint focuses strictly on **one bounded domain at a time**.
* The agent loads the **entire vertical slice** (UI screen, state hooks, service layer, and Supabase RLS/schema) into active context.
* All bugs in that domain—security, state desync, swallowed errors, missing cache invalidation, and UI bounds—are fixed, verified, and locked down simultaneously.
* Once a sprint passes its quality gate, that domain is **production-ready** and never needs to be re-opened.

---

## 🚦 2. Non-Negotiable Quality Gates (Every Sprint)

Before any sprint is marked complete or committed to git, it must pass all 4 gates:

```
[ 1. Live Verification ] ──▶ [ 2. Zero TSC Errors ] ──▶ [ 3. Zero Color Leaks ] ──▶ [ 4. Green Vitest Suite ]
```

1. **Live Code/DB Verification:** Every gap log finding must be verified against current code and Postgres tables before writing fixes (treating gap logs as claims, not unquestioned facts).
2. **TypeScript Compilation:** `npx tsc --noEmit` must exit with code `0`.
3. **Design System Integrity:** `npm run check-colors` must exit with code `0` (zero unmapped brand colors; `#fff` remains whitelisted for SVG/overlays).
4. **Automated Test Suite:** `npx vitest run` must pass with zero failing tests.
5. **No Blind Commits:** Migrations and git commits are performed only with explicit developer sign-off.

---

## 📅 3. Sprint Execution Roadmap

---

### 🛡️ Sprint 1: Security, Sessions & Account Deletion (The Core Shield)
*Priority: P0 Blockers — Establishes zero-trust session boundaries and Google Play compliance.*

| Flow / Item | Gap ID | Description & Location | Verification Target |
| :--- | :--- | :--- | :--- |
| **Business/Provider PIN Gate** | `SEC-1` / `ROLE-2` | `verify_business_password` returns bare boolean; direct URL nav to `/business/:id/manage/*` bypasses PIN. | Issue server-validated, time-bounded session token. |
| **Account Deletion Storefront Lock** | `DEL-1` | Initiating account deletion leaves owned stores/providers public for 30 days. | Auto-disable discoverability on active stores during grace period. |
| **Purge Worker FK Cascade** | `DEL-2` | Edge Function `purgeCustomerAccount` crashes on `bulk_deal_campaigns` FK constraint. | Add cascading cleanup handling in purge worker / migration. |
| **Phone Edit OTP Enforcement** | `PROF-1` | Editing phone in profile bypasses Supabase Auth OTP, causing auth desync. | Enforce OTP verification before updating phone in `auth.users`. |
| **Public Profile Privacy** | `PROF-2` | `get_public_profile` omits `alias`, leaking real user names to neighborhood search. | Always return alias; guard real name exposure behind user consent. |
| **Slot Blocking Server Gate** | `SLOT_BLOCKING: S1` | Client blocks slots, but DB trigger/RPC never rejects overlapping appointments. | Add server-side slot collision validation to booking RPC. |

**Exit Gate Sprint 1:** `npx tsc --noEmit` + `npm run check-colors` + DB transaction rollback test.

---

### 📅 Sprint 2: Core Appointments & Scheduling (Domain 2)
*Priority: P0/P1 — Completes the customer transactional booking and merchant calendar loop.*

| Flow / Item | Gap ID | Description & Location | Verification Target |
| :--- | :--- | :--- | :--- |
| **Customer Bookings Hub** | `MY_APPOINTMENTS` | Missing error toasts (`A7`), cancellation race conditions, and unhandled status tabs. | Standardize `showToast`, add optimistic cancel with rollback. |
| **Business Appointment Console** | `BUSINESS_APPOINTMENTS` | Walk-in cash payments cannot be marked received (`B2`), plain-text phone numbers (`B3`). | Add `appointment_record_walk_in_payment` RPC caller & `tel:` links. |
| **Time-Slot Parsing Fragility** | `B4` / `P4` | Ad-hoc regex parsing slot time labels breaks on edge-case locales. | Standardize slot parser helper across merchant & provider consoles. |
| **Provider Jobs Console** | `PROVIDER_JOBS` | Status synchronization lag, missing chat shortcut from job cards (`P7`). | Add direct chat launcher card action & query invalidation. |
| **Party Size Constraints** | `A4` / `A9` | Party size accepts unbounded or zero values. | Clamp party size inputs with strict min/max validation. |

**Exit Gate Sprint 2:** `npx tsc --noEmit` + `npm run check-colors` + `npx vitest run src/utils/availability.test.ts`.

---

### 🏪 Sprint 3: Walk-In Queue, Hours & Storefront Presence (Domains 3 & 7)
*Priority: P1/P2 — Hardens walk-in foot traffic, split-shift operating hours, and catalog state.*

| Flow / Item | Gap ID | Description & Location | Verification Target |
| :--- | :--- | :--- | :--- |
| **Store Hours & Open Status** | Flow 7.3 (`STORE_HOURS`) | Split-shift time calculation errors, midnight rollover bugs, and "Open Now" discovery badging. | Rewrite timetable validator in `availability.ts` to support split shifts cleanly. |
| **Customer Live Queue Token** | Flow 3.1 (`CUSTOMER_QUEUE`) | Unfiltered realtime subscription (`Q2`), missing confirm on leave queue (`Q7`), unbounded party size (`Q5`). | Add row filter to `useQueryWithRealtime`, add confirm sheet, bound party input. |
| **Merchant Queue Console** | Flow 3.2 (`MERCHANT_QUEUE`) | Call next token race condition (`M2`), missing counter advance shortcut, ignores `queue_settings` (`M5`). | Lock token status transitions on server; listen to queue settings changes. |
| **Catalog & Inventory Alerts** | Flows 7.2 & 7.8 | Missing cache invalidation on item mutations (`PCAT-1`), low stock push notification fails silently. | Attach `invalidateQueryCache()` on save; surface inventory alert toasts. |

**Exit Gate Sprint 3:** `npx tsc --noEmit` + `npm run check-colors` + Queue token state transition tests.

---

### 🚚 Sprint 4: Realtime Engine — Local Delivery & 1:1 Chat (Domains 5 & 6)
*Priority: P1 — Standardizes WebSocket streaming, live GPS tracking, and instant messaging.*

| Flow / Item | Gap ID | Description & Location | Verification Target |
| :--- | :--- | :--- | :--- |
| **Customer Live Delivery Map** | Flow 5.3 (`T1`) | One-time fetch only; customer screen has no realtime subscription to rider coordinates. | Implement live `appointment_deliveries` coordinate channel subscription. |
| **Merchant Delivery Dispatch** | Flow 5.1 (`D3`) | Screen listens to `appointment_deliveries` but batch runs dispatch to `delivery_batches`. | Align subscription to `delivery_batches` channel; add dispatch confirmation. |
| **Rider Console & Run Batches** | Flow 5.2 | Battery-drain GPS loop, missing offline queue for completed drop-offs. | Debounce location updates to 5s interval; cache pending status offline. |
| **1:1 Direct Chat & Attachments** | Flow 6.1 | Image upload error swallowed silently, missing message delivery status receipts. | Add upload error toast, optimistic pending-sent-delivered ticks. |

**Exit Gate Sprint 4:** `npx tsc --noEmit` + `npm run check-colors` + WebSocket channel leak smoke test.

---

### 🤝 Sprint 5: Custom Requests, Bids & Group Deals (Domains 4 & 7)
*Priority: P1/P2 — Secures bespoke negotiation contracts and group-buy campaign economics.*

| Flow / Item | Gap ID | Description & Location | Verification Target |
| :--- | :--- | :--- | :--- |
| **Customer Ask Request Creation** | Flow 4.1 | Silent image upload failure (`R3`), unconstrained radius picker. | Add upload progress & error alert; enforce boundary clamp on broadcast radius. |
| **Seller Proposals & Quotes** | Flow 4.2 | Proposal submission race condition, duplicate proposal submission on double-tap. | Add button debounce and server-side unique constraint guard. |
| **Agreement Negotiation** | Flow 4.3 (`A1`) | Team-negotiated proposals lack clear owner attribution in `agreements` table. | Resolve attribution via proposal author join; handle contract sign callbacks. |
| **Bulk Deals & Group Buys** | Flow 7.4 (`BLK-1/2`) | No-deposit deals fail to mint claim passes; deleting campaign wipes redeemed passes. | Ensure claim passes persist post-campaign; decouple pass ledger from campaign deletion. |

**Exit Gate Sprint 5:** `npx tsc --noEmit` + `npm run check-colors` + Bulk deal pledge calculation tests.

---

### 🌟 Sprint 6: Trust, Safety & Google Play Store Hardening (Domains 8, 9, 10, 11)
*Priority: P1/P2 + Android Compliance — Prepares the app bundle for store submission.*

| Flow / Item | Gap ID | Description & Location | Verification Target |
| :--- | :--- | :--- | :--- |
| **Provider Console** | Domain 8 (Flows 8.1–8.6) | Service tiers cache bust, portfolio delete confirm (`PPORT-2`), cash received recording (`MONEY-3`). | Mirror Domain 7 console patterns; add portfolio confirm modal. |
| **Ratings, Reviews & Vouches** | Domain 9 (Flows 9.2–9.5) | Owner review response missing toast, vouch count optimistic desync. | Add instant response feedback; refresh vouch cache on tap. |
| **Emergency Contacts & Safety** | Domain 10 (Flows 10.1–10.2) | Auto-expiring location grants fail to trigger expiration webhook (`LOC-7`). | Add client-side grant expiration guard; sanitize emergency contact phone inputs. |
| **In-App Notification Center** | Flow 11.3 | Missing deep-link routes for 7 new notification types (bulk deals, claim passes). | Map all union types to their destination route with proper badge decrements. |
| **Google Play Compliance Audit** | Android Native | Verify in-app Account Deletion link, prominent location disclosures, target SDK 34+. | Audit Android Manifest, permissions dialogs, and generate release `.aab`. |

**Exit Gate Sprint 6:** Full clean build (`npm run build`), zero linter warnings, clean Vitest run, Android bundle verification.

---

## 📋 4. Live Sprint Progress Tracker

- [x] **Sprint 1: Security, Sessions & Account Deletion** *(Completed)*
  - [x] 1.1 Business/Provider PIN Gate Session Token (`SEC-1` / `ROLE-2`)
  - [x] 1.2 Account Deletion Storefront Lock (`DEL-1`)
  - [x] 1.3 Purge Worker FK Cascade Fix (`DEL-2`)
  - [x] 1.4 Phone OTP Verification on Edit (`PROF-1`)
  - [x] 1.5 Public Profile Privacy & Alias Guard (`PROF-2`)
  - [x] 1.6 Server Slot Blocking Gate (`SLOT_BLOCKING: S1`)
- [ ] **Sprint 2: Core Appointments & Scheduling (Domain 2)** *(Next)*
- [ ] **Sprint 3: Walk-In Queue, Hours & Storefront Presence (Domains 3 & 7)**
- [ ] **Sprint 4: Realtime Engine — Local Delivery & 1:1 Chat (Domains 5 & 6)**
- [ ] **Sprint 5: Custom Requests, Bids & Group Deals (Domains 4 & 7)**
- [ ] **Sprint 6: Trust, Safety & Google Play Store Hardening (Domains 8–11)**
