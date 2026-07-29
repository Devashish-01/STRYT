// Nominatim (OpenStreetMap) geocoding helpers.
// Reverse = coords → area name (e.g. "Marathahalli").
// Forward = typed query → candidate places with coords (used to set a remote /
// custom location). Both fail soft (return null/[]) so callers can fall back to
// manual entry when offline.
import { config } from "@/config";

export interface GeoPlace {
  area: string;   // short name — neighbourhood/locality (e.g. "Marathahalli")
  full: string;   // full label (e.g. "Marathahalli, Bengaluru, Karnataka")
  lat: number;
  lng: number;
}

const NOMINATIM_HEADERS = {
  // Nominatim Terms of Service requires a custom User-Agent to identify the application
  "User-Agent": "STRYT-App/1.0 (contact@stryt.in)"
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function pickAreaName(addr: Record<string, string | undefined>): string | null {
  return (
    addr.neighbourhood ||
    addr.residential ||
    addr.suburb ||
    addr.village ||
    addr.quarter ||
    addr.locality ||
    addr.city_district ||
    addr.town ||
    null
  );
}

async function reverseGeocodeAt(lat: number, lng: number, zoom: number): Promise<{ area: string | null; city: string | null }> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=${zoom}&addressdetails=1&accept-language=en`;
  const res = await fetch(url, { headers: NOMINATIM_HEADERS });
  if (!res.ok) throw new Error(`reverse geocode ${res.status}`);
  const data = await res.json();
  const addr = data?.address ?? {};
  return { area: pickAreaName(addr), city: addr.city || null };
}

/**
 * Nearest named real-world place (park, township, residential/retail
 * development) within a short radius, via OSM's Overpass API. Covers a gap
 * plain Nominatim reverse geocoding can't: administrative-boundary lookups
 * (what `reverseGeocodeAt` does) only know a point's *official* revenue
 * village/suburb name, which for a large private township can be a totally
 * different, unrecognizable name from what everyone actually calls the area —
 * confirmed on a real report: a point inside "Amanora Park Town", Pune,
 * reverse-geocodes to the official suburb "Gopalpatti" (correct per OSM's
 * admin hierarchy, but not what a resident there would call their location).
 * Overpass finds the actual named developments nearby ("Amanora Town Centre",
 * "Amanora The Fern") since those exist as separate POI/landuse features, not
 * as part of the address hierarchy. Fails soft (null) on any error/timeout —
 * this is a last-resort enrichment, not something worth blocking or retrying.
 */
async function nearestNamedPlace(lat: number, lng: number, radiusM = 1500): Promise<string | null> {
  const query = `[out:json][timeout:8];(node(around:${radiusM},${lat},${lng})["place"]["name"];way(around:${radiusM},${lat},${lng})["place"]["name"];node(around:${radiusM},${lat},${lng})["leisure"="park"]["name"];way(around:${radiusM},${lat},${lng})["landuse"]["name"];);out center;`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    const elements = Array.isArray(data?.elements) ? data.elements : [];
    let best: { name: string; distKm: number } | null = null;
    for (const el of elements) {
      const name = el?.tags?.name;
      const elat = el?.lat ?? el?.center?.lat;
      const elng = el?.lon ?? el?.center?.lon;
      if (!name || elat == null || elng == null) continue;
      const distKm = haversineKm(lat, lng, elat, elng);
      if (!best || distKm < best.distKm) best = { name, distKm };
    }
    return best?.name ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// coords → best area name. Three real-world gaps this covers, confirmed
// against an actual reported bug (a user's stored coordinates, at Amanora
// Park Town, Pune, reverse-geocoded first to "Pimpri-Chinchwad", then to the
// technically-correct-but-unrecognizable "Gopalpatti"):
//
// 1. Zoom 18 (building/street level) is the most precise when the point is
//    well-tagged (e.g. a named residential enclave), but many real points are
//    only tagged with a road/building and NO neighbourhood-level field at all —
//    falling straight to `city` there can land on a whole separate, distant
//    municipal area (confirmed: OSM's own data tags that exact point's `city`
//    as "Pimpri-Chinchwad", an adjacent municipal corporation, not the actual
//    neighbourhood). A second, coarser lookup at zoom 14 (suburb level) finds
//    the official local revenue-village/suburb name where zoom 18 found
//    nothing.
// 2. That official name can still be unrecognizable — large private
//    townships are often built on and administratively named after a
//    pre-existing village, which residents never actually call their area.
//    `nearestNamedPlace` looks for actual named developments/parks nearby via
//    Overpass, which surfaces the real, recognizable name in that case.
//    `city` is now a genuine last resort, tried only after all three lookups
//    above find nothing.
// 3. Retries once on failure — a transient network blip or Nominatim's rate
//    limit shouldn't mean a stale area name gets silently left in place
//    elsewhere (see autoRefreshLocation in store.tsx, which used to leave the
//    OLD area name showing forever whenever this returned null even though
//    the coordinates themselves had already moved to the new position).
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fine = await reverseGeocodeAt(lat, lng, 18);
      if (fine.area) return fine.area;
      const coarse = await reverseGeocodeAt(lat, lng, 14);
      if (coarse.area) return coarse.area;
      const named = await nearestNamedPlace(lat, lng);
      if (named) return named;
      return fine.city || coarse.city || null;
    } catch {
      if (attempt === 0) { await sleep(600); continue; }
      return null;
    }
  }
  return null;
}

export interface GeocodeResult {
  city: string | null;
  pincode: string | null;
}

export async function reverseGeocodeFull(lat: number, lng: number): Promise<GeocodeResult | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=en`;
    const res = await fetch(url, { headers: NOMINATIM_HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data?.address ?? {};
    
    const city = addr.city || addr.town || addr.village || addr.municipality || null;
    const pincode = addr.postcode || null;
    
    return { city, pincode };
  } catch {
    return null;
  }
}

// typed query → up to 5 candidate places (India-biased). Used by the "set a
// different location" search so a user can browse a remote area.
export async function forwardGeocode(query: string): Promise<GeoPlace[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    const country = config.defaultCountry || "in";
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&addressdetails=1&countrycodes=${country}&accept-language=en`;
    const res = await fetch(url, { headers: NOMINATIM_HEADERS });
    if (!res.ok) return [];
    const data = await res.json();
    
    if (!Array.isArray(data)) return [];
    
    return data.map((item: any): GeoPlace => {
      const addr = item.address ?? {};
      // Determine a friendly short area name (e.g. suburb/neighborhood, fallback to first segment of display name)
      const areaName =
        item.name ||
        addr.neighbourhood ||
        addr.suburb ||
        addr.village ||
        addr.locality ||
        addr.city_district ||
        item.display_name.split(",")[0];

      return {
        area: areaName,
        full: item.display_name,
        lng: parseFloat(item.lon),
        lat: parseFloat(item.lat),
      };
    });
  } catch {
    return [];
  }
}

// A handful of real nearby neighbourhood names around a point, for the
// location picker's "Nearby areas" list — replaces a static hardcoded list
// (previously 3 fixed spots in Pune/Bengaluru, wrong for anyone elsewhere).
// No places API/key involved: reverse-geocodes a few points a short distance
// out in each cardinal direction, reusing the same free Nominatim endpoint
// the GPS button already calls. Sequential (not Promise.all) and lightly
// throttled to respect Nominatim's ~1 req/sec usage policy.
const NEARBY_OFFSET_KM = 1.5;
const KM_PER_DEG_LAT = 111;

export async function nearbyAreas(lat: number, lng: number): Promise<GeoPlace[]> {
  const dLat = NEARBY_OFFSET_KM / KM_PER_DEG_LAT;
  const dLng = NEARBY_OFFSET_KM / (KM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180) || 1);
  const points = [
    { lat: lat + dLat, lng },
    { lat: lat - dLat, lng },
    { lat, lng: lng + dLng },
    { lat, lng: lng - dLng },
  ];

  const seen = new Set<string>();
  const results: GeoPlace[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const name = await reverseGeocode(p.lat, p.lng);
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      results.push({ area: name, full: name, lat: p.lat, lng: p.lng });
    }
    if (i < points.length - 1) await sleep(300);
  }
  return results;
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}
