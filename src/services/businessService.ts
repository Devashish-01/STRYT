import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import { throwIfError, toApiError } from "@/lib/supabasePage";
import { toCamel, toSnake } from "@/lib/caseMap";
import { config } from "@/config";
import type { Business, CatalogItem, Offer, Review, QueueInfo, LoyaltyCard, ReservationReq } from "@/types";
import { leaderboardService } from "./leaderboardService";
import { haversineKm } from "@/lib/geocode";

function relDate(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 30) return `${Math.floor(d / 7)} week${Math.floor(d / 7) > 1 ? "s" : ""} ago`;
  return `${Math.floor(d / 30)} month${Math.floor(d / 30) > 1 ? "s" : ""} ago`;
}

// Human label for a lead row, given its kind and optional note.
function leadText(kind: string, note?: string): string {
  switch (kind) {
    case "CALL": return "Called you via STRYT";
    case "DIRECTIONS": return "Got directions to your shop";
    case "QUESTION": return note ? `Asked: ${note}` : "Asked a question";
    case "OFFER_CLIP": return "Clipped one of your offers";
    case "STORY_REPLY": return "Replied to your story";
    default: return note || "Reached out via STRYT";
  }
}

function sevenDaysAgoIso(): string {
  return new Date(Date.now() - 7 * 86400 * 1000).toISOString();
}

// Bucket a list of ISO timestamps into a 7-element series (oldest → newest day).
function dailyBuckets(isoDates: string[]): number[] {
  const buckets = [0, 0, 0, 0, 0, 0, 0];
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  for (const iso of isoDates) {
    const dayIdx = 6 - Math.floor((startOfToday.getTime() - new Date(iso).getTime()) / 86400000);
    if (dayIdx >= 0 && dayIdx <= 6) buckets[dayIdx]++;
  }
  return buckets;
}

// Columns that exist on the businesses table — anything else (catalog, offers,
// distanceKm, etc.) is stripped before insert/update so the write never fails
// on an unknown column.
const BUSINESS_COLUMNS = new Set([
  "ownerUserId","name","slug","categoryId","categoryName","subCategory","description",
  "addressLine1","city","pincode","lat","lng","broadcastRadius","phone","whatsapp","hours","isOpenNow",
  "openingDate","isNew","status","coverImage","gallery","ratingAvg","ratingCount",
  "viewCount","isFeatured","isVerified","tags","priceForTwo","deliveryTime","offerText",
  "verificationStatus","verificationDocumentUrl","aadhaarDocUrl","panDocUrl",
]);

function pickColumns<T extends Record<string, unknown>>(obj: T, allowed: Set<string>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (allowed.has(k) && v !== undefined) out[k] = v;
  }
  return out;
}

export interface BusinessAnalytics {
  views: number;
  calls: number;
  directions: number;
  catalogViews: number;
  reviews: number;
  viewsSeries: number[];
  leadsSeries: number[];
}

