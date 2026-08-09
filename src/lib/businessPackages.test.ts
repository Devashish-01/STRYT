import { describe, it, expect } from "vitest";
import { getBusinessTheme, resolvePackage, BUSINESS_PACKAGES, PACKAGE_KEYS } from "./businessPackages";

/**
 * Cases below use the real category names from the live `categories` table
 * (supabase/legacy/seed_core.sql) — every seeded category should resolve to
 * a specific package, none should fall through to "generic" (that would mean
 * a real business is silently missing the system entirely).
 */

describe("getBusinessTheme maps every seeded category to its package", () => {
  it.each([
    "General Physician", "Dentist", "Health & Medical",
  ])("%s -> clinic", (name) => {
    expect(getBusinessTheme(name)).toBe("clinic");
  });

  it("Diagnostic Lab -> diagnostics", () => {
    expect(getBusinessTheme("Diagnostic Lab")).toBe("diagnostics");
  });

  it("Veterinarian -> vet", () => {
    expect(getBusinessTheme("Veterinarian")).toBe("vet");
  });

  it("Chemist / Pharmacy -> pharmacy (never clinic — a counter, not a consultation)", () => {
    expect(getBusinessTheme("Chemist / Pharmacy")).toBe("pharmacy");
  });

  it.each([
    "Restaurant", "Café & Bakery", "Food & Beverage",
  ])("%s -> dining", (name) => {
    expect(getBusinessTheme(name)).toBe("dining");
  });

  it.each([
    "Tiffin / Home Kitchen", "Sweet Shop", "Juice Bar", "Ice Cream",
  ])("%s -> takeaway", (name) => {
    expect(getBusinessTheme(name)).toBe("takeaway");
  });

  it.each([
    "Barber Shop", "Unisex Salon", "Spa & Massage", "Nail Studio",
    "Makeup Artist", "Pet Grooming", "Beauty & Personal Care",
  ])("%s -> salon", (name) => {
    expect(getBusinessTheme(name)).toBe("salon");
  });

  it.each([
    "Kirana / Grocery", "Clothing", "Mobile & Electronics", "Footwear",
    "Books & Stationery", "Pet Shop", "Retail Shops",
  ])("%s -> shop", (name) => {
    expect(getBusinessTheme(name)).toBe("shop");
  });

  it.each([
    "Plumber", "Electrician", "Carpenter", "AC Repair", "Cleaning Service",
    "Pest Control", "Home & Repair",
  ])("%s -> homeservice", (name) => {
    expect(getBusinessTheme(name)).toBe("homeservice");
  });

  it.each([
    "Coaching / Tuition", "Music", "Dance", "Private Tutor", "Education & Tutoring",
  ])("%s -> learning", (name) => {
    expect(getBusinessTheme(name)).toBe("learning");
  });

  it.each([
    "Gym", "Yoga Studio", "Personal Trainer", "Fitness & Wellness",
  ])("%s -> fitness", (name) => {
    expect(getBusinessTheme(name)).toBe("fitness");
  });

  it.each([
    "Lawyer", "CA / Tax", "Designer / Developer", "Professional Services",
  ])("%s -> professional", (name) => {
    expect(getBusinessTheme(name)).toBe("professional");
  });

  it.each([
    "Event Planner", "Decorator", "Caterer", "Home Cook / Chef",
    "Mehndi Artist", "Photographer", "Events & Personal",
  ])("%s -> events", (name) => {
    expect(getBusinessTheme(name)).toBe("events");
  });

  it("every live category resolves to a specific package, not the fallback", () => {
    // Mirrors categoryLabels.test.ts's own version of this guard — the whole
    // point of a 13-package catalogue is that real categories don't fall
    // through to generic.
    const live = [
      "General Physician", "Dentist", "Diagnostic Lab", "Veterinarian",
      "Chemist / Pharmacy", "Health & Medical", "Restaurant", "Café & Bakery",
      "Tiffin / Home Kitchen", "Sweet Shop", "Juice Bar", "Ice Cream",
      "Food & Beverage", "Barber Shop", "Unisex Salon", "Spa & Massage",
      "Nail Studio", "Makeup Artist", "Pet Grooming", "Beauty & Personal Care",
      "Kirana / Grocery", "Clothing", "Mobile & Electronics", "Footwear",
      "Books & Stationery", "Pet Shop", "Retail Shops", "Plumber",
      "Electrician", "Carpenter", "AC Repair", "Cleaning Service",
      "Pest Control", "Home & Repair", "Coaching / Tuition", "Music", "Dance",
      "Private Tutor", "Education & Tutoring", "Gym", "Yoga Studio",
      "Personal Trainer", "Fitness & Wellness", "Lawyer", "CA / Tax",
      "Designer / Developer", "Professional Services", "Event Planner",
      "Decorator", "Caterer", "Home Cook / Chef", "Mehndi Artist",
      "Photographer", "Events & Personal",
    ];
    for (const name of live) {
      expect(getBusinessTheme(name), `${name} fell through to generic`).not.toBe("generic");
    }
  });
});

