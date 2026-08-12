import { describe, it, expect } from "vitest";
import { buildParentMap, rankByInterests } from "./interestRank";
import type { Category } from "@/types";

const cat = (id: string, children: Category[] = []): Category => ({
  id,
  parentId: null,
  name: id,
  slug: id,
  kind: "BUSINESS",
  icon: "",
  color: "",
  children,
});

const TREE: Category[] = [
  cat("c-food", [cat("c-food-rest"), cat("c-food-cafe")]),
  cat("c-health", [cat("c-health-gp"), cat("c-health-chem")]),
  cat("c-pets", [cat("c-pets-shop")]),
];

const PARENTS = buildParentMap(TREE);

/** A listing is only ever identified here by the leaf it was filed under. */
const biz = (id: string, categoryId: string) => ({ id, categoryId });

describe("buildParentMap", () => {
  it("maps leaves to their top-level ancestor", () => {
    expect(PARENTS["c-food-rest"]).toBe("c-food");
    expect(PARENTS["c-health-chem"]).toBe("c-health");
  });

  it("maps a top-level id to itself, so a parent-filed listing still matches", () => {
    expect(PARENTS["c-food"]).toBe("c-food");
  });

  it("rolls a third level up to the top, not to its immediate parent", () => {
    const deep = buildParentMap([cat("c-a", [cat("c-a-b", [cat("c-a-b-c")])])]);
    expect(deep["c-a-b-c"]).toBe("c-a");
  });

  it("returns nothing for an unknown id rather than guessing", () => {
    expect(PARENTS["c-nope"]).toBeUndefined();
  });
});

describe("rankByInterests", () => {
  const items = [
    biz("1", "c-health-gp"),
    biz("2", "c-food-rest"),
    biz("3", "c-pets-shop"),
    biz("4", "c-food-cafe"),
  ];

  it("moves matching listings first, keeping distance order inside each group", () => {
    const out = rankByInterests(items, ["c-food"], PARENTS);
    expect(out.map((b) => b.id)).toEqual(["2", "4", "1", "3"]);
  });

  it("honours several interests at once", () => {
    const out = rankByInterests(items, ["c-pets", "c-food"], PARENTS);
    expect(out.map((b) => b.id)).toEqual(["2", "3", "4", "1"]);
  });

  it("NEVER drops a listing — it is a partition, not a filter", () => {
    // The whole point: a shop you didn't pick is still on your street.
    const out = rankByInterests(items, ["c-food"], PARENTS);
    expect(out).toHaveLength(items.length);
    expect(new Set(out.map((b) => b.id))).toEqual(new Set(["1", "2", "3", "4"]));
  });

  it("returns the input untouched when there are no interests", () => {
    // Protects every user who onboarded before interests existed: their Home
    // must order exactly as it did before.
    expect(rankByInterests(items, null, PARENTS)).toBe(items);
    expect(rankByInterests(items, undefined, PARENTS)).toBe(items);
    expect(rankByInterests(items, [], PARENTS)).toBe(items);
  });

  it("leaves order unchanged when nothing matches", () => {
    const out = rankByInterests(items, ["c-beauty"], PARENTS);
    expect(out.map((b) => b.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("treats an unknown or missing category as a non-match, not a crash", () => {
    const odd: { id: string; categoryId?: string | null }[] = [
      { id: "x", categoryId: "c-unknown" },
      { id: "y" },
      { id: "z", categoryId: "c-food-rest" },
    ];
    const out = rankByInterests(odd, ["c-food"], PARENTS);
    expect(out.map((b) => b.id)).toEqual(["z", "x", "y"]);
  });

  it("matches a listing filed directly against the top-level category", () => {
    const out = rankByInterests([biz("p", "c-health"), biz("q", "c-food")], ["c-health"], PARENTS);
    expect(out.map((b) => b.id)).toEqual(["p", "q"]);
  });
});
