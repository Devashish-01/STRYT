import { describe, it, expect } from "vitest";
import { catalogLabel, catalogEmptyText } from "./categoryLabels";

/**
 * Feedback #10 — every business profile called its catalogue a "Menu",
 * including salons, gyms and chemists. Cases below use the real category names
 * from the live `categories` table.
 */

describe("catalogLabel maps real categories to the right noun", () => {
  it.each([
    ["Restaurant", "Menu"],
    ["Café & Bakery", "Menu"],
    ["Ice Cream", "Menu"],
    ["Juice Bar", "Menu"],
    ["Sweet Shop", "Menu"],
    ["Tiffin / Home Kitchen", "Menu"],
    ["Food & Beverage", "Menu"],
  ])("%s -> %s", (name, expected) => {
    expect(catalogLabel(name)).toBe(expected);
  });

  it.each([
    ["Unisex Salon", "Services"],
    ["Barber Shop", "Services"],
    ["Spa & Massage", "Services"],
    ["Nail Studio", "Services"],
    ["Gym", "Services"],
    ["Dentist", "Services"],
    ["General Physician", "Services"],
    ["Diagnostic Lab", "Services"],
    ["Veterinarian", "Services"],
    ["Health & Medical", "Services"],
  ])("%s -> %s", (name, expected) => {
    expect(catalogLabel(name)).toBe(expected);
  });

  it.each([
    ["Kirana / Grocery", "Products"],
    ["Chemist / Pharmacy", "Products"],
    ["Clothing", "Products"],
    ["Footwear", "Products"],
    ["Mobile & Electronics", "Products"],
    ["Books & Stationery", "Products"],
    ["Pet Shop", "Products"],
    ["Retail Shops", "Products"],
  ])("%s -> %s", (name, expected) => {
    expect(catalogLabel(name)).toBe(expected);
  });

  it("every live category resolves to something specific, not the fallback", () => {
    // The complaint was that the label was wrong for real shops, so no real
    // category may land on the neutral default.
    const live = [
      "Barber Shop", "Books & Stationery", "Café & Bakery", "Clothing", "Dentist",
      "Mobile & Electronics", "Food & Beverage", "Footwear", "General Physician",
      "Kirana / Grocery", "Gym", "Health & Medical", "Ice Cream", "Juice Bar",
      "Diagnostic Lab", "Nail Studio", "Pet Shop", "Chemist / Pharmacy",
      "Restaurant", "Retail Shops", "Unisex Salon", "Spa & Massage",
      "Sweet Shop", "Tiffin / Home Kitchen", "Veterinarian",
    ];
    for (const name of live) {
      expect(catalogLabel(name), `${name} fell through to the default`).not.toBe("Catalogue");
    }
  });
});

describe("fallbacks and precedence", () => {
  it("an unknown category gets the neutral label, not a guess", () => {
    expect(catalogLabel("Astrologer")).toBe("Catalogue");
    expect(catalogLabel(null)).toBe("Catalogue");
    expect(catalogLabel(undefined, undefined)).toBe("Catalogue");
  });

  it("the more specific sub-category wins over the category", () => {
    // A bakery listed under the generic "Retail Shops" umbrella still has a menu.
    expect(catalogLabel("Retail Shops", "Bakery")).toBe("Menu");
  });

  it("falls back to the category when the sub-category says nothing useful", () => {
    expect(catalogLabel("Unisex Salon", "Premium")).toBe("Services");
  });

  it("is case-insensitive", () => {
    expect(catalogLabel("RESTAURANT")).toBe("Menu");
    expect(catalogLabel("  unisex salon  ")).toBe("Services");
  });
});

describe("empty-state copy matches the label", () => {
  it.each(["Menu", "Services", "Products", "Catalogue"] as const)("%s has its own copy", (label) => {
    expect(catalogEmptyText(label).length).toBeGreaterThan(0);
  });

  it("does not say 'menu' to a salon", () => {
    expect(catalogEmptyText(catalogLabel("Unisex Salon")).toLowerCase()).not.toContain("menu");
  });
});
