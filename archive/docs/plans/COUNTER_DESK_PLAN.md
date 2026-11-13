# Phase 3 — The Counter (Operations Desk) — plan

**Status:** plan, 2026-11-13. Nothing built. Replaces Phase 3 of the "Multi-Workspace Architecture Blueprint".
The rest of that blueprint was reviewed the same day: Phases 1, 2 and 4 largely exist, and Phase 5 should be built on the
notifications stream. See the review notes at the end.

**One line:** a full-screen, big-button screen for counter staff — serve the line, pack orders, close visits, look up a price —
that shows only what their access allows and never shows the shop's totals or money settings.

---

## 0. First: what counter staff may do with money — DECIDED 2026-11-13: new `money` scope

> **Done (migration applied 2026-11-13; app half uncommitted):** `20261018_money_scope.sql` + rollback + `money_scope.test.sql`, and the app half (Team access
> tick box, `toggleScope`, `DeliveryOwnerPanels` gated). It also fixed GAPS #52 (`set_business_login` couldn't find `crypt`). In
> the app the tick box only shows with the delivery flag, because everything `money` guards is delivery money. §3.1, §4.6 and §4.7
> are done.

Checked in the live database (2026-11-13). Money in the business console is protected like this:

| What | Who can call it today | Where it shows |
|---|---|---|
| Payments page, settings, payout details | Owner only (`RequireOwner` route) | `/manage/payments`, `/manage/settings` |
| Dashboard money card, reviews | Owner only (`isOwner` in `ManageDashboard`) | Dashboard |
| Confirm / reject a customer's payment claim, record a walk-in payment, custom payments | Owner **or `appointments` scope** | Orders, Home "needs a look" |
| `business_cash_to_settle`, **`settle_agent_cash`**, `business_cash_outstanding`, `business_delivery_stats` (incl. fees collected) | Owner **or `appointments` scope** | Orders → Deliveries tab (`DeliveryOwnerPanels`) |

So today, **anyone given the `appointments` scope** (which they need to see orders at all) can see how much cash each rider owes,
mark it settled, and see delivery fee totals. That is GAPS #51. The blueprint's rule — "Operations Desk: no financial access" —
can't be met with the current scopes.

Per-order money is part of a counter job: telling a customer what they owe, taking cash, confirming a UPI payment. Totals and
rider settlement are a manager's job. **Recommended:** add a sixth scope, `money`, meaning "sees totals and settles rider cash".
- Requires `money` (or owner): `business_cash_to_settle`, `settle_agent_cash`, `business_cash_outstanding`,
  `business_delivery_stats`, and the `DeliveryOwnerPanels` UI.
- Stays on `appointments`: confirm / reject / record payment on a single order.
- Existing grants that have `appointments` get `money` added, so nobody loses anything on the day. Production has one grant
  today, the test rider. New grants start without it, and the owner ticks it in Team access.

The alternative is to make those four functions owner-only. That is simpler, but a trusted manager could then never settle a
rider's cash.

## 1. Who lands on the Counter

Computed from the grant the server already holds; nothing new is stored on the phone (blueprint review point 2).

- A **scoped** team member whose scopes include `queue` or `appointments` → `contextHomePath` sends them to
  `/business/:id/desk` instead of `/business/:id/manage`.
- Owners and FULL delegates keep their console home. They can open the Counter from the quick dial ("Counter").
- A member who has only `delivery` keeps landing on `/delivery` (unchanged).
- Behind a flag, `VITE_COUNTER_DESK_ENABLED`, in the `DELIVERY_AGENT_ENABLED` pattern. Off in production until it has been used
  in the closed test.

## 2. What the Counter shows

Each section appears only if the member holds its scope (one pure function, `counterSections(access, business)`, with tests).

| Section | Scope | What it does | Built on (exists today) |
|---|---|---|---|
| **Line** | `queue` | Now serving / next up; big "Call next"; Served, No-show; add a walk-in to the line | `businessService.callNextToken`, `serveToken`, `removeNoShowToken`, `markArrived`, `queue_token_create_walk_in`; transitions enforced by 20261013 |
| **To pack** | `appointments` | Accepted orders not yet packed → "Packed" (hands over to the rider) | `deliveryService` `mark_order_ready` |
| **Payments to check** | `appointments` | "Customer says they paid ₹X by UPI" → Got it / Not received; record cash at the counter | `appointment_confirm_payment`, `appointment_reject_payment`, `appointment_record_walk_in_payment`, queue payment confirm / reject |
| **Today's visits** | `appointments` | Today's accepted slot bookings → Done / No-show | `visitOutcomeActions` + 20261015 (just shipped) |
| **Price check** | none (catalog is public) | Search the shop's items: price, in stock or not | the public `catalog_items` read. With `catalog`, also a one-tap "Out of stock" |

