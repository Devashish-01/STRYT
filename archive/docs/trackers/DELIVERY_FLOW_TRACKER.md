# Delivery Flow — HLD / LLD / Tracker

**Status:** shipped; DLV-001…008 fixed 2026-08-02 (migrations 20260872–20260875, applied & verified)
**Feature flag:** `src/lib/features.ts` → `DELIVERY_AGENT_ENABLED`
**Original plan doc (read-only):** `docs/plans/app-plans/09_delivery_boy_flow.md`
**Last updated:** 2026-08-02

> Purpose: put the whole delivery flow in one place so changes stop being made
> one screen at a time. §1–4 are the system as designed; §5 is the actual state
> of each surface; §6 is the findings tracker.
>
> **Verification note:** DB statements below were verified against the LIVE database
> on 2026-08-02 via the Supabase MCP server (schema, function bodies, grants).
> Re-verify after any further migration.
>
> **Behaviour** was verified too, not just shape: 17 checks covering the cancel
> path, duty unblocking, reassignment-after-cancel, the `IN_PROGRESS` trigger and
> the position RPC ran against the live functions inside a rolled-back
> transaction — all pass, no production row touched. See
> [FIX_PLAN.md §7A](FIX_PLAN.md). The client UI has **not** been driven on a
> device; that is the one remaining gap.

---

## 1. The flow, end to end

Four actors, one order.

```
 CUSTOMER            BUSINESS OWNER          DELIVERY AGENT        SYSTEM
    │                      │                       │                 │
    │ books, picks         │                       │                 │
    │ DELIVERY +           │                       │                 │
    │ address ────────────▶│                       │                 │
    │                      │ appointment row       │                 │
    │                      │ fulfillment=DELIVERY  │                 │
    │                      │                       │                 │
    │                      │ (no delivery row until assigned — DLV-009)│
    │                      │                       │                 │
    │                      │ assigns agent         │                 │
    │                      │ (single or batch) ───▶│                 │
    │                      │                       │ notification    │
    │                      │                       │◀────────────────│
    │                      │                       │                 │
    │                      │                  ┌────┴────┐            │
    │                      │                  │ BATCH?  │            │
    │                      │                  └────┬────┘            │
    │                      │            accept whole run / decline    │
    │                      │                       │                 │
    │                      │      ┌────────────────┴──────┐          │
    │                      │  DECLINED               ACCEPTED        │
    │                      │  stops unassigned       stop_order set  │
    │                      │  ◀──────────────────────┐               │
    │                      │                       │                 │
    │                      │                  LEAVING → EN_ROUTE     │
    │  "on the way" ◀──────┼───────────────────────│                 │
    │  agent name+phone    │                       │ background GPS  │
    │  revealed            │◀──────────────────────│ ───────────────▶│
    │                      │  live position        │                 │
    │                      │                       │                 │
    │                      │                  ARRIVED                │
    │  handoff code ───────┼──────────────────────▶│                 │
    │                      │                  confirm_handoff()      │
    │                      │                       │                 │
    │                      │                  DONE → DELIVERED       │
    │  ✓ ◀─────────────────┼───────────────────────│  delivered_at   │
    │                      │                       │                 │
    │                      │   agent/owner → cancel_delivery() → CANCELLED │
```

### 1.1 Deliberate product decisions (not gaps)

| Decision | Where enforced |
|----------|----------------|
| Customers never see agent coordinates — progress + ETA only | `my_delivery_progress`, narrowed `get_tracking` (`20260853`) |
| Agent's name/phone revealed only from `EN_ROUTE` onward | `agent_revealed` in `my_delivery_progress` |
| Batches are all-or-nothing — no per-stop accept | `accept_delivery_batch` / `decline_delivery_batch` |
| Any ACTIVE team member may be assigned, not just `delivery` scope | `assign_delivery` (`20260871`) |
| Off-duty is informational for assignment; there is no auto-dispatch | `deliveryTeam()` comment, `DeliveryTeamMember.onDuty` |

Do not "fix" these. They are the design.

---

## 2. HLD

### 2.1 State machines

**Delivery** (`appointment_deliveries.status`)

```
   ASSIGNED ──▶ EN_ROUTE ──▶ ARRIVED ──▶ DELIVERED
       │            │            │
       └────────────┴────────────┴──▶ CANCELLED   ← cancel_delivery() (20260872)
```

**Live status** (`live_status`) — what the agent pushes; the server maps it onto
the lifecycle status above and stamps `delivered_at` on `DONE`.

