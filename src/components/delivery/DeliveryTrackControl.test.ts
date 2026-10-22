import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CustomerDeliveryProgress } from "@/services/engagement/deliveryService";

// Rendered on the server with the hooks stubbed — checks what the customer is told at each stage of an order.
const mocks = vi.hoisted(() => ({ progress: null as null | Partial<CustomerDeliveryProgress> }));

vi.mock("@/store", () => ({ useApp: () => ({ showToast: vi.fn() }) }));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({ t: (k: string) => k, tf: (k: string, v?: Record<string, unknown>) => `${k}:${JSON.stringify(v ?? {})}` }),
}));
vi.mock("@/hooks/useApi", () => ({ useQuery: () => ({ data: mocks.progress, refetch: vi.fn() }) }));
vi.mock("@/services", () => ({ deliveryService: { myProgress: vi.fn(), createTrackingToken: vi.fn(), readyForRedelivery: vi.fn() } }));
vi.mock("@/components/common", () => ({ SafeImg: () => null }));

import DeliveryTrackControl from "./DeliveryTrackControl";

const render = (props: Partial<Parameters<typeof DeliveryTrackControl>[0]> = {}) =>
  renderToStaticMarkup(createElement(DeliveryTrackControl, { appointmentId: "apt_1", ...props }));

beforeEach(() => { mocks.progress = null; });

describe("DeliveryTrackControl before a rider exists", () => {
  it("tells the customer the shop hasn't accepted yet", () => {
    expect(render({ orderStatus: "PENDING" })).toContain("dlv_trk_waiting_shop");
  });

  it("says the shop is getting it ready once accepted — even if no ETA was typed (it used to show nothing)", () => {
    expect(render({ orderStatus: "ACCEPTED", fallbackEtaText: null })).toContain("dlv_trk_preparing");
  });

  it("shows the owner's ETA next to it when there is one", () => {
    const html = render({ orderStatus: "ACCEPTED", fallbackEtaText: "30 min" });
    expect(html).toContain("dlv_trk_preparing");
    expect(html).toContain("30 min");
  });

  it("says packed once the shop has packed it, and that a partner is being arranged", () => {
    expect(render({ orderStatus: "ACCEPTED", readyAt: "2026-10-22T12:00:00Z" })).toContain("dlv_trk_packed_waiting");
  });

  it("draws the seven-step progress line", () => {
    expect((render({ orderStatus: "ACCEPTED" }).match(/border-radius:50%/g) ?? []).length).toBe(7);
  });

  it("shows nothing for an order that was cancelled or finished without a delivery", () => {
    expect(render({ orderStatus: "CANCELLED" })).toBe("");
    expect(render({ orderStatus: "REJECTED" })).toBe("");
  });
});

describe("DeliveryTrackControl once a rider is involved", () => {
  const delivery = (over: Partial<CustomerDeliveryProgress>) => ({
    id: "del_1", status: "ASSIGNED", liveStatus: null, handoffCode: "123456", handoffVerified: false, agentName: null, agentPhone: null,
    agentAvatar: null, agentRevealed: false, etaText: null, stopsBefore: null, ...over,
  }) as Partial<CustomerDeliveryProgress>;

  it("keeps the whole-order progress and labels the picked-up stage", () => {
    mocks.progress = delivery({ pickedUp: true });
    const html = render({ orderStatus: "ACCEPTED", readyAt: "x" });
    expect(html).toContain("dlv_trk_picked_up");
    expect((html.match(/border-radius:50%/g) ?? []).length).toBe(7);
  });

  it("shows the code only while the rider is on the way", () => {
    mocks.progress = delivery({ status: "ASSIGNED" });
    expect(render({ orderStatus: "ACCEPTED", readyAt: "x" })).not.toContain("123456");
    mocks.progress = delivery({ status: "EN_ROUTE", agentRevealed: true, agentName: "Suresh" });
    expect(render({ orderStatus: "ACCEPTED", readyAt: "x" })).toContain("123456");
  });

  it("a delivery cancelled by the rider still reads as cancelled, with a way to ask for another attempt", () => {
    mocks.progress = delivery({ status: "CANCELLED", cancelReason: "CUSTOMER_UNAVAILABLE" });
    const html = render({ orderStatus: "ACCEPTED", readyAt: "x" });
    expect(html).toContain("dlv_trk_cancelled");
    expect(html).toContain("dlv_trk_ready_now");
  });
});
