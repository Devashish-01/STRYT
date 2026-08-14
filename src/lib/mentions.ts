/**
 * @mention parsing, caret-aware autocomplete, and comment ordering.
 *
 * All of it is pure text work, and all of it is the kind of logic that fails in
 * ways a reviewer won't see: a regex that swallows an email address, an
 * autocomplete that triggers on a stray "@" mid-word, a "top" sort that isn't
 * stable and reshuffles a thread on every render.
 */

/** Aliases are the only handle a mention can use — users are findable by their
 *  public alias and never by their real name (socialService.searchNeighbors), so
 *  a mention cannot be used to confirm someone's real identity. Kept in step
 *  with the alias rules: letters, digits, underscore, dot, 2-30 chars. */
const MENTION_RE = /@([a-zA-Z0-9_.]{2,30})/g;

export interface MentionRef {
  userId: string;
  alias: string;
}

export type BodySegment =
  | { kind: "text"; text: string }
  | { kind: "mention"; text: string; alias: string; userId?: string };

/**
 * Split a comment body into plain text and mention segments for rendering.
 *
 * Only mentions that RESOLVED to a real user become links. An unresolved
 * "@someone" stays plain text rather than becoming a dead link — writing an @
 * doesn't conjure a person, and a link that goes nowhere is worse than no link.
 */
export function parseBody(body: string, mentions: MentionRef[] = []): BodySegment[] {
  if (!body) return [];
  const byAlias = new Map(mentions.map((m) => [m.alias.toLowerCase(), m.userId]));
  const out: BodySegment[] = [];
  let lastIndex = 0;

  // Fresh regex state per call — a module-level /g regex keeps lastIndex
  // between calls, which would make the second render of the same body wrong.
  const re = new RegExp(MENTION_RE.source, "g");
  let match: RegExpExecArray | null;

  while ((match = re.exec(body)) !== null) {
    const [full, alias] = match;
    const start = match.index;
    // An "@" that's part of a longer token isn't a mention. This is what stops
    // "email me at priya@gmail.com" from linking "@gmail".
    const prevChar = start > 0 ? body[start - 1] : "";
    if (prevChar && /[a-zA-Z0-9_.]/.test(prevChar)) continue;

    if (start > lastIndex) out.push({ kind: "text", text: body.slice(lastIndex, start) });
    const userId = byAlias.get(alias.toLowerCase());
    out.push({ kind: "mention", text: full, alias, userId });
    lastIndex = start + full.length;
  }

  if (lastIndex < body.length) out.push({ kind: "text", text: body.slice(lastIndex) });
  return out;
}

/** Every alias mentioned in a body, lowercased and de-duplicated. Used to
 *  resolve mentions to user ids before the comment is written. */
export function extractAliases(body: string): string[] {
  const re = new RegExp(MENTION_RE.source, "g");
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    const start = match.index;
    const prevChar = start > 0 ? body[start - 1] : "";
    if (prevChar && /[a-zA-Z0-9_.]/.test(prevChar)) continue;
    found.add(match[1].toLowerCase());
  }
  return [...found];
}

/** Keep only the mentions whose alias actually still appears in the text —
 *  otherwise editing a comment to remove a name would still notify them. */
export function pruneMentions(body: string, mentions: MentionRef[]): MentionRef[] {
  const present = new Set(extractAliases(body));
  return mentions.filter((m) => present.has(m.alias.toLowerCase()));
}

/* ------------------------------------------------------------------ *
 * Autocomplete
 * ------------------------------------------------------------------ */

export interface MentionQuery {
  /** The partial alias being typed, without the "@". */
  term: string;
  /** Index of the "@" in the body, for replacement. */
  start: number;
  /** Index just past the caret's token. */
  end: number;
}

/**
 * The mention being typed at the caret, or null.
 *
 * Looks BACKWARDS from the caret rather than scanning the whole string: what
 * matters is the token you're in the middle of, not the first "@" in the
 * comment. Returns null once the token is clearly not a mention any more (a
 * space was typed, it's mid-word, or it's already over the alias length limit).
 */
export function mentionQueryAt(body: string, caret: number): MentionQuery | null {
  if (caret < 0 || caret > body.length) return null;
  let i = caret - 1;
  while (i >= 0) {
    const ch = body[i];
    if (ch === "@") break;
    // Whitespace, punctuation, anything not alias-legal: we're not in a mention.
    if (!/[a-zA-Z0-9_.]/.test(ch)) return null;
    i--;
    // An alias can't be longer than this, so stop rather than scanning a whole
    // paragraph backwards on every keystroke.
    if (caret - i > 31) return null;
  }
  if (i < 0) return null;

  const before = i > 0 ? body[i - 1] : "";
  // Mid-word "@" (an email address) is not a mention trigger.
  if (before && /[a-zA-Z0-9_.]/.test(before)) return null;

  const term = body.slice(i + 1, caret);
  if (term.length > 30) return null;
  return { term, start: i, end: caret };
}

/** Replace the in-progress mention with the chosen alias, leaving the caret
 *  after a trailing space so typing can continue naturally. */
export function applyMention(body: string, query: MentionQuery, alias: string): { body: string; caret: number } {
  const inserted = `@${alias} `;
  const next = body.slice(0, query.start) + inserted + body.slice(query.end);
  return { body: next, caret: query.start + inserted.length };
}

/* ------------------------------------------------------------------ *
 * Comment ordering
 * ------------------------------------------------------------------ */

export type CommentSort = "top" | "newest";

export interface SortableComment {
  id: string;
  createdAtISO?: string;
  reactionCount?: number;
  replyCount?: number;
}

/**
 * Order top-level comments.
 *
 * "Top" weighs reactions above replies: a reply can be a disagreement or a
 * follow-up question, while a reaction is unambiguous agreement, so it's the
 * better signal for "this answered it". Ties fall back to oldest-first, which
 * keeps a thread readable as a conversation and — because it's a total order —
 * stops the list reshuffling between renders.
 */
export function sortComments<T extends SortableComment>(comments: T[], sort: CommentSort): T[] {
  const copy = [...comments];
  if (sort === "newest") {
    copy.sort((a, b) => time(b) - time(a) || a.id.localeCompare(b.id));
    return copy;
  }
  copy.sort((a, b) => score(b) - score(a) || time(a) - time(b) || a.id.localeCompare(b.id));
  return copy;
}

function score(c: SortableComment): number {
  return (c.reactionCount ?? 0) * 2 + (c.replyCount ?? 0);
}

function time(c: SortableComment): number {
  if (!c.createdAtISO) return 0;
  const t = Date.parse(c.createdAtISO);
  return Number.isFinite(t) ? t : 0;
}

/** The reaction set offered in the UI. Must match the CHECK constraint on
 *  comment_reactions.emoji (20260895) — an emoji the database rejects would
 *  fail a tap for no visible reason. */
export const COMMENT_REACTIONS = ["👍", "❤️", "😂", "😮", "🙏", "💡"] as const;

export type CommentReactionEmoji = typeof COMMENT_REACTIONS[number];

export function isValidReaction(emoji: string): emoji is CommentReactionEmoji {
  return (COMMENT_REACTIONS as readonly string[]).includes(emoji);
}
