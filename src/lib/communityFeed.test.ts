import { describe, it, expect } from "vitest";
import { mergeStream } from "./communityFeed";
import type { CommunityPost, RequestPost } from "@/types";

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
    createdAtISO: "2026-01-01T00:00:00.000Z",
    likes: 0,
    liked: false,
    commentsCount: 0,
    ...over,
  } as CommunityPost;
}

function groupBuy(over: Partial<RequestPost> = {}): RequestPost {
  return {
    id: "r1",
    requesterUserId: "u1",
    requesterName: "R",
    requesterAvatar: "",
    requesterRating: 0,
    title: "gb",
    description: "",
    categoryId: null,
    categoryName: "cat",
    area: "KP",
    distanceKm: 1,
    radiusKm: 5,
    deadline: "",
    postedAt: "now",
    createdAt: "2026-01-01T00:00:00.000Z",
    status: "OPEN",
    isBoosted: false,
    viewCount: 0,
    photos: [],
    proposals: [],
    isGroupBuy: true,
    ...over,
  } as RequestPost;
}

describe("mergeStream", () => {
  it("returns posts unchanged when there are no group buys", () => {
    const posts = [post({ id: "p1" }), post({ id: "p2" })];
    const merged = mergeStream(posts, [], "recent");
    expect(merged).toEqual([
      { kind: "post", id: "p1", post: posts[0] },
      { kind: "post", id: "p2", post: posts[1] },
    ]);
  });

  it("pins group buys above the stream for trending and nearest — no fake ranking", () => {
    const posts = [post({ id: "p1" })];
    const groupBuys = [groupBuy({ id: "r1" })];
    for (const sort of ["trending", "nearest"] as const) {
      const merged = mergeStream(posts, groupBuys, sort);
      expect(merged.map((i) => i.id)).toEqual(["r1", "p1"]);
      expect(merged[0].kind).toBe("groupbuy");
    }
  });

  it("interleaves by created-at, newest first, under recent", () => {
    const posts = [
      post({ id: "p-old", createdAtISO: "2026-01-01T00:00:00.000Z" }),
      post({ id: "p-new", createdAtISO: "2026-01-03T00:00:00.000Z" }),
    ];
    const groupBuys = [groupBuy({ id: "r-mid", createdAt: "2026-01-02T00:00:00.000Z" })];
    const merged = mergeStream(posts, groupBuys, "recent");
    expect(merged.map((i) => i.id)).toEqual(["p-new", "r-mid", "p-old"]);
  });

  it("produces no duplicate ids even when interleaving", () => {
    const posts = [post({ id: "p1" }), post({ id: "p2" }), post({ id: "p3" })];
    const groupBuys = [groupBuy({ id: "r1" }), groupBuy({ id: "r2" })];
    const merged = mergeStream(posts, groupBuys, "recent");
    const ids = merged.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(5);
  });

  it("is stable under appendPage — recomputing with more posts never reorders an already-placed group buy relative to older posts", () => {
    const groupBuys = [groupBuy({ id: "r1", createdAt: "2026-01-02T00:00:00.000Z" })];
    const page1 = [post({ id: "p1", createdAtISO: "2026-01-01T00:00:00.000Z" })];
    const merged1 = mergeStream(page1, groupBuys, "recent");
    expect(merged1.map((i) => i.id)).toEqual(["r1", "p1"]);

    // Simulate appendPage growing the post list with an OLDER page-2 post —
    // r1 must still sort ahead of both, and p1 must still sort ahead of the
    // newly appended older post.
    const page1And2 = [...page1, post({ id: "p0", createdAtISO: "2025-12-01T00:00:00.000Z" })];
    const merged2 = mergeStream(page1And2, groupBuys, "recent");
    expect(merged2.map((i) => i.id)).toEqual(["r1", "p1", "p0"]);
  });

  it("treats a group buy with no createdAt as oldest, never jumping it above dated content", () => {
    const posts = [post({ id: "p1", createdAtISO: "2020-01-01T00:00:00.000Z" })];
    const groupBuys = [groupBuy({ id: "r1", createdAt: undefined })];
    const merged = mergeStream(posts, groupBuys, "recent");
    expect(merged.map((i) => i.id)).toEqual(["p1", "r1"]);
  });

  it("treats an unparseable createdAt the same as missing — oldest, not crashing", () => {
    const posts = [post({ id: "p1", createdAtISO: "2020-01-01T00:00:00.000Z" })];
    const groupBuys = [groupBuy({ id: "r1", createdAt: "not-a-date" })];
    const merged = mergeStream(posts, groupBuys, "recent");
    expect(merged.map((i) => i.id)).toEqual(["p1", "r1"]);
  });

  it("preserves group-buy relative order among themselves when pinned as a block", () => {
    const groupBuys = [groupBuy({ id: "r-first" }), groupBuy({ id: "r-second" })];
    const merged = mergeStream([], groupBuys, "trending");
    expect(merged.map((i) => i.id)).toEqual(["r-first", "r-second"]);
  });
});
