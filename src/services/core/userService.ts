import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import { throwIfError, toApiError } from "@/lib/supabasePage";
import { toCamel, toSnake } from "@/lib/caseMap";
import type { PublicUser, CurrentUser } from "@/types";
import { PROFILE_BADGE_THRESHOLDS } from "@/lib/badges";

export interface OwnedEntities {
  businessIds: string[];
  providerId: string | null;
}

const USER_COLUMNS = new Set([
  "name", "alias", "phone", "avatar", "roles", "area", "city", "lat", "lng",
  "ratingAvg", "ratingCount", "language", "notificationRadiusKm",
  "emergencyContact", "emergencyContactName",
  "showPostsPublicly", "showAsksPublicly", "showBadgesPublicly",
  "showPhonePublicly", "showEmailPublicly", "showCityPublicly", "showRatingPublicly",
  "locationPublic", "onboardingCompletedAt",
]);

function pickColumns<T extends Record<string, unknown>>(obj: T, allowed: Set<string>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (allowed.has(k) && v !== undefined) out[k] = v;
  }
  return out;
}

function relDate(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 30) return `${Math.floor(d / 7)} week${Math.floor(d / 7) > 1 ? "s" : ""} ago`;
  return `${Math.floor(d / 30)} month${Math.floor(d / 30) > 1 ? "s" : ""} ago`;
}

