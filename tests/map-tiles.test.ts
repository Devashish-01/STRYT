import { describe, expect, it } from "vitest";
import { rasterTiles } from "../src/lib/mapTiles";

describe("rasterTiles", () => {
  it("uses Mapbox 512px tiles when a token is configured", () => {
    const t = rasterTiles("pk.test");
    expect(t.url).toContain("api.mapbox.com/styles/v1/mapbox/");
    expect(t.url).toContain("access_token=pk.test");
    expect(t.tileSize).toBe(512);
    expect(t.zoomOffset).toBe(-1);
    expect(t.attribution).toContain("Mapbox");
    expect(t.attribution).toContain("OpenStreetMap");
  });

  it("falls back to OpenStreetMap with attribution when there is no token", () => {
    const t = rasterTiles("");
    expect(t.url).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
    expect(t.attribution).toContain("OpenStreetMap");
    expect(t.tileSize).toBeUndefined();
  });

  it("never points at the keyless Carto basemap that now serves an API-key placeholder", () => {
    for (const token of ["", "pk.x"]) expect(rasterTiles(token).url).not.toContain("cartocdn");
  });
});
