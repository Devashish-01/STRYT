# 20 — Delivery Agent Console

**Priority:** P0 — but **⏸ deferred for v1.0**. `DELIVERY_AGENT_ENABLED` is
`false` for this release. Every step below that exercises actual delivery
mechanics is **skip for v1.0** — the only thing to actually test this
release is that the feature is truly unreachable.

**Screens:** `DeliveryConsole` (behind `RequireDeliveryAgent`),
`BusinessDeliveries` (owner tracking), `TeamMyDeliveries`.

## Flow A — v1.0: confirm it's off

| # | Step | Expected |
|---|------|----------|
| 1 | Any account (including one with a standing `delivery` grant) navigates to `/delivery` directly | Redirects away to `/home`, does **not** open |
| 2 | Business console → "Deliveries" tab (`business/manage/deliveries`) | Also redirects away |
| 3 | "my-deliveries" route (`TeamMyDeliveries`) | Also redirects away |
| 4 | Account switcher / role list | No "Delivery" hat appears anywhere, for any account |
| 5 | As a plain customer, use the app fully (book, chat, etc.) | The delivery battery-exemption prompt **never appears** — its only call site (on-duty toggle) is unreachable |
| 6 | `AndroidManifest.xml` | `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` is commented out — confirm the shipped build genuinely doesn't request it (check app permissions in Android Settings after install) |

## Flow B — v1.1 reactivation script (keep for later, do not run this cycle)

| # | Step | Expected |
|---|------|----------|
| 1 | A4 → `/delivery`, go on duty | Battery-exemption sheet appears here specifically |
| 2 | Business assigns a single delivery | Appears under Assigned |
| 3 | Advance Start → En route → Arrived | Stepper tracks correctly |
| 4 | Wrong handoff code 5× | Locks out with a clear message |
| 5 | Correct code | Delivered |
| 6 | "Can't deliver?" → pick a reason → confirm (double-tap arm pattern, ~4s disarm) | Cancels correctly, business board shows it, business can reassign |
| 7 | Go **off duty** after a cancel | Must actually work — this was the original bug this whole flow was built to fix |
| 8 | Customer's appointment after a delivery cancel | Still exists — history not destroyed |
| 9 | Business assigns a **batch** of 3 while a first batch is still pending | "Run 1 of 2" gate |
| 10 | Background the app 10 min mid-run | Location still posts, FGS notification stays visible |
| 11 | Reach ARRIVED, keep moving | Dot still moves, status doesn't fall back to En route |

Full detail for Flow B lives in `MANUAL_TEST_PLAN.md` §1.2/1.3 — this file
just indexes it under the delivery workflow.
