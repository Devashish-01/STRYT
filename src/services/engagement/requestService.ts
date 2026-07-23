import type { Page } from "@/lib/apiClient";
import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import { cursorToRange, throwIfError, toApiError } from "@/lib/supabasePage";
import { toCamel, toSnake } from "@/lib/caseMap";
import type { RequestPost, Proposal, Agreement, ProposalCounter } from "@/types";
import { leaderboardService } from "@/services/marketplace/leaderboardService";
import { clampRadiusForViewer, isGuestMode } from "@/lib/guestMode";
import { firstName, aliasName } from "@/lib/publicName";
import { notificationService } from "@/services/engagement/notificationService";

// Columns that exist on the requests table.
const REQUEST_COLUMNS = new Set([
  "requesterUserId","title","description","categoryId","categoryName","subCategory","budgetMin",
  "budgetMax","area","lat","lng","radiusKm","deadline","status","isBoosted","viewCount",
  "photos","meTooCount","isGroupBuy","groupBuyTarget","isUrgent","isRecurring",
  "isAnonymous","expiresInHrs","expiresAt",
]);
const PROPOSAL_COLUMNS = new Set([
  "requestId","responderUserId","responderType","responderEntityId","responderTagline","price","message",
  "eta","status","isBoosted","broadcastToMetoo",
]);