export const userService = {
  async me(): Promise<CurrentUser> {
    const sb = getSupabase();
    const { data: { user: au } } = await sb.auth.getUser();
    if (!au) throw toApiError({ code: "UNAUTHENTICATED", message: "Not signed in" }, 401);
    const uid = au.id;
    // Sensitive columns (phone/email/emergency contact/exact coords) are no
    // longer selectable via a plain client query — get_own_profile() is a
    // SECURITY DEFINER RPC scoped to auth.uid(), see ISS-009.
    const { data, error } = await sb.rpc("get_own_profile").maybeSingle();
    throwIfError(error);
    if (data) {
      let u = toCamel<CurrentUser>(data);
      // alias isn't a sensitive field, but get_own_profile() may predate it —
      // merge it from a plain select so the user's own handle always loads.
      if (u.alias === undefined) {
        const { data: aliasRow } = await sb.from("users").select("alias").eq("id", uid).maybeSingle();
        if (aliasRow) u.alias = (aliasRow as { alias?: string | null }).alias ?? null;
      }
      // Look up pending deletion requests
      const { data: delReq } = await sb
        .from("profile_deletion_requests")
        .select("created_at")
        .eq("user_id", uid)
        .eq("target_type", "CUSTOMER")
        .eq("status", "PENDING")
        .maybeSingle();

      if (delReq) {
        const requestDate = new Date(delReq.created_at);
        const scheduledDate = new Date(requestDate.getTime() + 30 * 24 * 60 * 60 * 1000);
        u.deletionScheduledAt = scheduledDate.toISOString();
      } else {
        u.deletionScheduledAt = null;
      }

      return u;
    }
    // Row missing — happens for Google OAuth / phone-auth users when the DB trigger hasn't run or completed yet.
    // Upsert a seed row so FK constraints on requests / proposals don't block the user.
    // Never fall back to the phone number as a display name — a bare number
    // reads as broken and leaks the phone everywhere the name is shown. Leaving
    // it "New user" routes them through onboarding to pick a real name.
    const name = (au.user_metadata?.full_name as string | undefined)
              || (au.email ? au.email.split("@")[0] : undefined)
              || "New user";
    const avatar = (au.user_metadata?.avatar_url as string | undefined)
                || (au.user_metadata?.picture as string | undefined)
                || null;
    const { error: upsertErr } = await sb.from("users").upsert(
      { id: uid, name, phone: au.phone ?? null, email: au.email ?? null, avatar, roles: ["customer"] },
      { onConflict: "id", ignoreDuplicates: true }
    );
    if (upsertErr) console.warn("me (profile self-heal):", upsertErr.message);
    return toCamel<CurrentUser>({ id: uid, name, phone: au.phone ?? null, email: au.email ?? null, avatar, roles: ["customer"], area: null, city: null, lat: 0, lng: 0, rating_avg: 0, rating_count: 0, language: "en", notification_radius_km: 5, deletion_scheduled_at: null, onboarding_completed_at: null });
  },

  async update(patch: Partial<CurrentUser>) {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw toApiError({ code: "UNAUTHENTICATED", message: "Not signed in" }, 401);
    const cleanPatch = pickColumns(patch as Record<string, unknown>, USER_COLUMNS);
    // RETURNING is subject to the same column grants as SELECT — phone/lat/
    // lng/email/emergency_contact aren't selectable via a plain client query
    // anymore (see ISS-009), so name the safe columns explicitly rather than
    // `.select()` (which asks for `*`). Callers needing the sensitive fields
    // back should re-fetch via get_own_profile() afterward.
    const { data, error } = await sb.from("users").update(toSnake(cleanPatch)).eq("id", uid)
      .select("id, name, alias, avatar, roles, area, city, rating_avg, rating_count, language, notification_radius_km, created_at, show_posts_publicly, show_asks_publicly, show_badges_publicly, show_phone_publicly, show_email_publicly, show_city_publicly, show_rating_publicly, location_public, customer_enabled, customer_deleted_at, onboarding_completed_at")
      .maybeSingle();
    throwIfError(error);

    // Sync avatar and name changes to any provider profile owned by this user
    if (patch.avatar !== undefined || patch.name !== undefined) {
      const provPatch: Record<string, any> = {};
      if (patch.avatar !== undefined) provPatch.avatar = patch.avatar;
      if (patch.name !== undefined) provPatch.display_name = patch.name;
      const { error: provErr } = await sb.from("providers").update(provPatch).eq("user_id", uid);
      if (provErr) console.warn("update (provider sync):", provErr.message);
    }

    return toCamel<CurrentUser>(data);
  },

  // Which businesses / provider profile this user owns (drives the Manage hub).
  async owned(): Promise<OwnedEntities> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return { businessIds: [], providerId: null };
    const [biz, prov] = await Promise.all([
      sb.from("businesses").select("id").eq("owner_user_id", uid),
      sb.from("providers").select("id").eq("user_id", uid).limit(1),
    ]);
    throwIfError(biz.error);
    throwIfError(prov.error);
    const ownedIds = (biz.data ?? []).map((b: { id: string }) => b.id);
    // Also include businesses this user can manage via an active delegated-login
    // session (business remote login). Best-effort — skips silently pre-migration.
    let delegatedIds: string[] = [];
    try {
      const { data: del } = await sb.rpc("my_delegated_businesses");
      if (Array.isArray(del)) delegatedIds = del.map((r: any) => (typeof r === "string" ? r : r?.my_delegated_businesses)).filter(Boolean);
    } catch { /* table/rpc not present yet */ }
    return {
      businessIds: Array.from(new Set([...ownedIds, ...delegatedIds])),
      providerId: prov.data?.[0]?.id ?? null,
    };
  },

  /**
   * Silent freshness sync on app open: updates the user's own coords (and any
   * provider profile, since providers are people who move) — but NEVER a
   * business, whose premises don't follow the owner's phone.
   */
  async autoSyncLocation(lat: number, lng: number, area?: string) {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return;
    const patch: Record<string, unknown> = { lat, lng };
    if (area) patch.area = area;
    const { error } = await sb.from("users").update(patch).eq("id", uid);
    throwIfError(error);
    const { error: provErr } = await sb.from("providers").update({ lat, lng }).eq("user_id", uid);
    if (provErr) console.warn("autoSyncLocation (provider sync):", provErr.message);
  },

  async setLocation(lat: number, lng: number, area?: string) {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw toApiError({ code: "UNAUTHENTICATED", message: "Not signed in" }, 401);
    
    // 1. Update users profile
    const { error } = await sb.from("users").update({ lat, lng, area }).eq("id", uid);
    throwIfError(error);

    // 2. Sync to any businesses owned by the user
    const { error: bizErr } = await sb.from("businesses")
      .update({ lat, lng, address_line1: area || null })
      .eq("owner_user_id", uid);
    if (bizErr) console.warn("setLocation (biz sync):", bizErr.message);

    // 3. Sync to any provider profiles owned by the user
    const { error: provErr } = await sb.from("providers")
      .update({ lat, lng })
      .eq("user_id", uid);
    if (provErr) console.warn("setLocation (provider sync):", provErr.message);

    return { ok: true };
  },

  // A public profile by id (read from Supabase; stats computed live).
  async publicProfile(id: string): Promise<PublicUser | undefined> {
    const sb = getSupabase();
    // Phone is masked server-side by show_phone_publicly, and this never
    // returns the target's exact coordinates — only a computed distance —
    // see get_public_profile() / ISS-009.
    const { data: u, error } = await sb.rpc("get_public_profile", { target_id: id }).maybeSingle();
    throwIfError(error);
    if (!u) return undefined;
    const ur = u as any;

    const [helpedRes, requestsRes, vouchRes, ratingsRes, postsRes, userRequestsData, proposalsGivenData] = await Promise.all([
      sb.from("agreements").select("*", { count: "exact", head: true }).eq("responder_user_id", id).eq("status", "COMPLETED"),
      sb.from("requests").select("*", { count: "exact", head: true }).eq("requester_user_id", id),
      sb.from("vouches").select("*", { count: "exact", head: true }).eq("from_user_id", id),
      sb.from("ratings").select("id, rating, comment, created_at, ratee_type, ratee_id").eq("rater_user_id", id).order("created_at", { ascending: false }).limit(10),
      sb.from("community_posts").select("id, title, body, type, area, created_at, likes_count, comments_count").eq("author_user_id", id).order("created_at", { ascending: false }).limit(20),
      sb.from("requests").select("id, category_name, description, status, budget_max, created_at").eq("requester_user_id", id).order("created_at", { ascending: false }).limit(20),
      sb.from("proposals").select("id, request_id, price, note, created_at").eq("responder_user_id", id).order("created_at", { ascending: false }).limit(20),
    ]);

    // Resolve request titles for proposals given
    const proposals = (proposalsGivenData.data ?? []) as any[];
    const reqIds = Array.from(new Set(proposals.map((p) => p.request_id).filter(Boolean)));
    const { data: reqTitlesData } = reqIds.length
      ? await sb.from("requests").select("id, description, category_name").in("id", reqIds)
      : { data: [] as any[] };
    const reqTitlesMap = new Map((reqTitlesData ?? []).map((r: any) => [r.id, r.category_name || r.description?.slice(0, 30) || "Request"]));

    // Count proposals received on user's requests
    const userReqIds = (userRequestsData.data ?? []).map((r: any) => r.id);
    const { count: propRecCount } = userReqIds.length
      ? await sb.from("proposals").select("*", { count: "exact", head: true }).in("request_id", userReqIds)
      : { count: 0 };

    // Resolve the names of whatever this user reviewed.
    const ratings = (ratingsRes.data ?? []) as any[];
    const idsByType = (t: string) => ratings.filter((r) => r.ratee_type === t).map((r) => r.ratee_id);
    const bizIds = idsByType("BUSINESS");
    const provIds = idsByType("PROVIDER");
    const userIds = idsByType("USER");
    const [bizN, provN, userN] = await Promise.all([
      bizIds.length ? sb.from("businesses").select("id, name").in("id", bizIds) : Promise.resolve({ data: [] as any[] }),
      provIds.length ? sb.from("providers").select("id, display_name").in("id", provIds) : Promise.resolve({ data: [] as any[] }),
      userIds.length ? sb.from("users").select("id, name").in("id", userIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const nameOf = (type: string, tid: string): string => {
      if (type === "BUSINESS") return (bizN.data ?? []).find((x: any) => x.id === tid)?.name ?? "A business";
      if (type === "PROVIDER") return (provN.data ?? []).find((x: any) => x.id === tid)?.display_name ?? "A provider";
      return (userN.data ?? []).find((x: any) => x.id === tid)?.name ?? "A neighbor";
    };

    return {
      id: ur.id,
      name: ur.name,
      alias: ur.alias ?? null,
      phone: ur.phone ?? undefined,
      email: ur.email ?? undefined,
      distanceKm: ur.distance_km ?? undefined,
      showPostsPublicly: ur.show_posts_publicly ?? true,
      showAsksPublicly: ur.show_asks_publicly ?? true,
      showBadgesPublicly: ur.show_badges_publicly ?? true,
      showPhonePublicly: ur.show_phone_publicly ?? true,
      showEmailPublicly: ur.show_email_publicly ?? false,
      showCityPublicly: ur.show_city_publicly ?? true,
      showRatingPublicly: ur.show_rating_publicly ?? true,
      avatar: ur.avatar ?? "",
      area: ur.area ?? "",
      memberSince: ur.created_at ? new Date(ur.created_at).getFullYear().toString() : "—",
      ratingAvg: Number(ur.rating_avg ?? 0),
      ratingCount: ur.rating_count ?? 0,
      helpedCount: helpedRes.count ?? 0,
      requestsCount: requestsRes.count ?? 0,
      vouchCount: vouchRes.count ?? 0,
      badges: [
        ...((helpedRes.count ?? 0) >= PROFILE_BADGE_THRESHOLDS.goodNeighbor ? ["Good Neighbor"] : []),
        ...((helpedRes.count ?? 0) >= PROFILE_BADGE_THRESHOLDS.topHelper    ? ["Top Helper"]     : []),
        ...((requestsRes.count ?? 0) >= PROFILE_BADGE_THRESHOLDS.activeMember ? ["Active Member"] : []),
        ...((vouchRes.count ?? 0) >= PROFILE_BADGE_THRESHOLDS.wellVouched   ? ["Well Vouched"]    : []),
      ],
      verifications: [],
      reviewsGiven: ratings.map((r) => ({
        id: r.id,
        target: nameOf(r.ratee_type, r.ratee_id),
        rating: r.rating,
        comment: r.comment ?? "",
        date: relDate(r.created_at),
      })),
      posts: (postsRes.data ?? []).map((p: any) => ({
        id: p.id,
        title: p.title ?? undefined,
        body: p.body ?? "",
        type: p.type ?? "DISCUSSION",
        area: p.area ?? undefined,
        date: relDate(p.created_at),
        likesCount: p.likes_count ?? 0,
        commentsCount: p.comments_count ?? 0,
      })),
      requests: (userRequestsData.data ?? []).map((r: any) => ({
        id: r.id,
        categoryName: r.category_name ?? undefined,
        description: r.description ?? "",
        status: r.status ?? "OPEN",
        budget: r.budget_max ?? undefined,
        date: relDate(r.created_at),
      })),
      proposalsGiven: proposals.map((p: any) => ({
        id: p.id,
        requestId: p.request_id,
        requestTitle: reqTitlesMap.get(p.request_id) || "Help Request",
        price: p.price ?? 0,
        note: p.note ?? "",
        date: relDate(p.created_at),
      })),
      proposalsReceivedCount: propRecCount ?? 0,
    };
  },
};
