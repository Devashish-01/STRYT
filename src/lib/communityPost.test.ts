import { describe, it, expect } from "vitest";
import {
  PREVIEW_POST_ID,
  addMedia,
  alertExpiryHours,
  canAddMedia,
  computeExpiry,
  draftToCreateInput,
  draftToPreviewPost,
  isExpired,
  isPollClosed,
  postMedia,
  promoteMediaToCover,
  removeMediaAt,
  timeLeftLabel,
} from "./communityPost";
import { emptyDraft, type CommunityDraft } from "./communityDraft";
import { MAX_POST_MEDIA } from "./communityTypes";

function draft(over: Partial<CommunityDraft> = {}): CommunityDraft {
  return emptyDraft({ type: "RECOMMENDATION", title: "Good dentist near KP?", ...over });
}

const URLS = Array.from({ length: 6 }, (_, i) => `https://cdn/p${i}.jpg`);

describe("media list", () => {
  it("appends up to the cap and then refuses", () => {
    let media: string[] = [];
    for (let i = 0; i < MAX_POST_MEDIA; i++) {
      const r = addMedia(media, URLS[i]);
      expect(r.rejected).toBeNull();
      media = r.media;
    }
    expect(media).toHaveLength(MAX_POST_MEDIA);
    const over = addMedia(media, URLS[MAX_POST_MEDIA]);
    expect(over.rejected).toBe("AT_LIMIT");
    expect(over.media).toHaveLength(MAX_POST_MEDIA); // unchanged, not silently trimmed
  });

  it("refuses the same upload twice", () => {
    // A double-tap on "Gallery" can fire the change handler twice for one file.
    const first = addMedia([], URLS[0]);
    const again = addMedia(first.media, URLS[0]);
    expect(again.rejected).toBe("DUPLICATE");
    expect(again.media).toEqual([URLS[0]]);
  });

  it("canAddMedia agrees with addMedia about the boundary", () => {
    const full = URLS.slice(0, MAX_POST_MEDIA);
    expect(canAddMedia(full)).toBe(false);
    expect(addMedia(full, URLS[5]).rejected).toBe("AT_LIMIT");
    const nearlyFull = URLS.slice(0, MAX_POST_MEDIA - 1);
    expect(canAddMedia(nearlyFull)).toBe(true);
    expect(addMedia(nearlyFull, URLS[5]).rejected).toBeNull();
  });

  it("removes by index and ignores out-of-range", () => {
    const three = URLS.slice(0, 3);
    expect(removeMediaAt(three, 1)).toEqual([URLS[0], URLS[2]]);
    expect(removeMediaAt(three, 9)).toEqual(three);
    expect(removeMediaAt(three, -1)).toEqual(three);
  });

  it("promoting a photo makes it the cover without losing the others", () => {
    const three = URLS.slice(0, 3);
    expect(promoteMediaToCover(three, 2)).toEqual([URLS[2], URLS[0], URLS[1]]);
    // Already the cover, or out of range — no change, no duplication.
    expect(promoteMediaToCover(three, 0)).toEqual(three);
    expect(promoteMediaToCover(three, 7)).toEqual(three);
  });
});

describe("cover photo stays in step with the legacy image column", () => {
  it("image is always media[0]", () => {
    const input = draftToCreateInput(draft({ media: [URLS[0], URLS[1]] }));
    expect(input.image).toBe(URLS[0]);
    expect(input.media).toEqual([URLS[0], URLS[1]]);
  });

  it("a photoless post sends no image", () => {
    const input = draftToCreateInput(draft());
    expect(input.image).toBeUndefined();
    expect(input.media).toEqual([]);
  });

  it("hard-caps media even if a draft somehow holds more", () => {
    const input = draftToCreateInput(draft({ media: URLS }));
    expect(input.media).toHaveLength(MAX_POST_MEDIA);
  });

  it("postMedia reads new, legacy, and mixed shapes", () => {
    expect(postMedia({ media: [URLS[0], URLS[1]], image: URLS[0] })).toEqual([URLS[0], URLS[1]]);
    expect(postMedia({ media: [], image: URLS[3] })).toEqual([URLS[3]]); // pre-migration row
    expect(postMedia({ media: undefined, image: URLS[3] })).toEqual([URLS[3]]);
    expect(postMedia({ media: undefined, image: undefined })).toEqual([]);
  });

  it("alt text is dropped when there is no photo to describe", () => {
    expect(draftToCreateInput(draft({ imageAlt: "A wallet" })).imageAlt).toBeUndefined();
    expect(draftToCreateInput(draft({ media: [URLS[0]], imageAlt: "A wallet" })).imageAlt).toBe("A wallet");
    expect(draftToCreateInput(draft({ media: [URLS[0]], imageAlt: "   " })).imageAlt).toBeUndefined();
  });
});

