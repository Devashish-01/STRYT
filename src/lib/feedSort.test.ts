import { describe, it, expect } from "vitest";
import {
  DEFAULT_FEED_SORT,
  FEED_SORTS,
  appendPage,
  availableSorts,
  countUnseen,
  normalizeFeedSort,
  sortPostsLocally,
  typeParam,
} from "./feedSort";
import type { CommunityPost } from "@/types";

function post(over: Partial<CommunityPost> = {}): CommunityPost {
  return {
    id: "p1",
    type: "RECOMMENDATION",
    authorName: "N",
    authorAvatar: "",
    title: "t",
    body: "",
    area: "KP",
    distanceKm: 1,
    postedAt: "now",
    likes: 0,
    liked: false,
    commentsCount: 0,
    ...over,
  };
}

describe("sort choice is always one we implement", () => {
  it("passes through the three real sorts", () => {
    for (const s of FEED_SORTS) {
      expect(normalizeFeedSort(s.value)).toBe(s.value);
    }
  });

  it.each([["hot"], [""], [null], [undefined], [42], [{}]])("falls back for %s", (v) => {
    // A stale deep link or a restored preference must never reach the RPC
    // unchecked.
    expect(normalizeFeedSort(v)).toBe(DEFAULT_FEED_SORT);
  });

  it("hides Nearest when there's no location to measure from", () => {
    const withLoc = availableSorts(true).map((s) => s.value);
    const without = availableSorts(false).map((s) => s.value);
    expect(withLoc).toContain("nearest");
    expect(without).not.toContain("nearest");
    // The other two stay available either way.
    expect(without).toEqual(["recent", "trending"]);
  });
});

describe("merging pages never duplicates or loses a post", () => {
  it("appends genuinely new posts", () => {
    const merged = appendPage([post({ id: "a" })], [post({ id: "b" }), post({ id: "c" })]);
    expect(merged.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("drops a post the previous page already showed", () => {
    // Offset pagination re-serves rows when something new is inserted between
    // pages — this is the duplicate-React-key bug, not a hypothetical.
    const merged = appendPage([post({ id: "a" }), post({ id: "b" })], [post({ id: "b" }), post({ id: "c" })]);
    expect(merged.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("returns the same array when the incoming page is empty or fully duplicated", () => {
    const existing = [post({ id: "a" })];
    expect(appendPage(existing, [])).toBe(existing);
    expect(appendPage(existing, [post({ id: "a" })])).toBe(existing);
  });

  it("keeps the existing order rather than re-sorting", () => {
    // The server decided the order; re-sorting here would fight it.
    const merged = appendPage([post({ id: "z" }), post({ id: "a" })], [post({ id: "m" })]);
    expect(merged.map((p) => p.id)).toEqual(["z", "a", "m"]);
  });
});

describe("the new-posts count", () => {
  const loaded = [post({ id: "a" }), post({ id: "b" })];

  it("counts only posts not already on screen", () => {
    expect(countUnseen(["c", "d"], loaded)).toBe(2);
    expect(countUnseen(["a", "c"], loaded)).toBe(1);
    expect(countUnseen(["a", "b"], loaded)).toBe(0);
  });

  it("counts a repeated realtime event once", () => {
    // Realtime can deliver the same insert more than once on reconnect; the pill
    // must not read "3 new posts" for one post.
    expect(countUnseen(["c", "c", "c"], loaded)).toBe(1);
  });

  it("is zero with nothing new", () => {
    expect(countUnseen([], loaded)).toBe(0);
  });
});

describe("local sorting fallback", () => {
  it("leaves 'recent' untouched — the server already ordered it", () => {
    const posts = [post({ id: "a" }), post({ id: "b" })];
    expect(sortPostsLocally(posts, "recent")).toBe(posts);
  });

  it("ranks trending by engagement decayed against age", () => {
    const now = Date.now();
    const fresh = post({ id: "fresh", likes: 2, commentsCount: 0, createdAtISO: new Date(now - 3600_000).toISOString() });
    const oldPopular = post({ id: "old", likes: 60, commentsCount: 0, createdAtISO: new Date(now - 30 * 24 * 3600_000).toISOString() });
    const ranked = sortPostsLocally([oldPopular, fresh], "trending");
    // A month-old post with 60 likes should not outrank an hour-old one with 2.
    expect(ranked[0].id).toBe("fresh");
  });

  it("does not mutate the array it was given", () => {
    const posts = [post({ id: "a", distanceKm: 9 }), post({ id: "b", distanceKm: 1 })];
    const before = posts.map((p) => p.id);
    sortPostsLocally(posts, "nearest");
    expect(posts.map((p) => p.id)).toEqual(before);
  });

  it("sorts nearest ascending and puts unknown distances last", () => {
    const posts = [
      post({ id: "far", distanceKm: 9 }),
      post({ id: "unknown", distanceKm: undefined as unknown as number }),
      post({ id: "near", distanceKm: 0.4 }),
    ];
    // "Unknown" must not read as "here" — a post with no distance sorting first
    // would put the least-located posts at the top of a distance sort.
    expect(sortPostsLocally(posts, "nearest").map((p) => p.id)).toEqual(["near", "far", "unknown"]);
  });

  it("treats a genuine zero distance as closest, not as missing", () => {
    const posts = [post({ id: "one", distanceKm: 1 }), post({ id: "zero", distanceKm: 0 })];
    expect(sortPostsLocally(posts, "nearest")[0].id).toBe("zero");
  });
});

describe("the type filter parameter", () => {
  it("sends null for ALL so the RPC returns every type", () => {
    expect(typeParam("ALL")).toBeNull();
  });

  it("passes a specific type through", () => {
    expect(typeParam("GIVEAWAY")).toBe("GIVEAWAY");
  });
});
