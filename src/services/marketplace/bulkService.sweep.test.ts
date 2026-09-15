import { describe, it, expect, vi } from "vitest";

/**
 * E2E-005: every bulk-deal read runs a throttled "close expired campaigns" sweep first. It used to call `.catch()` on
 * the Supabase query builder, which is a thenable without a catch method, so the sweep threw a TypeError and the read
 * itself failed — the "Couldn't load" toast on the bulk-deals console and the Community hub.
 *
 * The stub below behaves like the real builder: `then` only, no `catch`.
 */

const thenable = <T>(value: T) => ({ then: (resolve: (v: T) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(value).then(resolve, reject) });

const rpc = vi.fn(() => thenable<{ data: null; error: { message: string } | null }>({ data: null, error: null }));
const dealRow = { id: "bd_1", business_id: "b_1", title: "Deal", status: "ACTIVE", created_at: "2026-09-16T00:00:00Z", business: { name: "Shop" } };

vi.mock("@/lib/supabaseClient", () => ({
  currentUserId: async () => "user-1",
  getSupabase: () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: "user-1" } } } }) },
    rpc,
    from: () => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        order: () => builder,
        limit: () => builder,
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve({ data: [dealRow], error: null }).then(resolve, reject),
      };
      return builder;
    },
  }),
}));

describe("bulkService deal reads survive the expiry sweep (E2E-005)", () => {
  it("returns deals when the sweep RPC builder has no .catch()", async () => {
    const { bulkService } = await import("./bulkService");
    const deals = await bulkService.dealsForBusiness("b_1");
    expect(rpc).toHaveBeenCalledWith("close_expired_bulk_deals");
    expect(deals).toHaveLength(1);
  });

  it("still returns deals when the sweep itself errors", async () => {
    vi.resetModules();
    rpc.mockImplementationOnce(() => thenable({ data: null, error: { message: "boom" } }));
    const { bulkService } = await import("./bulkService");
    await expect(bulkService.dealsForBusiness("b_1")).resolves.toHaveLength(1);
  });
});
