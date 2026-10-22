import { describe, it, expect, beforeEach, vi } from "vitest";
import { appointmentService } from "./appointmentService";
import { deliveryService } from "./deliveryService";

// Hermetic like appointmentService.gaps.test.ts: no env, no client, no network. `rpc` records what reaches the database.
const rpc = vi.fn();
const from = vi.fn();
vi.mock("@/lib/supabaseClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabaseClient")>()),
  currentUserId: async () => "cust_1",
  getSupabase: () => ({ rpc, from }),
}));

const aptRow = (over: Record<string, unknown> = {}) => ({
  id: "apt_1", target_id: "b_kirana", target_type: "BUSINESS", customer_user_id: "cust_1", customer_name: "Riya",
  scheduled_for: new Date(Date.now() + 3600_000).toISOString(), date_label: "Today", time_label: "ASAP",
  status: "PENDING", created_at: new Date().toISOString(), fulfillment_type: "DELIVERY", ...over,
});

const base = {
  targetId: "b_kirana", targetName: "Kirana", targetType: "BUSINESS" as const, customerId: "cust_1", customerName: "Riya",
  scheduledForISO: new Date(Date.now() + 3600_000).toISOString(), dateLabel: "Today", timeLabel: "ASAP",
  fulfillmentType: "DELIVERY" as const, deliveryAddressLine: "12 Lane", deliveryLat: 18.57, deliveryLng: 73.91,
};

// The booking path may call other RPCs first (limits, checks); pick out the appointment_create call.
const createArgs = () => rpc.mock.calls.filter(([fn]) => fn === "appointment_create").pop()![1];

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
});

describe("appointmentService.create — ASAP delivery", () => {
  it("sends p_asap only when the order is ASAP, so an ordinary booking still works on a database without the new parameter", async () => {
    rpc.mockResolvedValue({ data: aptRow(), error: null });

    await appointmentService.create({ ...base, asap: true });
    const asapArgs = createArgs();
    expect(asapArgs.p_asap).toBe(true);

    rpc.mockClear();
    await appointmentService.create({ ...base, asap: false, timeLabel: "10:00 AM", dateLabel: "Tomorrow" });
    const slotArgs = createArgs();
    expect("p_asap" in slotArgs).toBe(false);
  });

  it("maps the new order columns onto the record", async () => {
    rpc.mockResolvedValue({
      data: aptRow({ delivery_fee: 30, is_asap: true, ready_at: "2026-10-19T10:00:00Z", cash_collected_at: "2026-10-19T11:00:00Z" }),
      error: null,
    });
    const rec = await appointmentService.create({ ...base, asap: true });
    expect(rec.deliveryFee).toBe(30);
    expect(rec.isAsap).toBe(true);
    expect(rec.readyAt).toBe("2026-10-19T10:00:00Z");
    expect(rec.cashCollectedAt).toBe("2026-10-19T11:00:00Z");
    expect(rec.cashSettledAt).toBeNull();
  });

  it("turns the server's minimum-order and ASAP codes into plain sentences", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "DELIVERY_MIN_ORDER" } });
    await expect(appointmentService.create(base)).rejects.toThrow(/minimum for home delivery/i);

    rpc.mockResolvedValue({ data: null, error: { message: "ASAP_REQUIRES_DELIVERY" } });
    await expect(appointmentService.create({ ...base, fulfillmentType: "IN_STORE" })).rejects.toThrow(/only available for home delivery/i);
  });

  it("says plainly that ASAP isn't available while the shop is closed", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "SHOP_CLOSED" } });
    await expect(appointmentService.create({ ...base, asap: true })).rejects.toThrow(/closed right now.*pick a time/i);
  });
});

describe("deliveryService — dispatch, cash and insights", () => {
  it("lists orders waiting for a rider", async () => {
    rpc.mockResolvedValue({
      data: [{
        appointment_id: "apt_9", customer_name: "Asha", delivery_address_line: "Flat 4", scheduled_for: null, time_label: "ASAP",
        is_asap: true, package_name: "Groceries", package_price: "420.00", delivery_fee: 30, ready_at: null,
        payment_method: null, payment_status: "UNPAID", is_out_of_range: false, created_at: "2026-10-19T09:00:00Z",
      }],
      error: null,
    });
    const rows = await deliveryService.awaitingDriver("b_kirana");
    expect(rpc).toHaveBeenCalledWith("business_delivery_queue", { p_business_id: "b_kirana" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ appointmentId: "apt_9", isAsap: true, packagePrice: 420, deliveryFee: 30, readyAt: null });
  });

  it("marks an order packed and records cash through the matching RPCs", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await deliveryService.markOrderReady("apt_9");
    expect(rpc).toHaveBeenLastCalledWith("mark_order_ready", { p_appointment_id: "apt_9" });

    rpc.mockResolvedValue({ data: "450.00", error: null });
    expect(await deliveryService.collectCash("dlv_1")).toBe(450);
    expect(rpc).toHaveBeenLastCalledWith("delivery_collect_cash", { p_delivery_id: "dlv_1" });
  });

  it("reads cash to settle per rider and settles one rider at a time", async () => {
    rpc.mockResolvedValue({
      data: [{ agent_user_id: "u_r", agent_name: "Ravi", orders: 3, amount: "1240", oldest: "2026-10-18T10:00:00Z" }],
      error: null,
    });
    const cash = await deliveryService.cashToSettle("b_kirana");
    expect(cash).toEqual([{ agentUserId: "u_r", agentName: "Ravi", orders: 3, amount: 1240, oldest: "2026-10-18T10:00:00Z" }]);

    rpc.mockResolvedValue({ data: "1240", error: null });
    expect(await deliveryService.settleCash("b_kirana", "u_r")).toBe(1240);
    expect(rpc).toHaveBeenLastCalledWith("settle_agent_cash", { p_business_id: "b_kirana", p_agent_user_id: "u_r" });
  });

  it("maps the stats payload, tolerating an empty period", async () => {
    rpc.mockResolvedValue({
      data: { days: 30, delivered: 12, cancelled: 1, avg_minutes: 34, fees_collected: 360, per_agent: [{ agent_user_id: "u_r", name: "Ravi", delivered: 9 }] },
      error: null,
    });
    const s = await deliveryService.stats("b_kirana", 30);
    expect(s).toEqual({ days: 30, delivered: 12, cancelled: 1, avgMinutes: 34, feesCollected: 360, perAgent: [{ agentUserId: "u_r", name: "Ravi", delivered: 9 }] });

    rpc.mockResolvedValue({ data: { days: 30, delivered: 0, cancelled: 0, avg_minutes: null, fees_collected: 0, per_agent: [] }, error: null });
    expect((await deliveryService.stats("b_kirana")).avgMinutes).toBeNull();
  });

  it("propagates a database error instead of swallowing it", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "NOT_ALLOWED" } });
    await expect(deliveryService.markOrderReady("apt_9")).rejects.toMatchObject({ message: "NOT_ALLOWED" });
  });
});
