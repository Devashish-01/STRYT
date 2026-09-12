import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { translations } from "./i18n";
import type { NotificationMetadata, NotificationType } from "@/types";

const ROOT = path.resolve(__dirname, "..", "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Group 9: Proposals, Quotes & Bargain Counteroffers Notifications", () => {
  it("migration 20260955 enriches notify_on_proposal with actionable quote CTAs and metadata", () => {
    const sql = read("supabase/migrations/20260955_proposal_notifications_v2.sql");

    expect(sql).toContain("create or replace function public.notify_on_proposal");
    expect(sql).toContain("'PROPOSAL'");
    expect(sql).toContain("'New Quote'");
    expect(sql).toContain("'VIEW_QUOTE'");
    expect(sql).toContain("'ACCEPT_QUOTE'");
    expect(sql).toContain("'COUNTER_QUOTE'");
    expect(sql).toContain("'quotedPrice'");
  });

  it("migration 20260955 enriches notify_on_proposal_broadcast for group-buy me-toos", () => {
    const sql = read("supabase/migrations/20260955_proposal_notifications_v2.sql");

    expect(sql).toContain("create or replace function public.notify_on_proposal_broadcast");
    expect(sql).toContain("'QUOTE_BROADCAST'");
    expect(sql).toContain("'Group Deal'");
    expect(sql).toContain("'JOIN_DEAL'");
  });

  it("migration 20260955 stamps entity scoping and rich metadata on counter-offers", () => {
    const sql = read("supabase/migrations/20260955_proposal_notifications_v2.sql");

    expect(sql).toContain("create or replace function public.proposal_submit_counter");
    expect(sql).toContain("'PROPOSAL_COUNTER'");
    expect(sql).toContain("v_entity_type");
    expect(sql).toContain("v_entity_id");
    expect(sql).toContain("'ACCEPT_COUNTER'");
    expect(sql).toContain("'DECLINE_COUNTER'");
    expect(sql).toContain("'counterId'");
  });

  it("migration 20260955 stamps entity scoping and CTAs on agreement acceptance and payments", () => {
    const sql = read("supabase/migrations/20260955_proposal_notifications_v2.sql");

    expect(sql).toContain("create or replace function public.accept_proposal");
    expect(sql).toContain("create or replace function public.accept_proposal_counter");
    expect(sql).toContain("create or replace function public.agreement_claim_payment");
    expect(sql).toContain("create or replace function public.agreement_confirm_payment");
    expect(sql).toContain("create or replace function public.agreement_reject_payment");

    expect(sql).toContain("'CONFIRM_PAYMENT'");
    expect(sql).toContain("'REJECT_PAYMENT'");
    expect(sql).toContain("'Verify Payment'");
    expect(sql).toContain("'Payment Confirmed ✓'");
    expect(sql).toContain("'Payment Rejected'");
  });

  it("requestService.nudgePayment sends AGREEMENT notification with rich payment metadata", () => {
    const ts = read("src/services/engagement/requestService.ts");

    expect(ts).toContain("amountLabel: \"Payment Due\"");
    expect(ts).toContain("statusPill: \"Pay Now\"");
    expect(ts).toContain("actions: [\"PAY\", \"VIEW_AGREEMENT\"]");
  });

  it("contains all required translation keys across EN, HI, and MR", () => {
    const requiredKeys = [
      "notif_prop_counter_label",
      "notif_prop_broadcast_label",
      "notif_prop_agreement_label",
      "notif_prop_request_label",
      "notif_prop_quote_label",
      "notif_prop_deal_partner",
      "notif_prop_counter_price",
      "notif_prop_agreed_price",
      "notif_prop_quoted_price",
      "notif_prop_pill_counter",
      "notif_prop_pill_active",
      "notif_prop_pill_quote",
      "notif_prop_on_prefix",
      "notif_prop_accept_btn",
      "notif_prop_accept_counter_btn",
      "notif_prop_decline_btn",
      "notif_prop_counter_btn",
      "notif_prop_join_btn",
      "notif_prop_confirm_payment_btn",
      "notif_prop_reject_payment_btn",
      "notif_prop_view_quote_btn",
      "notif_prop_view_agreement_btn",
      "notif_prop_view_request_btn",
      "notif_prop_send_quote_btn",
      "notif_prop_accepted_toast",
      "notif_prop_counter_accepted_toast",
      "notif_prop_counter_declined_toast",
      "notif_prop_payment_confirmed_toast",
      "notif_prop_payment_rejected_toast",
      "notif_prop_joined_deal_toast",
    ] as const;

    for (const lang of ["en", "hi", "mr"] as const) {
      const dict = translations[lang] as Record<string, string>;
      for (const key of requiredKeys) {
        expect(dict[key], `Missing ${key} in ${lang}`).toBeDefined();
        expect(dict[key].trim().length, `Empty string for ${key} in ${lang}`).toBeGreaterThan(0);
      }
    }
  });

  it("verifies proposal contract metadata and action types", () => {
    const proposalMeta: NotificationMetadata = {
      requestId: "req_101",
      requestTitle: "Fix bathroom tap leakage",
      proposalId: "prop_202",
      proposerName: "Ramesh Plumbing Works",
      quotedPrice: 450,
      amount: 450,
      amountLabel: "Quoted",
      message: "Can come today by 4 PM with replacement parts.",
      statusPill: "New Quote",
      tone: "brand",
      actions: ["VIEW_QUOTE", "ACCEPT_QUOTE", "COUNTER_QUOTE"],
    };

    expect(proposalMeta.quotedPrice).toBe(450);
    expect(proposalMeta.actions).toContain("ACCEPT_QUOTE");
    expect(proposalMeta.actions).toContain("COUNTER_QUOTE");

    const counterMeta: NotificationMetadata = {
      requestId: "req_101",
      counterId: "cnt_303",
      proposalId: "prop_202",
      amount: 380,
      counterPrice: 380,
      amountLabel: "Counter-offer",
      message: "Would ₹380 work for this job?",
      statusPill: "Counter-offer",
      tone: "warning",
      actions: ["ACCEPT_COUNTER", "DECLINE_COUNTER", "VIEW_QUOTE"],
    };

    expect(counterMeta.counterPrice).toBe(380);
    expect(counterMeta.actions).toContain("ACCEPT_COUNTER");
    expect(counterMeta.actions).toContain("DECLINE_COUNTER");

    const types: NotificationType[] = [
      "PROPOSAL",
      "PROPOSAL_COUNTER",
      "QUOTE_BROADCAST",
      "AGREEMENT",
      "NEARBY_REQUEST",
    ];
    expect(types).toHaveLength(5);
  });
});
