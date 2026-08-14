import { describe, it, expect, beforeEach } from "vitest";
import {
  DRAFT_TTL_MS,
  DRAFT_VERSION,
  clearDraft,
  draftKey,
  emptyDraft,
  expiryHoursFor,
  isDraftMeaningful,
  loadDraft,
  normalizeDraft,
  saveDraft,
  validateDraft,
  type CommunityDraft,
  type DraftIdentity,
  type DraftStorage,
} from "./communityDraft";
import { ALERT_SEVERITIES, MAX_POST_MEDIA, MIN_TITLE_LEN } from "./communityTypes";

/**
 * Drafts are the safety net under the one screen where a user types something
 * long enough to lose, so these tests are less about formatting and more about
 * two promises: (1) a draft never resurfaces under the wrong identity, and
 * (2) a bad/stale payload starts the composer empty rather than throwing.
 */

/** In-memory stand-in for localStorage — vitest runs in a node environment. */
function memStorage(seed: Record<string, string> = {}): DraftStorage & { map: Map<string, string> } {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => { map.set(k, v); },
    removeItem: (k) => { map.delete(k); },
  };
}

/** Storage that rejects every write, like Safari private mode at quota. */
const throwingStorage: DraftStorage = {
  getItem: () => { throw new Error("denied"); },
  setItem: () => { throw new Error("denied"); },
  removeItem: () => { throw new Error("denied"); },
};

const ME: DraftIdentity = { type: "user", id: "u1" };
const MY_SHOP: DraftIdentity = { type: "business", id: "b1" };

function withText(over: Partial<CommunityDraft> = {}): CommunityDraft {
  return emptyDraft({ type: "RECOMMENDATION", title: "Reliable dentist near KP?", ...over });
}

describe("draft identity keying", () => {
  let store: ReturnType<typeof memStorage>;
  beforeEach(() => { store = memStorage(); });

  it("keys personal and business drafts separately", () => {
    expect(draftKey(ME)).not.toBe(draftKey(MY_SHOP));
  });

  it("a business draft never resurfaces under your personal identity", () => {
    // The composer opens as yourself OR as a business you manage. A half-written
    // shop announcement appearing under your own name is a real-world leak, not
    // just a mix-up.
    saveDraft(MY_SHOP, withText({ title: "Diwali sale this weekend" }), store);
    expect(loadDraft(ME, store)).toBeNull();
    expect(loadDraft(MY_SHOP, store)?.title).toBe("Diwali sale this weekend");
  });

  it("round-trips every field it persists", () => {
    const d = withText({
      body: "Details here",
      media: ["https://cdn/1.jpg", "https://cdn/2.jpg"],
      imageAlt: "A wallet",
      pollOptions: ["Yes", "No"],
      pollDurationHours: 72,
      severity: "URGENT",
      lastSeen: "Near the park gate",
      reward: "500",
      pickupNote: "Evenings after 6",
      taggedListing: { listingType: "BUSINESS", listingId: "b9", name: "Corner Bakery" },
      commentPolicy: "EVERYONE",
      hideLikeCount: true,
    });
    saveDraft(ME, d, store);
    const back = loadDraft(ME, store)!;
    expect(back).toMatchObject({
      title: d.title, body: d.body, media: d.media, imageAlt: d.imageAlt,
      pollOptions: d.pollOptions, pollDurationHours: 72, severity: "URGENT",
      lastSeen: d.lastSeen, reward: d.reward, pickupNote: d.pickupNote,
      taggedListing: d.taggedListing, commentPolicy: "EVERYONE", hideLikeCount: true,
    });
  });
});

