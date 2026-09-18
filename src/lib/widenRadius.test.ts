import { describe, it, expect } from "vitest";
import { nextWidenRadius } from "./widenRadius";
import { WORLD_RADIUS_KM } from "@/utils/constants";

describe("the empty feed's Widen button", () => {
  it("offers the next preset, never the radius already in use", () => {
    expect(nextWidenRadius(5)).toBe(10); // used to say "Widen to 5 km" at 5 km and do nothing
    expect(nextWidenRadius(0.5)).toBe(1);
    expect(nextWidenRadius(10)).toBe(25);
  });

  it("rounds a custom radius up to the next preset", () => {
    expect(nextWidenRadius(3.5)).toBe(5);
    expect(nextWidenRadius(12)).toBe(25);
  });

  it("offers nothing past the largest regular preset, and never jumps to World", () => {
    expect(nextWidenRadius(100)).toBeNull();
    expect(nextWidenRadius(250)).toBeNull();
    expect(nextWidenRadius(WORLD_RADIUS_KM)).toBeNull();
  });
});
