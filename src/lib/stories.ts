// Story logic that has no UI in it: who is grouped with whom, which ring colour a person gets, where "next" and
// "previous" lead, how long a story may live, and which stories this device has already seen. The viewer, the rail
// and My activity all lean on these so they cannot disagree.

import type { Story } from "@/types";

/** Time a photo stays on screen. */
export const STORY_SLIDE_MS = 5000;
export const STORY_MIN_HOURS = 1;
/** Seven days — Terms §18.6 and the Data Retention Policy. The database refuses anything longer (20261008). */
export const STORY_MAX_HOURS = 168;
export const STORY_DEFAULT_HOURS = 24;
export const STORY_HOUR_PRESETS = [6, 12, 24, 48] as const;

/** A duration the user typed or picked, forced into what a story may be. Not-a-number falls back to a day. */
export function clampStoryHours(n: number): number {
  if (!Number.isFinite(n)) return STORY_DEFAULT_HOURS;
  return Math.min(STORY_MAX_HOURS, Math.max(STORY_MIN_HOURS, Math.round(n)));
}

// ── Who a story belongs to ───────────────────────────────────

export type StoryAuthorType = Story["authorType"];

/** `business:<id>` / `provider:<id>` / `user:<id>` — the key a mute is stored under and a group is merged on. */
export function storyOwnerKey(s: Pick<Story, "authorType" | "businessId" | "providerId" | "userId" | "authorName">): string {
  const id = s.businessId || s.providerId || s.userId || s.authorName;
  return `${s.authorType}:${id}`;
}

export interface StoryGroup {
  /** Same as storyOwnerKey — one group per person / shop / provider. */
  key: string;
  authorType: StoryAuthorType;
  authorName: string;
  authorAvatar: string;
  /** Oldest first: a person's stories play in the order they were posted. */
  stories: Story[];
  /** Your own reel (what you posted, including as a shop). */
  isMine: boolean;
}

const createdMs = (s: Story): number => {
  const t = s.createdAt ? Date.parse(s.createdAt) : NaN;
  return Number.isFinite(t) ? t : 0;
};

export interface GroupOptions {
  /** True for a story that belongs to the signed-in user. */
  isMine?: (s: Story) => boolean;
  /** storyOwnerKey values the user muted. */
  muted?: ReadonlySet<string>;
  /** User ids the user has blocked (their own stories disappear). */
  blockedUserIds?: ReadonlySet<string>;
}

/** Folds a flat list into one group per author, dropping muted authors and blocked people. Never drops your own. */
export function groupStories(stories: readonly Story[], opts: GroupOptions = {}): StoryGroup[] {
  const map = new Map<string, StoryGroup>();
  for (const s of stories) {
    const mine = opts.isMine?.(s) ?? false;
    const key = storyOwnerKey(s);
    if (!mine) {
      if (opts.muted?.has(key)) continue;
      if (s.authorType === "user" && s.userId && opts.blockedUserIds?.has(s.userId)) continue;
    }
    let g = map.get(key);
    if (!g) {
      g = { key, authorType: s.authorType, authorName: s.authorName, authorAvatar: s.authorAvatar, stories: [], isMine: false };
      map.set(key, g);
    }
    if (mine) g.isMine = true;
    g.stories.push(s);
  }
  const groups = [...map.values()];
  for (const g of groups) g.stories.sort((a, b) => createdMs(a) - createdMs(b));
  return groups;
}

const seenSet = (seen: ReadonlySet<string> | readonly string[]): ReadonlySet<string> =>
  seen instanceof Set ? (seen as ReadonlySet<string>) : new Set(seen as readonly string[]);

export function isGroupSeen(g: StoryGroup, seen: ReadonlySet<string> | readonly string[]): boolean {
  const set = seenSet(seen);
  return g.stories.every((s) => set.has(s.id));
}

/** Index to start a group on: the first story not yet seen (like Instagram), or the start once everything is seen. */
export function firstUnseenIndex(g: StoryGroup, seen: ReadonlySet<string> | readonly string[]): number {
  const set = seenSet(seen);
  const i = g.stories.findIndex((s) => !set.has(s.id));
  return i < 0 ? 0 : i;
}

