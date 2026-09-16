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

describe("Group 8: Local Discovery, Places & Category Announcements Notifications", () => {
  it("migration 20260954 creates broadcast_offer_to_nearby with rich metadata snapshot", () => {
    const sql = read("supabase/migrations/20260954_discovery_notifications_v2.sql");

    expect(sql).toContain("create or replace function public.broadcast_offer_to_nearby");
    expect(sql).toContain("'OFFER'");
    expect(sql).toContain("'Special Offer'");
    expect(sql).toContain("'CLAIM_OFFER'");
    expect(sql).toContain("'VIEW_STORE'");
    expect(sql).toContain("'offerId'");
    expect(sql).toContain("'businessId'");
    expect(sql).toContain("'offerCode'");
    expect(sql).toContain("coalesce(u.notif_offers, true) = true");
  });

  it("migration 20260954 creates broadcast_new_listing supporting businesses, providers, and places", () => {
    const sql = read("supabase/migrations/20260954_discovery_notifications_v2.sql");

    expect(sql).toContain("create or replace function public.broadcast_new_listing");
    expect(sql).toContain("'NEW_BUSINESS'");
    expect(sql).toContain("'NEW_PROVIDER'");
    expect(sql).toContain("'NEW_PLACE'");
    expect(sql).toContain("'VIEW_BUSINESS'");
    expect(sql).toContain("'VIEW_PROVIDER'");
    expect(sql).toContain("'VIEW_PLACE'");
    expect(sql).toContain("'BOOK_APPOINTMENT'");
    expect(sql).toContain("'DIRECTIONS'");
    expect(sql).toContain("coalesce(u.notif_new_business, true) = true");
  });

  it("adminService.approve attaches rich metadata and stamps entity scoping for new listings", () => {
    const ts = read("src/services/core/adminService.ts");

    expect(ts).toContain("statusPill: type === \"business\" ? \"Newly Opened\" : type === \"provider\" ? \"New Provider\" : \"New Landmark\"");
    expect(ts).toContain("VIEW_BUSINESS");
    expect(ts).toContain("VIEW_PROVIDER");
    expect(ts).toContain("VIEW_PLACE");
    expect(ts).toContain("BOOK_APPOINTMENT");
    expect(ts).toContain("DIRECTIONS");
    expect(ts).toContain("notificationService.sendBulk");
  });

  it("walletService supports saveCoupon to clip offers directly into user wallet", () => {
    const ts = read("src/services/engagement/walletService.ts");

    expect(ts).toContain("async saveCoupon(offerId: string)");
    expect(ts).toContain("from(\"user_saved_coupons\")");
  });

  it("contains all required translation keys across EN, HI, and MR", () => {
    const requiredKeys = [
      "notif_disc_offer_badge",
      "notif_disc_deal_pill",
      "notif_disc_provider_pill",
      "notif_disc_place_pill",
      "notif_disc_business_pill",
      "notif_disc_view_business",
      "notif_disc_view_provider",
      "notif_disc_view_place",
      "notif_disc_claim_offer",
      "notif_disc_offer_saved_toast",
      "notif_disc_directions",
      "notif_disc_book",
      "notif_disc_coupon_code",
      "notif_disc_valid_until",
    ] as const;

    for (const lang of ["en", "hi", "mr"] as const) {
      const dict = translations[lang] as Record<string, string>;
      for (const key of requiredKeys) {
        expect(dict[key], `Missing ${key} in ${lang}`).toBeDefined();
        expect(dict[key].trim().length, `Empty string for ${key} in ${lang}`).toBeGreaterThan(0);
      }
    }
  });

  it("verifies discovery metadata and action contract types", () => {
    const offerMeta: NotificationMetadata = {
      offerId: "o_100",
      businessId: "b_200",
      businessName: "Crust & Crumb",
      offerTitle: "Flat 50% OFF Weekend",
      offerCode: "WEEKEND50",
      discountText: "Flat 50% OFF",
      validUntil: "30 Sep 2026",
      statusPill: "Special Offer",
      tone: "accent",
      actions: ["CLAIM_OFFER", "VIEW_STORE"],
    };

    expect(offerMeta.offerCode).toBe("WEEKEND50");
    expect(offerMeta.actions).toContain("CLAIM_OFFER");
    expect(offerMeta.actions).toContain("VIEW_STORE");

    const bizMeta: NotificationMetadata = {
      businessId: "b_300",
      businessName: "Green Life Florals",
      category: "Florist",
      address: "Lane 5, Koregaon Park",
      phone: "+919876543210",
      lat: 18.536,
      lng: 73.892,
      statusPill: "Newly Opened",
      tone: "primary",
      actions: ["VIEW_BUSINESS", "DIRECTIONS"],
    };

    expect(bizMeta.businessName).toBe("Green Life Florals");
    expect(bizMeta.actions).toContain("VIEW_BUSINESS");
    expect(bizMeta.actions).toContain("DIRECTIONS");

    const types: NotificationType[] = [
      "NEW_BUSINESS",
      "NEW_PROVIDER",
      "NEW_PLACE",
      "OFFER",
    ];
    expect(types).toHaveLength(4);
  });
});
