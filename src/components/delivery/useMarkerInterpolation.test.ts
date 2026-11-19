import { describe, it, expect } from "vitest";
import { shortestAngleDelta } from "./useMarkerInterpolation";

describe("useMarkerInterpolation helper", () => {
  it("computes shortest angular delta without 360 wrap arounds", () => {
    // Normal turns
    expect(shortestAngleDelta(10, 30)).toBe(20);
    expect(shortestAngleDelta(30, 10)).toBe(-20);

    // Crossing 0 / 360 boundary
    expect(shortestAngleDelta(350, 10)).toBe(20);
    expect(shortestAngleDelta(10, 350)).toBe(-20);

    // Exact 180 degrees
    expect(Math.abs(shortestAngleDelta(0, 180))).toBe(180);
  });
});
