import { describe, expect, it } from "vitest";
import { ORDER_STAGES } from "./deliveryStage";
import { etaDisplay, journeyFraction, milestoneIndex, ownerNextStepKey, stageCopy, MILESTONES } from "./orderJourney";

describe("milestoneIndex", () => {
  it("folds the seven stages into five milestones, in order", () => {
    expect(ORDER_STAGES.map((_, i) => milestoneIndex(i))).toEqual([0, 1, 1, 2, 2, 3, 4]);
    expect(MILESTONES).toHaveLength(5);
  });

  it("is -1 for an order that ended without being delivered", () => {
    expect(milestoneIndex(-1)).toBe(-1);
  });
});

describe("stageCopy", () => {
  it("has words and a picture for every stage, and a distinct 'rider is here' state", () => {
    for (const stage of ORDER_STAGES) {
      const c = stageCopy(stage);
      expect(c.emoji).toBeTruthy();
      expect(c.headlineKey).toMatch(/^trk_h_/);
      expect(c.subKey).toMatch(/^trk_s_/);
    }
    expect(stageCopy("on_the_way", true).headlineKey).toBe("trk_h_arrived");
    expect(stageCopy("on_the_way", false).headlineKey).toBe("trk_h_on_the_way");
  });
});

describe("journeyFraction", () => {
  it("only ever moves forward through the stages before the rider sets off", () => {
    const f = (["placed", "accepted", "packed", "assigned", "picked_up", "on_the_way", "delivered"] as const).map((s) => journeyFraction(s, false, null, null));
    expect([...f].sort((a, b) => a - b)).toEqual(f);
    expect(f[0]).toBeLessThan(0.1);
    expect(f[6]).toBe(1);
  });

  it("glides closer as the minutes fall while on the way, and stays inside the strip", () => {
    const start = 20;
    const at = (eta: number) => journeyFraction("on_the_way", false, eta, start);
    expect(at(20)).toBeLessThan(at(10));
    expect(at(10)).toBeLessThan(at(2));
    expect(at(0)).toBeLessThanOrEqual(0.94);
    expect(at(40)).toBeGreaterThanOrEqual(0.38);
    expect(journeyFraction("on_the_way", true, 0, start)).toBe(0.96);
  });

  it("uses a sensible midpoint when the server has no minutes yet", () => {
    expect(journeyFraction("on_the_way", false, null, null)).toBe(0.5);
    expect(journeyFraction("on_the_way", false, 5, 0)).toBe(0.5);
  });
});

describe("etaDisplay", () => {
  it("says arriving now under a minute, whole minutes otherwise, nothing without a number", () => {
    expect(etaDisplay(0.4)).toEqual({ kind: "now" });
    expect(etaDisplay(7.6)).toEqual({ kind: "min", n: 8 });
    expect(etaDisplay(null)).toBeNull();
    expect(etaDisplay(undefined)).toBeNull();
    expect(etaDisplay(Number.NaN)).toBeNull();
  });
});

describe("ownerNextStepKey", () => {
  const apt = (status: "PENDING" | "ACCEPTED" | "COMPLETED" | "CANCELLED", readyAt: string | null = null) => ({ status, readyAt });

  it("tells the shop what to do at each point: accept, pack, send a rider", () => {
    expect(ownerNextStepKey(apt("PENDING"), null)).toBe("own_hint_new");
    expect(ownerNextStepKey(apt("ACCEPTED"), null)).toBe("own_hint_pack");
    expect(ownerNextStepKey(apt("ACCEPTED", "2026-10-22T10:00:00Z"), null)).toBe("own_hint_assign");
  });

  it("follows the rider once there is one", () => {
    const packed = apt("ACCEPTED", "x");
    expect(ownerNextStepKey(packed, { status: "ASSIGNED" })).toBe("own_hint_assigned");
    expect(ownerNextStepKey(packed, { status: "EN_ROUTE" })).toBe("own_hint_en_route");
    expect(ownerNextStepKey(packed, { status: "ARRIVED" })).toBe("own_hint_arrived");
  });

  it("sends the shop back to assigning when the last attempt was cancelled", () => {
    expect(ownerNextStepKey(apt("ACCEPTED", "x"), { status: "CANCELLED" })).toBe("own_hint_assign");
  });

  it("says delivered when it is, and nothing for an order that ended another way", () => {
    expect(ownerNextStepKey(apt("COMPLETED"), null)).toBe("own_hint_done");
    expect(ownerNextStepKey(apt("ACCEPTED", "x"), { status: "DELIVERED" })).toBe("own_hint_done");
    expect(ownerNextStepKey(apt("CANCELLED"), null)).toBeNull();
  });
});
