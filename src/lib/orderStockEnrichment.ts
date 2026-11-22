import type { OrderLine } from "./orderLines";
import type { CatalogItem } from "@/types";

export type StockHealth = "IN_STOCK" | "LOW_STOCK" | "SHORTAGE" | "OUT_OF_STOCK" | "UNTRACKED";

export interface EnrichedOrderLine extends OrderLine {
  catalogItem?: CatalogItem;
  stockHealth: StockHealth;
  availableQuantity: number | null;
  shortageCount: number;
}

/**
 * Correlates order line items with a business's live catalog to provide
 * instant visibility into available inventory before and during order fulfillment.
 */
export function enrichOrderLinesWithStock(
  lines: readonly OrderLine[] | undefined,
  catalog: readonly CatalogItem[] | undefined
): EnrichedOrderLine[] {
  if (!lines || lines.length === 0) return [];
  const catalogMap = new Map((catalog ?? []).map((c) => [c.id, c]));

  return lines.map((line) => {
    const orderedQty = Math.max(1, Math.floor(Number(line.quantity) || 0));
    const safeLine: OrderLine = { ...line, quantity: orderedQty };
    const item = catalogMap.get(safeLine.catalogItemId);
    if (!item) {
      return {
        ...safeLine,
        stockHealth: "UNTRACKED",
        availableQuantity: null,
        shortageCount: 0,
      };
    }

    if (item.inventoryType === "FINITE") {
      const stock = Math.max(0, Math.floor(Number(item.quantity) || 0));
      if (stock <= 0 || item.stockStatus === "OUT_OF_STOCK") {
        return {
          ...safeLine,
          catalogItem: item,
          stockHealth: "OUT_OF_STOCK",
          availableQuantity: stock,
          shortageCount: orderedQty,
        };
      }
      if (stock < orderedQty) {
        return {
          ...safeLine,
          catalogItem: item,
          stockHealth: "SHORTAGE",
          availableQuantity: stock,
          shortageCount: orderedQty - stock,
        };
      }
      if (stock <= 3 || item.stockStatus === "LIMITED") {
        return {
          ...safeLine,
          catalogItem: item,
          stockHealth: "LOW_STOCK",
          availableQuantity: stock,
          shortageCount: 0,
        };
      }
      return {
        ...safeLine,
        catalogItem: item,
        stockHealth: "IN_STOCK",
        availableQuantity: stock,
        shortageCount: 0,
      };
    }

    // INFINITE inventory (made-to-order food, services)
    if (item.stockStatus === "OUT_OF_STOCK") {
      return {
        ...safeLine,
        catalogItem: item,
        stockHealth: "OUT_OF_STOCK",
        availableQuantity: null,
        shortageCount: 0,
      };
    }
    return {
      ...safeLine,
      catalogItem: item,
      stockHealth: "IN_STOCK",
      availableQuantity: null,
      shortageCount: 0,
    };
  });
}

/**
 * Returns true if any finite item in the order has fewer units in stock than ordered.
 */
export function hasStockShortage(lines: readonly EnrichedOrderLine[]): boolean {
  return lines.some((l) => l.stockHealth === "SHORTAGE" || l.stockHealth === "OUT_OF_STOCK");
}
