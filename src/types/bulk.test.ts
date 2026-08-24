import { describe, it, expect } from "vitest";
import { resolveTierPrice, calcBulkTotal, type BulkTier } from "./bulk";

const deal = (tiers: BulkTier[], regularPrice = 1000) => ({ tiers, regularPrice });

describe("resolveTierPrice", () => {
  it("falls back to the regular price below the first tier", () => {
    expect(resolveTierPrice(deal([{ minQty: 10, unitPrice: 650 }]), 5)).toBe(1000);
  });

  it("applies a tier exactly at its minimum quantity", () => {
    expect(resolveTierPrice(deal([{ minQty: 10, unitPrice: 650 }]), 10)).toBe(650);
  });

  it("picks the BEST qualifying tier, not the first or last listed", () => {
    const tiers = [
      { minQty: 10, unitPrice: 650 },
      { minQty: 25, unitPrice: 580 },
      { minQty: 50, unitPrice: 500 },
    ];
    expect(resolveTierPrice(deal(tiers), 30)).toBe(580);
    expect(resolveTierPrice(deal(tiers), 50)).toBe(500);
    expect(resolveTierPrice(deal(tiers), 999)).toBe(500);
  });

  it("is order-independent — unsorted tiers resolve the same", () => {
    const unsorted = [
      { minQty: 50, unitPrice: 500 },
      { minQty: 10, unitPrice: 650 },
      { minQty: 25, unitPrice: 580 },
    ];
    expect(resolveTierPrice(deal(unsorted), 30)).toBe(580);
  });

  it("handles a deal with no tiers at all", () => {
    expect(resolveTierPrice(deal([]), 100)).toBe(1000);
  });
});

describe("calcBulkTotal", () => {
  it("computes total, savings and percentage against the regular price", () => {
    const r = calcBulkTotal(deal([{ minQty: 10, unitPrice: 650 }]), 15);
    expect(r.unitPrice).toBe(650);
    expect(r.total).toBe(9750);
    expect(r.regularTotal).toBe(15000);
    expect(r.saved).toBe(5250);
    expect(r.savedPercent).toBe(35);
  });

  it("reports zero savings when no tier applies", () => {
    const r = calcBulkTotal(deal([{ minQty: 10, unitPrice: 650 }]), 2);
    expect(r.total).toBe(2000);
    expect(r.saved).toBe(0);
    expect(r.savedPercent).toBe(0);
  });

  it("never reports negative savings if a tier is priced above regular", () => {
    // Guards against a business fat-fingering a tier higher than their own
    // regular price — the card should read "no saving", not a negative one.
    const r = calcBulkTotal(deal([{ minQty: 5, unitPrice: 1200 }]), 10);
    expect(r.saved).toBe(0);
    expect(r.savedPercent).toBe(0);
  });

  it("handles a zero quantity without dividing by zero", () => {
    const r = calcBulkTotal(deal([{ minQty: 10, unitPrice: 650 }]), 0);
    expect(r.total).toBe(0);
    expect(r.savedPercent).toBe(0);
  });
});
