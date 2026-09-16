import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { translations } from "./i18n/all";
import type { NotificationMetadata, NotificationType } from "@/types";

const ROOT = path.resolve(__dirname, "..", "..");

function read(rel: string): string {
  // Normalised to LF: a Windows checkout (core.autocrlf=true) has CRLF endings,
  // which the multi-line toContain() expectations below would never match.
  return fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
}

describe("Group 4: Bulk Deals & Group Buying Notifications", () => {
  it("migration 20260950 stamps entity_type and entity_id on merchant notifications", () => {
    const sql = read("supabase/migrations/20260950_bulk_deal_notifications_v2.sql");

    // In bulk_deal_pledge_join, business console scoping requires entity_type and entity_id
    expect(sql).toContain("v_deal.owner_user_id,\n      'BULK_DEAL_PLEDGE'");
    expect(sql).toContain("'BUSINESS',\n      v_deal.business_id");

    // In bulk_deal_pledge_claim_deposit, business console scoping requires entity_type and entity_id
    expect(sql).toContain("v_deal.owner_user_id,\n      'BULK_DEAL_DEPOSIT_CLAIMED'");
  });

  it("migration 20260950 notifies business owner when campaign achieves target MOQ", () => {
    const sql = read("supabase/migrations/20260950_bulk_deal_notifications_v2.sql");

    // Must notify business owner on unlock
    expect(sql).toContain("'Campaign target achieved! 🎉'");
    expect(sql).toContain("'Target Hit'");
  });

  it("migration 20260950 notifies all me_too participants when group buy target is reached", () => {
    const sql = read("supabase/migrations/20260950_bulk_deal_notifications_v2.sql");

    // me_too query looping over all participants
    expect(sql).toContain("select distinct user_id from public.request_me_toos");
    expect(sql).toContain("v_joiner.user_id, 'GROUP_BUY_UNLOCKED'");
  });

  it("contains all required translation keys across EN, HI, and MR", () => {
    const requiredKeys = [
      "notif_bulk_confirm_deposit",
      "notif_bulk_reject_deposit",
      "notif_bulk_view_deal",
      "notif_bulk_view_pass",
      "notif_bulk_deposit_confirmed_toast",
      "notif_bulk_deposit_rejected_toast",
      "notif_bulk_deal_shared_toast",
      "notif_bulk_balance_due",
      "notif_bulk_fully_paid",
    ] as const;

    for (const lang of ["en", "hi", "mr"] as const) {
      const dict = translations[lang] as Record<string, string>;
      for (const key of requiredKeys) {
        expect(dict[key], `Missing ${key} in ${lang}`).toBeDefined();
        expect(dict[key].trim().length, `Empty string for ${key} in ${lang}`).toBeGreaterThan(0);
      }
    }
  });

  it("NotificationMetadata contract safely handles group 4 fields", () => {
    const meta: NotificationMetadata = {
      dealId: "deal-123",
      dealTitle: "Premium Alphonso Mangoes (2 Dozen)",
      tokenCode: "STRYT-D-A81F-2B90",
      quantity: 5,
      unitPrice: 450,
      depositAmount: 500,
      balanceDue: 1750,
      paymentRef: "UPI-918237192",
      paymentMethod: "UPI",
      pledgerUserId: "user-456",
      progressCurrent: 45,
      progressTarget: 50,
      statusPill: "Pending Verification",
      tone: "warning",
      actions: ["CONFIRM_DEPOSIT", "REJECT_DEPOSIT", "VIEW_DEAL", "VIEW_CLAIM_PASS", "SHARE_DEAL"],
    };

    expect(meta.dealId).toBe("deal-123");
    expect(meta.tokenCode).toBe("STRYT-D-A81F-2B90");
    expect(meta.actions).toContain("CONFIRM_DEPOSIT");
    expect(meta.actions).toContain("VIEW_CLAIM_PASS");
  });
});
