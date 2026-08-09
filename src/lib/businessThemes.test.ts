import { describe, it, expect } from "vitest";
import { getBusinessTheme, BUSINESS_THEMES } from "./businessThemes";

/**
 * Doctor + Restaurant pilot — cases below use the real category names from
 * the live `categories` table (supabase/legacy/seed_core.sql).
 */

describe("getBusinessTheme maps real categories to the right theme", () => {
  it.each([
    "General Physician", "Dentist", "Diagnostic Lab", "Veterinarian", "Health & Medical",
  ])("%s -> medical", (name) => {
    expect(getBusinessTheme(name)).toBe("medical");
  });

  it.each([
    "Restaurant", "Café & Bakery", "Tiffin / Home Kitchen", "Sweet Shop",
    "Juice Bar", "Ice Cream", "Food & Beverage",
  ])("%s -> restaurant", (name) => {
    expect(getBusinessTheme(name)).toBe("restaurant");
  });

  it.each([
    "Unisex Salon", "Barber Shop", "Spa & Massage", "Gym",
    "Kirana / Grocery", "Clothing", "Pet Shop", "Plumber",
    // Deliberately generic, not medical — a pharmacy counter is a retail
    // transaction, not a consultation (matches categoryLabels.ts's own call).
    "Chemist / Pharmacy",
  ])("%s -> generic (untouched)", (name) => {
    expect(getBusinessTheme(name)).toBe("generic");
  });
});

describe("fallbacks and precedence", () => {
  it("an unknown category falls back to generic, not a guess", () => {
    expect(getBusinessTheme("Astrologer")).toBe("generic");
    expect(getBusinessTheme(null)).toBe("generic");
    expect(getBusinessTheme(undefined, undefined)).toBe("generic");
  });

  it("the more specific sub-category wins over the category", () => {
    expect(getBusinessTheme("Retail Shops", "Bakery")).toBe("restaurant");
    expect(getBusinessTheme("Retail Shops", "Dentist")).toBe("medical");
  });

  it("falls back to the category when the sub-category says nothing useful", () => {
    expect(getBusinessTheme("Restaurant", "Premium")).toBe("restaurant");
  });

  it("is case-insensitive", () => {
    expect(getBusinessTheme("RESTAURANT")).toBe("restaurant");
    expect(getBusinessTheme("  general physician  ")).toBe("medical");
  });
});

describe("BUSINESS_THEMES.generic matches today's hardcoded literals", () => {
  // The mechanism that keeps every untouched category byte-for-byte
  // identical: "generic" must equal exactly what's already in the app.
  it("uses today's exact CTA and section copy", () => {
    expect(BUSINESS_THEMES.generic.primaryCtaLabel).toBe("Book appointment");
    expect(BUSINESS_THEMES.generic.bookingClosedLabel).toBe("Not accepting appointments right now");
    expect(BUSINESS_THEMES.generic.catalogItemCta).toEqual({ show: true, label: "📅 Book appointment" });
    expect(BUSINESS_THEMES.generic.hoursLabel).toBe("Hours");
    expect(BUSINESS_THEMES.generic.catalogManagerTitle).toBe("Catalog");
    expect(BUSINESS_THEMES.generic.slotCapacityLabel).toBe("Bookings at the same time");
    expect(BUSINESS_THEMES.generic.showCartStepper).toBe(true);
    expect(BUSINESS_THEMES.generic.showSlotCapacitySection).toBe(true);
    expect(BUSINESS_THEMES.generic.catalogRenderMode).toBe("list");
  });
});
