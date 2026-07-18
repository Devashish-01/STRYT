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

// coords → best area name. Prefers neighbourhood, then suburb, then locality, then city.
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=en`;
    const res = await fetch(url, { headers: NOMINATIM_HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data?.address ?? {};
    
    // Select the best local identifier for area display
    return (
      addr.neighbourhood ||
      addr.suburb ||
      addr.village ||
      addr.quarter ||
      addr.locality ||
      addr.city_district ||
      addr.town ||
      addr.city ||
      null
    );
  } catch {
    return null;
  }
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
