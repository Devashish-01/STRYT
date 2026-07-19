// Local-only "dismissed cards" set. Some cards must persist until the customer
// deals with them — a served-but-unpaid queue token, or an unpaid appointment
// whose slot has already passed — so they can't be allowed to auto-vanish. This
// gives the customer an explicit, device-local way to hide such a card without
// any server-side change: dismissing NEVER cancels or modifies the underlying
// token/booking, it only hides it from this device's lists. Backed by
// localStorage so the dismissal survives reloads.
const STORAGE_KEY = "stryt_dismissed_cards";

/** Read the dismissed-id set from localStorage (empty set if unset/unavailable). */
export function loadDismissedCards(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    // Malformed JSON or storage disabled (private mode / quota) — start clean.
    return new Set();
  }
}

/** Persist the dismissed-id set to localStorage (best-effort). */
export function persistDismissedCards(ids: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // Storage unavailable (private mode / quota) — the dismissal stays in-memory
    // for this session only, which is an acceptable degradation.
  }
}
