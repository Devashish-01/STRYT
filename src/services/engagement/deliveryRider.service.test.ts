import { describe, it, expect, beforeEach, vi } from "vitest";
import { appointmentService } from "./appointmentService";
import { deliveryService } from "./deliveryService";

// Hermetic like the other service tests: no env, no client, no network. `rpc` records what reaches the database.
const rpc = vi.fn();
vi.mock("@/lib/supabaseClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabaseClient")>()),
  currentUserId: async () => "cust_1",
  getSupabase: () => ({ rpc, from: vi.fn() }),
}));

beforeEach(() => {
  rpc.mockReset();
});

describe("deliveryService — what the rider sees and declining a single delivery", () => {
  it("maps the customer's and shop's phone, items, notes and the balance owed", async () => {
    rpc.mockResolvedValue({
      data: [{
        id: "dlv_1", appointment_id: "apt_1", business_id: "b_1", business_name: "Kirana", customer_name: "Asha", status: "EN_ROUTE",
        amount_due: "120.50", delivery_fee: 30, payment_method: "UPI", payment_status: "PAID", cash_collected_at: null,
        customer_phone: "+919000000001", business_phone: "+919000000009", order_notes: "Ring the bell twice",
        requested_window: "before 6pm", package_name: "Groceries",
        items: [{ name: "Milk 1 L", quantity: 2 }, { name: "Atta 5 kg", quantity: 1 }],
      }],
      error: null,
    });
    const [d] = await deliveryService.myDeliveries();
    expect(d.amountDue).toBe(120.5);
    expect(d).toMatchObject({
      customerPhone: "+919000000001", businessPhone: "+919000000009", orderNotes: "Ring the bell twice",
      requestedWindow: "before 6pm", packageName: "Groceries",
    });
    expect(d.items).toEqual([{ name: "Milk 1 L", quantity: 2 }, { name: "Atta 5 kg", quantity: 1 }]);
  });

  it("is safe when the database has no contact details or items yet", async () => {
    rpc.mockResolvedValue({ data: [{ id: "dlv_2", appointment_id: "apt_2", status: "ASSIGNED" }], error: null });
    const [d] = await deliveryService.myDeliveries();
    expect(d.customerPhone).toBeNull();
    expect(d.businessPhone).toBeNull();
    expect(d.items).toEqual([]);
    expect(d.amountDue).toBe(0);
  });

  it("declines a single delivery through its own RPC (not the run one)", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await deliveryService.declineSolo("dlv_9");
    expect(rpc).toHaveBeenLastCalledWith("decline_solo_delivery", { p_delivery_id: "dlv_9" });
  });

  it("surfaces the server's refusal when the delivery already started", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "INVALID_STATE" } });
    await expect(deliveryService.declineSolo("dlv_9")).rejects.toMatchObject({ message: "INVALID_STATE" });
  });
});

describe("appointmentService — a customer cancelling an order that is already on the way", () => {
  it("explains it instead of showing a raw code", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "DELIVERY_IN_PROGRESS" } });
    await expect(appointmentService.updateStatus("apt_1", "CANCELLED")).rejects.toThrow(/already on its way/i);
  });
});
