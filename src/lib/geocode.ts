// Mapbox geocoding helpers. Reverse = coords → area name (e.g. "Marathahalli").
// Forward = typed query → candidate places with coords (used to set a remote /
// custom location). Both fail soft (return null/[]) so callers can fall back to
// manual entry when offline or the token is missing.
import { config } from "@/config";

const BASE = "https://api.mapbox.com/geocoding/v5/mapbox.places";

export interface GeoPlace {
  area: string;   // short name — neighbourhood/locality (e.g. "Marathahalli")
  full: string;   // full label (e.g. "Marathahalli, Bengaluru, Karnataka")
  lat: number;
  lng: number;
}

// coords → best area name. Prefers neighbourhood, then locality, then place,
// so a GPS fix in Marathahalli resolves to "Marathahalli", not "Bengaluru".
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const token = config.mapboxToken;
  if (!token) return null;
  try {
    const url = `${BASE}/${lng},${lat}.json?access_token=${token}&types=neighborhood,locality,place&language=en`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const features: any[] = data?.features ?? [];
    const byType = (t: string) => features.find((f) => (f.place_type ?? []).includes(t))?.text;
    return byType("neighborhood") || byType("locality") || byType("place") || features[0]?.text || null;
  } catch {
    return null;
  }
}

export interface GeocodeResult {
  city: string | null;
  pincode: string | null;
}

export async function reverseGeocodeFull(lat: number, lng: number): Promise<GeocodeResult | null> {
  const token = config.mapboxToken;
  if (!token) return null;
  try {
    const url = `${BASE}/${lng},${lat}.json?access_token=${token}&types=neighborhood,locality,place,postcode,address&language=en`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const features: any[] = data?.features ?? [];
    
    let city: string | null = null;
    let pincode: string | null = null;
    
    const byType = (t: string) => features.find((f) => (f.place_type ?? []).includes(t));
    city = byType("place")?.text || null;
    pincode = byType("postcode")?.text || null;
    
    if (features[0] && (!city || !pincode)) {
      const context = features[0].context ?? [];
      for (const item of context) {
        if (item.id.startsWith("place.") && !city) city = item.text;
        if (item.id.startsWith("postcode.") && !pincode) pincode = item.text;
      }
    }
    return { city, pincode };
  } catch {
    return null;
  }
}

// typed query → up to 5 candidate places (India-biased). Used by the "set a
// different location" search so a user can browse a remote area.
export async function forwardGeocode(query: string): Promise<GeoPlace[]> {
  const token = config.mapboxToken;
  const q = query.trim();
  if (!token || q.length < 2) return [];
  try {
    const url = `${BASE}/${encodeURIComponent(q)}.json?access_token=${token}&types=neighborhood,locality,place,address&limit=5&language=en&country=${config.defaultCountry}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.features ?? [])
      .filter((f: any) => Array.isArray(f.center) && f.center.length === 2)
      .map((f: any): GeoPlace => ({
        area: f.text,
        full: f.place_name,
        lng: f.center[0],
        lat: f.center[1],
      }));
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
  return Math.round(R * c * 10) / 10; // 1 decimal place
}
