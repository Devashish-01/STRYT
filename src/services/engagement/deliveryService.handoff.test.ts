import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Guards the delivery handoff-code lockdown (migrations 20260966 + 20260967).
 *
 * The handoff code (delivery OTP) proves the rider met the customer, so only the customer
 * may see it — through my_delivery_progress(). appointment_deliveries.handoff_code is no
 * longer selectable by clients; a direct select that names it fails with 42501 and the
 * business-side delivery control goes blank. forAppointment() must not ask for it.
 */

const state = {
  selects: [] as { table: string; cols: string }[],
  rpcCalls: [] as { name: string; args: unknown }[],
};

vi.mock("@/lib/supabaseClient", () => ({
  getSupabase: () => ({
    from: (table: string) => {
      const builder: any = {
        select: (cols: string) => { state.selects.push({ table, cols }); return builder; },
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: () => Promise.resolve({
          data: { id: "d1", appointment_id: "a1", status: "EN_ROUTE", live_status: "ON_THE_WAY", handoff_verified: false, agent_user_id: "r1", lat: 1, lng: 2, agent: { alias: "rider", avatar: null } },
          error: null,
        }),
      };
      return builder;
    },
    rpc: async (name: string, args?: unknown) => {
      state.rpcCalls.push({ name, args });
      if (name === "my_delivery_progress") return { data: [{ id: "d1", status: "ARRIVED", handoff_code: "123456", handoff_verified: false }], error: null };
      return { data: null, error: null };
    },
  }),
}));
vi.mock("@/services/marketplace/businessAccessService", () => ({ businessAccessService: {} }));

import { deliveryService } from "./deliveryService";

beforeEach(() => {
  state.selects = [];
  state.rpcCalls = [];
});

describe("delivery handoff code", () => {
  it("forAppointment() never selects handoff_code and never exposes one", async () => {
    const d = await deliveryService.forAppointment("a1");
    const deliveryReads = state.selects.filter((s) => s.table === "appointment_deliveries");
    expect(deliveryReads).toHaveLength(1);
    expect(deliveryReads[0].cols).not.toMatch(/handoff_code/);
    expect(d?.handoffCode).toBeNull();
    expect(d?.handoffVerified).toBe(false);
  });

  it("the customer gets the code from my_delivery_progress()", async () => {
    const p = await deliveryService.myProgress("a1");
    expect(state.rpcCalls).toEqual([{ name: "my_delivery_progress", args: { p_appointment_id: "a1" } }]);
    expect(p?.handoffCode).toBe("123456");
  });
});
