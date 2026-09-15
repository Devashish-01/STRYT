import { describe, it, expect } from "vitest";
import { requestMatchesCategory, categoryRoot, type CategoryParents } from "./categoryMatch";

// Real ids from the live categories table.
const parents: CategoryParents = {
  "c-home": null,
  "c-home-plumb": "c-home",
  "c-home-elec": "c-home",
  "c-beauty": null,
  "c-beauty-salon": "c-beauty",
};

describe("requestMatchesCategory (E2E-019)", () => {
  it("shows a top-level request to specialists in that group", () => {
    expect(requestMatchesCategory("c-home", "c-home-plumb", parents)).toBe(true);
    expect(requestMatchesCategory("c-home", "c-home-elec", parents)).toBe(true);
    expect(requestMatchesCategory("c-beauty", "c-beauty-salon", parents)).toBe(true);
  });

  it("keeps other groups out", () => {
    expect(requestMatchesCategory("c-home", "c-beauty-salon", parents)).toBe(false);
    expect(requestMatchesCategory("c-beauty", "c-home-plumb", parents)).toBe(false);
  });

  it("keeps a speciality request between the same specialists only", () => {
    expect(requestMatchesCategory("c-home-plumb", "c-home-plumb", parents)).toBe(true);
    expect(requestMatchesCategory("c-home-plumb", "c-home-elec", parents)).toBe(false);
  });

  it("shows a speciality request to a responder registered at the top level", () => {
    expect(requestMatchesCategory("c-home-plumb", "c-home", parents)).toBe(true);
  });

  it("matches when either side has no category", () => {
    expect(requestMatchesCategory(null, "c-home-plumb", parents)).toBe(true);
    expect(requestMatchesCategory("c-home", undefined, parents)).toBe(true);
  });

  it("treats an unknown id as its own group", () => {
    expect(categoryRoot("c-unknown", parents)).toBe("c-unknown");
    expect(requestMatchesCategory("c-unknown", "c-unknown", parents)).toBe(true);
    expect(requestMatchesCategory("c-unknown", "c-home", parents)).toBe(false);
  });
});
