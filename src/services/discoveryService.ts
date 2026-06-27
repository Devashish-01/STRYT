import { type Page } from "@/lib/apiClient";
import { getSupabase } from "@/lib/supabaseClient";
import { cursorToRange, toPage, throwIfError } from "@/lib/supabasePage";
import { toCamel } from "@/lib/caseMap";
import type { Business, Provider } from "@/types";
import { haversineKm } from "@/lib/geocode";

interface FeedParams {
  lat?: number;
  lng?: number;
  radius?: number;
  category?: string;
  cursor?: string | null;
  sort?: "nearby" | "rating" | "new";
}

// Default map center (Koregaon Park, Pune) used when the device location
// isn't available yet, so the nearby sort still has a reference point.
const DEFAULT_LAT = 18.536;
const DEFAULT_LNG = 73.893;

export const discoveryService = {
  async businesses(p: FeedParams = {}): Promise<Page<Business>> {
    const sb = getSupabase();
    const { from, to, limit } = cursorToRange(p.cursor);
    const userLat = p.lat ?? DEFAULT_LAT;
    const userLng = p.lng ?? DEFAULT_LNG;

    // Nearby sort uses the PostGIS RPC; rating/new use a plain ordered select.
    if (!p.sort || p.sort === "nearby") {
      const { data, error } = await sb.rpc("businesses_nearby", {
        in_lng: userLng,
        in_lat: userLat,
        in_radius_km: p.radius ?? 2,
        in_category: p.category ?? null,
        in_limit: limit,
        in_offset: from,
      });
      throwIfError(error);
      const page = toPage<Business>(data as unknown[], null, from, limit);
      page.data = page.data.map((b) => ({
        ...b,
        distanceKm: (b.lat && b.lng) ? haversineKm(userLat, userLng, b.lat, b.lng) : 0,
      }));
      return page;
    }
    let q = sb.from("businesses").select("*", { count: "exact" }).eq("status", "ACTIVE");
    if (p.category) q = q.eq("category_id", p.category);
    q = p.sort === "new" ? q.order("is_new", { ascending: false }).order("opening_date", { ascending: false })
                         : q.order("rating_avg", { ascending: false });
    const { data, error, count } = await q.range(from, to);
    throwIfError(error);
    const page = toPage<Business>(data, count, from, limit);
    page.data = page.data.map((b) => ({
      ...b,
      distanceKm: (b.lat && b.lng) ? haversineKm(userLat, userLng, b.lat, b.lng) : 0,
    }));
    return page;
  },

  async providers(p: FeedParams = {}): Promise<Page<Provider>> {
    const sb = getSupabase();
    const { from, to, limit } = cursorToRange(p.cursor);
    const userLat = p.lat ?? DEFAULT_LAT;
    const userLng = p.lng ?? DEFAULT_LNG;

    if (!p.sort || p.sort === "nearby") {
      const { data, error } = await sb.rpc("providers_nearby", {
        in_lng: userLng,
        in_lat: userLat,
        in_radius_km: p.radius ?? 2,
        in_category: p.category ?? null,
        in_limit: limit,
        in_offset: from,
      });
      throwIfError(error);
      const page = toPage<Provider>(data as unknown[], null, from, limit);
      page.data = page.data.map((prov) => ({
        ...prov,
        distanceKm: (prov.lat && prov.lng) ? haversineKm(userLat, userLng, prov.lat, prov.lng) : 0,
      }));
      return page;
    }
    let q = sb.from("providers").select("*", { count: "exact" }).eq("status", "ACTIVE");
    if (p.category) q = q.eq("category_id", p.category);
    q = p.sort === "new" ? q.order("is_new", { ascending: false })
                         : q.order("rating_avg", { ascending: false });
    const { data, error, count } = await q.range(from, to);
    throwIfError(error);
    const page = toPage<Provider>(data, count, from, limit);
    page.data = page.data.map((prov) => ({
      ...prov,
      distanceKm: (prov.lat && prov.lng) ? haversineKm(userLat, userLng, prov.lat, prov.lng) : 0,
    }));
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
      sb.from("businesses").select("*").or(`name.ilike.${term},category_name.ilike.${term}`).limit(20),
      sb.from("providers").select("*").or(`display_name.ilike.${term},category_name.ilike.${term}`).limit(20),
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