describe("what counts as worth saving", () => {
  it("picking a type alone is not a draft", () => {
    // Otherwise "Draft saved" fires before a single word is typed, which trains
    // people to ignore the indicator.
    expect(isDraftMeaningful(emptyDraft({ type: "ALERT" }))).toBe(false);
  });

  it.each([
    ["a title", { title: "Water cut today" }],
    ["a body", { body: "Since morning" }],
    ["a photo", { media: ["https://cdn/1.jpg"] }],
    ["a poll option", { pollOptions: ["Yes", ""] }],
    ["a lost-and-found location", { lastSeen: "Near the gate" }],
    ["a tagged listing", { taggedListing: { listingType: "BUSINESS" as const, listingId: "b1", name: "Shop" } }],
  ])("%s makes it worth saving", (_label, over) => {
    expect(isDraftMeaningful(emptyDraft(over as Partial<CommunityDraft>))).toBe(true);
  });

  it("clearing the last text removes the stored draft instead of keeping an empty one", () => {
    const store = memStorage();
    saveDraft(ME, withText(), store);
    expect(store.map.size).toBe(1);
    saveDraft(ME, emptyDraft({ type: "RECOMMENDATION" }), store);
    expect(store.map.size).toBe(0);
  });
});

describe("a bad or stale payload never breaks the composer", () => {
  it("returns null for corrupt JSON and cleans it up", () => {
    const store = memStorage({ [draftKey(ME)]: "{not json" });
    expect(loadDraft(ME, store)).toBeNull();
  });

  it("drops a draft written by an older app version", () => {
    const stale = JSON.stringify({ ...withText(), version: DRAFT_VERSION - 1, savedAt: Date.now() });
    const store = memStorage({ [draftKey(ME)]: stale });
    expect(loadDraft(ME, store)).toBeNull();
    expect(store.map.size).toBe(0);
  });

  it("drops a draft past its TTL", () => {
    const store = memStorage();
    const now = Date.now();
    saveDraft(ME, withText(), store, now - DRAFT_TTL_MS - 1);
    expect(loadDraft(ME, store, now)).toBeNull();
  });

  it("keeps a draft just inside its TTL", () => {
    const store = memStorage();
    const now = Date.now();
    saveDraft(ME, withText(), store, now - DRAFT_TTL_MS + 60_000);
    expect(loadDraft(ME, store, now)).not.toBeNull();
  });

  it("survives storage that throws on every access", () => {
    expect(() => saveDraft(ME, withText(), throwingStorage)).not.toThrow();
    expect(saveDraft(ME, withText(), throwingStorage)).toBe(false);
    expect(loadDraft(ME, throwingStorage)).toBeNull();
    expect(() => clearDraft(ME, throwingStorage)).not.toThrow();
  });

  it("treats a missing storage (private mode) as no draft", () => {
    expect(loadDraft(ME, null)).toBeNull();
    expect(saveDraft(ME, withText(), null)).toBe(false);
  });

  it("coerces junk field types instead of trusting them", () => {
    const d = normalizeDraft({
      version: DRAFT_VERSION,
      title: 42, body: null, media: "nope",
      pollOptions: [1, "Yes"], pollDurationHours: -5,
      severity: "LOUD", commentPolicy: "FRIENDS", hideLikeCount: "yes",
      taggedListing: { listingType: "SOMETHING", listingId: 7 },
    });
    expect(d).not.toBeNull();
    expect(d!.title).toBe("");
    expect(d!.body).toBe("");
    expect(d!.media).toEqual([]);
    expect(d!.pollOptions).toEqual(["", ""]); // one valid option is below the minimum, so starter slots are restored
    expect(d!.pollDurationHours).toBeGreaterThan(0);
    expect(d!.severity).toBeNull();
    expect(d!.commentPolicy).toBe("NEIGHBORS");
    expect(d!.hideLikeCount).toBe(false);
    expect(d!.taggedListing).toBeNull();
  });

  it("caps restored media at the upload limit", () => {
    const many = Array.from({ length: MAX_POST_MEDIA + 3 }, (_, i) => `https://cdn/${i}.jpg`);
    const d = normalizeDraft({ ...emptyDraft(), media: many });
    expect(d!.media).toHaveLength(MAX_POST_MEDIA);
  });
});

