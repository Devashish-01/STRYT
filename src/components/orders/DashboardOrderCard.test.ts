import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import en from "@/lib/i18n/en";
import type { AppointmentRecord } from "@/types";
import type { AppointmentDelivery } from "@/services/engagement/deliveryService";

vi.mock("@/store", () => ({
  useApp: () => ({ dataSaver: false }),
}));

vi.mock("@/lib/features", () => ({
  DELIVERY_AGENT_ENABLED: true,
}));

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    lang: "en",
    t: (key: string, fallback?: string) => en[key] ?? fallback ?? key,
    tf: (key: string, params: Record<string, string | number>) => {
      let s = en[key] ?? key;
      for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
      return s;
    },
  }),
}));

vi.mock("@/components/delivery/DeliveryAssignControl", () => ({
  default: ({ packed }: { packed: boolean }) =>
    createElement("div", null, packed ? "ASSIGN_CONTROL_PACKED" : "ASSIGN_CONTROL_UNPACKED"),
}));

import DashboardOrderCard from "./DashboardOrderCard";

function makeOrder(over: Partial<AppointmentRecord> = {}): AppointmentRecord {
  return {
    id: "ord-1",
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
    deliveryAddressLine: "Amanora Park Town",
    packagePrice: 145,
    notes: "Order: Toned Milk 1 L x1, Sandwich Bread x1",
    items: [
      { catalogItemId: "c1", name: "Toned Milk 1 L", price: 70, quantity: 1 },
      { catalogItemId: "c2", name: "Sandwich Bread", price: 45, quantity: 1 },
    ],
    ...over,
  };
}

const baseHandlers = {
  businessId: "biz-1",
  busy: false,
  packing: false,
  onAccept: vi.fn(),
  onAcceptAndPack: vi.fn(),
  onAcceptWithPayment: vi.fn(),
  onDecline: vi.fn(),
  onMarkPacked: vi.fn(),
  onCompletePickup: vi.fn(),
  onPaymentDecision: vi.fn(),
  onOpenLiveBoard: vi.fn(),
  onOpenSelfRun: vi.fn(),
  onOpenDetails: vi.fn(),
  onDeliveryChanged: vi.fn(),
};

describe("DashboardOrderCard", () => {
  it("shows unified Accept & Confirm payment action without echoing auto-generated Order note", () => {
    const html = renderToStaticMarkup(
      createElement(DashboardOrderCard, {
        ...baseHandlers,
        item: makeOrder({ status: "PENDING", paymentStatus: "PENDING_CONFIRM", paymentAmount: 145, paymentMethod: "UPI" }),
      }),
    );

    expect(html).toContain("New order");
    expect(html).toContain("Accept &amp; Confirm");
    expect(html).toContain("Payment claimed:");
    expect(html).not.toContain("📝 Order:");
  });

  it("moves accepted orders directly to Step 1 · Pack while keeping inline payment confirm buttons", () => {
    const html = renderToStaticMarkup(
      createElement(DashboardOrderCard, {
        ...baseHandlers,
        item: makeOrder({ status: "ACCEPTED", readyAt: null, paymentStatus: "PENDING_CONFIRM", paymentAmount: 145 }),
      }),
    );

    expect(html).toContain("Step 1 · Pack");
    expect(html).toContain("Mark packed");
    expect(html).toContain("Confirm");
    expect(html).toContain("Reject");
  });

  it("shows Open my run when the owner assigned the delivery to themselves", () => {
    const preloadedDelivery: AppointmentDelivery = {
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
    };
    const html = renderToStaticMarkup(
      createElement(DashboardOrderCard, {
        ...baseHandlers,
        currentUserId: "owner-1",
        preloadedDelivery,
        item: makeOrder({ status: "ACCEPTED", readyAt: "2026-11-26T10:05:00Z" }),
      }),
    );

    expect(html).toContain("Out for delivery");
    expect(html).toContain("Open my run");
    expect(html).toContain("ASSIGN_CONTROL_PACKED");
  });

  it("offers Complete handover directly on Dashboard for packed store pickup orders", () => {
    const html = renderToStaticMarkup(
      createElement(DashboardOrderCard, {
        ...baseHandlers,
        item: makeOrder({ status: "ACCEPTED", fulfillmentType: "IN_STORE", readyAt: "2026-11-26T10:05:00Z", notes: "Extra bag please" }),
      }),
    );

    expect(html).toContain("Ready for pickup");
    expect(html).toContain("Complete handover");
    expect(html).toContain("📝 Extra bag please");
  });
});
