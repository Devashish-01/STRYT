// A name that's just a phone number (7+ digits, optional +/spaces/dashes) is a
// self-heal fallback that leaked through — never show a bare number as a name.
export function isPhoneName(s?: string | null): boolean {
  return /^[+]?[\d\s-]{7,}$/.test((s ?? "").trim());
}

// Same problem, different channel: sign-up seeds `users.name` from the email
// address, so an account created with an email carries its address as its
// display name. The phone guard above has always existed; this one didn't, and
// 8 of 10 live accounts were in that state when it was found.
//
// This matters beyond looking untidy — a name renders to STRANGERS (public
// profile, reviews, community posts, delivery cards), so an unguarded email is
// a contact-details leak, not a cosmetic bug.
export function isEmailName(s?: string | null): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((s ?? "").trim());
}

/** Any raw contact detail that must never be rendered as a display name. */
export function isContactName(s?: string | null): boolean {
  return isPhoneName(s) || isEmailName(s);
}

/**
 * A `users.name` we must not render as-is: blank, a raw contact detail, or the
 * seed placeholder. Both name helpers below share this so they can't drift —
 * `displayName` used to special-case "New user" and `firstName` didn't, which
 * meant the placeholder rendered as the greeting "Hi, New".
 */
export function isUnusableName(s?: string | null): boolean {
  const trimmed = (s ?? "").trim();
  return !trimmed || isContactName(trimmed) || trimmed === "New user";
}

/** The public-facing display name for a user: their first name only. */
export function firstName(fullName?: string | null): string {
  if (isUnusableName(fullName)) return "Neighbor";
  return (fullName ?? "").trim().split(/\s+/)[0];
}

/** Full display name with a friendly fallback when empty, a bare contact detail, or the seed placeholder. */
export function displayName(name?: string | null, fallback = "STRYT Neighbor"): string {
  if (isUnusableName(name)) return fallback;
  return (name ?? "").trim();
}

/**
 * What to call the signed-in user to their face — the greeting on Home, and
 * anywhere else we address them directly.
 *
 * Prefers a real name, then their alias (every live account has one), and only
 * then the neutral fallback. `firstName()` alone can't do this: it has no
 * access to the alias, so a user whose name is unusable would be greeted
 * "Neighbor" despite having a perfectly good handle set.
 */
export function greetingName(
  input?: { name?: string | null; alias?: string | null } | null,
  fallback = "Neighbor",
): string {
  const first = firstName(input?.name);
  if (first !== "Neighbor") return first;
  const alias = (input?.alias ?? "").trim();
  return alias || fallback;
}

/**
 * Public identity shown to strangers: the real name if the user opted in via
 * `showNamePublicly` (defaults to false — see 20260821_show_name_publicly.sql),
 * otherwise their alias if they've set one. Until an alias is set we fall back
 * to the first-name view (never a bare phone) so nothing renders blank —
 * privacy tightens the moment an alias is chosen. Without the opt-in, the real
 * name is revealed separately only inside an active relationship
 * (appointment/queue/proposal), by passing the real name directly.
 */
export function aliasName(
  input?: { alias?: string | null; name?: string | null; showNamePublicly?: boolean | null } | null,
  fallback = "STRYT Neighbor",
): string {
  if (input?.showNamePublicly) {
    return displayName(input?.name, fallback);
  }
  const alias = (input?.alias ?? "").trim();
  if (alias) return alias;
  return firstName(input?.name) === "Neighbor" ? fallback : firstName(input?.name);
}

/** Normalise a user-typed alias to the stored handle form (lowercase, safe chars). */
export function normalizeAlias(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 20);
}

/** Whether an alias meets the format rules (3–20 chars, letters/numbers/._). */
export function isValidAlias(raw: string): boolean {
  return /^[a-z0-9_.]{3,20}$/.test(normalizeAlias(raw));
}