describe("discarding", () => {
  it("clearDraft removes only that identity's draft", () => {
    const store = memStorage();
    saveDraft(ME, withText(), store);
    saveDraft(MY_SHOP, withText({ title: "Shop update today" }), store);
    clearDraft(ME, store);
    expect(loadDraft(ME, store)).toBeNull();
    expect(loadDraft(MY_SHOP, store)).not.toBeNull();
  });
});

describe("validation drives both the button and the hint", () => {
  it("blocks with no type chosen", () => {
    const v = validateDraft(emptyDraft());
    expect(v.ok).toBe(false);
    expect(v.field).toBe("type");
  });

  it("blocks an empty title with a different message than a too-short one", () => {
    const empty = validateDraft(emptyDraft({ type: "ALERT", severity: "INFO" }));
    const short = validateDraft(emptyDraft({ type: "ALERT", severity: "INFO", title: "ab" }));
    expect(empty.ok).toBe(false);
    expect(short.ok).toBe(false);
    expect(empty.message).not.toBe(short.message);
    expect(short.field).toBe("title");
  });

  it(`accepts a title at exactly the ${MIN_TITLE_LEN}-character minimum`, () => {
    const title = "a".repeat(MIN_TITLE_LEN);
    expect(validateDraft(emptyDraft({ type: "RECOMMENDATION", title })).ok).toBe(true);
  });

  it("ignores whitespace-only padding when measuring the title", () => {
    expect(validateDraft(emptyDraft({ type: "RECOMMENDATION", title: "   " })).field).toBe("title");
  });

  it("a poll needs two distinct options", () => {
    const one = validateDraft(withText({ type: "POLL", pollOptions: ["Yes", "  "] }));
    expect(one.ok).toBe(false);
    expect(one.field).toBe("pollOptions");

    const dupes = validateDraft(withText({ type: "POLL", pollOptions: ["Yes", "yes "] }));
    expect(dupes.ok).toBe(false);
    expect(dupes.message).toMatch(/different/i);

    expect(validateDraft(withText({ type: "POLL", pollOptions: ["Yes", "No"] })).ok).toBe(true);
  });

  it("an alert must state how urgent it is", () => {
    expect(validateDraft(withText({ type: "ALERT" })).field).toBe("severity");
    expect(validateDraft(withText({ type: "ALERT", severity: "WARNING" })).ok).toBe(true);
  });

  it("every message is actionable, never a bare 'invalid'", () => {
    const blockers = [
      emptyDraft(),
      emptyDraft({ type: "POLL" }),
      withText({ type: "ALERT" }),
      withText({ type: "POLL", pollOptions: ["", ""] }),
    ];
    for (const d of blockers) {
      const v = validateDraft(d);
      expect(v.ok).toBe(false);
      expect(v.message).toBeTruthy();
      expect(v.message!.length).toBeGreaterThan(10);
      expect(v.field).not.toBeNull();
    }
  });
});

describe("time-boxing", () => {
  const hoursFor = (s: "INFO" | "WARNING" | "URGENT") =>
    ALERT_SEVERITIES.find((x) => x.value === s)!.hours;

  it("evergreen types never expire", () => {
    for (const type of ["RECOMMENDATION", "LOST_FOUND", "GIVEAWAY", "SHOUTOUT"] as const) {
      expect(expiryHoursFor(withText({ type }), hoursFor)).toBeNull();
    }
  });

  it("a louder alert expires sooner", () => {
    const info = expiryHoursFor(withText({ type: "ALERT", severity: "INFO" }), hoursFor)!;
    const urgent = expiryHoursFor(withText({ type: "ALERT", severity: "URGENT" }), hoursFor)!;
    expect(urgent).toBeLessThan(info);
  });

  it("a poll expires when its chosen duration ends", () => {
    expect(expiryHoursFor(withText({ type: "POLL", pollDurationHours: 72 }), hoursFor)).toBe(72);
  });
});
