// The seam between STRYT and whoever answers "what is at these coordinates".
//
// Today that is Nominatim, OpenStreetMap's public geocoder. Its usage policy allows an absolute maximum
// of one request per second, requires the caller to identify itself, and tells regular or heavy users to
// run their own instance or use a commercial provider. STRYT has already been rate-limited off it once
// (see the 429 history in ../geocode.ts). Browsers cannot set User-Agent, so a web app cannot even
// satisfy the identification part of that policy.
//
// That makes the geocoder a dependency STRYT will have to replace, not one it can settle on. This
// interface is the point where that swap becomes a config change instead of a refactor across the
// eighteen modules that import ../geocode.
//
// Deliberately NOT part of this interface:
//   * caching and rate limiting — they live in ../geocode.ts, above the provider, so a replacement
//     inherits both instead of having to reimplement them and getting it subtly wrong;
//   * tiles — those come from CARTO's basemaps, not from here, and are a separate concern;
//   * STRYT's own naming rules (extractAreaFromRoadName, pickAreaName). Those encode how Indian
//     addresses map onto a neighbourhood name and belong to the product, not the vendor.
//
// A provider's job is narrow: make the request, return normalised fields, throw on failure.

/** One place, as STRYT thinks about it. */
export interface GeoPlace {
  area: string;   // short name — neighbourhood/locality (e.g. "Marathahalli")
  full: string;   // full label (e.g. "Marathahalli, Bengaluru, Karnataka")
  lat: number;
  lng: number;
}

/** The address fields STRYT actually uses, normalised away from any provider's own JSON shape. */
export interface ReverseHit {
  /** Best locality/neighbourhood name the provider offered, if any. */
  area: string | null;
  city: string | null;
  road: string | null;
  /** A named feature at the point (a mall, a park, a township) when the provider returns one. */
  featureName: string | null;
  /** Postal code, when the provider returns one — used by reverseGeocodeFull. */
  postcode: string | null;
}

export interface GeocodingProvider {
  /** Name for logs and debugging. */
  readonly id: string;

  /**
   * Coordinates → address parts. `zoom` follows Nominatim's meaning (higher = finer); a provider
   * without that concept should map it onto its own nearest notion of detail.
   * Throws on a transport or HTTP failure — callers above decide whether to fall back.
   */
  reverse(lat: number, lng: number, zoom: number): Promise<ReverseHit>;

  /**
   * Free text → candidate places, best first. `country` is an ISO 3166-1 alpha-2 code used to bias
   * results (STRYT is India-first). Returns an empty array when there is simply no match.
   */
  forward(query: string, country: string): Promise<GeoPlace[]>;
}
