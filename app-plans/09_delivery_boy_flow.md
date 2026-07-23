# Task 9 — Delivery Boy at Appointment Time (mature flow plan)

## Goal
At the time of an appointment/booking fulfilment, a **delivery agent**
("delivery boy") can be involved — e.g. a business dispatches someone to
deliver/collect, and the customer can track/verify them. Design a mature,
secure flow. This task is **plan-first**; implement only the safe schema/stubs.

## Concept & flow
1. **Assignment.** For an appointment (or queue token) that needs delivery, the
   business assigns a delivery agent (a lightweight profile: name + phone +
   optional live location share). Agent may be: (a) an existing team member with
   a `delivery` scope, or (b) an ad-hoc contact.
2. **Customer visibility.** Customer sees "Out for delivery — <agent alias>",
   ETA, and (opt-in) live location via the existing `live_shares` /
   `location_share_grants` infra (already in the app for safety sharing).
3. **Verification handshake.** A one-time code (like queue `tracking_tokens`)
   the agent/customer exchange to confirm handoff; prevents wrong-person
   delivery. Reuse `tracking_tokens` pattern.
4. **Privacy.** Agent sees customer real name + address ONLY during the active
   delivery window (mirror Task 8 alias model); reverts after completion.
5. **Payment.** If pay-on-delivery, tie into existing UPI/queue payment claim +
   confirm flow.
6. **Completion.** Agent marks delivered → appointment/token moves terminal →
   names revert to alias, live share auto-revoked.

## Proposed schema (additive, deferred until confirmed)
- `appointment_deliveries` (id, appointment_id FK, agent_user_id or agent_name+
  phone, status [ASSIGNED|EN_ROUTE|DELIVERED|CANCELLED], handoff_code,
  live_share_id?, created_at, delivered_at). RLS: business owner/team +
  the assigned agent + the customer (row-scoped).

## Reuse (don't reinvent)
- `live_shares` / `live_share_recipients` / `location_share_grants` for tracking.
- `tracking_tokens` for the handoff code + public `/track/:token` page.
- Alias reveal model from Task 8.

## Steps (phased)
- [ ] Phase 1 (this batch): document flow (this file) + optional additive table
      behind a feature flag, no UI wired to live users.
- [ ] Phase 2: business assign UI + customer track card.
- [ ] Phase 3: handoff verification + payment tie-in.

## Risk
High if fully built now (new surface + live-location + payments). Keep to
plan + safe additive schema this batch; wire UI in a later, focused pass.
