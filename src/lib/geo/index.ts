// Which geocoder answers, and in what order.
//
// This file is the whole point of the ./geo folder: swapping providers — or adding a self-hosted
// Nominatim, or dropping OSM entirely — should be an edit here, not a change across the eighteen
// modules that import ../geocode.
//
// The order is deliberate and is not "cheapest first":
//   1. Mapbox   — licensed for this, one request per lookup, fine for search-as-you-type.
//   2. Nominatim — free but rate-limited to 1 req/s and unidentifiable from a browser. It is kept
//                  because it returns the road name, which Mapbox's reverse types do not, and STRYT
//                  reads neighbourhood names out of roads ("Amanora Park Town Main Road").
//
// Caching and the one-request-per-second queue live in ../geocode.ts, above this list, so every
// provider inherits them.

import type { GeocodingProvider } from "./types";
import { mapboxProvider } from "./mapbox";
import { nominatimProvider } from "./nominatim";

export type { GeocodingProvider, GeoPlace, ReverseHit } from "./types";
export { mapboxProvider } from "./mapbox";
export { nominatimProvider } from "./nominatim";

/**
 * The primary geocoder. Falls back to Nominatim only when no Mapbox token is configured — a build
 * without a token still works, just slower and against a service that may rate-limit it.
 */
export function primaryProvider(): GeocodingProvider {
  return mapboxProvider;
}

/**
 * The provider used when the primary returns nothing usable. Kept separate from primaryProvider()
 * rather than expressed as an ordered array, because the two are not interchangeable here: the
 * fallback exists specifically for the road-name case, and ../geocode.ts's cascade drives it with
 * several zoom levels that only Nominatim understands.
 */
export function fallbackProvider(): GeocodingProvider {
  return nominatimProvider;
}
