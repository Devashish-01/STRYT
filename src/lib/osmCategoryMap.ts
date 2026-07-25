/**
 * Maps a raw OpenStreetMap tag (shop=/amenity=/healthcare=/office=/craft=)
 * to a STRYT category *slug*. Callers resolve the slug against the live
 * `categories` table (catalogService.getCategories()) to get a real
 * categoryId — this file never hardcodes a database id, only the stable
 * slug string.
 */

const OSM_TO_SLUG: Record<string, string> = {
  // Food & drink
  restaurant: "restaurants", fast_food: "restaurants", food_court: "restaurants",
  cafe: "cafes", coffee_shop: "cafes",
  bakery: "bakery",
  bar: "restaurants", pub: "restaurants",

  // Health
  clinic: "clinics", doctors: "clinics", dentist: "clinics",
  hospital: "hospitals",
  pharmacy: "pharmacy",
  healthcare: "clinics",

  // Personal care
  hairdresser: "salon", beauty: "salon", spa: "salon",

  // Retail
  supermarket: "grocery", convenience: "grocery", grocery: "grocery",
  clothes: "fashion", boutique: "fashion", shoes: "fashion",
  electronics: "electronics", mobile_phone: "electronics",
  hardware: "hardware", doityourself: "hardware",
  florist: "gifts", gift: "gifts", books: "gifts", stationery: "gifts",
  jewelry: "jewellery",

  // Services
  laundry: "services", dry_cleaning: "services",
  car_repair: "services", tailor: "services",
  travel_agency: "services", real_estate_agent: "services",
};

export function mapOsmTagToCategorySlug(tags: {
  shop?: string;
  amenity?: string;
  healthcare?: string;
  office?: string;
  craft?: string;
}): string | undefined {
  const raw = tags.shop || tags.amenity || tags.healthcare || tags.office || tags.craft;
  if (!raw) return undefined;
  return OSM_TO_SLUG[raw.toLowerCase()];
}