function pickColumns<T extends Record<string, unknown>>(obj: T, allowed: Set<string>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (allowed.has(k) && v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

// Join requester user info, proposal responder ratings, and counter-offer history.
const REQUEST_SELECT =
  "*, requester:users!requester_user_id(name, alias, avatar, rating_avg, show_name_publicly), proposals:proposals(*, responder:users!responder_user_id(rating_avg), counters:proposal_counters(id, by_user_id, amount, message, created_at))";

/**
 * Same as REQUEST_SELECT minus the `proposal_counters` embed.
 *
 * `proposal_counters` is the private price-negotiation history between a
 * requester and one responder, and `anon` has no SELECT grant on it — so
 * embedding it made the whole guest request feed 401 ("permission denied for
 * table proposal_counters"), taking the visible requests down with it.
 *
 * The fix is to not ask for it rather than to grant anon access: a signed-out
 * browser is looking at open requests, not negotiating one, so haggling history
 * is data they have no need for. (Granting would also have been near-pointless —
 * proposal_counters' RLS is scoped to the two parties, so anon would read zero
 * rows anyway — but the grant itself is the wrong signal to leave in the schema.)
 */
const REQUEST_SELECT_PUBLIC =
  "*, requester:users!requester_user_id(name, alias, avatar, rating_avg, show_name_publicly), proposals:proposals(*, responder:users!responder_user_id(rating_avg))";

function requestSelect(): string {
  return isGuestMode() ? REQUEST_SELECT_PUBLIC : REQUEST_SELECT;
}

// ── Row mappers ───────────────────────────────────────────────────────────────

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

function rowToProposal(row: any, requesterUserId = ""): Proposal {
  const responderRating = Number(row.responder?.rating_avg ?? 0);
  const { responder: _r, counters: rawCounters, ...rest } = row;
  const counters: ProposalCounter[] = (rawCounters ?? [])
    .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((c: any): ProposalCounter => ({
      id: c.id,
      by: c.by_user_id === requesterUserId ? "requester" : "responder",
      amount: c.amount,
      message: c.message ?? "",
      time: timeAgo(c.created_at),
    }));
  return {
    ...toCamel<Proposal>(rest),
    responderRating,
    postedAt: timeAgo(row.created_at),
    counters,
  };
}

function rowToRequest(row: any, userLat = 0, userLng = 0): RequestPost {
  const requester = row.requester ?? {};
  const { requester: _req, proposals: rawProposals, ...rest } = row;
  const base = toCamel<RequestPost>(rest);
  return {
    ...base,
    // #6 privacy: show the requester's first name publicly; "Someone nearby" if posted anonymously.
    // Anonymous must hide the avatar too — a real face next to "Someone nearby"
    // de-anonymises the poster to anyone who knows them.
    requesterName:   row.is_anonymous ? "Someone nearby" : aliasName({ alias: requester.alias, name: requester.name, showNamePublicly: requester.show_name_publicly }),
    requesterAvatar: row.is_anonymous ? "" : (requester.avatar ?? ""),
    requesterRating: Number(requester.rating_avg ?? 0),
    postedAt:        timeAgo(row.created_at),
    distanceKm:      (userLat && userLng && row.lat && row.lng)
                       ? haversineKm(userLat, userLng, row.lat, row.lng)
                       : 0,
    photos:    Array.isArray(row.photos) ? row.photos : [],
    proposals: (rawProposals ?? []).map((p: any) => rowToProposal(p, row.requester_user_id)),
  };
}

function makePage<T>(rows: T[], count: number | null, from: number, limit: number): import("@/lib/apiClient").Page<T> {
  const nextStart = from + rows.length;
  const hasMore = count != null ? nextStart < count : rows.length === limit;
  return {
    data: rows,
    page: { next_cursor: hasMore ? String(nextStart) : null, has_more: hasMore },
  };
}

/** Map a DB agreements row (with nested requester/responder user objects) → Agreement. */
function mapAgreement(row: any): Agreement {
  return {
    id: row.id,
    requestId: row.request_id,
    requestTitle: row.request_title ?? "Agreement",
    proposalId: row.proposal_id,
    requesterUserId: row.requester_user_id,
    responderUserId: row.responder_user_id,
    requesterName: row.requester?.name ?? "Requester",
    requesterAvatar: row.requester?.avatar ?? "",
    responderName: row.responder?.name ?? "Responder",
    responderAvatar: row.responder?.avatar ?? "",
    agreedPrice: row.agreed_price,
    terms: row.terms ?? "",
    scheduledFor: row.scheduled_for ?? "",
    requesterConfirmed: row.requester_confirmed ?? false,
    responderConfirmed: row.responder_confirmed ?? false,
    paymentMode: row.payment_mode ?? "OFFLINE",
    status: row.status,
    createdAt: row.created_at ?? undefined,
    requestArea: (row.req as any)?.area ?? undefined,
    providerLat: row.provider_lat ?? undefined,
    providerLng: row.provider_lng ?? undefined,
    liveStatus: (row.live_status as any) ?? undefined,
    trackingToken: row.tracking_token ?? undefined,
    paymentMethod: row.payment_method ?? null,
    paymentStatus: (row.payment_status as any) ?? "UNPAID",
    paymentAmount: row.payment_amount ?? null,
    paymentReference: row.payment_reference ?? null,
    disputeReason: row.dispute_reason ?? null,
  };
}

// Select string that joins requester + responder user profiles and the originating request's area.
const AGREEMENT_SELECT =
  "*, requester:users!requester_user_id(name, avatar), responder:users!responder_user_id(name, avatar), req:requests!request_id(area)";

// The expiry sweeps used to run as TWO serial RPCs on EVERY feed/get/mine/
// agreements call — pure latency tax on each screen open. A ≤2-min stale
// window is invisible to users, so throttle: first call per window pays one
// parallel round-trip, the rest are free.
let lastSweepAt = 0;
async function sweepExpired(sb: ReturnType<typeof getSupabase>): Promise<void> {
  if (Date.now() - lastSweepAt < 120_000) return;
  lastSweepAt = Date.now();
  await Promise.all([
    sb.rpc("cancel_expired_agreements"),
    sb.rpc("close_expired_requests"),
  ]).catch(() => { lastSweepAt = 0; /* retry next call */ });
}

export const requestService = {
  async feed(p: { category?: string; cursor?: string | null; special?: string; lat?: number; lng?: number; radiusKm?: number } = {}): Promise<Page<RequestPost>> {
    const sb = getSupabase();
    await sweepExpired(sb);
    const { from, to, limit } = cursorToRange(p.cursor);
    let q = sb.from("requests").select(requestSelect(), { count: "exact" }).in("status", ["OPEN", "AGREED"]);
    if (p.category)              q = q.eq("category_name", p.category);
    if (p.special === "urgent")  q = q.eq("is_urgent", true);
    if (p.special === "group")   q = q.eq("is_group_buy", true);
    if (p.special === "recurring") q = q.eq("is_recurring", true);
    const { data, error, count } = await q.order("created_at", { ascending: false }).range(from, to);
    throwIfError(error);

    const saved = localStorage.getItem("settings_radius");
    // Clamped last so a guest stays pinned to 1 km regardless of the caller's
    // radiusKm or a settings_radius left behind by a signed-in session on this
    // device. Non-guests are unaffected.
    const radiusLimit = clampRadiusForViewer(p.radiusKm ?? (saved ? parseFloat(saved) : 5)) ?? 5;

    let rows = (data ?? []).map((r: any) => rowToRequest(r, p.lat, p.lng));
    if (p.lat && p.lng) {
      // A request is only visible within the SMALLER of (a) the viewer's own
      // radius preference and (b) the radius the poster chose for that post —
      // the poster's broadcast boundary is a hard cap, not just a suggestion.
      rows = rows.filter((r) => {
        const postCap = r.radiusKm ? Math.min(radiusLimit, r.radiusKm) : radiusLimit;
        return r.distanceKm <= postCap;
      });
    }
    return makePage(rows, count, from, limit);
  },

  async mine(userLat = 0, userLng = 0): Promise<RequestPost[]> {
    const sb = getSupabase();
    await sweepExpired(sb);
    const uid = await currentUserId();
    if (!uid) return [];
    const { data, error } = await sb
      .from("requests")
      .select(requestSelect())
      .eq("requester_user_id", uid)
      .order("created_at", { ascending: false });
    throwIfError(error);
    return (data ?? []).map((r: any) => rowToRequest(r, userLat, userLng));
  },

  async get(id: string, userLat = 0, userLng = 0): Promise<RequestPost | undefined> {
    const sb = getSupabase();
    await sweepExpired(sb);
    const { data, error } = await sb.from("requests").select(requestSelect()).eq("id", id).maybeSingle();
    throwIfError(error);
    return data ? rowToRequest(data as any, userLat, userLng) : undefined;
  },

  async create(data: Partial<RequestPost>) {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw toApiError({ code: "UNAUTHENTICATED", message: "Sign in to post a request" }, 401);
    const cols = pickColumns(data as Record<string, unknown>, REQUEST_COLUMNS);
    const row = { ...toSnake(cols), requester_user_id: uid, status: "OPEN" };
    const { data: created, error } = await sb.from("requests").insert(row).select().maybeSingle();
    throwIfError(error);
    void leaderboardService.addPoints(uid, 2);
    return toCamel<RequestPost>(created);
  },

  async update(id: string, data: Partial<RequestPost>): Promise<RequestPost> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw toApiError({ code: "UNAUTHENTICATED" }, 401);
    const cols = pickColumns(data as Record<string, unknown>, REQUEST_COLUMNS);
    const { data: updated, error } = await sb.from("requests").update(toSnake(cols)).eq("id", id).eq("requester_user_id", uid).select().maybeSingle();
    throwIfError(error);
    return toCamel<RequestPost>(updated);
  },

  async delete(id: string): Promise<void> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw toApiError({ code: "UNAUTHENTICATED" }, 401);
    const { error } = await sb.from("requests").delete().eq("id", id).eq("requester_user_id", uid);
    throwIfError(error);
  },

  async submitProposal(requestId: string, data: Partial<Proposal>) {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw toApiError({ code: "UNAUTHENTICATED", message: "Sign in to send a proposal" }, 401);
    const cols = pickColumns(data as Record<string, unknown>, PROPOSAL_COLUMNS);

    // A normal user responds under their first name (public identity); a
    // business/provider responds under its own public name/avatar. The
    // claimed entity id is client-supplied, so ownership is verified here
    // (not trusted at face value) before it's allowed to override the name —
    // otherwise anyone could pass another shop's id and impersonate it. A
    // business team member (scoped 'leads' access, or a FULL delegate) may
    // also respond as the business — checked via the same RPC the server-side
    // trigger (enforce_proposal_responder_entity_owner) ultimately enforces,
    // so this courtesy check never grants more than the DB actually allows.
    let responderType = (data.responderType as string) ?? "user";
    let responderEntityId = data.responderEntityId as string | undefined;
    let responderName: string | undefined;
    let responderAvatar: string | undefined;

    if (responderType !== "user" && responderEntityId) {
      const table = responderType === "business" ? "businesses" : "providers";
      const ownerCol = responderType === "business" ? "owner_user_id" : "user_id";
      const nameCol = responderType === "business" ? "name" : "display_name";
      const avatarCol = responderType === "business" ? "cover_image" : "avatar";
      const { data: entity } = await sb.from(table).select(`${ownerCol}, ${nameCol}, ${avatarCol}`).eq("id", responderEntityId).maybeSingle();
      let allowed = !!entity && (entity as any)[ownerCol] === uid;
      if (!allowed && entity && responderType === "business") {
        // Cast: my_business_access_scope isn't in the generated schema types (new RPC).
        const { data: scope } = await (sb.rpc as any)("my_business_access_scope", { p_business_id: responderEntityId });
        const row = Array.isArray(scope) ? scope[0] : scope;
        allowed = !!row && (row.access_level === "FULL" || (row.scopes ?? []).includes("leads"));
      }
      if (allowed && entity) {
        responderName = (entity as any)[nameCol] ?? undefined;
        responderAvatar = (entity as any)[avatarCol] ?? "";
      } else {
        responderType = "user";
        responderEntityId = undefined;
      }
    } else {
      responderType = "user";
      responderEntityId = undefined;
    }

    if (responderType === "user") {
      const { data: me } = await sb.from("users").select("name, avatar").eq("id", uid).maybeSingle();
      responderName = firstName((me as any)?.name);
      responderAvatar = (me as any)?.avatar ?? "";
    }

    const row = {
      ...toSnake(cols),
      request_id: requestId,
      responder_user_id: uid,
      responder_type: responderType,
      responder_entity_id: responderEntityId ?? null,
      responder_name: responderName ?? "Responder",
      responder_avatar: responderAvatar ?? "",
      status: "SUBMITTED",
    };
    const { data: created, error } = await sb.from("proposals").insert(row).select().maybeSingle();
    throwIfError(error);
    return toCamel<Proposal>(created);
  },

  /** Proposals sent as one business/provider entity (independent of who on the
   *  team actually submitted each one — shared team access means "Sent" must
   *  read the same for everyone managing that business, not just the original
   *  submitter), or — with no entityId — the signed-in user's own personal
   *  proposals sent as themselves. */
  async myProposals(entityId?: string): Promise<(Proposal & { requestTitle: string; requestStatus: string })[]> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return [];
    let q = sb.from("proposals")
      .select("*, request:requests!request_id(title, status)")
      .order("created_at", { ascending: false });
    q = entityId ? q.eq("responder_entity_id", entityId) : q.eq("responder_user_id", uid);
    const { data, error } = await q;
    throwIfError(error);
    return (data ?? []).map((row: any) => {
      const { request, ...rest } = row;
      return {
        ...rowToProposal(rest),
        requestTitle: request?.title ?? "Request",
        requestStatus: request?.status ?? "OPEN",
      };
    });
  },

  /** Retract a still-SUBMITTED quote (withdraw_proposal RPC) — the responder-only
   *  counterpart to a requester declining it, for a mis-quote sent too fast. */
  async withdrawProposal(proposalId: string): Promise<Proposal> {
    const sb = getSupabase();
    const { data, error } = await (sb.rpc as any)("withdraw_proposal", { p_proposal_id: proposalId });
    throwIfError(error);
    return rowToProposal(data);
  },

  async acceptProposal(proposalId: string) {
    const sb = getSupabase();
    // Atomic + owner-checked on the server (accept_proposal RPC): marks the
    // proposal ACCEPTED, creates the agreement, moves the request to
    // IN_PROGRESS and rejects sibling proposals — all in one transaction, so a
    // partial failure can no longer corrupt deal state. See
    // supabase/legacy/migration_launch_hardening.sql.
    const { data, error } = await sb.rpc("accept_proposal", { p_proposal_id: proposalId });
    throwIfError(error);
    return { agreementId: (data as string) ?? null, status: "PENDING" };
  },

  /** Accept the latest responder-authored counter by immutable counter ID. */
  async acceptProposalCounter(proposalId: string, counterId: string) {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("accept_proposal_counter", {
      p_proposal_id: proposalId,
      p_counter_id: counterId,
    });
    throwIfError(error);
    return { agreementId: (data as string) ?? null, status: "PENDING" };
  },

  /** Toggle "me too" on a request. Insert if not yet; delete if already done. */
  async meToo(requestId: string): Promise<{ ok: boolean; meTooed: boolean }> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw toApiError({ code: "UNAUTHENTICATED" }, 401);

    const { data: existing } = await sb
      .from("request_me_toos")
      .select("request_id")
      .eq("request_id", requestId)
      .eq("user_id", uid)
      .maybeSingle();

    if (existing) {
      await sb.from("request_me_toos").delete().eq("request_id", requestId).eq("user_id", uid);
      return { ok: true, meTooed: false };
    } else {
      await sb.from("request_me_toos").insert({ request_id: requestId, user_id: uid });
      return { ok: true, meTooed: true };
    }
    // The DB trigger handles me_too_count update automatically.
  },

  // ── Agreements ──────────────────────────────────────────────────────────────

  async agreements(): Promise<Agreement[]> {
    const sb = getSupabase();
    await sweepExpired(sb);
    const uid = await currentUserId();
    if (!uid) return [];
    const { data, error } = await sb
      .from("agreements")
      .select(AGREEMENT_SELECT)
      .or(`requester_user_id.eq.${uid},responder_user_id.eq.${uid}`)
      .order("created_at", { ascending: false });
    throwIfError(error);
    return (data ?? []).map(mapAgreement);
  },

  async getAgreement(id: string): Promise<Agreement | undefined> {
    const sb = getSupabase();
    await sweepExpired(sb);
    const { data, error } = await sb
      .from("agreements")
      .select(AGREEMENT_SELECT)
      .eq("id", id)
      .maybeSingle();
    throwIfError(error);
    return data ? mapAgreement(data) : undefined;
  },

  async confirmAgreement(id: string) {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw toApiError({ code: "UNAUTHENTICATED" }, 401);

    const { data, error } = await sb.rpc("agreement_confirm", { p_id: id });
    throwIfError(error);
    const row = data as any;
    return { ok: true, isRequester: row?.requester_user_id === uid };
  },

  async completeAgreement(id: string) {
    const sb = getSupabase();
    const uid = await currentUserId();
    // Server RPC validates the caller is the requester and the deal is in
    // REVIEW before completing, and releases any HELD escrow atomically —
    // replacing a raw update that any participant could call out of order.
    const { error } = await sb.rpc("agreement_complete", { p_id: id });
    throwIfError(error);
    if (uid) void leaderboardService.addPoints(uid, 5);
    return { ok: true, status: "COMPLETED" };
  },

  /**
   * Requester claims payment at the authoritative agreed price. Both UPI and
   * cash remain PENDING_CONFIRM until the responder verifies receipt.
   */
  async claimAgreementPayment(
    id: string,
    method: "UPI" | "CASH",
    amount?: number | null,
    reference?: string | null,
  ) {
    const sb = getSupabase();
    // Server RPC validates the caller and ACTIVE state, ignores caller-supplied
    // amounts, derives agreed_price, and awaits responder confirmation.
    const { error } = await sb.rpc("agreement_claim_payment", {
      p_id: id,
      p_method: method,
      p_amount: amount ?? undefined,
      p_reference: reference ?? undefined,
    });
    throwIfError(error);
    return { ok: true };
  },

  /** Responder confirms they received the UPI payment → PAID + DEPOSIT_PAID. */
  async confirmAgreementPayment(id: string) {
    const sb = getSupabase();
    const { error } = await sb.rpc("agreement_confirm_payment", { p_id: id });
    throwIfError(error);
    return { ok: true };
  },

  /** Responder rejects the claim → REJECTED; requester can try again. */
  async rejectAgreementPaymentClaim(id: string) {
    const sb = getSupabase();
    const { error } = await sb.rpc("agreement_reject_payment", { p_id: id });
    throwIfError(error);
    return { ok: true };
  },

  async startWork(id: string) {
    const sb = getSupabase();
    // Responder-only, DEPOSIT_PAID→IN_PROGRESS, validated server-side.
    const { error } = await sb.rpc("agreement_start_work", { p_id: id });
    throwIfError(error);
    return { ok: true, status: "IN_PROGRESS" };
  },

  async submitForReview(id: string) {
    const sb = getSupabase();
    // Responder-only, IN_PROGRESS→REVIEW, validated server-side.
    const { error } = await sb.rpc("agreement_submit_review", { p_id: id });
    throwIfError(error);
    return { ok: true, status: "REVIEW" };
  },

  async dispute(id: string, reason: string) {
    const sb = getSupabase();
    // Party-only, IN_PROGRESS/REVIEW→DISPUTED, validated server-side.
    const { error } = await sb.rpc("agreement_dispute", { p_id: id, p_reason: reason });
    throwIfError(error);
    return { ok: true, status: "DISPUTED" };
  },

  /** Either party backs out of an ACTIVE agreement before any money moves —
   *  server rejects if a payment claim is PENDING_CONFIRM or already PAID.
   *  Reopens the original request and reverts proposals so the requester can
   *  pick someone else. */
  async cancelAgreement(id: string) {
    const sb = getSupabase();
    const { error } = await sb.rpc("agreement_cancel", { p_id: id });
    throwIfError(error);
    return { ok: true, status: "CANCELLED" };
  },

  async submitCounter(proposalId: string, amount: number, message: string = "") {
    const sb = getSupabase();
    const { error } = await sb.rpc("proposal_submit_counter", {
      p_proposal_id: proposalId,
      p_amount: amount,
      p_message: message,
    });
    throwIfError(error);
    return { ok: true };
  },

  async rate(rateeId: string, rating: number, comment: string, tip?: number, agreementId?: string) {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw toApiError({ code: "UNAUTHENTICATED" }, 401);
    const { error } = await sb.from("ratings").insert({
      rater_user_id: uid,
      ratee_type: "USER",
      ratee_id: rateeId,
      rating,
      comment,
      tip: tip ?? null,
      agreement_id: agreementId ?? null,
    });
    // One rating per rater per agreement — the partial unique index rejects a
    // repeat submission so counts can't be inflated by rating the same job twice.
    if (error && (error as { code?: string }).code === "23505") {
      throw toApiError({ code: "ALREADY_RATED", message: "You've already rated this." }, 409);
    }
    throwIfError(error);
    return { ok: true };
  },

  async updateLiveStatus(
    agreementId: string,
    status: import("@/types").JobLiveStatus,
    lat?: number,
    lng?: number
  ): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.rpc("agreement_update_live_status", {
      p_id: agreementId,
      p_status: status,
      p_lat: lat ?? undefined,
      p_lng: lng ?? undefined,
    });
    throwIfError(error);
  },

  async generateTrackingToken(agreementId: string): Promise<string> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("agreement_create_tracking_token", { p_id: agreementId });
    throwIfError(error);
    return data as string;
  },

  async nudgeAgreementPayment(id: string) {
    const sb = getSupabase();
    const { data: ag, error } = await sb
      .from("agreements")
      .select("id, request_title, agreed_price, requester_user_id, responder:users!responder_user_id(name)")
      .eq("id", id)
      .maybeSingle();
    throwIfError(error);
    if (!ag) throw new Error("Agreement not found");
    
    const responderName = (ag as any).responder?.name || "the provider";
    const title = "Payment Requested 🔔";
    const body = `${responderName} requested payment of ₹${ag.agreed_price} for "${ag.request_title}".`;
    
    await notificationService.send(
      (ag as any).requester_user_id,
      title,
      body,
      `/agreement/${id}`,
      "SYSTEM"
    );
    return { ok: true };
  },
};
