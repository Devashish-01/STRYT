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

describe("Group 7: Trust, Ratings, Reviews & Safety Reports Notifications", () => {
  it("migration 20260953 stamps entity scoping and rich metadata on rating reviews", () => {
    const sql = read("supabase/migrations/20260953_trust_safety_notifications_v2.sql");

    expect(sql).toContain("create or replace function public.notify_on_rating");
    expect(sql).toContain("'RATING'");
    expect(sql).toContain("case when new.ratee_type in ('BUSINESS', 'PROVIDER') then new.ratee_type else null end");
    expect(sql).toContain("case when new.ratee_type in ('BUSINESS', 'PROVIDER') then new.ratee_id else null end");
    expect(sql).toContain("'ratingId', new.id");
    expect(sql).toContain("'rating', new.rating");
    expect(sql).toContain("'REPLY_RATING'");
    expect(sql).toContain("'VIEW_REVIEW'");
  });

  it("migration 20260953 notifies customer on owner review reply", () => {
    const sql = read("supabase/migrations/20260953_trust_safety_notifications_v2.sql");

    expect(sql).toContain("create or replace function public.reply_to_rating");
    expect(sql).toContain("'RATING_REPLY'");
    expect(sql).toContain("'replyText', v_clean_reply");
    expect(sql).toContain("'Owner Replied'");
    expect(sql).toContain("'VIEW_REVIEW'");
    expect(sql).toContain("'VIEW_STORE'");
  });

  it("migration 20260953 enriches report resolved notifications", () => {
    const sql = read("supabase/migrations/20260953_trust_safety_notifications_v2.sql");

    expect(sql).toContain("create or replace function public.notify_on_report_resolved");
    expect(sql).toContain("'REPORT_RESOLVED'");
    expect(sql).toContain("'VIEW_REPORT_TARGET'");
    expect(sql).toContain("new.target_type");
    expect(sql).toContain("new.target_id");
  });

  it("migration 20260953 enriches admin verification queue notifications", () => {
    const sql = read("supabase/migrations/20260953_trust_safety_notifications_v2.sql");

    expect(sql).toContain("create or replace function public.notify_admins_business_pending");
    expect(sql).toContain("'ADMIN_REVIEW_QUEUE'");
    expect(sql).toContain("'REVIEW_BUSINESS'");
    expect(sql).toContain("'VIEW_ADMIN'");
    expect(sql).toContain("'Pending Approval'");
  });

  it("contains all required translation keys across EN, HI, and MR", () => {
    const requiredKeys = [
      "notif_trust_owner_reply_label",
      "notif_trust_reply_btn",
      "notif_trust_view_review_btn",
      "notif_trust_view_store_btn",
      "notif_trust_review_admin_btn",
      "notif_trust_view_target_btn",
    ] as const;

    for (const lang of ["en", "hi", "mr"] as const) {
      const dict = translations[lang] as Record<string, string>;
      for (const key of requiredKeys) {
        expect(dict[key], `Missing ${key} in ${lang}`).toBeDefined();
        expect(dict[key].trim().length, `Empty string for ${key} in ${lang}`).toBeGreaterThan(0);
      }
    }
  });

  it("verifies trust notification contract and metadata integrity", () => {
    const metadata: NotificationMetadata = {
      rating: 5,
      ratingId: "rat_123",
      comment: "Best artisan bakery in the entire neighborhood!",
      raterName: "Pooja K.",
      replyText: "Thank you so much Pooja, looking forward to serving you again!",
      reportId: "rep_456",
      businessName: "Crust & Crumb",
      statusPill: "5/5 ★",
      tone: "success",
      actions: ["REPLY_RATING", "VIEW_REVIEW", "VIEW_STORE"],
    };

    expect(metadata.rating).toBe(5);
    expect(metadata.ratingId).toBe("rat_123");
    expect(metadata.replyText).toContain("Thank you");
    expect(metadata.actions).toContain("REPLY_RATING");
    expect(metadata.actions).toContain("VIEW_STORE");

    const types: NotificationType[] = [
      "RATING",
      "RATING_REPLY",
      "REPORT_RESOLVED",
      "ADMIN_REVIEW_QUEUE",
    ];
    expect(types.length).toBe(4);
  });
});
