import { describe, expect, it } from "vitest";
import { partOfPath, switchTarget } from "./partNavigation";

const personal = { type: "customer", id: null };
const shopA = { type: "business", id: "b_a" };

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
