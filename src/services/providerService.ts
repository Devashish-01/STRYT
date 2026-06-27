function relDate(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 30) return `${Math.floor(d / 7)} week${Math.floor(d / 7) > 1 ? "s" : ""} ago`;
  return `${Math.floor(d / 30)} month${Math.floor(d / 30) > 1 ? "s" : ""} ago`;
}

// Bucket ISO timestamps into a 7-element series (oldest → newest day).
function providerDailyBuckets(isoDates: string[]): number[] {
  const buckets = [0, 0, 0, 0, 0, 0, 0];
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  for (const iso of isoDates) {
    const dayIdx = 6 - Math.floor((startOfToday.getTime() - new Date(iso).getTime()) / 86400000);
    if (dayIdx >= 0 && dayIdx <= 6) buckets[dayIdx]++;
  }
  return buckets;
}

import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import { throwIfError, toApiError } from "@/lib/supabasePage";
import { toCamel, toSnake } from "@/lib/caseMap";
import type { Provider, PortfolioItem, Review, ProviderPackage } from "@/types";
import { haversineKm } from "@/lib/geocode";

// Columns on the providers table; everything else (portfolio, distanceKm…) stripped.
const PROVIDER_COLUMNS = new Set([
  "userId","displayName","categoryId","categoryName","subCategory","bio","avatar",
  "lat","lng","serviceRadiusKm","startingPrice","availabilityNote","status","isVerified",
  "ratingAvg","ratingCount","jobsDone","responseTime","isNew","skills","phone",
  "verificationStatus","verificationDocumentUrl",
]);

function pickColumns<T extends Record<string, unknown>>(obj: T, allowed: Set<string>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (allowed.has(k) && v !== undefined) out[k] = v;
  }
  return out;
}

export interface ProviderAnalytics {
  views: number;
  leads: number;
  proposalsSent: number;
  accepted: number;
  jobsDone: number;
  earnings: number;
  viewsSeries: number[];
  leadsSeries: number[];
}

