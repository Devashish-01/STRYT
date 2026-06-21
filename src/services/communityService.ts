import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import { throwIfError } from "@/lib/supabasePage";
import { toCamel } from "@/lib/caseMap";
import type { CommunityPost, Comment } from "@/types";

/** Safely parse poll_options whether stored as a JSONB array or (legacy) JSON string. */
function parsePollOpts(raw: any): { id: string; label: string }[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return null;
}

/** Map a DB community_posts row → CommunityPost shape, enriched with like/vote state. */
function mapPost(
  row: Record<string, any>,
  likedIds: Set<string>,
  userVotes: Record<string, string>,
  voteCounts: Record<string, Record<string, number>>
): CommunityPost {
  const pollOptions = parsePollOpts(row.poll_options)?.map((o) => ({
    ...o,
    votes: voteCounts[row.id]?.[o.id] ?? 0,
  }));
  return {
    id: row.id,
    type: row.type,
    authorName: row.author_name,
    authorAvatar: row.author_avatar,
    title: row.title,
    body: row.body ?? "",
    area: row.area ?? "",
    distanceKm: 0.5, // static for now — geo coming later
    postedAt: relLabel(row.created_at),
    image: row.image ?? undefined,
    likes: row.likes_count ?? 0,
    liked: likedIds.has(row.id),
    commentsCount: row.comments_count ?? 0,
    pollOptions,
    votedOptionId: userVotes[row.id] ?? null,
    recommendations: row.recommendations ?? undefined,
    resolved: row.resolved ?? false,
  };
}

