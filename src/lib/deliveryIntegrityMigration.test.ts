import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 20261002 can't be run in CI (no database), so this pins what each P0 fix must keep containing. If someone edits a guard
 * out, the matching test names the gap (DLV-xxx) that just reopened.
 */
const read = (p: string) => readFileSync(resolve(__dirname, "../../", p), "utf8");
const sql = read("supabase/migrations/20261002_delivery_integrity.sql");
const rollback = read("supabase/rollbacks/20261002_delivery_integrity.rollback.sql");

/** The text of one function: from its `create or replace` to the end of its dollar-quoted body. */
function body(source: string, name: string): string {
  const start = source.search(new RegExp(`create or replace function public\\.${name}\\(`, "i"));
  expect(start, `${name} must be defined`).toBeGreaterThan(-1);
  const open = source.indexOf("$function$", start);
  const close = source.indexOf("$function$", open + 10);
  return source.slice(start, close + 10);
}

describe("20261002_delivery_integrity.sql", () => {
  it("revokes anon/public and grants authenticated on every function it defines", () => {
    const defined = [...sql.matchAll(/create or replace function public\.(\w+)\(/gi)].map((m) => m[1]);
    expect(new Set(defined).size).toBeGreaterThanOrEqual(12);
    for (const fn of new Set(defined)) {
      expect(sql, `${fn} must REVOKE`).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\)\\s+from public`, "i"));
    }
    for (const fn of new Set(defined.filter((f) => f !== "tg_cancel_delivery_on_order_cancel"))) {
      expect(sql, `${fn} must be granted`).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\)\\s+to authenticated`, "i"));
    }
  });

  it("DLV-010: cancelling an order cancels its live delivery, and a customer can't cancel once the rider is on the way", () => {
    expect(sql).toMatch(/create trigger trg_cancel_delivery_on_order_cancel\s+after update of status on public\.appointments/i);
    const trg = body(sql, "tg_cancel_delivery_on_order_cancel");
    expect(trg).toContain("status in ('ASSIGNED', 'EN_ROUTE', 'ARRIVED')");
    expect(trg).toContain("cancel_reason = 'ORDER_CANCELLED'");
    expect(trg).toContain("insert into public.notifications"); // the rider is told
    expect(body(sql, "appointment_transition")).toContain("raise exception 'DELIVERY_IN_PROGRESS'");
    expect(body(sql, "reschedule_appointment")).toContain("raise exception 'DELIVERY_IN_PROGRESS'");
    // the new actor/reason must be allowed by the table's own checks, or the trigger itself would fail
    expect(sql).toMatch(/cancelled_by = any \(array\['AGENT'::text, 'BUSINESS'::text, 'SYSTEM'::text\]\)/);
    expect(sql).toContain("'ORDER_CANCELLED'::text");
  });

  it("DLV-010: the rider-side steps refuse an order that is no longer accepted", () => {
    expect(body(sql, "appointment_update_delivery_status")).toContain("raise exception 'ORDER_NOT_ACTIVE'");
    expect(body(sql, "delivery_collect_cash")).toContain("raise exception 'ORDER_NOT_ACTIVE'");
  });

  it("DLV-011: a claim is goods + delivery fee, and only a real deposit may be lower", () => {
    const claim = body(sql, "appointment_claim_payment");
    expect(claim).toContain("v_appointment.package_price + coalesce(v_appointment.delivery_fee, 0)");
    expect(claim).toContain("b.deposit_percent");
    expect(claim).toMatch(/p_amount >= v_deposit_min/);
  });

  it("DLV-011: the rider collects the balance, and settlement sums what was actually collected", () => {
    const collect = body(sql, "delivery_collect_cash");
    expect(collect).toContain("v_due := v_total - v_paid");
    expect(collect).toContain("cash_collected_amount = v_due");
    expect(collect).not.toMatch(/if v_a\.payment_status = 'PAID' then raise exception 'ALREADY_PAID'/);
    expect(body(sql, "business_cash_to_settle")).toContain("coalesce(a.cash_collected_amount, a.payment_amount, 0)");
    expect(body(sql, "settle_agent_cash")).toContain("coalesce(a.cash_collected_amount, a.payment_amount, 0)");
    // nothing to collect while the customer's own claim awaits the shop's confirmation
    expect(body(sql, "my_deliveries")).toContain("when a.payment_status = 'PENDING_CONFIRM' then 0");
  });

  it("DLV-012: rescheduling keeps the fee and the out-of-area flag", () => {
    const r = body(sql, "reschedule_appointment");
    expect(r).toContain("delivery_fee, is_out_of_range");
    expect(r).toContain("v_original.delivery_fee");
  });

  it("DLV-016: a single delivery can be declined, only before it starts and only by its rider", () => {
    const d = body(sql, "decline_solo_delivery");
    expect(d).toContain("raise exception 'NOT_AGENT'");
    expect(d).toContain("v_row.batch_id is not null or v_row.status <> 'ASSIGNED'");
    expect(d).toContain("delete from public.appointment_deliveries");
    expect(d).toContain("'REASSIGN_DELIVERY'");
  });

  it("DLV-017: the rider gets the shop's number always, the customer's only once on the way, plus items and notes", () => {
    expect(sql).toMatch(/drop function if exists public\.my_deliveries\(\);\s+create or replace function public\.my_deliveries\(\)/i);
    const mine = body(sql, "my_deliveries");
    expect(mine).toContain("case when d.status in ('EN_ROUTE','ARRIVED') then cu.phone else null end");
    for (const col of ["customer_phone text", "business_phone text", "order_notes text", "requested_window text", "package_name text", "items jsonb"]) {
      expect(mine).toContain(col);
    }
    expect(mine).toContain("from public.appointment_items i");
  });

  it("DLV-022: the status machine has no skips, and a code only counts at the door", () => {
    const u = body(sql, "appointment_update_delivery_status");
    expect(u).toContain("p_status in ('LEAVING','ON_THE_WAY') and v_row.status not in ('ASSIGNED','EN_ROUTE')");
    expect(u).toContain("p_status = 'ARRIVED' and v_row.status not in ('EN_ROUTE','ARRIVED')");
    expect(u).toContain("p_status = 'DONE' and v_row.status <> 'ARRIVED'");
    expect(u).toContain("raise exception 'HANDOFF_NOT_VERIFIED'");
    const h = body(sql, "confirm_handoff");
    const guard = h.indexOf("v_row.status not in ('EN_ROUTE', 'ARRIVED')");
    expect(guard).toBeGreaterThan(-1);
    // the status check comes before any attempt is counted or locked
    expect(guard).toBeLessThan(h.indexOf("from public.handoff_attempts where delivery_id"));
  });

  it("DLV-021/020: assign needs an accepted delivery order, and a reassignment closes an emptied run", () => {
    const a = body(sql, "assign_delivery");
    expect(a).toContain("raise exception 'NOT_A_DELIVERY_ORDER'");
    expect(a).toContain("raise exception 'ORDER_NOT_ACCEPTED'");
    expect(a).toContain("update public.delivery_batches set status = 'COMPLETED'");
  });
});

