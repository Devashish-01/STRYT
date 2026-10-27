import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import type { TablesInsert } from "@/lib/dbTypes";
import { toCamel } from "@/lib/caseMap";
import { haversineKm } from "@/lib/geocode";
import { evaluateProviderAvailability } from "@/utils/availability";
import { aliasName } from "@/lib/publicName";
import { clampStoryHours } from "@/lib/stories";
import { uploadService } from "@/services/core/uploadService";
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
    createdAt:    (row.created_at as string | null) ?? undefined,
    expiresAt:    (row.expires_at as string | null) ?? undefined,
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
    isHighlighted: (row.is_highlighted as boolean) ?? false,
    hiddenAt: (row.hidden_at as string | null) ?? null,
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
  // A signed-out visitor may watch what is shared with everyone (the database already refuses the rest); it used to
  // return nothing here, so a guest never saw a single story and the Home strip could never appear for one.
  if (!uid) return storiesList.filter((s) => s.visibility !== "close_friends");
  return storiesList.filter((s) => {
    if (s.userId === uid) return true;
    if (s.hiddenUserIds && s.hiddenUserIds.includes(uid)) return false;
    if (s.visibility === "close_friends") {
      if (!s.allowedUserIds || !s.allowedUserIds.includes(uid)) return false;
    }
    return true;
  });
}

/** story_mutes arrives with 20261008, so the generated database types do not list it yet - an untyped handle
 *  until they are regenerated (same approach the code used for user_blocks when that was new). */