Never on the Counter, whatever the scopes: totals, revenue, the payments history page, settings, payout details, team access,
reviews — and, unless the member has `money`, rider cash.

Screen rules: one column, actions at least 48 px, the Line pinned on top when the queue is open, numbers big enough to read from
an arm's length, plain words in en / hi / mr (the "Counter" name, not "Operations Desk"), works on a ₹8k Android.

Live updates: one realtime channel per Counter (queue_tokens + appointments for this business), the same
`useQueryWithRealtime` hooks the console uses. No new subscriptions for other workspaces (that is Phase 5).

## 3. Server work

1. **Migration `<next>_money_scope.sql`** (only if decision 0 = new scope): the four functions above require
   `has_business_scope(…, 'money')` or ownership; existing `appointments` grants get `money` appended. Check first whether
   `grant_team_member` / `update_team_member_scopes` validate scope names (the column itself has no CHECK — confirmed). Rollback
   and a behaviour test in the house style. Run in PGlite first, as with 20261011–17.
2. **Check, then decide:** that a staff member's reply in Leads / Q&A / Inbox shows the shop's name, not the person's
   ("zero identity leakage" in the blueprint). Not yet checked.
3. Nothing else. Every Counter action already exists as a guarded function or a guarded table write.

## 4. App work

1. `src/lib/machines/counter.ts`: `counterSections()` and the "lands on the Counter" rule, with tests.
2. `contextHomePath` takes the access level into account (today it only knows type and id).
3. `screens/business/desk/CounterDesk.tsx` + one small component per section. It reuses the existing service calls; no new data
   layer.
4. Route `/business/:id/desk` behind `BusinessAccessGuard`, with its own layout (no console nav, a "Switch" button to the hat
   switcher).
5. `businessDial`: a "Counter" shortcut for owners and FULL delegates.
6. Team access screen: the `money` tick box with a one-line explanation ("Sees totals and settles riders' cash").
7. `DeliveryOwnerPanels` hidden unless owner or `money`.
8. i18n keys in en / hi / mr. Run `grep "\[t,"` on every file touched (the shadowing trap).

## 5. Done when

- [ ] A test account with only `queue` opens the app and lands on the Counter showing only the Line.
- [ ] With `queue` + `appointments` (no `money`): Line, To pack, Payments to check, Today's visits. Calling
      `business_cash_to_settle` from that account's browser returns NOT_ALLOWED (database, not just the screen).
- [ ] The owner sees their console as before, and the Counter from the quick dial.
- [ ] Every Counter action works end to end on a phone with the three test accounts (call → serve; order → packed → rider picks
      up; UPI claim → confirmed; visit → done / no-show).
- [ ] Switching between the owner's Counter and console shows a skeleton within 100 ms and no blank screen.
- [ ] `npm run verify` green; SQL test passes in PGlite and in production.

## 6. Out of scope

Barcode scanning, revenue analytics, settlement history (payments are recorded offline; there is no settlement system),
turn-by-turn navigation, and renaming `activeContext` → `ActiveWorkspace`.

## 7. Order and timing

1. Ship the state-machine app half first (20261011–17 are live; the app changes are not).
2. Decision 0.
3. Server step 3.1, then app steps 1–8 behind the flag.
4. Turn the flag on for the closed-test accounts only. It changes nothing for testers who aren't shop staff, so it doesn't
   reset the 14-day clock.

Rough size: server half a day; app 2–3 days; a phone pass with three accounts half a day.

---

## Review notes on the rest of the blueprint (2026-11-13)

- **Keep the password on the owner workspace** (it replaced the Switch PIN in July on purpose: shared phones). Staff and
  courier workspaces can open without it.
- **Workspace type comes from the server's grants, never from local storage.** Store only `{type, id}`; compute name,
  subtitle, avatar, home path and badge.
- **Long-press, not double-tap** (double-tap adds about 300 ms to every single tap). In the business console, hold already opens
  the quick dial; one meaning per gesture per screen.
- **Phase 5 on `notifications`:** one per-user realtime channel that already carries `entity_type` / `entity_id`, instead of
  subscribing to every business's tables.
- **Plain names:** My shop · Counter · Deliveries · My work.
- **Phases 1, 2 and 4 already exist** (`activeContext` + switchers + the "Switch to X?" prompt, GAPS #36; the delivery console,
  GAPS #37). Polish only.
