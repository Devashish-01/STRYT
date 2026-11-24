import { describe, expect, it, vi } from "vitest";
import type { Category } from "@/types";

vi.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: () => "android" } }));

import { filterMarketplaceCategories, isExcludedMarketplaceEntry, MARKETPLACE_PACKAGE_KEYS } from "./marketplaceScope";

const category = (id: string, name: string, parentId: string | null = null): Category => ({
  id, name, parentId, slug: id, kind: "BOTH", icon: "", color: "",
});

describe("Personal-account Android marketplace", () => {
  it("offers only non-medical page types during onboarding and settings", () => {
    expect(MARKETPLACE_PACKAGE_KEYS).toEqual([
      "dining", "takeaway", "salon", "shop", "homeservice",
      "learning", "professional", "events", "generic",
    ]);
  });

  it("excludes medical categories and all descendants, even with generic leaf names", () => {
    const rows = [
      category("leaf", "General consultation", "middle"),
      category("middle", "Consultations", "c-health"),
      category("c-health", "Health & Medical"),
      category("gym", "Fitness & Wellness"),
      category("retail", "Retail"),
      category("grocery", "Kirana", "retail"),
    ];
    expect(filterMarketplaceCategories(rows).map((row) => row.id)).toEqual(["retail", "grocery"]);
  });

  it.each([
    { categoryId: "c-health-medical" },
    { packageKey: "clinic", categoryName: "Services" },
    { packageKey: "diagnostics" },
    { operatingModel: "HEALTHCARE_CONSULT" },
    { name: "CarePlus Pharmacy", categoryName: "Retail shops" },
    { displayName: "Amanora Dental Centre" },
    { subCategory: "Telemedicine" },
  ])("excludes healthcare listings identified by distinct source fields: %j", (row) => {
    expect(isExcludedMarketplaceEntry(row)).toBe(true);
  });

  it.each([
    { name: "Sharma General Store", packageKey: "shop" },
    { name: "Hadapsar Hospitality", categoryName: "Hotels" },
    { displayName: "Priya's Bakery", categoryName: "Food & Beverage" },
    { categoryName: "Beauty & Personal Care", packageKey: "salon" },
  ])("keeps general shopping and service listings: %j", (row) => {
    expect(isExcludedMarketplaceEntry(row)).toBe(false);
  });
});
