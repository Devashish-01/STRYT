// Shared queue wait-time math, used by both the customer views
// (businessService.queue / myQueues) and the owner console (QueueManager) so a
// single formula drives every ETA a user sees.

/**
 * Ceiling on the self-reported party size a customer can join a queue with.
 * Large enough for a genuine family/group booking; small enough to bound how
 * much one self-reported entry can skew weightedWaitMin's per-extra-person
 * penalty for everyone else behind them — cuts the gameable range from the
 * previous 20x down to 8x the base service-time penalty.
 */
export const MAX_QUEUE_PARTY_SIZE = 8;

/**
 * Extract the head-count from a free-form party_size label like "3 people" → 3.
 * party_size is stored as text ("1 person", "2 people"), so we parse the first
 * integer and fall back to a party of one for anything unexpected/empty.
 */
export function parsePartySize(label: string | null | undefined): number {
  if (label == null) return 1;
  const m = String(label).match(/\d+/);
  const n = m ? parseInt(m[0], 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Service time for a single group: the shop's base average, plus a quarter of
 * that average for every extra person beyond the first. A solo customer takes
 * `avg`; a party of 3 takes `avg × 1.5`. Larger parties ahead of you therefore
 * push your ETA out realistically instead of every group counting as one slot.
 */
export function groupServiceMin(partySize: number, avgServiceMin: number): number {
  return avgServiceMin * (1 + 0.25 * Math.max(0, partySize - 1));
}

/**
 * Total estimated wait: the weighted service time of every group ahead of you,
 * summed and rounded to whole minutes.
 */
export function weightedWaitMin(partySizesAhead: number[], avgServiceMin: number): number {
  const total = partySizesAhead.reduce((sum, size) => sum + groupServiceMin(size, avgServiceMin), 0);
  return Math.round(total);
}

/**
 * A queue token is payable once you've been called — and stays payable after
 * you've been served, since payment often happens right at/after service,
 * not before. Shared between MyQueues (where it originated) and Home's
 * "Your day" rail so both surfaces agree on exactly when a "Pay now" CTA
 * should show.
 */
export function isQueuePayable(status: string): boolean {
  return status === "CALLED" || status === "SERVED";
}
