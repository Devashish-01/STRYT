# Fix Plan — Delivery & Team Access

**Created:** 2026-08-02
**Status: EXECUTED 2026-08-02.** Phases 1–6 landed; migrations `20260872`–`20260875`
applied to production via `mcp__supabase__apply_migration` and verified against
the live schema. Only **TMA-007** (grant audit trail) and **DLV-009** (unassigned
queue) remain open — both were scoped as deferrable design work, not defects.
**Covers:** every open finding in [TEAM_MEMBER_ACCESS_TRACKER.md](TEAM_MEMBER_ACCESS_TRACKER.md) and [DELIVERY_FLOW_TRACKER.md](DELIVERY_FLOW_TRACKER.md)
**Migrations:** 4 new, `20260872` … `20260875`

## What execution changed about this plan

Three things the plan got wrong or could improve on once the live DB was readable:

1. **The top risk didn't exist.** `appointment_deliveries_one_active` turned out
   to be an ALLOWLIST of active statuses, not a denylist of terminal ones — so
   `CANCELLED` already sat outside it and reassignment needed no index change.
2. **`set_delivery_duty`'s return type was left alone.** The plan proposed
   changing it to a structured blocker. That needs a DROP + CREATE of a live
   function, and between migration and client deploy the old client (which only
   inspects `error`) would read a returned "blocked" as success and let an agent
   go off duty mid-run. Replaced with a *new* read-only `my_duty_blockers()`,
   which is also better UX: the toggle disables itself with a reason instead of
   punishing the tap.
3. **DLV-007 was already fixed** and DLV-002 needed **no client work** — the UI
   had been offering the `delivery` scope all along while the DB discarded it.

## Decisions taken

| # | Question | Decision |
|---|----------|----------|
| D1 | `delivery` scope (TMA-005 / DLV-002) | **Standing agents.** Widen the grant whitelist; an owner can grant the delivery hat permanently. |
| D2 | Cancel semantics (DLV-001) | **Agent reports, owner reassigns.** Delivery → `CANCELLED` with a reason; the appointment survives and returns to the unassigned pool. Owner can also cancel. |
| D3 | UX pass reach | **New + touched surfaces only.** Not a whole-app restyle. |

---

## 0. Prerequisites — do not skip

