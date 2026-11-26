import { describe, expect, it } from "vitest";
import { businessToolLinks, resolveBusinessToolVisibility } from "./businessTools";
import type { Scope } from "@/services/marketplace/businessAccessService";

function access(scopes: Scope[] = [], options = { owner: false, full: false, assigned: false }) {
  return {
    isOwner: options.owner,
    hasScope: (scope: Scope) => options.owner || options.full || scopes.includes(scope),
    hasActiveDeliveries: options.assigned,
  };
}

describe("business tool permissions", () => {
  it("gives a full delegate scoped tools while reserving Profile and Payments for the owner", () => {
    const delegate = resolveBusinessToolVisibility(access([], { owner: false, full: true, assigned: false }), true);
    const destinations = businessToolLinks("shop", delegate, false).map(({ to }) => to);
    expect(destinations).toContain("/business/shop/manage/store");
    expect(destinations).toContain("/business/shop/manage/queue");
    expect(destinations).toContain("/business/shop/manage/inbox");
    expect(destinations).not.toContain("/business/shop/manage/profile");
    expect(destinations).not.toContain("/business/shop/manage/payments");
  });

  it("separates Live Board access from standing or assigned rider access", () => {
    const manager = resolveBusinessToolVisibility(access(["appointments"]), true);
    const rider = resolveBusinessToolVisibility(access(["delivery"]), true);
    const assigned = access([], { owner: false, full: false, assigned: true });
    expect(manager).toMatchObject({ liveDeliveries: true, myDeliveries: false });
    expect(rider).toMatchObject({ liveDeliveries: false, myDeliveries: true });
    expect(resolveBusinessToolVisibility(assigned, true).myDeliveries).toBe(true);
    expect(resolveBusinessToolVisibility(assigned, false).myDeliveries).toBe(false);
  });
});
