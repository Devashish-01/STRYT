import { useMemo } from "react";
import { useWeather } from "./useWeather";
import { getDayPart, getSeason, getActiveFestival, type DayPart, type Season } from "./context";

/** The atmospheric particle drifting through the lamp light in a header. */
export type SeasonEffect = "rain" | "snow" | "petals" | "haze";

export interface AmbientTheme {
  dayPart: string;
  season: string;
  festival: string | null;
  greeting: string;
  /** hex accent colour */
  accent: string;
  /** CSS linear-gradient string for the Home scroll area */
  bgGradient: string;
  /** category slugs to sort to top of the category grid (de-duped, ordered) */
  boostCategories: string[];
  /** one contextual banner line, or null — festival > weather > null */
  banner: string | null;

  // ── "Living Street Light" ambient layer (drives <AmbientSky/> + <BrandLockup/>) ──
  /** typed day part for the sky wash + lamp glow */
  dayPartKey: DayPart;
  /** typed season for the particle layer */
  seasonKey: Season;
  /** which atmosphere drifts through the header — weather can override the season */
  seasonEffect: SeasonEffect;
  /** street-lamp glow strength 0→1: faint at noon, brightest at night */
  lampGlow: number;
}

const FESTIVAL_CONFIG: Record<string, {
  boost: string[]; banner: string; accent: string; bg: string;
}> = {
  diwali: {
    boost:  ["electrician", "sweets", "cleaning", "lights", "rangoli"],
    banner: "🪔 Happy Diwali! Electricians, sweet shops & cleaning services nearby",
    accent: "var(--amber-700)",
    bg:     "linear-gradient(180deg, var(--amber-50) 0%, #fff 100%)",
  },
  holi: {
    boost:  ["sweets", "laundry", "food-beverage"],
    banner: "🎨 Happy Holi! Sweets & colour-clean laundry services nearby",
    accent: "var(--pink-500)",
    bg:     "linear-gradient(180deg, var(--red-50) 0%, #fff 100%)",
  },
  ganesh: {
    boost:  ["decorator", "sweets", "flowers", "events"],
    banner: "🐘 Ganeshotsav! Decorators, modak & flowers nearby",
    accent: "var(--red-600)",
    bg:     "linear-gradient(180deg, var(--red-50) 0%, #fff 100%)",
  },
  eid: {
    boost:  ["sweets", "tailor", "food-beverage"],
    banner: "🌙 Eid Mubarak! Sweet shops & tailors are listed up top",
    accent: "var(--green-600)",
    bg:     "linear-gradient(180deg, var(--green-100) 0%, #fff 100%)",
  },
  xmas: {
    boost:  ["cake", "gifts", "decorator"],
    banner: "🎄 Merry Christmas! Bakeries, decorators & gift shops nearby",
    accent: "var(--red-600)",
    bg:     "linear-gradient(180deg, var(--red-50) 0%, #fff 100%)",
  },
};

export function useAmbientTheme(lat?: number, lng?: number): AmbientTheme {
  const weather = useWeather(lat, lng);

  return useMemo(() => {
    const dayPart  = getDayPart();
    const season   = getSeason();
    const festival = getActiveFestival();

    const greeting =
      dayPart === "morning"   ? "Good morning" :
      dayPart === "afternoon" ? "Good afternoon" :
      dayPart === "evening"   ? "Good evening" :
                                "Good night";

    // Base category boost by time of day
    let boost: string[] =
      dayPart === "morning"   ? ["tiffin", "milk", "newspaper", "breakfast", "food-beverage"] :
      dayPart === "afternoon" ? ["food-beverage", "groceries", "home-repair"] :
      dayPart === "evening"   ? ["food-beverage", "groceries", "available-now"] :
                                ["pharmacy", "emergency", "home-repair"];

    let banner: string | null = null;
    let accent = "var(--brand-500)";
    let bg     = "linear-gradient(180deg, var(--brand-100) 0%, #fff 100%)";

    // Seasonal nudge (sets boost extension, default banner & styling).
    // Accent STAYS inside the brand ramp (purple/amber) — the season itself is
    // told through the AmbientSky particle layer (rain/snow/petals/haze), not
    // by swapping the header to an off-brand color like blue. A blue header
    // clashes with the lamp lockup's pink/amber beam; every weather state
    // still needs to look like STRYT.
    if (season === "monsoon") {
      boost = ["plumber", "waterproofing", "umbrella-repair", ...boost];
      banner = "🌧️ Monsoon season — waterproofing & plumbers listed up top";
      accent = "var(--brand-500)";
      bg     = "linear-gradient(180deg, var(--ink-50) 0%, #fff 100%)";
    }
    if (season === "winter") {
      boost = ["geyser-repair", "warm-food", "home-repair", ...boost];
      banner = "❄️ Winter season — geyser repair & warm food listed up top";
      accent = "var(--brand-700)";
      bg     = "linear-gradient(180deg, var(--ink-50) 0%, #fff 100%)";
    }
    if (season === "summer") {
      boost = ["ac-service", "cold-drinks", "electrician", ...boost];
      banner = "☀️ Summer season — AC service & cold drinks listed up top";
      accent = "var(--accent-500)";
      bg     = "linear-gradient(180deg, var(--orange-50) 0%, #fff 100%)";
    }

    // Weather override (highest priority except festival; sets banner + accent)
    if (weather?.isRaining) {
      boost  = ["umbrella-repair", "plumber", "waterproofing", "food-beverage", ...boost];
      banner = `🌧️ Raining nearby — umbrella repair & plumbers listed up top`;
      accent = "var(--brand-500)";
      bg     = "linear-gradient(180deg, var(--ink-50) 0%, #fff 100%)";
    } else if (weather?.isHot) {
      boost  = ["ac-service", "cold-drinks", "electrician", ...boost];
      banner = `🔥 It's ${Math.round(weather.tempC)}°C — AC service & cold drinks nearby`;
      accent = "var(--accent-500)";
      bg     = "linear-gradient(180deg, var(--orange-50) 0%, #fff 100%)";
    }

    // Festival override — strongest signal, overrides weather banner and accent
    if (festival) {
      const cfg = FESTIVAL_CONFIG[festival.themeKey];
      if (cfg) {
        boost  = [...cfg.boost, ...boost];
        banner = cfg.banner;
        accent = cfg.accent;
        bg     = cfg.bg;
      }
    }

    // De-dup while preserving priority order
    const seen = new Set<string>();
    const boostCategories = boost.filter((c) => (seen.has(c) ? false : (seen.add(c), true)));

    // ── Ambient sky layer ──
    // Lamp glow tracks the day: barely-on at noon, full at night — so the
    // header literally lights up as the street would.
    const lampGlow =
      dayPart === "night"   ? 1.0 :
      dayPart === "evening" ? 0.72 :
      dayPart === "morning" ? 0.24 :
                              0.08; // afternoon

    // Season decides the drifting particle; live rain overrides it (if it's
    // pouring in July, show rain even though the calendar says monsoon anyway).
    let seasonEffect: SeasonEffect =
      season === "monsoon" ? "rain"   :
      season === "winter"  ? "snow"   :
      season === "spring"  ? "petals" :
                             "haze";   // summer
    if (weather?.isRaining) seasonEffect = "rain";

    return {
      dayPart,
      season,
      festival: festival?.name ?? null,
      greeting,
      accent,
      bgGradient: bg,
      boostCategories,
      banner,
      dayPartKey: dayPart,
      seasonKey: season,
      seasonEffect,
      lampGlow,
    };
  }, [weather]);
}
