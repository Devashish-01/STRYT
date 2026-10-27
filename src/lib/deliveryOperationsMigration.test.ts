import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 20261003 can't be run in CI (no database), so this pins what each fix must keep containing; a missing guard names the
 * gap (DLV-xxx) that just reopened. It also checks the two traps this codebase has hit before: a widened RETURNS TABLE
 * needs a DROP first, and every RPC revokes anon.
 */
const read = (p: string) => readFileSync(resolve(__dirname, "../../", p), "utf8");
const sql = read("supabase/migrations/20261003_delivery_operations.sql");
const rollback = read("supabase/rollbacks/20261003_delivery_operations.rollback.sql");

function body(source: string, name: string): string {
  const start = source.search(new RegExp(`create or replace function public\\.${name}\\(`, "i"));
  expect(start, `${name} must be defined`).toBeGreaterThan(-1);
  const open = source.indexOf("$function$", start);
  const close = source.indexOf("$function$", open + 10);
  return source.slice(start, close + 10);
}

describe("20261003_delivery_operations.sql", () => {
  it("revokes anon/public on every function it defines", () => {
    const defined = [...sql.matchAll(/create or replace function public\.(\w+)\(/gi)].map((m) => m[1]);
    expect(new Set(defined).size).toBeGreaterThanOrEqual(20);
    for (const fn of new Set(defined)) {
      expect(sql, `${fn} must REVOKE`).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\)\\s+from public`, "i"));
    }
  });

  it("drops each function whose RETURNS TABLE it widens before recreating it", () => {
    for (const fn of ["my_deliveries()", "business_active_deliveries(text)", "my_delivery_progress(text)"]) {
      const name = fn.split("(")[0];
      const drop = sql.search(new RegExp(`drop function if exists public\\.${name.replace(/[()]/g, "")}\\(`, "i"));
      const create = sql.search(new RegExp(`create or replace function public\\.${name}\\(`, "i"));
      expect(drop, `${fn} drop`).toBeGreaterThan(-1);
      expect(create, `${fn} create`).toBeGreaterThan(drop);
    }
  });

  it("DLV-018: nothing starts before pick-up, and pick-up covers the whole run", () => {
    const u = body(sql, "appointment_update_delivery_status");
    expect(u).toContain("raise exception 'NOT_PICKED_UP'");
    expect(u).toContain("started_at = case when v_new = 'EN_ROUTE'");
    expect(u).toContain("arrived_at = case when v_new = 'ARRIVED'");
    const p = body(sql, "delivery_mark_picked_up");
    expect(p).toContain("raise exception 'NOT_AGENT'");
    expect(p).toContain("d.batch_id = v_row.batch_id");
    expect(p).toContain("raise exception 'ORDER_NOT_ACTIVE'");
  });

  it("DLV-013: a delivery finished with money owed is recorded, listed, and clearable by the shop", () => {
    expect(body(sql, "appointment_update_delivery_status")).toContain("set cash_outstanding_amount = v_due");
    const list = body(sql, "business_cash_outstanding");
    expect(list).toContain("a.cash_outstanding_amount > 0");
    expect(list).toContain("has_business_scope");
    const pay = body(sql, "mark_outstanding_paid");
    expect(pay).toContain("raise exception 'NOTHING_OUTSTANDING'");
    expect(pay).toContain("cash_outstanding_amount = null");
  });

  it("DLV-014: delivery orders don't count towards the daily limit, and the day is the IST day", () => {
    const f = body(sql, "enforce_customer_daily_appointment_limit");
    expect(f).toContain("new.fulfillment_type = 'DELIVERY'");
    expect(f).toContain("a.fulfillment_type is distinct from 'DELIVERY'");
    expect(f).toContain("Asia/Kolkata");
  });

  it("DLV-015: unanswered ASAP orders are nudged at 10 minutes, cancelled at 30, and both are scheduled", () => {
    expect(body(sql, "nudge_pending_asap_orders")).toContain("interval '10 minutes'");
    const exp = body(sql, "expire_stale_asap_orders");
    expect(exp).toContain("interval '30 minutes'");
    expect(exp).toContain("cancelled_by = 'SYSTEM'");
    expect(sql).toMatch(/cron\.schedule\('nudge-pending-asap-orders'/);
    expect(sql).toMatch(/cron\.schedule\('expire-stale-asap-orders'/);
  });

  it("DLV-019/038: position carries a time and writes are rate limited", () => {
    for (const fn of ["update_delivery_position", "update_delivery_batch_position"]) {
      const f = body(sql, fn);
      expect(f, fn).toContain("position_at = now()");
      expect(f, fn).toContain("interval '2 seconds'");
    }
    expect(body(sql, "business_active_deliveries")).toContain("coalesce(batch.position_at, d.position_at)");
  });

  it("DLV-033/034: the customer gets minutes and the shop's phone, never a coordinate", () => {
    const f = body(sql, "my_delivery_progress");
    expect(f).toContain("eta_minutes integer, business_phone text, picked_up boolean");
    expect(f).toContain("interval '5 minutes'"); // only from a fresh position
    expect(f).toContain("ST_Distance");
    // the position columns are used inside the calculation but never selected out as columns of the result
    expect(f).not.toMatch(/returns table\([^)]*\b(lat|lng|latitude|longitude)\b/i);
  });

  it("DLV-035: the public link shows a cancelled delivery, and only the rider's first name with no photo", () => {
    const f = body(sql, "get_tracking");
    expect(f).toContain("then 'CANCELLED'");
    expect(f).toContain("public.person_first_name(d.agent_user_id)");
    expect(f).toContain("null::text,"); // avatar column is null for deliveries
    expect(sql).toMatch(/grant execute on function public\.get_tracking\(text\) to anon, authenticated/i);
  });

  it("DLV-027: a failed delivery tells every manager, says why to the customer, and offers 'I'm ready'", () => {
    const c = body(sql, "cancel_delivery");
    expect(c).toContain("public.business_manager_ids(v_row.business_id)");
    expect(c).toContain("'READY_FOR_REDELIVERY'");
    expect(c).toContain("We couldn''t reach you");
    const r = body(sql, "customer_ready_for_redelivery");
    expect(r).toContain("raise exception 'NOT_YOUR_BOOKING'");
    expect(r).toContain("interval '10 minutes'"); // throttled
    expect(body(sql, "decline_solo_delivery")).toContain("business_manager_ids");
    expect(body(sql, "decline_delivery_batch")).toContain("business_manager_ids");
  });

  it("DLV-023: accepting a run validates the stop order", () => {
    const f = body(sql, "accept_delivery_batch");
    expect(f).toContain("raise exception 'INVALID_STOP_ORDER'");
    expect(f).toContain("count(distinct x)");
  });

  it("DLV-029: ending a rider's access takes back unstarted deliveries and warns about the rest", () => {
    expect(sql).toMatch(/create trigger trg_unassign_deliveries_on_access_end\s+after update of status on public\.business_access_sessions/i);
    const f = body(sql, "tg_unassign_deliveries_on_access_end");
    expect(f).toContain("if r.status = 'ASSIGNED' then");
    expect(f).toContain("delete from public.appointment_deliveries");
    expect(f).toContain("business_manager_ids");
  });

  it("D6: staff with the appointments scope can read runs", () => {
    expect(sql).toMatch(/create policy delivery_batches_select[\s\S]*has_business_scope\(business_id, \(\(select auth\.uid\(\)\)\)::text, 'appointments'\)/);
  });

  it("DLV-041: the admin overview refuses anyone who isn't an admin", () => {
    const f = body(sql, "admin_delivery_overview");
    expect(f).toContain("if not public.is_admin() then raise exception 'NOT_ALLOWED'");
  });

  it("DLV-043: the delivery funnel names it introduced are all whitelisted", () => {
    // 20261009 moved the lifecycle steps to database triggers; only delivery_declined is still sent by the client.
    // This pins what 20261003 itself shipped, so old native builds that still send these names keep landing.
    for (const e of ["delivery_packed", "delivery_assigned", "delivery_picked_up", "delivery_started", "delivery_arrived",
                     "delivery_delivered", "delivery_failed", "delivery_declined", "delivery_cash_collected", "delivery_cash_settled"]) {
      expect(sql, `${e} must be whitelisted`).toContain(`'${e}'`);
    }
    // and the existing names are kept
    for (const e of ["otp_sent", "otp_verified", "otp_failed", "booking_created"]) expect(sql).toContain(`'${e}'`);
  });
});

describe("20261003 rollback", () => {
  it("unschedules the jobs, drops what the migration added and removes the new columns", () => {
    expect(rollback).toContain("cron.unschedule('nudge-pending-asap-orders')");
    expect(rollback).toContain("cron.unschedule('expire-stale-asap-orders')");
    for (const gone of ["delivery_mark_picked_up(text)", "customer_ready_for_redelivery(text)", "admin_delivery_overview()", "mark_outstanding_paid(text)", "business_cash_outstanding(text)", "business_manager_ids(text)", "person_first_name(text)"]) {
      expect(rollback, gone).toContain(`drop function if exists public.${gone}`);
    }
    expect(rollback).toContain("drop trigger if exists trg_unassign_deliveries_on_access_end");
    expect(rollback).toContain("drop column if exists cash_outstanding_amount");
    expect(rollback).toContain("drop column if exists picked_up_at");
  });

  it("restores the previous bodies, free of the guards this migration added", () => {
    for (const added of ["NOT_PICKED_UP", "INVALID_STOP_ORDER", "READY_FOR_REDELIVERY", "person_first_name(d.agent_user_id)", "interval '2 seconds'"]) {
      const lines = rollback.split("\n").filter((l) => l.includes(added) && !l.trimStart().startsWith("--") && !l.includes("drop function"));
      expect(lines, `${added} must not survive the rollback`).toEqual([]);
    }
    expect(rollback).toMatch(/drop function if exists public\.my_delivery_progress\(text\);/i);
    // the original whitelist and policy come back
    expect(rollback).not.toContain("'delivery_packed'");
    expect(rollback).toMatch(/create policy delivery_batches_select[\s\S]*'delivery'\)\s*\);/);
  });
});