```
   LEAVING ──▶ ON_THE_WAY ──▶ ARRIVED ──▶ DONE
```

**Batch** (`delivery_batches.status`)

```
   PENDING_ACCEPTANCE ──▶ ACCEPTED ──▶ IN_PROGRESS ──▶ COMPLETED
            │
            └──▶ DECLINED   (every stop unassigned, owner reassigns)
                                          └──▶ CANCELLED
```

### 2.2 Write model

`appointment_deliveries` is `GRANT SELECT` only. **Every** write goes through a
`SECURITY DEFINER` RPC. There is no client-side path that mutates a delivery
directly — keep it that way.

| RPC | Caller | Effect |
|-----|--------|--------|
| `assign_delivery` | owner/manager | creates the delivery row + notifies |
| `assign_delivery_batch` | owner/manager | creates N rows + a batch, notifies once |
| `accept_delivery_batch` | agent | `ACCEPTED`, persists client-computed `stop_order` |
| `decline_delivery_batch` | agent | unassigns every stop |
| `appointment_update_delivery_status` | agent | live status → lifecycle status (+ optional GPS) |
| `update_delivery_batch_position` | agent | pure GPS push for a run |
| `confirm_handoff` | agent | verifies the customer's code |
| `my_deliveries` / `business_active_deliveries` / `my_delivery_progress` | agent / owner / customer | the three read shapes |
| `set_delivery_duty` / `get_delivery_duty` | agent | duty toggle; **rejects going off-duty with non-terminal work** |

### 2.3 The three read shapes

One delivery, three deliberately different projections. Never widen one to
match another:

| Reader | Shape | Sees coordinates? |
|--------|-------|-------------------|
| Agent | `DeliveryItem` | yes — own position + stop coords |
| Owner | `BusinessDeliveryItem` | yes — agent position + stop coords |
| Customer | `CustomerDeliveryProgress` | **no** — status, ETA, `stopsBefore`, own handoff code |

---

## 3. LLD

### 3.1 Data (verified live 2026-08-02)

**`appointment_deliveries`** — `20260845_delivery_agent_phase1_groundwork.sql`

| Column | Notes |
|--------|-------|
| `appointment_id` | partial unique index `appointment_deliveries_one_active` — one live delivery per appointment |
| `business_id`, `agent_user_id` | |
| `status`, `live_status` | the two machines in §2.1 |
| `handoff_code`, `handoff_verified` | code generated at assignment |
| `lat`, `lng` | solo delivery's last known agent point |
| `batch_id`, `stop_order` | null when assigned individually |
| `delivered_at` | stamped on `DONE` |

**`delivery_batches`** (`20260848`) — one run; carries `agent_user_id`, `status`,
and the run's shared live position (`lat`/`lng`/`heading`). One agent has one
position serving every stop, so it lives on the batch, not the stop.

**`delivery_agent_duty`** (`20260862`) — `user_id`, `on_duty`.

### 3.2 Migrations

| File | Adds |
|------|------|
| `20260845` | table, RLS, `assign_delivery` |
| `20260846` | `my_deliveries` |
| `20260847` | handoff + tracking |
| `20260848` | batches (phase 4) |
| `20260851` | business home-delivery toggle + ETA |
| `20260852` | `business_active_deliveries` |
| `20260853` | customer sees progress only — no coordinates |
| `20260854` | `revoke anon` on delivery RPCs |
| `20260862` | duty |
| `20260863` | agent position on `business_active_deliveries` |
| `20260864` | handoff-code rate limit (5 / 15 min, per delivery) |
| `20260871` | assignment widened to any ACTIVE team member |

### 3.3 Client surfaces

| File | Surface | Actor |
|------|---------|-------|
| `components/AppointmentSheet.tsx` | IN_STORE / DELIVERY toggle + address capture | customer |
| `components/delivery/DeliveryTrackControl.tsx` | progress + handoff code in My Appointments | customer |
| `screens/TrackingPage.tsx` | shared tracking link | customer |
| `screens/business/manage/BusinessAppointments.tsx` | Deliveries tab — **where assignment happens** | owner |
| `components/delivery/DeliveryAssignControl.tsx` | agent picker | owner |
| `screens/business/manage/BusinessDeliveries.tsx` | live board — **view only** | owner |
| `screens/delivery/DeliveryConsole.tsx` | the agent's whole app (788 lines) | agent |
| `screens/business/manage/TeamMyDeliveries.tsx` | agent's stops inside the business console | agent |
| `components/delivery/DeliveryStepper.tsx`, `DeliveryStatusPill.tsx`, `HandoffCodeInput.tsx` | shared bits | all |
| `services/engagement/deliveryService.ts` | every RPC wrapper | — |

