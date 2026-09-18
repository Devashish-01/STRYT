/** `created_at` is nullable in most tables, and this has always been handed those nulls: `new Date(null)`
 *  is the epoch, so a row without a timestamp reads as 1970. That is preserved here, not introduced —
 *  see P12-002 for the question of what it should show instead. */
function relDate(iso: string | null): string {
  const d = Math.floor((Date.now() - new Date(iso ?? 0).getTime()) / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 30) return `${Math.floor(d / 7)} week${Math.floor(d / 7) > 1 ? "s" : ""} ago`;
  return `${Math.floor(d / 30)} month${Math.floor(d / 30) > 1 ? "s" : ""} ago`;
}

// Bucket ISO timestamps into a 7-element series (oldest → newest day).
function providerDailyBuckets(isoDates: (string | null)[]): number[] {
  const buckets = [0, 0, 0, 0, 0, 0, 0];
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  for (const iso of isoDates) {
    const dayIdx = 6 - Math.floor((startOfToday.getTime() - new Date(iso ?? 0).getTime()) / 86400000);
    if (dayIdx >= 0 && dayIdx <= 6) buckets[dayIdx]++;
  }
  return buckets;
}

import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import type { TablesInsert, TablesUpdate } from "@/lib/dbTypes";
import { throwIfError, toApiError } from "@/lib/supabasePage";
import { toCamel, toSnake } from "@/lib/caseMap";
import type { Provider, PortfolioItem, Review, CatalogItem } from "@/types";
import { getRelatableProviderAvatar, enrichProviderPortfolio } from "@/lib/curatedImages";
import { aliasName } from "@/lib/publicName";
import { haversineKm } from "@/lib/geocode";
import { config } from "@/config";
import { DEFAULT_MOCK_WORKING_HOURS } from "@/utils/availability";
import { PLACEHOLDER_PROVIDER_AVATAR, PLACEHOLDER_PORTFOLIO_IMAGE } from "@/lib/placeholders";
import { uploadService } from "@/services/core/uploadService";
import { leadText } from "@/lib/leadText";