describe("fallbacks and precedence", () => {
  it("an unmatched category falls back to generic, not a guess", () => {
    expect(getBusinessTheme("Astrologer")).toBe("generic");
    expect(getBusinessTheme(null)).toBe("generic");
    expect(getBusinessTheme(undefined, undefined)).toBe("generic");
  });

  it("the more specific sub-category wins over the category", () => {
    expect(getBusinessTheme("Retail Shops", "Café & Bakery")).toBe("dining");
    expect(getBusinessTheme("Retail Shops", "Dentist")).toBe("clinic");
  });

  it("is case-insensitive", () => {
    expect(getBusinessTheme("RESTAURANT")).toBe("dining");
    expect(getBusinessTheme("  general physician  ")).toBe("clinic");
  });
});

describe("resolvePackage — the one resolution path every consumer should use", () => {
  it("an explicit stored packageKey wins over the category, in either direction", () => {
    // Owner explicitly opted OUT of the suggested package.
    expect(resolvePackage({ packageKey: "generic", categoryName: "Restaurant" })).toBe("generic");
    // Owner explicitly opted INTO a package the category text wouldn't suggest.
    expect(resolvePackage({ packageKey: "dining", categoryName: "Retail Shops" })).toBe("dining");
  });

  it("falls back to derivation when packageKey is null, undefined, or unknown", () => {
    expect(resolvePackage({ packageKey: null, categoryName: "Restaurant" })).toBe("dining");
    expect(resolvePackage({ categoryName: "Restaurant" })).toBe("dining");
    expect(resolvePackage({ packageKey: "not-a-real-key", categoryName: "Restaurant" })).toBe("dining");
  });

  it("with no packageKey and no matching category, resolves to generic", () => {
    expect(resolvePackage({ categoryName: "Astrologer" })).toBe("generic");
    expect(resolvePackage({})).toBe("generic");
  });
});

describe("BUSINESS_PACKAGES.generic matches today's exact literals", () => {
  // The mechanism that keeps every untouched category byte-for-byte
  // identical: "generic" must equal exactly what was hardcoded before this
  // system existed.
  it("uses today's exact CTA and section copy", () => {
    const g = BUSINESS_PACKAGES.generic;
    expect(g.primaryCtaLabel).toBe("Book appointment");
    expect(g.bookingClosedLabel).toBe("Not accepting appointments right now");
    expect(g.catalogItemCta).toEqual({ show: true, label: "📅 Book appointment" });
    expect(g.hoursLabel).toBe("Hours");
    expect(g.catalogNoun).toBe("Catalogue");
    expect(g.catalogEmptyText).toBe("Nothing listed here yet.");
    expect(g.slotCapacityLabel).toBe("Bookings at the same time");
    expect(g.itemNounSingular).toBe("listing");
    expect(g.itemNamePlaceholder).toBe("e.g. Classic Haircut, Phone Case, Sofa Repair");
    expect(g.showCartStepper).toBe(true);
    expect(g.showSlotCapacitySection).toBe(true);
    expect(g.catalogRenderMode).toBe("list");
    expect(g.foodToggleMode).toBe("manual");
    expect(g.bookingsDefault).toBe(true);
    expect(g.onboardSubcategoryHint).toBeUndefined();
    expect(g.onboardPhotoHint).toBeUndefined();
  });
});

describe("catalogue completeness", () => {
  it("every package key has a config entry with a matching `key` field", () => {
    for (const key of PACKAGE_KEYS) {
      expect(BUSINESS_PACKAGES[key]).toBeDefined();
      expect(BUSINESS_PACKAGES[key].key).toBe(key);
    }
  });
});