### 3.4 Route gates

| Route | Gate | Passes when |
|-------|------|-------------|
| `/delivery` | `RequireDeliveryAgent` | `delivery` scope **or** ≥1 active assignment |
| `/business/:id/manage/deliveries` | `RequireScope "appointments"` | appointments scope |
| `/business/:id/manage/my-deliveries` | `RequireBusinessDeliveryMember` | `delivery` scope **or** active assignment here |

### 3.5 Background location

`backgroundLocation` is a **singleton with fan-out**. `DeliveryConsole` starts it
once when any run needs tracking and routes each fix to whichever jobs are
active via a ref read fresh per fix — never `.start()` twice, never restart it
because attribution changed mid-flight. Disclosure
(`BackgroundLocationDisclosure`) must be accepted before the first start.

---

## 4. Invariants

| # | Invariant | Enforced by |
|---|-----------|-------------|
| I1 | No client writes a delivery row directly | `GRANT SELECT` only |
| I2 | Customers never receive agent coordinates | `my_delivery_progress` projection |
| I3 | One live delivery per appointment | partial unique index |
| I4 | A batch is accepted or declined whole | `accept`/`decline_delivery_batch` |
| I5 | `backgroundLocation` is started at most once | singleton + `isTrackingRef` |
| I6 | Every delivery can reach a terminal state | `cancel_delivery` (20260872) |
| I7 | A position ping is not a status transition | `update_delivery_position` (20260873) |

---

## 5. Surface status

| Surface | Works | Notes |
|---------|-------|-------|
| Customer: choose delivery + address | ✅ | gated on `deliveryEnabled`, address required |
| Customer: track progress | ✅ | no coordinates, by design |
| Owner: assign single | ✅ | |
| Owner: assign batch | ✅ | |
| Owner: live board | ✅ | reassign + cancel inline (DLV-006) |
| Agent: accept/decline run | ✅ | pending runs queued with a count (DLV-004) |
| Agent: route ordering | ✅ | client nearest-neighbour, persisted on accept |
| Agent: status advance | ✅ | |
| Agent: handoff | ✅ | server-side throttle in place (DLV-007) |
| Agent: multiple active runs | ✅ | position fans out to every run (DLV-005) |
| Agent: solo GPS | ✅ | dedicated `update_delivery_position` (DLV-003) |
| Agent: failed delivery | ✅ | "Can't deliver" sheet → `cancel_delivery` (DLV-001) |
| Agent: duty toggle | ✅ | disabled with an inline reason; cancelling unblocks it |

---

## 6. Findings tracker

Status: `open` → `planned` → `in-progress` → `fixed` · `wont-fix`

### DLV-001 — [gap/critical] A delivery that can't be completed has no exit — **fixed**

- `CANCELLED` is declared in `DeliveryStatus`, filtered for in history views, and
  rendered ("Cancelled" chip at `DeliveryConsole.tsx:783`) — but **nothing in the
  codebase can ever write it.** There is no `cancel_delivery` RPC in any
  migration, and no cancel/fail control in the agent console or the owner board.
- Real-world path with no handling: customer absent, wrong address, refused
  order, agent's shift ends mid-run.
- **Compounding failure:** `set_delivery_duty` rejects going off duty while the
  agent holds non-terminal work. An agent with one undeliverable order is
  therefore **stuck on duty permanently**, with no in-app way out.
- `decline_delivery_batch` is not a substitute — it only applies before accept,
  and unassigns rather than terminating.
- **Evidence:** `src/services/engagement/deliveryService.ts:33`,
  `src/screens/delivery/DeliveryConsole.tsx:783`, absence across
  `supabase/migrations/*.sql`
- **Fix — `20260872_delivery_cancellation.sql`:**
  `cancel_delivery(p_delivery_id, p_reason, p_note)`, callable by the assigned
  agent or an appointments-scoped manager. Reason is CHECK-constrained; `OTHER`
  requires a note. Row-locked and terminal-guarded, so a cancel racing a status
  advance has exactly one winner and a double-tap can't rewrite a closed record.
  Closes the run only if it was the last live stop. Notifies the other party and
  the customer; the appointment is deliberately untouched (decision D2).
  Adds `cancelled_at`/`cancelled_by`/`cancel_reason`/`cancel_note`.
