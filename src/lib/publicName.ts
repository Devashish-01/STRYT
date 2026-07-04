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
