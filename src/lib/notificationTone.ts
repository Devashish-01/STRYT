import type { NotificationTone } from "@/types";

/** Maps a semantic NotificationTone to the app's existing color tokens —
 *  the one place a tone becomes an actual hex/var, so every archetype below
 *  stays token-driven without repeating this switch. */
export function toneColor(tone?: NotificationTone): string {
  switch (tone) {
    case "success":
    case "positive": return "var(--green-600)";
    case "danger": return "var(--red-600)";
    case "warning": return "var(--amber-700)";
    case "info": return "var(--blue-500)";
    case "brand": return "var(--brand-700)";
    case "accent": return "var(--accent-500)";
    case "primary": return "var(--brand-600)";
    default: return "var(--ink-600)";
  }
}
export function toneBg(tone?: NotificationTone): string {
  switch (tone) {
    case "success":
    case "positive": return "var(--green-100)";
    case "danger": return "var(--red-100)";
    case "warning": return "var(--amber-100)";
    case "info": return "var(--blue-100)";
    case "brand": return "var(--brand-100)";
    case "accent": return "var(--amber-50)";
    case "primary": return "var(--brand-50)";
    default: return "var(--ink-100)";
  }
}
