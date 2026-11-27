import { describe, expect, it } from "vitest";
import { isLiveOrder, isRecentlyDelivered, myDealsOrderUrl } from "./orderLists";

const NOW = Date.parse("2026-10-22T12:00:00Z");
const minutesFromNow = (m: number) => new Date(NOW + m * 60_000).toISOString();
const order = (over: Partial<Parameters<typeof isLiveOrder>[0]>) =>
  ({ status: "ACCEPTED", fulfillmentType: "IN_STORE", scheduledForISO: minutesFromNow(30), ...over }) as Parameters<typeof isLiveOrder>[0];

describe("isLiveOrder", () => {
  it("keeps a slot booking live until its time passes", () => {
    expect(isLiveOrder(order({ scheduledForISO: minutesFromNow(30) }), NOW)).toBe(true);
    expect(isLiveOrder(order({ scheduledForISO: minutesFromNow(-1) }), NOW)).toBe(false);
  });

  it("keeps an accepted delivery order live however late it runs — the reported bug", () => {
    expect(isLiveOrder(order({ fulfillmentType: "DELIVERY", scheduledForISO: minutesFromNow(-9) }), NOW)).toBe(true);
    expect(isLiveOrder(order({ fulfillmentType: "DELIVERY", scheduledForISO: minutesFromNow(-600) }), NOW)).toBe(true);
    expect(isLiveOrder(order({ fulfillmentType: "DELIVERY", status: "PENDING", scheduledForISO: minutesFromNow(-3) }), NOW)).toBe(true);
  });

  it("never lists a finished or cancelled order, delivery or not", () => {
    for (const status of ["COMPLETED", "CANCELLED", "REJECTED", "NO_SHOW"] as const) {
      expect(isLiveOrder(order({ status, fulfillmentType: "DELIVERY" }), NOW), status).toBe(false);
      expect(isLiveOrder(order({ status }), NOW), status).toBe(false);
    }
  });
});

describe("isRecentlyDelivered", () => {
  const delivered = (over: Record<string, unknown> = {}) =>
    ({ status: "COMPLETED", fulfillmentType: "DELIVERY", createdAtISO: minutesFromNow(-30), ...over }) as Parameters<typeof isRecentlyDelivered>[0];

  it("keeps a delivery handed over in the last few hours on the customer's list, so they see Delivered", () => {
    expect(isRecentlyDelivered(delivered(), NOW)).toBe(true);
    expect(isRecentlyDelivered(delivered({ createdAtISO: minutesFromNow(-170) }), NOW)).toBe(true);
  });

  it("lets it go once it is old, and never applies to a slot booking or an order that is not finished", () => {
    expect(isRecentlyDelivered(delivered({ createdAtISO: minutesFromNow(-200) }), NOW)).toBe(false);
    expect(isRecentlyDelivered(delivered({ fulfillmentType: "IN_STORE" }), NOW)).toBe(false);
    expect(isRecentlyDelivered(delivered({ status: "ACCEPTED" }), NOW)).toBe(false);
    expect(isRecentlyDelivered(delivered({ status: "CANCELLED" }), NOW)).toBe(false);
  });
});

describe("myDealsOrderUrl", () => {
  it("routes active orders to Store Orders → Active with orderId", () => {
    expect(
      myDealsOrderUrl(
        { id: "ord-1", status: "ACCEPTED", fulfillmentType: "DELIVERY", scheduledForISO: minutesFromNow(10) },
        NOW,
      ),
    ).toBe("/agreements?section=orders&tab=active&orderId=ord-1");
  });

  it("routes completed or cancelled orders to Store Orders → History with orderId", () => {
    expect(
      myDealsOrderUrl(
        { id: "ord-2", status: "COMPLETED", fulfillmentType: "DELIVERY", scheduledForISO: minutesFromNow(-60) },
        NOW,
      ),
    ).toBe("/agreements?section=orders&tab=completed&orderId=ord-2");
    expect(
      myDealsOrderUrl(
        { id: "ord-3", status: "CANCELLED", fulfillmentType: "IN_STORE", scheduledForISO: minutesFromNow(-60) },
        NOW,
      ),
    ).toBe("/agreements?section=orders&tab=completed&orderId=ord-3");
  });
});
