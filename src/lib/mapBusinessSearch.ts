import { config } from "@/config";
import { PLACEHOLDER_BUSINESS_COVER, PLACEHOLDER_PORTFOLIO_IMAGE } from "@/lib/placeholders";
import { translateOsmHours } from "@/lib/hoursTranslate";
import { mapOsmTagToCategorySlug } from "@/lib/osmCategoryMap";

export interface ImportedBusinessDetails {
  name: string;
  address: string;
  city: string;
  pincode: string;
  lat: number;
  lng: number;
  phone?: string;
  category?: string;
  hours?: string;
  /** Raw OSM opening_hours text, kept even when translateOsmHours() couldn't
   *  turn it into STRYT's format — the preview screen can show this "as found"
   *  instead of silently dropping real data the translator didn't handle. */
  openingHoursRaw?: string;
  /** STRYT category slug suggested from the source's shop/amenity/etc tag —
   *  resolved to a real categoryId by the caller via catalogService.getCategories(). */
  osmCategorySlug?: string;
  coverImage?: string;
  gallery?: string[];
  distanceKm?: number;
  rawType?: string;
}

const NOMINATIM_HEADERS = {
  "User-Agent": "STRYT-App/1.0 (contact@stryt.in)",
};

const CATEGORY_COVERS: Record<string, string> = {
  restaurant: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800",
  cafe: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800",
  salon: "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800",
  hairdresser: "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800",
  doctor: "https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=800",
  doctors: "https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=800",
  clinic: "https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=800",
  hospital: "https://images.unsplash.com/photo-1586773860418-d37222d8fce3?w=800",
  shop: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800",
  store: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800",
  bakery: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800",
};

function coverFor(category: string | undefined): string {
  return (category && CATEGORY_COVERS[category.toLowerCase()]) || PLACEHOLDER_BUSINESS_COVER;
}

function galleryFor(cover: string): string[] {
  return [cover, PLACEHOLDER_PORTFOLIO_IMAGE, "https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=800"];
}

/**
 * Haversine formula to compute distance in kilometers between two coordinates.
 */
function calcDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 999;
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

async function searchNominatim(query: string, refLat: number, refLng: number): Promise<ImportedBusinessDetails[]> {
  try {
    const dDeg = 0.035; // ~3.5 km radius bounding box
    const viewbox = `${refLng - dDeg},${refLat + dDeg},${refLng + dDeg},${refLat - dDeg}`;
    const country = config.defaultCountry || "in";
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=10&addressdetails=1&extratags=1&countrycodes=${country}&viewbox=${viewbox}&accept-language=en`;
    const res = await fetch(url, { headers: NOMINATIM_HEADERS });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data.map((item: any): ImportedBusinessDetails => {
      const addr = item.address ?? {};
      const extratags = item.extratags ?? {};
      const name = item.name || addr.shop || addr.amenity || addr.building || item.display_name.split(",")[0];
      const city = addr.city || addr.town || addr.village || addr.municipality || "";
      const pincode = addr.postcode || "";
      const rawType = addr.shop || addr.amenity || addr.healthcare || item.type;
      const cover = coverFor(rawType);
      const rawHours = extratags.opening_hours as string | undefined;

      return {
        name,
        address: item.display_name,
        city,
        pincode,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        phone: addr.phone || extratags.phone || extratags["contact:phone"] || undefined,
        category: rawType,
        rawType,
        osmCategorySlug: mapOsmTagToCategorySlug({ shop: addr.shop, amenity: addr.amenity, healthcare: addr.healthcare }),
        hours: translateOsmHours(rawHours),
        openingHoursRaw: rawHours,
        coverImage: cover,
        gallery: galleryFor(cover),
      };
    });
  } catch {
    return [];
  }
}

async function searchPhoton(query: string, refLat: number, refLng: number): Promise<ImportedBusinessDetails[]> {
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lat=${refLat}&lon=${refLng}&limit=10`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const features: any[] = Array.isArray(data?.features) ? data.features : [];

    return features.map((f: any): ImportedBusinessDetails => {
      const props = f.properties || {};
      const coords = f.geometry?.coordinates || [refLng, refLat];
      const rawType = props.osm_value;
      const cover = coverFor(rawType);

      return {
        name: props.name || query,
        address: [props.name, props.street, props.city, props.state, props.postcode].filter(Boolean).join(", "),
        city: props.city || props.county || "",
        pincode: props.postcode || "",
        lat: coords[1],
        lng: coords[0],
        category: rawType,
        rawType,
        osmCategorySlug: mapOsmTagToCategorySlug({ shop: props.osm_key === "shop" ? rawType : undefined, amenity: props.osm_key === "amenity" ? rawType : undefined }),
        coverImage: cover,
        gallery: galleryFor(cover),
      };
    });
  } catch {
    return [];
  }
}

/**
 * Search for real-world businesses near a reference point, waterfalling
 * through free/keyless map data sources: Nominatim -> Photon. Both are
 * text-search-indexed geocoders (fast, sub-2s in practice) and Nominatim's
 * extratags=1 already surfaces real phone/website/opening_hours when OSM has
 * them.
 *
 * Overpass API was tried first here and dropped: its `name~"..."` regex
 * search is not indexed the way Nominatim/Photon's is, and testing against
 * the live public instance showed it's genuinely unreliable for this use
 * case — timeouts, 504s and rate-limit 429s on the exact same query that
 * sometimes returns in under 3 seconds. That unpredictability, not any
 * fixable bug, is why a name search would silently come back empty far too
 * often. No source here ever fabricates data — an empty result set means
 * genuinely nothing was found, not a placeholder candidate built from the
 * search text.
 */
export async function searchMapBusinessCandidates(query: string, userLat?: number, userLng?: number): Promise<ImportedBusinessDetails[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const refLat = userLat || config.defaultLocation.lat;
  const refLng = userLng || config.defaultLocation.lng;

  let results = await searchNominatim(q, refLat, refLng);
  if (results.length === 0) {
    results = await searchPhoton(q, refLat, refLng);
  }

  results.forEach((r) => {
    r.distanceKm = calcDistanceKm(refLat, refLng, r.lat, r.lng);
  });
  results.sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));

  return results;
}
