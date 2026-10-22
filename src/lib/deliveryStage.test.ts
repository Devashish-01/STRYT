import { describe, expect, it } from "vitest";
import { ORDER_STAGES, orderStageIndex, stageLineKey } from "./deliveryStage";

const stage = (i: number) => (i < 0 ? "none" : ORDER_STAGES[i]);

describe("orderStageIndex", () => {
  it("starts at placed while the shop hasn't answered", () => {
    expect(stage(orderStageIndex({ status: "PENDING" }, null))).toBe("placed");
  });

  it("walks accepted → packed → assigned → picked up → on the way → delivered", () => {
    expect(stage(orderStageIndex({ status: "ACCEPTED" }, null))).toBe("accepted");
    expect(stage(orderStageIndex({ status: "ACCEPTED", readyAt: "2026-10-22T12:00:00Z" }, null))).toBe("packed");
    expect(stage(orderStageIndex({ status: "ACCEPTED", readyAt: "x" }, { status: "ASSIGNED" }))).toBe("assigned");
    expect(stage(orderStageIndex({ status: "ACCEPTED", readyAt: "x" }, { status: "ASSIGNED", pickedUp: true }))).toBe("picked_up");
    expect(stage(orderStageIndex({ status: "ACCEPTED", readyAt: "x" }, { status: "EN_ROUTE" }))).toBe("on_the_way");
    expect(stage(orderStageIndex({ status: "ACCEPTED", readyAt: "x" }, { status: "ARRIVED" }))).toBe("on_the_way");
    expect(stage(orderStageIndex({ status: "ACCEPTED", readyAt: "x" }, { status: "DELIVERED" }))).toBe("delivered");
    expect(stage(orderStageIndex({ status: "COMPLETED" }, null))).toBe("delivered");
  });

  it("a rider can be assigned before the shop has packed — the line shows the furthest thing that has happened", () => {
    expect(stage(orderStageIndex({ status: "ACCEPTED" }, { status: "ASSIGNED" }))).toBe("assigned");
  });

  it("a failed delivery attempt leaves the order where the shop left it", () => {
    expect(stage(orderStageIndex({ status: "ACCEPTED", readyAt: "x" }, { status: "CANCELLED" }))).toBe("packed");
    expect(stage(orderStageIndex({ status: "ACCEPTED" }, { status: "CANCELLED" }))).toBe("accepted");
  });

  it("is over (-1) for an order that ended without being delivered", () => {
    for (const status of ["CANCELLED", "REJECTED", "NO_SHOW"] as const) expect(orderStageIndex({ status }, null), status).toBe(-1);
  });
});

describe("stageLineKey", () => {
  it("has a customer sentence for each stage before a rider is involved", () => {
    expect(stageLineKey("placed")).toBe("dlv_trk_waiting_shop");
    expect(stageLineKey("accepted")).toBe("dlv_trk_preparing");
    expect(stageLineKey("packed")).toBe("dlv_trk_packed_waiting");
  });
});
