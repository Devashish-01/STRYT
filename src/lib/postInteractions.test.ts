import { describe, it, expect } from "vitest";
import {
  DOUBLE_TAP_MS,
  DOUBLE_TAP_SLOP_PX,
  HIDDEN_POSTS_KEY,
  MUTED_AUTHORS_KEY,
  addToIdList,
  doubleTapAction,
  filterFeed,
  isDoubleTap,
  muteTargetId,
  postShareSubtitle,
  postShareUrl,
  readIdList,
  removeFromIdList,
  writeIdList,
  type ListStorage,
  type TapRecord,
} from "./postInteractions";

function memStorage(seed: Record<string, string> = {}): ListStorage & { map: Map<string, string> } {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => { map.set(k, v); },
  };
}

const tap = (over: Partial<TapRecord> = {}): TapRecord => ({ time: 1000, x: 100, y: 200, ...over });

describe("double-tap detection", () => {
  it("recognises a quick second tap in the same place", () => {
    expect(isDoubleTap(tap(), tap({ time: 1000 + DOUBLE_TAP_MS - 50 }))).toBe(true);
  });

  it("ignores a second tap that came too late", () => {
    expect(isDoubleTap(tap(), tap({ time: 1000 + DOUBLE_TAP_MS + 1 }))).toBe(false);
  });

  it("ignores a second tap that landed too far away", () => {
    // This is the tap-scroll-tap case: the finger ends up somewhere else, and
    // treating that as a double-tap would like posts by accident.
    expect(isDoubleTap(tap(), tap({ time: 1100, y: 200 + DOUBLE_TAP_SLOP_PX + 1 }))).toBe(false);
    expect(isDoubleTap(tap(), tap({ time: 1100, x: 100 + DOUBLE_TAP_SLOP_PX + 1 }))).toBe(false);
  });

  it("accepts small movement within the slop", () => {
    expect(isDoubleTap(tap(), tap({ time: 1100, x: 100 + DOUBLE_TAP_SLOP_PX, y: 200 - DOUBLE_TAP_SLOP_PX }))).toBe(true);
  });

  it("treats a first tap as no double-tap", () => {
    expect(isDoubleTap(null, tap())).toBe(false);
  });

  it("survives a clock that jumps backwards", () => {
    expect(isDoubleTap(tap({ time: 5000 }), tap({ time: 1000 }))).toBe(false);
  });
});

describe("what a double-tap does", () => {
  it("likes an unliked post", () => {
    expect(doubleTapAction(false)).toBe("LIKE");
  });

  it("never UNLIKES an already-liked post", () => {
    // A double-tap on something already liked is almost always a mis-tap while
    // scrolling. Silently removing the like would be a destructive surprise, so
    // unliking stays deliberate via the button.
    expect(doubleTapAction(true)).toBe("REPLAY_BURST");
  });
});

