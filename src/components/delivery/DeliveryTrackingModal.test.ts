import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CustomerDeliveryProgress } from "@/services/engagement/deliveryService";
import DeliveryTrackingModal from "./DeliveryTrackingModal";

vi.mock("@/store", () => ({ useApp: () => ({ showToast: vi.fn() }) }));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({ t: (k: string) => k, tf: (k: string, v?: Record<string, unknown>) => `${k}:${JSON.stringify(v ?? {})}` }),
}));
vi.mock("@/services/engagement/deliveryService", () => ({
  deliveryService: {
    subscribeLivePosition: vi.fn(() => vi.fn()),
    myProgress: vi.fn(),
    createTrackingToken: vi.fn(),
  },
}));
vi.mock("@/components/common", () => ({ SafeImg: () => null }));
vi.mock("./DeliveryLiveMap", () => ({ default: () => createElement("div", { id: "mock-live-map" }) }));

const sampleProgress: CustomerDeliveryProgress = {
  id: "del_123",
  status: "EN_ROUTE",
  liveStatus: "ON_THE_WAY",
  handoffCode: "456789",
  handoffVerified: false,
  agentName: "Rajesh Kumar",
  agentPhone: "9876543210",
  agentAvatar: null,
  agentRevealed: true,
  etaText: "10 mins",
  stopsBefore: 0,
  etaMinutes: 8,
  pickedUp: true,
  agentLat: 19.076,
  agentLng: 72.877,
  agentHeading: 45,
  storeLat: 19.07,
  storeLng: 72.87,
  storeName: "Test Store",
  destLat: 19.08,
  destLng: 72.88,
  destAddress: "Customer Flat 402",
};

describe("DeliveryTrackingModal", () => {
  it("returns null when isOpen is false", () => {
    const html = renderToStaticMarkup(
      createElement(DeliveryTrackingModal, {
        isOpen: false,
        onClose: vi.fn(),
        appointmentId: "appt_1",
        progress: sampleProgress,
      })
    );
    expect(html).toBe("");
  });

  it("renders live map and rider details when open and en route", () => {
    const html = renderToStaticMarkup(
      createElement(DeliveryTrackingModal, {
        isOpen: true,
        onClose: vi.fn(),
        appointmentId: "appt_1",
        progress: sampleProgress,
      })
    );
    expect(html).toContain("mock-live-map");
    expect(html).toContain("Rajesh Kumar");
    expect(html).toContain("tel:9876543210");
  });

  it("renders the handoff PIN / OTP code card for the customer", () => {
    const html = renderToStaticMarkup(
      createElement(DeliveryTrackingModal, {
        isOpen: true,
        onClose: vi.fn(),
        appointmentId: "appt_1",
        progress: sampleProgress,
      })
    );
    expect(html).toContain("456789");
    expect(html).toContain("trk_code_title");
  });

  it("hides the OTP code if handoff is already verified", () => {
    const html = renderToStaticMarkup(
      createElement(DeliveryTrackingModal, {
        isOpen: true,
        onClose: vi.fn(),
        appointmentId: "appt_1",
        progress: { ...sampleProgress, handoffVerified: true },
      })
    );
    expect(html).not.toContain("456789");
  });

  it("shows arrived copy when rider arrives outside doorstep", () => {
    const html = renderToStaticMarkup(
      createElement(DeliveryTrackingModal, {
        isOpen: true,
        onClose: vi.fn(),
        appointmentId: "appt_1",
        progress: { ...sampleProgress, status: "ARRIVED" },
      })
    );
    expect(html).toContain("dlv_pub_arrived");
  });
});
