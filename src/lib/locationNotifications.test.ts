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

describe("Group 5: Live Presence, Radar & Location Notifications", () => {
  it("migration 20260951 enriches request_location_share with actor, actions, and requester info", () => {
    const sql = read("supabase/migrations/20260951_location_notifications_v2.sql");

    // In request_location_share:
    expect(sql).toContain("create or replace function public.request_location_share");
    expect(sql).toContain("'LOCATION_REQUEST'");
    expect(sql).toContain("'APPROVE_LOCATION'");
    expect(sql).toContain("'DECLINE_LOCATION'");
    expect(sql).toContain("'requesterUserId', v_uid");
    expect(sql).toContain("'Pending Approval'");
  });

  it("migration 20260951 stamps entity scoping for business context in request_location_share", () => {
    const sql = read("supabase/migrations/20260951_location_notifications_v2.sql");

    expect(sql).toContain("v_owner_biz");
    expect(sql).toContain("from public.businesses where owner_user_id = p_owner");
    expect(sql).toContain("case when v_owner_biz is not null then 'BUSINESS' else null end");
  });

  it("migration 20260951 enriches respond_location_share with VIEW_ON_MAP and 24h pill", () => {
    const sql = read("supabase/migrations/20260951_location_notifications_v2.sql");

    expect(sql).toContain("create or replace function public.respond_location_share");
    expect(sql).toContain("'LOCATION_APPROVED'");
    expect(sql).toContain("'LOCATION_DENIED'");
    expect(sql).toContain("'VIEW_ON_MAP'");
    expect(sql).toContain("'Approved (24h)'");
  });

  it("migration 20260951 enriches start_live_share with TRACK_LIVE, OPEN_CHAT, lat, and lng", () => {
    const sql = read("supabase/migrations/20260951_location_notifications_v2.sql");

    expect(sql).toContain("create or replace function public.start_live_share");
    expect(sql).toContain("'LIVE_LOCATION'");
    expect(sql).toContain("'TRACK_LIVE'");
    expect(sql).toContain("'OPEN_CHAT'");
    expect(sql).toContain("'lat', p_lat");
    expect(sql).toContain("'lng', p_lng");
    expect(sql).toContain("'Live Now'");
  });

  it("contains all required translation keys across EN, HI, and MR", () => {
    const requiredKeys = [
      "notif_loc_approve_24h",
      "notif_loc_decline",
      "notif_loc_view_map",
      "notif_loc_track_live",
      "notif_loc_open_chat",
      "notif_loc_live_broadcasting",
      "notif_loc_live_hint",
      "notif_loc_privacy_disclaimer",
      "notif_loc_approved_toast",
      "notif_loc_declined_toast",
    ] as const;

    for (const lang of ["en", "hi", "mr"] as const) {
      const dict = translations[lang] as Record<string, string>;
      for (const key of requiredKeys) {
        expect(dict[key], `Missing ${key} in ${lang}`).toBeDefined();
        expect(dict[key].trim().length, `Empty string for ${key} in ${lang}`).toBeGreaterThan(0);
      }
    }
  });

  it("verifies location notification type and metadata contract", () => {
    const metadata: NotificationMetadata = {
      requesterUserId: "user-123",
      ownerUserId: "owner-456",
      shareId: "share-789",
      conversationId: "conv-101",
      lat: 18.5204,
      lng: 73.8567,
      actions: ["APPROVE_LOCATION", "DECLINE_LOCATION", "VIEW_ON_MAP", "TRACK_LIVE", "OPEN_CHAT"],
      statusPill: "Live Now",
      tone: "brand",
    };

    expect(metadata.requesterUserId).toBe("user-123");
    expect(metadata.lat).toBe(18.5204);
    expect(metadata.lng).toBe(73.8567);
    expect(metadata.actions).toContain("TRACK_LIVE");
    expect(metadata.actions).toContain("APPROVE_LOCATION");

    const types: NotificationType[] = [
      "LIVE_LOCATION",
      "LOCATION_REQUEST",
      "LOCATION_APPROVED",
      "LOCATION_DENIED",
      "LOCATION_REVOKED",
    ];
    expect(types.length).toBe(5);
  });
});
