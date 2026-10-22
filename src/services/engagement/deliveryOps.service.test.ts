import { describe, it, expect, beforeEach, vi } from "vitest";
import { deliveryService, friendlyDeliveryError } from "./deliveryService";
import { track } from "@/lib/analytics";

// Hermetic: no env, no client, no network. `rpc` records what reaches the database; `from` backs forAppointments.
const rpc = vi.fn();
const order = vi.fn();
const inFn = vi.fn(() => ({ order }));
const select = vi.fn(() => ({ in: inFn }));
const from = vi.fn(() => ({ select }));
vi.mock("@/lib/supabaseClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabaseClient")>()),
  currentUserId: async () => "u_1",
  getSupabase: () => ({ rpc, from }),
}));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

beforeEach(() => {
  rpc.mockReset();
  order.mockReset();
  vi.mocked(track).mockClear();
});

describe("pick-up and redelivery", () => {
  it("confirms pick-up through its own RPC and records the funnel step", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await deliveryService.markPickedUp("dlv_1");
    expect(rpc).toHaveBeenLastCalledWith("delivery_mark_picked_up", { p_delivery_id: "dlv_1" });
    expect(track).toHaveBeenCalledWith("delivery_picked_up");
  });

  it("tells the shop the customer is ready, and reports a throttled repeat as false", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await deliveryService.readyForRedelivery("apt_1")).toBe(true);
    expect(rpc).toHaveBeenLastCalledWith("customer_ready_for_redelivery", { p_appointment_id: "apt_1" });
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await deliveryService.readyForRedelivery("apt_1")).toBe(false);
  });
});

describe("money still owed after delivery", () => {
  it("lists delivered-but-unpaid orders", async () => {
    rpc.mockResolvedValue({
      data: [{ appointment_id: "apt_7", customer_name: "Asha", amount: "380.00", delivered_at: "2026-10-19T10:00:00Z", agent_name: "Ravi" }],
      error: null,
    });
    const rows = await deliveryService.cashOutstanding("b_1");
    expect(rpc).toHaveBeenCalledWith("business_cash_outstanding", { p_business_id: "b_1" });
    expect(rows).toEqual([{ appointmentId: "apt_7", customerName: "Asha", amount: 380, deliveredAt: "2026-10-19T10:00:00Z", agentName: "Ravi" }]);
  });

  it("marks one paid", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await deliveryService.markOutstandingPaid("apt_7");
    expect(rpc).toHaveBeenLastCalledWith("mark_outstanding_paid", { p_appointment_id: "apt_7" });
  });
});

describe("leave-at-the-door proof", () => {
  const PHOTO = "https://x.supabase.co/storage/v1/object/public/uploads/u_1/delivery-proof/a.jpg";

  it("records the photo through its own RPC, trimming the note", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await deliveryService.recordProof("dlv_1", PHOTO, "  at the gate  ");
    expect(rpc).toHaveBeenLastCalledWith("delivery_record_proof", { p_delivery_id: "dlv_1", p_photo_url: PHOTO, p_note: "at the gate" });
  });

  it("sends no note rather than an empty one", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await deliveryService.recordProof("dlv_1", PHOTO, "   ");
    expect(rpc).toHaveBeenLastCalledWith("delivery_record_proof", expect.objectContaining({ p_note: null }));
  });

  it("maps what the server can refuse into words the rider can act on", async () => {
    const cases: [string, RegExp][] = [
      ["PROOF_NOT_ALLOWED", /doesn't allow leaving orders at the door/i],
      ["PROOF_REQUIRES_PREPAID", /only prepaid orders/i],
      ["PROOF_TOO_EARLY", /wait a few more minutes/i],
      ["INVALID_PROOF_PHOTO", /take it again/i],
      ["ALREADY_HANDED_OFF", /already gave the code/i],
    ];
    for (const [code, re] of cases) {
      rpc.mockResolvedValue({ data: null, error: { message: code } });
      await expect(deliveryService.recordProof("dlv_1", PHOTO), code).rejects.toThrow(re);
    }
  });

  it("reads what the proof screens need, and is safe on an empty answer", async () => {
    rpc.mockResolvedValue({ data: [{ proof_allowed: true, can_record: true, waited_min: 3, proof_photo_url: null, proof_note: null, proof_at: null }], error: null });
    expect(await deliveryService.proofInfo("dlv_1")).toEqual({ allowed: true, canRecord: true, waitedMin: 3, photoUrl: null, note: null, at: null });
    expect(rpc).toHaveBeenLastCalledWith("delivery_proof", { p_delivery_id: "dlv_1" });
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await deliveryService.proofInfo("dlv_1")).toEqual({ allowed: false, canRecord: false, waitedMin: null, photoUrl: null, note: null, at: null });
  });
});

