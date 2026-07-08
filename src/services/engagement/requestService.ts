import type { Page } from "@/lib/apiClient";
import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import { cursorToRange, throwIfError, toApiError } from "@/lib/supabasePage";
import { toCamel, toSnake } from "@/lib/caseMap";
import type { RequestPost, Proposal, Agreement, ProposalCounter } from "@/types";
import { leaderboardService } from "@/services/marketplace/leaderboardService";
import { firstName, aliasName } from "@/lib/publicName";
import { functionUrl } from "@/config";

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
  "*, requester:users!requester_user_id(name, alias, avatar, rating_avg), proposals:proposals(*, responder:users!responder_user_id(rating_avg), counters:proposal_counters(id, by_user_id, amount, message, created_at))";

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
    requesterName:   row.is_anonymous ? "Someone nearby" : aliasName({ alias: requester.alias, name: requester.name }),
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
    let q = sb.from("requests").select(REQUEST_SELECT, { count: "exact" }).in("status", ["OPEN", "AGREED"]);
    if (p.category)              q = q.eq("category_name", p.category);
    if (p.special === "urgent")  q = q.eq("is_urgent", true);
    if (p.special === "group")   q = q.eq("is_group_buy", true);
    if (p.special === "recurring") q = q.eq("is_recurring", true);
    const { data, error, count } = await q.order("created_at", { ascending: false }).range(from, to);
    throwIfError(error);

    const saved = localStorage.getItem("settings_radius");
    const radiusLimit = p.radiusKm ?? (saved ? parseFloat(saved) : 5);

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
      .select(REQUEST_SELECT)
      .eq("requester_user_id", uid)
      .order("created_at", { ascending: false });
    throwIfError(error);
    return (data ?? []).map((r: any) => rowToRequest(r, userLat, userLng));
  },

  async get(id: string, userLat = 0, userLng = 0): Promise<RequestPost | undefined> {
    const sb = getSupabase();
    await sweepExpired(sb);
    const { data, error } = await sb.from("requests").select(REQUEST_SELECT).eq("id", id).maybeSingle();
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
    // otherwise anyone could pass another shop's id and impersonate it.
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
      if (entity && (entity as any)[ownerCol] === uid) {
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

  /** Proposals the signed-in user has sent — optionally scoped to one business/provider
   *  entity — so a manage console can show "proposals I've sent" independent of the
   *  generic open-request feed. */
  async myProposals(entityId?: string): Promise<(Proposal & { requestTitle: string; requestStatus: string })[]> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return [];
    let q = sb.from("proposals")
      .select("*, request:requests!request_id(title, status)")
      .eq("responder_user_id", uid)
      .order("created_at", { ascending: false });
    if (entityId) q = q.eq("responder_entity_id", entityId);
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

  /** Latest payment row for an agreement — surfaces escrow state (HELD/RELEASED) in the UI. */
  async paymentForAgreement(agreementId: string): Promise<{ escrowStatus: string; amount: number } | null> {
    const sb = getSupabase();
    const { data } = await sb
      .from("payments")
      .select("escrow_status, amount")
      .eq("agreement_id", agreementId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    return { escrowStatus: (data as any).escrow_status ?? "", amount: Number((data as any).amount ?? 0) };
  },

  async confirmAgreement(id: string) {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw toApiError({ code: "UNAUTHENTICATED" }, 401);

    // Determine which side the current user is on.
    const { data: ag } = await sb
      .from("agreements")
      .select("requester_user_id, responder_user_id, requester_confirmed, responder_confirmed")
      .eq("id", id)
      .maybeSingle();
    const isRequester = (ag as any)?.requester_user_id === uid;
    const patch = isRequester ? { requester_confirmed: true } : { responder_confirmed: true };

    const { data: updated, error } = await sb
      .from("agreements")
      .update(patch)
      .eq("id", id)
      .select("requester_confirmed, responder_confirmed")
      .maybeSingle();
    throwIfError(error);

    // Activate only when BOTH sides are confirmed. Use the post-update row
    // (not the stale pre-read) so two near-simultaneous confirmations can't
    // both miss each other and leave the agreement stuck in PENDING — Postgres
    // serializes the two UPDATEs, so whichever commits second sees both = true.
    const bothConfirmed = (updated as any)?.requester_confirmed && (updated as any)?.responder_confirmed;
    if (bothConfirmed) {
      await sb.from("agreements").update({ status: "ACTIVE" }).eq("id", id);
    } else {
      // I confirmed first — the other side has no idea they're on a 10-minute
      // clock until it silently auto-cancels. Nudge them now instead of
      // leaving it to the countdown banner they may never open the app to see.
      // notifications has no client insert policy (every other notification in
      // this app is written by a SECURITY DEFINER trigger) — this narrow RPC
      // does the same, scoped to only notifying the other party on this
      // specific agreement. Best-effort: a failure here shouldn't block the
      // confirm action itself.
      const otherUserId = isRequester ? (ag as any)?.responder_user_id : (ag as any)?.requester_user_id;
      if (otherUserId) {
        await sb.rpc("notify_agreement_confirm", { p_agreement_id: id, p_recipient_user_id: otherUserId }).then(
          ({ error: notifyErr }) => { if (notifyErr) console.warn("notify_agreement_confirm:", notifyErr.message); }
        );
      }
    }
    return { ok: true, isRequester };
  },

  async completeAgreement(id: string) {
    const sb = getSupabase();
    const uid = await currentUserId();
    const { error } = await sb.from("agreements").update({ status: "COMPLETED" }).eq("id", id);
    throwIfError(error);
    // Release escrow on any HELD payment for this agreement
    await sb.from("payments")
      .update({ escrow_status: "RELEASED" })
      .eq("agreement_id", id)
      .eq("escrow_status", "HELD");
    if (uid) void leaderboardService.addPoints(uid, 5);
    return { ok: true, status: "COMPLETED" };
  },

  /**
   * Requester claims they've paid the agreed price.
   * - CASH → PAID immediately (physical handover, same as appointments).
   * - UPI → PENDING_CONFIRM (responder must verify in their bank app and confirm)
   *   — the agreement does NOT advance to DEPOSIT_PAID until they do. This
   *   replaces the old one-sided `markDepositPaid`, which let the requester
   *   flip the deal to "paid" with zero chance for the responder to dispute
   *   a claim they never actually received.
   */
  async claimAgreementPayment(
    id: string,
    method: "UPI" | "CASH",
    amount?: number | null,
    reference?: string | null,
  ) {
    const sb = getSupabase();
    const patch: Record<string, unknown> = { payment_method: method };
    if (amount != null) patch.payment_amount = amount;
    if (reference) patch.payment_reference = reference;
    if (method === "CASH") {
      patch.payment_status = "PAID";
      patch.status = "DEPOSIT_PAID";
    } else {
      patch.payment_status = "PENDING_CONFIRM";
    }
    const { error } = await sb.from("agreements").update(patch).eq("id", id);
    throwIfError(error);
    return { ok: true };
  },

  /** Responder confirms they received the UPI payment → PAID + DEPOSIT_PAID. */
  async confirmAgreementPayment(id: string) {
    const sb = getSupabase();
    const { error } = await sb
      .from("agreements")
      .update({ payment_status: "PAID", status: "DEPOSIT_PAID" })
      .eq("id", id);
    throwIfError(error);
    return { ok: true };
  },

  /** Responder rejects the claim → REJECTED; requester can try again. */
  async rejectAgreementPaymentClaim(id: string) {
    const sb = getSupabase();
    const { error } = await sb
      .from("agreements")
      .update({ payment_status: "REJECTED" })
      .eq("id", id);
    throwIfError(error);
    return { ok: true };
  },

  async startWork(id: string) {
    const sb = getSupabase();
    const { error } = await sb.from("agreements").update({ status: "IN_PROGRESS" }).eq("id", id);
    throwIfError(error);
    return { ok: true, status: "IN_PROGRESS" };
  },

  async submitForReview(id: string) {
    const sb = getSupabase();
    const { error } = await sb.from("agreements").update({ status: "REVIEW" }).eq("id", id);
    throwIfError(error);
    return { ok: true, status: "REVIEW" };
  },

  async dispute(id: string, reason: string) {
    const sb = getSupabase();
    const { error } = await sb
      .from("agreements")
      .update({ status: "DISPUTED", dispute_reason: reason })
      .eq("id", id);
    throwIfError(error);
    return { ok: true, status: "DISPUTED" };
  },

  async submitCounter(proposalId: string, amount: number, message: string = "") {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw toApiError({ code: "UNAUTHENTICATED" }, 401);
    const { error } = await sb.from("proposal_counters").insert({
      proposal_id: proposalId,
      by_user_id: uid,
      amount,
      message,
    });
    throwIfError(error);
    return { ok: true };
  },

  async rate(rateeId: string, rating: number, comment: string, tip?: number) {
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
    });
    throwIfError(error);
    return { ok: true };
  },

  async sosAlert(agreementId: string, lat: number, lng: number): Promise<{ ok: boolean }> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw toApiError({ code: "UNAUTHENTICATED" }, 401);

    const { data: ag } = await sb.from("agreements")
      .select("responder_user_id").eq("id", agreementId).maybeSingle();

    // Not selectable via a plain query anymore (ISS-009) —
    // get_own_emergency_contact() is a SECURITY DEFINER RPC scoped to auth.uid().
    const { data: me } = await sb.rpc("get_own_emergency_contact").maybeSingle();

    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch(
      functionUrl("sos-alert"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          agreementId,
          triggeredByUserId: uid,
          providerUserId: (ag as any)?.responder_user_id ?? "",
          lat,
          lng,
          emergencyContact: (me as any)?.emergency_contact ?? "",
          emergencyContactName: (me as any)?.emergency_contact_name ?? "",
        }),
      }
    );
    if (!res.ok) throw new Error("SOS failed");
    return { ok: true };
  },

  async updateLiveStatus(
    agreementId: string,
    status: import("@/types").JobLiveStatus,
    lat?: number,
    lng?: number
  ): Promise<void> {
    const sb = getSupabase();
    const patch: Record<string, unknown> = { live_status: status };
    if (lat !== undefined) patch.provider_lat = lat;
    if (lng !== undefined) patch.provider_lng = lng;
    const { error } = await sb.from("agreements").update(patch).eq("id", agreementId);
    throwIfError(error);
  },

  async generateTrackingToken(agreementId: string): Promise<string> {
    const sb = getSupabase();
    const expiresAt = new Date(Date.now() + 4 * 3600 * 1000).toISOString();
    const { data, error } = await sb
      .from("tracking_tokens")
      .insert({ agreement_id: agreementId, expires_at: expiresAt })
      .select("id")
      .maybeSingle();
    throwIfError(error);
    const tokenId = (data as any)?.id as string;
    await sb.from("agreements").update({ tracking_token: tokenId }).eq("id", agreementId);
    return tokenId;
  },
};
