import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EVENTS } from "./analytics";

/**
 * 20261009 can't be run in CI (no database), so this pins what it must keep containing: every function revokes
 * anon/public and pins search_path, no trigger dumps a whole row into props, the whitelist and the two writers agree,
 * and the rollback undoes what the migration added. See .telemetry/tracking-plan.yaml for the contract.
 */
const read = (p: string) => readFileSync(resolve(__dirname, "../../", p), "utf8");
const sql = read("supabase/migrations/20261009_analytics_v1.sql");
const rollback = read("supabase/rollbacks/20261009_analytics_v1.rollback.sql");

const whitelist = (() => {
  const m = sql.match(/add constraint events_name_known check \(name in \(([\s\S]*?)\)\);/);
  expect(m, "events_name_known must be redefined").not.toBeNull();
  return new Set([...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]));
})();

const emitted = new Set([...sql.matchAll(/emit_event\('([a-z_]+)'/g)].map((m) => m[1]));
const clientNames = Object.values(EVENTS) as string[];
const LEGACY = ["delivery_packed", "delivery_assigned", "delivery_picked_up", "delivery_started", "delivery_arrived",
                "delivery_delivered", "delivery_failed"];

describe("20261009_analytics_v1.sql", () => {
  it("revokes anon/public on every function it defines and pins search_path on every SECURITY DEFINER", () => {
    const defined = [...sql.matchAll(/create or replace function public\.(\w+)\(/gi)].map((m) => m[1]);
    expect(new Set(defined).size).toBeGreaterThanOrEqual(12);
    for (const fn of new Set(defined)) {
      expect(sql, `${fn} must REVOKE`).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\)\\s+from public`, "i"));
    }
    const definers = sql.split(/create or replace function /i).slice(1).filter((b) => /security definer/i.test(b.split("$function$")[0]));
    for (const head of definers) expect(head.split("$function$")[0]).toMatch(/set search_path to 'public'/);
  });

  it("never lets a client run the database writer", () => {
    expect(sql).toMatch(/revoke all on function public\.emit_event\(text, jsonb, text, text, text\) from public, anon, authenticated/);
    expect(sql).not.toMatch(/grant execute on function public\.emit_event/i);
    // and client rows cannot claim to be database rows
    expect(sql).toMatch(/events_insert_guest[\s\S]*?source = 'client'/);
    expect(sql).toMatch(/events_insert_own[\s\S]*?source = 'client'/);
  });

  it("builds props column by column — never a whole row, which carries names, phones and coordinates", () => {
    const code = sql.replace(/--.*$/gm, "");   // the header comment itself names the rule
    expect(code).not.toMatch(/to_jsonb\(\s*(new|old)\s*\)/i);
    expect(code).not.toMatch(/row_to_json\(\s*(new|old)\s*\)/i);
    for (const col of ["customer_name", "delivery_address_line", "delivery_lat", "handoff_code", "cancel_note", "comment", "message"]) {
      expect(code, `${col} must not reach props`).not.toContain(`'${col}', new.`);
    }
  });

  it("whitelists exactly the 28 plan events plus the legacy delivery names", () => {
    expect(whitelist.size).toBe(28 + LEGACY.length);
    for (const e of LEGACY) expect(whitelist.has(e), e).toBe(true);
  });

  it("whitelists every client event and every database event", () => {
    for (const e of clientNames) expect(whitelist.has(e), `client ${e}`).toBe(true);
    for (const e of emitted) expect(whitelist.has(e), `db ${e}`).toBe(true);
  });

  it("gives every event exactly one writer — a name the client sends is never emitted by a trigger", () => {
    for (const e of clientNames) expect(emitted.has(e), `${e} has two writers`).toBe(false);
  });

  it("emits every Release 1 database event", () => {
    for (const e of ["request_created", "proposal_created", "proposal_accepted", "booking_created", "deal_completed",
                     "dispute_opened", "review_left", "delivery_status_changed", "delivery_cash_collected", "delivery_cash_settled"]) {
      expect(emitted.has(e), e).toBe(true);
    }
  });

  it("records deal_completed for all three ways a deal finishes, each with its customer", () => {
    for (const t of ["request", "appointment", "queue"]) expect(sql).toContain(`'deal_type', '${t}'`);
    expect(sql.match(/'customer_id', new\./g)?.length).toBe(3);
  });

  it("keeps a seller's quote and free text out of proposal_created", () => {
    const start = sql.indexOf("function public.analytics_proposals_ai()");
    const body = sql.slice(start, sql.indexOf("$function$;", start));
    expect(body).not.toMatch(/'price'|new\.message/);
  });

  it("drops internal users for both writers", () => {
    expect(sql).toMatch(/create trigger trg_events_drop_internal before insert on public\.events/);
    expect(sql).toMatch(/roles && array\['admin', 'super_admin'\]/);
  });
});

describe("20261009 rollback", () => {
  it("drops every trigger and function the migration added", () => {
    for (const t of [...sql.matchAll(/create trigger (\w+)/g)].map((m) => m[1])) {
      expect(rollback, t).toContain(`drop trigger if exists ${t}`);
    }
    for (const fn of ["emit_event(text, jsonb, text, text, text)", "analytics_actor_role(text, text)", "analytics_minutes_since(timestamptz)",
                      "events_drop_internal()", "analytics_deliveries_aiu()", "analytics_appointments_aiu()"]) {
      expect(rollback, fn).toContain(`drop function if exists public.${fn}`);
    }
  });

  it("restores settle_agent_cash without the emit, and drops the new columns", () => {
    const start = rollback.indexOf("create or replace function public.settle_agent_cash");
    expect(start).toBeGreaterThan(-1);
    expect(rollback.slice(start, rollback.indexOf("$function$;", start))).not.toContain("emit_event");
    for (const col of ["source", "platform", "seller_type", "seller_id", "actor_role"]) {
      expect(rollback).toContain(`drop column if exists ${col}`);
    }
  });
});
