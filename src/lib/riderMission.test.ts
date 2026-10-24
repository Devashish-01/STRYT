import { describe, expect, it } from "vitest";
import { deliveredToday, riderMission, MISSION_STEPS, type MissionInput } from "./riderMission";

const base: MissionInput = { status: "ASSIGNED", pickedUpAt: null, handoffVerified: false, amountDue: 0, cashCollectedAt: null, orderReadyAt: "2026-10-22T10:00:00Z", isOwnerDelivery: false };
const m = (over: Partial<MissionInput>) => riderMission({ ...base, ...over });

describe("riderMission", () => {
  it("walks the whole delivery, one clear instruction at a time", () => {
    expect(m({}).headlineKey).toBe("dlv_m_pickup");
    expect(m({ pickedUpAt: "2026-10-22T10:05:00Z" }).headlineKey).toBe("dlv_m_start");
    expect(m({ pickedUpAt: "x", status: "EN_ROUTE" }).headlineKey).toBe("dlv_m_deliver");
    expect(m({ pickedUpAt: "x", status: "ARRIVED" }).headlineKey).toBe("dlv_m_code");
    expect(m({ pickedUpAt: "x", status: "ARRIVED", handoffVerified: true }).headlineKey).toBe("dlv_m_handover");
    expect(m({ pickedUpAt: "x", status: "ARRIVED", handoffVerified: true, amountDue: 235 }).headlineKey).toBe("dlv_m_cash");
    expect(m({ status: "DELIVERED" }).headlineKey).toBe("dlv_m_done");
  });

  it("moves through the four labelled steps in order", () => {
    const steps = [
      m({}).step,
      m({ pickedUpAt: "x" }).step,
      m({ pickedUpAt: "x", status: "EN_ROUTE" }).step,
      m({ pickedUpAt: "x", status: "ARRIVED" }).step,
      m({ pickedUpAt: "x", status: "ARRIVED", handoffVerified: true }).step,
      m({ status: "DELIVERED" }).step,
    ];
    expect(steps).toEqual([0, 1, 1, 2, 3, MISSION_STEPS.length]);
  });

  it("says plainly when the shop has not packed yet, and not for a shop owner delivering their own order", () => {
    expect(m({ orderReadyAt: null }).waiting).toBe(true);
    expect(m({ orderReadyAt: null }).headlineKey).toBe("dlv_m_wait_pack");
    expect(m({ orderReadyAt: null, isOwnerDelivery: true }).waiting).toBe(false);
    // an older database without the column must not hold the rider back
    expect(m({ orderReadyAt: undefined }).waiting).toBe(false);
  });

  it("stops asking for cash once it is collected", () => {
    const arrived = { pickedUpAt: "x", status: "ARRIVED" as const, handoffVerified: true, amountDue: 235 };
    expect(m({ ...arrived, cashCollectedAt: "2026-10-22T11:00:00Z" }).headlineKey).toBe("dlv_m_handover");
  });
});

describe("deliveredToday", () => {
  const now = new Date(2026, 9, 22, 15, 0, 0);
  it("counts only deliveries finished since midnight today", () => {
    const items = [
      { status: "DELIVERED" as const, deliveredAt: new Date(2026, 9, 22, 9, 0, 0).toISOString() },
      { status: "DELIVERED" as const, deliveredAt: new Date(2026, 9, 22, 14, 59, 0).toISOString() },
      { status: "DELIVERED" as const, deliveredAt: new Date(2026, 9, 21, 23, 59, 0).toISOString() },
      { status: "CANCELLED" as const, deliveredAt: new Date(2026, 9, 22, 10, 0, 0).toISOString() },
      { status: "DELIVERED" as const, deliveredAt: null },
    ];
    expect(deliveredToday(items, now)).toBe(2);
    expect(deliveredToday([], now)).toBe(0);
  });
});
