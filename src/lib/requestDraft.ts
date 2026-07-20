// Draft-save for AskCompose — the ~15-field posting form previously discarded
// everything on a back-button tap or accidental refresh with no warning.
// Single-slot (one in-flight request draft at a time), localStorage-backed,
// same try/catch-wrapped read/write shape as dismissedCards.ts.
const STORAGE_KEY = "stryt_request_draft";

export interface RequestDraft {
  title: string;
  desc: string;
  cat: string | null;
  subCat: string | null;
  budgetMin: string;
  budgetMax: string;
  paymentMode: "" | "fixed" | "hourly";
  schedDate: string;
  schedSlot: string;
  radius: number;
  photos: string[];
  urgent: boolean;
  recurring: boolean;
  anon: boolean;
  expiryHrs: number;
}

/** Read the saved draft, if any (null when unset/malformed/unavailable). */
export function loadRequestDraft(): RequestDraft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || typeof parsed.title !== "string") return null;
    return parsed as RequestDraft;
  } catch {
    return null;
  }
}

/** Persist the current form state (best-effort). */
export function saveRequestDraft(draft: RequestDraft): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Storage unavailable (private mode / quota) — draft won't survive a
    // reload this time, which is an acceptable degradation.
  }
}

/** Clear the draft — call once the request actually posts. */
export function clearRequestDraft(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
