import { type Page } from "@/lib/apiClient";
import { getSupabase } from "@/lib/supabaseClient";
import { cursorToRange, toPage, throwIfError } from "@/lib/supabasePage";
import { toCamel } from "@/lib/caseMap";
import type { Business, Provider } from "@/types";
import { haversineKm } from "@/lib/geocode";
import { config } from "@/config";

interface FeedParams {
  lat?: number;
  lng?: number;
  radius?: number;
  category?: string;
  cursor?: string | null;
  sort?: "nearby" | "rating" | "new";
}

const DEFAULT_LAT = config.defaultLocation.lat;
const DEFAULT_LNG = config.defaultLocation.lng;

export const discoveryService = {
  async businesses(p: FeedParams = {}): Promise<Page<Business>> {
    const sb = getSupabase();
    const { from, to, limit } = cursorToRange(p.cursor);
    const userLat = p.lat ?? DEFAULT_LAT;
    const userLng = p.lng ?? DEFAULT_LNG;

    const saved = localStorage.getItem("settings_radius");
    const radiusLimit = p.radius ?? (saved ? parseFloat(saved) : 5);

    // Nearby sort uses the PostGIS RPC; rating/new use a plain ordered select.
    if (!p.sort || p.sort === "nearby") {
      const { data, error } = await sb.rpc("businesses_nearby", {
        in_lng: userLng,
        in_lat: userLat,
        in_radius_km: radiusLimit,
        in_category: p.category ?? null,
        in_limit: limit,
        in_offset: from,
      });
      throwIfError(error);
      const page = toPage<Business>(data as unknown[], null, from, limit);
      page.data = page.data.map((b) => ({
        ...b,
        distanceKm: (b.lat && b.lng) ? haversineKm(userLat, userLng, b.lat, b.lng) : 0,
      })).filter((b) => b.distanceKm <= radiusLimit);
      return page;
    }
    let q = sb.from("businesses").select("*", { count: "exact" }).eq("status", "ACTIVE").eq("owner_enabled", true).is("deleted_at", null);
    if (p.category) q = q.eq("category_id", p.category);
    q = p.sort === "new" ? q.order("is_new", { ascending: false }).order("opening_date", { ascending: false })
                         : q.order("rating_avg", { ascending: false });
    const { data, error, count } = await q.range(from, to);
    throwIfError(error);
    const page = toPage<Business>(data, count, from, limit);
    page.data = page.data.map((b) => ({
      ...b,
      distanceKm: (b.lat && b.lng) ? haversineKm(userLat, userLng, b.lat, b.lng) : 0,
    })).filter((b) => b.distanceKm <= radiusLimit);
    return page;
  },

  async providers(p: FeedParams = {}): Promise<Page<Provider>> {
    if (localStorage.getItem("settings_new_prov") === "false") {
      return toPage<Provider>([], 0, 0, 10);
    }
    const sb = getSupabase();
    const { from, to, limit } = cursorToRange(p.cursor);
    const userLat = p.lat ?? DEFAULT_LAT;
    const userLng = p.lng ?? DEFAULT_LNG;

    const saved = localStorage.getItem("settings_radius");
    const radiusLimit = p.radius ?? (saved ? parseFloat(saved) : 5);

    if (!p.sort || p.sort === "nearby") {
      const { data, error } = await sb.rpc("providers_nearby", {
        in_lng: userLng,
        in_lat: userLat,
        in_radius_km: radiusLimit,
        in_category: p.category ?? null,
        in_limit: limit,
        in_offset: from,
      });
      throwIfError(error);
      const page = toPage<Provider>(data as unknown[], null, from, limit);
      page.data = page.data.map((prov) => ({
        ...prov,
        distanceKm: (prov.lat && prov.lng) ? haversineKm(userLat, userLng, prov.lat, prov.lng) : 0,
      })).filter((prov) => prov.distanceKm <= radiusLimit);
      return page;
    }
    let q = sb.from("providers").select("*", { count: "exact" }).eq("status", "ACTIVE").eq("owner_enabled", true).is("deleted_at", null);
    if (p.category) q = q.eq("category_id", p.category);
    q = p.sort === "new" ? q.order("is_new", { ascending: false })
                         : q.order("rating_avg", { ascending: false });
    const { data, error, count } = await q.range(from, to);
    throwIfError(error);
    const page = toPage<Provider>(data, count, from, limit);
    page.data = page.data.map((prov) => ({
      ...prov,
      distanceKm: (prov.lat && prov.lng) ? haversineKm(userLat, userLng, prov.lat, prov.lng) : 0,
    })).filter((prov) => prov.distanceKm <= radiusLimit);
    return page;
  },

  async getBusiness(id: string, lat?: number, lng?: number): Promise<Business | undefined> {
    const sb = getSupabase();
    // Pull the business plus its child catalog + offers in one round-trip,
    // then reshape to the nested Business type the screens expect.
    const { data, error } = await sb
      .from("businesses")
      .select("*, catalog:catalog_items(*), offers:offers(*)")
      .eq("id", id)
      .maybeSingle();
    throwIfError(error);
    if (!data) return undefined;
    const b = toCamel<Business>(data);
    b.distanceKm = (lat && lng && b.lat && b.lng) ? haversineKm(lat, lng, b.lat, b.lng) : 0;
    return b;
  },

  async getProvider(id: string, lat?: number, lng?: number): Promise<Provider | undefined> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("providers")
      .select("*, portfolio:portfolio_items(*)")
      .eq("id", id)
      .maybeSingle();
    throwIfError(error);
    if (!data) return undefined;
    const prov = toCamel<Provider>(data);
    prov.distanceKm = (lat && lng && prov.lat && prov.lng) ? haversineKm(lat, lng, prov.lat, prov.lng) : 0;
    return prov;
  },

  async search(q: string, lat?: number, lng?: number): Promise<{ businesses: Business[]; providers: Provider[] }> {
    const sb = getSupabase();
    const term = `%${q}%`;
    const [bizRes, provRes] = await Promise.all([
      sb.from("businesses").select("*").eq("status", "ACTIVE").eq("owner_enabled", true).is("deleted_at", null).or(`name.ilike.${term},category_name.ilike.${term}`).limit(20),
      sb.from("providers").select("*").eq("status", "ACTIVE").eq("owner_enabled", true).is("deleted_at", null).or(`display_name.ilike.${term},category_name.ilike.${term}`).limit(20),
    ]);
    throwIfError(bizRes.error);
    throwIfError(provRes.error);
    
    const userLat = lat ?? DEFAULT_LAT;
    const userLng = lng ?? DEFAULT_LNG;

    return {
      businesses: toCamel<Business[]>(bizRes.data ?? []).map((b) => ({
        ...b,
        distanceKm: (b.lat && b.lng) ? haversineKm(userLat, userLng, b.lat, b.lng) : 0,
      })),
      providers: toCamel<Provider[]>(provRes.data ?? []).map((prov) => ({
        ...prov,
        distanceKm: (prov.lat && prov.lng) ? haversineKm(userLat, userLng, prov.lat, prov.lng) : 0,
      })),
    };
  },
};
