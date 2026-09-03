# 08 — Payments, Wallet, Loyalty

**Priority:** P0 for the payment-claim mechanics (real money involved),
P2 for coupons/loyalty.
**Note:** STRYT has **no payment gateway** — every payment in the app is a
UPI-deeplink-or-cash self-report, confirmed by the payee. There is nothing
that automatically moves money anywhere; every "paid" state is one side's
claim and the other side's confirmation. Test with that model in mind — a
"refund" anywhere in the app is bookkeeping, never a reversal.
**Service:** `customPaymentService.ts` (the real payment service —
`paymentService` doesn't exist), `walletService.ts`.

## Flow A — The generic claim/confirm state machine

This same shape backs appointment payments, walk-in payments, queue
payments, and bulk-deal campaign deposits (workflow 06/16). Test it once
thoroughly on **appointments** and spot-check the others.

| # | Step | Expected |
|---|------|----------|
| 1 | Customer claims payment (UPI "I have paid" or Cash) | Status → `PENDING_CONFIRM` |
| 2 | Business/provider confirms | Status → `PAID`, both sides see it |
| 3 | Business **rejects** instead | Status → back to unpaid/`REJECTED`; customer can **re-claim** — this must not be a dead end |
| 4 | QR code shown for a UPI payment | Generated **on-device** (`qrcode.react`), not fetched from a third-party API — scans correctly with a real UPI app |
| 5 | "Download QR" | Produces a scannable PNG |
| 6 | Copy UPI ID button | Copies correctly |

## Flow B — Wallet coupons

`Wallet` the **screen** is unrouted (shelved feature, no nav entry) —
`walletService` itself is still live via whatever surfaces still call
`toggleCoupon`/`addStamp`. Confirm where those actually surface in the
current build (likely a business's loyalty card / offers area) before
testing — don't assume the old standalone `/wallet` route exists.

| # | Step | Expected |
|---|------|----------|
| 1 | Save a coupon | Optimistic UI update, persists after reload |
| 2 | Save a coupon in **airplane mode** | Optimistic UI reverts with a "Couldn't update — try again" toast (fixed regression — this previously failed silently) |
| 3 | Add a loyalty stamp | Same optimistic-with-revert behaviour |
| 4 | Loyalty card completion (if a business has one configured) | Reward unlocks/redeems correctly |

## Edge cases

- Claim a payment, then the business goes offline before confirming — no
  crash, customer's status just stays pending until the business returns.
- Two rapid taps on "I have paid" — exactly one claim recorded, not two.