describe("20261002 rollback", () => {
  it("drops what the migration added and restores the original constraints", () => {
    expect(rollback).toContain("drop trigger if exists trg_cancel_delivery_on_order_cancel");
    expect(rollback).toContain("drop function if exists public.decline_solo_delivery(text)");
    expect(rollback).toMatch(/cancelled_by = any \(array\['AGENT'::text, 'BUSINESS'::text\]\)/);
    expect(rollback).toContain("drop column if exists cash_collected_amount");
  });

  it("restores the previous bodies, free of every guard the migration added", () => {
    for (const added of ["DELIVERY_IN_PROGRESS", "ORDER_NOT_ACTIVE", "NOT_A_DELIVERY_ORDER", "ORDER_NOT_ACCEPTED", "v_old_batch", "customer_phone", "v_deposit_min"]) {
      expect(rollback, `${added} must not survive the rollback`).not.toContain(added);
    }
    expect(rollback).toMatch(/drop function if exists public\.my_deliveries\(\);/i);
    // the 20261001 shape comes back: a PAID order is simply "nothing due"
    expect(rollback).toContain("case when a.payment_status = 'PAID' then 0");
    // rows the trigger closed must be folded into allowed values before the narrower constraint is re-added
    expect(rollback.indexOf("where cancel_reason = 'ORDER_CANCELLED'")).toBeLessThan(
      rollback.indexOf("add constraint appointment_deliveries_cancel_reason_check"),
    );
  });
});
