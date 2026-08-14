import type { CommunityPost } from "@/types";

/**
 * Feed-card interaction logic: double-tap detection, the locally-held
 * hide/mute lists, and share text. Pure and DOM-free so each rule can be
 * tested — these are the behaviours where an off-by-a-little (a double-tap
 * window that also catches a scroll, a mute that doesn't survive a reload)
 * is invisible in code review and obvious in the hand.
 */

/* ------------------------------------------------------------------ *
 * Double-tap
 * ------------------------------------------------------------------ */

/** Long enough for a deliberate second tap, short enough that two unrelated
 *  taps on the same card don't merge into one. iOS uses ~300ms for its own
 *  double-tap; 300 is also comfortably under the ~500ms where a second tap
 *  starts feeling like a separate action. */
export const DOUBLE_TAP_MS = 300;

/** Two taps further apart than this on-screen are two different targets, not a
 *  double-tap — this is what stops a tap-scroll-tap from registering. */
export const DOUBLE_TAP_SLOP_PX = 40;

export interface TapRecord {
  time: number;
  x: number;
  y: number;
}

/**
 * Whether `tap` completes a double-tap that began at `previous`.
 * Returns false when there's no previous tap, when it's too old, or when the
 * finger has moved too far — a scroll gesture ends with the finger somewhere
 * else, and treating that as a double-tap would like posts by accident.
 */
export function isDoubleTap(previous: TapRecord | null, tap: TapRecord): boolean {
  if (!previous) return false;
  if (tap.time - previous.time > DOUBLE_TAP_MS) return false;
  if (tap.time < previous.time) return false; // clock went backwards; treat as fresh
  return Math.abs(tap.x - previous.x) <= DOUBLE_TAP_SLOP_PX
    && Math.abs(tap.y - previous.y) <= DOUBLE_TAP_SLOP_PX;
}

/**
 * What a double-tap should do given the current like state.
 *
 * Instagram's rule, and the right one: double-tap LIKES, it never unlikes.
 * A double-tap on something already liked is almost always someone tapping to
 * see the burst again or mis-tapping while scrolling — silently removing the
 * like would be a destructive surprise. Unliking stays deliberate, via the
 * button.
 */
export function doubleTapAction(currentlyLiked: boolean): "LIKE" | "REPLAY_BURST" {
  return currentlyLiked ? "REPLAY_BURST" : "LIKE";
}

/* ------------------------------------------------------------------ *
 * Hidden posts & muted authors
 * ------------------------------------------------------------------ */

// Client-side lists. These are a "show me less of this" preference rather than
// a moderation action (blocking, which IS server-side — see socialService), so
// they live in localStorage: no reason to publish a record of what someone
// scrolled past, and no round trip before the row disappears.
export const HIDDEN_POSTS_KEY = "stryt_hidden_posts";
export const MUTED_AUTHORS_KEY = "stryt_muted_authors";

/** Bounded so the list can't grow without limit on a heavy user; the oldest
 *  entries fall off, which is the right trade for a soft preference. */
const MAX_LIST = 400;

export interface ListStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readIdList(key: string, storage: ListStorage | null): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string" && v.length > 0);
  } catch {
    return [];
  }
}

export function writeIdList(key: string, ids: string[], storage: ListStorage | null): string[] {
  // De-duplicate and keep the newest at the end, then trim from the front.
  const unique = Array.from(new Set(ids)).slice(-MAX_LIST);
  if (storage) {
    try {
      storage.setItem(key, JSON.stringify(unique));
    } catch {
      // Storage full or unavailable — the in-memory list still applies for this
      // session, which is better than failing the interaction.
    }
  }
  return unique;
}

export function addToIdList(key: string, id: string, storage: ListStorage | null): string[] {
  return writeIdList(key, [...readIdList(key, storage), id], storage);
}

export function removeFromIdList(key: string, id: string, storage: ListStorage | null): string[] {
  return writeIdList(key, readIdList(key, storage).filter((v) => v !== id), storage);
}

/**
 * Whose posts to drop from a feed. Hiding is per-post; muting is per-author and
 * covers every identity a person posts under — a muted author's business posts
 * must go too, or muting a shop owner would only half-work.
 */
export function filterFeed<T extends Pick<CommunityPost, "id" | "authorUserId" | "authorRefId">>(
  posts: T[],
  hiddenPostIds: string[],
  mutedAuthorIds: string[]
): T[] {
  if (hiddenPostIds.length === 0 && mutedAuthorIds.length === 0) return posts;
  const hidden = new Set(hiddenPostIds);
  const muted = new Set(mutedAuthorIds);
  return posts.filter((p) => {
    if (hidden.has(p.id)) return false;
    if (p.authorUserId && muted.has(p.authorUserId)) return false;
    if (p.authorRefId && muted.has(p.authorRefId)) return false;
    return true;
  });
}

/** The id to mute so every identity this post's author uses is covered. Prefers
 *  the underlying user, which is stamped on the row even when a post goes out
 *  under a business/provider name. */
export function muteTargetId(post: Pick<CommunityPost, "authorUserId" | "authorRefId">): string | null {
  return post.authorUserId || post.authorRefId || null;
}

/* ------------------------------------------------------------------ *
 * Sharing
 * ------------------------------------------------------------------ */

/** Deep link to a post. Relative-safe: falls back to a path when there's no
 *  window (SSR/test), so callers never interpolate "undefined" into a URL. */
export function postShareUrl(postId: string, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/community/${postId}`;
}

/** Subtitle for the share sheet: where and when, which is what makes a
 *  neighborhood post worth opening. */
export function postShareSubtitle(post: Pick<CommunityPost, "area" | "postedAt" | "authorName">): string {
  const parts = [post.authorName, post.area].filter((s) => !!s && s.length > 0);
  return parts.join(" · ") || "STRYT community";
}
