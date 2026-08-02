# Feature Trackers

One file per feature that is **live but not finished**. Each carries the HLD and
LLD the feature should have been built from, the invariants that hold it
together, and an open findings list.

These are working documents — edit them as the feature moves.

| Tracker | Feature | Open findings |
|---------|---------|---------------|
| [TEAM_MEMBER_ACCESS_TRACKER.md](TEAM_MEMBER_ACCESS_TRACKER.md) | Team members, delegates, scoped console access | **TMA-007** only |
| [DELIVERY_FLOW_TRACKER.md](DELIVERY_FLOW_TRACKER.md) | Home delivery: booking → assignment → run → handoff | **DLV-009** only |

**[FEEDBACK_17_PLAN.md](FEEDBACK_17_PLAN.md)** — the 17-item user feedback batch
(profile, home, business onboarding, admin review, responsiveness), audited
against the code and live data before planning. Nine of the seventeen turned out
not to be what the ticket described. Planned, not started.

**[FIX_PLAN.md](FIX_PLAN.md)** — the sequenced plan that closed the rows above.
**Executed 2026-08-02**: six phases, four migrations (`20260872`–`20260875`)
applied to production and verified against the live schema. Its header records
the three things execution changed about the plan itself.

Both remaining rows are deferrable design work rather than defects: TMA-007 is a
grant audit trail; DLV-009 is making "orders awaiting a driver" a real queryable
state instead of an absence — worth doing before anyone builds SLA timers or
auto-dispatch on top of it.

## How these differ from the other docs folders

| Folder | What it is | Mutable? |
|--------|------------|----------|
| `docs/plans/app-plans/` | the original feature plans | read-only — historical record |
| `docs/audits/` | point-in-time audit output | append-only |
| `docs/engineering/` | how the codebase is laid out | living reference |
| **`docs/trackers/`** | **living spec + open work per feature** | **yes — keep current** |

## Conventions

- **ID prefix** per tracker (`TMA-`, `DLV-`). Never reuse a number, even after a
  finding is fixed — a fixed row stays in the file as the record of what broke.
- **Status:** `open` → `planned` → `in-progress` → `fixed`, or `wont-fix`.
- **Severity:** `critical` (data/security, or the user is stuck) · `major`
  (a real path is broken) · `minor` (rough edge).
- **Type:** `bug` · `gap` · `doc-mismatch` · `regression`.
- **`db-unverified`** marks any claim read from a migration file rather than from
  the live database. A migration existing is not proof it was applied.
- Every finding needs a **failure scenario** — concrete inputs → wrong outcome.
  "This looks fragile" is not a finding.

## Cross-tracker findings

TMA-005 and DLV-002 are the same defect (the `delivery` scope isn't grantable)
seen from both sides. Resolve it in the team-access tracker; the delivery row
follows.
