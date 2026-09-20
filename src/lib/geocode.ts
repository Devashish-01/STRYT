// Nominatim (OpenStreetMap) geocoding helpers.
// Reverse = coords → area name (e.g. "Marathahalli").
// Forward = typed query → candidate places with coords (used to set a remote /
// custom location). Both fail soft (return null/[]) so callers can fall back to
// manual entry when offline.
import { config } from "@/config";
import { primaryProvider, fallbackProvider } from "./geo";
import type { ReverseHit } from "./geo";

export interface GeoPlace {
  area: string;   // short name — neighbourhood/locality (e.g. "Marathahalli")
  full: string;   // full label (e.g. "Marathahalli, Bengaluru, Karnataka")
  lat: number;
  lng: number;
}

// NOTE: there is deliberately no User-Agent header here any more.
// Browsers treat `User-Agent` as a forbidden header name and silently drop it
// from fetch(), so the previous NOMINATIM_HEADERS constant identified nothing —
// it just looked like it satisfied Nominatim's ToS. Identification for a
// browser app comes from the Referer, which we can't set either. That, plus
// the request volume below, is why this app started getting HTTP 429.

const KM_PER_DEG_LAT = 111;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Rate limiting ───────────────────────────────────────────────────────────
// Nominatim's public instance allows ~1 request/second per app and explicitly
// forbids using it as a primary geocoder. The old code blew straight past that:
// a single reverseGeocode() could fire SEVEN requests — two in parallel via
// Promise.all, up to four more 200 ms apart, then a coarse pass — and
// nearbyAreas() called it four times over, so opening the location picker could
// mean ~28 requests in a few seconds. Hence the 429s.
//
// Every Nominatim call now goes through one serial queue with a hard minimum
// gap. Slower by design: being throttled off the service entirely is worse.
const NOMINATIM_MIN_GAP_MS = 1100;
let nominatimChain: Promise<unknown> = Promise.resolve();
let lastNominatimAt = 0;

function queueNominatim<T>(fn: () => Promise<T>): Promise<T> {
  const run = nominatimChain.then(async () => {
    const wait = NOMINATIM_MIN_GAP_MS - (Date.now() - lastNominatimAt);
    if (wait > 0) await sleep(wait);
    lastNominatimAt = Date.now();
    return fn();
  });
  // Keep the chain alive even if this link rejects, or one failure stalls
  // every later lookup forever.
  nominatimChain = run.catch(() => undefined);
  return run;
}

// ── Cache ───────────────────────────────────────────────────────────────────
// Area names don't change. Caching is the single biggest reduction in request
// volume: panning a map back over somewhere already resolved, re-opening the
// location picker, or re-running onboarding all used to re-fetch from scratch.
//
// Keyed on coordinates rounded to 4 decimal places (~11 m) so GPS jitter
// resolves to the same cache entry instead of a fresh lookup every fix.
const CACHE_PREFIX = "stryt_geo_";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const memCache = new Map<string, { v: unknown; t: number }>();

function coordKey(kind: string, lat: number, lng: number): string {
  return `${kind}:${lat.toFixed(4)},${lng.toFixed(4)}`;
}

function cacheGet<T>(key: string): T | undefined {
  const hit = memCache.get(key);
  if (hit && Date.now() - hit.t < CACHE_TTL_MS) return hit.v as T;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { v: T; t: number };
    if (Date.now() - parsed.t >= CACHE_TTL_MS) return undefined;
    memCache.set(key, parsed);
    return parsed.v;
  } catch {
    return undefined;
  }
}

function cacheSet(key: string, v: unknown): void {
  const entry = { v, t: Date.now() };
  memCache.set(key, entry);
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch { /* quota/private mode — the in-memory half still works */ }
}

// ── Mapbox (primary provider) ───────────────────────────────────────────────
// The app already ships a Mapbox token for the map, and Mapbox's geocoding is
// designed to be called from an app — unlike Nominatim's public instance, which
// is a community service being used far outside its terms here. So Mapbox goes
// first and Nominatim becomes the fallback for when the token is missing or the
// request fails.
// Mapbox now lives behind the provider interface (./geo/mapbox.ts). These two wrappers keep the call
// sites below reading the same as before — one asks "what does the primary geocoder say about this
// point", the other "did it give us a usable area name".
async function primaryReverse(lat: number, lng: number): Promise<ReverseHit> {
  return primaryProvider().reverse(lat, lng, 0);
}

