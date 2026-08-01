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

const KM_PER_DEG_LAT = 111;

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

/** Township / gated-community names are often only on internal roads, not admin boundaries. */
export function extractAreaFromRoadName(road: string | undefined | null): string | null {
  if (!road?.trim()) return null;
  const r = road.trim();

  const mainRoad = r.match(/^(.+?)\s+Main\s+Road$/i);
  if (mainRoad?.[1]) return mainRoad[1].trim();

  const suffixMatch = r.match(/^(.+?)\s+(Main\s+)?(Road|Marg|Street|Lane|Way|Boulevard)$/i);
  if (suffixMatch?.[1]) {
    const prefix = suffixMatch[1].trim();
    if (/\b(Town|Township|Park|Nagar|Enclave|Residency|Gardens|Estate|City|Village|Heights|Complex|Colony|Layout|Plaza)\b/i.test(prefix)
      || prefix.split(/\s+/).length >= 3) {
      return prefix;
    }
  }
  return null;
}

interface ReverseGeocodeHit {
  area: string | null;
  city: string | null;
  road: string | null;
  featureName: string | null;
}

async function reverseGeocodeAt(lat: number, lng: number, zoom: number): Promise<ReverseGeocodeHit> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=${zoom}&addressdetails=1&accept-language=en`;
  const res = await fetch(url, { headers: NOMINATIM_HEADERS });
  if (!res.ok) throw new Error(`reverse geocode ${res.status}`);
  const data = await res.json();
  const addr = data?.address ?? {};
  const featureName = typeof data?.name === "string" && data.name.trim() ? data.name.trim() : null;
  return {
    area: pickAreaName(addr),
    city: addr.city || addr.town || addr.municipality || null,
    road: addr.road || null,
    featureName,
  };
}

function areaFromRoadOrFeature(hit: ReverseGeocodeHit): string | null {
  return extractAreaFromRoadName(hit.road) || extractAreaFromRoadName(hit.featureName);
}

// GPS fixes often land on an unnamed internal road inside a large township.
// Reverse-geocoding a short distance away usually hits a named artery (e.g.
// "Amanora Park Town Main Road") — return on the first hit to stay fast and
// within Nominatim rate limits.
async function discoverAreaFromNearbyRoads(lat: number, lng: number): Promise<string | null> {
  const radiusKm = 0.35;
  const dLat = radiusKm / KM_PER_DEG_LAT;
  const dLng = radiusKm / (KM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180) || 1);
  const points = [
    { lat: lat + dLat, lng },
    { lat, lng: lng + dLng },
    { lat: lat - dLat, lng },
    { lat, lng: lng - dLng },
  ];

  for (let i = 0; i < points.length; i++) {
    const hit = await reverseGeocodeAt(points[i].lat, points[i].lng, 17);
    const extracted =
      extractAreaFromRoadName(hit.road) ||
      extractAreaFromRoadName(hit.featureName);
    if (extracted) return extracted;
    if (i < points.length - 1) await sleep(200);
  }
  return null;
}

function scoreNamedPlace(name: string, distKm: number): number {
  let score = 1000 - distKm * 200;
  if (/\bpark\s+town\b/i.test(name)) score += 300;
  if (/\btownship\b/i.test(name)) score += 250;
  if (/\b(town|nagar|enclave|residency|gardens|estate|colony|layout)\b/i.test(name)) score += 120;
  // Prefer the township over a mall, lake, or internal service road label.
  if (/\b(mall|bowl|lake|club\s+house|school\s+road|town\s+centre)\b/i.test(name)) score -= 150;
  return score;
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
async function nearestNamedPlace(lat: number, lng: number, radiusM = 1500, maxDistKm = 1.2): Promise<string | null> {
  const query = `[out:json][timeout:8];(way(around:${radiusM},${lat},${lng})["highway"]["name"];way(around:${radiusM},${lat},${lng})["landuse"="residential"]["name"];relation(around:${radiusM},${lat},${lng})["landuse"="residential"]["name"];way(around:${radiusM},${lat},${lng})["place"]["name"];way(around:${radiusM},${lat},${lng})["landuse"]["name"];);out center;`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    const elements = Array.isArray(data?.elements) ? data.elements : [];
    let best: { name: string; score: number } | null = null;
    for (const el of elements) {
      const rawName = el?.tags?.name;
      const elat = el?.lat ?? el?.center?.lat;
      const elng = el?.lon ?? el?.center?.lon;
      if (!rawName || elat == null || elng == null) continue;
      const fromRoad = extractAreaFromRoadName(rawName);
      const name = fromRoad || rawName.trim();
      const distKm = haversineKm(lat, lng, elat, elng);
      if (distKm > maxDistKm) continue;
      const score = scoreNamedPlace(name, distKm);
      if (!best || score > best.score) best = { name, score };
    }
    return best?.name ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// coords → best area name. Covers the Amanora Park Town / Gopalpatti class of
// bugs where the official revenue-village name OSM returns is not what
// residents use:
//
// 1. Road / feature names at zoom 18/16 (e.g. "Amanora Park Town Main Road").
// 2. Nearby-road sampling when the GPS point sits on an unnamed internal street.
// 3. Overpass named developments within ~1 km.
// 4. Official suburb (zoom 14) and city — genuine last resorts.
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const [fine, mid] = await Promise.all([
        reverseGeocodeAt(lat, lng, 18),
        reverseGeocodeAt(lat, lng, 16),
      ]);
      const fromRoad = areaFromRoadOrFeature(fine) || areaFromRoadOrFeature(mid);
      if (fromRoad) return fromRoad;

      const fromNearbyRoads = await discoverAreaFromNearbyRoads(lat, lng);
      if (fromNearbyRoads) return fromNearbyRoads;

      const named = await nearestNamedPlace(lat, lng);
      if (named) return named;

      if (fine.area) return fine.area;
      if (mid.area) return mid.area;

      const coarse = await reverseGeocodeAt(lat, lng, 14);
      if (coarse.area) return coarse.area;

      return fine.city || mid.city || coarse.city || null;
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
