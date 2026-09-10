import { describe, it, expect } from "vitest";
import { groupCustomerTabs, extractCustomerPhone } from "./appointmentService";
import type { AppointmentRecord } from "@/types";

function mockApt(overrides: Partial<AppointmentRecord>): AppointmentRecord {
  return {
    id: "apt_" + Math.random().toString(36).slice(2, 7),
    targetId: "biz_1",
    targetType: "BUSINESS",
    targetName: "Salon",
    customerId: "cust_1",
    customerName: "Rahul Sharma",
    scheduledForISO: new Date().toISOString(),
    dateLabel: "Today",
    timeLabel: "10:00 AM",
    status: "COMPLETED",
    paymentStatus: "UNPAID",
    packagePrice: 300,
    createdAtISO: new Date().toISOString(),
    partySize: 1,
    fulfillmentType: "IN_STORE",
    ...overrides,
  };
}

describe("Customer Tab / Khata grouping", () => {
  it("extracts phone number from note correctly", () => {
    expect(extractCustomerPhone("Walk-in • 9876543210")).toBe("9876543210");
    expect(extractCustomerPhone("Walk-in • +91 98765 43210")).toBe("9876543210");
    expect(extractCustomerPhone("Regular client note")).toBeNull();
    expect(extractCustomerPhone(undefined)).toBeNull();
  });

  it("groups unpaid appointments by customer ID and computes total balance", () => {
    const apt1 = mockApt({ id: "1", customerId: "u_1", customerName: "Aman", packagePrice: 250 });
    const apt2 = mockApt({ id: "2", customerId: "u_1", customerName: "Aman", packagePrice: 350 });
    const apt3 = mockApt({ id: "3", customerId: "u_2", customerName: "Priya", packagePrice: 500 });

    const groups = groupCustomerTabs([apt1, apt2, apt3]);
    expect(groups).toHaveLength(2);

    const aman = groups.find((g) => g.customerId === "u_1");
    expect(aman).toBeDefined();
    expect(aman?.totalOwed).toBe(600);
    expect(aman?.visitCount).toBe(2);

    const priya = groups.find((g) => g.customerId === "u_2");
    expect(priya).toBeDefined();
    expect(priya?.totalOwed).toBe(500);
    expect(priya?.visitCount).toBe(1);
  });

  it("groups walk-ins by phone extracted from note when customerId is missing", () => {
    const w1 = mockApt({
      id: "w1",
      customerId: "",
      customerName: "Suresh",
      notes: "Walk-in • 9811122233",
      packagePrice: 150,
    });
    const w2 = mockApt({
      id: "w2",
      customerId: "",
      customerName: "Suresh",
      notes: "Walk-in • +91 98111 22233",
      packagePrice: 200,
    });

    const groups = groupCustomerTabs([w1, w2]);
    expect(groups).toHaveLength(1);
    expect(groups[0].customerPhone).toBe("9811122233");
    expect(groups[0].totalOwed).toBe(350);
    expect(groups[0].visitCount).toBe(2);
  });

  it("ignores paid appointments or cancelled visits", () => {
    const paidApt = mockApt({ id: "p1", paymentStatus: "PAID", packagePrice: 400 });
    const cancelledApt = mockApt({ id: "c1", status: "CANCELLED", packagePrice: 300 });
    const activeUnpaid = mockApt({ id: "u1", paymentStatus: "UNPAID", status: "ACCEPTED", packagePrice: 250 });

    const groups = groupCustomerTabs([paidApt, cancelledApt, activeUnpaid]);
    expect(groups).toHaveLength(1);
    expect(groups[0].totalOwed).toBe(250);
  });
});
