import { config } from "@/config";

/**
 * Raster basemap for the Leaflet maps (shop/provider mini-map, location picker, live share, delivery maps).
 *
 * Carto's keyless "voyager" tiles stopped working: without an API key they now return a placeholder tile that says
 * "API KEY REQUIRED" (checked 2026-10-18), so every one of those maps was a grey square with a diagonal watermark.
 * The main /map screen is unaffected (it uses OpenFreeMap vector tiles).
 *
 * With a Mapbox token (the app already ships one for geocoding) use Mapbox's raster tiles; without one fall back to
 * OpenStreetMap's public tiles, which need no key but come with a usage policy that is fine for development and
 * light traffic, not a long-term production dependency.
 */
export interface RasterTiles {
  url: string;
  attribution: string;
  maxZoom: number;
  /** Mapbox serves 512px tiles; Leaflet needs the matching tileSize + zoomOffset to place them correctly. */
  tileSize?: number;
  zoomOffset?: number;
}

const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export function rasterTiles(mapboxToken: string = config.mapboxToken): RasterTiles {
  if (mapboxToken) {
    return {
      url: `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512/{z}/{x}/{y}?access_token=${mapboxToken}`,
      attribution: `&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> ${OSM_ATTRIBUTION}`,
      maxZoom: 19,
      tileSize: 512,
      zoomOffset: -1,
    };
  }
  return { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: OSM_ATTRIBUTION, maxZoom: 19 };
}

export const RASTER_TILES: RasterTiles = rasterTiles();
