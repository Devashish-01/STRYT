import type { LngLatBoundsLike } from "maplibre-gl";
import { WORLD_RADIUS_KM } from "@/utils/constants";

/** Fit a radius without sending latitudes outside MapLibre's usable range. */
export function mapRadiusBounds(lat: number, lng: number, radiusKm: number): LngLatBoundsLike {
  if (radiusKm >= WORLD_RADIUS_KM) return [[-180, -85], [180, 85]];

  const centerLat = Math.max(-85, Math.min(85, lat));
  const latDelta = radiusKm / 111;
  const lngDelta = Math.min(180, radiusKm / (111 * Math.max(0.01, Math.abs(Math.cos((centerLat * Math.PI) / 180)))));
  return [
    [lng - lngDelta, Math.max(-85, centerLat - latDelta)],
    [lng + lngDelta, Math.min(85, centerLat + latDelta)],
  ];
}
