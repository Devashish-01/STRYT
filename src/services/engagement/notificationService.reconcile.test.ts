import { describe, expect, it } from "vitest";
import type { AppNotification } from "@/types";
import { classifyNotificationScope, reconcileBookingActions } from "./notificationService";
import { normalizeAlert } from "@/store/useNotificationBadges";

// A fake of just the one query reconcileBookingActions makes: appointments (id, status) for a list of ids.
function fakeDb(statuses: Record<string, string>) {
  return {
    from: () => ({
      select: () => ({
        in: async (_col: string, ids: string[]) => ({ data: ids.filter((i) => i in statuses).map((id) => ({ id, status: statuses[id] })), error: null }),
      }),
    }),
  } as never;
}

const delivery = (over: Partial<AppNotification["metadata"]> = {}, type: AppNotification["type"] = "DELIVERY"): AppNotification => ({
  id: "n1", type, title: "Courier has arrived!", body: "Your delivery agent is outside. Share OTP 389886 to receive your order.",
  deepLink: "/appointments", isRead: false, time: "1h ago", createdAt: "2026-10-24T10:00:00Z",
  metadata: { appointmentId: "apt_1", handoffCode: "389886", etaText: "On the way", actions: ["TRACK_DELIVERY", "CALL_RIDER"], statusPill: "Arrived", tone: "brand", ...over },
});

describe("reconcileBookingActions — delivery notifications", () => {
  it("once the order is delivered: no code, no buttons, no stale 'on the way', and the card says Delivered", async () => {
    const [n] = await reconcileBookingActions(fakeDb({ apt_1: "COMPLETED" }), [delivery()]);
    expect(n.metadata?.handoffCode).toBeUndefined();
    expect(n.metadata?.actions).toEqual([]);
    expect(n.metadata?.etaText).toBeUndefined();
    expect(n.metadata?.statusPill).toBe("Delivered");
    expect(n.metadata?.tone).toBe("success");
  });

  it("the one-time code is also removed from the message text, wherever it appears", async () => {
    const [n] = await reconcileBookingActions(fakeDb({ apt_1: "COMPLETED" }), [delivery()]);
    expect(n.body).not.toContain("389886");
    expect(n.body).toContain("••••••");
  });

  it("says Cancelled for an order that was cancelled", async () => {
    const [n] = await reconcileBookingActions(fakeDb({ apt_1: "CANCELLED" }), [delivery()]);
    expect(n.metadata?.statusPill).toBe("Cancelled");
    expect(n.metadata?.tone).toBe("danger");
    expect(n.metadata?.actions).toEqual([]);
  });

  it("leaves a live order exactly as it was — the code and the buttons are still needed", async () => {
    const original = delivery();
    const [n] = await reconcileBookingActions(fakeDb({ apt_1: "ACCEPTED" }), [original]);
    expect(n).toEqual(original);
  });

  it("leaves it alone when the order cannot be read (fails safe)", async () => {
    const original = delivery();
    const [n] = await reconcileBookingActions(fakeDb({}), [original]);
    expect(n).toEqual(original);
  });

  it("does not touch a notification of another type that happens to carry an appointment id", async () => {
    const original = delivery({ actions: ["TRACK_DELIVERY"] }, "SYSTEM");
    const [n] = await reconcileBookingActions(fakeDb({ apt_1: "COMPLETED" }), [original]);
    expect(n).toEqual(original);
  });
});

describe("reconcileBookingActions — booking requests (unchanged behaviour)", () => {
  it("a handled booking request loses Accept/Decline and shows its outcome", async () => {
    const booking = delivery({ actions: ["ACCEPT", "DECLINE"], handoffCode: undefined, statusPill: "New", tone: "brand" }, "APPOINTMENT");
    const [n] = await reconcileBookingActions(fakeDb({ apt_1: "ACCEPTED" }), [booking]);
    expect(n.metadata?.actions).toEqual([]);
    expect(n.metadata?.statusPill).toBe("Confirmed");
  });
});

describe("classifyNotificationScope — zero skipped Personal, Business, Provider, or Delivery alerts", () => {
  it("treats /delivery notifications stamped as PROVIDER as DELIVERY so rider notifications are never dropped", () => {
    expect(
      classifyNotificationScope({
        type: "DELIVERY",
        deep_link: "/delivery",
        entity_type: "PROVIDER",
        entity_id: "u_rider_1",
      }),
    ).toEqual({ scope: "DELIVERY" });
  });

  it("treats customer-facing discovery/offer broadcasts stamped with BUSINESS/PROVIDER/PLACE as CUSTOMER", () => {
    expect(
      classifyNotificationScope({ type: "OFFER", deep_link: "/business/b1", entity_type: "BUSINESS", entity_id: "b1" }),
    ).toEqual({ scope: "CUSTOMER" });
    expect(
      classifyNotificationScope({ type: "NEW_BUSINESS", deep_link: "/business/b1", entity_type: "BUSINESS", entity_id: "b1" }),
    ).toEqual({ scope: "CUSTOMER" });
    expect(
      classifyNotificationScope({ type: "NEW_PROVIDER", deep_link: "/provider/p1", entity_type: "PROVIDER", entity_id: "p1" }),
    ).toEqual({ scope: "CUSTOMER" });
    expect(
      classifyNotificationScope({ type: "NEW_PLACE", deep_link: "/place/pl1", entity_type: "PLACE", entity_id: "pl1" }),
    ).toEqual({ scope: "CUSTOMER" });
  });

  it("routes BUSINESS, PROVIDER, and legacy bulk_deal rows to their owning console scopes", () => {
    expect(
      classifyNotificationScope({ type: "APPOINTMENT", deep_link: "/business/b1/manage/appointments", entity_type: "BUSINESS", entity_id: "b1" }),
    ).toEqual({ scope: "BUSINESS", id: "b1" });
    expect(
      classifyNotificationScope({ type: "APPOINTMENT", deep_link: "/provider/p1/manage/jobs", entity_type: "PROVIDER", entity_id: "p1" }),
    ).toEqual({ scope: "PROVIDER", id: "p1" });
    expect(
      classifyNotificationScope({
        type: "BULK_DEAL_PLEDGE",
        deep_link: "/deals/d1",
        entity_type: "bulk_deal",
        entity_id: "d1",
        metadata: { businessId: "b1" },
      }),
    ).toEqual({ scope: "BUSINESS", id: "b1" });
  });
});

describe("normalizeAlert — live realtime and foreground push banner normalization", () => {
  it("extracts Personal, Business, Provider, and Delivery scopes for live foreground banners", () => {
    expect(
      normalizeAlert({
        id: "n_biz",
        title: "New booking request",
        body: "Dev placed an order",
        deep_link: "/business/b1/manage/appointments",
        type: "APPOINTMENT",
        entity_type: "BUSINESS",
        entity_id: "b1",
      }),
    ).toMatchObject({ id: "n_biz", scope: "BUSINESS", entityId: "b1", deepLink: "/business/b1/manage/appointments" });

    expect(
      normalizeAlert({
        id: "n_dlv",
        title: "New delivery assigned",
        body: "Sharma General Store assigned you a delivery",
        url: "/delivery",
        type: "DELIVERY",
      }),
    ).toMatchObject({ id: "n_dlv", scope: "DELIVERY", deepLink: "/delivery" });

    expect(normalizeAlert({ title: "", body: "" })).toBeNull();
  });
});
