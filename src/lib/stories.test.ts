import { describe, expect, it } from "vitest";
import type { Story } from "@/types";
import {
  MAX_SEEN, STORY_DEFAULT_HOURS, STORY_MAX_HOURS, clampStoryHours, firstUnseenIndex, groupStories, hoursLeft, isGroupSeen,
  loadSeen, neighbourGroupPointer, nextPointer, orderGroups, prevPointer, rememberSeen, ringTone, saveSeen, storyAge, storyOwnerKey,
} from "./stories";

let n = 0;
const story = (over: Partial<Story> = {}): Story => ({
  id: `s${++n}`, authorName: "Asha", authorAvatar: "", authorType: "user", userId: "u1", image: "i.jpg", caption: "", postedAt: "", expiresInHrs: 5,
  cta: "None", viewed: false, tapTarget: "/u/u1", createdAt: new Date(1_000_000 + n * 1000).toISOString(), visibility: "everyone", ...over,
});

describe("clampStoryHours", () => {
  it("keeps a duration inside 1 hour … 7 days", () => {
    expect(clampStoryHours(0)).toBe(1);
    expect(clampStoryHours(-5)).toBe(1);
    expect(clampStoryHours(1000)).toBe(STORY_MAX_HOURS);
    expect(clampStoryHours(24)).toBe(24);
  });
  it("rounds, and falls back to a day for something that is not a number", () => {
    expect(clampStoryHours(2.6)).toBe(3);
    expect(clampStoryHours(Number.NaN)).toBe(STORY_DEFAULT_HOURS);
    expect(clampStoryHours(Number.POSITIVE_INFINITY)).toBe(STORY_DEFAULT_HOURS);
  });
});

describe("groupStories", () => {
  it("merges one person's stories into one group, oldest first", () => {
    const a2 = story({ userId: "u1", createdAt: "2026-01-01T10:00:00Z" });
    const a1 = story({ userId: "u1", createdAt: "2026-01-01T08:00:00Z" });
    const b = story({ userId: "u2", authorName: "Bhanu" });
    const groups = groupStories([a2, b, a1]);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.key === "user:u1")!.stories.map((s) => s.id)).toEqual([a1.id, a2.id]);
  });

  it("keeps a shop's stories apart from its owner's personal ones", () => {
    const shop = story({ authorType: "business", businessId: "b1", userId: "u1", authorName: "Sharma Store" });
    const me = story({ userId: "u1" });
    expect(groupStories([shop, me]).map((g) => g.key).sort()).toEqual(["business:b1", "user:u1"]);
  });

  it("drops a muted author and a blocked person, but never your own stories", () => {
    const muted = story({ authorType: "business", businessId: "b9" });
    const blocked = story({ userId: "bad" });
    const mine = story({ userId: "me" });
    const keep = story({ userId: "ok" });
    const groups = groupStories([muted, blocked, mine, keep], {
      isMine: (s) => s.userId === "me",
      muted: new Set(["business:b9"]),
      blockedUserIds: new Set(["bad", "me"]),
    });
    expect(groups.map((g) => g.key).sort()).toEqual(["user:me", "user:ok"]);
    expect(groups.find((g) => g.key === "user:me")!.isMine).toBe(true);
  });
});

describe("orderGroups, ringTone", () => {
  const mk = (userId: string, ids: string[], when: string, vis = "everyone") =>
    groupStories(ids.map((id) => story({ id, userId, createdAt: when, visibility: vis })))[0];

  it("puts your reel first, then unseen (newest first), then everyone you have caught up with", () => {
    const mine = { ...mk("me", ["m1"], "2026-01-01T00:00:00Z"), isMine: true };
    const seenOld = mk("a", ["a1"], "2026-01-03T00:00:00Z");
    const freshOld = mk("b", ["b1"], "2026-01-01T00:00:00Z");
    const freshNew = mk("c", ["c1"], "2026-01-02T00:00:00Z");
    const order = orderGroups([seenOld, freshOld, freshNew, mine], new Set(["a1"])).map((g) => g.key);
    expect(order).toEqual(["user:me", "user:c", "user:b", "user:a"]);
  });

  it("is grey once everything is seen, green when something unseen is close-friends only, gradient otherwise", () => {
    const g = mk("a", ["x1", "x2"], "2026-01-01T00:00:00Z");
    expect(isGroupSeen(g, new Set(["x1", "x2"]))).toBe(true);
    expect(ringTone(g, new Set(["x1", "x2"]))).toBe("seen");
    expect(ringTone(g, new Set(["x1"]))).toBe("unseen");
    const close = mk("b", ["c1"], "2026-01-01T00:00:00Z", "close_friends");
    expect(ringTone(close, [])).toBe("close");
    expect(ringTone(close, ["c1"])).toBe("seen");
  });

  it("starts a group on its first unseen story, or the beginning when all are seen", () => {
    const g = mk("a", ["p1", "p2", "p3"], "2026-01-01T00:00:00Z");
    expect(firstUnseenIndex(g, new Set(["p1"]))).toBe(1);
    expect(firstUnseenIndex(g, new Set(["p1", "p2", "p3"]))).toBe(0);
  });
});

