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

const count = (html: string, needle: string) => html.split(needle).length - 1;
// A step is class="trk-step", "trk-step done" or "trk-step now"; the strip around them is class="trk-steps" and must not be counted.
const steps = (html: string) => (html.match(/class="trk-step(?: [^"]*)?"/g) ?? []).length;

beforeEach(() => { mocks.progress = null; });

describe("DeliveryTrackControl before a rider exists", () => {
  it("tells the customer the shop hasn't accepted yet", () => {
    expect(render({ orderStatus: "PENDING" })).toContain("trk_h_placed");
  });

  it("says the shop is getting it ready once accepted — even if no ETA was typed (it used to show nothing)", () => {
    const html = render({ orderStatus: "ACCEPTED", fallbackEtaText: null });
    expect(html).toContain("trk_h_accepted");
    expect(html).not.toContain("trk_eta_promised");
  });

  it("shows the shop's promised time beside it when there is one", () => {
    const html = render({ orderStatus: "ACCEPTED", fallbackEtaText: "30 min" });
    expect(html).toContain("trk_h_accepted");
    expect(html).toContain("trk_eta_promised");
    expect(html).toContain("30 min");
  });

  it("says packed once the shop has packed it, and that a partner is being arranged", () => {
    const html = render({ orderStatus: "ACCEPTED", readyAt: "2026-10-22T12:00:00Z" });
    expect(html).toContain("trk_h_packed");
    expect(html).toContain("trk_s_packed");
  });

  it("names the five steps instead of drawing unlabelled dots, ticking the ones done", () => {
    const html = render({ orderStatus: "ACCEPTED" });
    for (const m of ["placed", "packing", "rider", "on_the_way", "delivered"]) expect(html).toContain(`trk_m_${m}`);
    expect(steps(html)).toBe(5);
    expect(count(html, "trk-step done")).toBe(1); // "Sent" is done, "Packing" is where it is
    expect(count(html, "trk-step now")).toBe(1);
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

  it("keeps the whole-order journey and says the rider has the order once picked up", () => {
    mocks.progress = delivery({ pickedUp: true });
    const html = render({ orderStatus: "ACCEPTED", readyAt: "x" });
    expect(html).toContain("trk_h_picked_up");
    expect(steps(html)).toBe(5);
  });

  it("shows the code only while the rider is on the way, one big box per digit", () => {
    mocks.progress = delivery({ status: "ASSIGNED" });
    expect(render({ orderStatus: "ACCEPTED", readyAt: "x" })).not.toContain("trk-code");
    mocks.progress = delivery({ status: "EN_ROUTE", agentRevealed: true, agentName: "Suresh" });
    const html = render({ orderStatus: "ACCEPTED", readyAt: "x" });
    expect(html).toContain("trk-code");
    expect(html).toContain("<b>1</b><b>2</b><b>3</b><b>4</b><b>5</b><b>6</b>");
  });

  it("hides the code once the hand-over is confirmed", () => {
    mocks.progress = delivery({ status: "ARRIVED", handoffVerified: true, agentRevealed: true, agentName: "Suresh" });
    expect(render({ orderStatus: "ACCEPTED", readyAt: "x" })).not.toContain("trk-code");
  });

  it("introduces the rider by name only once they are on the way, never before", () => {
    mocks.progress = delivery({ status: "ASSIGNED", agentName: "Suresh", agentRevealed: false });
    expect(render({ orderStatus: "ACCEPTED", readyAt: "x" })).not.toContain("Suresh");
    mocks.progress = delivery({ status: "EN_ROUTE", agentName: "Suresh", agentRevealed: true });
    expect(render({ orderStatus: "ACCEPTED", readyAt: "x" })).toContain("Suresh");
  });

  it("shows the minutes away as a big number while the rider is on the way, and 'arriving now' under a minute", () => {
    mocks.progress = delivery({ status: "EN_ROUTE", etaMinutes: 11, agentRevealed: true, agentName: "Suresh" });
    const html = render({ orderStatus: "ACCEPTED", readyAt: "x" });
    expect(html).toContain("<b>11</b>");
    expect(html).toContain("trk_eta_min");
    mocks.progress = delivery({ status: "EN_ROUTE", etaMinutes: 0.4, agentRevealed: true, agentName: "Suresh" });
    expect(render({ orderStatus: "ACCEPTED", readyAt: "x" })).toContain("trk_eta_now");
  });

  it("says the rider is here when they arrive", () => {
    mocks.progress = delivery({ status: "ARRIVED", agentRevealed: true, agentName: "Suresh" });
    expect(render({ orderStatus: "ACCEPTED", readyAt: "x" })).toContain("trk_h_arrived");
  });

  it("marks a delivered order delivered, with every step ticked and no rider card or call buttons", () => {
    mocks.progress = delivery({ status: "DELIVERED", agentRevealed: true, agentName: "Suresh" });
    const html = render({ orderStatus: "COMPLETED", readyAt: "x" });
    expect(html).toContain("trk is-done");
    expect(html).toContain("trk_h_delivered");
    expect(count(html, "trk-step done")).toBe(5);
    expect(html).not.toContain("Suresh");
  });

  it("a delivery cancelled by the rider still reads as cancelled, with a way to ask for another attempt", () => {
    mocks.progress = delivery({ status: "CANCELLED", cancelReason: "CUSTOMER_UNAVAILABLE" });
    const html = render({ orderStatus: "ACCEPTED", readyAt: "x" });
    expect(html).toContain("dlv_trk_cancelled");
    expect(html).toContain("dlv_trk_ready_now");
  });
});
