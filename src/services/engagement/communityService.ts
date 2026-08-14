import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import { cursorToRange, throwIfError } from "@/lib/supabasePage";
import { toCamel } from "@/lib/caseMap";
import type { CommunityPost, Comment } from "@/types";
import { haversineKm } from "@/lib/geocode";
import { aliasName } from "@/lib/publicName";
import { MAX_POST_MEDIA } from "@/lib/communityTypes";
import {
  DEFAULT_COMMENT_POLICY,
  gateCopy,
  resolveCommentPolicy,
  type CommentGateReason,
} from "@/lib/commentPolicy";
import { normalizeFeedSort, type FeedSort } from "@/lib/feedSort";
import { extractAliases, isValidReaction } from "@/lib/mentions";
import type { CommentPolicy, CommunityPostType } from "@/types";
import type { Page } from "@/lib/apiClient";

function makePage<T>(rows: T[], count: number | null, from: number, limit: number): Page<T> {
  const nextStart = from + rows.length;
  const hasMore = count != null ? nextStart < count : rows.length === limit;
  return {
    data: rows,
    page: { next_cursor: hasMore ? String(nextStart) : null, has_more: hasMore },
  };
}

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
  voteCounts: Record<string, Record<string, number>>,
  userLat?: number,
  userLng?: number,
  savedIds?: Set<string>
): CommunityPost {
  const p = toCamel<CommunityPost>(row);
  p.likes = Number(row.likes_count) || 0;
  p.liked = likedIds.has(p.id);
  // New column not in the generated DB types — read via `as any`. Defaults to
  // false so older rows (pre-migration) behave as "comments off".
  p.allowComments = (row as any).allow_comments ?? false;
  // Who may comment. resolveCommentPolicy reads the newer `comment_policy`
  // column when present and otherwise translates the legacy boolean —
  // `allow_comments = true` meant "on, mutual follows only", i.e. MUTUALS, so an
  // old post can't be widened just by shipping this code.
  p.commentPolicy = resolveCommentPolicy({
    commentPolicy: (row as any).comment_policy ?? null,
    allowComments: (row as any).allow_comments ?? null,
  });
  p.hideLikeCount = (row as any).hide_like_count === true;
  // A save is private to the viewer, so it's only ever "true" for rows the
  // caller looked up for themselves — never inferred from anyone else's.
  p.saved = savedIds ? savedIds.has(p.id) : false;

  // The rich per-type columns from 20260891 (image_alt, poll_ends_at, severity,
  // expires_at, last_seen, reward, pickup_note, tagged_listing) need no work
  // here — toCamel already maps them, and every one is optional on
  // CommunityPost so a pre-migration row simply leaves them undefined.
  //
  // `media` is the exception: a row written before that migration has only
  // `image`, so it's surfaced as a one-item array. Callers then read one field
  // instead of branching on which era the row is from (see postMedia()).
  const media = (row as any).media;
  p.media = Array.isArray(media) && media.length > 0
    ? media.filter((m: unknown): m is string => typeof m === "string" && m.length > 0)
    : (row.image ? [row.image] : []);

  // Poll options & counts
  const rawOpts = parsePollOpts((row as any).poll_options);
  if (rawOpts) {
    const postVoteMap = voteCounts[p.id] ?? {};
    const totalVotes = Object.values(postVoteMap).reduce((a, b) => a + b, 0);
    p.pollOptions = rawOpts.map((o) => {
      const cnt = postVoteMap[o.id] ?? 0;
      return {
        ...o,
        votes: cnt,
      };
    });
    p.votedOptionId = userVotes[p.id] ?? null;
  }

  p.postedAt = relLabel(row.created_at);
  p.createdAtISO = row.created_at;
  if (userLat != null && userLng != null && row.lat != null && row.lng != null) {
    p.distanceKm = Math.round(haversineKm(userLat, userLng, row.lat, row.lng) * 10) / 10;
  } else {
    p.distanceKm = (p as any).distance_km ?? 0.5;
  }
  return p;
}

