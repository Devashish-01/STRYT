import { describe, it, expect, vi, beforeEach } from "vitest";
import { parsePartySize, weightedWaitMin } from "@/lib/queueMath";

/**
 * Guards the queue_tokens lockdown (migrations 20260957 + the stage 3 policy).
 *
 * The public business page and My Queues used to read OTHER customers' queue
 * tokens straight from the table — which is why queue_tokens had to stay
 * readable by anyone, names and payment references included. Both now get the
 * line from queue_waiting_line(), which returns positions and party sizes only.
 *
 * The important assertion is structural: neither function may read
 * queue_tokens except for the caller's own rows. If someone reintroduces a
 * direct read, the stage 3 policy will silently empty the line for customers —
 * this test fails first.
 */

type Call = { table: string; filters: [string, unknown][] };

const state = {
  settings: { is_open: true, avg_service_min: 10 } as { is_open: boolean; avg_service_min: number } | null,
  settingsRows: [] as { business_id: string; avg_service_min: number }[],
  line: [] as { business_id: string; line_position: number; party_size: string; my_token_id: string | null }[],
  myRows: [] as Record<string, unknown>[],
  fromCalls: [] as Call[],
  rpcCalls: [] as { name: string; args: unknown }[],
  userId: "user-1" as string | null,
};

vi.mock("@/lib/supabaseClient", () => ({
  currentUserId: async () => state.userId,
  getSupabase: () => ({
    from: (table: string) => {
      const call: Call = { table, filters: [] };
      state.fromCalls.push(call);
      const rows = () => (table === "queue_settings" ? state.settingsRows : table === "queue_tokens" ? state.myRows : []);
      // Chainable stub: every filter returns the builder and is recorded, so
      // the test asserts on WHAT was read, not on call order.
      const builder: any = {
        select: () => builder,
        insert: () => builder,
        update: () => builder,
        eq: (col: string, val: unknown) => { call.filters.push([col, val]); return builder; },
        in: (col: string, val: unknown) => { call.filters.push([col, val]); return builder; },
        order: () => builder,
        limit: () => builder,
        maybeSingle: () => Promise.resolve({ data: table === "queue_settings" ? state.settings : null, error: null }),
        then: (res: any, rej: any) => Promise.resolve({ data: rows(), error: null }).then(res, rej),
      };
      return builder;
    },
    rpc: async (name: string, args?: unknown) => {
      state.rpcCalls.push({ name, args });
      return name === "queue_waiting_line" ? { data: state.line, error: null } : { data: null, error: null };
    },
  }),
}));

import { businessService } from "./businessService";

const tokenReads = () => state.fromCalls.filter((c) => c.table === "queue_tokens");

beforeEach(() => {
  state.userId = "user-1";
  state.settings = { is_open: true, avg_service_min: 10 };
  state.settingsRows = [{ business_id: "biz-1", avg_service_min: 10 }];
  state.line = [];
  state.myRows = [];
  state.fromCalls = [];
  state.rpcCalls = [];
});

describe("businessService.queue() — public business page", () => {
  it("builds 'N ahead · ~X min' from queue_waiting_line and never reads queue_tokens", async () => {
    state.line = [
      { business_id: "biz-1", line_position: 1, party_size: "2 people", my_token_id: null },
      { business_id: "biz-1", line_position: 2, party_size: "1 person", my_token_id: null },
      { business_id: "biz-1", line_position: 3, party_size: "3 people", my_token_id: null },
    ];

    const info = await businessService.queue("biz-1");

    expect(info?.peopleAhead).toBe(3);
    expect(info?.estWaitMin).toBe(weightedWaitMin(["2 people", "1 person", "3 people"].map(parsePartySize), 10));
    expect(state.rpcCalls).toContainEqual({ name: "queue_waiting_line", args: { p_business_ids: ["biz-1"] } });
    expect(tokenReads()).toHaveLength(0);
  });

  it("returns nothing and skips the line lookup when the queue is closed", async () => {
    state.settings = { is_open: false, avg_service_min: 10 };

    expect(await businessService.queue("biz-1")).toBeUndefined();
    expect(state.rpcCalls.some((c) => c.name === "queue_waiting_line")).toBe(false);
  });
});

describe("businessService.myQueues() — a customer's position", () => {
  it("finds the customer's place via my_token_id and only reads their own tokens", async () => {
    state.myRows = [
      { id: "tok-me", business_id: "biz-1", status: "WAITING", party_size: "1 person", created_at: "2026-09-11T10:00:00Z", businesses: { name: "Shop" } },
    ];
    state.line = [
      { business_id: "biz-1", line_position: 1, party_size: "2 people", my_token_id: null },
      { business_id: "biz-1", line_position: 2, party_size: "1 person", my_token_id: "tok-me" },
      { business_id: "biz-1", line_position: 3, party_size: "3 people", my_token_id: null },
    ];

    const [entry] = await businessService.myQueues();

    expect(entry.position).toBe(2);
    expect(entry.peopleAhead).toBe(1);
    expect(entry.estWaitMin).toBe(weightedWaitMin([parsePartySize("2 people")], 10));
    expect(state.rpcCalls).toContainEqual({ name: "queue_waiting_line", args: { p_business_ids: ["biz-1"] } });
    // Exactly one token read, and it is scoped to this customer.
    expect(tokenReads()).toHaveLength(1);
    expect(tokenReads()[0].filters).toContainEqual(["customer_user_id", "user-1"]);
  });

  it("shows no position when the customer's token has left the waiting line", async () => {
    state.myRows = [
      { id: "tok-me", business_id: "biz-1", status: "CALLED", party_size: "1 person", created_at: "2026-09-11T10:00:00Z", businesses: { name: "Shop" } },
    ];
    state.line = [{ business_id: "biz-1", line_position: 1, party_size: "2 people", my_token_id: null }];

    const [entry] = await businessService.myQueues();

    expect(entry.position).toBe(0);
    expect(entry.peopleAhead).toBe(0);
  });
});

describe("businessService guest RPC guards (F5)", () => {
  it("executes close_stale_queue_tokens on queue() when user is signed in", async () => {
    state.userId = "user-1";
    await businessService.queue("biz-1");
    expect(state.rpcCalls.some((c) => c.name === "close_stale_queue_tokens")).toBe(true);
  });

  it("skips close_stale_queue_tokens on queue() when guest (userId is null)", async () => {
    state.userId = null;
    const info = await businessService.queue("biz-1");
    expect(state.rpcCalls.some((c) => c.name === "close_stale_queue_tokens")).toBe(false);
    expect(info?.isOpen).toBe(true);
  });

  it("bumps metric on recordInteraction and recordView when user is signed in", async () => {
    state.userId = "user-1";
    await businessService.recordInteraction("biz-1", "CALL");
    await businessService.recordView("biz-1");
    const bumpCalls = state.rpcCalls.filter((c) => c.name === "bump_business_metric");
    expect(bumpCalls).toHaveLength(2);
    expect(bumpCalls[0].args).toEqual({ p_business_id: "biz-1", p_metric: "call" });
    expect(bumpCalls[1].args).toEqual({ p_business_id: "biz-1", p_metric: "view" });
  });

  it("skips bump_business_metric on recordInteraction and recordView when guest", async () => {
    state.userId = null;
    await businessService.recordInteraction("biz-1", "CALL");
    await businessService.recordView("biz-1");
    const bumpCalls = state.rpcCalls.filter((c) => c.name === "bump_business_metric");
    expect(bumpCalls).toHaveLength(0);
  });
});