describe("each type carries only its own fields", () => {
  it("switching away from POLL cannot smuggle poll options through", () => {
    // Pick POLL, fill options, switch to SHOUTOUT: the options must not travel.
    const d = draft({ type: "SHOUTOUT", pollOptions: ["Yes", "No"] });
    const input = draftToCreateInput(d);
    expect(input.pollOptions).toBeUndefined();
    expect(input.pollEndsAt).toBeNull();
  });

  it("switching away from ALERT drops the severity", () => {
    const input = draftToCreateInput(draft({ type: "GIVEAWAY", severity: "URGENT" }));
    expect(input.severity).toBeNull();
    expect(input.expiresAt).toBeNull();
  });

  it("lost-and-found details never ride along on other types", () => {
    const stale = { lastSeen: "Near the gate", reward: "500", pickupNote: "Evenings" };
    const lf = draftToCreateInput(draft({ type: "LOST_FOUND", ...stale }));
    expect(lf.lastSeen).toBe("Near the gate");
    expect(lf.reward).toBe("500");
    expect(lf.pickupNote).toBeNull(); // giveaway-only field

    const alert = draftToCreateInput(draft({ type: "ALERT", severity: "INFO", ...stale }));
    expect(alert.lastSeen).toBeNull();
    expect(alert.reward).toBeNull();
    expect(alert.pickupNote).toBeNull();
  });

  it("a giveaway keeps its pickup note only", () => {
    const g = draftToCreateInput(draft({ type: "GIVEAWAY", pickupNote: "Evenings after 6", lastSeen: "x" }));
    expect(g.pickupNote).toBe("Evenings after 6");
    expect(g.lastSeen).toBeNull();
  });

  it("only RECOMMENDATION and SHOUTOUT carry an author-tagged listing", () => {
    const tag = { listingType: "BUSINESS" as const, listingId: "b1", name: "Corner Bakery" };
    for (const type of ["RECOMMENDATION", "SHOUTOUT"] as const) {
      expect(draftToCreateInput(draft({ type, taggedListing: tag })).taggedListing).toEqual(tag);
    }
    for (const type of ["ALERT", "LOST_FOUND", "GIVEAWAY", "POLL"] as const) {
      const d = draft({ type, taggedListing: tag, severity: "INFO", pollOptions: ["a", "b"] });
      expect(draftToCreateInput(d).taggedListing).toBeNull();
    }
  });

  it("trims text and stores nothing rather than blank strings", () => {
    const input = draftToCreateInput(draft({
      type: "LOST_FOUND",
      title: "  Lost wallet  ",
      body: "  black leather  ",
      lastSeen: "   ",
      reward: "",
    }));
    expect(input.title).toBe("Lost wallet");
    expect(input.body).toBe("black leather");
    expect(input.lastSeen).toBeNull();
    expect(input.reward).toBeNull();
  });

  it("drops blank poll options and renumbers the rest", () => {
    const input = draftToCreateInput(draft({ type: "POLL", pollOptions: ["Yes", "   ", " No "] }));
    expect(input.pollOptions).toEqual([
      { id: "o0", label: "Yes", votes: 0 },
      { id: "o1", label: "No", votes: 0 },
    ]);
  });

  it("throws rather than writing a typeless post", () => {
    expect(() => draftToCreateInput(emptyDraft())).toThrow();
  });
});