- **Verified live before writing:** `appointment_deliveries_status_check`
  already allowed `CANCELLED`, and `appointment_deliveries_one_active` is an
  ALLOWLIST of `('ASSIGNED','EN_ROUTE','ARRIVED')` — so a cancelled delivery
  already sits outside the index and reassignment can't violate it. **No
  constraint or index change was needed**, which the plan had flagged as the
  top risk. `set_delivery_duty` counts those same three states, so cancelling
  frees the agent with no change to it.
- **Client:** `CantDeliverSheet` (agent + business variants) → console stop
  cards, run cards, and the owner board.
- **Status:** fixed · I6 restored

### DLV-002 — [doc-mismatch/major] The `delivery` scope can't be granted — **fixed**

- Same defect as `TEAM_MEMBER_ACCESS_TRACKER.md` TMA-005, seen from this side.
  `grant_team_member_access` whitelists only
  `('appointments','queue','catalog','leads')`, so `delivery` is silently dropped
  from any grant.
- Consequence here: `RequireDeliveryAgent`'s `hasDeliveryScope` branch and
  `useAccountOptions`'s `scopes.includes("delivery")` branch are **dead code**.
  The Delivery hat appears only when `countMyActiveDeliveries() > 0` — so an
  agent with no current assignment cannot open `/delivery` at all, including to
  set themselves on duty.
- **Decision (D1):** standing delivery agents — widen the whitelist.
- **Fix — `20260874_delivery_scope_grantable.sql`:** `delivery` added to the
  whitelist in **both** `grant_team_member_access` and
  `update_team_member_scopes`. Widening only the grant would have let a delivery
  grant be created and then silently stripped the first time an owner edited
  that member's scopes — the same half-fix that produced this finding.
- **No client change was needed:** `BusinessAccess` already listed `delivery` in
  `ALL_SCOPES` and even shipped a "Delivery rider" preset. The UI had been
  offering a scope the DB was quietly discarding the whole time.
- **Verified live:** both function bodies now contain the widened whitelist.
- **Status:** fixed

### DLV-003 — [bug/major] Solo GPS pings are written as status transitions — **fixed**

- The background-location callback pushes a solo delivery's position with
  `updateStatus(soloId, "ON_THE_WAY", lat, lng)` — a lifecycle transition used as
  a position ping. Batches have a purpose-built `update_delivery_batch_position`
  for exactly this reason; solo deliveries have no equivalent.
- **Failure scenario:** agent taps "Arrived" → delivery goes `ARRIVED`; a
  background fix already in flight (or one fired before `refetch()` re-derives
  `soloEnRoute`) lands `ON_THE_WAY` → the delivery drops back to `EN_ROUTE`, the
  customer's tracker regresses, and the handoff step disappears from the agent's
  own screen until the next refetch.
- **Evidence:** `src/screens/delivery/DeliveryConsole.tsx:206`
- **Fix — `20260873_delivery_solo_position.sql`:** `update_delivery_position`,
  the batch RPC's shape with two deliberate differences, both because it is fed
  by a background ping rather than a user action — it accepts `ARRIVED` as well
  as `EN_ROUTE`, and a ping for an already-terminal delivery is a silent no-op
  rather than `NOT_ALLOWED` (a late fix from a backgrounded app is expected, and
  must never resurrect a closed delivery).
- **Client:** solo tracking now streams through `ARRIVED` — position matters
  most in the last hundred metres, and that is only safe *because* the ping no
  longer carries a status.
- **Status:** fixed · I7 restored

### DLV-004 — [bug/major] Only one pending run is reachable — **fixed**

- `pendingBatch = batches.find(b => b.status === "PENDING_ACCEPTANCE")` takes the
  first match, and when it exists the console **early-returns** into the
  full-screen `NewRunGate`.
- Two consequences: a second pending run is invisible until the first is
  resolved; and solo `ASSIGNED` deliveries are hidden behind the gate even though
  they need no acceptance.
- The "one decision at a time" intent is sound — but it should queue the pending
  runs and show a count, not silently drop them.
- **Evidence:** `src/screens/delivery/DeliveryConsole.tsx:127`, `:274`
- **Fix:** `pendingBatches` (filter, not `find`). The gate keeps its
  one-decision-at-a-time intercept — that part was right — but now shows a
  **"Run 1 of N"** pill, the next run's stop count, and a count of solo
  deliveries waiting behind it. Everything queued is acknowledged; nothing
  queued is actionable, so it doesn't compete with the decision in front.
- **Status:** fixed

### DLV-005 — [bug/major] A second accepted run stops reporting position — **fixed**

