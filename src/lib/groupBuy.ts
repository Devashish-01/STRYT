/**
 * Group-buy pool progress — one definition, four call sites.
 *
 * A pool's target is measured in UNITS, not people (see RequestPost.pledgedQuantity:
 * "20 neighbours pledging 2 each is meTooCount 20, pledgedQuantity 40"). Three of the
 * four surfaces that draw a progress bar already knew that; the feed card did not, and
 * divided a PEOPLE count by a UNIT target — so a pool of 3 neighbours pledging 4 units
 * each rendered "3 of 40" in the feed and "12 of 40" on the detail screen for the same
 * pool. Two surfaces disagreeing about the same number is worse than either being
 * wrong, so the formula lives here now and every surface reads it.
 *
 * `meTooCount` survives only as a fallback: `pledgedQuantity` is filled in by
 * enrichGroupBuyPledges (requestService), which not every caller runs. When it hasn't,
 * one-unit-per-person is the best available estimate — and it is the honest one, since
 * request_me_toos.quantity defaults to 1.
 */

export interface PoolInput {
  /** Target quantity in units. 0/undefined means the initiator set no target. */
  target?: number | null;
  /** Sum of pledged units across the pool. Undefined until enrichGroupBuyPledges runs. */
  pledgedQuantity?: number | null;
  /** Count of PEOPLE in the pool — the fallback when pledgedQuantity is absent. */
  meTooCount?: number | null;
  /** This viewer's own pledge, when they've joined. */
  myPledgeQuantity?: number | null;
}

export interface PoolProgress {
  /** Units pledged so far. */
  pledged: number;
  /** Units targeted. 0 when the initiator set no target. */
  target: number;
  /** 0–100, clamped. 0 when there is no target to measure against. */
  pct: number;
  /** Units still needed. 0 once the target is met or when there is no target. */
  remaining: number;
  /** Whether this viewer has pledged into the pool. */
  joined: boolean;
  /** Whether the pool has reached its target. False when there is no target. */
  complete: boolean;
  /** True when there is a target to measure against — gates the progress bar. */
  hasTarget: boolean;
}

export function poolProgress(input: PoolInput): PoolProgress {
  const target = Math.max(0, Math.floor(input.target ?? 0));
  // pledgedQuantity is authoritative; meTooCount is the one-per-person estimate.
  const rawPledged = input.pledgedQuantity ?? input.meTooCount ?? 0;
  const pledged = Math.max(0, rawPledged);
  const mine = Math.max(0, input.myPledgeQuantity ?? 0);
  const hasTarget = target > 0;

  return {
    pledged,
    target,
    // Clamped at 100 so an over-subscribed pool doesn't overflow its own bar.
    pct: hasTarget ? Math.min(100, (pledged / target) * 100) : 0,
    remaining: hasTarget ? Math.max(0, target - pledged) : 0,
    joined: mine > 0,
    complete: hasTarget && pledged >= target,
    hasTarget,
  };
}
