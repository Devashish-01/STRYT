import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import { throwIfError, toApiError } from "@/lib/supabasePage";
import { toCamel, toSnake } from "@/lib/caseMap";
import { generateAlias } from "@/lib/alias";
import type { PublicUser, CurrentUser } from "@/types";

export interface OwnedEntities {
  businessIds: string[];
  providerId: string | null;
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
  // The authenticated user's own profile. Backend: GET /users/me
  async me(): Promise<CurrentUser> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw toApiError({ code: "UNAUTHENTICATED", message: "Not signed in" }, 401);
    const { data, error } = await sb.from("users").select("*").eq("id", uid).maybeSingle();
    throwIfError(error);
    if (data) {
      let u = toCamel<CurrentUser>(data);
      // Backfill a privacy alias for older accounts created before the alias column.
      if (!u.alias) {
        const alias = generateAlias();
        await sb.from("users").update({ alias }).eq("id", uid);
        u = { ...u, alias };
      }
      return u;
    }
    // Row missing — happens for Google OAuth users when the DB trigger hasn't run yet.
    // Upsert a seed row so FK constraints on requests / proposals don't block the user.
    const { data: authData } = await sb.auth.getUser();
    const au = authData?.user;
    const name = (au?.user_metadata?.full_name as string | undefined)
              || au?.email
              || au?.phone
              || "New user";
    const alias = generateAlias();
    await sb.from("users").upsert(
      { id: uid, name, alias, phone: au?.phone ?? null, roles: ["customer"] },
      { onConflict: "id", ignoreDuplicates: true }
    );
    return toCamel<CurrentUser>({ id: uid, name, alias, phone: au?.phone ?? null, avatar: null, roles: ["customer"], area: null, city: null, lat: 0, lng: 0, rating_avg: 0, rating_count: 0, language: "en", notification_radius_km: 5 });
  },

  async update(patch: Partial<CurrentUser>) {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw toApiError({ code: "UNAUTHENTICATED", message: "Not signed in" }, 401);
    const { data, error } = await sb.from("users").update(toSnake(patch)).eq("id", uid).select().maybeSingle();
    throwIfError(error);
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
    return {
      businessIds: (biz.data ?? []).map((b: { id: string }) => b.id),
      providerId: prov.data?.[0]?.id ?? null,
    };
  },

  async setLocation(lat: number, lng: number, area?: string) {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw toApiError({ code: "UNAUTHENTICATED", message: "Not signed in" }, 401);
    const { error } = await sb.from("users").update({ lat, lng, area }).eq("id", uid);
    throwIfError(error);
    return { ok: true };
  },

  // A public profile by id (read from Supabase; stats computed live).
  async publicProfile(id: string): Promise<PublicUser | undefined> {
    const sb = getSupabase();
    const { data: u, error } = await sb
      .from("users")
      .select("id, name, alias, avatar, area, rating_avg, rating_count, created_at")
      .eq("id", id)
      .maybeSingle();
    throwIfError(error);
    if (!u) return undefined;
    const ur = u as any;

    const [helpedRes, requestsRes, vouchRes, ratingsRes] = await Promise.all([
      sb.from("agreements").select("*", { count: "exact", head: true }).eq("responder_user_id", id).eq("status", "COMPLETED"),
      sb.from("requests").select("*", { count: "exact", head: true }).eq("requester_user_id", id),
      sb.from("vouches").select("*", { count: "exact", head: true }).eq("from_user_id", id),
      sb.from("ratings").select("id, rating, comment, created_at, ratee_type, ratee_id").eq("rater_user_id", id).order("created_at", { ascending: false }).limit(10),
    ]);

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
      // Public profiles show the privacy alias, never the real name.
      name: ur.alias || ur.name,
      avatar: ur.avatar ?? "",
      area: ur.area ?? "",
      memberSince: ur.created_at ? new Date(ur.created_at).getFullYear().toString() : "—",
      ratingAvg: Number(ur.rating_avg ?? 0),
      ratingCount: ur.rating_count ?? 0,
      helpedCount: helpedRes.count ?? 0,
      requestsCount: requestsRes.count ?? 0,
      vouchCount: vouchRes.count ?? 0,
      badges: [
        ...((helpedRes.count ?? 0) >= 1  ? ["Good Neighbor"]  : []),
        ...((helpedRes.count ?? 0) >= 20 ? ["Top Helper"]     : []),
        ...((requestsRes.count ?? 0) >= 3 ? ["Active Member"] : []),
        ...((vouchRes.count ?? 0) >= 5   ? ["Trusted"]        : []),
      ],
      verifications: [],
      reviewsGiven: ratings.map((r) => ({
        id: r.id,
        target: nameOf(r.ratee_type, r.ratee_id),
        rating: r.rating,
        comment: r.comment ?? "",
        date: relDate(r.created_at),
      })),
    };
  },
};
