import type { CommunityPost, CommunityPostType } from "@/types";
import { trendingScore } from "./trending";

/**
 * Feed ordering and page-merge rules.
 *
 * The sort used to be a two-state toggle applied to whatever was already in
 * memory. Making it server-backed changes what the client is responsible for:
 * it no longer ranks, but it does have to merge pages without duplicating or
 * losing rows, and it has to notice when the server's order and its own
 * assumptions disagree.
 */

export type FeedSort = "recent" | "trending" | "nearest";

export interface FeedSortMeta {
  value: FeedSort;
  label: string;
  /** Shown in the sort sheet under the label. */
  hint: string;
  emoji: string;
}

export const FEED_SORTS: readonly FeedSortMeta[] = [
  { value: "recent", label: "Recent", hint: "Newest first", emoji: "🕒" },
  { value: "trending", label: "Trending", hint: "Busiest right now, nearby", emoji: "🔥" },
  { value: "nearest", label: "Nearest", hint: "Closest to you first", emoji: "📍" },
] as const;

export const FEED_SORT_META: Record<FeedSort, FeedSortMeta> =
  FEED_SORTS.reduce((acc, m) => {
    acc[m.value] = m;
    return acc;
  }, {} as Record<FeedSort, FeedSortMeta>);

export const DEFAULT_FEED_SORT: FeedSort = "recent";

/** Accept only sorts we actually implement. A value from a stale deep link or a
 *  restored preference must never be passed through to the RPC unchecked. */
export function normalizeFeedSort(v: unknown): FeedSort {
  return v === "trending" || v === "nearest" || v === "recent" ? v : DEFAULT_FEED_SORT;
}

/** "Nearest" is meaningless without the viewer's location, so the option is
 *  hidden rather than offered and silently ignored. */
export function availableSorts(hasLocation: boolean): readonly FeedSortMeta[] {
  return hasLocation ? FEED_SORTS : FEED_SORTS.filter((s) => s.value !== "nearest");
}

/**
 * Append the next page, dropping any post already held.
 *
 * Duplicates are a real possibility, not a theoretical one: the feed is
 * offset-paginated, so a post created between page 1 and page 2 shifts
 * everything down by one and re-serves the last row of page 1. Rendering it
 * twice would also produce duplicate React keys.
 */
export function appendPage<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  if (incoming.length === 0) return existing;
  const seen = new Set(existing.map((p) => p.id));
  const fresh = incoming.filter((p) => !seen.has(p.id));
  if (fresh.length === 0) return existing;
  return [...existing, ...fresh];
}

/**
 * How many of the posts the realtime channel told us about aren't on screen yet.
 *
 * The feed deliberately does NOT auto-insert them: yanking the list while
 * someone is reading is the single most disorienting thing a feed can do. This
 * count drives a "N new posts" pill they can tap when ready.
 */
export function countUnseen(newIds: string[], loaded: { id: string }[]): number {
  if (newIds.length === 0) return 0;
  const onScreen = new Set(loaded.map((p) => p.id));
  return new Set(newIds.filter((id) => !onScreen.has(id))).size;
}

/**
 * Client-side ordering, used only as a fallback for the pre-migration path
 * (a client that has updated before `community_posts_feed` exists, where the
 * service falls back to the old RPC) and to keep an optimistically-inserted
 * post in its rightful place.
 *
 * Not the primary ranking any more — see the migration comment for why ranking
 * a single page was misleading.
 */
export function sortPostsLocally(posts: CommunityPost[], sort: FeedSort): CommunityPost[] {
  if (sort === "recent") return posts;
  const copy = [...posts];
  if (sort === "trending") {
    copy.sort((a, b) => trendingScore(b) - trendingScore(a));
    return copy;
  }
  copy.sort((a, b) => {
    // A post with no distance sorts last rather than first — "unknown" is not
    // "here". Number.isFinite guards the 0-vs-undefined trap.
    const da = Number.isFinite(a.distanceKm) ? a.distanceKm : Infinity;
    const db = Number.isFinite(b.distanceKm) ? b.distanceKm : Infinity;
    return da - db;
  });
  return copy;
}

/** The `in_type` argument for the feed RPC: null means every type. */
export function typeParam(filter: "ALL" | CommunityPostType): CommunityPostType | null {
  return filter === "ALL" ? null : filter;
}
