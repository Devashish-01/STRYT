import { describe, it, expect, beforeEach, vi } from "vitest";
import { appointmentService } from "./appointmentService";

// Mock localStorage for Node test environment
const store = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, String(value)); },
  removeItem: (key: string) => { store.delete(key); },
  clear: () => { store.clear(); },
};
globalThis.localStorage = localStorageMock as any;

describe("appointmentService reschedule payment and package preservation", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("preserves PAID paymentStatus, method, amount and reference when rescheduling", async () => {
    // 1. Create an initial booking for mock business b1
    const original = await appointmentService.create({
      targetId: "b1",
      targetName: "Salon Elegance",
      targetType: "BUSINESS",
      customerId: "cust_123",
      customerName: "Priya Sharma",
      scheduledForISO: new Date(Date.now() + 86400000).toISOString(),
      dateLabel: "Tomorrow",
      timeLabel: "10:00 AM",
      packageId: "pkg_haircut",
      packageName: "Deluxe Haircut",
      packagePrice: 500,
      paymentStatus: "PAID",
      paymentMethod: "UPI",
      paymentAmount: 500,
      paymentReference: "upi_ref_abc123",
    });

    expect(original.paymentStatus).toBe("PAID");
    expect(original.packagePrice).toBe(500);

    // 2. Reschedule the appointment to a new slot without re-specifying payment
    const newSlotISO = new Date(Date.now() + 172800000).toISOString();
    const rescheduled = await appointmentService.create({
      targetId: "b1",
      targetName: "Salon Elegance",
      targetType: "BUSINESS",
      customerId: "cust_123",
      customerName: "Priya Sharma",
      scheduledForISO: newSlotISO,
      dateLabel: "Day After Tomorrow",
      timeLabel: "02:00 PM",
      rescheduledFrom: original.id,
    });

    // 3. Assert payment details are carried over to the rescheduled appointment
    expect(rescheduled.rescheduledFrom).toBe(original.id);
    expect(rescheduled.paymentStatus).toBe("PAID");
    expect(rescheduled.paymentMethod).toBe("UPI");
    expect(rescheduled.paymentAmount).toBe(500);
    expect(rescheduled.paymentReference).toBe("upi_ref_abc123");

    // 4. Assert package info is preserved from original
    expect(rescheduled.packageId).toBe("pkg_haircut");
    expect(rescheduled.packageName).toBe("Deluxe Haircut");
    expect(rescheduled.packagePrice).toBe(500);

    // 5. Assert original appointment is now CANCELLED
    const list = await appointmentService.listForCustomer("cust_123");
    const foundOrig = list.find((a) => a.id === original.id);
    expect(foundOrig?.status).toBe("CANCELLED");
  });

  it("preserves UNPAID status if original was not paid", async () => {
    const original = await appointmentService.create({
      targetId: "b1",
      targetName: "Salon Elegance",
      targetType: "BUSINESS",
      customerId: "cust_456",
      customerName: "Amit Kumar",
      scheduledForISO: new Date(Date.now() + 86400000).toISOString(),
      dateLabel: "Tomorrow",
      timeLabel: "11:00 AM",
      paymentStatus: "UNPAID",
    });

    const rescheduled = await appointmentService.create({
      targetId: "b1",
      targetName: "Salon Elegance",
      targetType: "BUSINESS",
      customerId: "cust_456",
      customerName: "Amit Kumar",
      scheduledForISO: new Date(Date.now() + 172800000).toISOString(),
      dateLabel: "Day After Tomorrow",
      timeLabel: "03:00 PM",
      rescheduledFrom: original.id,
    });

    expect(rescheduled.paymentStatus).toBe("UNPAID");
  });

  it("allows selecting a new package during reschedule when explicitly chosen", async () => {
    const original = await appointmentService.create({
      targetId: "b1",
      targetName: "Salon Elegance",
      targetType: "BUSINESS",
      customerId: "cust_789",
      customerName: "Rohan V",
      scheduledForISO: new Date(Date.now() + 86400000).toISOString(),
      dateLabel: "Tomorrow",
      timeLabel: "10:00 AM",
      packageId: "pkg_basic",
      packageName: "Basic Trim",
      packagePrice: 200,
      paymentStatus: "PAID",
    });

    const rescheduled = await appointmentService.create({
      targetId: "b1",
      targetName: "Salon Elegance",
      targetType: "BUSINESS",
      customerId: "cust_789",
      customerName: "Rohan V",
      scheduledForISO: new Date(Date.now() + 172800000).toISOString(),
      dateLabel: "Day After Tomorrow",
      timeLabel: "04:00 PM",
      rescheduledFrom: original.id,
      packageId: "pkg_spa",
      packageName: "Full Spa Care",
      packagePrice: 1200,
    });

    expect(rescheduled.packageId).toBe("pkg_spa");
    expect(rescheduled.packageName).toBe("Full Spa Care");
    expect(rescheduled.packagePrice).toBe(1200);
    // Payment status still preserved from original
    expect(rescheduled.paymentStatus).toBe("PAID");
  });
});
