import { normalizeAlias, isValidAlias, isUnusableName } from "@/lib/publicName";

/**
 * Candidate @handles derived from what we already know about a user, so the
 * onboarding handle step can be a tap instead of a typing exercise.
 *
 * Pure and deterministic: the screen calls this, checks the results against
 * `aliases_available()` in one round trip, and offers the free ones. Keeping
 * generation separate from the availability check is what makes the awkward
 * part — scripts that normalise to nothing, names too short to be legal
 * handles, duplicate candidates — unit-testable without a database.
 *
 * Every returned string is guaranteed to satisfy `isValidAlias`.
 */

/** Strip a trailing separator left behind by truncation, e.g. "averylongname." */
function tidy(candidate: string): string {
  return candidate.replace(/[._]+$/, "");
}

/** The local part of an email, minus any +tag. "a.b+promo@x.com" -> "a.b" */
function emailLocalPart(email?: string | null): string {
  const at = (email ?? "").indexOf("@");
  if (at <= 0) return "";
  return (email ?? "").slice(0, at).split("+")[0];
}

/**
 * Ordered handle candidates for a user, best first.
 *
 * Derived from the name where possible ("Rahul Sharma" -> rahul.sharma,
 * rahulsharma, rahul.s), then from the email's local part, then — only if that
 * yields too few — by suffixing the best base with a number. Numeric suffixes
 * are last-resort padding, not the house style: they exist so a single-word or
 * non-Latin-script name still gets something tappable rather than an empty row.
 *
 * Returns fewer than `limit` (possibly zero) when there is genuinely nothing to
 * derive from — a name in a script that normalises away with no usable email.
 * Callers must handle that by falling back to the custom input alone.
 */
export function suggestAliases(
  name?: string | null,
  email?: string | null,
  limit = 3
): string[] {
  const bases: string[] = [];

  // ── from the name ──
  if (!isUnusableName(name)) {
    const words = (name ?? "")
      .trim()
      .split(/\s+/)
      .map((w) => normalizeAlias(w))
      .filter(Boolean);

    if (words.length >= 2) {
      const [first, ...rest] = words;
      const last = rest[rest.length - 1];
      bases.push(`${first}.${last}`, `${first}${last}`, `${first}.${last[0]}`, `${first[0]}.${last}`);
    } else if (words.length === 1) {
      bases.push(words[0]);
    }
  }

  // ── from the email ──
  // Not merely a fallback for a missing name: a name written in Devanagari
  // normalises to an empty string (normalizeAlias keeps only [a-z0-9_.]), and
  // this app ships in Hindi and Marathi. For those users the email local part
  // is the only Latin-script identity we hold.
  const local = normalizeAlias(emailLocalPart(email));
  if (local) bases.push(local);

  const out: string[] = [];
  const seen = new Set<string>();

  function offer(raw: string): boolean {
    const candidate = tidy(normalizeAlias(raw));
    if (!isValidAlias(candidate) || seen.has(candidate)) return false;
    seen.add(candidate);
    out.push(candidate);
    return out.length >= limit;
  }

  for (const base of bases) {
    if (offer(base)) return out;
  }

  // ── numeric padding ──
  // Only reached when the derived candidates were too few or too short to be
  // legal (a two-letter name can't meet the 3-character minimum on its own).
  const padBase = tidy(normalizeAlias(bases[0] ?? ""));
  if (padBase) {
    for (let n = 1; n <= 99 && out.length < limit; n++) {
      // Truncate before suffixing so the digits survive the 20-char cap.
      const suffix = String(n);
      if (offer(padBase.slice(0, 20 - suffix.length) + suffix)) return out;
    }
  }

  return out;
}