**P-1 · Authorize the Supabase MCP server.** Four migrations land here and every
DB claim in both trackers is `db-unverified`. The repo convention
(`20260864`'s header) is to apply via `mcp__supabase__apply_migration` and record
that in the file header. Without it this plan can write SQL but cannot verify or
apply it. Run `/mcp` in an interactive session.

**P-2 · Verify current schema before writing anything.** For each of
`appointment_deliveries`, `delivery_batches`, `delivery_agent_duty`,
`business_access_sessions`, confirm live columns/constraints match what the
migration files claim. Memory rule for this repo: *a migration file existing is
not proof it was applied.* Any drift found becomes a finding before it becomes a
fix.

**P-3 · Baseline the failing behaviours.** Reproduce DLV-001 and DLV-003 on a
real device before changing code, so "fixed" is measured against something.

---

## 1. Sequencing

Ordered by dependency, then by user harm. Each phase is independently
shippable and independently revertible.

```
 Phase 1  DLV-001  cancel path            ← unblocks stuck agents  ⟵ START
 Phase 2  DLV-003  solo position RPC      ← independent
 Phase 3  D1/TMA-005/DLV-002  scope       ← independent
 Phase 4  DLV-004 + DLV-005  multi-run    ← independent
 Phase 5  DLV-006  owner actions          ← DEPENDS on Phase 1 + 3
 Phase 6  TMA-004/006/007, DLV-008/009    ← cleanup
```

Phase 5 is last because "cancel" on the owner board needs Phase 1's RPC, and
"reassign" needs Phase 3's agent list to be meaningful.

---

## Phase 1 — DLV-001 · The cancel path

**The bug:** an agent holding an undeliverable order has no exit, and
`set_delivery_duty` refuses to go off duty while any non-terminal delivery
exists — so they are stuck on duty permanently.

### 1.1 Migration `20260872_delivery_cancellation.sql`

```
cancel_delivery(p_delivery_id text, p_reason text, p_note text) → void
```

| Concern | Decision |
|---------|----------|
| Who may call | the assigned agent, **or** owner/manager via `has_business_scope(business_id, uid, 'appointments')` |
| Reason vocabulary | CHECK-constrained: `CUSTOMER_UNAVAILABLE`, `ADDRESS_PROBLEM`, `CUSTOMER_REFUSED`, `UNSAFE`, `AGENT_EMERGENCY`, `OTHER` |
| `OTHER` | requires a non-empty `p_note`; raise otherwise |
| Terminal guard | reject if already `DELIVERED` or `CANCELLED` (idempotent-safe, no double-cancel) |
| Effect | `status = 'CANCELLED'`, stamp `cancelled_at`, `cancelled_by`, `cancel_reason`, `cancel_note` |
| Appointment | **untouched.** It returns to the unassigned pool by virtue of having no live delivery row |
| Batch | if this was the last non-terminal stop, close the batch `COMPLETED`; otherwise leave the run running |
| Notify | the other party — owner if the agent cancelled, agent if the owner did — plus the customer |
| Grants | `revoke … from public, anon; grant execute … to authenticated` |

New columns on `appointment_deliveries`: `cancelled_at timestamptz`,
`cancelled_by text`, `cancel_reason text`, `cancel_note text`.

**The partial unique index is the thing to get right.**
`appointment_deliveries_one_active` must already exclude `CANCELLED` from
"active", or reassignment after a cancel will violate it. **Verify the index
predicate against the live DB first (P-2);** if it only excludes `DELIVERED`,
this migration must drop and recreate it to exclude both. Getting this wrong
means cancel appears to work and reassignment silently fails.

### 1.2 Migration `20260873_duty_release.sql`

`set_delivery_duty` counts `('ASSIGNED','EN_ROUTE','ARRIVED')` — `CANCELLED` is
already excluded, so cancelling frees the agent with no change needed. **Confirm
by reading the live function body**, don't assume from the file. Change only if
drift is found.

Also returns a structured blocker instead of a bare `raise` so the UI can say
*what* is blocking (§7.4):

```
set_delivery_duty(p_on_duty boolean)
  → (ok boolean, blocking_count int, blocking_delivery_id text)
```

Keep the exception for the genuinely-unauthenticated case; use the return shape
for the expected "you still have work" case. An expected outcome is not an error.

### 1.3 Client

| File | Change |
|------|--------|
| `services/engagement/deliveryService.ts` | `cancelDelivery(id, reason, note?)`; `CancelReason` union; `DeliveryStatus` unchanged (`CANCELLED` already declared) |
| `components/delivery/CantDeliverSheet.tsx` | **new** — reason picker + confirm (§7.1) |
| `screens/delivery/DeliveryConsole.tsx` | "Can't deliver" on the active stop; wire the sheet |
| `screens/business/manage/BusinessDeliveries.tsx` | owner-side cancel (lands in Phase 5) |

### 1.4 Verification

| Case | Expected |
|------|----------|
| Agent cancels `ASSIGNED` solo | `CANCELLED`; agent can now go off duty |
| Agent cancels one stop of a 3-stop run | that stop terminal, run continues, remaining stops re-ordered |
| Agent cancels the last live stop of a run | run closes `COMPLETED` |
| Owner reassigns a cancelled delivery | new row created, no unique-index violation |
| Cancel an already-`DELIVERED` delivery | rejected, no state change |
| Double-tap confirm | one cancel, not two |
| `OTHER` with empty note | rejected client-side and server-side |
| Customer view during cancel | progress reflects it; no coordinates leak |

---

## Phase 2 — DLV-003 · Solo position RPC

**The bug:** solo GPS pings are written as `updateStatus(id, "ON_THE_WAY", …)` —
a lifecycle transition used as a position ping. A fix in flight when the agent
taps "Arrived" knocks the delivery back to `EN_ROUTE`, the customer's tracker
regresses, and the handoff step vanishes from the agent's screen.

### 2.1 Migration `20260874_delivery_position.sql`

```
update_delivery_position(p_delivery_id text, p_lat, p_lng, p_accuracy, p_heading) → void
```

Mirrors `update_delivery_batch_position` exactly. Writes **coordinates only** —
never `status`, never `live_status`. Caller must be the assigned agent. No-op
(not an error) if the delivery is already terminal, so a late fix from a
backgrounded app can't resurrect anything.

### 2.2 Client

`DeliveryConsole.tsx:206` becomes:

```ts
if (targets.soloId) {
  void deliveryService.updatePosition(targets.soloId, f.lat, f.lng, f.accuracy, f.heading)
    .catch(() => { /* transient */ });
}
```

Then widen the tracking target from `soloEnRoute` (`EN_ROUTE` only) to any
non-terminal solo delivery, so position keeps flowing through `ARRIVED` — which
is exactly when the customer most wants to know where the driver is. That is
only safe *because* the ping no longer carries a status.

### 2.3 Verification

- Advance to `ARRIVED` while background fixes are firing → status stays `ARRIVED`.
- Owner board shows the dot moving through `ARRIVED`.
- Terminal delivery + late fix → no row change.
- **Invariant I7 restored:** a position ping is not a status transition.

---

## Phase 3 — D1 · Standing delivery agents

### 3.1 Migration `20260875_delivery_scope_grantable.sql`

`grant_team_member_access` whitelists
`('appointments','queue','catalog','leads')`. Add `'delivery'`.

Check `update_team_member_scopes` for the **same** whitelist and widen both —
otherwise a delivery grant can be created but never edited. This is the class of
half-fix that produced the finding in the first place.

### 3.2 Client

| File | Change |
|------|--------|
| `screens/BusinessAccess.tsx` | add `delivery` to `ALL_SCOPES` |
| `services/marketplace/businessAccessService.ts` | delete the stale comment claiming the whitelist already accepts it |
| `components/RequireDeliveryAgent.tsx` | no change — its `hasDeliveryScope` branch stops being dead code |
| `hooks/useAccountOptions.ts` | no change — same |

### 3.3 Verification

| Case | Expected |
|------|----------|
| Grant `delivery` alone | scope persists; hat appears with no assignment |
| Agent with no active job opens `/delivery` | allowed; can toggle duty |
| Edit scopes to add/remove `delivery` | persists both directions |
| Revoke | hat disappears via realtime, no reload |
| Existing grants | unaffected |

---

## Phase 4 — DLV-004 + DLV-005 · Multi-run correctness

**DLV-004:** `batches.find(…PENDING_ACCEPTANCE)` takes the first match and the
console early-returns into a fullscreen gate — a second pending run is invisible,
and solo `ASSIGNED` work is hidden behind it.

**DLV-005:** `runningBatch = activeBatches[0]` and `trackingTargetsRef` holds one
`batchId` — a second accepted run's position freezes for its whole duration.

### 4.1 Changes

```ts
// was: batchId: string | null
trackingTargetsRef.current = {
  batchIds: activeBatches.map(b => b.batchId),   // fan out to all
  soloIds:  soloTrackable.map(d => d.id),        // Phase 2 widened this
};
```

The fan-out pattern already exists in this file — it just isn't applied across
batches. Keep `backgroundLocation` a singleton started once (invariant I5); only
the routing changes.

For the gate: keep "one decision at a time" — it's correct — but queue the
pending runs rather than dropping them (§7.2).

### 4.2 Verification

- Two pending runs → both reachable, count shown, order stable.
- Two accepted runs → both receive position.
- Solo `ASSIGNED` work visible while a run is pending.
- `backgroundLocation.start()` called exactly once across all of it.

---

## Phase 5 — DLV-006 · Owner board actions

Depends on Phase 1 (cancel RPC) and Phase 3 (agent list).

`BusinessDeliveries.tsx` is view-only; assignment lives on a different screen, so
an owner watching a stalled delivery must leave the board to act — and for cancel
there is nowhere to go at all.

Add per-row **Reassign** and **Cancel** in the focused state (the row is already
a button with `onFocus`). Reassign reuses `DeliveryAssignControl`'s picker rather
than a second copy of it. Cancel opens the same sheet as the agent's, with
owner-appropriate reasons.

---

## Phase 6 — Cleanup

| ID | Work |
|----|------|
| **TMA-004** | Regression test: grant → **reload** → assert `manage/settings` bounces. Plus a unit test asserting `owned()` never returns a delegated id in `businessIds`. This is the test that would have caught the escalation. |
| **TMA-006** | Document the "self-hides by scope" contract in `ManageDashboard`/`BusinessHub`, or add `RequireAnyScope` to bounce a zero-scope grantee. |
| **TMA-007** | Grant audit trail — `business_access_audit` append-only, written by the grant/revoke/update RPCs. |
| **DLV-008** | Either wire `IN_PROGRESS` (first stop advanced → set it) or delete it from `DeliveryBatchStatus`. Decide, don't leave a declared state nothing sets. |
| **DLV-009** | Name the unassigned-delivery queue before anyone builds SLA timers or auto-dispatch on the absence of a row. |

---

## 7. UI/UX — what "Apple-grade" means here

Concrete rules for the surfaces this plan touches. Build on the primitives the
app already has (`haptics`, `overlay`/`sheet`/`sheet-grab`, `usePullToRefresh`,
the `armed` two-step in `NewRunGate`) — **consistency with the existing app beats
novelty**. A new interaction idiom is a regression even if it's prettier.

### 7.0 Baseline, applies to everything below

| Rule | Why |
|------|-----|
| Every destructive action is two-step: **arm → confirm** | `NewRunGate` already does this; reuse it |
| Every async action is disabled + spinner while in flight | double-cancel is a real bug, not a theoretical one |
| Every touch target ≥ 44 × 44 pt | one-handed use, in the rain, on a bike |
| `env(safe-area-inset-*)` on every sheet and fixed bar | the app is shipped in Capacitor |
| `@media (prefers-reduced-motion: reduce)` on every transition | non-negotiable |
| Errors name the fix, not the failure | "Ask the customer to re-read the code" beats "Invalid code" |
| No layout shift on state change | reserve space for the spinner/label before it appears |

### 7.1 "Can't deliver" sheet (Phase 1)

The most delicate screen in the plan: a stressed agent, one-handed, possibly in
traffic, taking an action they can't undo.

```
 ╭─────────────────────────────╮
 │            ▁▁▁              │  sheet-grab
 │                             │
 │  Can't deliver this order?  │  h2, bold
 │  Order #A2891 · Priya S.    │  small muted — anchors WHICH order
 │                             │
 │  ○ Customer unavailable     │  44pt rows, radio, haptics.selection
 │  ○ Address problem          │
 │  ○ Customer refused         │
 │  ○ Unsafe to deliver        │
 │  ○ Personal emergency       │
 │  ○ Something else           │  → reveals required note field
 │                             │
 │  ┌───────────────────────┐  │
 │  │      Keep trying      │  │  ← default, safe, filled
 │  └───────────────────────┘  │
 │      Can't deliver          │  ← destructive, text-only until armed
 ╰─────────────────────────────╯
```

- **Safe action is the visually dominant one.** The destructive action is
  text-only until a reason is picked, then arms for 3s as a filled red button
  ("Confirm — can't deliver"), then disarms. Copied from `NewRunGate`.
- Reason is **required** before the destructive path is reachable at all.
- "Something else" reveals a note field that is required and validated on both
  sides — never a silent no-op.
- Haptics: `selection` on pick · `warning` on arm · `success` on completion.
- Sheet dismisses on backdrop tap and on drag-down, **except while the request is
  in flight** — a half-sent cancel must not be dismissable.
- After success: sheet dismisses, the stop animates out of the active list, one
  toast — *"Marked undeliverable. Rakesh's shop has been notified."* Name the
  business; the agent needs to know someone specific knows.
- **The duty toggle unblocking is the point of the whole feature — show it.** If
  this was the agent's last live job, the toast is followed by the duty control
  becoming enabled with a subtle highlight, not silence.

### 7.2 Pending-run queue (Phase 4)

Keep the fullscreen intercept. Add:

- A **"Run 1 of 2"** pill at the top when more than one is pending. The count is
  the whole fix — the agent must know more work is waiting before deciding.
- A collapsed strip beneath the primary card showing the next run's stop count
  and area, non-interactive. Visible, not competing.
- Solo `ASSIGNED` deliveries surface as a one-line "+2 single deliveries waiting"
  footer — acknowledged, not actionable, so it doesn't fight the decision.
- On accept/decline, the next run **slides in** rather than the screen
  re-rendering in place. The transition is what tells the agent one decision
  landed and another began.

### 7.3 Owner board actions (Phase 5)

- Actions live in the focused row, revealed with a height transition — no
  swipe-to-reveal (undiscoverable, and this board is used on desktop too).
- **Reassign** is primary and quiet; **Cancel** is destructive and text-only
  until armed.
- Reassign shows the agent picker with on/off-duty tags already carried by
  `DeliveryTeamMember.onDuty` — surface it, don't hide it. The owner should be
  able to see they're about to assign someone off duty.
- Optimistic row update with rollback on failure. A board that lags behind the
  street is worse than one that admits an error.

### 7.4 Duty toggle (Phase 1.2)

Today: blocked toggle → bare toast. Instead:

- Toggle renders **disabled with an inline reason**: *"1 delivery in progress"* —
  and the reason is a **link to that delivery**. Never make someone hunt for the
  blocker you already identified.
- On unblock, the toggle enables with a brief highlight.
- Off-duty state is visually unmistakable at a glance — this is the control that
  decides whether an agent's evening is their own.

### 7.5 Handoff lockout (DLV-007 client polish)

The server limit exists (5 / 15 min). The client should stop pretending
otherwise: on lockout, disable the input and show a **live countdown** rather
than repeating a failure toast the agent can do nothing about.

---

## 7A. Verification record — 2026-08-02

### Server behaviour: 17/17 against the live database

Run as one `begin … rollback` transaction with `request.jwt.claims` set per
actor, so every path was exercised against the **real** functions, triggers,
constraints and indexes — then discarded. Confirmed afterwards: zero stray
fixture rows, and `count(*) where cancelled_by is not null` = 0, i.e. no real
delivery was touched.

| # | Check | Result |
|---|-------|--------|
| C00 | `auth.uid()` resolves from the JWT claim | pass |
| C01 | Invalid reason rejected before any write | `INVALID_REASON` |
| C02 | `OTHER` without a note rejected | note error |
| C03 | Unknown delivery id rejected | `DELIVERY_NOT_FOUND` |
| C04 | A stranger cannot cancel | `NOT_ALLOWED` |
| C05 | `my_duty_blockers` counts live work | 4 |
| C06 | Agent cancels a solo delivery | `CANCELLED` / `AGENT` |
| C07 | Double-cancel refused (terminal guard) | "already closed" |
| C08 | **Cancelling unblocks duty** | 4 → 3 |
| C09 | **Reassignment after cancel doesn't violate the partial unique index** | insert ok |
| C10 | `ACCEPTED → IN_PROGRESS` when the first stop moves | pass |
| C11 | Position writes coords, leaves status alone | `19.07` / `EN_ROUTE` |
| C12 | Position streams through `ARRIVED` | `19.08` / `ARRIVED` |
| C13 | Out-of-range latitude rejected | `INVALID_LATITUDE` |
| C14 | Position on a terminal delivery is a silent no-op | no error, lat null |
| C15 | Owner cancel attributed to `BUSINESS` | pass |
| C16 | Cancelling the last live stop closes the run | `COMPLETED` |

C08 and C09 are the two that mattered most: C08 is the whole point of DLV-001
(an agent stuck on duty), and C09 is the index risk the plan flagged — now
demonstrated rather than reasoned about.

### Build & suite

- `npm run build` — clean (59s; PWA + service worker emitted, 188 precache entries).
- `vite preview` — app shell HTTP 200, entry bundle 306 kB served OK.
- `npx tsc --noEmit` — clean. `npx eslint` — 0 errors on changed files.
- `npx vitest run` — **68/68 green, 6 consecutive runs** (the suite contains
  fast-check property tests that draw a fresh seed each run, so a single green
  run proves nothing about flakiness).

### Still not verified

The client UI has not been driven on a real device or emulator: sheet drag
physics, haptics, the arm/disarm timing, and the "Run 1 of N" pill are verified
only by typecheck, lint and reading. Everything server-side is now demonstrated.

---

## 8. Definition of done

Per phase, all of:

- [ ] Migration applied via `mcp__supabase__apply_migration`, header annotated with the applied name (repo convention, per `20260864`)
- [ ] Live schema re-read and the tracker's `db-unverified` markers cleared for what this phase touched
- [ ] `npx tsc --noEmit` clean
- [ ] `npx eslint` clean on changed files
- [ ] Phase verification table above passes on a real device
- [ ] Tracker finding moved `open` → `fixed`, with evidence
- [ ] Both trackers' §5/§7 tables re-checked **after a full page reload** — the team-access escalation only appeared on the second load, and that class of defect is invisible to same-session testing

## 9. Risk register

| Risk | Mitigation |
|------|------------|
| `appointment_deliveries_one_active` predicate doesn't exclude `CANCELLED` | P-2 verifies before Phase 1 writes SQL; recreate the index in the same migration if needed |
| Migration files don't match live DB | P-1 + P-2 are prerequisites, not optional |
| Widening the delivery scope exposes a surface assuming assignment | Phase 3 verification includes "no active job" explicitly |
| Position fan-out double-starts `backgroundLocation` | Invariant I5; assert `start()` called once in Phase 4 verification |
| Cancel races a concurrent status advance | `for update` row lock in `cancel_delivery`, terminal guard rejects the loser |
| UX pass drifts past agreed scope (D3) | Only surfaces listed in §7 change |
