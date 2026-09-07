import { describe, it, expect } from "vitest";
import { bucketCampaigns, needsDeposit, hoursUntilClose, mostUrgentPledge } from "./bulkFeed";
import type { BulkDeal } from "@/types";

const NOW = Date.parse("2026-09-04T12:00:00Z");
const inHours = (h: number) => new Date(NOW + h * 3_600_000).toISOString();

function deal(over: Partial<BulkDeal> = {}): BulkDeal {
  return {
    id: "d1", businessId: "b1", ownerUserId: "u1", title: "Mangoes", regularPrice: 650,
    moq: 100, tiers: [], status: "ACTIVE", createdAtISO: "2026-09-01T00:00:00Z", ...over,
  };
}

describe("bucketCampaigns", () => {
  it("puts anything you pledged into first, whatever its deadline or fullness", () => {
    // A pledge of yours outranks urgency and momentum — it's the only row that
    // can cost you something.
    const mine = deal({ id: "mine", myPledgeQuantity: 2, closesAtISO: inHours(500), pledgedQuantity: 1 });
    const b = bucketCampaigns([deal({ id: "other" }), mine], NOW);
    expect(b.mine.map((d) => d.id)).toEqual(["mine"]);
    expect(b.closing).toHaveLength(0);
    expect(b.almost).toHaveLength(0);
  });

  it("buckets by deadline, then fullness, then everything else", () => {
    const soon = deal({ id: "soon", closesAtISO: inHours(6) });
    const full = deal({ id: "full", pledgedQuantity: 90 });          // 90% of 100
    const plain = deal({ id: "plain", pledgedQuantity: 5 });
    const b = bucketCampaigns([plain, full, soon], NOW);
    expect(b.closing.map((d) => d.id)).toEqual(["soon"]);
    expect(b.almost.map((d) => d.id)).toEqual(["full"]);
    expect(b.open.map((d) => d.id)).toEqual(["plain"]);
  });

  it("treats a deadline beyond 48h as not urgent", () => {
    const b = bucketCampaigns([deal({ id: "later", closesAtISO: inHours(72) })], NOW);
    expect(b.closing).toHaveLength(0);
    expect(b.open.map((d) => d.id)).toEqual(["later"]);
  });

  it("orders 'closing' by soonest deadline, not by the distance order it arrived in", () => {
    const deals = [
      deal({ id: "c40", closesAtISO: inHours(40) }),
      deal({ id: "c2", closesAtISO: inHours(2) }),
      deal({ id: "c20", closesAtISO: inHours(20) }),
    ];
    expect(bucketCampaigns(deals, NOW).closing.map((d) => d.id)).toEqual(["c2", "c20", "c40"]);
  });

  it("orders 'almost there' fullest-first", () => {
    const deals = [
      deal({ id: "p75", pledgedQuantity: 75 }),
      deal({ id: "p95", pledgedQuantity: 95 }),
      deal({ id: "p80", pledgedQuantity: 80 }),
    ];
    expect(bucketCampaigns(deals, NOW).almost.map((d) => d.id)).toEqual(["p95", "p80", "p75"]);
  });

  it("leads 'mine' with the pledge that still owes a deposit", () => {
    const paid = deal({ id: "paid", myPledgeQuantity: 1, depositAmount: 100, myDepositStatus: "PAID" });
    const owing = deal({ id: "owing", myPledgeQuantity: 1, depositAmount: 100, myDepositStatus: "UNPAID" });
    expect(bucketCampaigns([paid, owing], NOW).mine.map((d) => d.id)).toEqual(["owing", "paid"]);
  });

  it("drops closed campaigns entirely", () => {
    const b = bucketCampaigns([deal({ id: "done", closedAtISO: inHours(-2), closeOutcome: "FULFILLED" })], NOW);
    expect([...b.mine, ...b.closing, ...b.almost, ...b.open]).toHaveLength(0);
  });

  it("does not treat an already-passed deadline as closing soon", () => {
    // close_expired_bulk_deals hasn't swept it yet — it's stale, not urgent.
    const b = bucketCampaigns([deal({ id: "stale", closesAtISO: inHours(-1) })], NOW);
    expect(b.closing).toHaveLength(0);
    expect(b.open.map((d) => d.id)).toEqual(["stale"]);
  });
});

