import { describe, expect, it } from "vitest";
import type { AppointmentRecord } from "@/types";
import { claimContextKey, isFulfillmentOrder, partitionDashboardWork, resolveOrderStage } from "./dashboardOrders";

const baseApt = (over: Partial<AppointmentRecord> = {}): AppointmentRecord => ({
  id: "apt-1",
  targetId: "biz-1",
  targetType: "BUSINESS",
  targetName: "Sharma General Store",
  customerId: "cust-1",
  customerName: "Dev",
  dateLabel: "Today",
  timeLabel: "ASAP",
  scheduledForISO: "2026-11-26T10:30:00Z",
  createdAtISO: "2026-11-26T10:00:00Z",
  status: "PENDING",
  fulfillmentType: "DELIVERY",
  items: [{ catalogItemId: "ci-1", name: "Toned Milk 1 L", price: 70, quantity: 1 }],
  ...over,
});

describe("partitionDashboardWork", () => {
  it("keeps pending and accepted fulfillment orders in Orders Right Now and suppresses duplicate claims", () => {
    const pendingOrder = baseApt({ id: "ord-new", status: "PENDING", paymentStatus: "PENDING_CONFIRM" });
    const acceptedOrder = baseApt({ id: "ord-acc", status: "ACCEPTED", paymentStatus: "PENDING_CONFIRM", readyAt: null });
    const pureBooking = baseApt({ id: "bk-1", status: "PENDING", fulfillmentType: undefined, items: undefined });
    const completedOrderClaim = baseApt({ id: "ord-old", status: "COMPLETED", paymentStatus: "PENDING_CONFIRM" });

    const { ordersRightNow, pendingBookings, standaloneAppointmentClaims } = partitionDashboardWork(
      [acceptedOrder, pendingOrder, pureBooking, completedOrderClaim],
      [pendingOrder, acceptedOrder, completedOrderClaim],
    );

    expect(ordersRightNow.map((o) => o.id)).toEqual(["ord-new", "ord-acc"]);
    expect(pendingBookings.map((b) => b.id)).toEqual(["bk-1"]);
    expect(standaloneAppointmentClaims.map((c) => c.id)).toEqual(["ord-old"]);
  });

  it("identifies non-delivery store pickup orders as fulfillment orders when items are present", () => {
    expect(isFulfillmentOrder(baseApt({ fulfillmentType: "IN_STORE" }))).toBe(true);
    expect(isFulfillmentOrder(baseApt({ fulfillmentType: undefined, items: undefined }))).toBe(false);
  });
});

describe("resolveOrderStage", () => {
  it("tracks NEW -> PACK -> ASSIGN_RIDER -> OUT_FOR_DELIVERY (and self-rider flag)", () => {
    expect(resolveOrderStage({ status: "PENDING", fulfillmentType: "DELIVERY", readyAt: null }).stage).toBe("NEW");
    expect(resolveOrderStage({ status: "ACCEPTED", fulfillmentType: "DELIVERY", readyAt: null }).stage).toBe("PACK");
    expect(resolveOrderStage({ status: "ACCEPTED", fulfillmentType: "DELIVERY", readyAt: "2026-11-26T10:05:00Z" }, null).stage).toBe("ASSIGN_RIDER");

    const out = resolveOrderStage(
      { status: "ACCEPTED", fulfillmentType: "DELIVERY", readyAt: "2026-11-26T10:05:00Z" },
      {
        id: "dlv-1",
        appointmentId: "ord-1",
        status: "ASSIGNED",
        liveStatus: null,
        handoffCode: "1234",
        handoffVerified: false,
        agentUserId: "owner-1",
        agentName: "Rajesh",
        lat: null,
        lng: null,
      },
      "owner-1",
    );
    expect(out).toEqual({ stage: "OUT_FOR_DELIVERY", isSelfRider: true });
  });

  it("handles cancelled previous riders by returning to ASSIGN_RIDER, and pickup orders by going to READY_PICKUP", () => {
    const afterCancel = resolveOrderStage(
      { status: "ACCEPTED", fulfillmentType: "DELIVERY", readyAt: "2026-11-26T10:05:00Z" },
      {
        id: "dlv-1",
        appointmentId: "ord-1",
        status: "CANCELLED",
        liveStatus: null,
        handoffCode: null,
        handoffVerified: false,
        agentUserId: "rider-2",
        agentName: "Suresh",
        lat: null,
        lng: null,
      },
    );
    expect(afterCancel.stage).toBe("ASSIGN_RIDER");
    expect(resolveOrderStage({ status: "ACCEPTED", fulfillmentType: "IN_STORE", readyAt: "2026-11-26T10:05:00Z" }).stage).toBe("READY_PICKUP");
  });
});

describe("claimContextKey", () => {
  it("picks delivery, store order, or appointment payment key", () => {
    expect(claimContextKey({ fulfillmentType: "DELIVERY", items: undefined })).toBe("mdash_claim_delivery");
    expect(claimContextKey({ fulfillmentType: "IN_STORE", items: [{ catalogItemId: "1", name: "Tea", price: 20, quantity: 1 }] })).toBe("mdash_claim_order");
    expect(claimContextKey({ fulfillmentType: undefined, items: undefined })).toBe("mdash_claim_appointment");
  });
});
