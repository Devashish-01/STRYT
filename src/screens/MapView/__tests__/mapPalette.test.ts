import { describe, it, expect } from "vitest";
import { hexToRgb, mixHex, paletteFor, retintFor } from "../mapPalette";

/**
 * The first tests this screen has ever had — src/screens/MapView/__tests__/
 * was an empty directory before this. The palette is the one piece of the
 * basemap retint that's pure enough to verify without a GPU.
 */

describe("hexToRgb", () => {
  it("parses 6-digit hex", () => {
    expect(hexToRgb("#8b47f5")).toEqual([139, 71, 245]);
  });

  it("expands 3-digit shorthand", () => {
    expect(hexToRgb("#fff")).toEqual([255, 255, 255]);
    expect(hexToRgb("#000")).toEqual([0, 0, 0]);
  });

  it("works without a leading #", () => {
    expect(hexToRgb("ffffff")).toEqual([255, 255, 255]);
  });

  it("falls back to black for anything unparseable, never throws", () => {
    expect(hexToRgb("not-a-color")).toEqual([0, 0, 0]);
    expect(hexToRgb("")).toEqual([0, 0, 0]);
    expect(hexToRgb("#gggggg")).toEqual([0, 0, 0]);
  });
});

describe("mixHex", () => {
  it("returns exactly `a` at t=0 and exactly `b` at t=1", () => {
    expect(mixHex("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixHex("#000000", "#ffffff", 1)).toBe("#ffffff");
  });

  it("blends linearly at the midpoint", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  it("clamps out-of-range t instead of extrapolating", () => {
    expect(mixHex("#000000", "#ffffff", -5)).toBe("#000000");
    expect(mixHex("#000000", "#ffffff", 5)).toBe("#ffffff");
  });

  it("clamps NaN to 0 rather than producing NaN in the output", () => {
    expect(mixHex("#000000", "#ffffff", NaN)).toBe("#000000");
  });
});

describe("paletteFor — the lampGlow contract every consumer depends on", () => {
  it("is a pure function: same input, same output, no shared mutable state", () => {
    expect(paletteFor(0.42)).toEqual(paletteFor(0.42));
  });

  it("noon (0) and night (1) are visibly different on every role", () => {
    const day = paletteFor(0);
    const night = paletteFor(1);
    for (const key of Object.keys(day) as (keyof typeof day)[]) {
      expect(day[key], `${key} should differ between day and night`).not.toBe(night[key]);
    }
  });

  it("clamps out-of-contract lampGlow instead of producing an invalid palette", () => {
    expect(paletteFor(-1)).toEqual(paletteFor(0));
    expect(paletteFor(2)).toEqual(paletteFor(1));
  });

  it("every returned value is a valid 6-digit hex", () => {
    const p = paletteFor(0.5);
    for (const value of Object.values(p)) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("retintFor — dispatch must be schema-based, not id-based", () => {
  const day = paletteFor(0);
  const night = paletteFor(1);

  it("colors the ground plane via the background type, no source-layer needed", () => {
    expect(retintFor(undefined, "background", day)).toEqual([
      { property: "background-color", value: day.land },
    ]);
  });

  it("returns no patches for an unrecognised source-layer — fails soft, not broken", () => {
    expect(retintFor("some_future_layer", "fill", day)).toEqual([]);
  });

  it("returns no patches for a layer type it doesn't own (circle/heatmap/raster)", () => {
    expect(retintFor("water", "circle", day)).toEqual([]);
    expect(retintFor("water", "heatmap", day)).toEqual([]);
    expect(retintFor("water", "raster", day)).toEqual([]);
  });

  it("fill layers on water/landcover/building resolve to the matching palette role", () => {
    expect(retintFor("water", "fill", day)).toEqual([{ property: "fill-color", value: day.water }]);
    expect(retintFor("landcover", "fill", day)).toEqual([{ property: "fill-color", value: day.park }]);
    expect(retintFor("building", "fill", day)).toEqual([{ property: "fill-color", value: day.building }]);
  });

  it("line layers on roads use the road color by default", () => {
    expect(retintFor("transportation", "line", day)).toEqual([
      { property: "line-color", value: day.road },
    ]);
  });

  it("a road line layer whose id mentions casing/outline gets the quieter casing tone", () => {
    expect(retintFor("transportation", "line", day, "road_casing")).toEqual([
      { property: "line-color", value: day.roadCasing },
    ]);
    expect(retintFor("transportation", "line", day, "bridge-outline")).toEqual([
      { property: "line-color", value: day.roadCasing },
    ]);
  });

  it("dispatch is driven by source-layer, not by id — an arbitrary id still resolves correctly", () => {
    // Same source-layer, wildly different id (simulating a different style's
    // naming convention) must still land on the same role.
    const a = retintFor("water", "fill", day, "water-fill-1");
    const b = retintFor("water", "fill", day, "openmaptiles-water-a1b2c3");
    expect(a).toEqual(b);
  });

  it("symbol layers (labels) get both text-color and a halo tracking `land`", () => {
    expect(retintFor("place", "symbol", day)).toEqual([
      { property: "text-color", value: day.label },
      { property: "text-halo-color", value: day.labelHalo },
    ]);
    // A water label is still a label — same treatment as `place`.
    expect(retintFor("water_name", "symbol", day)).toEqual([
      { property: "text-color", value: day.label },
      { property: "text-halo-color", value: day.labelHalo },
    ]);
  });

  it("fill-extrusion (3D buildings) maps to the building color", () => {
    expect(retintFor("building", "fill-extrusion", day)).toEqual([
      { property: "fill-extrusion-color", value: day.building },
    ]);
  });

  it("night palette produces different patches than day for the same layer", () => {
    const dayPatch = retintFor("water", "fill", day);
    const nightPatch = retintFor("water", "fill", night);
    expect(dayPatch).not.toEqual(nightPatch);
  });

  it("boundary lines get their own dedicated tone, distinct from roads", () => {
    const patch = retintFor("boundary", "line", day);
    expect(patch).toEqual([{ property: "line-color", value: day.boundary }]);
    expect(day.boundary).not.toBe(day.road);
  });
});
