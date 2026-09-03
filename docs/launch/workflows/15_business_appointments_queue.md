# 15 — Business: Appointments & Queue

**Priority:** P0.
**Screens:** `BusinessAppointments`, `QueueManager`.

## Flow A — Appointments console

| # | Step | Expected |
|---|------|----------|
| 1 | `BusinessAppointments` | List of bookings, filterable by status |
| 2 | New booking arrives (customer side, workflow 03) | Appears here without a manual refresh (or on next open) |
| 3 | Accept a request | Status updates for the customer |
| 4 | Accept **with an ETA** | Customer sees the ETA |
| 5 | Reject | Customer notified, slot freed |
| 6 | Mark complete | Moves to history |
| 7 | Mark no-show | Distinct from cancel/complete, tracked separately |
| 8 | Create a **walk-in** booking directly from the console | Skips the customer-side flow entirely, still respects slot capacity |
| 9 | Confirm a pending payment claim (`PENDING_CONFIRM` → `PAID`) | Reflects instantly for the customer |
| 10 | Reject a payment claim | Customer can re-claim |

## Flow B — Queue

| # | Step | Expected |
|---|------|----------|
| 1 | `QueueManager` | Live list of customers who joined the queue |
| 2 | Call next | Advances the queue, notifies that customer |
| 3 | Serve / complete a token | Removed from active queue |
| 4 | Add a walk-in directly to the queue | Joins at the correct position |
| 5 | Close the queue | New joins blocked, existing tokens still processable |
| 6 | Queue settings (capacity, etc.) | Persist and are respected by the join flow |
