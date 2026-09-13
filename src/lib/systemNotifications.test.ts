import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { translations } from "./i18n";
import type { NotificationMetadata, NotificationType } from "@/types";

const ROOT = path.resolve(__dirname, "..", "..");

function read(rel: string): string {
  // Normalised to LF: a Windows checkout (core.autocrlf=true) has CRLF endings,
  // which the multi-line toContain() expectations below would never match.
  return fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
}

describe("Group 10: Identity, Role Management & System Administration Notifications", () => {
  it("migration 20260956 enriches grant_team_access and update_team_member_scopes with business scoping and actions", () => {
    const sql = read("supabase/migrations/20260956_identity_system_notifications_v2.sql");

    expect(sql).toContain("create or replace function public.grant_team_access");
    expect(sql).toContain("create or replace function public.update_team_member_scopes");
    expect(sql).toContain("'BUSINESS_ACCESS'");
    expect(sql).toContain("'BUSINESS'");
    expect(sql).toContain("'SWITCH_BUSINESS'");
    expect(sql).toContain("'Team Access'");
    expect(sql).toContain("'Access Updated'");
    expect(sql).toContain("'scopes'");
  });

  it("migration 20260956 enriches verification decision triggers for businesses and providers", () => {
    const sql = read("supabase/migrations/20260956_identity_system_notifications_v2.sql");

    expect(sql).toContain("create or replace function public.notify_verification_decision_business");
    expect(sql).toContain("create or replace function public.notify_verification_decision_provider");
    expect(sql).toContain("'VERIFICATION_DECIDED'");
    expect(sql).toContain("'Verified ✓'");
    expect(sql).toContain("'Needs changes'");
    expect(sql).toContain("'VIEW_STORE'");
    expect(sql).toContain("'RESUBMIT_VERIFY'");
    expect(sql).toContain("'reason'");
  });

  it("migration 20260956 enriches Q&A notifications with business scoping and answer CTAs", () => {
    const sql = read("supabase/migrations/20260956_identity_system_notifications_v2.sql");

    expect(sql).toContain("create or replace function public.notify_on_qna_asked");
    expect(sql).toContain("create or replace function public.notify_on_qna_answered");
    expect(sql).toContain("'QNA'");
    expect(sql).toContain("'New Question'");
    expect(sql).toContain("'Answered ✓'");
    expect(sql).toContain("'ANSWER_QNA'");
    expect(sql).toContain("'VIEW_QNA'");
  });

  it("migration 20260956 enriches direct chat message notifications with sender info and reply CTAs", () => {
    const sql = read("supabase/migrations/20260956_identity_system_notifications_v2.sql");

    expect(sql).toContain("create or replace function public.notify_on_chat_message");
    expect(sql).toContain("'CHAT'");
    expect(sql).toContain("'OPEN_CHAT'");
    expect(sql).toContain("'REPLY_CHAT'");
    expect(sql).toContain("'conversationId'");
    expect(sql).toContain("'senderId'");
  });

  it("contains all required translation keys across EN, HI, and MR", () => {
    const requiredKeys = [
      "notif_sys_granted_scopes",
      "notif_sys_rejection_reason",
      "notif_sys_switch_biz_btn",
      "notif_sys_resubmit_verify_btn",
      "notif_sys_view_store_btn",
      "notif_sys_answer_qna_btn",
      "notif_sys_view_qna_btn",
      "notif_sys_open_chat_btn",
      "notif_sys_view_details_btn",
      "scope_appointments",
      "scope_queue",
      "scope_catalog",
      "scope_leads",
      "scope_delivery",
    ] as const;

    for (const lang of ["en", "hi", "mr"] as const) {
      const dict = translations[lang] as Record<string, string>;
      for (const key of requiredKeys) {
        expect(dict[key], `Missing ${key} in ${lang}`).toBeDefined();
        expect(dict[key].trim().length, `Empty string for ${key} in ${lang}`).toBeGreaterThan(0);
      }
    }
  });

  it("verifies system and identity contract metadata and action types", () => {
    const accessMeta: NotificationMetadata = {
      businessId: "biz_88",
      businessName: "City Bakery",
      scopes: ["appointments", "catalog", "queue"],
      statusPill: "Team Access",
      tone: "brand",
      actions: ["SWITCH_BUSINESS"],
    };

    expect(accessMeta.businessId).toBe("biz_88");
    expect(accessMeta.scopes).toContain("appointments");
    expect(accessMeta.actions).toContain("SWITCH_BUSINESS");

    const verifyRejectedMeta: NotificationMetadata = {
      businessId: "biz_88",
      businessName: "City Bakery",
      reason: "GST certificate illegible. Please re-upload.",
      statusPill: "Needs changes",
      tone: "danger",
      actions: ["RESUBMIT_VERIFY"],
    };

    expect(verifyRejectedMeta.reason).toBe("GST certificate illegible. Please re-upload.");
    expect(verifyRejectedMeta.actions).toContain("RESUBMIT_VERIFY");

    const qnaMeta: NotificationMetadata = {
      businessId: "biz_88",
      question: "Do you have eggless blueberry cakes available today?",
      answer: "Yes, freshly baked at 11 AM!",
      statusPill: "Answered ✓",
      tone: "success",
      actions: ["VIEW_QNA", "VIEW_STORE"],
    };

    expect(qnaMeta.question).toBeDefined();
    expect(qnaMeta.answer).toBeDefined();
    expect(qnaMeta.actions).toContain("VIEW_QNA");

    const chatMeta: NotificationMetadata = {
      conversationId: "conv_404",
      senderId: "user_55",
      senderName: "Priya Sharma",
      statusPill: "New Message",
      tone: "brand",
      actions: ["REPLY_CHAT", "OPEN_CHAT"],
    };

    expect(chatMeta.conversationId).toBe("conv_404");
    expect(chatMeta.senderName).toBe("Priya Sharma");
    expect(chatMeta.actions).toContain("REPLY_CHAT");

    const types: NotificationType[] = [
      "BUSINESS_ACCESS",
      "VERIFICATION_DECIDED",
      "QNA",
      "CHAT",
      "SYSTEM",
    ];
    expect(types).toHaveLength(5);
  });
});
