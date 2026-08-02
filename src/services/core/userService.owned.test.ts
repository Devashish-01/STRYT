import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * TMA-004 — the regression guard for the privilege escalation in TMA-001.
 *
 * `userService.owned()` used to merge `my_delegated_businesses()` into
 * `businessIds`. BusinessAccessGuard defines `isOwner` as membership in that
 * array and short-circuits to FULL_ACCESS, so every scoped team member was
 * promoted to owner the moment the list hydrated — i.e. on the next reload
 * after being added to a team.
 *
 * The defect was invisible to any test that granted access and asserted in the
 * same session, because the grant path reaches the console BEFORE owned() is
 * refetched. That is exactly why this test asserts on the shape of owned()
 * itself rather than on some downstream screen: it fails on the second page
 * load or not at all.
 */

const state = {
  ownedRows: [] as { id: string }[],
  providerRows: [] as { id: string }[],
  delegatedRows: [] as unknown[],
};

vi.mock("@/lib/supabaseClient", () => ({
  currentUserId: async () => "user-1",
  getSupabase: () => ({
    from: (table: string) => {
      const rows = table === "businesses" ? state.ownedRows : state.providerRows;
      // Chainable stub. Every filter returns the builder so the shape of the
      // query can change (e.g. the `.neq("status","DELETED")` added with
      // soft-delete) without the test asserting on call order — it only cares
      // what owned() returns.
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        neq: () => builder,
        limit: () => Promise.resolve({ data: rows, error: null }),
        then: (res: any) => Promise.resolve({ data: rows, error: null }).then(res),
      };
      return builder;
    },
    rpc: async (name: string) =>
      name === "my_delegated_businesses"
        ? { data: state.delegatedRows, error: null }
        : { data: null, error: null },
  }),
}));

import { userService } from "./userService";

beforeEach(() => {
  state.ownedRows = [];
  state.providerRows = [];
  state.delegatedRows = [];
});

describe("userService.owned() — owned vs delegated separation", () => {
  it("never reports a delegated business as owned", async () => {
    state.ownedRows = [];
    state.delegatedRows = ["biz-delegated"];

    const result = await userService.owned();

    // The whole escalation in one assertion.
    expect(result.businessIds).not.toContain("biz-delegated");
    expect(result.businessIds).toEqual([]);
    expect(result.delegatedBusinessIds).toEqual(["biz-delegated"]);
  });

  it("keeps owned businesses in businessIds", async () => {
    state.ownedRows = [{ id: "biz-owned" }];
    state.delegatedRows = [];

    const result = await userService.owned();

    expect(result.businessIds).toEqual(["biz-owned"]);
    expect(result.delegatedBusinessIds).toEqual([]);
  });

  it("does not double-report a business that is both owned and delegated", async () => {
    // An owner can also hold a session row against their own business. It must
    // count as owned exactly once, and never appear in the delegated list —
    // otherwise "delegated" UI (borrowed-access badges) shows on your own shop.
    state.ownedRows = [{ id: "biz-owned" }];
    state.delegatedRows = ["biz-owned"];

    const result = await userService.owned();

    expect(result.businessIds).toEqual(["biz-owned"]);
    expect(result.delegatedBusinessIds).toEqual([]);
  });

  it("tolerates the row-object shape the RPC can return", async () => {
    state.delegatedRows = [{ my_delegated_businesses: "biz-a" }, "biz-b"];

    const result = await userService.owned();

    expect(result.delegatedBusinessIds.sort()).toEqual(["biz-a", "biz-b"]);
    expect(result.businessIds).toEqual([]);
  });

  it("returns empty lists when signed out rather than throwing", async () => {
    const mod = await import("@/lib/supabaseClient");
    const spy = vi.spyOn(mod, "currentUserId").mockResolvedValueOnce(null as any);

    const result = await userService.owned();

    expect(result).toEqual({ businessIds: [], delegatedBusinessIds: [], providerId: null });
    spy.mockRestore();
  });
});