describe("admin overview", () => {
  it("maps counts and the deliveries that need attention", async () => {
    rpc.mockResolvedValue({
      data: {
        active: 4, delivered_7d: 31, failed_7d: 2, awaiting_rider: 3, cash_outstanding: "120", cash_unsettled: "900",
        attention: [{ delivery_id: "d1", appointment_id: "a1", business_id: "b1", business_name: "Kirana", status: "EN_ROUTE", issue: "Location lost for 10+ min", since: "2026-10-19T09:00:00Z" }],
      },
      error: null,
    });
    const o = await deliveryService.adminOverview();
    expect(o).toMatchObject({ active: 4, delivered7d: 31, failed7d: 2, awaitingRider: 3, cashOutstanding: 120, cashUnsettled: 900 });
    expect(o.attention[0]).toMatchObject({ deliveryId: "d1", businessName: "Kirana", issue: "Location lost for 10+ min" });
  });

  it("is safe on an empty overview", async () => {
    rpc.mockResolvedValue({ data: {}, error: null });
    const o = await deliveryService.adminOverview();
    expect(o).toMatchObject({ active: 0, attention: [] });
  });
});

describe("forAppointments — one query for a whole list of cards", () => {
  it("returns the latest delivery per appointment and queries once", async () => {
    order.mockResolvedValue({
      data: [
        { id: "d_new", appointment_id: "a1", status: "ASSIGNED", live_status: null, handoff_verified: false, agent_user_id: "u2", agent: { alias: "ravi" } },
        { id: "d_old", appointment_id: "a1", status: "CANCELLED", live_status: null, handoff_verified: false, agent_user_id: "u3", agent: { alias: "amit" } },
        { id: "d_b", appointment_id: "a2", status: "DELIVERED", live_status: "DONE", handoff_verified: true, agent_user_id: "u2", agent: { alias: "ravi" } },
      ],
    });
    const map = await deliveryService.forAppointments(["a1", "a2", "a3"]);
    expect(from).toHaveBeenCalledTimes(1);
    expect(inFn).toHaveBeenCalledWith("appointment_id", ["a1", "a2", "a3"]);
    expect(map.a1.id).toBe("d_new"); // newest first wins
    expect(map.a2.status).toBe("DELIVERED");
    expect(map.a3).toBeUndefined();
  });

  it("does not hit the database for an empty list", async () => {
    from.mockClear();
    expect(await deliveryService.forAppointments([])).toEqual({});
    expect(from).not.toHaveBeenCalled();
  });
});

describe("friendly delivery errors", () => {
  it("turns the server's refusal codes into words", () => {
    const cases: [string, RegExp][] = [
      ["NOT_A_DELIVERY_ORDER", /isn't a home delivery/i],
      ["ORDER_NOT_ACCEPTED", /accept the order/i],
      ["SOME_APPOINTMENTS_NOT_ELIGIBLE", /can't join a run/i],
      ["AGENT_NOT_TEAM_MEMBER", /no longer on your team/i],
      ['duplicate key value violates unique constraint "appointment_deliveries_one_active"', /just assigned to someone else/i],
      ["NOT_PICKED_UP", /pick-up from the shop first/i],
      ["INVALID_STOP_ORDER", /route couldn't be saved/i],
    ];
    for (const [code, re] of cases) expect((friendlyDeliveryError(new Error(code)) as Error).message, code).toMatch(re);
  });

  it("passes anything it doesn't know through untouched", () => {
    const e = new Error("something unrelated");
    expect(friendlyDeliveryError(e)).toBe(e);
  });

  it("is applied when assigning, starting and accepting", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "ORDER_NOT_ACCEPTED" } });
    await expect(deliveryService.assignDelivery("apt_1", "u_2")).rejects.toThrow(/accept the order/i);
    rpc.mockResolvedValue({ data: null, error: { message: "NOT_PICKED_UP" } });
    await expect(deliveryService.updateStatus("dlv_1", "ON_THE_WAY")).rejects.toThrow(/pick-up from the shop first/i);
    rpc.mockResolvedValue({ data: null, error: { message: "INVALID_STOP_ORDER" } });
    await expect(deliveryService.acceptBatch("b_1", ["d1"])).rejects.toThrow(/route couldn't be saved/i);
  });
});

describe("funnel events carry no personal data", () => {
  it("records categorical steps only", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await deliveryService.markOrderReady("apt_1");
    await deliveryService.cancelDelivery("dlv_1", "CUSTOMER_UNAVAILABLE", "rang the bell twice, nobody home");
    await deliveryService.declineSolo("dlv_2");
    const calls = vi.mocked(track).mock.calls;
    expect(calls).toContainEqual(["delivery_packed"]);
    expect(calls).toContainEqual(["delivery_failed", { reason: "CUSTOMER_UNAVAILABLE" }]);
    expect(calls).toContainEqual(["delivery_declined", { kind: "single" }]);
    // the free-text note and every id stay out of analytics
    expect(JSON.stringify(calls)).not.toMatch(/rang the bell|dlv_|apt_/);
  });
});
