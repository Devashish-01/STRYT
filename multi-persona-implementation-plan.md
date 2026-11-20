# Multi-Persona Architecture & Dynamic Storefront Implementation Plan

## Goal
Implement the 10-round specification from `brainstorm.md`: eliminate appointment friction on retail/kirana stores, deploy the dynamic storefront action engine, segregate customer orders vs appointments, enforce zero-leak staff terminals, provide pre-send chat attribution, and verify full reversibility.

---

## Tasks

- [ ] **Task 1: Additive Database Migration & TypeScript Types**
  - Create `supabase/migrations/20261022_multi_persona_storefront.sql` and rollback `20261022_multi_persona_storefront_down.sql`.
  - Add `operating_model` enum & column, `fulfillment_capabilities` JSONB to `businesses`.
  - Add attribution columns (`sender_role`, `entity_id`, `entity_name`, `entity_avatar`, `staff_alias`) to `messages`.
  - Add `team_entity_id`, `last_replier_id`, `last_replied_at` to `conversations`.
  - Create `customer_unified_activity` view.
  - Update TypeScript types in `src/types/database.ts` or relevant interface models.
  - *Verify:* `npm run lint:migrations` passes with 0 errors.

- [ ] **Task 2: Dynamic Storefront Action Engine**
  - Create `src/lib/storefrontActions.ts` resolver based on Round 2 matrix (`operating_model` & `fulfillment_capabilities`).
  - Update `src/screens/business/BusinessDetail.tsx` to dynamically resolve primary & secondary CTAs.
  - Eliminate hardcoded "Book Appointment" / "Not accepting appointments" for retail, grocery, supermarket, pharmacy, and food shops.
  - Render "Order Delivery (30-45m)", "In-Store Pickup", or "Add to Cart" for retail; keep "Book Appointment" / "Join Queue" exclusively for service providers, salons, clinics, and consultants.
  - *Verify:* Viewing a retail/grocery business displays cart & delivery actions with 0 appointment text.

- [ ] **Task 3: Customer Activity Hub (/orders Swimlane)**
  - Upgrade `src/screens/customer/MyAppointments.tsx` with a dual swimlane tab bar: **Orders & Deliveries** (commerce fulfillment) vs **Bookings & Services** (time-slot appointments).
  - Show active grocery/retail orders with live order stepper (Ordered ➔ Packed ➔ On the Way with Rider Map pill) instead of appointment calendars.
  - *Verify:* Grocery purchases display under "Orders" with delivery tracking card; salon bookings display under "Bookings".

- [ ] **Task 4: Scoped Staff Terminal (Zero Financial Leakage)**
  - In `src/screens/business/BusinessAccess.tsx` and business consoles, enforce staff role permission checks.
  - Hide gross store revenue, owner payout balances, bank UPI settings, and pricing configuration from staff terminals.
  - Provide staff with operational fulfillment cards: "Orders to Pack", "Mark Ready for Pickup", and "Handover to Rider".
  - *Verify:* Staff login displays fulfillment queues and hides all owner financials.

- [ ] **Task 5: Pre-Send Chat Attribution Bar & Shared Team Inbox**
  - Create `src/components/chat/PreSendAttributionBar.tsx` and integrate it into `src/screens/chat/ChatThread.tsx`.
  - Display persistent attribution banner above the chat composer: `Replying as: [Business Name] · [Staff Alias] [Change]`.
  - Stamp outgoing messages with `sender_role`, `entity_name`, and `staff_alias`.
  - Customer chat thread displays store identity and staff badge while maintaining personal user privacy.
  - *Verify:* Store staff replies display as the verified store profile with staff alias for the customer.

- [ ] **Task 6: Delivery Partner High-Contrast Touch Mode**
  - In `src/screens/delivery/DeliveryConsole.tsx`, ensure all primary rider actions ("Picked up", "Arrived at Doorstep", "Verify OTP") have 56px minimum touch targets.
  - Link the Google Maps navigation button and live scooter vector tracking directly to the active stop card.
  - *Verify:* One-handed mobile ergonomics with 56px touch targets and immediate navigation trigger.

- [ ] **Task 7: Comprehensive Testing, Token Check & Production Build**
  - Run full vitest suite (`npx vitest run`).
  - Run `node scripts/check-hardcoded-colors.js` and `node scripts/check-undefined-tokens.js`.
  - Run `npx tsc --noEmit` and `npm run build`.
  - Verify rollback script `20261022_multi_persona_storefront_down.sql` syntax.
  - *Verify:* 100% tests pass, zero type errors, design token compliance, and successful production build.

---

## Done When
- [ ] No grocery/kirana/supermarket storefront shows "Book Appointment".
- [ ] Grocery/retail orders appear in Customer Orders with live delivery tracking instead of appointments.
- [ ] Business staff cannot see owner payout or financial figures.
- [ ] Chat composer has pre-send identity verification preventing accidental persona leaks.
- [ ] All database changes have verified, zero-data-loss rollback scripts.
- [ ] Full test suite, TypeScript compiler, and `npm run build` pass with zero errors.

---

## Reversibility Safeguards
1. **Additive Schema:** No existing columns or tables modified; down-migration provided.
2. **Feature Toggle:** Frontend CTA resolver defaults gracefully if fields are absent.
3. **Atomic Commits:** Each task is committed separately for instantaneous `git revert` if required.
