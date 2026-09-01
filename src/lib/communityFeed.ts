import type { CommunityPost, RequestPost } from "@/types";
import type { FeedSort } from "./feedSort";

export type FeedItem =
  | { kind: "post"; id: string; post: CommunityPost }
  | { kind: "groupbuy"; id: string; request: RequestPost };

function toPostItem(p: CommunityPost): FeedItem {
  return { kind: "post", id: p.id, post: p };
}

function toGroupBuyItem(r: RequestPost): FeedItem {
  return { kind: "groupbuy", id: r.id, request: r };
}

/**
 * Interleave the open group-buy set into the paginated community-posts stream.
 *
 * Group buys are always fetched as ONE complete page — requestService.feed
 * with `special: "group"` returns every open pool, and CommunityHub caps it
 * at DEFAULT_LIMIT. Posts are not: community_posts_feed is cursor-paginated,
 * and `posts` here may be one page or several appended together. That
 * asymmetry is exactly why this can't try to rank group buys against
 * "trending" or "nearest" — there is no whole-set trending/nearest ordering
 * to fairly insert a fully-materialised set into, only a per-page one. So
 * under those two sorts, group buys are pinned as a block above the post
 * stream instead of pretending to be ranked among it. Only "recent" has a
 * real shared axis (time) to interleave on.
 *
 * Pure and stateless — safe to recompute on every render as `posts` grows via
 * appendPage(). Nothing here mutates or reorders group buys relative to each
 * other beyond the sort, so a re-render with more posts loaded never
 * reshuffles a group buy that was already on screen.
 */
export function mergeStream(posts: CommunityPost[], groupBuys: RequestPost[], sort: FeedSort): FeedItem[] {
  const postItems = posts.map(toPostItem);
  if (groupBuys.length === 0) return postItems;
  const gbItems = groupBuys.map(toGroupBuyItem);

  if (sort !== "recent") return [...gbItems, ...postItems];

  const timeOf = (item: FeedItem): number => {
    const iso = item.kind === "post" ? item.post.createdAtISO : item.request.createdAt;
    const t = iso ? Date.parse(iso) : NaN;
    // No timestamp sorts as OLDEST, not newest — an item with unknown age must
    // never jump above real, dated content just because it's missing a field.
    return Number.isFinite(t) ? t : -Infinity;
  };

  return [...gbItems, ...postItems].sort((a, b) => timeOf(b) - timeOf(a));
}
