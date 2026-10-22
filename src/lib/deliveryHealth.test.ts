import { describe, expect, it } from "vitest";
import { cancelReasonKey, deliveryHealth } from "./deliveryHealth";

const NOW = Date.parse("2026-10-19T12:00:00Z");
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const d = (over: Partial<Parameters<typeof deliveryHealth>[0]> = {}) => ({
  status: "ASSIGNED" as const, createdAt: ago(1), pickedUpAt: null, startedAt: null, arrivedAt: null, positionAt: null, ...over,
});

describe("deliveryHealth — before the rider leaves", () => {
  it("says nothing for a fresh assignment", () => {
    expect(deliveryHealth(d({ createdAt: ago(3) }), NOW).key).toBeNull();
  });
  it("warns when the order has sat assigned, not picked up, for 10+ minutes", () => {
    const h = deliveryHealth(d({ createdAt: ago(14) }), NOW);
    expect(h).toMatchObject({ tone: "warn", key: "dlv_health_not_picked_up", minutes: 14 });
  });
  it("warns when it is picked up but the rider hasn't set off after 5+ minutes", () => {
    const h = deliveryHealth(d({ createdAt: ago(30), pickedUpAt: ago(7) }), NOW);
    expect(h).toMatchObject({ tone: "warn", key: "dlv_health_not_started", minutes: 7 });
  });
  it("is quiet while a just-picked-up order is still within its grace", () => {
    expect(deliveryHealth(d({ createdAt: ago(30), pickedUpAt: ago(2) }), NOW).key).toBeNull();
  });
});

describe("deliveryHealth — out on the road", () => {
  const out = (over = {}) => d({ status: "EN_ROUTE", startedAt: ago(20), ...over });
  it("is live while the position is under two minutes old", () => {
    expect(deliveryHealth(out({ positionAt: ago(1) }), NOW).key).toBeNull();
  });
  it("warns that the location is getting stale after two minutes", () => {
    expect(deliveryHealth(out({ positionAt: ago(4) }), NOW)).toMatchObject({ tone: "warn", key: "dlv_health_location_stale", minutes: 4 });
  });
  it("calls it lost after ten", () => {
    expect(deliveryHealth(out({ positionAt: ago(12) }), NOW)).toMatchObject({ tone: "bad", key: "dlv_health_location_lost", minutes: 12 });
  });
  it("flags a rider who has been out for a while without ever sharing a position", () => {
    expect(deliveryHealth(out({ positionAt: null, startedAt: ago(5) }), NOW)).toMatchObject({ tone: "bad", key: "dlv_health_no_location" });
  });
  it("gives a rider who just set off a moment before judging the missing position", () => {
    expect(deliveryHealth(out({ positionAt: null, startedAt: ago(1) }), NOW).key).toBeNull();
  });
});

describe("deliveryHealth — at the door and finished", () => {
  it("warns after 20 minutes at the door", () => {
    expect(deliveryHealth(d({ status: "ARRIVED", arrivedAt: ago(25) }), NOW)).toMatchObject({ tone: "warn", key: "dlv_health_at_door", minutes: 25 });
  });
  it("is quiet for a brief stop at the door", () => {
    expect(deliveryHealth(d({ status: "ARRIVED", arrivedAt: ago(4) }), NOW).key).toBeNull();
  });
  it("says nothing about a delivery that is over", () => {
    expect(deliveryHealth(d({ status: "DELIVERED" as never }), NOW).key).toBeNull();
    expect(deliveryHealth(d({ status: "CANCELLED" as never }), NOW).key).toBeNull();
  });
});

describe("cancelReasonKey", () => {
  it("has wording for every reason, including the system's order-cancelled one", () => {
    for (const r of ["CUSTOMER_UNAVAILABLE", "ADDRESS_PROBLEM", "CUSTOMER_REFUSED", "UNSAFE", "AGENT_EMERGENCY", "OTHER", "ORDER_CANCELLED"] as const) {
      expect(cancelReasonKey(r), r).toMatch(/^dlv_cancel_/);
    }
    expect(cancelReasonKey(null)).toBeNull();
  });
});
