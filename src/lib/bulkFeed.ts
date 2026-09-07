/**
 * How the bulk-buying view orders itself.
 *
 * The old view was a radius filter above a flat, distance-sorted list of every
 * open campaign. Distance is the WEAKEST signal here: unlike picking a
 * restaurant, a campaign you pledge into is fulfilled later in a batch, so
 * 2km vs 5km barely changes the decision. What actually decides whether
 * someone joins is:
 *
 *   1. "Do I already have money in one of these?"  — a pledge with an unpaid
 *      deposit is the only thing on this screen that can silently cost you
 *      your spot, so it outranks everything.
 *   2. "Is it about to close?"                     — a deadline is the only
 *      hard reason to act right now.
 *   3. "Is it nearly full?"                        — momentum: a campaign at
 *      80% will very likely actually happen, one at 5% may never close.
 *   4. everything else.
 *
 * So the feed buckets on those, and the buckets are what get rendered as
 * sections. Pure and unit-tested — same shape as poolProgress/shareCapabilities.
 */

import type { BulkDeal } from "@/types";
import { poolProgress } from "./groupBuy";

/** Inside this window a campaign is "closing soon" and worth surfacing. */
export const CLOSING_SOON_MS = 48 * 60 * 60 * 1000;
/** At or above this share of target, a campaign reads as likely to happen. */
export const ALMOST_THERE_PCT = 70;

export interface BulkBuckets {
  /** Campaigns this viewer has pledged into. Always first, never re-bucketed. */
  mine: BulkDeal[];
  /** Has a deadline inside CLOSING_SOON_MS. */
  closing: BulkDeal[];
  /** At/above ALMOST_THERE_PCT of target. */
  almost: BulkDeal[];
  /** Everything else still open. */
  open: BulkDeal[];
}

/** A pledge of yours that needs money before it counts. The campaign's
 *  auto-close only sums PAID deposits, so an unpaid pledge isn't holding a
 *  spot at all — the user almost never realises this. */
export function needsDeposit(deal: BulkDeal): boolean {
  if (!deal.depositAmount) return false;
  if ((deal.myPledgeQuantity ?? 0) <= 0) return false;
  return deal.myDepositStatus === "UNPAID" || deal.myDepositStatus === "REJECTED";
}

/** Hours until a campaign's deadline, or null when it has none/has passed. */
export function hoursUntilClose(deal: BulkDeal, now = Date.now()): number | null {
  if (!deal.closesAtISO) return null;
  const ms = new Date(deal.closesAtISO).getTime() - now;
  return ms > 0 ? ms / 3_600_000 : null;
}

export function bucketCampaigns(deals: BulkDeal[], now = Date.now()): BulkBuckets {
  const out: BulkBuckets = { mine: [], closing: [], almost: [], open: [] };

  for (const d of deals) {
    // A closed campaign never belongs in a browse feed. deals() already
    // filters these server-side; this is belt-and-braces for callers (e.g.
    // myPledgedDeals) that deliberately don't.
    if (d.closedAtISO) continue;

    if ((d.myPledgeQuantity ?? 0) > 0) { out.mine.push(d); continue; }

    const hrs = hoursUntilClose(d, now);
    if (hrs !== null && hrs * 3_600_000 <= CLOSING_SOON_MS) { out.closing.push(d); continue; }

    const { pct, hasTarget } = poolProgress({ target: d.moq, pledgedQuantity: d.pledgedQuantity });
    if (hasTarget && pct >= ALMOST_THERE_PCT) { out.almost.push(d); continue; }

    out.open.push(d);
  }

  // Within a bucket, sort by what that bucket is ABOUT — soonest deadline for
  // "closing", fullest first for "almost". Sorting those by distance (what the
  // service returns) would bury the very campaign the section exists to show.
  out.closing.sort((a, b) => (hoursUntilClose(a, now) ?? Infinity) - (hoursUntilClose(b, now) ?? Infinity));
  out.almost.sort((a, b) => pctOf(b) - pctOf(a));
  // "mine" leads with anything still owing a deposit — that's the only row
  // here carrying a consequence.
  out.mine.sort((a, b) => Number(needsDeposit(b)) - Number(needsDeposit(a)));

  return out;
}

function pctOf(d: BulkDeal): number {
  return poolProgress({ target: d.moq, pledgedQuantity: d.pledgedQuantity }).pct;
}

/** The single most attention-worthy pledge, for a one-card summary (Home's
 *  "Your day" rail) — mirrors how nextAppointment there picks just the
 *  soonest booking rather than listing every one. Only considers pledges on
 *  an OPEN campaign; myPledgedDeals() deliberately returns every pledge ever
 *  made, closed or not, so a stale fulfilled/refunded one never resurfaces
 *  here. Priority: unpaid/rejected deposit (same "only thing that can
 *  silently cost you your spot" reasoning as bucketCampaigns' `mine`
 *  ordering) > soonest deadline > most recently created (myPledgedDeals'
 *  own query order, so this is just "keep it"). */
export function mostUrgentPledge(deals: BulkDeal[], now = Date.now()): BulkDeal | undefined {
  const open = deals.filter((d) => !d.closedAtISO);
  if (open.length === 0) return undefined;

  const owing = open.filter(needsDeposit);
  if (owing.length > 0) {
    return owing.sort((a, b) => (hoursUntilClose(a, now) ?? Infinity) - (hoursUntilClose(b, now) ?? Infinity))[0];
  }

  const withDeadline = open.filter((d) => d.closesAtISO);
  if (withDeadline.length > 0) {
    return withDeadline.sort((a, b) => new Date(a.closesAtISO!).getTime() - new Date(b.closesAtISO!).getTime())[0];
  }

  return open[0];
}
