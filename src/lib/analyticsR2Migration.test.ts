import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EVENTS } from "./analytics";

/**
 * 20261010 can't be run in CI (no database), so this pins its contract the same way analyticsV1Migration.test.ts
 * pins 20261009: revokes and search_path on every function, props built column by column, one writer per event,
 * every Release 2 database event emitted, and a rollback that restores the Release 1 definitions.
 */
const read = (p: string) => readFileSync(resolve(__dirname, "../../", p), "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/20261010_analytics_r2.sql");
const v1 = read("supabase/migrations/20261009_analytics_v1.sql");
const rollback = read("supabase/rollbacks/20261010_analytics_r2.rollback.sql");
const code = sql.replace(/--.*$/gm, "");

const whitelist = (() => {
  const m = v1.match(/add constraint events_name_known check \(name in \(([\s\S]*?)\)\);/);
  return new Set([...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]));
})();
const emitted = new Set([...sql.matchAll(/emit_event\('([a-z_]+)'/g)].map((m) => m[1]));
const clientNames = Object.values(EVENTS) as string[];

const body = (fn: string) => {
  const start = code.indexOf(`function public.${fn}()`);
  expect(start, fn).toBeGreaterThan(-1);
  return code.slice(start, code.indexOf("$function$;", start));
};

describe("20261010_analytics_r2.sql", () => {
  it("revokes anon/public on every function and pins search_path on every SECURITY DEFINER", () => {
    const defined = [...new Set([...sql.matchAll(/create or replace function public\.(\w+)\(/gi)].map((m) => m[1]))];
    expect(defined.length).toBe(9);
    for (const fn of defined) {
      expect(sql, `${fn} must REVOKE`).toMatch(new RegExp(`revoke all on function public\\.${fn}\\(\\) from public, anon, authenticated`));
    }
    for (const head of sql.split(/create or replace function /i).slice(1).map((b) => b.split("$function$")[0])) {
      expect(head).toMatch(/security definer/);
      expect(head).toMatch(/set search_path to 'public'/);
    }
  });

  it("emits every Release 2 database event, all already whitelisted, none also sent by the client", () => {
    for (const e of ["agreement_cancelled", "booking_cancelled", "seller_created", "seller_verified", "team_member_added",
                     "conversation_started", "community_post_created"]) {
      expect(emitted.has(e), e).toBe(true);
    }
    for (const e of emitted) expect(whitelist.has(e), e).toBe(true);
    for (const e of clientNames) expect(emitted.has(e), `${e} has two writers`).toBe(false);
  });

  it("keeps every Release 1 branch of the functions it replaces", () => {
    for (const marker of ["'proposal_accepted'", "'deal_type', 'request'", "'dispute_opened'", "'deal_type', 'appointment'",
                          "'status', 'packed'", "'delivery_cash_collected'", "'deal_type', 'queue'"]) {
      expect(code, marker).toContain(marker);
    }
    expect(code.match(/'customer_id', new\./g)?.length).toBe(3);
  });

  it("builds props column by column — no whole rows, names, text, media or coordinates", () => {
    expect(code).not.toMatch(/to_jsonb\(\s*(new|old)\s*\)|row_to_json\(\s*(new|old)\s*\)/i);
    for (const col of ["subject_name", "subject_avatar", "last_message_preview", "title", "body", "area", "lat", "lng",
                       "author_name", "phone", "name", "created_ip"]) {
      expect(code, `${col} must not reach props`).not.toMatch(new RegExp(`'\\w+', new\\.${col}\\b`));
    }
  });

  it("uses the real column values: APPROVED, LEFT/EXPIRED, the three appointment endings", () => {
    expect(body("analytics_businesses_aiu")).toContain("verification_status = 'APPROVED'");
    expect(body("analytics_providers_aiu")).toContain("verification_status = 'APPROVED'");
    expect(body("analytics_queue_tokens_aiu")).toContain("in ('LEFT', 'EXPIRED')");
    expect(body("analytics_appointments_aiu")).toContain("in ('REJECTED', 'CANCELLED', 'NO_SHOW')");
  });

  it("counts a team member once, not on every delegated sign-in", () => {
    const b = body("analytics_access_sessions_aiu");
    expect(b).toMatch(/old\.status = 'ACTIVE'/);
    expect(b).toMatch(/s\.status in \('ACTIVE', 'EXPIRED', 'REVOKED'\)/);
  });

  it("keeps admin-caused marketplace facts without recording the admin, and still drops everything else", () => {
    const b = body("events_drop_internal");
    expect(b).toContain("new.name in ('seller_verified', 'agreement_cancelled')");
    expect(b).toContain("new.user_id := null");
    expect(b).toContain("new.actor_role := 'system'");
    expect(b).toMatch(/return null;\s*end if;\s*return new;/);
  });

  it("recreates the snapshot with the unique index the concurrent refresh needs", () => {
    expect(code).toMatch(/create materialized view analytics\.seller_snapshot/);
    expect(code).toMatch(/create unique index seller_snapshot_pk on analytics\.seller_snapshot \(seller_type, seller_id\)/);
    expect(code).not.toContain("business_team_members");
  });
});

describe("20261010 rollback", () => {
  it("drops every trigger and function the migration added", () => {
    for (const t of [...sql.matchAll(/create trigger (\w+)/g)].map((m) => m[1])) {
      expect(rollback, t).toContain(`drop trigger if exists ${t}`);
    }
    for (const fn of ["analytics_businesses_aiu", "analytics_providers_aiu", "analytics_access_sessions_aiu",
                      "analytics_conversations_ai", "analytics_community_posts_ai"]) {
      expect(rollback, fn).toContain(`drop function if exists public.${fn}()`);
    }
  });

  it("restores the Release 1 bodies verbatim", () => {
    for (const fn of ["events_drop_internal", "analytics_agreements_aiu", "analytics_appointments_aiu", "analytics_queue_tokens_aiu"]) {
      const start = v1.indexOf(`create or replace function public.${fn}(`);
      const block = v1.slice(start, v1.indexOf("$function$;", start));
      expect(rollback, fn).toContain(block);
    }
    expect(rollback).not.toContain("booking_cancelled");
    expect(rollback).not.toContain("agreement_cancelled");
    expect(rollback).toMatch(/create unique index if not exists seller_snapshot_pk/);
  });
});
