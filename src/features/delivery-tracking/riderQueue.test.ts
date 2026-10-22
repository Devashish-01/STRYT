import { beforeEach, describe, expect, it, vi } from "vitest";

const svc = vi.hoisted(() => ({
  markPickedUp: vi.fn(),
  updateStatus: vi.fn(),
  collectCash: vi.fn(),
}));
vi.mock("@/services/engagement/deliveryService", () => ({ deliveryService: svc }));

import { resetRiderQueuesForTests, riderQueue } from "./riderQueue";

beforeEach(() => {
  resetRiderQueuesForTests();
  Object.values(svc).forEach((f) => f.mockReset().mockResolvedValue(undefined));
});

describe("the rider's outbox", () => {
  it("replays each kind of tap to the call it stands for, in the order it was made", async () => {
    const q = riderQueue("rider_a");
    q.enqueue("pickup", "d1");
    q.enqueue("status", "d1", { next: "ON_THE_WAY", lat: 18.5, lng: 73.9 });
    q.enqueue("status", "d1", { next: "ARRIVED" });
    q.enqueue("cash", "d1");
    const order: string[] = [];
    svc.markPickedUp.mockImplementation(async () => { order.push("pickup"); });
    svc.updateStatus.mockImplementation(async (_id: string, next: string) => { order.push(next); });
    svc.collectCash.mockImplementation(async () => { order.push("cash"); });

    const r = await q.flush();
    expect(r.sent).toBe(4);
    expect(order).toEqual(["pickup", "ON_THE_WAY", "ARRIVED", "cash"]);
    expect(svc.markPickedUp).toHaveBeenCalledWith("d1");
    expect(svc.updateStatus).toHaveBeenCalledWith("d1", "ON_THE_WAY", 18.5, 73.9);
    expect(svc.updateStatus).toHaveBeenCalledWith("d1", "ARRIVED", undefined, undefined);
    expect(svc.collectCash).toHaveBeenCalledWith("d1");
  });

  it("is one queue per rider", () => {
    expect(riderQueue("rider_a")).toBe(riderQueue("rider_a"));
    riderQueue("rider_a").enqueue("pickup", "d1");
    expect(riderQueue("rider_b").list()).toEqual([]);
  });

  it("keeps everything for the next try when the network is still down", async () => {
    svc.markPickedUp.mockRejectedValue(new Error("Failed to fetch"));
    const q = riderQueue("rider_a");
    q.enqueue("pickup", "d1");
    q.enqueue("status", "d1", { next: "ON_THE_WAY" });
    const r = await q.flush();
    expect(r.stalled).toBe(true);
    expect(q.list()).toHaveLength(2);
    expect(svc.updateStatus).not.toHaveBeenCalled();
  });

  it("counts a repeated cash collection ('already paid') as done, not as a failure", async () => {
    svc.collectCash.mockRejectedValue(new Error("ALREADY_PAID"));
    const q = riderQueue("rider_a");
    q.enqueue("cash", "d1");
    const r = await q.flush();
    expect(r).toMatchObject({ already: 1, failed: [] });
  });

  it("does not queue handoff verification — the server has to answer it", async () => {
    const src = (await import("node:fs")).readFileSync("src/features/delivery-tracking/riderQueue.ts", "utf8");
    expect(src).not.toMatch(/confirmHandoff|updatePosition|updateBatchPosition/);
  });
});
