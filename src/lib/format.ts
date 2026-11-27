// "X km" only when we actually have a positive distance — "0 km" reads like a
// bug (provider with no location, or same-point). Falls back to a translated
// "nearby" when a t() is passed (Phase 1 multilingual retrofit — see
// lib/i18n.tsx's `nearby` key); callers not yet retrofitted simply omit `t`
// and get the English literal, so this is safe to touch ahead of every call site.
export function distanceLabel(km?: number | null, t?: (key: string) => string): string {
  if (km && km > 0) return `${km} km`;
  return t ? t("nearby") : "nearby";
}

/**
 * Formats distance with pedestrian walk-times for hyperlocal context:
 * - < 1.2 km: "🚶 X min walk (Ym)"
 * - ≥ 1.2 km: "🚗 X min drive (Y.Y km)"
 */
export function pedestrianDistanceLabel(km?: number | null, t?: (key: string) => string): string {
  if (!km || km <= 0) return t ? t("nearby") : "nearby";
  if (km < 1.2) {
    const meters = Math.round(km * 1000);
    const walkMin = Math.max(1, Math.round(km * 12)); // ~5km/h walking speed
    return `🚶 ${walkMin} min walk (${meters}m)`;
  }
  const driveMin = Math.max(1, Math.round(km * 2.5)); // ~25km/h urban drive speed
  return `🚗 ${driveMin} min drive (${km.toFixed(1)} km)`;
}

// Maps the app's selected language to an Intl-compatible locale for date
// formatting, so a Hindi/Marathi user sees dates rendered in their own script/
// convention instead of always following the device's browser locale.
const LOCALE_BY_LANG: Record<string, string> = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" };

export function formatDate(iso: string, lang: string, opts?: Intl.DateTimeFormatOptions): string {
  const locale = LOCALE_BY_LANG[lang] ?? "en-IN";
  return new Date(iso).toLocaleDateString(locale, opts ?? { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Formats an order timestamp as a relative day + short local time
 * (e.g. "Today, 1:42 PM", "Yesterday, 6:10 PM", or "24 Nov, 6:10 PM").
 * Falls back to static dateLabel/timeLabel when no valid ISO timestamp exists.
 */
export function formatOrderDateTime(
  iso: string | undefined | null,
  lang: string,
  t: (key: string) => string,
  fallback?: { dateLabel?: string; timeLabel?: string }
): string {
  if (iso) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) {
      const locale = LOCALE_BY_LANG[lang] ?? "en-IN";
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const targetDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const diffDays = Math.round((targetDay.getTime() - startOfToday.getTime()) / 86400000);

      let dayPart: string;
      if (diffDays === 0) {
        dayPart = t("today_word");
      } else if (diffDays === -1) {
        dayPart = t("yesterday_word");
      } else if (diffDays === 1) {
        dayPart = t("tomorrow_word");
      } else {
        const dateOpts: Intl.DateTimeFormatOptions =
          d.getFullYear() === now.getFullYear()
            ? { day: "numeric", month: "short" }
            : { day: "numeric", month: "short", year: "numeric" };
        dayPart = d.toLocaleDateString(locale, dateOpts);
      }

      const timePart = d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
      return `${dayPart}, ${timePart}`;
    }
  }

  const fbTime = fallback?.timeLabel && fallback.timeLabel !== "ASAP" ? fallback.timeLabel : undefined;
  return [fallback?.dateLabel, fbTime].filter(Boolean).join(", ");
}

/**
 * Formats a concrete calendar date + local time for expanded order receipts
 * (e.g. "26 Nov, 1:42 PM" or "26 Nov 2025, 1:42 PM").
 */
export function formatFullOrderDateTime(
  iso: string | undefined | null,
  lang: string,
  fallback?: { dateLabel?: string; timeLabel?: string }
): string {
  if (iso) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) {
      const locale = LOCALE_BY_LANG[lang] ?? "en-IN";
      const now = new Date();
      const dateOpts: Intl.DateTimeFormatOptions =
        d.getFullYear() === now.getFullYear()
          ? { day: "numeric", month: "short" }
          : { day: "numeric", month: "short", year: "numeric" };
      const datePart = d.toLocaleDateString(locale, dateOpts);
      const timePart = d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
      return `${datePart}, ${timePart}`;
    }
  }

  const fbTime = fallback?.timeLabel && fallback.timeLabel !== "ASAP" ? fallback.timeLabel : undefined;
  return [fallback?.dateLabel, fbTime].filter(Boolean).join(", ");
}

/** Rupees, the way every price in the app is written. Lived in components/common.tsx, which meant a
 *  currency format could not be used outside a component file without dragging the whole component
 *  module in. */
export function inr(n?: number) {
  if (n == null) return "";
  return "₹" + n.toLocaleString("en-IN");
}
