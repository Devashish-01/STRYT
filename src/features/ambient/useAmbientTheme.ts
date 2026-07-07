import { useMemo } from "react";
import { useWeather } from "./useWeather";
import { getDayPart, getSeason, getActiveFestival } from "./context";

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

    // Seasonal nudge (sets boost extension, default banner & styling)
    if (season === "monsoon") {
      boost = ["plumber", "waterproofing", "umbrella-repair", ...boost];
      banner = "🌧️ Monsoon season — waterproofing & plumbers listed up top";
      accent = "var(--blue-500)";
      bg     = "linear-gradient(180deg, var(--ink-50) 0%, #fff 100%)";
    }
    if (season === "winter") {
      boost = ["geyser-repair", "warm-food", "home-repair", ...boost];
      banner = "❄️ Winter season — geyser repair & warm food listed up top";
      accent = "var(--blue-500)";
      bg     = "linear-gradient(180deg, var(--ink-50) 0%, #fff 100%)";
    }
    if (season === "summer") {
      boost = ["ac-service", "cold-drinks", "electrician", ...boost];
      banner = "☀️ Summer season — AC service & cold drinks listed up top";
      accent = "var(--orange-500)";
      bg     = "linear-gradient(180deg, var(--orange-50) 0%, #fff 100%)";
    }

    // Weather override (highest priority except festival; sets banner + accent)
    if (weather?.isRaining) {
      boost  = ["umbrella-repair", "plumber", "waterproofing", "food-beverage", ...boost];
      banner = `🌧️ Raining nearby — umbrella repair & plumbers listed up top`;
      accent = "var(--blue-500)";
      bg     = "linear-gradient(180deg, var(--ink-50) 0%, #fff 100%)";
    } else if (weather?.isHot) {
      boost  = ["ac-service", "cold-drinks", "electrician", ...boost];
      banner = `🔥 It's ${Math.round(weather.tempC)}°C — AC service & cold drinks nearby`;
      accent = "var(--orange-500)";
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

    return {
      dayPart,
      season,
      festival: festival?.name ?? null,
      greeting,
      accent,
      bgGradient: bg,
      boostCategories,
      banner,
    };
  }, [weather]);
}
