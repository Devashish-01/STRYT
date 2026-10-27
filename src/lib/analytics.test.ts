import { describe, it, expect, beforeEach, vi } from "vitest";
import { EVENTS, track, resetAnalyticsSession } from "./analytics";

// Hermetic: `insert` records what would reach public.events. vi.mock is hoisted above the import.
const { insert } = vi.hoisted(() => ({ insert: vi.fn() }));
vi.mock("./supabaseClient", () => ({ getSupabase: () => ({ from: () => ({ insert }) }) }));

// Node has no sessionStorage; a minimal shim lets the session id behave as in a browser.
const store = new Map<string, string>();
vi.stubGlobal("sessionStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  insert.mockReset();
  insert.mockResolvedValue({ error: null });
  resetAnalyticsSession();
});

describe("track", () => {
  it("writes a client row with the plan's envelope", async () => {
    track(EVENTS.OTP_SENT, { is_native: false, is_resend: true });
    await flush();
    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0];
    expect(row).toMatchObject({
      name: "otp_sent",
      props: { is_native: false, is_resend: true },
      source: "client",
      platform: "web",
      seller_type: null,
      seller_id: null,
      actor_role: "customer",
    });
    expect(row.session_id).toMatch(/^s_[0-9a-f]{32}$/);
    // stamped server-side from the JWT, never sent
    expect(row).not.toHaveProperty("user_id");
  });

  it("carries the seller as group context, and marks a rider's decline as staff", async () => {
    track(EVENTS.SELLER_VIEWED, { is_guest: true }, { type: "business", id: "b_1" });
    track(EVENTS.DELIVERY_DECLINED, { assignment_type: "single" }, { type: "business", id: "b_1" });
    await flush();
    expect(insert.mock.calls[0][0]).toMatchObject({ name: "seller_viewed", seller_type: "business", seller_id: "b_1", actor_role: "customer" });
    expect(insert.mock.calls[1][0]).toMatchObject({ name: "delivery_declined", seller_type: "business", seller_id: "b_1", actor_role: "staff" });
  });

  it("never throws into the caller, even when the send fails", async () => {
    insert.mockRejectedValue(new Error("offline"));
    expect(() => track(EVENTS.SHARE_LINK_OPENED, { link_type: "tracking", is_valid: false })).not.toThrow();
    await flush();
  });
});

describe("resetAnalyticsSession", () => {
  it("starts an unlinked session for whoever signs in next", async () => {
    track(EVENTS.OTP_SENT, { is_native: false, is_resend: false });
    track(EVENTS.OTP_SENT, { is_native: false, is_resend: true });
    await flush();
    const [a, b] = insert.mock.calls.map((c) => c[0].session_id);
    expect(a).toBe(b);

    resetAnalyticsSession();
    track(EVENTS.OTP_SENT, { is_native: false, is_resend: false });
    await flush();
    expect(insert.mock.calls[2][0].session_id).not.toBe(a);
  });
});
