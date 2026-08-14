import { describe, it, expect } from "vitest";
import {
  COMMENT_REACTIONS,
  applyMention,
  extractAliases,
  isValidReaction,
  mentionQueryAt,
  parseBody,
  pruneMentions,
  sortComments,
  type MentionRef,
} from "./mentions";

const PRIYA: MentionRef = { userId: "u1", alias: "priya_s" };
const ROHAN: MentionRef = { userId: "u2", alias: "rohan" };

describe("rendering a body with mentions", () => {
  it("links a resolved mention and keeps the surrounding text", () => {
    const segs = parseBody("thanks @priya_s for this", [PRIYA]);
    expect(segs).toEqual([
      { kind: "text", text: "thanks " },
      { kind: "mention", text: "@priya_s", alias: "priya_s", userId: "u1" },
      { kind: "text", text: " for this" },
    ]);
  });

  it("leaves an unresolved mention as plain-looking text with no user id", () => {
    // Writing an @ doesn't conjure a person; a link that goes nowhere is worse
    // than no link.
    const segs = parseBody("thanks @nobody_here", []);
    expect(segs.find((s) => s.kind === "mention")).toMatchObject({ alias: "nobody_here", userId: undefined });
  });

  it("does NOT treat an email address as a mention", () => {
    // "priya@gmail.com" must not link "@gmail".
    const segs = parseBody("email me at priya@gmail.com", [PRIYA]);
    expect(segs.every((s) => s.kind === "text")).toBe(true);
  });

  it("handles several mentions in one body", () => {
    const segs = parseBody("@priya_s and @rohan both helped", [PRIYA, ROHAN]);
    const mentions = segs.filter((s) => s.kind === "mention");
    expect(mentions.map((m) => (m as { alias: string }).alias)).toEqual(["priya_s", "rohan"]);
  });

  it("matches the alias case-insensitively", () => {
    const segs = parseBody("cheers @PRIYA_S", [PRIYA]);
    expect(segs.find((s) => s.kind === "mention")).toMatchObject({ userId: "u1" });
  });

  it("gives the same result when parsed twice", () => {
    // A module-level /g regex keeps lastIndex between calls; if that leaked, the
    // second render of the same comment would be wrong.
    const body = "hi @priya_s";
    expect(parseBody(body, [PRIYA])).toEqual(parseBody(body, [PRIYA]));
  });

  it("returns nothing for an empty body", () => {
    expect(parseBody("", [])).toEqual([]);
  });

  it("ignores a bare @ and too-short handles", () => {
    expect(parseBody("@ hello", []).every((s) => s.kind === "text")).toBe(true);
    expect(parseBody("@a", []).every((s) => s.kind === "text")).toBe(true);
  });
});

describe("extracting aliases to resolve", () => {
  it("lowercases and de-duplicates", () => {
    expect(extractAliases("@Priya_S and @priya_s again")).toEqual(["priya_s"]);
  });

  it("skips email addresses", () => {
    expect(extractAliases("write to a@b.com")).toEqual([]);
  });

  it("finds nothing in text with no mentions", () => {
    expect(extractAliases("just a normal comment")).toEqual([]);
  });
});

describe("pruning mentions when text changes", () => {
  it("drops a mention whose name was edited out", () => {
    // Otherwise editing a comment to remove someone would still notify them.
    expect(pruneMentions("thanks @rohan", [PRIYA, ROHAN])).toEqual([ROHAN]);
  });

  it("keeps everything still present", () => {
    expect(pruneMentions("@priya_s @rohan", [PRIYA, ROHAN])).toHaveLength(2);
  });
});

