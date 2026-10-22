import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The delivery migration can't be run in CI (no database), so this pins the contract the client depends on and the traps
 * this codebase has hit before: widening RETURNS TABLE needs a DROP first, a new parameter needs the old signature dropped,
 * every RPC revokes anon, and every migration ships a rollback.
 */
const read = (p: string) => readFileSync(resolve(__dirname, "../../", p), "utf8");
const sql = read("supabase/migrations/20261001_business_delivery_terms.sql");

describe("20261001_business_delivery_terms.sql", () => {
  it("drops the old appointment_create and my_deliveries before recreating them", () => {
    expect(sql).toMatch(/drop function if exists public\.appointment_create\(\s*text, text, timestamptz[^)]*text, integer, text\s*\);/i);
    const dropMy = sql.search(/drop function if exists public\.my_deliveries\(\);/i);
    const createMy = sql.search(/create or replace function public\.my_deliveries\(\)/i);
    expect(dropMy).toBeGreaterThan(-1);
    expect(createMy).toBeGreaterThan(dropMy);
  });

  it("revokes anon/public on every function it defines", () => {
    const defined = [...sql.matchAll(/create or replace function public\.(\w+)\(/gi)].map((m) => m[1]);
    expect(defined.length).toBeGreaterThanOrEqual(8);
    for (const fn of new Set(defined)) {
      expect(sql, `${fn} must REVOKE ... FROM public, anon`).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\)\\s+from public, anon`, "i"));
      expect(sql, `${fn} must be granted to authenticated`).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\)\\s+to authenticated`, "i"));
    }
  });

  it("enforces the minimum order and snapshots the fee on the order", () => {
    expect(sql).toContain("raise exception 'DELIVERY_MIN_ORDER'");
    expect(sql).toMatch(/delivery_fee, is_asap/);
    expect(sql).toContain("ASAP_REQUIRES_DELIVERY");
  });

  it("keeps every new column additive, so existing rows and old clients are unaffected", () => {
    const adds = [...sql.matchAll(/add column if not exists (\w+) ([^,;]+)/gi)];
    expect(adds.length).toBeGreaterThanOrEqual(10);
    for (const [, col, def] of adds) {
      const nullable = !/not null/i.test(def);
      const hasDefault = /default/i.test(def);
      expect(nullable || hasDefault, `${col} must be nullable or have a default`).toBe(true);
    }
  });

  it("has a rollback that restores the previous signatures and drops the new objects", () => {
    const rb = read("supabase/rollbacks/20261001_business_delivery_terms.rollback.sql");
    for (const fn of ["business_delivery_stats", "settle_agent_cash", "business_cash_to_settle", "delivery_collect_cash", "business_delivery_queue", "mark_order_ready"]) {
      expect(rb).toContain(`drop function if exists public.${fn}(`);
    }
    expect(rb).toMatch(/create or replace function public\.appointment_create\([\s\S]*?p_target_package_key text default null::text\s*\)/i);
    expect(rb).not.toMatch(/p_asap/);
    expect(rb).toContain("drop column if exists delivery_radius_km");
  });
});