describe("needsDeposit", () => {
  it("is true only for your own pledge that owes money", () => {
    expect(needsDeposit(deal({ myPledgeQuantity: 1, depositAmount: 100, myDepositStatus: "UNPAID" }))).toBe(true);
    expect(needsDeposit(deal({ myPledgeQuantity: 1, depositAmount: 100, myDepositStatus: "REJECTED" }))).toBe(true);
    expect(needsDeposit(deal({ myPledgeQuantity: 1, depositAmount: 100, myDepositStatus: "PAID" }))).toBe(false);
    expect(needsDeposit(deal({ myPledgeQuantity: 1, depositAmount: 100, myDepositStatus: "PENDING_CONFIRM" }))).toBe(false);
  });

  it("is false when the campaign asks for no deposit, or you haven't pledged", () => {
    expect(needsDeposit(deal({ myPledgeQuantity: 1, myDepositStatus: "UNPAID" }))).toBe(false);
    expect(needsDeposit(deal({ depositAmount: 100, myDepositStatus: "UNPAID" }))).toBe(false);
  });
});

describe("hoursUntilClose", () => {
  it("returns null with no deadline or one already passed", () => {
    expect(hoursUntilClose(deal(), NOW)).toBeNull();
    expect(hoursUntilClose(deal({ closesAtISO: inHours(-3) }), NOW)).toBeNull();
  });

  it("returns hours remaining", () => {
    expect(hoursUntilClose(deal({ closesAtISO: inHours(5) }), NOW)).toBeCloseTo(5, 5);
  });
});

describe("mostUrgentPledge", () => {
  it("returns undefined for an empty list", () => {
    expect(mostUrgentPledge([], NOW)).toBeUndefined();
  });

  it("ignores closed campaigns entirely", () => {
    const closed = deal({ id: "closed", myPledgeQuantity: 1, closedAtISO: inHours(-2) });
    expect(mostUrgentPledge([closed], NOW)).toBeUndefined();
  });

  it("prefers a pledge that still owes a deposit over one that's merely closing sooner", () => {
    const closingSoonPaid = deal({ id: "paid", myPledgeQuantity: 1, closesAtISO: inHours(1), depositAmount: 100, myDepositStatus: "PAID" });
    const owingLater = deal({ id: "owing", myPledgeQuantity: 1, closesAtISO: inHours(40), depositAmount: 100, myDepositStatus: "UNPAID" });
    expect(mostUrgentPledge([closingSoonPaid, owingLater], NOW)?.id).toBe("owing");
  });

  it("among multiple owing pledges, picks the one closing soonest", () => {
    const owing40 = deal({ id: "owing40", myPledgeQuantity: 1, closesAtISO: inHours(40), depositAmount: 100, myDepositStatus: "UNPAID" });
    const owing2 = deal({ id: "owing2", myPledgeQuantity: 1, closesAtISO: inHours(2), depositAmount: 100, myDepositStatus: "UNPAID" });
    expect(mostUrgentPledge([owing40, owing2], NOW)?.id).toBe("owing2");
  });

  it("falls back to soonest deadline when nothing is owed", () => {
    const later = deal({ id: "later", myPledgeQuantity: 1, closesAtISO: inHours(40) });
    const sooner = deal({ id: "sooner", myPledgeQuantity: 1, closesAtISO: inHours(5) });
    expect(mostUrgentPledge([later, sooner], NOW)?.id).toBe("sooner");
  });

  it("falls back to the first pledge when nothing is owed and nothing has a deadline", () => {
    const first = deal({ id: "first", myPledgeQuantity: 1 });
    const second = deal({ id: "second", myPledgeQuantity: 2 });
    expect(mostUrgentPledge([first, second], NOW)?.id).toBe("first");
  });
});
