import { describe, expect, it } from "vitest";
import { isLiveOrder } from "./orderLists";

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