function areaFromPrimary(hit: ReverseHit | null): string | null {
  return hit?.area ?? null;
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
  const key = coordKey(`rev${zoom}`, lat, lng);
  const cached = cacheGet<ReverseGeocodeHit>(key);
  if (cached) return cached;

  // Still inside queueNominatim: the provider makes the request, the queue decides when. Keeping the
  // 1 req/s gate here rather than in the provider is what lets a replacement inherit it for free.
  const hit = await queueNominatim(() => fallbackProvider().reverse(lat, lng, zoom));
  cacheSet(key, hit);
  return hit;
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
  const key = coordKey("area", lat, lng);
  const cached = cacheGet<string | null>(key);
  if (cached !== undefined) return cached;

  // 1. Mapbox first — ONE request, and it's a service meant to be called this
  //    way. This is what takes the common case from ~7 Nominatim hits to zero.
  const mb = areaFromPrimary(await primaryReverse(lat, lng));
  if (mb) { cacheSet(key, mb); return mb; }

  // 2. Fall through to the OSM cascade only when Mapbox gave nothing (or no
  //    token is configured). Everything below is now serialised and cached, so
  //    the worst case is slow rather than rate-limited.
  //
  //    The cascade itself is kept because it solves a real problem Mapbox and
  //    plain reverse geocoding both share: a point inside a large private
  //    township resolves to the official revenue-village name nobody uses
  //    ("Gopalpatti" rather than "Amanora Park Town"). Road/feature names and
  //    Overpass developments recover the name residents actually say.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // Sequential, not Promise.all — two parallel calls broke the 1 req/sec
      // policy on their own, before the rest of the cascade even started.
      const fine = await reverseGeocodeAt(lat, lng, 18);
      const fromFine = areaFromRoadOrFeature(fine);
      if (fromFine) { cacheSet(key, fromFine); return fromFine; }

      const mid = await reverseGeocodeAt(lat, lng, 16);
      const fromMid = areaFromRoadOrFeature(mid);
      if (fromMid) { cacheSet(key, fromMid); return fromMid; }

      // Cheap, already-fetched answers before any further network work.
      if (fine.area) { cacheSet(key, fine.area); return fine.area; }
      if (mid.area) { cacheSet(key, mid.area); return mid.area; }

      // Overpass before the 4-point road sweep: one request instead of four.
      const named = await nearestNamedPlace(lat, lng);
      if (named) { cacheSet(key, named); return named; }

      const fromNearbyRoads = await discoverAreaFromNearbyRoads(lat, lng);
      if (fromNearbyRoads) { cacheSet(key, fromNearbyRoads); return fromNearbyRoads; }

      const coarse = await reverseGeocodeAt(lat, lng, 14);
      const out = coarse.area || fine.city || mid.city || coarse.city || null;
      cacheSet(key, out);
      return out;
    } catch {
      if (attempt === 0) { await sleep(1200); continue; }
      // Don't cache a failure — a 429 or a dropped connection shouldn't pin
      // this coordinate to "unknown" for the next 30 days.
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
  const key = coordKey("full", lat, lng);
  const cached = cacheGet<GeocodeResult>(key);
  if (cached) return cached;

  // The primary geocoder returns both the place and the postcode in one call.
  const hit = await primaryReverse(lat, lng);
  if (hit.city || hit.postcode) {
    const out = { city: hit.city, pincode: hit.postcode };
    cacheSet(key, out);
    return out;
  }

  try {
    const fb = await queueNominatim(() => fallbackProvider().reverse(lat, lng, 18));
    const out = { city: fb.city, pincode: fb.postcode };
    cacheSet(key, out);
    return out;
  } catch {
    return null;
  }
}

// typed query → up to 5 candidate places (India-biased). Used by the "set a
// different location" search so a user can browse a remote area.
export async function forwardGeocode(query: string): Promise<GeoPlace[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const country = config.defaultCountry || "in";
  const cacheKey = `fwd:${country}:${q.toLowerCase()}`;
  const cached = cacheGet<GeoPlace[]>(cacheKey);
  if (cached) return cached;

  // Primary first. This path is search-as-you-type (Explore, the map SearchBar,
  // onboarding), which is the single worst thing to point at Nominatim — their
  // terms call out autocomplete explicitly. Mapbox is built for it.
  const primaryHits = await primaryProvider().forward(q, country);
  if (primaryHits.length) {
    cacheSet(cacheKey, primaryHits);
    return primaryHits;
  }

  try {
    const out = await queueNominatim(() => fallbackProvider().forward(q, country));
    if (!out.length) return [];
    cacheSet(cacheKey, out);
    return out;
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
  const key = coordKey("nearby", lat, lng);
  const cached = cacheGet<GeoPlace[]>(key);
  if (cached) return cached;

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
  for (const p of points) {
    // This was the heaviest caller in the file: four reverseGeocode() calls,
    // each of which could itself fan out to seven Nominatim requests — ~28 for
    // one open of the location picker. With Mapbox first and everything cached,
    // the common case is now four cheap calls, and a repeat open is zero.
    const name = await reverseGeocode(p.lat, p.lng);
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      results.push({ area: name, full: name, lat: p.lat, lng: p.lng });
    }
  }
  cacheSet(key, results);
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
