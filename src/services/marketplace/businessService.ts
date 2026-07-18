import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import type { TablesInsert, TablesUpdate } from "@/lib/dbTypes";
import { throwIfError, toApiError } from "@/lib/supabasePage";
import { toCamel, toSnake } from "@/lib/caseMap";
import type { Business, CatalogItem, PortfolioItem, Review, QueueInfo, LoyaltyCard, MyQueueEntry, PaymentMethod, QueueOwnerToken } from "@/types";
import { leaderboardService } from "./leaderboardService";
import { haversineKm } from "@/lib/geocode";
import { parsePartySize, weightedWaitMin } from "@/lib/queueMath";
import { aliasName } from "@/lib/publicName";
import { config } from "@/config";
import { isMockTarget } from "@/services/engagement/appointmentService";
import { PLACEHOLDER_BUSINESS_COVER } from "@/lib/placeholders";
import { uploadService } from "@/services/core/uploadService";
import { leadText } from "@/lib/leadText";

// A Postgrest UPDATE that's blocked by RLS (no row satisfies the policy) returns
// success with zero rows affected, not an error — so throwIfError alone can't
// tell a real write from a silently no-op'd one. Queue actions (join/leave/call/
// serve/pay) all go through plain client updates like this, so this checks the
// affected-row count explicitly and raises a real, user-visible error instead of
// a false "success" toast over a database that didn't actually change.
async function updateQueueToken(tokenId: string, patch: Record<string, unknown>): Promise<void> {
  const sb = getSupabase();
  const { data, error } = await sb.from("queue_tokens").update(patch as TablesUpdate<"queue_tokens">).eq("id", tokenId).select("id");
  throwIfError(error);
  if (!data || data.length === 0) {
    throw new Error("Couldn't update — you may not have permission, or it was already changed.");
  }
}

type QueueOwnerState = {
  isOpen: boolean;
  avgServiceMin: number;
  waiting: Array<QueueOwnerToken>;
  called: Array<QueueOwnerToken>;
  served: Array<QueueOwnerToken>;
};

// queueOwnerState(businessId) is fetched independently — no sharing — by
// ManageNav's badge count, ManageDashboard, BusinessHub, BusinessPayments, and
// QueueManager, all of which can be mounted on the same screen at once (the
// nav renders alongside every one of them). This coalesces concurrent callers
// for the same business onto one in-flight request — same pattern as
// appointmentService.listForCustomer: NOT a time-based cache, the map entry is
// deleted the instant the promise settles, so a realtime-triggered refetch
// arriving later always starts a genuinely fresh request.
const inFlightQueueOwnerState = new Map<string, Promise<QueueOwnerState>>();

function relDate(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 30) return `${Math.floor(d / 7)} week${Math.floor(d / 7) > 1 ? "s" : ""} ago`;
  return `${Math.floor(d / 30)} month${Math.floor(d / 30) > 1 ? "s" : ""} ago`;
}

// Human label for a lead row, given its kind and optional note.
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
  "isAvailableNow","availableUntil",
  "openingDate","isNew","status","coverImage","gallery","ratingAvg","ratingCount",
  "viewCount","isFeatured","isVerified","tags","priceForTwo","deliveryTime","offerText",
  "verificationStatus","verificationDocumentUrl","upiId","paymentTiming",
  "email","showPhonePublicly","showEmailPublicly","locationPublic",
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
  questions: number;
  viewsSeries: number[];
  leadsSeries: number[];
}