/** Your reel first, then people with something new (newest first), then people you have caught up with. */
export function orderGroups(groups: readonly StoryGroup[], seen: ReadonlySet<string> | readonly string[]): StoryGroup[] {
  const set = seenSet(seen);
  const newest = (g: StoryGroup) => Math.max(0, ...g.stories.map(createdMs));
  const rank = (g: StoryGroup) => (g.isMine ? 0 : isGroupSeen(g, set) ? 2 : 1);
  return [...groups].sort((a, b) => rank(a) - rank(b) || newest(b) - newest(a));
}

export type RingTone = "unseen" | "close" | "seen";

/** What colour the ring is: green when something unseen was shared with close friends only, gradient when
 *  there is something new, grey when you have seen it all. */
export function ringTone(g: StoryGroup, seen: ReadonlySet<string> | readonly string[]): RingTone {
  const set = seenSet(seen);
  const unseen = g.stories.filter((s) => !set.has(s.id));
  if (unseen.length === 0) return "seen";
  return unseen.some((s) => s.visibility === "close_friends") ? "close" : "unseen";
}

// ── Where next / previous lead ───────────────────────────────

export interface StoryPointer { group: number; story: number }

type Sized = { stories: readonly unknown[] };

/** Tap right / a story finishing: the next story of this person, else the first of the next person, else close. */
export function nextPointer(groups: readonly Sized[], p: StoryPointer): StoryPointer | "close" {
  const g = groups[p.group];
  if (!g) return "close";
  if (p.story < g.stories.length - 1) return { group: p.group, story: p.story + 1 };
  if (p.group < groups.length - 1) return { group: p.group + 1, story: 0 };
  return "close";
}

/** Tap left: the previous story, else the last of the previous person; on the very first one, start it over. */
export function prevPointer(groups: readonly Sized[], p: StoryPointer): StoryPointer | "restart" {
  if (p.story > 0) return { group: p.group, story: p.story - 1 };
  if (p.group > 0) return { group: p.group - 1, story: Math.max(0, (groups[p.group - 1]?.stories.length ?? 1) - 1) };
  return "restart";
}

/** Swipe sideways: the first story of the neighbouring person, or null at the ends. */
export function neighbourGroupPointer(groups: readonly Sized[], p: StoryPointer, dir: 1 | -1): StoryPointer | null {
  const next = p.group + dir;
  return next >= 0 && next < groups.length ? { group: next, story: 0 } : null;
}

// ── Time ─────────────────────────────────────────────────────

/** Whole hours until the story expires (never negative). */
export function hoursLeft(s: Pick<Story, "expiresAt" | "expiresInHrs">, now = Date.now()): number {
  const t = s.expiresAt ? Date.parse(s.expiresAt) : NaN;
  if (!Number.isFinite(t)) return Math.max(0, s.expiresInHrs ?? 0);
  return Math.max(0, Math.round((t - now) / 3_600_000));
}

/** "now" / "5m" / "3h" / "2d" — the compact age Instagram shows. `fmt` supplies the translated unit. */
export function storyAge(createdAtIso: string | undefined, fmt: (unit: "now" | "m" | "h" | "d", n: number) => string, now = Date.now()): string {
  const t = createdAtIso ? Date.parse(createdAtIso) : NaN;
  if (!Number.isFinite(t)) return fmt("now", 0);
  const mins = Math.floor((now - t) / 60_000);
  if (mins < 1) return fmt("now", 0);
  if (mins < 60) return fmt("m", mins);
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return fmt("h", hrs);
  return fmt("d", Math.floor(hrs / 24));
}

// ── "Seen" survives a restart ────────────────────────────────

export const SEEN_STORAGE_KEY = "stryt_viewed_stories";
/** More than anyone sees in the 7 days a story can live, small enough to never matter for storage. */
export const MAX_SEEN = 400;

type KV = Pick<Storage, "getItem" | "setItem">;

export function loadSeen(storage?: KV): string[] {
  try {
    const raw = (storage ?? localStorage).getItem(SEEN_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(-MAX_SEEN) : [];
  } catch {
    return [];
  }
}

export function saveSeen(list: readonly string[], storage?: KV): void {
  try {
    (storage ?? localStorage).setItem(SEEN_STORAGE_KEY, JSON.stringify(list.slice(-MAX_SEEN)));
  } catch { /* private window / storage full: the ring just resets next launch, as it did before */ }
}

/** Adds an id; returns the same array when it was already there so React can skip the update. */
export function rememberSeen(list: readonly string[], id: string): readonly string[] {
  if (list.includes(id)) return list;
  const next = [...list, id];
  return next.length > MAX_SEEN ? next.slice(next.length - MAX_SEEN) : next;
}