export const businessService = {
  async mine(): Promise<Business[]> {
    if (config.useMocks) return [];
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return [];
    const { data, error } = await sb.from("businesses").select("*").eq("owner_user_id", uid);
    throwIfError(error);
    return toCamel<Business[]>(data ?? []);
  },

  async get(id: string, lat?: number, lng?: number): Promise<Business | undefined> {
    if (id === "b1" || id.startsWith("biz_mock_")) {
      return {
        id,
        ownerUserId: "mock_user",
        name: "John's Grocery Store",
        slug: "johns-grocery-store",
        categoryId: "1",
        categoryName: "Grocery",
        subCategory: "Supermarket",
        description: "Fresh fruits, vegetables, and daily essentials right at your street.",
        addressLine1: "123 Street Lane",
        city: "Pune",
        pincode: "411001",
        lat: 18.536,
        lng: 73.893,
        phone: "9876543210",
        hours: "9 AM - 9 PM",
        status: "ACTIVE",
        coverImage: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=500",
        gallery: [],
        ratingAvg: 4.5,
        ratingCount: 12,
        isOpenNow: true,
        isVerified: true,
        isFeatured: false,
        catalog: [
          { id: "item_1", name: "Fresh Organic Apple (1kg)", description: "Sweet and crisp organic apples", price: 180, stockStatus: "IN_STOCK" },
          { id: "item_2", name: "Whole Wheat Bread", description: "Freshly baked whole wheat bread", price: 45, stockStatus: "IN_STOCK" },
          { id: "item_3", name: "Fresh Milk (1L)", description: "Pasteurized farm fresh milk", price: 60, stockStatus: "IN_STOCK" }
        ],
        offers: [
          { id: "offer_1", title: "10% OFF on first order", description: "Use code STRYT10 at checkout", validUntil: "2026-12-31" }
        ]
      } as any;
    }
    if (config.useMocks) return undefined;
    const sb = getSupabase();
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

  async reviews(id: string): Promise<Review[]> {
    if (id === "b1" || id.startsWith("biz_mock_")) {
      return [
        { id: "rev_1", raterName: "Emily Watson", raterAvatar: "", rating: 5, comment: "Amazing fresh produce and friendly service!", date: "2 days ago" },
        { id: "rev_2", raterName: "Michael Chang", raterAvatar: "", rating: 4, comment: "Great variety of groceries, highly recommend.", date: "1 week ago" }
      ];
    }
    if (config.useMocks) return [];
    const sb = getSupabase();
    const { data, error } = await sb
      .from("ratings")
      .select("id, rating, comment, created_at, rater:users!rater_user_id(name, avatar)")
      .eq("ratee_type", "BUSINESS")
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

  async queue(id: string): Promise<QueueInfo | undefined> {
    if (config.useMocks) return undefined;
    const sb = getSupabase();
    const { data: settings } = await sb
      .from("queue_settings")
      .select("is_open, avg_service_min")
      .eq("business_id", id)
      .maybeSingle();
    if (!settings?.is_open) return undefined;
    const { count } = await sb
      .from("queue_tokens")
      .select("*", { count: "exact", head: true })
      .eq("business_id", id)
      .eq("status", "WAITING");
    const waiting = count ?? 0;
    return {
      businessId: id,
      isOpen: true,
      peopleAhead: waiting,
      estWaitMin: waiting * (settings.avg_service_min ?? 8),
    };
  },

  // Owner: get queue settings + waiting token list for QueueManager
  async queueOwnerState(businessId: string): Promise<{
    isOpen: boolean;
    avgServiceMin: number;
    tokens: Array<{ id: string; name: string; partySize: string }>;
  }> {
    if (config.useMocks) return { isOpen: false, avgServiceMin: 8, tokens: [] };
    const sb = getSupabase();
    const [settingsRes, tokensRes] = await Promise.all([
      sb.from("queue_settings").select("is_open, avg_service_min").eq("business_id", businessId).maybeSingle(),
      sb.from("queue_tokens")
        .select("id, customer_name, party_size")
        .eq("business_id", businessId)
        .eq("status", "WAITING")
        .order("created_at", { ascending: true }),
    ]);
    return {
      isOpen: settingsRes.data?.is_open ?? false,
      avgServiceMin: settingsRes.data?.avg_service_min ?? 8,
      tokens: (tokensRes.data ?? []).map((t: any) => ({
        id: t.id,
        name: t.customer_name,
        partySize: t.party_size,
      })),
    };
  },

  async setQueueSettings(businessId: string, patch: { isOpen?: boolean; avgServiceMin?: number }) {
    if (config.useMocks) return { ok: true };
    const sb = getSupabase();
    const row: Record<string, unknown> = { business_id: businessId, updated_at: new Date().toISOString() };
    if (patch.isOpen !== undefined) row.is_open = patch.isOpen;
    if (patch.avgServiceMin !== undefined) row.avg_service_min = patch.avgServiceMin;
    const { error } = await sb.from("queue_settings").upsert(row, { onConflict: "business_id" });
    throwIfError(error);
    return { ok: true };
  },

  async callNextToken(businessId: string) {
    if (config.useMocks) return { ok: false, message: "Queue is empty" };
    const sb = getSupabase();
    // Fetch the oldest WAITING token for this business
    const { data, error: fetchErr } = await sb
      .from("queue_tokens")
      .select("id")
      .eq("business_id", businessId)
      .eq("status", "WAITING")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    throwIfError(fetchErr);
    if (!data) return { ok: false, message: "Queue is empty" };
    const { error } = await sb.from("queue_tokens").update({ status: "CALLED" }).eq("id", data.id);
    throwIfError(error);
    return { ok: true };
  },

  async serveToken(tokenId: string) {
    if (config.useMocks) return { ok: true };
    const sb = getSupabase();
    const { error } = await sb.from("queue_tokens").update({ status: "SERVED" }).eq("id", tokenId);
    throwIfError(error);
    return { ok: true };
  },

  async joinQueueToken(businessId: string, customerName: string, partySize = "1 person") {
    if (config.useMocks) return { ok: true };
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw toApiError({ code: "UNAUTHENTICATED", message: "Sign in to join the queue" }, 401);
    const { error } = await sb.from("queue_tokens").insert({
      business_id: businessId,
      customer_user_id: uid,
      customer_name: customerName,
      party_size: partySize,
    });
    throwIfError(error);
    return { ok: true };
  },

  async loyaltyCard(id: string): Promise<LoyaltyCard | undefined> {
    if (config.useMocks) return undefined;
    const sb = getSupabase();
    const { data: card, error } = await sb
      .from("loyalty_cards")
      .select("id, target, reward")
      .eq("business_id", id)
      .eq("is_active", true)
      .maybeSingle();
    throwIfError(error);
    if (!card) return undefined;
    const c = card as { id: string; target: number; reward: string };
    const uid = await currentUserId();
    let stamps = 0;
    if (uid) {
      const { data: st } = await sb.from("user_stamps").select("stamps").eq("user_id", uid).eq("card_id", c.id).maybeSingle();
      stamps = (st as { stamps?: number } | null)?.stamps ?? 0;
    }
    return { id: c.id, businessId: id, businessName: "", businessImage: "", stamps, target: c.target, reward: c.reward };
  },

  async update(id: string, patch: Partial<Business>) {
    if (config.useMocks) {
      return { id, ...patch } as any;
    }
    const sb = getSupabase();
    const cols = pickColumns(patch as Record<string, unknown>, BUSINESS_COLUMNS);
    const { data, error } = await sb.from("businesses").update(toSnake(cols)).eq("id", id).select().maybeSingle();
    throwIfError(error);
    return toCamel<Business>(data);
  },

  async create(data: Partial<Business>) {
    if (config.useMocks) {
      return {
        id: "biz_mock_" + Date.now(),
        ownerUserId: "mock_user",
        name: data.name ?? "New Shop",
        slug: data.slug ?? "new-shop",
        categoryId: data.categoryId ?? "1",
        categoryName: data.categoryName ?? "",
        subCategory: data.subCategory ?? "",
        description: data.description ?? "",
        addressLine1: data.addressLine1 ?? "",
        city: data.city ?? "",
        pincode: data.pincode ?? "",
        lat: data.lat ?? 0,
        lng: data.lng ?? 0,
        phone: data.phone ?? "",
        hours: data.hours ?? "9 AM - 9 PM",
        status: "ACTIVE",
        coverImage: data.coverImage ?? "",
        gallery: data.gallery ?? [],
        ratingAvg: 0,
        ratingCount: 0,
        isOpenNow: true,
        isVerified: false,
        isFeatured: false,
      } as any;
    }
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw toApiError({ code: "UNAUTHENTICATED", message: "Sign in to list a business" }, 401);
    const { data: me } = await sb.from("users").select("lat, lng, area").eq("id", uid).maybeSingle();
    const cols = pickColumns(data as Record<string, unknown>, BUSINESS_COLUMNS);
    const row = { ...toSnake(cols), owner_user_id: uid, status: "ACTIVE" } as Record<string, any>;
    if (row.lat === undefined || row.lat === null) {
      row.lat = (me as any)?.lat ?? null;
    }
    if (row.lng === undefined || row.lng === null) {
      row.lng = (me as any)?.lng ?? null;
    }
    if (!row.address_line1) {
      row.address_line1 = (me as any)?.area ?? null;
    }
    const { data: created, error } = await sb.from("businesses").insert(row).select().maybeSingle();
    throwIfError(error);
    return toCamel<Business>(created);
  },

  async submitForReview(id: string) {
    if (config.useMocks) return { ok: true, status: "ACTIVE" };
    const sb = getSupabase();
    const { error } = await sb.from("businesses").update({ status: "ACTIVE" }).eq("id", id);
    throwIfError(error);
    return { ok: true, status: "ACTIVE" };
  },

  async submitVerification(id: string, docUrl: string) {
    if (config.useMocks) return { ok: true };
    const sb = getSupabase();
    const { error } = await sb
      .from("businesses")
      .update({ verification_status: "UNDER_REVIEW", verification_document_url: docUrl })
      .eq("id", id);
    throwIfError(error);
    return { ok: true };
  },

  // Catalog
  async addCatalogItem(id: string, item: Partial<CatalogItem>) {
    if (config.useMocks) {
      return { id: "item_mock_" + Date.now(), name: item.name ?? "", description: item.description ?? "", price: item.price ?? 0, stockStatus: "IN_STOCK" } as any;
    }
    const sb = getSupabase();
    const row = { ...toSnake(item), business_id: id };
    const { data, error } = await sb.from("catalog_items").insert(row).select().maybeSingle();
    throwIfError(error);
    return toCamel<CatalogItem>(data);
  },
  async updateCatalogItem(id: string, itemId: string, patch: Partial<CatalogItem>) {
    if (config.useMocks) {
      return { id: itemId, ...patch } as any;
    }
    const sb = getSupabase();
    const { data, error } = await sb.from("catalog_items").update(toSnake(patch)).eq("id", itemId).select().maybeSingle();
    throwIfError(error);
    return toCamel<CatalogItem>(data);
  },
  async deleteCatalogItem(id: string, itemId: string) {
    if (config.useMocks) return { ok: true };
    const sb = getSupabase();
    const { error } = await sb.from("catalog_items").delete().eq("id", itemId);
    throwIfError(error);
    return { ok: true };
  },

  // Offers
  async addOffer(id: string, offer: Partial<Offer>) {
    if (config.useMocks) {
      return { id: "off_mock_" + Date.now(), title: offer.title ?? "", description: offer.description ?? "", validUntil: offer.validUntil ?? "" } as any;
    }
    const sb = getSupabase();
    const row = { ...toSnake(offer), business_id: id };
    const { data, error } = await sb.from("offers").insert(row).select().maybeSingle();
    throwIfError(error);
    return toCamel<Offer>(data);
  },
  async deleteOffer(id: string, offerId: string) {
    if (config.useMocks) return { ok: true };
    const sb = getSupabase();
    const { error } = await sb.from("offers").delete().eq("id", offerId);
    throwIfError(error);
    return { ok: true };
  },

  // Photos
  async addPhoto(id: string, url: string) {
    if (config.useMocks) return { ok: true };
    const sb = getSupabase();
    const { data: cur, error: readErr } = await sb.from("businesses").select("gallery").eq("id", id).maybeSingle();
    throwIfError(readErr);
    const gallery = [...(((cur as { gallery?: string[] } | null)?.gallery) ?? []), url];
    const { error } = await sb.from("businesses").update({ gallery }).eq("id", id);
    throwIfError(error);
    return { ok: true };
  },

  async deletePhoto(id: string, url: string) {
    if (config.useMocks) return { ok: true };
    const sb = getSupabase();
    const { data: cur, error: readErr } = await sb.from("businesses").select("gallery, cover_image").eq("id", id).maybeSingle();
    throwIfError(readErr);
    const row = cur as { gallery?: string[]; cover_image?: string } | null;
    const gallery = (row?.gallery ?? []).filter((u: string) => u !== url);
    const patch: Record<string, unknown> = { gallery };
    if (row?.cover_image === url) patch.cover_image = gallery[0] ?? null;
    const { error } = await sb.from("businesses").update(patch).eq("id", id);
    throwIfError(error);
    return { ok: true };
  },

  async setCoverPhoto(id: string, url: string) {
    if (config.useMocks) return { ok: true };
    const sb = getSupabase();
    const { error } = await sb.from("businesses").update({ cover_image: url }).eq("id", id);
    throwIfError(error);
    return { ok: true };
  },

  // Dashboard analytics
  async analytics(id: string): Promise<BusinessAnalytics> {
    if (config.useMocks) {
      return {
        views: 120,
        calls: 8,
        directions: 14,
        catalogViews: 0,
        reviews: 4,
        viewsSeries: [10, 15, 8, 22, 19, 14, 32],
        leadsSeries: [1, 2, 0, 1, 0, 3, 1],
      };
    }
    const sb = getSupabase();
    const [bizRes, viewsRes, leadsRes] = await Promise.all([
      sb.from("businesses").select("view_count, call_count, directions_count, rating_count").eq("id", id).maybeSingle(),
      sb.from("business_view_logs").select("viewed_at").eq("business_id", id).gte("viewed_at", sevenDaysAgoIso()),
      sb.from("leads").select("created_at").eq("business_id", id).gte("created_at", sevenDaysAgoIso()),
    ]);
    throwIfError(bizRes.error);
    throwIfError(leadsRes.error);
    const b = (bizRes.data ?? {}) as Record<string, number>;
    return {
      views: b.view_count ?? 0,
      calls: b.call_count ?? 0,
      directions: b.directions_count ?? 0,
      catalogViews: 0,
      reviews: b.rating_count ?? 0,
      viewsSeries: dailyBuckets((viewsRes.data ?? []).map((r: any) => r.viewed_at)),
      leadsSeries: dailyBuckets((leadsRes.data ?? []).map((r: any) => r.created_at)),
    };
  },

  // Q&A, reservations, leads
  async qna(id: string): Promise<import("@/types").QnaItem[]> {
    if (config.useMocks) return [];
    const sb = getSupabase();
    const { data, error } = await sb
      .from("business_qna")
      .select("id, business_id, question, answer, created_at, asker:users!asker_user_id(name)")
      .eq("business_id", id)
      .order("created_at", { ascending: false })
      .limit(50);
    throwIfError(error);
    return (data ?? []).map((q: any) => ({
      id: q.id,
      businessId: q.business_id,
      askerName: q.asker?.name ?? "Customer",
      question: q.question,
      answer: q.answer ?? undefined,
      askedAt: relDate(q.created_at),
    }));
  },
  async askQuestion(id: string, question: string) {
    if (config.useMocks) return { ok: true };
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw toApiError({ code: "UNAUTHENTICATED", message: "Sign in to ask a question" }, 401);
    const { error } = await sb.from("business_qna").insert({ business_id: id, asker_user_id: uid, question });
    throwIfError(error);
    return { ok: true };
  },
  async answerQuestion(qId: string, answer: string) {
    if (config.useMocks) return { ok: true };
    const sb = getSupabase();
    const { error } = await sb
      .from("business_qna")
      .update({ answer, answered_at: new Date().toISOString() })
      .eq("id", qId);
    throwIfError(error);
    return { ok: true };
  },
  async reservations(_id: string): Promise<ReservationReq[]> {
    return [];
  },
  async setReservation(_rId: string, _status: "ACCEPTED" | "DECLINED") {
    return { ok: false };
  },
  async leads(id: string) {
    if (config.useMocks) return [];
    const sb = getSupabase();
    const { data, error } = await sb
      .from("leads")
      .select("id, business_id, kind, note, handled, created_at, from:users!from_user_id(name, avatar)")
      .eq("business_id", id)
      .order("created_at", { ascending: false })
      .limit(100);
    throwIfError(error);
    return (data ?? []).map((l: any) => ({
      id: l.id,
      businessId: l.business_id,
      kind: l.kind,
      name: l.from?.name ?? "Someone",
      avatar: l.from?.avatar ?? "",
      text: leadText(l.kind, l.note),
      time: relDate(l.created_at),
      handled: l.handled,
    }));
  },
  async markLeadHandled(leadId: string) {
    if (config.useMocks) return { ok: true };
    const sb = getSupabase();
    const { error } = await sb.from("leads").update({ handled: true }).eq("id", leadId);
    throwIfError(error);
    return { ok: true };
  },
  async recordInteraction(id: string, kind: "CALL" | "DIRECTIONS") {
    if (config.useMocks) return { ok: true };
    const sb = getSupabase();
    const uid = await currentUserId();
    await sb.rpc("bump_business_metric", { p_business_id: id, p_metric: kind === "CALL" ? "call" : "directions" });
    if (uid) await sb.from("leads").insert({ business_id: id, from_user_id: uid, kind });
    return { ok: true };
  },
  async recordView(id: string) {
    if (config.useMocks) return { ok: true };
    const sb = getSupabase();
    await sb.rpc("bump_business_metric", { p_business_id: id, p_metric: "view" });
    return { ok: true };
  },
  async team(_id: string): Promise<import("@/types").TeamMember[]> {
    return [];
  },

  async buyBoost(id: string, boostType: string) {
    if (config.useMocks) return { ok: true, boostType };
    const sb = getSupabase();
    const weeklong = boostType !== "REBROADCAST";
    const endsAt = weeklong ? new Date(Date.now() + 7 * 86400 * 1000).toISOString() : null;
    const { error } = await sb.from("boosts").insert({
      target_type: "business",
      target_id: id,
      boost_type: boostType,
      ends_at: endsAt,
    });
    throwIfError(error);
    await sb.from("businesses").update({ is_boosted: true, boosted_until: endsAt }).eq("id", id);
    return { ok: true, boostType };
  },

  async activeBoosts(id: string): Promise<string[]> {
    if (config.useMocks) return [];
    const sb = getSupabase();
    const nowIso = new Date().toISOString();
    const { data, error } = await sb
      .from("boosts")
      .select("boost_type, ends_at")
      .eq("target_type", "business")
      .eq("target_id", id);
    throwIfError(error);
    return (data ?? [])
      .filter((b: any) => !b.ends_at || b.ends_at > nowIso)
      .map((b: any) => b.boost_type);
  },

  async addReview(id: string, rating: number, comment: string): Promise<void> {
    if (config.useMocks) return Promise.resolve();
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw toApiError({ code: "UNAUTHENTICATED" }, 401);
    const { count: existingCount } = await sb
      .from("ratings")
      .select("*", { count: "exact", head: true })
      .eq("ratee_type", "BUSINESS")
      .eq("ratee_id", id);
    const { error } = await sb.from("ratings").insert({
      rater_user_id: uid,
      ratee_type: "BUSINESS",
      ratee_id: id,
      rating,
      comment: comment || null,
    });
    throwIfError(error);
    if ((existingCount ?? 0) === 0) {
      const { data: biz } = await sb.from("businesses").select("owner_user_id").eq("id", id).maybeSingle();
      if (biz?.owner_user_id) void leaderboardService.addPoints(biz.owner_user_id, 3);
    }
  },
};
