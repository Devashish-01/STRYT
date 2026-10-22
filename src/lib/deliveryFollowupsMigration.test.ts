import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 20261004 can't run in CI (no database), so this pins what its two features must keep containing. The hours functions are
 * checked behaviourally against a real Postgres when the migration is applied; here we guard the wiring and the traps this
 * codebase has hit before (anon grants, widened RETURNS TABLE, an applied file being edited).
 */
const read = (p: string) => readFileSync(resolve(__dirname, "../../", p), "utf8");
const sql = read("supabase/migrations/20261004_delivery_followups.sql");
const rollback = read("supabase/rollbacks/20261004_delivery_followups.rollback.sql");

function body(source: string, name: string): string {
  const start = source.search(new RegExp(`create or replace function public\\.${name}\\(`, "i"));
  expect(start, `${name} must be defined`).toBeGreaterThan(-1);
  const open = source.indexOf("$function$", start);
  const close = source.indexOf("$function$", open + 10);
  return source.slice(start, close + 10);
}

describe("20261004_delivery_followups.sql", () => {
  it("never grants to anon or public, and keeps the internal helpers away from clients entirely", () => {
    for (const fn of ["delivery_record_proof", "delivery_proof", "appointment_update_delivery_status"]) {
      expect(sql, fn).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\)\\s+from public, anon`, "i"));
      expect(sql, fn).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\)\\s+to authenticated`, "i"));
    }
    for (const fn of ["hours_minutes", "hours_range_hit", "hours_open_at"]) {
      expect(sql, fn).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\)\\s+from public, anon, authenticated`, "i"));
    }
    expect(sql).not.toMatch(/grant execute[^;]*\bto\s+(anon|public)\b/i);
  });

  it("replaces appointment_create under its existing signature, so no ambiguous overload is left behind", () => {
    expect(sql).not.toMatch(/drop function if exists public\.appointment_create/i);
    expect(sql).toMatch(/revoke all on function public\.appointment_create\(\s*text, text, timestamptz, text, text, text, text, text, text, numeric, jsonb, text, text,\s*double precision, double precision, text, integer, text, boolean\s*\) from public, anon/);
  });

  it("DLV-016: ASAP is refused while closed, in the same order of precedence the order sheet uses", () => {
    const f = body(sql, "appointment_create");
    expect(f).toContain("raise exception 'SHOP_CLOSED'");
    expect(f).toContain("v_until > now()"); // a manual "open until" wins
    expect(f).toContain("v_manual = false"); // then the owner's switch
    expect(f).toContain("public.hours_open_at(v_hours, now()) = false"); // then the posted hours; NULL (unreadable) stays open
    expect(f).toContain("if v_asap and p_target_type = 'BUSINESS'");
    // everything the previous version enforced is still there
    for (const kept of ["DELIVERY_MIN_ORDER", "DELIVERY_NOT_OFFERED", "ASAP_REQUIRES_DELIVERY", "DELIVERY_ADDRESS_REQUIRED", "NOT_ACCEPTING_APPOINTMENTS", "INVALID_APPOINTMENT_TIME"]) {
      expect(f, kept).toContain(kept);
    }
  });

  it("the hours reader fails open and works in the shop's own time zone", () => {
    const f = body(sql, "hours_open_at");
    expect(f).toContain("Asia/Kolkata");
    expect(f).toContain("exception when others then");
    expect(f).toMatch(/return null/);
    expect(f).toContain("Open 24×7");
  });

  it("DLV-009: proof needs the shop's opt-in, a prepaid order, an arrived rider who waited, and the rider's own upload", () => {
    const f = body(sql, "delivery_record_proof");
    expect(f).toContain("raise exception 'NOT_AGENT'");
    expect(f).toContain("v_row.status <> 'ARRIVED'");
    expect(f).toContain("raise exception 'PROOF_NOT_ALLOWED'");
    expect(f).toContain("raise exception 'PROOF_REQUIRES_PREPAID'");
    expect(f).toContain("raise exception 'PROOF_TOO_EARLY'");
    expect(f).toContain("interval '5 minutes'");
    expect(f).toContain("'/uploads/' || v_uid || '/delivery-proof/'"); // not just any URL
    expect(f).toContain("raise exception 'ORDER_NOT_ACTIVE'");
    expect(sql).toMatch(/add column if not exists delivery_proof_allowed boolean not null default false/); // off unless the shop opts in
  });

  it("DLV-009: a recorded photo stands in for the handoff code — and only that guard is relaxed", () => {
    const f = body(sql, "appointment_update_delivery_status");
    expect(f).toContain("not v_row.handoff_verified and v_row.proof_photo_url is null");
    expect(f).toContain("raise exception 'HANDOFF_NOT_VERIFIED'");
    for (const kept of ["NOT_PICKED_UP", "ORDER_NOT_ACTIVE", "INVALID_TRANSITION", "BATCH_NOT_ACCEPTED", "cash_outstanding_amount = v_due"]) {
      expect(f, kept).toContain(kept);
    }
    expect(f).toContain("'leftAtDoor', v_row.proof_photo_url is not null");
    // the rider still never receives the customer's code
    expect(f).toContain("v_row.handoff_code := null");
  });

  it("DLV-009: the photo is shown to the rider, the customer and the shop's managers — and to the customer only once delivered", () => {
    const f = body(sql, "delivery_proof");
    expect(f).toContain("raise exception 'NOT_ALLOWED'");
    expect(f).toContain("public.business_manager_ids(v_row.business_id)");
    expect(f).toContain("v_is_agent or v_row.status = 'DELIVERED'");
  });
});

describe("20261004 rollback", () => {
  it("restores both replaced functions without the new guards, and drops everything added", () => {
    for (const added of ["SHOP_CLOSED", "hours_open_at", "proof_photo_url", "leftAtDoor"]) {
      const lines = rollback.split("\n").filter((l) => l.includes(added) && !l.trimStart().startsWith("--") && !/^(drop|alter)|^\s+drop column/i.test(l.trim()));
      expect(lines, `${added} must not survive the rollback`).toEqual([]);
    }
    for (const gone of ["delivery_proof(text)", "delivery_record_proof(text, text, text)", "hours_open_at(text, timestamptz)", "hours_range_hit(integer, integer, integer, boolean)", "hours_minutes(text)"]) {
      expect(rollback, gone).toContain(`drop function if exists public.${gone}`);
    }
    expect(rollback).toContain("drop column if exists delivery_proof_allowed");
    expect(rollback).toMatch(/create or replace function public\.appointment_create\(/);
    expect(rollback).toMatch(/create or replace function public\.appointment_update_delivery_status\(/);
  });
});
