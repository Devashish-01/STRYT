import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import en from "@/lib/i18n/en";

vi.mock("@/store", () => ({ useApp: () => ({ showToast: vi.fn() }) }));

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    lang: "en",
    t: (key: string, fallback?: string) => en[key] ?? fallback ?? key,
    tf: (key: string, params: Record<string, string | number>) => {
      let s = en[key] ?? key;
      for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
      return s;
    },
    setLang: vi.fn(),
  }),
}));

vi.mock("@/hooks/useApi", () => ({
  useQuery: (fn: () => unknown) => {
    const val = fn();
    return {
      data: val instanceof Promise ? [{ userId: "u-1", name: "Me", isSelf: true, onDuty: true }] : val,
      loading: false,
      refetch: vi.fn(),
    };
  },
}));

vi.mock("@/services", () => ({
  deliveryService: {
    deliveryTeam: () => [{ userId: "u-1", name: "Me", isSelf: true, onDuty: true }],
    forAppointment: () => null,
    assignDelivery: vi.fn(),
  },
}));

import DeliveryAssignControl from "./DeliveryAssignControl";

describe("DeliveryAssignControl", () => {
  it("offers Assign delivery when no rider has been assigned yet", () => {
    const html = renderToStaticMarkup(
      createElement(DeliveryAssignControl, {
        appointmentId: "apt-1",
        businessId: "biz-1",
        preloaded: null,
        packed: true,
      })
    );
    expect(html).toContain("Assign delivery");
    expect(html).not.toContain("Reassign");
  });

  it("re-offers Assign delivery when the previous rider cancelled instead of deadlocking", () => {
    const html = renderToStaticMarkup(
      createElement(DeliveryAssignControl, {
        appointmentId: "apt-2",
        businessId: "biz-1",
        preloaded: {
          id: "dlv-2",
          appointmentId: "apt-2",
          status: "CANCELLED",
          liveStatus: null,
          handoffCode: null,
          handoffVerified: false,
          agentUserId: "rider-1",
          agentName: "suresh_k",
          lat: null,
          lng: null,
        },
        packed: true,
      })
    );
    expect(html).toContain("suresh_k");
    expect(html).toContain("Cancelled");
    expect(html).toContain("Previous rider cancelled");
    expect(html).toContain("Assign delivery");
  });

  it("shows Reassign (not Assign delivery) when a rider is actively assigned", () => {
    const html = renderToStaticMarkup(
      createElement(DeliveryAssignControl, {
        appointmentId: "apt-3",
        businessId: "biz-1",
        preloaded: {
          id: "dlv-3",
          appointmentId: "apt-3",
          status: "ASSIGNED",
          liveStatus: null,
          handoffCode: null,
          handoffVerified: false,
          agentUserId: "rider-1",
          agentName: "suresh_k",
          lat: null,
          lng: null,
        },
        packed: true,
      })
    );
    expect(html).toContain("Reassign");
    expect(html).not.toContain("Assign delivery");
  });

  it("hides assignment actions in readOnly mode", () => {
    const html = renderToStaticMarkup(
      createElement(DeliveryAssignControl, {
        appointmentId: "apt-4",
        businessId: "biz-1",
        preloaded: null,
        readOnly: true,
      })
    );
    expect(html).not.toContain("Assign delivery");
    expect(html).not.toContain("Reassign");
  });
});