export const providerService = {
  async mine(): Promise<Provider[]> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return [];
    const { data, error } = await sb.from("providers").select("*, portfolio:portfolio_items(*)").eq("user_id", uid);
    throwIfError(error);
    return toCamel<Provider[]>(data ?? []);
  },
  async get(id: string, lat?: number, lng?: number): Promise<Provider | undefined> {
    if (id === "p1" || id.startsWith("prov_mock_")) {
      return {
        id,
        userId: "mock_user_2",
        displayName: "Alex Sharma",
        categoryId: "2",
        categoryName: "AC Repair",
        bio: "Certified AC technician with 8+ years of experience. Quick troubleshooting and honest pricing.",
        avatar: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200",
        lat: 18.536,
        lng: 73.893,
        distanceKm: 0.8,
        serviceRadiusKm: 15,
        startingPrice: 350,
        availabilityNote: "Mon-Sat 9 AM - 7 PM",
        status: "ACTIVE",
        isVerified: true,
        ratingAvg: 4.8,
        ratingCount: 24,
        jobsDone: 142,
        responseTime: "Under 15 mins",
        isNew: false,
        skills: ["AC installation", "Gas refilling", "Compressor repair", "General servicing"],
        portfolio: [
          { id: "port_1", title: "AC installation at Koregaon Park office", description: "Dual-inverter split AC installation", imageUrl: "https://images.unsplash.com/photo-1585338107529-13afc5f02586?w=500" }
        ],
        phone: "9876543211"
      } as any;
    }
    const sb = getSupabase();
    const { data, error } = await sb.from("providers").select("*, portfolio:portfolio_items(*)").eq("id", id).maybeSingle();
    throwIfError(error);
    if (!data) return undefined;
    const prov = toCamel<Provider>(data);
    prov.distanceKm = (lat && lng && prov.lat && prov.lng) ? haversineKm(lat, lng, prov.lat, prov.lng) : 0;
    return prov;
  },
  async reviews(id: string): Promise<Review[]> {
    if (id === "p1" || id.startsWith("prov_mock_")) {
      return [
        { id: "rev_1", raterName: "Daniel Craig", raterAvatar: "", rating: 5, comment: "Super fast response and very neat work.", date: "3 days ago" },
        { id: "rev_2", raterName: "Pooja Hegde", raterAvatar: "", rating: 4, comment: "Fixed the leakage in 10 minutes. Good behavior.", date: "2 weeks ago" }
      ];
    }
    const sb = getSupabase();
    const { data, error } = await sb
      .from("ratings")
      .select("id, rating, comment, created_at, rater:users!rater_user_id(name, avatar)")
      .eq("ratee_type", "PROVIDER")
      .eq("ratee_id", id)
      .order("created_at", { ascending: false })
      .limit(30);
    throwIfError(error);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      raterName: r.rater?.name ?? "Anonymous",
      raterAvatar: r.rater?.avatar ?? "",
      rating: r.rating,
      comment: r.comment ?? "",
      date: relDate(r.created_at),
    }));
  },
  async update(id: string, patch: Partial<Provider>) {
    const sb = getSupabase();
    const cols = pickColumns(patch as Record<string, unknown>, PROVIDER_COLUMNS);
    const { data, error } = await sb.from("providers").update(toSnake(cols)).eq("id", id).select().maybeSingle();
    throwIfError(error);
    return toCamel<Provider>(data);
  },
  async submitVerification(id: string, docUrl: string) {
    const sb = getSupabase();
    const { error } = await sb
      .from("providers")
      .update({ verification_status: "UNDER_REVIEW", verification_document_url: docUrl })
      .eq("id", id);
    throwIfError(error);
    return { ok: true };
  },
  async create(data: Partial<Provider>) {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw toApiError({ code: "UNAUTHENTICATED", message: "Sign in to offer a service" }, 401);
    const cols = pickColumns(data as Record<string, unknown>, PROVIDER_COLUMNS);
    // displayName is required by the table; fall back to the user's name later if absent.
    // Go live immediately (ACTIVE) so the profile is visible to others — discovery
    // filters on status='ACTIVE'. The "verified" badge is granted separately after
    // the Aadhaar document is reviewed; being listed doesn't wait on that.
    const row = { ...toSnake(cols), user_id: uid, status: "ACTIVE" } as Record<string, unknown>;
    const { data: me } = await sb.from("users").select("name, lat, lng").eq("id", uid).maybeSingle();
    if (!row["display_name"]) {
      row["display_name"] = (me as any)?.name || "Provider";
    }
    if (row["lat"] === undefined || row["lat"] === null) {
      row["lat"] = (me as any)?.lat ?? null;
    }
    if (row["lng"] === undefined || row["lng"] === null) {
      row["lng"] = (me as any)?.lng ?? null;
    }
    const { data: created, error } = await sb.from("providers").insert(row).select().maybeSingle();
    throwIfError(error);
    return toCamel<Provider>(created);
  },
  async packages(id: string): Promise<ProviderPackage[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("provider_packages")
      .select("*")
      .eq("provider_id", id)
      .order("created_at", { ascending: true });
    throwIfError(error);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      providerId: r.provider_id,
      name: r.name,
      desc: r.description ?? "",
      price: r.price,
      duration: r.duration ?? "",
      instantBook: r.instant_book ?? false,
    }));
  },
  async addPackage(providerId: string, pkg: { name: string; desc: string; price: number; duration?: string; instantBook?: boolean }): Promise<ProviderPackage> {
    const sb = getSupabase();
    const { data, error } = await sb.from("provider_packages").insert({
      provider_id: providerId,
      name: pkg.name,
      description: pkg.desc,
      price: pkg.price,
      duration: pkg.duration ?? "",
      instant_book: pkg.instantBook ?? false,
    }).select().maybeSingle();
    throwIfError(error);
    const r = data as any;
    return { id: r.id, providerId: r.provider_id, name: r.name, desc: r.description ?? "", price: r.price, duration: r.duration ?? "", instantBook: r.instant_book ?? false };
  },
  async deletePackage(_providerId: string, pkgId: string) {
    const sb = getSupabase();
    const { error } = await sb.from("provider_packages").delete().eq("id", pkgId);
    throwIfError(error);
    return { ok: true };
  },
  /** Bump the provider profile view counter (fire-and-forget). */
  async recordView(id: string) {
    const sb = getSupabase();
    await sb.rpc("bump_provider_views", { p_provider_id: id });
    return { ok: true };
  },
  async addPortfolio(id: string, item: Partial<PortfolioItem>) {
    const sb = getSupabase();
    const row = { ...toSnake(item), provider_id: id };
    const { data, error } = await sb.from("portfolio_items").insert(row).select().maybeSingle();
    throwIfError(error);
    return toCamel<PortfolioItem>(data);
  },

  async deletePortfolio(providerId: string, itemId: string) {
    const sb = getSupabase();
    const { error } = await sb.from("portfolio_items").delete().eq("id", itemId);
    throwIfError(error);
    return { ok: true };
  },

  async updatePortfolio(providerId: string, itemId: string, patch: Partial<PortfolioItem>) {
    const sb = getSupabase();
    const { data, error } = await sb.from("portfolio_items").update(toSnake(patch)).eq("id", itemId).select().maybeSingle();
    throwIfError(error);
    return toCamel<PortfolioItem>(data);
  },
  async setAvailability(id: string, availableNow: boolean, hours?: number) {
    const sb = getSupabase();
    const availableUntil = availableNow && hours
      ? new Date(Date.now() + hours * 3600 * 1000).toISOString()
      : null;
    const { error } = await sb
      .from("providers")
      .update({ is_available_now: availableNow, available_until: availableUntil })
      .eq("id", id);
    throwIfError(error);
    return { ok: true, availableNow, hours };
  },
  async leads(id: string) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("leads")
      .select("id, provider_id, kind, note, handled, created_at, from:users!from_user_id(name, avatar)")
      .eq("provider_id", id)
      .order("created_at", { ascending: false })
      .limit(100);
    throwIfError(error);
    return (data ?? []).map((l: any) => ({
      id: l.id,
      providerId: l.provider_id,
      kind: l.kind,
      name: l.from?.name ?? "Someone",
      avatar: l.from?.avatar ?? "",
      text: l.note || "Reached out via STRYT",
      time: relDate(l.created_at),
      handled: l.handled,
    }));
  },
  async analytics(id: string): Promise<ProviderAnalytics> {
    const sb = getSupabase();
    // Resolve the provider's owning user to scope proposals/agreements/settlements.
    const provRes = await sb.from("providers").select("user_id, view_count, jobs_done").eq("id", id).maybeSingle();
    throwIfError(provRes.error);
    const prov = (provRes.data ?? {}) as { user_id?: string; view_count?: number; jobs_done?: number };
    const uid = prov.user_id ?? "__none__";
    const sevenAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
    const [leadsCntRes, leadsSerRes, proposalsRes, acceptedRes, settleRes, viewsSerRes] = await Promise.all([
      sb.from("leads").select("*", { count: "exact", head: true }).eq("provider_id", id),
      sb.from("leads").select("created_at").eq("provider_id", id).gte("created_at", sevenAgo),
      sb.from("proposals").select("*", { count: "exact", head: true }).eq("responder_user_id", uid),
      sb.from("agreements").select("*", { count: "exact", head: true }).eq("responder_user_id", uid).in("status", ["ACTIVE", "COMPLETED"]),
      sb.from("settlements").select("amount").eq("user_id", uid),
      sb.from("provider_view_logs").select("viewed_at").eq("provider_id", id).gte("viewed_at", sevenAgo),
    ]);
    const earnings = (settleRes.data ?? []).reduce((sum: number, s: any) => sum + (s.amount ?? 0), 0);
    return {
      views: prov.view_count ?? 0,
      leads: leadsCntRes.count ?? 0,
      proposalsSent: proposalsRes.count ?? 0,
      accepted: acceptedRes.count ?? 0,
      jobsDone: prov.jobs_done ?? 0,
      earnings,
      viewsSeries: providerDailyBuckets((viewsSerRes.data ?? []).map((r: any) => r.viewed_at)),
      leadsSeries: providerDailyBuckets((leadsSerRes.data ?? []).map((r: any) => r.created_at)),
    };
  },

  /** Submit a star rating + comment for a provider. Trigger recomputes rating_avg/count. */
  async addReview(id: string, rating: number, comment: string): Promise<void> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw toApiError({ code: "UNAUTHENTICATED" }, 401);
    const { error } = await sb.from("ratings").insert({
      rater_user_id: uid,
      ratee_type: "PROVIDER",
      ratee_id: id,
      rating,
      comment: comment || null,
    });
    throwIfError(error);
  },
};
