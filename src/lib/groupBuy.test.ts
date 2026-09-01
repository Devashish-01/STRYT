import { describe, it, expect } from "vitest";
import { poolProgress } from "./groupBuy";

describe("poolProgress", () => {
  it("prefers pledgedQuantity (units) over meTooCount (people)", () => {
    // The real bug: 3 people pledging 4 units each must read as 12/40, not 3/40.
    const p = poolProgress({ target: 40, pledgedQuantity: 12, meTooCount: 3 });
    expect(p.pledged).toBe(12);
    expect(p.target).toBe(40);
    expect(p.pct).toBe(30);
    expect(p.remaining).toBe(28);
    expect(p.complete).toBe(false);
  });

  it("falls back to meTooCount (one unit per person) when pledgedQuantity is absent", () => {
    const p = poolProgress({ target: 10, meTooCount: 4 });
    expect(p.pledged).toBe(4);
    expect(p.pct).toBe(40);
  });

  it("falls back to 0 pledged when neither pledgedQuantity nor meTooCount is set", () => {
    const p = poolProgress({ target: 10 });
    expect(p.pledged).toBe(0);
    expect(p.pct).toBe(0);
  });

  it("has no target: pct/remaining are 0 and hasTarget is false, not NaN/Infinity", () => {
    const p = poolProgress({ pledgedQuantity: 5 });
    expect(p.hasTarget).toBe(false);
    expect(p.target).toBe(0);
    expect(p.pct).toBe(0);
    expect(p.remaining).toBe(0);
    expect(p.complete).toBe(false);
    expect(Number.isFinite(p.pct)).toBe(true);
  });

  it("clamps pct at 100 when the pool is over-subscribed", () => {
    const p = poolProgress({ target: 10, pledgedQuantity: 25 });
    expect(p.pct).toBe(100);
    expect(p.remaining).toBe(0);
    expect(p.complete).toBe(true);
  });

  it("treats a negative or fractional target as 0 (no target)", () => {
    expect(poolProgress({ target: -5, pledgedQuantity: 3 }).hasTarget).toBe(false);
    expect(poolProgress({ target: 10.7, pledgedQuantity: 5 }).target).toBe(10);
  });

  it("reports joined only when myPledgeQuantity is positive", () => {
    expect(poolProgress({ myPledgeQuantity: 0 }).joined).toBe(false);
    expect(poolProgress({ myPledgeQuantity: undefined }).joined).toBe(false);
    expect(poolProgress({ myPledgeQuantity: 3 }).joined).toBe(true);
  });

  it("never goes negative on pledged even with bad input", () => {
    expect(poolProgress({ pledgedQuantity: -5 }).pledged).toBe(0);
  });

  it("complete is exactly at target, not just past it", () => {
    expect(poolProgress({ target: 10, pledgedQuantity: 10 }).complete).toBe(true);
    expect(poolProgress({ target: 10, pledgedQuantity: 9 }).complete).toBe(false);
  });
});
