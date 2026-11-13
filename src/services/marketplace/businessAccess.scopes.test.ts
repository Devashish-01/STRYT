import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SCOPE_LABEL_KEYS, toggleScope, type Scope } from "./businessAccessService";

describe("toggleScope", () => {
  it("adds and removes an ordinary scope", () => {
    expect(toggleScope(["queue"], "catalog")).toEqual(["queue", "catalog"]);
    expect(toggleScope(["queue", "catalog"], "catalog")).toEqual(["queue"]);
  });

  it("ticking money also ticks Orders, because the money panels live there", () => {
    expect(toggleScope(["queue"], "money")).toEqual(["queue", "appointments", "money"]);
    expect(toggleScope(["appointments"], "money")).toEqual(["appointments", "money"]);
  });

  it("unticking Orders unticks money; unticking money leaves Orders", () => {
    expect(toggleScope(["appointments", "money", "queue"], "appointments")).toEqual(["queue"]);
    expect(toggleScope(["appointments", "money"], "money")).toEqual(["appointments"]);
  });
});

// Every scope the app can grant must survive the database's whitelist, or the grant works and the next edit strips it
// (the trap the Scope comment describes). Pinned to the latest migration that rewrote all four scope writers.
describe("database scope whitelist", () => {
  const sql = readFileSync(resolve(__dirname, "../../../supabase/migrations/20261018_money_scope.sql"), "utf8");
  const whitelists = [...sql.matchAll(/where s in \(([^)]*)\)/g)].map((m) => m[1]);
  const scopes = Object.keys(SCOPE_LABEL_KEYS) as Scope[];

  it("all four scope writers are rewritten", () => {
    for (const fn of ["grant_team_access", "grant_team_member_access", "update_team_member_scopes", "set_business_login"]) {
      expect(sql).toContain(`create or replace function public.${fn}(`);
    }
    expect(whitelists).toHaveLength(4);
  });

  it("each whitelist accepts every app scope", () => {
    for (const w of whitelists) for (const s of scopes) expect(w).toContain(`'${s}'`);
  });

  it("the four money functions ask for money", () => {
    for (const fn of ["business_cash_to_settle", "settle_agent_cash", "business_cash_outstanding", "business_delivery_stats"]) {
      const body = sql.split(`create or replace function public.${fn}(`)[1].split("$function$;")[0];
      expect(body).toContain("has_business_scope(p_business_id, auth.uid()::text, 'money')");
    }
  });
});
