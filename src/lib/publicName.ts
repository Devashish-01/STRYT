/** The public-facing display name for a user: their first name only. */
export function firstName(fullName?: string | null): string {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed) return "Neighbor";
  return trimmed.split(/\s+/)[0];
}
