import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DeliveryItem, DeliveryProofInfo } from "@/services/engagement/deliveryService";

// Rendered on the server with the hooks stubbed — no DOM library needed, and it checks what the rider is actually shown.
const mocks = vi.hoisted(() => ({
  info: null as null | DeliveryProofInfo,
  queryFn: null as null | (() => Promise<unknown>),
  proofInfo: vi.fn(),
}));

vi.mock("@/store", () => ({ useApp: () => ({ showToast: vi.fn() }) }));
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({ t: (k: string) => k, tf: (k: string, v: Record<string, unknown>) => `${k}:${JSON.stringify(v)}` }),
}));
vi.mock("@/hooks/useApi", () => ({
  useQuery: (fn: () => Promise<unknown>) => {
    mocks.queryFn = fn;
    return { data: mocks.info, refetch: vi.fn() };
  },
}));
vi.mock("@/services", () => ({ uploadService: { upload: vi.fn() } }));
vi.mock("@/services/engagement/deliveryService", () => ({
  deliveryService: { proofInfo: mocks.proofInfo, recordProof: vi.fn() },
}));

import LeaveAtDoorProof from "./LeaveAtDoorProof";

const info = (over: Partial<DeliveryProofInfo>): DeliveryProofInfo => ({ allowed: true, canRecord: true, waitedMin: 9, photoUrl: null, note: null, at: null, ...over });
const delivery = (over: Partial<DeliveryItem> = {}) => ({ id: "dlv_1", amountDue: 0, cashCollectedAt: null, ...over }) as DeliveryItem;
const render = (d: DeliveryItem) => renderToStaticMarkup(createElement(LeaveAtDoorProof, { delivery: d, onComplete: async () => {} }));

beforeEach(() => {
  mocks.info = null;
  mocks.queryFn = null;
  mocks.proofInfo.mockReset().mockResolvedValue(info({}));
});

describe("LeaveAtDoorProof", () => {
  it("shows nothing until the server says this rider can record a proof (shop opt-in, arrived, not handed over)", () => {
    mocks.info = null;
    expect(render(delivery())).toBe("");
    mocks.info = info({ canRecord: false });
    expect(render(delivery())).toBe("");
  });

  it("counts down the wait instead of offering the camera too early", () => {
    mocks.info = info({ waitedMin: 2 });
    const html = render(delivery());
    expect(html).toContain("dlv_proof_wait");
    expect(html).toContain('&quot;n&quot;:3'); // five minutes minus the two already waited
    expect(html).not.toContain("dlv_proof_take");
  });

  it("never shows 0 minutes left — the last minute reads as 1", () => {
    mocks.info = info({ waitedMin: 4 });
    expect(render(delivery())).toContain('&quot;n&quot;:1');
  });

  it("offers the rear camera once the wait is over, but no submit until a photo exists", () => {
    mocks.info = info({ waitedMin: 5 });
    const html = render(delivery());
    expect(html).toContain("dlv_proof_take");
    expect(html).toContain('capture="environment"');
    expect(html).toContain('accept="image/*"');
    expect(html).not.toContain("dlv_proof_submit");
  });

  it("doesn't even ask the server when money is still to be collected", async () => {
    mocks.info = info({});
    render(delivery({ amountDue: 250 }));
    await expect(mocks.queryFn?.()).resolves.toBeNull();
    expect(mocks.proofInfo).not.toHaveBeenCalled();
  });

  it("asks the server about this delivery when nothing is owed", async () => {
    mocks.info = info({});
    render(delivery());
    await mocks.queryFn?.();
    expect(mocks.proofInfo).toHaveBeenCalledWith("dlv_1");
  });
});
