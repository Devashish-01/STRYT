// Nominatim (OpenStreetMap) — STRYT's fallback geocoder, and a dependency to keep at arm's length.
//
// Its usage policy sets an absolute maximum of one request per second, requires the caller to identify
// itself, and tells regular or heavy users to run their own instance or buy a commercial service.
// A browser cannot set User-Agent — fetch() drops it as a forbidden header — so a web app cannot
// satisfy the identification requirement at all. STRYT has already been answered with HTTP 429 once,
// back when a single reverseGeocode() could fire seven requests.
//
// It is kept, rather than dropped, for one thing Mapbox does not do: it returns the road name. STRYT
// reads a neighbourhood out of names like "Amanora Park Town Main Road", which is how a lot of Indian
// townships are actually identified, and that only works with a street in hand.
//
// The one-request-per-second queue and the 30-day cache are NOT here. They live in ../geocode.ts, above
// every provider, so they apply no matter which one answers — and so a future replacement inherits them
// instead of reimplementing them slightly wrong.

import type { GeocodingProvider, GeoPlace, ReverseHit } from "./types";

const BASE = "https://nominatim.openstreetmap.org";

/** Nominatim's address object, narrowed to the keys STRYT reads. */
type NominatimAddress = Record<string, string | undefined>;

/** Most specific usable locality name, in the order a person would recognise it. */
function pickAreaName(addr: NominatimAddress): string | null {
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

export const nominatimProvider: GeocodingProvider = {
  id: "nominatim",

  // Throws on a bad response rather than returning empty: ../geocode.ts's cascade distinguishes
  // "this zoom level had nothing" from "the request failed", and retries at a different zoom.
  async reverse(lat, lng, zoom): Promise<ReverseHit> {
    const url =
      `${BASE}/reverse?format=json&lat=${lat}&lon=${lng}` +
      `&zoom=${zoom}&addressdetails=1&accept-language=en`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`reverse geocode ${res.status}`);
    const data = await res.json();
    const addr: NominatimAddress = data?.address ?? {};
    const featureName =
      typeof data?.name === "string" && data.name.trim() ? data.name.trim() : null;
    return {
      area: pickAreaName(addr),
      city: addr.city || addr.town || addr.municipality || null,
      road: addr.road || null,
      featureName,
      postcode: addr.postcode || null,
    };
  },

  async forward(query, country): Promise<GeoPlace[]> {
    const url =
      `${BASE}/search?format=json&q=${encodeURIComponent(query)}` +
      `&limit=5&addressdetails=1&countrycodes=${country}&accept-language=en`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data.map((item: any): GeoPlace => {
      const addr: NominatimAddress = item.address ?? {};
      const area =
        item.name ||
        addr.neighbourhood ||
        addr.suburb ||
        addr.village ||
        addr.locality ||
        addr.city_district ||
        String(item.display_name ?? "").split(",")[0];
      return {
        area,
        full: item.display_name ?? area,
        lat: Number(item.lat),
        lng: Number(item.lon),
      };
    });
  },
};
