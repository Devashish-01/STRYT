import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcCalls: { name: string; args: any }[] = [];
let queryResult: any = null;

vi.mock("@/lib/supabaseClient", () => ({
  currentUserId: async () => "user-test",
  getSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: queryResult, error: null }),
        }),
      }),
    }),
    rpc: async (name: string, args: any) => {
      rpcCalls.push({ name, args });
      return { data: null, error: null };
    },
  }),
}));

import { businessAccessService } from "./businessAccessService";
import { buildDialItems } from "@/lib/businessDial";

beforeEach(() => {
  rpcCalls.length = 0;
  queryResult = null;
});

describe("businessAccessService & Team Access Scoping", () => {
  it("getConfig returns configured accessLevel and scopes", async () => {
    queryResult = {
      login_id: "shop-test",
      require_approval: true,
      session_hours: 8,
      is_enabled: true,
      access_level: "SCOPED",
      scopes: ["queue", "appointments"],
    };

    const cfg = await businessAccessService.getConfig("biz-1");
    expect(cfg).not.toBeNull();
    expect(cfg?.accessLevel).toBe("SCOPED");
    expect(cfg?.scopes).toEqual(["queue", "appointments"]);
  });

  it("setLogin passes p_access_level and p_scopes to set_business_login RPC", async () => {
    await businessAccessService.setLogin("biz-1", {
      loginId: "shop-123",
      password: "secretpassword",
      requireApproval: true,
      sessionHours: 12,
      enabled: true,
      accessLevel: "SCOPED",
      scopes: ["catalog", "leads"],
    });

    expect(rpcCalls.length).toBe(1);
    expect(rpcCalls[0].name).toBe("set_business_login");
    expect(rpcCalls[0].args.p_access_level).toBe("SCOPED");
    expect(rpcCalls[0].args.p_scopes).toEqual(["catalog", "leads"]);
  });

  it("delivery dial shows my-deliveries and deliveries when user holds delivery scope", () => {
    const dial = buildDialItems({
      businessId: "biz-1",
      base: "/business/biz-1/manage",
      isOwner: false,
      hasScope: (s) => s === "delivery",
      bookingsOn: true,
      queueUsed: false,
      queueWaiting: 0,
      deliveryOn: true,
      hasActiveDeliveries: false,
      storeLabel: "Store",
      consoleOrder: ["delivery"],
    });

    const ids = dial.map((d) => d.id);
    expect(ids).toContain("my-deliveries");
    expect(ids).toContain("deliveries");
  });
});
