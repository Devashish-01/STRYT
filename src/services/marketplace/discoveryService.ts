import { type Page } from "@/lib/apiClient";
import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import { cursorToRange, toPage, throwIfError } from "@/lib/supabasePage";
import { toCamel } from "@/lib/caseMap";
import type { Business, Provider } from "@/types";
import { haversineKm } from "@/lib/geocode";
import { clampRadiusForViewer } from "@/lib/guestMode";
import { config } from "@/config";

export interface SavedSearch {
  id: string;
  query: string;
  radiusKm: number;
  createdAt: string;
}

interface FeedParams {
  lat?: number;
  lng?: number;
  radius?: number;
  category?: string;
  /** Match any of these category ids (e.g. a parent category + all its leaf
   *  subcategories) — independent of `category`, use whichever fits the caller. */
  categoryIds?: string[];
  cursor?: string | null;
  sort?: "nearby" | "rating" | "new";
}

const DEFAULT_LAT = config.defaultLocation.lat;
const DEFAULT_LNG = config.defaultLocation.lng;

// Fetch a wide candidate set, then intersect the viewer's radius with the
// listing's own service/broadcast radius. The matching DB migration applies
// the same rule in the nearby RPCs; this client guard keeps older databases
// from leaking irrelevant far-away listings.
const GLOBAL_RADIUS_KM = 20000;
const DEFAULT_LISTING_RADIUS_KM = 5;

