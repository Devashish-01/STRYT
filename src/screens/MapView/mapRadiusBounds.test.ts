import { describe, expect, it } from "vitest";
import { mapRadiusBounds } from "./mapRadiusBounds";
import { WORLD_RADIUS_KM } from "@/utils/constants";

describe("mapRadiusBounds", () => {
  it("keeps the World preset within valid MapLibre latitudes", () => {
    expect(mapRadiusBounds(28.6, 77.2, WORLD_RADIUS_KM)).toEqual([[-180, -85], [180, 85]]);
  });

  it("frames a local search around the selected point", () => {
    const [[west, south], [east, north]] = mapRadiusBounds(28, 77, 10) as [[number, number], [number, number]];
    expect((west + east) / 2).toBeCloseTo(77);
    expect((south + north) / 2).toBeCloseTo(28);
    expect(north - south).toBeCloseTo(20 / 111);
  });

  it("clamps large custom radii near a pole", () => {
    const [[, south], [, north]] = mapRadiusBounds(84, 0, 2000) as [[number, number], [number, number]];
    expect(south).toBeGreaterThanOrEqual(-85);
    expect(north).toBeLessThanOrEqual(85);
  });
});