export const businessService = {
  async mine(): Promise<Business[]> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return [];
    const { data, error } = await sb.from("businesses").select("*").eq("owner_user_id", uid);
    throwIfError(error);
    return toCamel<Business[]>(data ?? []);
  },

  async get(id: string, lat?: number, lng?: number): Promise<Business | undefined> {
    if (isMockTarget(id)) {
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
        lat: config.defaultLocation.lat,
        lng: config.defaultLocation.lng,
        phone: "9876543210",
        hours: "9 AM - 9 PM",
        status: "ACTIVE",
        coverImage: PLACEHOLDER_BUSINESS_COVER,
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
        ]
      } as any;
    }
    const sb = getSupabase();
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

  async reviews(id: string): Promise<Review[]> {
    if (isMockTarget(id)) {
      return [
        { id: "rev_1", raterName: "Emily Watson", raterAvatar: "", rating: 5, comment: "Amazing fresh produce and friendly service!", date: "2 days ago" },
        { id: "rev_2", raterName: "Michael Chang", raterAvatar: "", rating: 4, comment: "Great variety of groceries, highly recommend.", date: "1 week ago" }
      ];
    }
    const sb = getSupabase();
    const { data, error } = await sb
      .from("ratings")
      .select("id, rating, comment, created_at, is_verified_booking, rater:users!rater_user_id(name, alias, avatar, show_name_publicly)")
      .eq("ratee_type", "BUSINESS")
      .eq("ratee_id", id)
      .order("created_at", { ascending: false })
      .limit(30);
    throwIfError(error);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      raterName: aliasName({ alias: r.rater?.alias, name: r.rater?.name, showNamePublicly: r.rater?.show_name_publicly }, "Anonymous"),
      raterAvatar: r.rater?.avatar ?? "",
      rating: r.rating,
      comment: r.comment ?? "",
      date: relDate(r.created_at),
      isVerifiedBooking: !!r.is_verified_booking,
    }));
  },

  async queue(id: string): Promise<QueueInfo | undefined> {
    const sb = getSupabase();
    // Opportunistic cleanup: sweep abandoned/stale queues before reading, so a
    // shop whose owner walked away shows as closed rather than a frozen line.
    void sb.rpc("close_stale_queue_tokens");
    const { data: settings } = await sb
      .from("queue_settings")
      .select("is_open, avg_service_min")
      .eq("business_id", id)
      .maybeSingle();
    if (!settings?.is_open) return undefined;
    // Pull party sizes (not just a count) so the pre-join estimate uses the same
    // weighted formula as My Queues — a line with big parties reads longer.
    const { data: waitingRows } = await sb
      .from("queue_tokens")
      .select("party_size")
      .eq("business_id", id)
      .eq("status", "WAITING")
      .order("created_at", { ascending: true });
    const rows = (waitingRows ?? []) as any[];
    const avg = settings.avg_service_min ?? 8;
    return {
      businessId: id,
      isOpen: true,
      peopleAhead: rows.length,
      estWaitMin: weightedWaitMin(rows.map((r) => parsePartySize(r.party_size)), avg),
    };
  },

  // Owner: get queue settings + token lists for QueueManager. Returns the
  // WAITING line, the currently-CALLED tokens (whoever the owner is serving
  // right now), and recently-SERVED tokens (bounded to the last 24h) so a
  // payment claimed after service has somewhere to be verified — the console
  // otherwise never fetches SERVED rows at all.
  async queueOwnerState(businessId: string): Promise<QueueOwnerState> {
    const inFlight = inFlightQueueOwnerState.get(businessId);
    if (inFlight) return inFlight;

    const promise = (async (): Promise<QueueOwnerState> => {
      const sb = getSupabase();
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [settingsRes, tokensRes, servedRes] = await Promise.all([
        sb.from("queue_settings").select("is_open, avg_service_min").eq("business_id", businessId).maybeSingle(),
        sb.from("queue_tokens")
          .select("id, customer_name, party_size, status, created_at, arrived_at, payment_status, payment_method, payment_amount, payment_reference")
          .eq("business_id", businessId)
          .in("status", ["WAITING", "CALLED"])
          .order("created_at", { ascending: true }),
        sb.from("queue_tokens")
          .select("id, customer_name, customer_user_id, party_size, status, created_at, arrived_at, payment_status, payment_method, payment_amount, payment_reference, customer:users!customer_user_id(alias, show_name_publicly)")
          .eq("business_id", businessId)
          .eq("status", "SERVED")
          .gte("created_at", since)
          .order("created_at", { ascending: false }),
      ]);
      const rows = (tokensRes.data ?? []) as any[];
      const map = (t: any): QueueOwnerToken => ({
        id: t.id,
        name: t.customer_name,
        partySize: t.party_size,
        joinedAtISO: t.created_at,
        arrivedAt: t.arrived_at ?? null,
        paymentStatus: t.payment_status ?? "UNPAID",
        paymentMethod: t.payment_method ?? null,
        paymentAmount: t.payment_amount ?? null,
        paymentReference: t.payment_reference ?? null,
      });
      return {
        isOpen: settingsRes.data?.is_open ?? false,
        avgServiceMin: settingsRes.data?.avg_service_min ?? 8,
        waiting: rows.filter((t) => t.status === "WAITING").map(map),
        called: rows.filter((t) => t.status === "CALLED").map(map),
        // Once served, the visit is complete — the owner reverts to the customer's
        // public alias rather than keeping their real name on the history card.
        served: ((servedRes.data ?? []) as any[]).map((t) => ({
          ...map(t),
          name: aliasName({ alias: t.customer?.alias, name: t.customer_name, showNamePublicly: t.customer?.show_name_publicly }, "Customer"),
        })),
      };
    })();

    inFlightQueueOwnerState.set(businessId, promise);
    try {
      return await promise;
    } finally {
      inFlightQueueOwnerState.delete(businessId);
    }
  },

  /** Business verifies/rejects a queue payment claim, or a customer/owner claims one. */
  async claimQueuePayment(tokenId: string, method: PaymentMethod, amount: number | null, reference: string | null) {
    const patch: Record<string, unknown> = { payment_method: method, payment_status: "PENDING_CONFIRM" };
    if (amount != null) patch.payment_amount = amount;
    if (reference) patch.payment_reference = reference;
    await updateQueueToken(tokenId, patch);
    return { ok: true };
  },

  async confirmQueuePayment(tokenId: string) {
    await updateQueueToken(tokenId, { payment_status: "PAID" });
    return { ok: true };
  },

  async rejectQueuePaymentClaim(tokenId: string) {
    await updateQueueToken(tokenId, { payment_status: "REJECTED" });
    return { ok: true };
  },

  /** Nudge a served customer to pay — mirrors appointmentService.nudgePayment's
   *  shape (a plain notification insert, no RPC needed for queue payments). */
  async nudgeQueuePayment(tokenId: string) {
    const sb = getSupabase();
    const { data: token, error } = await sb
      .from("queue_tokens")
      .select("id, customer_user_id, payment_amount, businesses!business_id(name)")
      .eq("id", tokenId)
      .maybeSingle();
    if (error) throw error;
    if (!token) throw new Error("Queue entry not found");
    if (!(token as any).customer_user_id) throw new Error("No customer linked to this entry");

    const shopName = (token as any).businesses?.name || "the shop";
    const amountStr = (token as any).payment_amount ? ` ₹${(token as any).payment_amount}` : "";
    const { notificationService } = await import("@/services/engagement/notificationService");
    await notificationService.send(
      (token as any).customer_user_id,
      "Payment Requested 🔔",
      `${shopName} requested payment${amountStr} for your visit.`,
      "/queues",
      "SYSTEM"
    );
    return { ok: true };
  },

  /** Customer undoes their own unconfirmed payment claim, reverting to UNPAID
   *  so the cancel-visit and pay-again actions become available again. Scoped
   *  to PENDING_CONFIRM only — a claim the business already confirmed as PAID
   *  is untouched even if this is somehow called against it. */
  async cancelQueuePaymentClaim(tokenId: string) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("queue_tokens")
      .update({ payment_status: "UNPAID" } as TablesUpdate<"queue_tokens">)
      .eq("id", tokenId)
      .eq("payment_status", "PENDING_CONFIRM")
      .select("id");
    throwIfError(error);
    if (!data || data.length === 0) {
      throw new Error("Couldn't cancel — the business may have already confirmed or rejected it.");
    }
    return { ok: true };
  },

  async setQueueSettings(businessId: string, patch: { isOpen?: boolean; avgServiceMin?: number }) {
    const sb = getSupabase();
    // Touching settings is an owner-presence signal — bump the heartbeat so a
    // freshly opened/updated queue isn't auto-closed for inactivity.
    const row: Record<string, unknown> = { business_id: businessId, updated_at: new Date().toISOString(), last_activity_at: new Date().toISOString() };
    if (patch.isOpen !== undefined) row.is_open = patch.isOpen;
    if (patch.avgServiceMin !== undefined) row.avg_service_min = patch.avgServiceMin;
    const { error } = await sb.from("queue_settings").upsert(row as TablesInsert<"queue_settings">, { onConflict: "business_id" });
    throwIfError(error);
    return { ok: true };
  },

  async callNextToken(businessId: string) {
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
    await updateQueueToken(data.id, { status: "CALLED" });
    return { ok: true };
  },

  async serveToken(tokenId: string) {
    await updateQueueToken(tokenId, { status: "SERVED" });
    return { ok: true };
  },

  /** Marks that a called customer has actually shown up — independent of "Done"
   *  (service complete), so arrival and completion are two distinct, verifiable steps. */
  async markArrived(tokenId: string) {
    await updateQueueToken(tokenId, { arrived_at: new Date().toISOString() });
    return { ok: true };
  },

  async joinQueueToken(businessId: string, customerName: string, partySize = "1 person") {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw toApiError({ code: "UNAUTHENTICATED", message: "Sign in to join the queue" }, 401);
    // Re-check is_open server-round-trip-side even though the "Join queue" button
    // is already hidden when closed — a stale page or a second tab could still
    // fire this call after the owner turns the queue off.
    const { data: settings } = await sb.from("queue_settings").select("is_open").eq("business_id", businessId).maybeSingle();
    if (!settings?.is_open) {
      throw new Error("This queue is currently closed — the shop isn't accepting new joins right now.");
    }
    const { data, error } = await sb.from("queue_tokens").insert({
      business_id: businessId,
      customer_user_id: uid,
      customer_name: customerName,
      party_size: partySize,
    }).select("id");
    // The partial unique index (queue_tokens_one_active_per_biz) rejects a
    // second live token for the same shop — turn Postgres's 23505 into a
    // human message instead of a raw constraint dump.
    if (error && (error.code === "23505" || /duplicate key|unique/i.test(error.message ?? ""))) {
      throw new Error("You're already in this shop's queue — check My Queues.");
    }
    throwIfError(error);
    if (!data || data.length === 0) {
      throw new Error("Couldn't join the queue — you may not have permission. Try again.");
    }
    return { ok: true };
  },

  async leaveQueueToken(tokenId: string) {
    await updateQueueToken(tokenId, { status: "LEFT" });
    return { ok: true };
  },

  // Every queue this customer has joined, across all shops — live position for
  // WAITING/CALLED entries, plus SERVED/LEFT as history.
  async myQueues(): Promise<MyQueueEntry[]> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return [];
    // Run the staleness sweep first (and wait for it) so this list reflects any
    // just-closed queue immediately — a stranded token flips to EXPIRED here.
    try { await sb.rpc("close_stale_queue_tokens"); } catch { /* cleanup is best-effort */ }
    const { data, error } = await sb
      .from("queue_tokens")
      .select("id, business_id, status, party_size, created_at, payment_status, payment_method, payment_amount, payment_reference, businesses!business_id(name, cover_image, upi_id)")
      .eq("customer_user_id", uid)
      .order("created_at", { ascending: false })
      .limit(100);
    throwIfError(error);
    const rows = (data ?? []) as any[];
    if (rows.length === 0) return [];

    const activeBizIds = Array.from(new Set(
      rows.filter((r) => r.status === "WAITING" || r.status === "CALLED").map((r) => r.business_id)
    ));
    const waitingByBiz: Record<string, { id: string; party_size?: string }[]> = {};
    const avgByBiz: Record<string, number> = {};
    if (activeBizIds.length > 0) {
      const [{ data: waitingRows }, { data: settingsRows }] = await Promise.all([
        sb.from("queue_tokens")
          .select("id, business_id, party_size")
          .in("business_id", activeBizIds)
          .eq("status", "WAITING")
          .order("created_at", { ascending: true }),
        sb.from("queue_settings").select("business_id, avg_service_min").in("business_id", activeBizIds),
      ]);
      for (const w of (waitingRows ?? []) as any[]) {
        (waitingByBiz[w.business_id] ??= []).push(w);
      }
      for (const s of (settingsRows ?? []) as any[]) {
        avgByBiz[s.business_id] = s.avg_service_min ?? 8;
      }
    }

    return rows.map((r) => {
      const waitingList = waitingByBiz[r.business_id] ?? [];
      const idx = waitingList.findIndex((w) => w.id === r.id);
      const peopleAhead = idx >= 0 ? idx : 0;
      const avg = avgByBiz[r.business_id] ?? 8;
      // Weight the wait by the party sizes of the groups actually ahead of this
      // token, not a flat count × avg — a big party ahead pushes your ETA out.
      const sizesAhead = idx > 0 ? waitingList.slice(0, idx).map((w) => parsePartySize(w.party_size)) : [];
      return {
        tokenId: r.id,
        businessId: r.business_id,
        businessName: r.businesses?.name ?? "Shop",
        businessImage: r.businesses?.cover_image ?? "",
        status: r.status,
        position: idx >= 0 ? idx + 1 : 0,
        peopleAhead,
        partySize: r.party_size ?? "1 person",
        joinedAtISO: r.created_at,
        estWaitMin: r.status === "WAITING" ? weightedWaitMin(sizesAhead, avg) : 0,
        businessUpiId: r.businesses?.upi_id ?? null,
        paymentStatus: r.payment_status ?? "UNPAID",
        paymentMethod: r.payment_method ?? null,
        paymentAmount: r.payment_amount ?? null,
        paymentReference: r.payment_reference ?? null,
      };
    });
  },

  async loyaltyCard(id: string): Promise<LoyaltyCard | undefined> {
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
    const sb = getSupabase();
    const cols = pickColumns(patch as Record<string, unknown>, BUSINESS_COLUMNS);
    const { data, error } = await sb.from("businesses").update(toSnake(cols)).eq("id", id).select().maybeSingle();
    throwIfError(error);
    return toCamel<Business>(data);
  },

  async create(data: Partial<Business>) {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw toApiError({ code: "UNAUTHENTICATED", message: "Sign in to list a business" }, 401);
    // lat/lng aren't selectable via a plain query anymore (ISS-009) —
    // get_own_coords() is a SECURITY DEFINER RPC scoped to auth.uid().
    const [{ data: coords }, { data: me }] = await Promise.all([
      sb.rpc("get_own_coords").maybeSingle(),
      sb.from("users").select("area").eq("id", uid).maybeSingle(),
    ]);
    const cols = pickColumns(data as Record<string, unknown>, BUSINESS_COLUMNS);
    const row = { ...toSnake(cols), owner_user_id: uid, status: "ACTIVE" } as Record<string, any>;
    if (row.lat === undefined || row.lat === null) {
      row.lat = (coords as any)?.lat ?? null;
    }
    if (row.lng === undefined || row.lng === null) {
      row.lng = (coords as any)?.lng ?? null;
    }
    if (!row.address_line1) {
      row.address_line1 = (me as any)?.area ?? null;
    }
    const { data: created, error } = await sb.from("businesses").insert(row).select().maybeSingle();
    throwIfError(error);
    return toCamel<Business>(created);
  },

  async submitForReview(id: string) {
    const sb = getSupabase();
    const { error } = await sb.from("businesses").update({ status: "ACTIVE" }).eq("id", id);
    throwIfError(error);
    return { ok: true, status: "ACTIVE" };
  },

  /**
   * Submit (or resubmit, after a REJECTED decision) documents for manual
   * STRYT verification. Files go to the private verification-docs bucket
   * (never the public "uploads" bucket) — only a reviewer's signed URL can
   * read them back. Moving to APPROVED/REJECTED can only ever be done by the
   * verification-review Edge Function (enforced by a DB trigger), so this
   * write can only ever land on UNDER_REVIEW.
   */
  async submitVerification(id: string, files: File[]) {
    if (files.length === 0) throw toApiError({ code: "VALIDATION", message: "Add at least one document" }, 400);
    const paths = await Promise.all(files.map((f) => uploadService.uploadPrivate(f, "verification")));
    const sb = getSupabase();
    const { error } = await sb
      .from("businesses")
      .update({
        verification_status: "UNDER_REVIEW",
        verification_documents: paths,
        verification_document_url: paths[0],
        verification_reason: null,
      })
      .eq("id", id);
    throwIfError(error);
    return { ok: true };
  },

  // Catalog
  async addCatalogItem(id: string, item: Partial<CatalogItem>) {
    const sb = getSupabase();
    const row = { ...toSnake(item), business_id: id };
    const { data, error } = await sb.from("catalog_items").insert(row).select().maybeSingle();
    throwIfError(error);
    return toCamel<CatalogItem>(data);
  },
  async updateCatalogItem(id: string, itemId: string, patch: Partial<CatalogItem>) {
    const sb = getSupabase();
    const { data, error } = await sb.from("catalog_items").update(toSnake(patch)).eq("id", itemId).select().maybeSingle();
    throwIfError(error);
    return toCamel<CatalogItem>(data);
  },
  async deleteCatalogItem(id: string, itemId: string) {
    const sb = getSupabase();
    const { error } = await sb.from("catalog_items").delete().eq("id", itemId);
    throwIfError(error);
    return { ok: true };
  },

  // Portfolio (past-work gallery) — mirrors providerService's portfolio methods.
  async addPortfolio(id: string, item: Partial<PortfolioItem>) {
    const sb = getSupabase();
    const row = { ...toSnake(item), business_id: id };
    const { data, error } = await sb.from("business_portfolio_items").insert(row).select().maybeSingle();
    throwIfError(error);
    return toCamel<PortfolioItem>(data);
  },
  async updatePortfolio(_id: string, itemId: string, patch: Partial<PortfolioItem>) {
    const sb = getSupabase();
    const { data, error } = await sb.from("business_portfolio_items").update(toSnake(patch)).eq("id", itemId).select().maybeSingle();
    throwIfError(error);
    return toCamel<PortfolioItem>(data);
  },
  async deletePortfolio(_id: string, itemId: string) {
    const sb = getSupabase();
    const { error } = await sb.from("business_portfolio_items").delete().eq("id", itemId);
    throwIfError(error);
    return { ok: true };
  },

  // Photos
  async addPhoto(id: string, url: string) {
    const sb = getSupabase();
    const { data: cur, error: readErr } = await sb.from("businesses").select("gallery").eq("id", id).maybeSingle();
    throwIfError(readErr);
    const gallery = [...(((cur as { gallery?: string[] } | null)?.gallery) ?? []), url];
    const { error } = await sb.from("businesses").update({ gallery }).eq("id", id);
    throwIfError(error);
    return { ok: true };
  },

  async deletePhoto(id: string, url: string) {
    const sb = getSupabase();
    const { data: cur, error: readErr } = await sb.from("businesses").select("gallery, cover_image").eq("id", id).maybeSingle();
    throwIfError(readErr);
    const row = cur as { gallery?: string[]; cover_image?: string } | null;
    const gallery = (row?.gallery ?? []).filter((u: string) => u !== url);
    const patch: Record<string, unknown> = { gallery };
    if (row?.cover_image === url) patch.cover_image = gallery[0] ?? null;
    const { error } = await sb.from("businesses").update(patch as TablesUpdate<"businesses">).eq("id", id);
    throwIfError(error);
    return { ok: true };
  },

  async setCoverPhoto(id: string, url: string) {
    const sb = getSupabase();
    const { error } = await sb.from("businesses").update({ cover_image: url }).eq("id", id);
    throwIfError(error);
    return { ok: true };
  },

  // Dashboard analytics
  async analytics(id: string): Promise<BusinessAnalytics> {
    const sb = getSupabase();
    const [bizRes, viewsRes, leadsRes, qnaRes] = await Promise.all([
      sb.from("businesses").select("view_count, call_count, directions_count, rating_count").eq("id", id).maybeSingle(),
      sb.from("business_view_logs").select("viewed_at").eq("business_id", id).gte("viewed_at", sevenDaysAgoIso()),
      sb.from("leads").select("created_at").eq("business_id", id).gte("created_at", sevenDaysAgoIso()),
      sb.from("business_qna").select("*", { count: "exact", head: true }).eq("business_id", id),
    ]);
    throwIfError(bizRes.error);
    throwIfError(leadsRes.error);
    throwIfError(qnaRes.error);
    const b = (bizRes.data ?? {}) as Record<string, number>;
    return {
      views: b.view_count ?? 0,
      calls: b.call_count ?? 0,
      directions: b.directions_count ?? 0,
      catalogViews: 0,
      reviews: b.rating_count ?? 0,
      questions: qnaRes.count ?? 0,
      viewsSeries: dailyBuckets((viewsRes.data ?? []).map((r: any) => r.viewed_at)),
      leadsSeries: dailyBuckets((leadsRes.data ?? []).map((r: any) => r.created_at)),
    };
  },

  // Q&A, reservations, leads
  async qna(id: string): Promise<import("@/types").QnaItem[]> {
    const sb = getSupabase();
    const uid = await currentUserId();
    const { data, error } = await sb
      .from("business_qna")
      .select("id, business_id, question, answer, upvotes, created_at, asker:users!asker_user_id(name, alias, show_name_publicly)")
      .eq("business_id", id)
      .order("created_at", { ascending: false })
      .limit(50);
    throwIfError(error);
    const rows = data ?? [];

    let upvotedIds = new Set<string>();
    if (uid && rows.length > 0) {
      const { data: mine } = await sb
        .from("qna_upvotes")
        .select("qna_id")
        .eq("user_id", uid)
        .in("qna_id", rows.map((q: any) => q.id));
      upvotedIds = new Set((mine ?? []).map((r: any) => r.qna_id));
    }

    return rows.map((q: any) => ({
      id: q.id,
      businessId: q.business_id,
      askerName: aliasName({ alias: q.asker?.alias, name: q.asker?.name, showNamePublicly: q.asker?.show_name_publicly }, "Customer"),
      question: q.question,
      answer: q.answer ?? undefined,
      askedAt: relDate(q.created_at),
      upvotes: q.upvotes ?? 0,
      upvoted: upvotedIds.has(q.id),
    }));
  },
  async askQuestion(id: string, question: string) {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw toApiError({ code: "UNAUTHENTICATED", message: "Sign in to ask a question" }, 401);
    const { error } = await sb.from("business_qna").insert({ business_id: id, asker_user_id: uid, question });
    throwIfError(error);
    return { ok: true };
  },
  async answerQuestion(qId: string, answer: string) {
    const sb = getSupabase();
    const { error } = await sb
      .from("business_qna")
      .update({ answer, answered_at: new Date().toISOString() })
      .eq("id", qId);
    throwIfError(error);
    return { ok: true };
  },
  /** Upvote an unanswered question — surfaces what visitors most want the owner to answer. */
  async upvoteQuestion(qId: string) {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw toApiError({ code: "UNAUTHENTICATED", message: "Sign in to upvote" }, 401);
    try { await sb.from("qna_upvotes").insert({ qna_id: qId, user_id: uid }); } catch { /* duplicate */ }
    const { count } = await sb.from("qna_upvotes").select("*", { count: "exact", head: true }).eq("qna_id", qId);
    await sb.from("business_qna").update({ upvotes: count ?? 0 }).eq("id", qId);
    return { ok: true };
  },
  async removeQuestionUpvote(qId: string) {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return { ok: true };
    await sb.from("qna_upvotes").delete().eq("qna_id", qId).eq("user_id", uid);
    const { count } = await sb.from("qna_upvotes").select("*", { count: "exact", head: true }).eq("qna_id", qId);
    await sb.from("business_qna").update({ upvotes: count ?? 0 }).eq("id", qId);
    return { ok: true };
  },
  /**
   * Toggle the shop's "open right now" presence (separate from bookable
   * working-hour slots). Mirrors providerService.setAvailability: turning ON
   * during off-hours sets an availableUntil expiry so it auto-clears.
   */
  async setAvailability(id: string, availableNow: boolean, availableUntil?: string | null) {
    const sb = getSupabase();
    const { error } = await sb
      .from("businesses")
      .update({ is_available_now: availableNow, available_until: availableNow ? availableUntil ?? null : null })
      .eq("id", id);
    throwIfError(error);
    return { ok: true, availableNow };
  },

  async leads(id: string) {
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
    const sb = getSupabase();
    const { error } = await sb.from("leads").update({ handled: true }).eq("id", leadId);
    throwIfError(error);
    return { ok: true };
  },
  async recordInteraction(id: string, kind: "CALL" | "DIRECTIONS" | "MESSAGE") {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (kind === "CALL" || kind === "DIRECTIONS") {
      await sb.rpc("bump_business_metric", { p_business_id: id, p_metric: kind === "CALL" ? "call" : "directions" });
    }
    if (uid) await sb.from("leads").insert({ business_id: id, from_user_id: uid, kind });
    return { ok: true };
  },
  async recordView(id: string) {
    const sb = getSupabase();
    await sb.rpc("bump_business_metric", { p_business_id: id, p_metric: "view" });
    return { ok: true };
  },
  async team(id: string): Promise<import("@/types").TeamMember[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("business_team_members")
      .select("id, name, phone, avatar, role")
      .eq("business_id", id)
      .order("created_at", { ascending: true });
    throwIfError(error);
    return (data ?? []) as import("@/types").TeamMember[];
  },
  async addTeamMember(businessId: string, member: { name: string; phone: string; role: "MANAGER" | "STAFF" }) {
    const sb = getSupabase();
    const { error } = await sb.from("business_team_members").insert({
      business_id: businessId,
      name: member.name,
      phone: member.phone,
      role: member.role,
    });
    throwIfError(error);
    return { ok: true };
  },
  async removeTeamMember(memberId: string) {
    const sb = getSupabase();
    const { error } = await sb.from("business_team_members").delete().eq("id", memberId);
    throwIfError(error);
    return { ok: true };
  },

  async buyBoost(id: string, boostType: string) {
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
    await sb.from("businesses").update({ is_boosted: true, boosted_until: endsAt, boost_reminder_sent: false }).eq("id", id);
    return { ok: true, boostType };
  },

  /** Marks the one-time "boost expires soon" reminder as shown, so it isn't repeated every dashboard visit. */
  async markBoostReminderSent(id: string) {
    const sb = getSupabase();
    await sb.from("businesses").update({ boost_reminder_sent: true }).eq("id", id);
  },

  async activeBoosts(id: string): Promise<string[]> {
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
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw toApiError({ code: "UNAUTHENTICATED" }, 401);
    // One review per user: update the existing one instead of adding a duplicate.
    const { data: existing } = await sb
      .from("ratings")
      .select("id")
      .eq("rater_user_id", uid)
      .eq("ratee_type", "BUSINESS")
      .eq("ratee_id", id)
      .maybeSingle();
    // A real completed appointment proves this reviewer actually booked here.
    const { count: bookingCount } = await sb
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .eq("customer_user_id", uid)
      .eq("target_type", "BUSINESS")
      .eq("target_id", id)
      .eq("status", "COMPLETED");
    const isVerifiedBooking = (bookingCount ?? 0) > 0;
    if (existing?.id) {
      const { error } = await sb.from("ratings").update({ rating, comment: comment || null, is_verified_booking: isVerifiedBooking }).eq("id", existing.id);
      throwIfError(error);
      return;
    }
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
      is_verified_booking: isVerifiedBooking,
    });
    throwIfError(error);
    if ((existingCount ?? 0) === 0) {
      const { data: biz } = await sb.from("businesses").select("owner_user_id").eq("id", id).maybeSingle();
      if (biz?.owner_user_id) void leaderboardService.addPoints(biz.owner_user_id, 3);
    }
  },
};