const storyMutes = () => (getSupabase() as unknown as { from: (t: string) => any }).from("story_mutes");

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
    const { data, error } = await sb.rpc("stories_nearby", {
      in_lng: lng,
      in_lat: lat,
      in_radius_km: radiusKm,
      in_limit: 50,
    });
    if (error) throw error;
    return filterStoriesByPrivacy((data ?? []).map(rowToStory));
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

  /** Everything you have live right now, oldest first - including what you posted as a shop or provider. */
  async myStories(): Promise<Story[]> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return [];
    const { data, error } = await sb
      .from("stories")
      .select("*")
      .eq("user_id", uid)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r) => rowToStory(r as Record<string, unknown>));
  },

  /** A shop's or provider's live stories plus its saved Highlights, newest first (the owner's own view of them). */
  async activeFor(ownerType: "business" | "provider", ownerId: string): Promise<Story[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("stories")
      .select("*")
      .eq("owner_type", ownerType)
      .eq("owner_id", ownerId)
      .or(`expires_at.gt.${new Date().toISOString()},is_highlighted.eq.true`)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => rowToStory(r as Record<string, unknown>));
  },

  /** Takes a story down for good: the row (its views and reactions go with it) and the photo. */
  async deleteStory(story: Pick<Story, "id" | "image">): Promise<void> {
    const sb = getSupabase();
    const { data, error } = await sb.from("stories").delete().eq("id", story.id).select("id");
    if (error) throw error;
    // RLS answers "not yours" with zero rows, not an error - say so instead of pretending it worked.
    if (!data || data.length === 0) throw new Error("STORY_NOT_DELETED");
    // The row is gone either way; a photo that will not delete is swept up by the daily purge.
    await uploadService.remove(story.image).catch(() => false);
  },

  /** Housekeeping: your own stories that expired a while ago (not Highlights) are deleted along with their photos,
   *  so a person who keeps using the app never leaves old photos waiting for the daily purge. Best effort. */
  async purgeMyExpiredStories(): Promise<number> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return 0;
    const cutoff = new Date(Date.now() - 3600_000).toISOString();
    const { data, error } = await sb
      .from("stories")
      .select("id, image_url")
      .eq("user_id", uid)
      .eq("is_highlighted", false)
      .lt("expires_at", cutoff)
      .limit(20);
    if (error || !data?.length) return 0;
    let removed = 0;
    for (const r of data as { id: string; image_url: string }[]) {
      try {
        await socialService.deleteStory({ id: r.id, image: r.image_url });
        removed++;
      } catch { /* held by an open report, or already gone - leave it */ }
    }
    return removed;
  },

  /** `business:<id>` style keys of the people/shops you muted. */
  async myStoryMutes(): Promise<Set<string>> {
    const uid = await currentUserId();
    if (!uid) return new Set();
    const { data, error } = await storyMutes().select("owner_type, owner_id").eq("user_id", uid);
    if (error) return new Set(); // before 20261008 is applied the table does not exist - nothing is muted
    return new Set((data ?? []).map((r: { owner_type: string; owner_id: string }) => `${r.owner_type}:${r.owner_id}`));
  },

  async muteStoryAuthor(ownerType: "user" | "business" | "provider", ownerId: string): Promise<void> {
    const uid = await currentUserId();
    if (!uid) return;
    const { error } = await storyMutes().upsert(
      { user_id: uid, owner_type: ownerType, owner_id: ownerId },
      { onConflict: "user_id,owner_type,owner_id", ignoreDuplicates: true },
    );
    if (error) throw error;
  },

  async unmuteStoryAuthor(ownerType: "user" | "business" | "provider", ownerId: string): Promise<void> {
    const uid = await currentUserId();
    if (!uid) return;
    const { error } = await storyMutes().delete()
      .eq("user_id", uid).eq("owner_type", ownerType).eq("owner_id", ownerId);
    if (error) throw error;
  },

  /** People you blocked (your own list only - what blocked you is hidden by the database, not told to the app). */
  async myBlockedIds(): Promise<Set<string>> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return new Set();
    const { data, error } = await sb.from("user_blocks").select("blocked_user_id").eq("blocker_user_id", uid);
    if (error) return new Set();
    return new Set((data ?? []).map((r: { blocked_user_id: string }) => r.blocked_user_id));
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
    const expiresAt = new Date(Date.now() + clampStoryHours(params.expiresInHrs) * 3600 * 1000).toISOString();
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
    const { error } = await sb.from("stories").insert(row as TablesInsert<"stories">);
    if (error) throw error;
  },

  async recordStoryView(storyId: string): Promise<void> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return;
    
    // A plain insert, never an upsert: ON CONFLICT needs the viewer to be able to read the row it touches, and
    // until 20261008 only the story's author could - every upsert here was refused, so no view was ever recorded.
    // 23505 = this person already viewed it, which is fine.
    const { error } = await sb.from("story_views").insert({ story_id: storyId, viewer_user_id: uid });
    if (error && error.code !== "23505") throw error;
  },

  async getStoryViewers(storyId: string): Promise<any[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("story_views")
      .select("created_at, reaction, viewer:users!viewer_user_id(id, name, alias, avatar, show_name_publicly)")
      .eq("story_id", storyId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data || []).map((v) => ({
      userId: v.viewer?.id,
      // Strangers see an alias, never a real name unless the person opted in (publicName.ts).
      name: aliasName({ alias: v.viewer?.alias, name: v.viewer?.name, showNamePublicly: v.viewer?.show_name_publicly }, "Neighbor"),
      avatar: v.viewer?.avatar,
      viewedAt: v.created_at,
      reaction: v.reaction ?? null,
    }));
  },

  /** Quick-reaction on a story — upserts onto the same story_views row recordStoryView already created. */
  async reactToStory(storyId: string, emoji: string): Promise<void> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return;
    // Update the row recordStoryView made; only when there is none yet, insert one with the reaction. (An upsert
    // cannot be used: see recordStoryView.) Errors are thrown so the viewer can say the reaction did not go through.
    const { data, error } = await sb.from("story_views")
      .update({ reaction: emoji })
      .eq("story_id", storyId)
      .eq("viewer_user_id", uid)
      .select("id");
    if (error) throw error;
    if (data && data.length > 0) return;
    const { error: insertError } = await sb.from("story_views").insert({ story_id: storyId, viewer_user_id: uid, reaction: emoji });
    if (insertError) throw insertError;
  },

  /** Save/unsave a story to the author's permanent "Highlights" reel — bypasses expires_at once set. */
  async setStoryHighlight(storyId: string, highlighted: boolean): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.from("stories").update({ is_highlighted: highlighted }).eq("id", storyId);
    if (error) throw error;
  },

  /** Signed-in user's own saved highlights — no expiry filter, unlike myStory(). */
  async myHighlights(): Promise<Story[]> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return [];
    const { data, error } = await sb
      .from("stories")
      .select("*")
      .eq("user_id", uid)
      .eq("is_highlighted", true)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToStory);
  },

  /** A business/provider's saved highlights, shown on its public detail page. */
  async highlightsFor(ownerType: "business" | "provider", ownerId: string): Promise<Story[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("stories")
      .select("*")
      .eq("owner_type", ownerType)
      .eq("owner_id", ownerId)
      .eq("is_highlighted", true)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToStory);
  },

  async searchNeighbors(queryStr: string): Promise<any[]> {
    const sb = getSupabase();
    // Privacy: users are findable ONLY by their public alias, never their real
    // name. The alias is returned as the display `name` for the result row.
    const { data, error } = await sb
      .from("users")
      .select("id, alias, avatar")
      .ilike("alias", `%${queryStr}%`)
      .not("alias", "is", null)
      .limit(10);
    if (error) throw error;
    return (data || []).map((r) => ({ id: r.id, name: r.alias, avatar: r.avatar }));
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

  // ── Mutual-follow check (both users follow each other, USER targets) ──
  // Used to gate community commenting in the UI (the server enforces the same
  // rule via the post_comments RLS policy / can_comment_on_post()).
  async isMutualFollow(otherUserId: string): Promise<boolean> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid || !otherUserId || uid === otherUserId) return false;
    const [{ count: iFollow }, { count: followsMe }] = await Promise.all([
      sb.from("follows").select("*", { count: "exact", head: true })
        .eq("follower_user_id", uid).eq("target_id", otherUserId).in("target_type", ["USER", "user"]),
      sb.from("follows").select("*", { count: "exact", head: true })
        .eq("follower_user_id", otherUserId).eq("target_id", uid).in("target_type", ["USER", "user"]),
    ]);
    return (iFollow ?? 0) > 0 && (followsMe ?? 0) > 0;
  },

  // ── Blocking (20260892) ───────────────────────────────────────
  // The moderation floor that had to exist before community comments stopped
  // being mutual-follow-only: a block bars commenting in BOTH directions, so it
  // can't be used to silence someone and then get the last word.
  //
  // RLS lets you read only your own blocks, deliberately — being able to see who
  // has blocked you turns a safety tool into a signal to make a second account.
  // So there is no "amIBlockedBy" here by design; the server-side
  // is_blocked_between() is what the comment gate consults.
  // `user_blocks` is new in 20260892 and therefore absent from the generated
  // database.types.ts, so the table handle is cast — the same approach the
  // codebase already uses for columns the generated types don't know yet.
  async blockUser(otherUserId: string): Promise<void> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid || !otherUserId || uid === otherUserId) return;
    const { error } = await sb.from("user_blocks")
      .upsert({ blocker_user_id: uid, blocked_user_id: otherUserId }, {
        onConflict: "blocker_user_id,blocked_user_id",
        ignoreDuplicates: true,
      });
    if (error) throw error;
  },

  async unblockUser(otherUserId: string): Promise<void> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid || !otherUserId) return;
    const { error } = await sb.from("user_blocks")
      .delete()
      .eq("blocker_user_id", uid)
      .eq("blocked_user_id", otherUserId);
    if (error) throw error;
  },

  /** Whether the signed-in user has blocked this person (their own list only). */
  async hasBlocked(otherUserId: string): Promise<boolean> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid || !otherUserId) return false;
    const { count } = await sb.from("user_blocks")
      .select("*", { count: "exact", head: true })
      .eq("blocker_user_id", uid)
      .eq("blocked_user_id", otherUserId);
    return (count ?? 0) > 0;
  },

  // ── Followers of a user (reverse of "who I follow") ─────────────
  async followers(userId: string): Promise<{ id: string; name: string; avatar: string }[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("follows")
      .select("follower_user_id, users!follower_user_id(name, alias, avatar)")
      .in("target_type", ["USER", "user"])
      .eq("target_id", userId)
      .limit(100);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.follower_user_id,
      name: aliasName({ alias: r.users?.alias, name: r.users?.name }),
      avatar: r.users?.avatar ?? "",
    }));
  },

  // ── Phase 38: Vouches ─────────────────────────────────────────
  /** How many neighbours have vouched, uncapped — the avatar list below is capped, and used to be the count too. */
  async vouchCount(providerId: string): Promise<number> {
    const sb = getSupabase();
    const { count, error } = await sb
      .from("vouches")
      .select("*", { count: "exact", head: true })
      .eq("provider_id", providerId);
    if (error) throw error;
    return count ?? 0;
  },

  async vouches(providerId: string): Promise<Vouch[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("vouches")
      .select("from_user_id, users!from_user_id(name, avatar)")
      .eq("provider_id", providerId)
      .limit(50);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      byUserId: r.from_user_id,
      byName:   r.users?.name ?? "Someone",
      byAvatar: r.users?.avatar ?? "",
    }));
  },

  async addVouch(providerId: string): Promise<void> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return;
    const { error } = await sb.from("vouches").upsert(
      { from_user_id: uid, provider_id: providerId },
      { onConflict: "from_user_id,provider_id" }
    );
    if (error) throw error;
  },

  async removeVouch(providerId: string): Promise<void> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return;
    const { error } = await sb.from("vouches").delete().eq("from_user_id", uid).eq("provider_id", providerId);
    if (error) throw error;
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
      const skill = (row as any).skill as string;
      const isMine = (row as any).from_user_id === uid;
      if (!skillMap[skill]) {
        skillMap[skill] = { count: 0, endorsed: false };
      }
      skillMap[skill].count++;
      if (isMine) skillMap[skill].endorsed = true;
    }
    return Object.entries(skillMap).map(([skill, s]) => ({ skill, count: s.count, endorsed: s.endorsed }));
  },

  async addEndorsement(providerId: string, skill: string): Promise<void> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return;
    const { error } = await sb.from("endorsements").upsert(
      { from_user_id: uid, provider_id: providerId, skill },
      { onConflict: "from_user_id,provider_id,skill" }
    );
    if (error) throw error;
  },

  async removeEndorsement(providerId: string, skill: string): Promise<void> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return;
    const { error } = await sb.from("endorsements").delete().eq("from_user_id", uid).eq("provider_id", providerId).eq("skill", skill);
    if (error) throw error;
  },

  // ── Phase 39: Leaderboard ────────────────────────────────────
  async leaderboard(): Promise<LeaderEntry[]> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("get_leaderboard");
    if (error) throw error;
    return (data ?? []).map((r) => ({
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