describe("preview shows what will actually be posted", () => {
  const NOW = Date.parse("2026-08-13T12:00:00.000Z");
  const ME = { authorName: "Priya", authorAvatar: "https://cdn/me.jpg", authorUserId: "u1" };

  it("carries every authored field through to the previewed card", () => {
    // The preview renders the real CommunityCard, so anything missing here is a
    // field the author can set but never see before publishing.
    const d = draft({
      type: "LOST_FOUND",
      title: "Lost black wallet",
      body: "Near the park",
      media: [URLS[0], URLS[1]],
      imageAlt: "A black wallet",
      lastSeen: "Park gate",
      reward: "500",
      hideLikeCount: true,
      commentPolicy: "EVERYONE",
    });
    const p = draftToPreviewPost(d, ME, "Koramangala", NOW);
    expect(p).toMatchObject({
      type: "LOST_FOUND",
      title: "Lost black wallet",
      body: "Near the park",
      media: [URLS[0], URLS[1]],
      image: URLS[0],
      imageAlt: "A black wallet",
      lastSeen: "Park gate",
      reward: "500",
      area: "Koramangala",
      authorName: "Priya",
      hideLikeCount: true,
      commentPolicy: "EVERYONE",
    });
  });

  it("previews an alert with its severity and countdown", () => {
    const p = draftToPreviewPost(draft({ type: "ALERT", severity: "URGENT" }), ME, "KP", NOW);
    expect(p.severity).toBe("URGENT");
    expect(timeLeftLabel(p.expiresAt, NOW)).toBe(`${alertExpiryHours("URGENT")}h left`);
  });

  it("previews a poll with options and a live deadline, not a closed one", () => {
    const p = draftToPreviewPost(draft({ type: "POLL", pollOptions: ["Yes", "No"], pollDurationHours: 24 }), ME, "KP", NOW);
    expect(p.pollOptions).toHaveLength(2);
    expect(p.pollOptions?.every((o) => o.votes === 0)).toBe(true);
    expect(isPollClosed(p, NOW)).toBe(false);
  });

  it("starts with no engagement and nothing resolved", () => {
    const p = draftToPreviewPost(draft(), ME, "KP", NOW);
    expect(p.likes).toBe(0);
    expect(p.liked).toBe(false);
    expect(p.commentsCount).toBe(0);
    expect(p.resolved).toBe(false);
    expect(p.votedOptionId).toBeNull();
    // Neighbor recommendations can't exist before the post does.
    expect(p.recommendations).toBeUndefined();
  });

  it("previews under the business identity when posting as a shop", () => {
    const p = draftToPreviewPost(draft(), {
      authorName: "Corner Bakery",
      authorType: "business",
      authorRefId: "b1",
      authorUserId: "u1",
    }, "KP", NOW);
    expect(p.authorType).toBe("business");
    expect(p.authorRefId).toBe("b1");
    expect(p.authorName).toBe("Corner Bakery");
  });

  it("uses a recognisable sentinel id so a stray write is obvious", () => {
    expect(draftToPreviewPost(draft(), ME, "KP", NOW).id).toBe(PREVIEW_POST_ID);
  });

  it("refuses to preview a typeless draft, exactly like posting one", () => {
    expect(() => draftToPreviewPost(emptyDraft(), ME, "KP", NOW)).toThrow();
  });
});

describe("time-boxing", () => {
  const NOW = Date.parse("2026-08-13T12:00:00.000Z");

  it("evergreen types get no expiry", () => {
    for (const type of ["RECOMMENDATION", "LOST_FOUND", "GIVEAWAY", "SHOUTOUT"] as const) {
      const { expiresAt, pollEndsAt } = computeExpiry(draft({ type }), NOW);
      expect(expiresAt).toBeNull();
      expect(pollEndsAt).toBeNull();
    }
  });

  it("a louder alert expires sooner", () => {
    const at = (s: "INFO" | "WARNING" | "URGENT") =>
      Date.parse(computeExpiry(draft({ type: "ALERT", severity: s }), NOW).expiresAt!);
    expect(at("URGENT")).toBeLessThan(at("WARNING"));
    expect(at("WARNING")).toBeLessThan(at("INFO"));
    expect(at("URGENT")).toBe(NOW + alertExpiryHours("URGENT") * 3600_000);
  });

  it("an alert with no severity chosen yet has no expiry", () => {
    // validateDraft blocks posting in this state; computeExpiry must not invent
    // a window regardless.
    expect(computeExpiry(draft({ type: "ALERT", severity: null }), NOW).expiresAt).toBeNull();
  });

  it("a poll closes and expires at the same moment", () => {
    const { expiresAt, pollEndsAt } = computeExpiry(draft({ type: "POLL", pollDurationHours: 72 }), NOW);
    expect(expiresAt).toBe(pollEndsAt);
    expect(Date.parse(expiresAt!)).toBe(NOW + 72 * 3600_000);
  });

  it("isExpired / isPollClosed read the boundary consistently", () => {
    const iso = new Date(NOW).toISOString();
    expect(isExpired({ expiresAt: iso }, NOW)).toBe(true); // exactly at the boundary = done
    expect(isExpired({ expiresAt: iso }, NOW - 1)).toBe(false);
    expect(isExpired({ expiresAt: null }, NOW)).toBe(false);
    expect(isExpired({ expiresAt: "not a date" }, NOW)).toBe(false); // never hide a post over a bad value
    expect(isPollClosed({ pollEndsAt: iso }, NOW)).toBe(true);
    expect(isPollClosed({ pollEndsAt: null }, NOW)).toBe(false);
  });

  it("countdown labels stay coarse and never show a negative", () => {
    const inMs = (ms: number) => new Date(NOW + ms).toISOString();
    expect(timeLeftLabel(inMs(30 * 60_000), NOW)).toBe("30m left");
    expect(timeLeftLabel(inMs(5 * 3600_000), NOW)).toBe("5h left");
    expect(timeLeftLabel(inMs(50 * 3600_000), NOW)).toBe("2d left");
    expect(timeLeftLabel(inMs(-1), NOW)).toBe("Ended");
    expect(timeLeftLabel(inMs(20_000), NOW)).toBe("1m left"); // rounds up, never "0m"
    expect(timeLeftLabel(null, NOW)).toBeNull();
    expect(timeLeftLabel("garbage", NOW)).toBeNull();
  });
});
