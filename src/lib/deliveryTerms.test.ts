import { describe, expect, it } from "vitest";
import {
  DEFAULT_DELIVERY_TERMS,
  asapEstimateMin,
  deliveryErrorCode,
  deliveryFeeFor,
  distanceKm,
  effectiveRadiusKm,
  freeDeliveryRemaining,
  isOutsideDeliveryArea,
  minOrderShortfall,
  type DeliveryTerms,
} from "./deliveryTerms";

const terms: DeliveryTerms = { fee: 30, freeAbove: 500, minOrder: 150, radiusKm: 4, prepMin: 20 };

describe("deliveryFeeFor", () => {
  it("charges the flat fee below the free-delivery threshold", () => {
    expect(deliveryFeeFor(200, terms)).toBe(30);
    expect(deliveryFeeFor(499, terms)).toBe(30);
  });
  it("is free at or above the threshold", () => {
    expect(deliveryFeeFor(500, terms)).toBe(0);
    expect(deliveryFeeFor(1200, terms)).toBe(0);
  });
  it("never goes free when no threshold is set", () => {
    expect(deliveryFeeFor(100000, { ...terms, freeAbove: null })).toBe(30);
  });
  it("is free when the fee is zero", () => {
    expect(deliveryFeeFor(10, DEFAULT_DELIVERY_TERMS)).toBe(0);
  });
});

describe("minOrderShortfall", () => {
  it("reports how much is missing", () => {
    expect(minOrderShortfall(100, terms)).toBe(50);
  });
  it("is zero once met, or when there is no minimum", () => {
    expect(minOrderShortfall(150, terms)).toBe(0);
    expect(minOrderShortfall(10, DEFAULT_DELIVERY_TERMS)).toBe(0);
  });
});

describe("freeDeliveryRemaining", () => {
  it("shows what to add for free delivery", () => {
    expect(freeDeliveryRemaining(320, terms)).toBe(180);
  });
  it("is null when already free, never free, or the fee is already zero", () => {
    expect(freeDeliveryRemaining(500, terms)).toBeNull();
    expect(freeDeliveryRemaining(100, { ...terms, freeAbove: null })).toBeNull();
    expect(freeDeliveryRemaining(100, { ...terms, fee: 0 })).toBeNull();
  });
});

describe("distance and area", () => {
  const shop = { lat: 18.5679, lng: 73.9143 };
  it("measures a known short hop (~1.1 km per 0.01° latitude)", () => {
    const d = distanceKm(shop, { lat: 18.5779, lng: 73.9143 });
    expect(d).toBeGreaterThan(1.05);
    expect(d).toBeLessThan(1.2);
  });
  it("flags a drop-off beyond the radius and accepts one inside", () => {
    expect(isOutsideDeliveryArea(shop, { lat: 18.6679, lng: 73.9143 }, 4)).toBe(true);
    expect(isOutsideDeliveryArea(shop, { lat: 18.5779, lng: 73.9143 }, 4)).toBe(false);
  });
  it("does not guess when a position is missing", () => {
    expect(isOutsideDeliveryArea({ lat: null, lng: null }, { lat: 1, lng: 1 }, 4)).toBe(false);
    expect(isOutsideDeliveryArea(shop, { lat: undefined, lng: undefined }, 4)).toBe(false);
  });
});

describe("effectiveRadiusKm", () => {
  it("follows the same fallback chain as the server: own radius, then reach, then 5 km", () => {
    expect(effectiveRadiusKm(terms, 10)).toBe(4);
    expect(effectiveRadiusKm({ ...terms, radiusKm: null }, 10)).toBe(10);
    expect(effectiveRadiusKm({ ...terms, radiusKm: null }, 0)).toBe(5);
    expect(effectiveRadiusKm({ ...terms, radiusKm: null }, undefined)).toBe(5);
  });
});

describe("asapEstimateMin", () => {
  it("adds a travel allowance to the prep time", () => {
    expect(asapEstimateMin(terms, null)).toBe(30);
    expect(asapEstimateMin(terms, 2)).toBe(28);
    expect(asapEstimateMin(terms, 0.2)).toBe(25);
  });
});

describe("deliveryErrorCode", () => {
  it("finds a known server code inside a message", () => {
    expect(deliveryErrorCode("Error: DELIVERY_MIN_ORDER")).toBe("DELIVERY_MIN_ORDER");
    expect(deliveryErrorCode("something else")).toBeNull();
    expect(deliveryErrorCode(undefined)).toBeNull();
  });
});
