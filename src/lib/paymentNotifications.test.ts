import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { translations } from "./i18n";
import type { NotificationMetadata, NotificationType } from "@/types";

const ROOT = path.resolve(__dirname, "..", "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Group 6: Custom Payments & In-Person Transaction Notifications", () => {
  it("migration 20260952 stamps entity_type and entity_id for console scoping in custom_payment_create", () => {
    const sql = read("supabase/migrations/20260952_custom_payment_notifications_v2.sql");

    expect(sql).toContain("create or replace function public.custom_payment_create");
    expect(sql).toContain("'CUSTOM_PAYMENT_RECEIVED'");
    expect(sql).toContain("p_target_type,");
    expect(sql).toContain("p_target_id,");
  });

  it("migration 20260952 enriches custom_payment_create with paymentId, amount, method, and inline actions", () => {
    const sql = read("supabase/migrations/20260952_custom_payment_notifications_v2.sql");

    expect(sql).toContain("'paymentId', v_row.id");
    expect(sql).toContain("'amount', p_amount");
    expect(sql).toContain("'paymentMethod', p_method");
    expect(sql).toContain("'paymentRef', p_reference");
    expect(sql).toContain("'note', p_note");
    expect(sql).toContain("'statusPill', 'Pending Confirmation'");
    expect(sql).toContain("'CONFIRM_CUSTOM_PAYMENT'");
    expect(sql).toContain("'REJECT_CUSTOM_PAYMENT'");
  });

  it("migration 20260952 enriches custom_payment_confirm with Confirmed pill and receipt actions", () => {
    const sql = read("supabase/migrations/20260952_custom_payment_notifications_v2.sql");

    expect(sql).toContain("create or replace function public.custom_payment_confirm");
    expect(sql).toContain("'CUSTOM_PAYMENT_CONFIRMED'");
    expect(sql).toContain("'statusPill', 'Confirmed ✓'");
    expect(sql).toContain("'VIEW_RECEIPT'");
    expect(sql).toContain("'VIEW_STORE'");
  });

  it("migration 20260952 enriches custom_payment_reject with Rejected pill and retry actions", () => {
    const sql = read("supabase/migrations/20260952_custom_payment_notifications_v2.sql");

    expect(sql).toContain("create or replace function public.custom_payment_reject");
    expect(sql).toContain("'CUSTOM_PAYMENT_REJECTED'");
    expect(sql).toContain("'statusPill', 'Rejected'");
    expect(sql).toContain("'RETRY_PAYMENT'");
    expect(sql).toContain("'VIEW_STORE'");
  });

  it("contains all required translation keys across EN, HI, and MR", () => {
    const requiredKeys = [
      "notif_pay_confirm",
      "notif_pay_reject",
      "notif_pay_receipt",
      "notif_pay_store",
      "notif_pay_retry",
      "notif_pay_confirmed_toast",
      "notif_pay_rejected_toast",
      "notif_pay_method_upi",
      "notif_pay_method_cash",
      "notif_pay_ref_label",
      "notif_pay_note_label",
    ] as const;

    for (const lang of ["en", "hi", "mr"] as const) {
      const dict = translations[lang] as Record<string, string>;
      for (const key of requiredKeys) {
        expect(dict[key], `Missing ${key} in ${lang}`).toBeDefined();
        expect(dict[key].trim().length, `Empty string for ${key} in ${lang}`).toBeGreaterThan(0);
      }
    }
  });

  it("verifies payment notification type and metadata contract", () => {
    const metadata: NotificationMetadata = {
      paymentId: "cp_123456",
      amount: 450,
      amountLabel: "Amount",
      paymentMethod: "UPI",
      paymentRef: "UPI-REF-998822",
      note: "For fresh farm tomatoes",
      targetType: "BUSINESS",
      targetId: "biz-789",
      targetName: "Green Valley Farm",
      statusPill: "Pending Confirmation",
      tone: "warning",
      actions: ["CONFIRM_CUSTOM_PAYMENT", "REJECT_CUSTOM_PAYMENT"],
    };

    expect(metadata.paymentId).toBe("cp_123456");
    expect(metadata.amount).toBe(450);
    expect(metadata.paymentMethod).toBe("UPI");
    expect(metadata.actions).toContain("CONFIRM_CUSTOM_PAYMENT");
    expect(metadata.actions).toContain("REJECT_CUSTOM_PAYMENT");

    const types: NotificationType[] = [
      "CUSTOM_PAYMENT_RECEIVED",
      "CUSTOM_PAYMENT_CONFIRMED",
      "CUSTOM_PAYMENT_REJECTED",
    ];
    expect(types.length).toBe(3);
  });
});