- `runningBatch = activeBatches[0]`, and `trackingTargetsRef` carries a single
  `batchId`. If an agent holds two accepted runs, only the first receives
  `updateBatchPosition` — the second's customers and owner see a frozen position
  for the whole run.
- **Evidence:** `src/screens/delivery/DeliveryConsole.tsx:180`, `:202`
- **Fix:** `trackingTargetsRef` now carries `batchIds: string[]` and
  `soloIds: string[]`, and each fix fans out to all of them. The effect keys on
  the joined ids rather than a count, so swapping one run for another (same
  count, different targets) can't be missed. `backgroundLocation` is still
  started exactly once — invariant I5 holds; only the routing changed.
- **Status:** fixed

### DLV-006 — [gap/major] The owner's live board is view-only — **fixed**

- `BusinessDeliveries.tsx` renders status, agent, position and a "directions"
  link, but exposes no action: no reassign, no cancel, no nudge. Assignment lives
  on a different screen (Bookings → Deliveries tab), so an owner watching a
  stalled delivery has to leave the board to do anything about it — and for
  cancel, there is nowhere to go at all (DLV-001).
- **Fix:** the focused row now reveals **Reassign** and **Cancel**. Reassign
  reuses `DeliveryAssignControl` rather than a second copy of the picker, so the
  off-duty tags and the new-handoff-code warning can't drift between the two
  places an owner can reassign from. Revealed on focus, not swipe — this board
  is used on desktop too, where swipe is undiscoverable.
- **Status:** fixed

### DLV-007 — [gap/minor] Handoff codes have no attempt throttle — **already fixed**

- Raised from the client, where `confirmHandoff` returns `false` on mismatch with
  no attempt limit. The server-side limit was already in place and was missed on
  the first pass of this audit.
- `20260864_confirm_handoff_rate_limit.sql` adds `handoff_attempts` (5 attempts /
  15 minutes, locked keyed **per delivery**, not per agent — so a compromised
  session can't spread attempts across deliveries). The table has RLS on with no
  policies at all; only the `SECURITY DEFINER` `confirm_handoff` touches it.
  Migration header records it as applied to production.
- Remaining client-side nicety, folded into the UX pass rather than tracked
  separately: surface the lockout as a countdown instead of a bare toast, and
  disable the code input while locked.
- **Status:** fixed (server) · **verified:** migration applied per its own header

### DLV-008 — [gap/minor] `IN_PROGRESS` is declared but never set — **fixed**

- `DeliveryBatchStatus` includes `IN_PROGRESS`, and the console treats it as
  active alongside `ACCEPTED`, but no migration transitions a batch into it.
  Either wire it (first stop advanced → `IN_PROGRESS`) or drop it from the type
  so the vocabulary stops implying a state that doesn't exist.
- **Decision:** wired, not deleted. "Accepted but not started" and "actively out
  on the road" are genuinely different things for an owner watching the board,
  and the vocabulary already existed to say so.
- **Fix — `20260875_delivery_batch_in_progress.sql`:** an `after update of
  status` trigger promotes `ACCEPTED → IN_PROGRESS` when any stop leaves
  `ASSIGNED`. A trigger rather than an edit to
  `appointment_update_delivery_status`, so the run's state can't drift out of
  step with its stops no matter which path moves a stop — the batch's state is a
  function of its stops, and deriving it beats remembering to set it in every
  caller. Never walks a run backwards out of `COMPLETED`/`CANCELLED`, and never
  promotes one still awaiting acceptance.
- **Status:** fixed

### DLV-009 — [gap/minor] No queue of unassigned delivery orders — **open**

- A delivery row is created only by `assign_delivery` / `assign_delivery_batch`.
  Between booking and assignment, a `fulfillment=DELIVERY` appointment has no
  delivery record — so "orders awaiting a driver" isn't a queryable state, it's
  an absence, reconstructed by the Bookings screen.
- Works today at small volume. Worth naming before anyone builds SLA timers or
  auto-dispatch on top of it, both of which need that queue to be real.
- **Status:** open

---

## 7. Next

1. **DLV-001** — the cancel path. Everything else is polish next to an agent who
   can't put an order down.
2. **DLV-003** — solo position RPC; a wrong status is worse than a stale dot.
3. **DLV-002** — resolve the scope question with TMA-005.
4. **DLV-004 / DLV-005** — multi-run correctness.
5. **DLV-006** — owner actions, after DLV-001.
6. Re-verify every `db-unverified` row against the live schema.