function relLabel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.floor(h / 24)} day ago`;
}

export const communityService = {
  async feed(opts: { lat?: number; lng?: number; radiusKm?: number } = {}): Promise<CommunityPost[]> {
    const sb = getSupabase();
    const uid = await currentUserId();

    // 1. Posts — use geo RPC when user coords are available, otherwise global feed.
    let rows: any[] | null = null;
    let error: any = null;
    if (opts.lat && opts.lng) {
      const res = await sb.rpc("community_posts_nearby", {
        in_lat: opts.lat,
        in_lng: opts.lng,
        in_radius_km: opts.radiusKm ?? 10,
        in_limit: 50,
        in_offset: 0,
      });
      rows = res.data;
      error = res.error;
    } else {
      const res = await sb
        .from("community_posts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      rows = res.data;
      error = res.error;
    }
    throwIfError(error);
    if (!rows || rows.length === 0) return [];

    const postIds = rows.map((r: any) => r.id);

    // 2. Current user's likes
    const likedIds = new Set<string>();
    if (uid) {
      const { data: likes } = await sb
        .from("post_likes")
        .select("post_id")
        .eq("user_id", uid)
        .in("post_id", postIds);
      (likes ?? []).forEach((l: any) => likedIds.add(l.post_id));
    }

    // 3. Current user's votes
    const userVotes: Record<string, string> = {};
    if (uid) {
      const { data: votes } = await sb
        .from("poll_votes")
        .select("post_id, option_id")
        .eq("user_id", uid)
        .in("post_id", postIds);
      (votes ?? []).forEach((v: any) => { userVotes[v.post_id] = v.option_id; });
    }

    // 4. All vote counts for poll posts
    const voteCounts: Record<string, Record<string, number>> = {};
    const pollIds = rows.filter((r: any) => r.poll_options).map((r: any) => r.id);
    if (pollIds.length > 0) {
      const { data: allVotes } = await sb
        .from("poll_votes")
        .select("post_id, option_id")
        .in("post_id", pollIds);
      (allVotes ?? []).forEach((v: any) => {
        if (!voteCounts[v.post_id]) voteCounts[v.post_id] = {};
        voteCounts[v.post_id][v.option_id] = (voteCounts[v.post_id][v.option_id] ?? 0) + 1;
      });
    }

    return rows.map((r: any) => mapPost(r, likedIds, userVotes, voteCounts));
  },

  async get(id: string): Promise<CommunityPost | undefined> {
    const sb = getSupabase();
    const uid = await currentUserId();
    const { data: row, error } = await sb
      .from("community_posts")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    throwIfError(error);
    if (!row) return undefined;

    const likedIds = new Set<string>();
    if (uid) {
      const { data } = await sb.from("post_likes").select("post_id").eq("user_id", uid).eq("post_id", id);
      if (data?.length) likedIds.add(id);
    }
    const userVotes: Record<string, string> = {};
    if (uid) {
      const { data } = await sb.from("poll_votes").select("option_id").eq("user_id", uid).eq("post_id", id);
      if (data?.[0]) userVotes[id] = data[0].option_id;
    }
    const voteCounts: Record<string, Record<string, number>> = {};
    if (row.poll_options) {
      const { data } = await sb.from("poll_votes").select("option_id").eq("post_id", id);
      voteCounts[id] = {};
      (data ?? []).forEach((v: any) => {
        voteCounts[id][v.option_id] = (voteCounts[id][v.option_id] ?? 0) + 1;
      });
    }
    return mapPost(row, likedIds, userVotes, voteCounts);
  },

  async create(data: Partial<CommunityPost> & { lat?: number; lng?: number }): Promise<CommunityPost> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw new Error("Not authenticated");

    const { data: me } = await sb.from("users").select("name, alias, avatar, lat, lng").eq("id", uid).maybeSingle();
    const lat = data.lat ?? (me as any)?.lat ?? null;
    const lng = data.lng ?? (me as any)?.lng ?? null;

    const pollOpts = data.pollOptions?.map((o) => ({ id: o.id, label: o.label })) ?? null;

    const { data: created, error } = await sb.from("community_posts").insert({
      author_user_id: uid,
      // #6 privacy: post under the public alias, never the real name.
      author_name: (me as any)?.alias || (me as any)?.name || "Neighbor",
      author_avatar: (me as any)?.avatar ?? "",
      type: data.type,
      title: data.title,
      body: data.body ?? "",
      area: data.area ?? "",
      image: data.image ?? null,
      poll_options: pollOpts,
      lat,
      lng,
    }).select().maybeSingle();
    throwIfError(error);
    return toCamel<CommunityPost>(created);
  },

  /** Toggle like on a post. Returns new liked state. */
  async like(postId: string, currentlyLiked: boolean): Promise<boolean> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return currentlyLiked;

    // Fetch current count first (read-modify-write; fine at MVP scale).
    const { data: cur } = await sb
      .from("community_posts").select("likes_count").eq("id", postId).maybeSingle();
    const count = (cur as any)?.likes_count ?? 0;

    if (currentlyLiked) {
      await sb.from("post_likes").delete().eq("post_id", postId).eq("user_id", uid);
      await sb.from("community_posts").update({ likes_count: Math.max(0, count - 1) }).eq("id", postId);
      return false;
    } else {
      try { await sb.from("post_likes").insert({ post_id: postId, user_id: uid }); } catch { /* duplicate */ }
      await sb.from("community_posts").update({ likes_count: count + 1 }).eq("id", postId);
      return true;
    }
  },

  async vote(postId: string, optionId: string): Promise<void> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return;
    await sb.from("poll_votes").upsert(
      { post_id: postId, user_id: uid, option_id: optionId },
      { onConflict: "post_id,user_id", ignoreDuplicates: true }
    );
  },

  async comments(postId: string): Promise<Comment[]> {
    const sb = getSupabase();
    const uid = await currentUserId();
    // Need the post owner to decide who may see "owner-only" shared numbers (#8).
    const { data: post } = await sb.from("community_posts").select("author_user_id").eq("id", postId).maybeSingle();
    const ownerId = (post as any)?.author_user_id ?? null;

    const { data, error } = await sb
      .from("post_comments")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });
    throwIfError(error);
    return (data ?? []).map((r: any) => {
      // A shared number is visible if public, or to the post owner, or to the
      // commenter who shared it. Gated here so owner-only numbers aren't exposed.
      const canSeePhone = !!r.shared_phone && (
        r.phone_visibility === "PUBLIC" || uid === ownerId || uid === r.author_user_id
      );
      return {
        id: r.id,
        authorName: r.author_name,
        authorAvatar: r.author_avatar,
        body: r.body,
        time: relLabel(r.created_at),
        listingType: r.listing_type ?? undefined,
        listingId: r.listing_id ?? undefined,
        sharedPhone: canSeePhone ? r.shared_phone : undefined,
        phoneVisibility: r.phone_visibility ?? undefined,
      };
    });
  },

  async addComment(
    postId: string,
    body: string,
    opts: { listingType?: string; listingId?: string; sharedPhone?: string; phoneVisibility?: "OWNER" | "PUBLIC" } = {}
  ): Promise<Comment> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw new Error("Not authenticated");
    const { data: me } = await sb.from("users").select("name, alias, avatar").eq("id", uid).maybeSingle();
    const { listingType, listingId, sharedPhone, phoneVisibility } = opts;

    const { data: created, error } = await sb.from("post_comments").insert({
      post_id: postId,
      author_user_id: uid,
      // #6 privacy: comment under the public alias.
      author_name: (me as any)?.alias || (me as any)?.name || "Neighbor",
      author_avatar: (me as any)?.avatar ?? "",
      body,
      listing_type: listingType ?? null,
      listing_id: listingId ?? null,
      shared_phone: sharedPhone || null,
      phone_visibility: sharedPhone ? (phoneVisibility ?? "OWNER") : null,
    }).select().maybeSingle();
    throwIfError(error);

    // Increment comments_count
    const { data: cur } = await sb.from("community_posts").select("comments_count").eq("id", postId).maybeSingle();
    await sb.from("community_posts").update({ comments_count: ((cur as any)?.comments_count ?? 0) + 1 }).eq("id", postId);

    return {
      id: (created as any).id,
      authorName: (created as any).author_name,
      authorAvatar: (created as any).author_avatar,
      body: (created as any).body,
      time: "just now",
      listingType: listingType as any,
      listingId,
      sharedPhone: sharedPhone || undefined,
      phoneVisibility: sharedPhone ? (phoneVisibility ?? "OWNER") : undefined,
    };
  },

  /** Attach a recommendation (listing link) to a RECOMMENDATION-type post. */
  async recommendListing(postId: string, listingType: "BUSINESS" | "PROVIDER", listingId: string, byName: string): Promise<void> {
    const sb = getSupabase();
    const { data: post } = await sb.from("community_posts").select("recommendations").eq("id", postId).maybeSingle();
    const existing = (post as any)?.recommendations ?? [];
    const updated = [...existing, { listingType, listingId, byName }];
    const { error } = await sb.from("community_posts").update({ recommendations: updated }).eq("id", postId);
    throwIfError(error);
  },
};
