import { type Page } from "@/lib/apiClient";
import { getSupabase } from "@/lib/supabaseClient";
import { cursorToRange, toPage, throwIfError } from "@/lib/supabasePage";
import { toCamel } from "@/lib/caseMap";
import type { Business, Provider } from "@/types";

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
    // Nearby sort uses the PostGIS RPC; rating/new use a plain ordered select.
    if (!p.sort || p.sort === "nearby") {
      const { data, error } = await sb.rpc("businesses_nearby", {
        in_lng: p.lng ?? DEFAULT_LNG,
        in_lat: p.lat ?? DEFAULT_LAT,
        in_radius_km: p.radius ?? 2,
        in_category: p.category ?? null,
        in_limit: limit,
        in_offset: from,
      });
      throwIfError(error);
      return toPage<Business>(data as unknown[], null, from, limit);
    }
    let q = sb.from("businesses").select("*", { count: "exact" }).eq("status", "ACTIVE");
    if (p.category) q = q.eq("category_id", p.category);
    q = p.sort === "new" ? q.order("is_new", { ascending: false }).order("opening_date", { ascending: false })
                         : q.order("rating_avg", { ascending: false });
    const { data, error, count } = await q.range(from, to);
    throwIfError(error);
    return toPage<Business>(data, count, from, limit);
  },

  async providers(p: FeedParams = {}): Promise<Page<Provider>> {
    const sb = getSupabase();
    const { from, to, limit } = cursorToRange(p.cursor);
    if (!p.sort || p.sort === "nearby") {
      const { data, error } = await sb.rpc("providers_nearby", {
        in_lng: p.lng ?? DEFAULT_LNG,
        in_lat: p.lat ?? DEFAULT_LAT,
        in_radius_km: p.radius ?? 2,
        in_category: p.category ?? null,
        in_limit: limit,
        in_offset: from,
      });
      throwIfError(error);
      return toPage<Provider>(data as unknown[], null, from, limit);
    }
    let q = sb.from("providers").select("*", { count: "exact" }).eq("status", "ACTIVE");
    if (p.category) q = q.eq("category_id", p.category);
    q = p.sort === "new" ? q.order("is_new", { ascending: false })
                         : q.order("rating_avg", { ascending: false });
    const { data, error, count } = await q.range(from, to);
    throwIfError(error);
    return toPage<Provider>(data, count, from, limit);
  },

  async getBusiness(id: string): Promise<Business | undefined> {
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
    return toCamel<Business>(data);
  },

  async getProvider(id: string): Promise<Provider | undefined> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("providers")
      .select("*, portfolio:portfolio_items(*)")
      .eq("id", id)
      .maybeSingle();
    throwIfError(error);
    if (!data) return undefined;
    return toCamel<Provider>(data);
  },

  async search(q: string): Promise<{ businesses: Business[]; providers: Provider[] }> {
    const sb = getSupabase();
    const term = `%${q}%`;
    const [bizRes, provRes] = await Promise.all([
      sb.from("businesses").select("*").or(`name.ilike.${term},category_name.ilike.${term}`).limit(20),
      sb.from("providers").select("*").or(`display_name.ilike.${term},category_name.ilike.${term}`).limit(20),
    ]);
    throwIfError(bizRes.error);
    throwIfError(provRes.error);
    return {
      businesses: toCamel<Business[]>(bizRes.data ?? []),
      providers: toCamel<Provider[]>(provRes.data ?? []),
    };
  },
};
