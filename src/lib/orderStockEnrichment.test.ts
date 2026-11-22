import { describe, it, expect } from "vitest";
import { enrichOrderLinesWithStock, hasStockShortage } from "./orderStockEnrichment";
import type { OrderLine } from "./orderLines";
import type { CatalogItem } from "@/types";

describe("orderStockEnrichment", () => {
  const catalog: CatalogItem[] = [
    {
      id: "item_milk",
      name: "Toned Milk 1L",
      description: "Fresh milk",
      price: 70,
      image: "",
      stockStatus: "IN_STOCK",
      inventoryType: "FINITE",
      quantity: 10,
    },
    {
      id: "item_bread",
      name: "Sandwich Bread",
      description: "Whole wheat",
      price: 45,
      image: "",
      stockStatus: "LIMITED",
      inventoryType: "FINITE",
      quantity: 2,
    },
    {
      id: "item_egg",
      name: "Eggs 6pk",
      description: "Farm eggs",
      price: 60,
      image: "",
      stockStatus: "OUT_OF_STOCK",
      inventoryType: "FINITE",
      quantity: 0,
    },
    {
      id: "item_chai",
      name: "Masala Chai",
      description: "Hot tea",
      price: 20,
      image: "",
      stockStatus: "IN_STOCK",
      inventoryType: "INFINITE",
    },
  ];

  it("returns empty array for empty lines", () => {
    expect(enrichOrderLinesWithStock(undefined, catalog)).toEqual([]);
    expect(enrichOrderLinesWithStock([], catalog)).toEqual([]);
  });

  it("handles untracked items when item not in catalog", () => {
    const lines: OrderLine[] = [
      { catalogItemId: "item_unknown", name: "Custom item", price: 100, quantity: 1 },
    ];
    const res = enrichOrderLinesWithStock(lines, catalog);
    expect(res[0].stockHealth).toBe("UNTRACKED");
    expect(res[0].availableQuantity).toBeNull();
    expect(res[0].shortageCount).toBe(0);
    expect(hasStockShortage(res)).toBe(false);
  });

  it("correctly flags sufficient stock for FINITE items", () => {
    const lines: OrderLine[] = [
      { catalogItemId: "item_milk", name: "Toned Milk 1L", price: 70, quantity: 3 },
    ];
    const res = enrichOrderLinesWithStock(lines, catalog);
    expect(res[0].stockHealth).toBe("IN_STOCK");
    expect(res[0].availableQuantity).toBe(10);
    expect(res[0].shortageCount).toBe(0);
    expect(hasStockShortage(res)).toBe(false);
  });

  it("flags shortage when ordered quantity exceeds available finite stock", () => {
    const lines: OrderLine[] = [
      { catalogItemId: "item_bread", name: "Sandwich Bread", price: 45, quantity: 5 },
    ];
    const res = enrichOrderLinesWithStock(lines, catalog);
    expect(res[0].stockHealth).toBe("SHORTAGE");
    expect(res[0].availableQuantity).toBe(2);
    expect(res[0].shortageCount).toBe(3);
    expect(hasStockShortage(res)).toBe(true);
  });

  it("flags out of stock items", () => {
    const lines: OrderLine[] = [
      { catalogItemId: "item_egg", name: "Eggs 6pk", price: 60, quantity: 1 },
    ];
    const res = enrichOrderLinesWithStock(lines, catalog);
    expect(res[0].stockHealth).toBe("OUT_OF_STOCK");
    expect(res[0].availableQuantity).toBe(0);
    expect(res[0].shortageCount).toBe(1);
    expect(hasStockShortage(res)).toBe(true);
  });

  it("treats infinite items with stockStatus IN_STOCK as IN_STOCK without finite count", () => {
    const lines: OrderLine[] = [
      { catalogItemId: "item_chai", name: "Masala Chai", price: 20, quantity: 4 },
    ];
    const res = enrichOrderLinesWithStock(lines, catalog);
    expect(res[0].stockHealth).toBe("IN_STOCK");
    expect(res[0].availableQuantity).toBeNull();
    expect(res[0].shortageCount).toBe(0);
    expect(hasStockShortage(res)).toBe(false);
  });
});