function relLabel(iso: string): string {
  if (!iso) return "recently";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.floor(h / 24)} day ago`;
}

export const communityService = {
  async feed(
    opts: {
      lat?: number;
      lng?: number;
      radiusKm?: number;
      cursor?: string | null;
      /** Server-side post-type filter. Omit/null for every type. */
      type?: CommunityPostType | null;
      /** Server-side ordering. See community_posts_feed (20260894). */
      sort?: FeedSort;
    } = {}
  ): Promise<Page<CommunityPost>> {
    const sb = getSupabase();
    const uid = await currentUserId();

    const saved = localStorage.getItem("settings_radius");
    const radiusLimit = opts.radiusKm ?? (saved ? parseFloat(saved) : 5);
    const { from, to, limit } = cursorToRange(opts.cursor, 20);
    const sort = normalizeFeedSort(opts.sort);
    const typeFilter = opts.type ?? null;

    // 1. Posts. community_posts_feed does the radius, the type filter AND the
    //    ordering server-side, which is what makes "trending" mean the whole
    //    feed rather than the page already in memory, and what lets a filtered
    //    view paginate at all.
    let rows: any[] | null = null;
    let error: any = null;
    let count: number | null = null;

    const res = await (sb.rpc as any)("community_posts_feed", {
      in_lat: opts.lat ?? null,
      in_lng: opts.lng ?? null,
      in_radius_km: radiusLimit,
      in_limit: limit,
      in_offset: from,
      in_type: typeFilter,
      in_sort: sort,
    });
    rows = res.data;
    error = res.error;

    if (error) {
      // The RPC is missing (migration 20260894 not applied yet, or an older
      // deployment). Fall back to the previous behaviour rather than showing an
      // empty community: the old 5-arg RPC for the geo case, a plain select
      // otherwise. Type filtering and non-recent sorts are then applied
      // client-side by the caller, which is exactly what used to happen.
      if (opts.lat && opts.lng) {
        const legacy = await sb.rpc("community_posts_nearby", {
          in_lat: opts.lat,
          in_lng: opts.lng,
          in_radius_km: radiusLimit,
          in_limit: limit,
          in_offset: from,
        });
        rows = legacy.data;
        error = legacy.error;
      } else {
        const legacy = await sb
          .from("community_posts")
          .select("*", { count: "exact" })
          // Time-boxed posts (alerts, polls) drop out once they're done.
          // Author-scoped reads (byAuthor / byAuthorRef) deliberately DON'T
          // filter — an author's own expired alert is still their history.
          .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
          .order("created_at", { ascending: false })
          .range(from, to);
        rows = legacy.data;
        error = legacy.error;
        count = legacy.count;
      }
    }
    throwIfError(error);
    if (!rows || rows.length === 0) return makePage([], count, from, limit);

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

    // 3b. Current user's saves — same shape as likes above. RLS restricts this
    // table to the caller's own rows, so there's nothing else it could return.
    const savedIds = new Set<string>();
    if (uid) {
      const { data: saves } = await (sb.from as any)("post_saves")
        .select("post_id")
        .eq("user_id", uid)
        .in("post_id", postIds);
      (saves ?? []).forEach((s: any) => savedIds.add(s.post_id));
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

    // The radius is enforced server-side (community_posts_feed, and the legacy
    // RPC before it). This client-side pass stays as a belt-and-braces guard for
    // the no-coords fallback path, which has no radius predicate at all.
    const posts = rows
      .map((r: any) => mapPost(r, likedIds, userVotes, voteCounts, opts.lat, opts.lng, savedIds))
      .filter((post) => {
        if (opts.lat && opts.lng && post.lat && post.lng) {
          return post.distanceKm <= radiusLimit;
        }
        return true;
      });
    // has_more is derived from the RAW row count, not the filtered one. Using
    // the filtered length would end pagination early: a page where the guard
    // above dropped one row would look like a short (final) page, and the rest
    // of the feed would become unreachable.
    return { data: posts, page: makePage(rows, count, from, limit).page };
  },

  async get(id: string, lat?: number, lng?: number): Promise<CommunityPost | undefined> {
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
    const savedIds = new Set<string>();
    if (uid) {
      const { data } = await (sb.from as any)("post_saves")
        .select("post_id")
        .eq("user_id", uid)
        .eq("post_id", id);
      if (data?.length) savedIds.add(id);
    }
    return mapPost(row, likedIds, userVotes, voteCounts, lat, lng, savedIds);
  },

  /** Community posts authored by a given user (e.g. a business owner). */
  async byAuthor(userId: string): Promise<CommunityPost[]> {
    const sb = getSupabase();
    const uid = await currentUserId();
    const { data, error } = await sb
      .from("community_posts")
      .select("*")
      .eq("author_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    throwIfError(error);
    const rows = data ?? [];
    if (rows.length === 0) return [];
    const likedIds = new Set<string>();
    if (uid) {
      const { data: likes } = await sb
        .from("post_likes")
        .select("post_id")
        .eq("user_id", uid)
        .in("post_id", rows.map((r: any) => r.id));
      (likes ?? []).forEach((l: any) => likedIds.add(l.post_id));
    }
    return rows.map((r: any) => mapPost(r, likedIds, {}, {}));
  },

  /** Community posts made "as" a specific business/provider — used on that seller's public Posts tab. */
  async byAuthorRef(authorType: "business" | "provider", refId: string): Promise<CommunityPost[]> {
    const sb = getSupabase();
    const uid = await currentUserId();
    const { data, error } = await sb
      .from("community_posts")
      .select("*")
      .eq("author_type", authorType)
      .eq("author_ref_id", refId)
      .order("created_at", { ascending: false })
      .limit(30);
    throwIfError(error);
    const rows = data ?? [];
    if (rows.length === 0) return [];
    const likedIds = new Set<string>();
    if (uid) {
      const { data: likes } = await sb
        .from("post_likes")
        .select("post_id")
        .eq("user_id", uid)
        .in("post_id", rows.map((r: any) => r.id));
      (likes ?? []).forEach((l: any) => likedIds.add(l.post_id));
    }
    return rows.map((r: any) => mapPost(r, likedIds, {}, {}));
  },

  async create(data: Partial<CommunityPost> & { lat?: number; lng?: number }): Promise<CommunityPost> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw new Error("Not authenticated");

    // lat/lng aren't selectable via a plain query anymore (ISS-009) —
    // get_own_coords() is a SECURITY DEFINER RPC scoped to auth.uid().
    const [{ data: me }, { data: coords }] = await Promise.all([
      sb.from("users").select("name, alias, avatar, show_name_publicly").eq("id", uid).maybeSingle(),
      sb.rpc("get_own_coords").maybeSingle(),
    ]);
    const lat = data.lat ?? (coords as any)?.lat ?? null;
    const lng = data.lng ?? (coords as any)?.lng ?? null;

    const pollOpts = data.pollOptions?.map((o) => ({ id: o.id, label: o.label })) ?? null;

    // Posting "as" a business/provider still stamps the real signed-in user for
    // ownership — only the displayed identity (name/avatar/type) changes.
    const authorType = data.authorType ?? "user";
    // Posting as a business/provider uses their real public name (passed in);
    // a plain user's fallback identity is their alias/first-name, unless they
    // opted in to showNamePublicly.
    const authorName = data.authorName || aliasName({ alias: (me as any)?.alias, name: (me as any)?.name, showNamePublicly: (me as any)?.show_name_publicly });
    const authorAvatar = data.authorAvatar || (me as any)?.avatar || "";

    // Who may comment. The composer sends an explicit policy; the boolean is
    // only consulted for a caller that predates it (older OTA bundle), where
    // `true` meant the mutual-follow rule.
    const commentPolicy: CommentPolicy = data.commentPolicy
      ?? (data.allowComments === true ? "MUTUALS" : data.allowComments === false ? "OFF" : DEFAULT_COMMENT_POLICY);
    // Kept in step for those older clients — the DB trigger does this too, but
    // sending both keeps the returned row correct without a re-read.
    const allowComments = commentPolicy !== "OFF";

    // Photos: `media` is the source of truth, `image` mirrors media[0] so every
    // pre-existing read path (feed card, profile Posts tab, notification
    // thumbnails) keeps rendering without being touched. Kept in step here
    // rather than trusting the caller to send both consistently.
    const media = (data.media ?? (data.image ? [data.image] : [])).filter((m) => !!m).slice(0, MAX_POST_MEDIA);
    const cover = media[0] ?? null;

    const { data: created, error } = await sb.from("community_posts").insert({
      author_user_id: uid,
      author_type: authorType,
      author_ref_id: data.authorRefId ?? null,
      author_name: authorName,
      author_avatar: authorAvatar,
      type: data.type!,
      title: data.title!,
      body: data.body ?? "",
      area: data.area ?? "",
      image: cover,
      poll_options: pollOpts,
      // `allow_comments` and everything below it are columns absent from the
      // generated types — the whole payload is cast `as any` so TS doesn't
      // reject the unknown keys.
      allow_comments: allowComments,
      comment_policy: commentPolicy,
      hide_like_count: data.hideLikeCount === true,
      media,
      image_alt: media.length > 0 ? (data.imageAlt ?? null) : null,
      // Per-type fields. draftToCreateInput() has already nulled the ones that
      // don't belong to this type, so a POLL can't arrive carrying a severity.
      poll_ends_at: data.pollEndsAt ?? null,
      severity: data.severity ?? null,
      expires_at: data.expiresAt ?? null,
      last_seen: data.lastSeen ?? null,
      reward: data.reward ?? null,
      pickup_note: data.pickupNote ?? null,
      tagged_listing: data.taggedListing ?? null,
      lat,
      lng,
    } as any).select().maybeSingle();
    throwIfError(error);
    const post = toCamel<CommunityPost>(created);
    post.likes = Number(created?.likes_count) || 0;
    post.liked = false;
    post.allowComments = allowComments;
    post.commentPolicy = commentPolicy;
    post.hideLikeCount = data.hideLikeCount === true;
    post.media = media;
    return post;
  },

  async like(postId: string, currentlyLiked: boolean): Promise<boolean> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return currentlyLiked;

    // Apply the toggle on the source-of-truth table first.
    if (currentlyLiked) {
      await sb.from("post_likes").delete().eq("post_id", postId).eq("user_id", uid);
    } else {
      try { await sb.from("post_likes").insert({ post_id: postId, user_id: uid }); } catch { /* duplicate */ }
    }

    // Recount from post_likes so the denormalized counter can never drift or go
    // negative (the old read-modify-write did both under races / bad seed data).
    const { count } = await sb
      .from("post_likes")
      .select("*", { count: "exact", head: true })
      .eq("post_id", postId);
    await sb.from("community_posts").update({ likes_count: count ?? 0 }).eq("id", postId);
    return !currentlyLiked;
  },

  /**
   * Save/unsave a post for later (20260893). Distinct from `like`, which is a
   * public signal to the author and bumps a visible counter — a save is private
   * and has no counter at all, so there's nothing to recount here.
   */
  async toggleSave(postId: string, currentlySaved: boolean): Promise<boolean> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return currentlySaved;
    if (currentlySaved) {
      const { error } = await (sb.from as any)("post_saves")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", uid);
      throwIfError(error);
    } else {
      // Upsert rather than insert: a double-tap on Save shouldn't surface a
      // primary-key violation as a failure the user has to understand.
      const { error } = await (sb.from as any)("post_saves")
        .upsert({ post_id: postId, user_id: uid }, { onConflict: "post_id,user_id", ignoreDuplicates: true });
      throwIfError(error);
    }
    return !currentlySaved;
  },

  /** The viewer's own saved posts, newest save first. */
  async savedPosts(): Promise<CommunityPost[]> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return [];
    const { data: saves, error } = await (sb.from as any)("post_saves")
      .select("post_id")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(50);
    throwIfError(error);
    const ids = (saves ?? []).map((s: any) => s.post_id);
    if (ids.length === 0) return [];

    const { data: rows } = await sb.from("community_posts").select("*").in("id", ids);
    const likedIds = new Set<string>();
    const { data: likes } = await sb.from("post_likes").select("post_id").eq("user_id", uid).in("post_id", ids);
    (likes ?? []).forEach((l: any) => likedIds.add(l.post_id));
    const savedIds = new Set<string>(ids);
    // Ordered by when they were SAVED, not when they were posted — that's the
    // order the user built this list in.
    const byId = new Map<string, any>((rows ?? []).map((r: any) => [r.id, r]));
    return ids
      .map((pid: string) => byId.get(pid))
      .filter(Boolean)
      .map((r: any) => mapPost(r, likedIds, {}, {}, undefined, undefined, savedIds));
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
    const { data: post } = await sb.from("community_posts").select("author_user_id").eq("id", postId).maybeSingle();
    const ownerId = (post as any)?.author_user_id ?? null;

    const { data, error } = await sb
      .from("post_comments")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });
    throwIfError(error);
    const rows = data ?? [];
    if (rows.length === 0) return [];

    // Reaction tallies, in one query for the whole thread rather than per
    // comment. Counts are public (same as post_likes), so this needs no
    // per-viewer branching — only `myReaction` is viewer-specific.
    const commentIds = rows.map((r: any) => r.id);
    const tallies: Record<string, Record<string, number>> = {};
    const mine: Record<string, string> = {};
    const { data: reactions } = await (sb.from as any)("comment_reactions")
      .select("comment_id, user_id, emoji")
      .in("comment_id", commentIds);
    (reactions ?? []).forEach((r: any) => {
      if (!tallies[r.comment_id]) tallies[r.comment_id] = {};
      tallies[r.comment_id][r.emoji] = (tallies[r.comment_id][r.emoji] ?? 0) + 1;
      if (uid && r.user_id === uid) mine[r.comment_id] = r.emoji;
    });

    return rows.map((r: any) => {
      // The number is stored on the comment at share-time (reading another user's
      // live phone is blocked by RLS for privacy). Show it only to those allowed.
      const canSeePhone = !!r.shared_phone && (
        r.phone_visibility === "PUBLIC" || uid === ownerId || uid === r.author_user_id
      );
      return {
        id: r.id,
        authorName: r.author_name,
        authorAvatar: r.author_avatar,
        authorUserId: r.author_user_id ?? undefined,
        body: r.body,
        time: relLabel(r.created_at),
        createdAtISO: r.created_at ?? undefined,
        parentId: r.parent_id ?? null,
        listingType: r.listing_type ?? undefined,
        listingId: r.listing_id ?? undefined,
        sharedPhone: canSeePhone ? r.shared_phone : undefined,
        phoneVisibility: r.phone_visibility ?? undefined,
        mentions: Array.isArray(r.mentions) ? r.mentions : [],
        reactions: tallies[r.id] ?? {},
        myReaction: mine[r.id] ?? null,
      };
    });
  },

  /**
   * Why the signed-in user can (or can't) comment on this post, straight from
   * the function the RLS policy uses. The screen renders the composer or an
   * explanation from this, so the interface and the database can't disagree —
   * which is what happened when the screen re-implemented "comments on + mutual
   * follow" itself and knew nothing about blocks, distance, or rate limits.
   */
  async commentGate(postId: string): Promise<CommentGateReason> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return "SIGN_IN";
    const { data, error } = await (sb.rpc as any)("comment_gate_reason", { p_post_id: postId });
    // A failed probe must not silently close a thread the user can actually
    // comment on — let them try and have RLS be the arbiter.
    if (error) return "OK";
    return (data as CommentGateReason) ?? "OK";
  },

  async addComment(
    postId: string,
    body: string,
    opts: { listingType?: string; listingId?: string; sharedPhone?: string; phoneVisibility?: "OWNER" | "PUBLIC"; authorName?: string; authorAvatar?: string; parentId?: string | null } = {}
  ): Promise<Comment> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw new Error("Not authenticated");

    // Friendly pre-check so the UI can state a specific reason instead of
    // surfacing a bare RLS rejection. This asks the SAME function the INSERT
    // policy uses (comment_gate_reason wraps can_comment_on_post), rather than
    // re-deriving the rule client-side the way this used to: the old version
    // hardcoded "comments on + mutual follow", which is now only one of four
    // policies, and it couldn't see blocks or the rate limit at all.
    // The RLS policy remains the actual enforcement.
    const { data: reason } = await (sb.rpc as any)("comment_gate_reason", { p_post_id: postId });
    if (reason && reason !== "OK") {
      throw new Error(gateCopy(reason as CommentGateReason).message || "You can't comment on this post");
    }

    const { data: me } = await sb.from("users").select("name, alias, avatar, show_name_publicly").eq("id", uid).maybeSingle();
    const { listingType, listingId, sharedPhone, phoneVisibility, authorName, authorAvatar, parentId } = opts;

    // Resolve @aliases to user ids so the mention can become a profile link and
    // can notify the person (Task 8). Matched on ALIAS ONLY — the same rule
    // socialService.searchNeighbors follows, so a mention can never be used to
    // confirm somebody's real name.
    const aliases = extractAliases(body);
    let mentions: { userId: string; alias: string }[] = [];
    if (aliases.length > 0) {
      const { data: mentioned } = await sb
        .from("users")
        .select("id, alias")
        .in("alias", aliases)
        .limit(10);
      mentions = (mentioned ?? [])
        // Mentioning yourself is legal to write but pointless to record — it
        // would only generate a notification about your own comment.
        .filter((u: any) => u.alias && u.id !== uid)
        .map((u: any) => ({ userId: u.id, alias: u.alias }));
    }

    const { data: created, error } = await sb.from("post_comments").insert({
      post_id: postId,
      author_user_id: uid,
      author_name: authorName || aliasName({ alias: (me as any)?.alias, name: (me as any)?.name, showNamePublicly: (me as any)?.show_name_publicly }),
      author_avatar: authorAvatar || ((me as any)?.avatar ?? ""),
      body,
      parent_id: parentId ?? null,
      listing_type: listingType ?? null,
      listing_id: listingId ?? null,
      shared_phone: sharedPhone || null,
      phone_visibility: sharedPhone ? (phoneVisibility ?? "OWNER") : null,
      mentions,
    } as any).select().maybeSingle();
    throwIfError(error);

    const { data: cur } = await sb.from("community_posts").select("comments_count").eq("id", postId).maybeSingle();
    await sb.from("community_posts").update({ comments_count: ((cur as any)?.comments_count ?? 0) + 1 }).eq("id", postId);

    return {
      id: (created as any).id,
      authorName: (created as any).author_name,
      authorAvatar: (created as any).author_avatar,
      authorUserId: uid,
      body: (created as any).body,
      time: "just now",
      createdAtISO: (created as any).created_at ?? new Date().toISOString(),
      parentId: parentId ?? null,
      listingType: listingType as any,
      listingId,
      sharedPhone: sharedPhone || undefined,
      phoneVisibility: sharedPhone ? (phoneVisibility ?? "OWNER") : undefined,
      mentions,
      reactions: {},
      myReaction: null,
    };
  },

  /**
   * Set, change, or clear the viewer's reaction to a comment.
   *
   * One reaction per person per comment (the table's primary key), so tapping a
   * different emoji REPLACES rather than accumulates — that's what makes "how
   * many people found this useful" a countable thing instead of a tally of taps.
   * Passing the emoji already selected clears it, which is how a toggle reads.
   */
  async reactToComment(commentId: string, emoji: string | null): Promise<void> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return;
    if (!emoji) {
      const { error } = await (sb.from as any)("comment_reactions")
        .delete()
        .eq("comment_id", commentId)
        .eq("user_id", uid);
      throwIfError(error);
      return;
    }
    if (!isValidReaction(emoji)) throw new Error("That reaction isn't available");
    const { error } = await (sb.from as any)("comment_reactions")
      .upsert(
        { comment_id: commentId, user_id: uid, emoji },
        { onConflict: "comment_id,user_id" }
      );
    throwIfError(error);
  },

  async recommendListing(postId: string, listingType: "BUSINESS" | "PROVIDER", listingId: string, byName: string): Promise<void> {
    const sb = getSupabase();
    const { data: post } = await sb.from("community_posts").select("recommendations").eq("id", postId).maybeSingle();
    const existing = (post as any)?.recommendations ?? [];
    const updated = [...existing, { listingType, listingId, byName }];
    const { error } = await sb.from("community_posts").update({ recommendations: updated }).eq("id", postId);
    throwIfError(error);
  },

  /** Author-only edit — goes through community_post_update (SECURITY DEFINER,
   *  checks author_user_id) rather than a raw table write, unlike the
   *  likes/comments-count/recommendations writes above.
   *
   *  `media` is passed explicitly (not derived from `image`) so an edit that
   *  removes the 2nd of 3 photos is expressible. The RPC keeps `image` equal to
   *  media[0] on its side, so the two columns can't drift apart. */
  async update(
    postId: string,
    patch: { title: string; body?: string; image?: string | null; media?: string[]; imageAlt?: string | null }
  ): Promise<void> {
    const sb = getSupabase();
    const media = patch.media
      ? patch.media.filter((m) => !!m).slice(0, MAX_POST_MEDIA)
      : undefined;
    const { error } = await (sb.rpc as any)("community_post_update", {
      p_id: postId,
      p_title: patch.title,
      p_body: patch.body ?? null,
      p_image: (media ? media[0] : patch.image) ?? null,
      // Omitted (undefined) rather than null when the caller didn't specify:
      // the RPC treats null as "no media given" and falls back to p_image, which
      // is what an older OTA bundle still calling the 4-arg shape needs.
      ...(media ? { p_media: media } : {}),
      p_image_alt: patch.imageAlt ?? null,
    });
    throwIfError(error);
  },

  /** Author-only delete — cascades comments/likes/votes server-side. */
  async delete(postId: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await (sb.rpc as any)("community_post_delete", { p_id: postId });
    throwIfError(error);
  },

  /** Author-only — the "Resolved" badge is only ever shown, never settable,
   *  without this. */
  async setResolved(postId: string, resolved: boolean): Promise<void> {
    const sb = getSupabase();
    const { error } = await (sb.rpc as any)("community_post_set_resolved", { p_id: postId, p_resolved: resolved });
    throwIfError(error);
  },
};
