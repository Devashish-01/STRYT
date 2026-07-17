// A name that's just a phone number (7+ digits, optional +/spaces/dashes) is a
// self-heal fallback that leaked through — never show a bare number as a name.
export function isPhoneName(s?: string | null): boolean {
  return /^[+]?[\d\s-]{7,}$/.test((s ?? "").trim());
}
const looksLikePhone = (s: string) => isPhoneName(s);

/** The public-facing display name for a user: their first name only. */
export function firstName(fullName?: string | null): string {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed || looksLikePhone(trimmed)) return "Neighbor";
  return trimmed.split(/\s+/)[0];
}

/** Full display name with a friendly fallback when empty, a bare phone, or the seed placeholder. */
export function displayName(name?: string | null, fallback = "STRYT Neighbor"): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed || looksLikePhone(trimmed) || trimmed === "New user") return fallback;
  return trimmed;
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