// Columns on the providers table; everything else (portfolio, distanceKm…) stripped.
const PROVIDER_COLUMNS = new Set([
  "userId","displayName","categoryId","categoryName","subCategory","bio","avatar",
  "lat","lng","serviceRadiusKm","startingPrice","availabilityNote","status","isVerified",
  "ratingAvg","ratingCount","jobsDone","responseTime","isNew","skills","phone",
  "verificationStatus","verificationDocumentUrl","paymentTiming","depositPercent",
  "email","upiId","showPhonePublicly","showEmailPublicly","locationPublic",
  "isOpenNow","isAvailableNow","availableUntil","packageKey","bookingsEnabled",
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

export interface EarningEntry {
  id: string;
  amount: number;
  tip: number;
  mode: string;
  note: string;
  date: string;         // human label
  createdAtISO: string; // raw timestamp for sorting
  agreementId: string;
}

// get(id) is independently re-fetched by every provider manage-console screen
// for the SAME provider (Today, Jobs, Money, Portfolio, Availability, Profile
// editor, Settings, ...) plus the public ProviderDetail page — same
// coalescing pattern as businessService.get. Keyed on lat/lng too since those
// change the returned distanceKm.
const inFlightProviderGet = new Map<string, Promise<Provider | undefined>>();

/** Drop coalesced in-flight GETs after a mutation so refetch can't reuse pre-write data. */
export function bustProviderGetCache(id: string) {
  for (const key of [...inFlightProviderGet.keys()]) {
    if (key.startsWith(`${id}:`)) inFlightProviderGet.delete(key);
  }
}

export const providerService = {
  async mine(): Promise<Provider[]> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return [];
    const { data, error } = await sb.from("providers").select("*, portfolio:portfolio_items(*)").eq("user_id", uid).order("sort_order", { referencedTable: "portfolio_items", ascending: true });
    throwIfError(error);
    const provs = toCamel<Provider[]>(data ?? []);
    return provs.map((prov) => ({
      ...prov,
      avatar: getRelatableProviderAvatar(prov),
      portfolio: enrichProviderPortfolio(prov.id, prov.portfolio ?? []),
    }));
  },
  async get(id: string, lat?: number, lng?: number): Promise<Provider | undefined> {
    const key = `${id}:${lat ?? ""}:${lng ?? ""}`;
    const inFlight = inFlightProviderGet.get(key);
    if (inFlight) return inFlight;
    const promise = providerService._getUncoalesced(id, lat, lng).finally(() => inFlightProviderGet.delete(key));
    inFlightProviderGet.set(key, promise);
    return promise;
  },

  async _getUncoalesced(id: string, lat?: number, lng?: number): Promise<Provider | undefined> {
    const sb = getSupabase();
    const { data, error } = await sb.from("providers").select("*, portfolio:portfolio_items(*), catalog:catalog_items(*)").eq("id", id).order("sort_order", { referencedTable: "portfolio_items", ascending: true }).maybeSingle();
    throwIfError(error);
    if (!data) return undefined;
    const prov = toCamel<Provider>(data);
    prov.avatar = getRelatableProviderAvatar(prov);
    prov.portfolio = enrichProviderPortfolio(prov.id, prov.portfolio ?? []);
    prov.distanceKm = (lat && lng && prov.lat && prov.lng) ? haversineKm(lat, lng, prov.lat, prov.lng) : 0;
    return prov;
  },
  async reviews(id: string): Promise<Review[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("ratings")
      .select("id, rating, comment, created_at, is_verified_booking, owner_reply, hidden_at, rater:users!rater_user_id(name, alias, avatar, show_name_publicly)")
      .eq("ratee_type", "PROVIDER")
      .eq("ratee_id", id)
      .order("created_at", { ascending: false })
      .limit(30);
    throwIfError(error);
    return (data ?? []).map((r) => ({
      id: r.id,
      raterName: aliasName({ alias: r.rater?.alias, name: r.rater?.name, showNamePublicly: r.rater?.show_name_publicly }, "Anonymous"),
      raterAvatar: r.rater?.avatar ?? "",
      rating: r.rating,
      comment: r.comment ?? "",
      date: relDate(r.created_at),
      isVerifiedBooking: !!r.is_verified_booking,
      ownerReply: r.owner_reply ?? undefined,
      hiddenAt: r.hidden_at ?? null,
    }));
  },
  async update(id: string, patch: Partial<Provider>) {
    const sb = getSupabase();
    const cols = pickColumns(patch as Record<string, unknown>, PROVIDER_COLUMNS);
    const { data, error } = await sb.from("providers").update(toSnake(cols)).eq("id", id).select().maybeSingle();
    throwIfError(error);
    if (!data) throw new Error("Couldn't save — you may not have permission to change this.");
    bustProviderGetCache(id);
    return toCamel<Provider>(data);
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
      .from("providers")
      .update({
        verification_status: "UNDER_REVIEW",
        verification_documents: paths,
        verification_document_url: paths[0],
        verification_reason: null,
      })
      .eq("id", id);
    throwIfError(error);
    bustProviderGetCache(id);
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
    // lat/lng aren't selectable via a plain query anymore (ISS-009) —
    // get_own_coords() is a SECURITY DEFINER RPC scoped to auth.uid().
    const [{ data: me }, { data: coords }] = await Promise.all([
      sb.from("users").select("name").eq("id", uid).maybeSingle(),
      sb.rpc("get_own_coords").maybeSingle(),
    ]);
    if (!row["display_name"]) {
      row["display_name"] = (me as any)?.name || "Provider";
    }
    if (row["lat"] === undefined || row["lat"] === null) {
      row["lat"] = (coords as any)?.lat ?? null;
    }
    if (row["lng"] === undefined || row["lng"] === null) {
      row["lng"] = (coords as any)?.lng ?? null;
    }
    const { data: created, error } = await sb.from("providers").insert(row as TablesInsert<"providers">).select().maybeSingle();
    if (error) {
      // idx_providers_one_per_user (UNIQUE on user_id) is the real boundary —
      // this turns a missed entry point or a two-tab race into a friendly
      // message instead of a raw driver error.
      if (error.code === "23505" || /idx_providers_one_per_user/i.test(error.message ?? "")) {
        throw new Error("You already have a provider profile — manage it instead of creating a new one.");
      }
      throwIfError(error);
    }
    return toCamel<Provider>(created);
  },
  // Catalog — same table/shape as businessService's, scoped by provider_id
  // instead of business_id. Packages (provider_packages) were retired in
  // favor of one catalog concept shared by both entity types.
  async addCatalogItem(id: string, item: Partial<CatalogItem>) {
    const sb = getSupabase();
    const row = { ...toSnake(item), provider_id: id };
    const { data, error } = await sb.from("catalog_items").insert(row).select().maybeSingle();
    throwIfError(error);
    bustProviderGetCache(id);
    return toCamel<CatalogItem>(data);
  },
  async updateCatalogItem(id: string, itemId: string, patch: Partial<CatalogItem>) {
    const sb = getSupabase();
    const { data, error } = await sb.from("catalog_items").update(toSnake(patch)).eq("id", itemId).select();
    throwIfError(error);
    if (!data || data.length === 0) throw new Error("Couldn't save — you may not have permission to change this.");
    bustProviderGetCache(id);
    return toCamel<CatalogItem>(data[0]);
  },
  async deleteCatalogItem(id: string, itemId: string) {
    const sb = getSupabase();
    const { data, error } = await sb.from("catalog_items").delete().eq("id", itemId).select("id");
    throwIfError(error);
    if (!data || data.length === 0) throw new Error("Couldn't remove — you may not have permission, or it was already removed.");
    bustProviderGetCache(id);
    return { ok: true };
  },
  /** Bump the provider profile view counter (fire-and-forget). */
  async recordView(id: string) {
    const sb = getSupabase();
    // bump_provider_views is for signed-in viewers only; a guest call is a 401 on every provider page (E2E-003).
    // Same rule as businessService.recordView.
    const uid = await currentUserId();
    if (uid) {
      await sb.rpc("bump_provider_views", { p_provider_id: id });
    }
    return { ok: true };
  },
  /** Log a trackable interaction (call/message) so it shows up in the leads trend. */
  async recordInteraction(id: string, kind: "CALL" | "MESSAGE") {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (uid) await sb.from("leads").insert({ provider_id: id, from_user_id: uid, kind });
    return { ok: true };
  },
  async addPortfolio(id: string, item: Partial<PortfolioItem>) {
    const sb = getSupabase();
    const row = { ...toSnake(item), provider_id: id };
    const { data, error } = await sb.from("portfolio_items").insert(row).select().maybeSingle();
    throwIfError(error);
    bustProviderGetCache(id);
    return toCamel<PortfolioItem>(data);
  },

  async deletePortfolio(providerId: string, itemId: string) {
    const sb = getSupabase();
    const { data, error } = await sb.from("portfolio_items").delete().eq("id", itemId).select("id");
    throwIfError(error);
    if (!data || data.length === 0) throw new Error("Couldn't remove — you may not have permission, or it was already removed.");
    bustProviderGetCache(providerId);
    return { ok: true };
  },

  async updatePortfolio(providerId: string, itemId: string, patch: Partial<PortfolioItem>) {
    const sb = getSupabase();
    const { data, error } = await sb.from("portfolio_items").update(toSnake(patch)).eq("id", itemId).select();
    throwIfError(error);
    if (!data || data.length === 0) throw new Error("Couldn't save — you may not have permission to change this.");
    bustProviderGetCache(providerId);
    return toCamel<PortfolioItem>(data[0]);
  },
  async setAvailability(id: string, availableNow: boolean, hoursOrUntil?: number | string) {
    const sb = getSupabase();
    const availableUntil = availableNow && hoursOrUntil
      ? (typeof hoursOrUntil === "string"
          ? hoursOrUntil
          : new Date(Date.now() + hoursOrUntil * 3600 * 1000).toISOString())
      : null;
    const patch: Record<string, any> = { is_available_now: availableNow, available_until: availableUntil };

    const { data: prov } = await sb.from("providers").select("user_id, lat, lng").eq("id", id).maybeSingle();
    if (prov && (prov.lat == null || prov.lng == null) && prov.user_id) {
      // get_own_coords() is scoped to auth.uid() — correct here because only
      // the provider's own owner can reach this call (enforced by the
      // providers UPDATE RLS policy just below), see ISS-009.
      const { data: usr } = await sb.rpc("get_own_coords").maybeSingle() as { data: { lat: number | null; lng: number | null } | null };
      if (usr && usr.lat != null && usr.lng != null) {
        patch.lat = usr.lat;
        patch.lng = usr.lng;
      }
    }

    const { data, error } = await sb
      .from("providers")
      .update(patch as TablesUpdate<"providers">)
      .eq("id", id)
      .select("id");
    throwIfError(error);
    if (!data || data.length === 0) {
      throw new Error("Couldn't save — you may not have permission to change this.");
    }
    bustProviderGetCache(id);
    return { ok: true, availableNow, hoursOrUntil };
  },
  async leads(id: string) {
    const sb = getSupabase();
    // provider_leads() (20260972) returns the sender's phone only when they share it.
    // Don't embed users.phone here: the raw number would reach the browser even when
    // hidden, and users.phone is being locked to the owner (supabase/pending/).
    const { data, error } = await sb.rpc("provider_leads", { p_provider_id: id });
    throwIfError(error);
    return (data ?? []).map((l) => ({
      id: l.id,
      providerId: l.provider_id,
      fromUserId: l.from_user_id,
      kind: l.kind,
      name: l.from_name ?? "Someone",
      avatar: l.from_avatar ?? "",
      phone: l.from_phone ?? undefined,
      text: leadText(l.kind, l.note),
      time: relDate(l.created_at),
      handled: l.handled,
    }));
  },
  async markLeadHandled(leadId: string, handled = true) {
    const sb = getSupabase();
    const { data, error } = await sb.from("leads").update({ handled }).eq("id", leadId).select("id");
    throwIfError(error);
    if (!data || data.length === 0) throw new Error("Couldn't update this reachout — you may not have permission.");
    return { ok: true };
  },
  async analytics(id: string): Promise<ProviderAnalytics> {
    const sb = getSupabase();
    // Resolve the provider's owning user to scope proposals/agreements/settlements.
    const provRes = await sb.from("providers").select("user_id, view_count, jobs_done").eq("id", id).maybeSingle();
    throwIfError(provRes.error);
    const prov = (provRes.data ?? {}) as { user_id?: string; view_count?: number; jobs_done?: number };
    const uid = prov.user_id ?? "__none__";
    const sevenAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
    const [leadsCntRes, leadsSerRes, proposalsRes, acceptedRes, settleRes, apptRes, viewsSerRes] = await Promise.all([
      sb.from("leads").select("*", { count: "exact", head: true }).eq("provider_id", id),
      sb.from("leads").select("created_at").eq("provider_id", id).gte("created_at", sevenAgo),
      sb.from("proposals").select("*", { count: "exact", head: true }).eq("responder_user_id", uid),
      sb.from("agreements").select("*", { count: "exact", head: true }).eq("responder_user_id", uid).in("status", ["ACTIVE", "COMPLETED"]),
      sb.from("settlements").select("amount").eq("user_id", uid),
      // appointments has no `price`: the amount actually paid is payment_amount, the listed price package_price (E2E-006).
      sb.from("appointments").select("payment_amount, package_price").eq("target_id", id).eq("payment_status", "PAID"),
      sb.from("provider_view_logs").select("viewed_at").eq("provider_id", id).gte("viewed_at", sevenAgo),
    ]);
    const settleEarnings = (settleRes.data ?? []).reduce((sum: number, s: any) => sum + (s.amount ?? 0), 0);
    throwIfError(apptRes.error);
    const apptEarnings = (apptRes.data ?? []).reduce((sum: number, a: any) => sum + Number(a.payment_amount ?? a.package_price ?? 0), 0);
    const earnings = settleEarnings + apptEarnings;
    return {
      views: prov.view_count ?? 0,
      leads: leadsCntRes.count ?? 0,
      proposalsSent: proposalsRes.count ?? 0,
      accepted: acceptedRes.count ?? 0,
      jobsDone: prov.jobs_done ?? 0,
      earnings,
      viewsSeries: providerDailyBuckets((viewsSerRes.data ?? []).map((r) => r.viewed_at)),
      leadsSeries: providerDailyBuckets((leadsSerRes.data ?? []).map((r) => r.created_at)),
    };
  },

  /**
   * Dated settlement history behind the "Earned (offline)" total — combines
   * custom agreement settlements and direct paid appointment bookings.
   * Feeds the Money screen's ledger.
   */
  async earningsLedger(id: string): Promise<EarningEntry[]> {
    const sb = getSupabase();
    const provRes = await sb.from("providers").select("user_id").eq("id", id).maybeSingle();
    throwIfError(provRes.error);
    const uid = (provRes.data as { user_id?: string } | null)?.user_id;
    if (!uid) return [];
    const [settleRes, apptRes] = await Promise.all([
      sb.from("settlements")
        .select("id, amount, tip, mode, note, created_at, agreement_id")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(100),
      sb.from("appointments")
        .select("id, payment_amount, package_price, payment_method, customer_name, package_name, created_at")
        .eq("target_id", id)
        .eq("payment_status", "PAID")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    throwIfError(settleRes.error);
    throwIfError(apptRes.error);

    const settleEntries: EarningEntry[] = (settleRes.data ?? []).map((s) => ({
      id: s.id,
      amount: s.amount ?? 0,
      tip: s.tip ?? 0,
      mode: s.mode ?? "CASH",
      note: s.note ?? "",
      date: s.created_at ? relDate(s.created_at) : "",
      createdAtISO: s.created_at ?? "",
      agreementId: s.agreement_id ?? "",
    }));

    const apptEntries: EarningEntry[] = (apptRes.data ?? []).map((a) => ({
      id: a.id,
      amount: Number(a.payment_amount ?? a.package_price ?? 0),
      tip: 0,
      mode: a.payment_method || "CASH",
      note: [a.customer_name, a.package_name].filter(Boolean).join(" • ") || "Appointment booking",
      date: a.created_at ? relDate(a.created_at) : "",
      createdAtISO: a.created_at ?? "",
      agreementId: "",
    }));

    const combined = [...settleEntries, ...apptEntries].sort(
      (a, b) => new Date(b.createdAtISO).getTime() - new Date(a.createdAtISO).getTime()
    );
    return combined.slice(0, 100);
  },

  /** Submit a star rating + comment for a provider. Trigger recomputes rating_avg/count. */
  /** Several providers in one query (LIST-3). */
  async byIds(ids: string[]): Promise<Provider[]> {
    if (ids.length === 0) return [];
    const sb = getSupabase();
    const { data, error } = await sb.from("providers").select("*").in("id", ids);
    throwIfError(error);
    return toCamel<Provider[]>(data ?? []);
  },

  /** This viewer's own review of a provider, so the review sheet opens on what they wrote last time (CRAT-8). */
  async myReview(id: string): Promise<{ rating: number; comment: string } | null> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return null;
    const { data } = await sb
      .from("ratings")
      .select("rating, comment")
      .eq("rater_user_id", uid)
      .eq("ratee_type", "PROVIDER")
      .eq("ratee_id", id)
      .maybeSingle();
    return data ? { rating: (data as any).rating, comment: (data as any).comment ?? "" } : null;
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
      .eq("ratee_type", "PROVIDER")
      .eq("ratee_id", id)
      .maybeSingle();
    // A real completed appointment proves this reviewer actually booked here.
    const { count: bookingCount } = await sb
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .eq("customer_user_id", uid)
      .eq("target_type", "PROVIDER")
      .eq("target_id", id)
      .eq("status", "COMPLETED");
    const isVerifiedBooking = (bookingCount ?? 0) > 0;
    if (existing?.id) {
      const { error } = await sb.from("ratings").update({ rating, comment: comment || null, is_verified_booking: isVerifiedBooking }).eq("id", existing.id);
      throwIfError(error);
      bustProviderGetCache(id);
      return;
    }
    const { error } = await sb.from("ratings").insert({
      rater_user_id: uid,
      ratee_type: "PROVIDER",
      ratee_id: id,
      rating,
      comment: comment || null,
      is_verified_booking: isVerifiedBooking,
    });
    throwIfError(error);
    bustProviderGetCache(id);
  },

  /** Reply to a customer review as the provider. */
  async replyToReview(ratingId: string, reply: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.rpc("reply_to_rating", { p_rating_id: ratingId, p_reply: reply });
    throwIfError(error);
  },
};