describe("pointers", () => {
  const groups = [{ stories: [1, 2] }, { stories: [1] }, { stories: [1, 2, 3] }];

  it("next: same person, then the next person, then close", () => {
    expect(nextPointer(groups, { group: 0, story: 0 })).toEqual({ group: 0, story: 1 });
    expect(nextPointer(groups, { group: 0, story: 1 })).toEqual({ group: 1, story: 0 });
    expect(nextPointer(groups, { group: 2, story: 2 })).toBe("close");
    expect(nextPointer([], { group: 0, story: 0 })).toBe("close");
  });

  it("previous: same person, else the last story of the previous person, else restart", () => {
    expect(prevPointer(groups, { group: 0, story: 1 })).toEqual({ group: 0, story: 0 });
    expect(prevPointer(groups, { group: 2, story: 0 })).toEqual({ group: 1, story: 0 });
    expect(prevPointer(groups, { group: 1, story: 0 })).toEqual({ group: 0, story: 1 });
    expect(prevPointer(groups, { group: 0, story: 0 })).toBe("restart");
  });

  it("swipe sideways jumps to the first story of the neighbour and stops at the ends", () => {
    expect(neighbourGroupPointer(groups, { group: 0, story: 1 }, 1)).toEqual({ group: 1, story: 0 });
    expect(neighbourGroupPointer(groups, { group: 1, story: 0 }, -1)).toEqual({ group: 0, story: 0 });
    expect(neighbourGroupPointer(groups, { group: 0, story: 0 }, -1)).toBeNull();
    expect(neighbourGroupPointer(groups, { group: 2, story: 1 }, 1)).toBeNull();
  });
});

describe("time", () => {
  const fmt = (unit: string, v: number) => (unit === "now" ? "now" : `${v}${unit}`);
  const now = Date.parse("2026-01-01T12:00:00Z");
  it("shows the compact age", () => {
    expect(storyAge("2026-01-01T11:59:40Z", fmt, now)).toBe("now");
    expect(storyAge("2026-01-01T11:15:00Z", fmt, now)).toBe("45m");
    expect(storyAge("2026-01-01T07:00:00Z", fmt, now)).toBe("5h");
    expect(storyAge("2025-12-30T12:00:00Z", fmt, now)).toBe("2d");
    expect(storyAge(undefined, fmt, now)).toBe("now");
  });
  it("counts the hours left from the real expiry, never below zero", () => {
    expect(hoursLeft({ expiresAt: "2026-01-01T15:00:00Z", expiresInHrs: 99 }, now)).toBe(3);
    expect(hoursLeft({ expiresAt: "2025-12-31T00:00:00Z", expiresInHrs: 99 }, now)).toBe(0);
    expect(hoursLeft({ expiresInHrs: 4 }, now)).toBe(4);
  });
  it("names an owner key for any author type", () => {
    expect(storyOwnerKey(story({ authorType: "provider", providerId: "p1", userId: "u1" }))).toBe("provider:p1");
  });
});

describe("seen persistence", () => {
  const fakeStorage = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };

  it("round-trips through storage", () => {
    const st = fakeStorage();
    saveSeen(["a", "b"], st);
    expect(loadSeen(st)).toEqual(["a", "b"]);
  });

  it("survives garbage and a missing/blocked storage", () => {
    const st = fakeStorage();
    st.setItem("stryt_viewed_stories", "{not json");
    expect(loadSeen(st)).toEqual([]);
    st.setItem("stryt_viewed_stories", JSON.stringify([1, "ok", null]));
    expect(loadSeen(st)).toEqual(["ok"]);
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(loadSeen(broken)).toEqual([]);
    expect(() => saveSeen(["a"], broken)).not.toThrow();
  });

  it("remembers an id once, returns the same array when nothing changed, and keeps the newest MAX_SEEN", () => {
    const base = ["a"];
    expect(rememberSeen(base, "a")).toBe(base);
    expect(rememberSeen(base, "b")).toEqual(["a", "b"]);
    const big = Array.from({ length: MAX_SEEN }, (_, i) => `id${i}`);
    const next = rememberSeen(big, "new");
    expect(next).toHaveLength(MAX_SEEN);
    expect(next[next.length - 1]).toBe("new");
    expect(next[0]).toBe("id1");
  });
});