describe("autocomplete at the caret", () => {
  it("finds the mention being typed", () => {
    const body = "thanks @pri";
    expect(mentionQueryAt(body, body.length)).toEqual({ term: "pri", start: 7, end: 11 });
  });

  it("offers suggestions immediately after the @", () => {
    const body = "hey @";
    expect(mentionQueryAt(body, body.length)?.term).toBe("");
  });

  it("stops once a space is typed", () => {
    expect(mentionQueryAt("hey @priya done", 15)).toBeNull();
  });

  it("looks at the token under the caret, not the first @ in the body", () => {
    const body = "@priya_s said hi to @roh";
    expect(mentionQueryAt(body, body.length)?.term).toBe("roh");
  });

  it("does not trigger inside an email address", () => {
    const body = "mail me at priya@gm";
    expect(mentionQueryAt(body, body.length)).toBeNull();
  });

  it("returns null when the caret is before any @", () => {
    expect(mentionQueryAt("no mention here", 5)).toBeNull();
  });

  it("handles a caret in the middle of a mention", () => {
    const body = "hi @priya_s there";
    // Caret placed after "@pri".
    expect(mentionQueryAt(body, 7)).toEqual({ term: "pri", start: 3, end: 7 });
  });

  it("gives up rather than scanning a whole paragraph backwards", () => {
    const body = "@" + "x".repeat(200);
    expect(mentionQueryAt(body, body.length)).toBeNull();
  });

  it("rejects an out-of-range caret", () => {
    expect(mentionQueryAt("abc", 99)).toBeNull();
    expect(mentionQueryAt("abc", -1)).toBeNull();
  });
});

describe("inserting a chosen mention", () => {
  it("replaces the partial handle and leaves a trailing space", () => {
    const body = "thanks @pri";
    const q = mentionQueryAt(body, body.length)!;
    expect(applyMention(body, q, "priya_s")).toEqual({ body: "thanks @priya_s ", caret: 16 });
  });

  it("keeps text that follows the mention", () => {
    const body = "hi @pri there";
    const q = mentionQueryAt(body, 7)!;
    expect(applyMention(body, q, "priya_s").body).toBe("hi @priya_s  there");
  });
});

describe("ordering comments", () => {
  const c = (id: string, over: Partial<{ createdAtISO: string; reactionCount: number; replyCount: number }> = {}) => ({
    id,
    createdAtISO: "2026-08-13T12:00:00.000Z",
    reactionCount: 0,
    replyCount: 0,
    ...over,
  });

  it("newest puts the most recent first", () => {
    const list = [
      c("old", { createdAtISO: "2026-08-13T10:00:00.000Z" }),
      c("new", { createdAtISO: "2026-08-13T14:00:00.000Z" }),
    ];
    expect(sortComments(list, "newest").map((x) => x.id)).toEqual(["new", "old"]);
  });

  it("top weighs a reaction above a reply", () => {
    // A reply can be a disagreement or a follow-up question; a reaction is
    // unambiguous agreement, so it's the better "this answered it" signal.
    const list = [c("replies", { replyCount: 1 }), c("reactions", { reactionCount: 1 })];
    expect(sortComments(list, "top")[0].id).toBe("reactions");
  });

  it("top falls back to oldest-first on a tie so the thread still reads as a conversation", () => {
    const list = [
      c("second", { createdAtISO: "2026-08-13T13:00:00.000Z" }),
      c("first", { createdAtISO: "2026-08-13T11:00:00.000Z" }),
    ];
    expect(sortComments(list, "top").map((x) => x.id)).toEqual(["first", "second"]);
  });

  it("is a total order, so the list can't reshuffle between renders", () => {
    // Identical score AND identical timestamp: the id tiebreak has to decide.
    const list = [c("b"), c("a")];
    const once = sortComments(list, "top").map((x) => x.id);
    const twice = sortComments([...list].reverse(), "top").map((x) => x.id);
    expect(once).toEqual(twice);
  });

  it("does not mutate the input", () => {
    const list = [c("b", { reactionCount: 0 }), c("a", { reactionCount: 5 })];
    const before = list.map((x) => x.id);
    sortComments(list, "top");
    expect(list.map((x) => x.id)).toEqual(before);
  });

  it("tolerates a missing or unparseable timestamp", () => {
    const list = [c("ok"), { id: "bad", createdAtISO: "nope" }, { id: "none" }];
    expect(() => sortComments(list, "newest")).not.toThrow();
    expect(sortComments(list, "newest")).toHaveLength(3);
  });
});

describe("the reaction set", () => {
  it("accepts exactly the emojis the database allows", () => {
    // An emoji the CHECK constraint rejects would fail a tap for no visible
    // reason, so this list and the constraint must agree.
    for (const e of COMMENT_REACTIONS) expect(isValidReaction(e)).toBe(true);
    expect(isValidReaction("🔥")).toBe(false);
    expect(isValidReaction("")).toBe(false);
  });
});
