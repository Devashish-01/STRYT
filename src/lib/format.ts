// "X km" only when we actually have a positive distance — "0 km" reads like a
// bug (provider with no location, or same-point). Falls back to a translated
// "nearby" when a t() is passed (Phase 1 multilingual retrofit — see
// lib/i18n.tsx's `nearby` key); callers not yet retrofitted simply omit `t`
// and get the English literal, so this is safe to touch ahead of every call site.
export function distanceLabel(km?: number | null, t?: (key: string) => string): string {
  if (km && km > 0) return `${km} km`;
  return t ? t("nearby") : "nearby";
}

// Maps the app's selected language to an Intl-compatible locale for date
// formatting, so a Hindi/Marathi user sees dates rendered in their own script/
// convention instead of always following the device's browser locale.
const LOCALE_BY_LANG: Record<string, string> = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" };

export function formatDate(iso: string, lang: string, opts?: Intl.DateTimeFormatOptions): string {
  const locale = LOCALE_BY_LANG[lang] ?? "en-IN";
  return new Date(iso).toLocaleDateString(locale, opts ?? { day: "numeric", month: "short", year: "numeric" });
}
