import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import { toCamel } from "@/lib/caseMap";
import { haversineKm } from "@/lib/geocode";
import { evaluateProviderAvailability } from "@/utils/availability";
import { firstName } from "@/lib/publicName";
import { ACHIEVEMENT_THRESHOLDS } from "@/lib/badges";
import type {
  Story,
  AvailableNow,
  Vouch,
  Endorsement,
  LeaderEntry,
  Achievement,
} from "@/types";

export interface Collection {
  id: string;
  title: string;
  emoji: string;
  gradient: string;
  count: number;
  businessIds: string[];
}

// ── Helpers ───────────────────────────────────────────────────

function rowToStory(row: Record<string, unknown>): Story {
  const ownerType = row.owner_type as string;
  return {
    id:           row.id as string,
    businessId:   ownerType === "business" ? (row.owner_id as string) : undefined,
    providerId:   ownerType === "provider"  ? (row.owner_id as string) : undefined,
    userId:       ownerType === "user"      ? (row.user_id  as string) : undefined,
    authorName:   row.author_name   as string,
    authorAvatar: row.author_avatar as string,
    authorType:   ownerType as "business" | "provider" | "user",
    image:        row.image_url     as string,
    caption:      row.caption       as string,
    postedAt:     timeAgo(row.created_at as string),
    expiresInHrs: Math.max(0, Math.round(
      (new Date(row.expires_at as string).getTime() - Date.now()) / 3600000
    )),
    cta:       (row.cta as string) ?? "None",
    viewed:    false,
    tapTarget: ownerType === "business"
      ? `/business/${row.owner_id}`
      : ownerType === "provider"
      ? `/provider/${row.owner_id}`
      : `/u/${row.user_id}`,
    lat: (row.lat as number) ?? undefined,
    lng: (row.lng as number) ?? undefined,
    visibility: (row.visibility as string) ?? "everyone",
    allowedUserIds: (row.allowed_user_ids as string[]) ?? [],
    hiddenUserIds: (row.hidden_user_ids as string[]) ?? [],
  };
}

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.floor(h / 24)} day ago`;
}

// Achievement definitions (client-side; progress computed from DB)
const ACHIEVEMENT_DEFS = [
  { id: "first_request",  emoji: "📬", title: "First Ask",       desc: "Post your first request",              metric: "requests_posted",       threshold: ACHIEVEMENT_THRESHOLDS.firstRequest },
  { id: "deal_maker",     emoji: "🤝", title: "Deal Maker",      desc: "Complete your first agreement",        metric: "agreements_completed",  threshold: ACHIEVEMENT_THRESHOLDS.dealMaker },
  { id: "helper",         emoji: "⭐", title: "Helpful Neighbor", desc: "Complete 5 agreements as a responder", metric: "agreements_responded",  threshold: ACHIEVEMENT_THRESHOLDS.helper },
  { id: "five_star",      emoji: "🌟", title: "Five Stars",       desc: "Receive a 5-star rating",              metric: "five_star_ratings",     threshold: ACHIEVEMENT_THRESHOLDS.fiveStar },
  { id: "trusted",        emoji: "🔰", title: "Trusted",          desc: "Receive 10+ ratings",                  metric: "total_ratings",         threshold: ACHIEVEMENT_THRESHOLDS.trusted },
  { id: "vouch_giver",    emoji: "🫶", title: "Vouch Giver",      desc: "Vouch for 3 providers",                metric: "vouches_given",         threshold: ACHIEVEMENT_THRESHOLDS.vouchGiver },
] as const;

async function filterStoriesByPrivacy(storiesList: Story[]): Promise<Story[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  return storiesList.filter((s) => {
    if (s.userId === uid) return true;
    if (s.hiddenUserIds && s.hiddenUserIds.includes(uid)) return false;
    if (s.visibility === "close_friends") {
      if (!s.allowedUserIds || !s.allowedUserIds.includes(uid)) return false;
    }
    return true;
  });
}

// ── Service ───────────────────────────────────────────────────

export const socialService = {
  // ── Phase 33: Stories ────────────────────────────────────────
  async stories(): Promise<Story[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("stories")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    const mapped = (data ?? []).map(rowToStory);
    return filterStoriesByPrivacy(mapped);
  },

  async storiesNearby(lat: number, lng: number, radiusKm = 5): Promise<Story[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("stories")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .not("lat", "is", null)
      .not("lng", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    // Client-side proximity filter using Haversine (avoids RPC overhead for small datasets)
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const mapped = (data ?? [])
      .map(rowToStory)
      .filter((s) => {
        if (!s.lat || !s.lng) return false;
        const dLat = toRad(s.lat - lat);
        const dLng = toRad(s.lng - lng);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(s.lat)) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) <= radiusKm;
      });
    return filterStoriesByPrivacy(mapped);
  },

  async myStory(): Promise<Story | null> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return null;
    const { data } = await sb
      .from("stories")
      .select("*")
      .eq("user_id", uid)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? rowToStory(data as Record<string, unknown>) : null;
  },

  async postStory(params: {
    ownerType: "business" | "provider" | "user";
    ownerId?: string;
    userId?: string;
    authorName: string;
    authorAvatar: string;
    imageUrl: string;
    caption: string;
    cta: string;
    expiresInHrs: number;
    lat?: number;
    lng?: number;
    visibility?: string;
    allowedUserIds?: string[];
    hiddenUserIds?: string[];
  }): Promise<void> {
    const sb = getSupabase();
    const expiresAt = new Date(Date.now() + params.expiresInHrs * 3600 * 1000).toISOString();
    const ownerId = params.ownerId ?? params.userId ?? "";
    const row: Record<string, unknown> = {
      owner_type:    params.ownerType,
      owner_id:      ownerId,
      user_id:       params.userId ?? null,
      author_name:   params.authorName,
      author_avatar: params.authorAvatar,
      image_url:     params.imageUrl,
      caption:       params.caption,
      cta:           params.cta,
      expires_at:    expiresAt,
      visibility:    params.visibility ?? "everyone",
      allowed_user_ids: params.allowedUserIds ?? [],
      hidden_user_ids:  params.hiddenUserIds ?? [],
    };
    if (params.lat != null) row.lat = params.lat;
    if (params.lng != null) row.lng = params.lng;
    const { error } = await sb.from("stories").insert(row);
    if (error) throw error;
  },

  async recordStoryView(storyId: string): Promise<void> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return;
    
    // Attempt insert, ignore unique conflicts
    await sb.from("story_views").upsert(
      { story_id: storyId, viewer_user_id: uid },
      { onConflict: "story_id,viewer_user_id" }
    );
  },

  async getStoryViewers(storyId: string): Promise<any[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("story_views")
      .select("created_at, viewer:users!viewer_user_id(id, name, avatar)")
      .eq("story_id", storyId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data || []).map((v: any) => ({
      userId: v.viewer?.id,
      name: v.viewer?.name,
      avatar: v.viewer?.avatar,
      viewedAt: v.created_at,
    }));
  },

  async searchNeighbors(queryStr: string): Promise<any[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("users")
      .select("id, name, avatar")
      .ilike("name", `%${queryStr}%`)
      .limit(10);
    if (error) throw error;
    return data || [];
  },

  // ── Phase 34: Available-now ───────────────────────────────────
  async availableNow(lat?: number, lng?: number, radius?: number): Promise<AvailableNow[]> {
    if (localStorage.getItem("settings_new_prov") === "false") {
      return [];
    }
    const sb = getSupabase();
    const { data, error } = await sb
      .from("providers")
      .select("*")
      .eq("status", "ACTIVE")
      .eq("owner_enabled", true)
      .is("deleted_at", null);
    if (error) throw error;
    
    // Dynamically evaluate working hours & manual override for each provider
    let list = (data ?? [])
      .filter((r) => {
        const evalRes = evaluateProviderAvailability(
          r.availability_note as string,
          r.is_available_now as boolean,
          r.available_until as string
        );
        return evalRes.isOpenNow;
      })
      .map((r) => {
        const untilStr = r.available_until ? new Date(r.available_until as string).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "7:00 PM";
        const untilTime = r.available_until ? new Date(r.available_until as string).getTime() : Date.now() + 3600000;
        const dist = (lat != null && lng != null && r.lat != null && r.lng != null)
          ? haversineKm(lat, lng, r.lat, r.lng)
          : 0;
        return {
          providerId:     r.id,
          availableUntil: untilStr,
          minutesLeft:    Math.max(0, Math.round((untilTime - Date.now()) / 60000)),
          note:           (r.availability_note as string) ?? "Available for jobs right now",
          displayName:    r.display_name as string,
          avatar:         r.avatar as string,
          categoryName:   r.category_name as string,
          distanceKm:     parseFloat(dist.toFixed(1)),
          startingPrice:  r.starting_price as number,
          phone:          r.phone as string,
          ratingAvg:      r.rating_avg as number,
          isVerified:     r.is_verified as boolean,
        };
      });
    if (lat != null && lng != null && radius != null && radius < 5000) {
      list = list.filter((p) => p.distanceKm <= radius);
    }
    return list;
  },

  // ── Followers of a user (reverse of "who I follow") ─────────────
  async followers(userId: string): Promise<{ id: string; name: string; avatar: string }[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("follows")
      .select("follower_user_id, users!follower_user_id(name, avatar)")
      .in("target_type", ["USER", "user"])
      .eq("target_id", userId)
      .limit(100);
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: r.follower_user_id,
      name: firstName(r.users?.name),
      avatar: r.users?.avatar ?? "",
    }));
  },

  // ── Phase 38: Vouches ─────────────────────────────────────────
  async vouches(providerId: string): Promise<Vouch[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("vouches")
      .select("from_user_id, users!from_user_id(name, avatar)")
      .eq("provider_id", providerId)
      .limit(20);
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      byUserId: r.from_user_id,
      byName:   r.users?.name ?? "Someone",
      byAvatar: r.users?.avatar ?? "",
    }));
  },

  async addVouch(providerId: string): Promise<void> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return;
    await sb.from("vouches").upsert(
      { from_user_id: uid, provider_id: providerId },
      { onConflict: "from_user_id,provider_id" }
    );
  },

  async removeVouch(providerId: string): Promise<void> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return;
    await sb.from("vouches").delete().eq("from_user_id", uid).eq("provider_id", providerId);
  },

  // ── Phase 38: Endorsements ────────────────────────────────────
  async endorsements(providerId: string): Promise<Endorsement[]> {
    const sb = getSupabase();
    const uid = await currentUserId();
    const { data, error } = await sb
      .from("endorsements")
      .select("skill, from_user_id")
      .eq("provider_id", providerId);
    if (error) throw error;
    const skillMap: Record<string, { count: number; endorsed: boolean }> = {};
    for (const row of data ?? []) {
      if (!skillMap[row.skill]) skillMap[row.skill] = { count: 0, endorsed: false };
      skillMap[row.skill].count++;
      if (uid && row.from_user_id === uid) skillMap[row.skill].endorsed = true;
    }
    return Object.entries(skillMap).map(([skill, s]) => ({ skill, count: s.count, endorsed: s.endorsed }));
  },

  async addEndorsement(providerId: string, skill: string): Promise<void> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return;
    await sb.from("endorsements").upsert(
      { from_user_id: uid, provider_id: providerId, skill },
      { onConflict: "from_user_id,provider_id,skill" }
    );
  },

  async removeEndorsement(providerId: string, skill: string): Promise<void> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return;
    await sb.from("endorsements").delete().eq("from_user_id", uid).eq("provider_id", providerId).eq("skill", skill);
  },

  // ── Phase 39: Leaderboard ────────────────────────────────────
  async leaderboard(): Promise<LeaderEntry[]> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("get_leaderboard");
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      rank:       Number(r.rank),
      name:       r.name,
      avatar:     r.avatar ?? "",
      metric:     r.metric,
      value:      r.value,
      isProvider: r.is_provider,
      targetId:   r.target_id,
    }));
  },

  // ── Phase 40: Achievements ────────────────────────────────────
  async achievements(): Promise<Achievement[]> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return []; // not authed — nothing to show

    const [reqRes, agCompleteRes, agRespondRes, fiveStarRes, totalRatingsRes, vouchGivenRes] =
      await Promise.all([
        sb.from("requests").select("*", { count: "exact", head: true }).eq("requester_user_id", uid),
        sb.from("agreements").select("*", { count: "exact", head: true }).eq("status", "COMPLETED").or(`requester_user_id.eq.${uid},responder_user_id.eq.${uid}`),
        sb.from("agreements").select("*", { count: "exact", head: true }).eq("status", "COMPLETED").eq("responder_user_id", uid),
        sb.from("ratings").select("*", { count: "exact", head: true }).eq("ratee_id", uid).eq("ratee_type", "USER").eq("rating", 5),
        sb.from("ratings").select("*", { count: "exact", head: true }).eq("ratee_id", uid).eq("ratee_type", "USER"),
        sb.from("vouches").select("*", { count: "exact", head: true }).eq("from_user_id", uid),
      ]);

    const stats: Record<string, number> = {
      requests_posted:       reqRes.count       ?? 0,
      agreements_completed:  agCompleteRes.count ?? 0,
      agreements_responded:  agRespondRes.count  ?? 0,
      five_star_ratings:     fiveStarRes.count   ?? 0,
      total_ratings:         totalRatingsRes.count ?? 0,
      vouches_given:         vouchGivenRes.count  ?? 0,
    };

    return ACHIEVEMENT_DEFS.map((def) => {
      const current = stats[def.metric] ?? 0;
      const unlocked = current >= def.threshold;
      return {
        id:       def.id,
        emoji:    def.emoji,
        title:    def.title,
        desc:     def.desc,
        unlocked,
        progress: unlocked ? 1 : Math.min(current / def.threshold, 0.99),
      };
    });
  },

  // Collections have no backend yet (V2).
  async collections(): Promise<Collection[]> { return []; },
};
