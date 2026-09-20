// Mapbox Geocoding v5 — STRYT's primary geocoder.
//
// This is not aspirational: a token is configured and this path already serves both directions. It is
// what takes the common reverse-geocode from roughly seven Nominatim requests to zero, and it is the
// only one of the two that is licensed for search-as-you-type — Nominatim's usage policy calls
// autocomplete out explicitly as something not to point at it.
//
// Every failure returns empty rather than throwing, so the chain in ./index.ts can fall through to the
// next provider. A geocoder being down should degrade the area name, never break the screen.

import { config } from "@/config";
import type { GeocodingProvider, GeoPlace, ReverseHit } from "./types";

interface MapboxFeature {
  text: string;
  place_name: string;
  center: [number, number];
  place_type: string[];
}

function token(): string {
  return config.mapboxToken || "";
}

function featureOfType(features: MapboxFeature[], type: string): MapboxFeature | undefined {
  return features.find((f) => f.place_type?.includes(type));
}

export const mapboxProvider: GeocodingProvider = {
  id: "mapbox",

  async reverse(lat, lng): Promise<ReverseHit> {
    const t = token();
    if (!t) return empty();
    try {
      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json` +
        `?access_token=${t}&language=en&limit=5` +
        `&types=neighborhood,locality,place,district,postcode`;
      const res = await fetch(url);
      if (!res.ok) return empty();
      const data = await res.json();
      const features: MapboxFeature[] = Array.isArray(data?.features) ? data.features : [];
      if (!features.length) return empty();

      // Most specific first — a neighbourhood name is what a person would say out loud.
      let area: string | null = null;
      for (const want of ["neighborhood", "locality", "place", "district"]) {
        const hit = featureOfType(features, want);
        if (hit?.text) { area = hit.text; break; }
      }

      return {
        area,
        city: featureOfType(features, "place")?.text ?? null,
        // Mapbox's reverse types above do not include a street, so `road` is always null here. That is
        // exactly why the Nominatim fallback is kept: extractAreaFromRoadName() reads a neighbourhood
        // out of names like "Amanora Park Town Main Road", and needs the road to do it.
        road: null,
        featureName: null,
        postcode: featureOfType(features, "postcode")?.text ?? null,
      };
    } catch {
      return empty();
    }
  },

  async forward(query, country): Promise<GeoPlace[]> {
    const t = token();
    if (!t) return [];
    try {
      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
        `?access_token=${t}&country=${country}&language=en&limit=5&autocomplete=true`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      const features: MapboxFeature[] = Array.isArray(data?.features) ? data.features : [];
      return features.map((f): GeoPlace => ({
        area: f.text,
        full: f.place_name,
        lng: f.center[0],
        lat: f.center[1],
      }));
    } catch {
      return [];
    }
  },
};

function empty(): ReverseHit {
  return { area: null, city: null, road: null, featureName: null, postcode: null };
}