describe("hidden posts and muted authors persist", () => {
  it("round-trips through storage", () => {
    const store = memStorage();
    addToIdList(HIDDEN_POSTS_KEY, "p1", store);
    addToIdList(HIDDEN_POSTS_KEY, "p2", store);
    expect(readIdList(HIDDEN_POSTS_KEY, store)).toEqual(["p1", "p2"]);
  });

  it("never stores the same id twice", () => {
    const store = memStorage();
    addToIdList(MUTED_AUTHORS_KEY, "u1", store);
    addToIdList(MUTED_AUTHORS_KEY, "u1", store);
    expect(readIdList(MUTED_AUTHORS_KEY, store)).toEqual(["u1"]);
  });

  it("unmuting removes only that id", () => {
    const store = memStorage();
    writeIdList(MUTED_AUTHORS_KEY, ["u1", "u2", "u3"], store);
    removeFromIdList(MUTED_AUTHORS_KEY, "u2", store);
    expect(readIdList(MUTED_AUTHORS_KEY, store)).toEqual(["u1", "u3"]);
  });

  it("keeps the newest entries when the list is capped", () => {
    const store = memStorage();
    const many = Array.from({ length: 500 }, (_, i) => `p${i}`);
    writeIdList(HIDDEN_POSTS_KEY, many, store);
    const back = readIdList(HIDDEN_POSTS_KEY, store);
    expect(back.length).toBeLessThan(many.length);
    expect(back).toContain("p499"); // most recent survived
    expect(back).not.toContain("p0"); // oldest fell off
  });

  it("treats corrupt or missing storage as an empty list", () => {
    expect(readIdList(HIDDEN_POSTS_KEY, memStorage({ [HIDDEN_POSTS_KEY]: "{oops" }))).toEqual([]);
    expect(readIdList(HIDDEN_POSTS_KEY, memStorage({ [HIDDEN_POSTS_KEY]: '"notanarray"' }))).toEqual([]);
    expect(readIdList(HIDDEN_POSTS_KEY, null)).toEqual([]);
  });

  it("drops non-string junk rather than rendering it", () => {
    const store = memStorage({ [HIDDEN_POSTS_KEY]: JSON.stringify(["p1", 42, null, "", "p2"]) });
    expect(readIdList(HIDDEN_POSTS_KEY, store)).toEqual(["p1", "p2"]);
  });

  it("doesn't throw when storage refuses writes", () => {
    const denying: ListStorage = {
      getItem: () => null,
      setItem: () => { throw new Error("full"); },
    };
    expect(() => addToIdList(HIDDEN_POSTS_KEY, "p1", denying)).not.toThrow();
  });
});

describe("filtering the feed", () => {
  const posts = [
    { id: "p1", authorUserId: "u1", authorRefId: undefined },
    { id: "p2", authorUserId: "u2", authorRefId: undefined },
    { id: "p3", authorUserId: "u1", authorRefId: "b1" }, // u1 posting as their shop
    { id: "p4", authorUserId: undefined, authorRefId: "b2" },
  ];

  it("returns the same list when nothing is hidden or muted", () => {
    expect(filterFeed(posts, [], [])).toBe(posts); // identity, no needless copy
  });

  it("removes a hidden post and nothing else", () => {
    expect(filterFeed(posts, ["p2"], []).map((p) => p.id)).toEqual(["p1", "p3", "p4"]);
  });

  it("muting an author also removes the posts they made as their business", () => {
    // Muting a shop owner must not half-work: p3 is the same person posting
    // under a business identity.
    expect(filterFeed(posts, [], ["u1"]).map((p) => p.id)).toEqual(["p2", "p4"]);
  });

  it("muting a business-only author works via the ref id", () => {
    expect(filterFeed(posts, [], ["b2"]).map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("hiding and muting compose", () => {
    expect(filterFeed(posts, ["p2"], ["u1"]).map((p) => p.id)).toEqual(["p4"]);
  });

  it("mute targets the underlying user so every identity is covered", () => {
    expect(muteTargetId({ authorUserId: "u1", authorRefId: "b1" })).toBe("u1");
    expect(muteTargetId({ authorUserId: undefined, authorRefId: "b1" })).toBe("b1");
    expect(muteTargetId({ authorUserId: undefined, authorRefId: undefined })).toBeNull();
  });
});

describe("sharing", () => {
  it("builds a deep link to the post", () => {
    expect(postShareUrl("abc", "https://stryt.app")).toBe("https://stryt.app/community/abc");
  });

  it("degrades to a path when there is no origin, never to 'undefined'", () => {
    const url = postShareUrl("abc", "");
    expect(url).toBe("/community/abc");
    expect(url).not.toContain("undefined");
  });

  it("describes a post by who and where", () => {
    expect(postShareSubtitle({ authorName: "Priya", area: "Koramangala", postedAt: "2h ago" }))
      .toBe("Priya · Koramangala");
  });

  it("falls back to something meaningful with no author or area", () => {
    expect(postShareSubtitle({ authorName: "", area: "", postedAt: "" })).toBe("STRYT community");
  });
});
