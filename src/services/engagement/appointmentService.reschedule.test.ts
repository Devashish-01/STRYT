import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * These used to book mock business "b1" as a signed-out guest and assert that the local record carried the
 * original's payment and package forward. That path is gone (P12 step 6): demo ids no longer short-circuit
 * anything, and a guest cannot book at all — which is E2E-009's fix, not a regression.
 *
 * What they protected is still worth protecting, so they now check the path that actually ships. Carry-forward
 * happens inside reschedule_appointment, so the contract to hold is that a reschedule calls THAT function with
 * the original's id and does not re-send the payment fields, which would let the client overwrite what the
 * server preserved.
 */

const rpc = vi.fn();
vi.mock("@/lib/supabaseClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabaseClient")>()),
  currentUserId: async () => "cust_123",
  getSupabase: () => ({ rpc }),
}));

const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, String(value)); },
  removeItem: (key: string) => { store.delete(key); },
  clear: () => { store.clear(); },
} as any;

import { appointmentService } from "./appointmentService";

/** The row shape reschedule_appointment returns, with the payment fields it carried over itself. */
function serverRow(over: Record<string, unknown> = {}) {
  return {
    id: "apt_new",
    target_id: "b_real",
    target_name: "Salon Elegance",
    target_type: "BUSINESS",
    customer_user_id: "cust_123",
    customer_name: "Priya Sharma",
    scheduled_for: new Date(Date.now() + 172800000).toISOString(),
    date_label: "Day after",
    time_label: "2:00 PM",
    status: "PENDING",
    created_at: new Date().toISOString(),
    payment_status: "PAID",
    payment_method: "UPI",
    payment_amount: 500,
    payment_reference: "upi_ref_abc123",
    package_id: "pkg_haircut",
    package_name: "Deluxe Haircut",
    package_price: 500,
    ...over,
  };
}

const base = {
  targetId: "b_real",
  targetName: "Salon Elegance",
  targetType: "BUSINESS" as const,
  customerId: "cust_123",
  customerName: "Priya Sharma",
  scheduledForISO: new Date(Date.now() + 172800000).toISOString(),
  dateLabel: "Day after",
  timeLabel: "2:00 PM",
};

describe("appointmentService reschedule", () => {
  beforeEach(() => {
    localStorage.clear();
    rpc.mockReset();
    rpc.mockResolvedValue({ data: serverRow(), error: null });
  });

  it("reschedules through reschedule_appointment, not a fresh booking", async () => {
    await appointmentService.create({ ...base, rescheduledFrom: "apt_original" });

    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe("reschedule_appointment");
    expect(args.p_original_id).toBe("apt_original");
    expect(args.p_scheduled_for).toBe(base.scheduledForISO);
  });

  it("does not re-send the payment fields, so the server's carry-forward stands", async () => {
    await appointmentService.create({
      ...base,
      rescheduledFrom: "apt_original",
      paymentStatus: "PAID",
      paymentMethod: "UPI",
      paymentAmount: 500,
      paymentReference: "upi_ref_abc123",
    });

    const [, args] = rpc.mock.calls[0];
    for (const key of ["p_payment_status", "p_payment_method", "p_payment_amount", "p_payment_reference"]) {
      expect(args).not.toHaveProperty(key);
    }
  });

  it("returns what the server preserved, including payment and package", async () => {
    const rescheduled = await appointmentService.create({ ...base, rescheduledFrom: "apt_original" });

    expect(rescheduled.paymentStatus).toBe("PAID");
    expect(rescheduled.paymentMethod).toBe("UPI");
    expect(rescheduled.paymentAmount).toBe(500);
    expect(rescheduled.paymentReference).toBe("upi_ref_abc123");
    expect(rescheduled.packageId).toBe("pkg_haircut");
    expect(rescheduled.packagePrice).toBe(500);
  });

  it("passes a deliberately chosen new package through to the server", async () => {
    rpc.mockResolvedValue({
      data: serverRow({ package_id: "pkg_spa", package_name: "Spa Day", package_price: 1500 }),
      error: null,
    });

    const rescheduled = await appointmentService.create({
      ...base,
      rescheduledFrom: "apt_original",
      packageId: "pkg_spa",
      packageName: "Spa Day",
      packagePrice: 1500,
    });

    const [, args] = rpc.mock.calls[0];
    expect(args.p_package_id).toBe("pkg_spa");
    expect(args.p_package_price).toBe(1500);
    expect(rescheduled.packageName).toBe("Spa Day");
  });

  it("refuses to reschedule when nobody is signed in rather than writing a local record", async () => {
    const mod = await import("@/lib/supabaseClient");
    vi.spyOn(mod, "currentUserId").mockResolvedValueOnce(null as any);

    await expect(
      appointmentService.create({ ...base, rescheduledFrom: "apt_original" }),
    ).rejects.toThrow(/Couldn't confirm you're signed in/);
    expect(rpc).not.toHaveBeenCalled();
  });
});