function savedViewerRadius(): number | undefined {
  const saved = localStorage.getItem("settings_radius");
  if (!saved) return undefined;
  const parsed = Number(saved);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * The radius this feed should actually use. Clamped LAST, after the explicit
 * param and the saved preference have been resolved, so neither an explicit
 * `p.radius` from a caller nor a `settings_radius` left in localStorage by a
 * previous signed-in session on this device can widen a guest past 1 km.
 */
function resolveViewerRadius(explicit: number | undefined): number | undefined {
  return clampRadiusForViewer(explicit ?? savedViewerRadius());
}

function withDistance<T extends { lat?: number; lng?: number; distanceKm?: number }>(row: T, userLat: number, userLng: number): T {
  return {
    ...row,
    distanceKm: (row.lat && row.lng) ? haversineKm(userLat, userLng, row.lat, row.lng) : 0,
  };
}

function withinListingRadius<T extends { distanceKm?: number }>(
  row: T,
  listingRadius: number | undefined,
  explicitRadius: number | undefined,
): boolean {
  if (row.distanceKm === undefined) return true;
  const ownRadius = Math.max(0, Number(listingRadius ?? DEFAULT_LISTING_RADIUS_KM));
  const radiusCap = explicitRadius === undefined ? ownRadius : Math.min(explicitRadius, ownRadius);
  return row.distanceKm <= radiusCap;
}

export const discoveryService = {
  async businesses(p: FeedParams = {}): Promise<Page<Business>> {
    const sb = getSupabase();
    const { from, to, limit } = cursorToRange(p.cursor);
    const userLat = p.lat ?? DEFAULT_LAT;
    const userLng = p.lng ?? DEFAULT_LNG;
    const viewerRadius = resolveViewerRadius(p.radius);

    // Nearby sort uses the PostGIS RPC; rating/new use a plain ordered select.
    if (!p.sort || p.sort === "nearby") {
      const { data, error } = await sb.rpc("businesses_nearby", {
        in_lng: userLng,
        in_lat: userLat,
        in_radius_km: viewerRadius ?? GLOBAL_RADIUS_KM,
        in_category: p.category ?? undefined,
        in_limit: limit,
        in_offset: from,
        in_category_ids: p.categoryIds ?? undefined,
      });
      throwIfError(error);
      const page = toPage<Business>(data as unknown[], null, from, limit);
      page.data = page.data
        .map((b) => withDistance(b, userLat, userLng))
        .filter((b) => withinListingRadius(b, b.broadcastRadius, viewerRadius));
      return page;
    }
    let q = sb.from("businesses").select("*", { count: "exact" }).eq("status", "ACTIVE").eq("owner_enabled", true).is("deleted_at", null);
    if (p.category) q = q.eq("category_id", p.category);
    if (p.categoryIds) q = q.in("category_id", p.categoryIds);
    q = p.sort === "new" ? q.order("is_new", { ascending: false }).order("opening_date", { ascending: false })
                         : q.order("rating_avg", { ascending: false });
    const { data, error, count } = await q.range(from, to);
    throwIfError(error);
    const page = toPage<Business>(data, count, from, limit);
    page.data = page.data
      .map((b) => withDistance(b, userLat, userLng))
      .filter((b) => withinListingRadius(b, b.broadcastRadius, viewerRadius));
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
    const viewerRadius = resolveViewerRadius(p.radius);

    if (!p.sort || p.sort === "nearby") {
      const { data, error } = await sb.rpc("providers_nearby", {
        in_lng: userLng,
        in_lat: userLat,
        in_radius_km: viewerRadius ?? GLOBAL_RADIUS_KM,
        in_category: p.category ?? undefined,
        in_limit: limit,
        in_offset: from,
        in_category_ids: p.categoryIds ?? undefined,
      });
      throwIfError(error);
      const page = toPage<Provider>(data as unknown[], null, from, limit);
      page.data = page.data
        .map((prov) => withDistance(prov, userLat, userLng))
        .filter((prov) => withinListingRadius(prov, prov.serviceRadiusKm, viewerRadius));
      return page;
    }
    let q = sb.from("providers").select("*", { count: "exact" }).eq("status", "ACTIVE").eq("owner_enabled", true).is("deleted_at", null);
    if (p.category) q = q.eq("category_id", p.category);
    if (p.categoryIds) q = q.in("category_id", p.categoryIds);
    q = p.sort === "new" ? q.order("is_new", { ascending: false })
                         : q.order("rating_avg", { ascending: false });
    const { data, error, count } = await q.range(from, to);
    throwIfError(error);
    const page = toPage<Provider>(data, count, from, limit);
    page.data = page.data
      .map((prov) => withDistance(prov, userLat, userLng))
      .filter((prov) => withinListingRadius(prov, prov.serviceRadiusKm, viewerRadius));
    return page;
  },

  async getBusiness(id: string, lat?: number, lng?: number): Promise<Business | undefined> {
    const sb = getSupabase();
    // Pull the business plus its child catalog + offers in one round-trip,
    // then reshape to the nested Business type the screens expect.
    const { data, error } = await sb
      .from("businesses")
      .select("*, catalog:catalog_items(*), portfolio:business_portfolio_items(*)")
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

  async search(
    q: string,
    opts: { lat?: number; lng?: number; radius?: number; bizCursor?: string | null; provCursor?: string | null } = {}
  ): Promise<{ businesses: Page<Business>; providers: Page<Provider> }> {
    const sb = getSupabase();
    // PostgREST .or() takes a `,`-delimited list of `column.op.value`
    // conditions — a raw `,` `(` or `)` in user input could inject an extra
    // condition (e.g. break the status=ACTIVE/deleted_at-is-null intent) or
    // surface suspended/deleted listings (Security Audit M-2). Strip the
    // filter metacharacters before building the %term% pattern.
    const safeQ = q.replace(/[,()]/g, "").trim();
    const term = `%${safeQ}%`;
    const { from: bizFrom, to: bizTo, limit: bizLimit } = cursorToRange(opts.bizCursor);
    const { from: provFrom, to: provTo, limit: provLimit } = cursorToRange(opts.provCursor);
    const [bizRes, provRes] = await Promise.all([
      sb.from("businesses").select("*", { count: "exact" }).eq("status", "ACTIVE").eq("owner_enabled", true).is("deleted_at", null).or(`name.ilike.${term},category_name.ilike.${term}`).range(bizFrom, bizTo),
      sb.from("providers").select("*", { count: "exact" }).eq("status", "ACTIVE").eq("owner_enabled", true).is("deleted_at", null).or(`display_name.ilike.${term},category_name.ilike.${term}`).range(provFrom, provTo),
    ]);
    throwIfError(bizRes.error);
    throwIfError(provRes.error);

    const userLat = opts.lat ?? DEFAULT_LAT;
    const userLng = opts.lng ?? DEFAULT_LNG;
    const viewerRadius = resolveViewerRadius(opts.radius);

    const bizPage = toPage<Business>(bizRes.data, bizRes.count, bizFrom, bizLimit);
    bizPage.data = bizPage.data
      .map((b) => withDistance(b, userLat, userLng))
      .filter((b) => withinListingRadius(b, b.broadcastRadius, viewerRadius));

    const provPage = toPage<Provider>(provRes.data, provRes.count, provFrom, provLimit);
    provPage.data = provPage.data
      .map((prov) => withDistance(prov, userLat, userLng))
      .filter((prov) => withinListingRadius(prov, prov.serviceRadiusKm, viewerRadius));

    return { businesses: bizPage, providers: provPage };
  },

  /** Save a search term so the user is notified when a new nearby listing matches it. */
  async saveSearch(query: string, lat?: number, lng?: number, radiusKm = 5): Promise<void> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return;
    const { error } = await sb.from("saved_searches").upsert(
      { user_id: uid, query: query.trim(), lat: lat ?? null, lng: lng ?? null, radius_km: radiusKm },
      { onConflict: "user_id,query" }
    );
    throwIfError(error);
  },

  async savedSearches(): Promise<SavedSearch[]> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return [];
    const { data, error } = await sb
      .from("saved_searches")
      .select("id, query, radius_km, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    if (error) return [];
    return (data ?? []).map((r: any) => ({ id: r.id, query: r.query, radiusKm: r.radius_km, createdAt: r.created_at }));
  },

  async removeSavedSearch(id: string): Promise<void> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return;
    await sb.from("saved_searches").delete().eq("id", id).eq("user_id", uid);
  },
};
