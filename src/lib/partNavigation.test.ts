import { describe, expect, it } from "vitest";
import {
  effectivePartForLocation,
  isPersonalOnlyRoute,
  partOfPath,
  roleForContextType,
  switchTarget,
} from "./partNavigation";

const personal = { type: "customer", id: null };
const shopA = { type: "business", id: "b_a" };
const prov1 = { type: "provider", id: "p_1" };

describe("partOfPath", () => {
  it("puts console routes in their own part", () => {
    expect(partOfPath("/business/b_a/manage")).toEqual({ type: "business", id: "b_a" });
    expect(partOfPath("/business/b_a/manage/appointments?tab=deliveries")).toEqual({ type: "business", id: "b_a" });
    expect(partOfPath("/provider/p_1/manage/jobs")).toEqual({ type: "provider", id: "p_1" });
    expect(partOfPath("/delivery")).toEqual({ type: "delivery" });
  });

  it("keeps a business's public page and every shared screen on the personal side", () => {
    for (const path of ["/home", "/appointments", "/chats", "/chat/abc", "/business/b_a", "/provider/p_1", "/deliveryx", "/manage"]) {
      expect(partOfPath(path), path).toEqual({ type: "customer" });
    }
  });
});

describe("switchTarget", () => {
  it("is null while the link stays in the part the user is in", () => {
    expect(switchTarget(personal, "/appointments")).toBeNull();
    expect(switchTarget(shopA, "/business/b_a/manage/payments")).toBeNull();
    expect(switchTarget({ type: "delivery", id: null }, "/delivery")).toBeNull();
  });

  it("names the part being entered when it differs — personal into a shop, a shop into another shop, a shop back to personal", () => {
    expect(switchTarget(personal, "/business/b_a/manage/appointments")).toEqual({ type: "business", id: "b_a" });
    expect(switchTarget(shopA, "/business/b_b/manage")).toEqual({ type: "business", id: "b_b" });
    expect(switchTarget(shopA, "/appointments")).toEqual({ type: "customer" });
    expect(switchTarget(personal, "/delivery")).toEqual({ type: "delivery" });
    expect(switchTarget(shopA, "/provider/p_1/manage/jobs")).toEqual({ type: "provider", id: "p_1" });
  });

  it("treats a business context with no id as personal rather than guessing", () => {
    expect(switchTarget({ type: "business", id: null }, "/home")).toBeNull();
  });
});

describe("roleForContextType", () => {
  it("maps every context type to its matching Role", () => {
    expect(roleForContextType("customer")).toBe("customer");
    expect(roleForContextType("delivery")).toBe("customer");
    expect(roleForContextType("business")).toBe("business_owner");
    expect(roleForContextType("business_owner")).toBe("business_owner");
    expect(roleForContextType("provider")).toBe("provider");
  });
});

describe("isPersonalOnlyRoute", () => {
  it("matches exclusively customer/personal routes", () => {
    for (const path of [
      "/home",
      "/profile",
      "/profile/edit",
      "/account",
      "/account/business-access",
      "/settings",
      "/settings/security",
      "/appointments",
      "/orders",
      "/queues",
      "/bookmarks",
      "/followers",
      "/lists",
      "/achievements",
      "/safety",
      "/safety/contacts",
    ]) {
      expect(isPersonalOnlyRoute(path), path).toBe(true);
    }
    expect(isPersonalOnlyRoute("/chats", "?scope=CUSTOMER")).toBe(true);
    expect(isPersonalOnlyRoute("/notifications", "?scope=CUSTOMER")).toBe(true);
  });

  it("preserves shared cross-hat and seller-scoped routes", () => {
    expect(isPersonalOnlyRoute("/community-hub")).toBe(false);
    expect(isPersonalOnlyRoute("/community/new")).toBe(false);
    expect(isPersonalOnlyRoute("/explore")).toBe(false);
    expect(isPersonalOnlyRoute("/map")).toBe(false);
    expect(isPersonalOnlyRoute("/request/r1/propose")).toBe(false);
    expect(isPersonalOnlyRoute("/business/b_a")).toBe(false);
    expect(isPersonalOnlyRoute("/provider/p_1")).toBe(false);
    expect(isPersonalOnlyRoute("/my-activity")).toBe(false);
    expect(isPersonalOnlyRoute("/chats", "?scope=BUSINESS&id=b_a")).toBe(false);
    expect(isPersonalOnlyRoute("/notifications", "?scope=PROVIDER&id=p_1")).toBe(false);
    expect(isPersonalOnlyRoute("/business/b_a/manage")).toBe(false);
  });
});

describe("effectivePartForLocation", () => {
  it("resolves customer on /home and /profile even when activeContext is stale business/provider/delivery", () => {
    expect(effectivePartForLocation(shopA, "/home")).toEqual({ type: "customer" });
    expect(effectivePartForLocation(prov1, "/profile")).toEqual({ type: "customer" });
    expect(effectivePartForLocation({ type: "delivery", id: null }, "/settings/security")).toEqual({ type: "customer" });
    expect(effectivePartForLocation(shopA, "/chats", "?scope=CUSTOMER")).toEqual({ type: "customer" });
  });

  it("overrides stale customer context with console part on console routes", () => {
    expect(effectivePartForLocation(personal, "/business/b_a/manage")).toEqual({ type: "business", id: "b_a" });
    expect(effectivePartForLocation(personal, "/provider/p_1/manage/jobs")).toEqual({ type: "provider", id: "p_1" });
    expect(effectivePartForLocation(personal, "/delivery")).toEqual({ type: "delivery" });
  });

  it("preserves active seller hat on shared routes", () => {
    expect(effectivePartForLocation(shopA, "/community-hub")).toEqual({ type: "business", id: "b_a" });
    expect(effectivePartForLocation(prov1, "/request/r1/propose")).toEqual({ type: "provider", id: "p_1" });
    expect(effectivePartForLocation(shopA, "/chats", "?scope=BUSINESS&id=b_a")).toEqual({ type: "business", id: "b_a" });
  });
});
