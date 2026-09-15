import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Guards the users.phone lockdown (migration 20260972 + supabase/pending/users_phone_column_lockdown.sql).
 *
 * The provider leads inbox used to embed users.phone for every lead sender and hide it in
 * the browser when the sender hadn't shared it — the raw number still reached the client.
 * It now calls provider_leads(), which returns the phone only when the sender allows it.
 * If someone reintroduces a direct leads + users read, the pending lockdown would break
 * the inbox; this test fails first.
 */

const state = {
  fromCalls: [] as { table: string; select?: string }[],
  rpcCalls: [] as { name: string; args: unknown }[],
  rows: [] as Record<string, unknown>[],
};

vi.mock("@/lib/supabaseClient", () => ({
  currentUserId: async () => "provider-user-1",
  getSupabase: () => ({
    from: (table: string) => {
      const call: { table: string; select?: string } = { table };
      state.fromCalls.push(call);
      const builder: any = {
        select: (cols: string) => { call.select = cols; return builder; },
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        then: (res: any, rej: any) => Promise.resolve({ data: [], error: null }).then(res, rej),
      };
      return builder;
    },
    rpc: async (name: string, args?: unknown) => {
      state.rpcCalls.push({ name, args });
      return name === "provider_leads" ? { data: state.rows, error: null } : { data: null, error: null };
    },
  }),
}));

import { providerService } from "./providerService";

beforeEach(() => {
  state.fromCalls = [];
  state.rpcCalls = [];
  state.rows = [];
});

describe("providerService.leads()", () => {
  it("reads leads through provider_leads and never embeds users.phone", async () => {
    state.rows = [
      { id: "l1", provider_id: "p1", from_user_id: "u1", kind: "CALL", note: null, handled: false, created_at: new Date().toISOString(), from_name: "Asha", from_alias: "asha", from_avatar: "a.png", from_phone: "+911234567890" },
      { id: "l2", provider_id: "p1", from_user_id: "u2", kind: "CHAT", note: "hi", handled: true, created_at: new Date().toISOString(), from_name: null, from_alias: null, from_avatar: null, from_phone: null },
    ];

    const leads = await providerService.leads("p1");

    expect(state.rpcCalls).toEqual([{ name: "provider_leads", args: { p_provider_id: "p1" } }]);
    const leadReads = state.fromCalls.filter((c) => c.table === "leads" || c.table === "users");
    expect(leadReads).toEqual([]);
    expect(leads.map((l) => [l.id, l.name, l.phone, l.handled])).toEqual([
      ["l1", "Asha", "+911234567890", false],
      ["l2", "Someone", undefined, true],
    ]);
  });
});
