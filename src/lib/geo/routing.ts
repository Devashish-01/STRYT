import { config } from "@/config";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RoadRoute {
  /** Array of [lat, lng] points along the real road network for Leaflet polylines */
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  provider: "mapbox" | "osrm" | "euclidean";
}

function haversineMeters(p1: LatLng, p2: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(p2.lat - p1.lat);
  const dLng = toRad(p2.lng - p1.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// In-memory route cache (keyed by ~11m precision coordinates) to prevent duplicate calls
const routeCache = new Map<string, { route: RoadRoute; expiresAt: number }>();
const CACHE_TTL_MS = 60_000; // 1 minute

function cacheKey(o: LatLng, d: LatLng): string {
  return `${o.lat.toFixed(4)},${o.lng.toFixed(4)}->${d.lat.toFixed(4)},${d.lng.toFixed(4)}`;
}

/**
 * Fetch a turn-by-turn road route between two points using Mapbox Directions v5,
 * falling back to OSRM or Euclidean straight-line if network/provider is unavailable.
 */
export async function getRoadRoute(
  origin: LatLng,
  destination: LatLng,
  signal?: AbortSignal,
): Promise<RoadRoute> {
  const key = cacheKey(origin, destination);
  const cached = routeCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.route;
  }

  // 1. Try Mapbox Directions API if token is present
  const mapboxToken = config.mapboxToken;
  if (mapboxToken) {
    try {
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?geometries=geojson&overview=full&access_token=${mapboxToken}`;
      const res = await fetch(url, { signal });
      if (res.ok) {
        const data = await res.json();
        const route = data.routes?.[0];
        if (route && Array.isArray(route.geometry?.coordinates) && route.geometry.coordinates.length > 0) {
          // Mapbox returns [lng, lat], Leaflet expects [lat, lng]
          const coordinates: [number, number][] = route.geometry.coordinates.map(
            (c: [number, number]) => [c[1], c[0]],
          );
          const result: RoadRoute = {
            coordinates,
            distanceMeters: route.distance ?? haversineMeters(origin, destination),
            durationSeconds: route.duration ?? Math.round(route.distance / 5),
            provider: "mapbox",
          };
          routeCache.set(key, { route: result, expiresAt: Date.now() + CACHE_TTL_MS });
          return result;
        }
      }
    } catch {
      // Mapbox failed or aborted, proceed to fallback
    }
  }

  // 2. Try Open Source Routing Machine (OSRM) as backup
  try {
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
    const res = await fetch(osrmUrl, { signal });
    if (res.ok) {
      const data = await res.json();
      const route = data.routes?.[0];
      if (route && Array.isArray(route.geometry?.coordinates) && route.geometry.coordinates.length > 0) {
        const coordinates: [number, number][] = route.geometry.coordinates.map(
          (c: [number, number]) => [c[1], c[0]],
        );
        const result: RoadRoute = {
          coordinates,
          distanceMeters: route.distance ?? haversineMeters(origin, destination),
          durationSeconds: route.duration ?? Math.round(route.distance / 5),
          provider: "osrm",
        };
        routeCache.set(key, { route: result, expiresAt: Date.now() + CACHE_TTL_MS });
        return result;
      }
    }
  } catch {
    // OSRM failed, proceed to straight-line fallback
  }

  // 3. Fallback: Euclidean straight line
  const dist = haversineMeters(origin, destination);
  const fallback: RoadRoute = {
    coordinates: [
      [origin.lat, origin.lng],
      [destination.lat, destination.lng],
    ],
    distanceMeters: dist,
    durationSeconds: Math.max(60, Math.round((dist / 1000 / 18) * 3600)), // avg 18 km/h city speed
    provider: "euclidean",
  };
  return fallback;
}
