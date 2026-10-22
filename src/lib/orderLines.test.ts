import { describe, expect, it } from "vitest";
import { linesFromRows, orderTotal, summarizeLines, type OrderLine } from "./orderLines";

const atta: OrderLine = { catalogItemId: "ci_1", name: "Atta 5 kg", price: 265, quantity: 2 };
const milk: OrderLine = { catalogItemId: "ci_2", name: "Milk", price: 70, quantity: 1 };

describe("summarizeLines", () => {
  it("names every item with its quantity, single or not", () => {
    expect(summarizeLines([atta, milk])).toBe("Atta 5 kg x2, Milk x1");
    expect(summarizeLines([milk])).toBe("Milk x1");
  });

  it("stays inside the cap with an ellipsis", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ ...milk, name: `Item number ${i}` }));
    const text = summarizeLines(many, 60);
    expect(text.length).toBeLessThanOrEqual(60);
    expect(text.endsWith("…")).toBe(true);
  });
});

describe("orderTotal", () => {
  it("is price times quantity, summed", () => {
    expect(orderTotal([atta, milk])).toBe(600);
    expect(orderTotal([])).toBe(0);
  });
});

describe("linesFromRows", () => {
  it("maps the embedded appointment_items rows, oldest first", () => {
    const rows = [
      { catalog_item_id: "ci_2", item_name: "Milk", unit_price: "70", quantity: 1, created_at: "2026-10-22T10:00:02Z" },
      { catalog_item_id: "ci_1", item_name: "Atta 5 kg", unit_price: 265, quantity: 2, created_at: "2026-10-22T10:00:01Z" },
    ];
    expect(linesFromRows(rows)).toEqual([atta, milk]);
  });

  it("is undefined when there is nothing to show, so a plain booking is unchanged", () => {
    expect(linesFromRows(undefined)).toBeUndefined();
    expect(linesFromRows(null)).toBeUndefined();
    expect(linesFromRows([])).toBeUndefined();
    expect(linesFromRows([{ item_name: "x", unit_price: 1, quantity: 0 }])).toBeUndefined();
  });

  it("copes with a missing catalog id (the item was later deleted)", () => {
    expect(linesFromRows([{ catalog_item_id: null, item_name: "Gone", unit_price: 5, quantity: 1 }])?.[0].catalogItemId).toBe("");
  });
});
