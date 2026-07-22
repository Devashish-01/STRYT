import { useMemo } from "react";
import { useWeather, type Weather } from "./useWeather";
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
  /** live weather details */
  weather: Weather | null;
  
  // ── Dynamic Sky Gradients & Ambient Subtitles ──
  /** Dynamic header gradient tailored to the role, time of day, and weather */
  headerGradient: string;
  /** Poetic contextual subtitle describing the weather and part of the day */
  ambientSubtitle: string;
}

// Every festival shares ONE on-brand celebratory tint (pink — STRYT's existing
// "live/social" accent) instead of each picking its own hue (previously amber,
// red ×3, green — none of which belong to the purple/pink/amber palette, so a
// Ganesh or Eid visit made the whole app read as a different, off-brand app
// for the day). The emoji + banner copy still differ; only the color doesn't.
const FESTIVAL_ACCENT = "var(--pink-500)";
const FESTIVAL_BG = "linear-gradient(180deg, var(--pink-50) 0%, #fff 100%)";

const FESTIVAL_CONFIG: Record<string, {
  boost: string[]; banner: string; accent: string; bg: string;
}> = {
  diwali: {
    boost:  ["electrician", "sweets", "cleaning", "lights", "rangoli"],
    banner: "🪔 Happy Diwali! Electricians, sweet shops & cleaning services nearby",
    accent: FESTIVAL_ACCENT,
    bg:     FESTIVAL_BG,
  },
  holi: {
    boost:  ["sweets", "laundry", "food-beverage"],
    banner: "🎨 Happy Holi! Sweets & colour-clean laundry services nearby",
    accent: FESTIVAL_ACCENT,
    bg:     FESTIVAL_BG,
  },
  ganesh: {
    boost:  ["decorator", "sweets", "flowers", "events"],
    banner: "🐘 Ganeshotsav! Decorators, modak & flowers nearby",
    accent: FESTIVAL_ACCENT,
    bg:     FESTIVAL_BG,
  },
  eid: {
    boost:  ["sweets", "tailor", "food-beverage"],
    banner: "🌙 Eid Mubarak! Sweet shops & tailors are listed up top",
    accent: FESTIVAL_ACCENT,
    bg:     FESTIVAL_BG,
  },
  xmas: {
    boost:  ["cake", "gifts", "decorator"],
    banner: "🎄 Merry Christmas! Bakeries, decorators & gift shops nearby",
    accent: FESTIVAL_ACCENT,
    bg:     FESTIVAL_BG,
  },
};

/**
 * The "Living Street Light" header base — one hue family (the brand ink/purple
 * ramp) for every role, day part, and weather state. The lamp glow, sky wash
 * and particle field (<AmbientSky/>) already carry the time-of-day and weather
 * storytelling on top of this; the base only needs to get darker as the day
 * gets later, like the real sky, so those layers never have to fight a
 * clashing hue underneath them.
 *
 * Previously this branched on role × day part × weather × festival into ~90
 * hand-picked hex combinations (customer/provider/business each had their own
 * hue family, e.g. provider swung green→lime, business red→orange) — nobody
 * could review that many combinations, and several (rain evenings, "hot"
 * afternoons) turned out visibly off-brand or muddy enough to hide the rain
 * particles. Collapsed back to one on-brand ramp so every role reads as the
 * same app and the particle field stays legible against it.
 */
function getHeaderGradient(dayPart: DayPart, weather: Weather | null): string {
  let stops: string[];
  switch (dayPart) {
    case "morning":   stops = ["var(--brand-700)", "var(--brand-900)"]; break;
    case "afternoon": stops = ["var(--brand-600)", "var(--brand-800)"]; break;
    case "evening":   stops = ["var(--brand-800)", "var(--ink-900)"]; break;
    default:          stops = ["var(--ink-900)", "var(--brand-900)"]; break; // night
  }
  // Rain deepens toward a clean dark base so the pale rain streaks read
  // clearly instead of blending into a muddy mid-tone.
  if (weather?.isRaining) stops = ["var(--ink-900)", "var(--brand-900)"];
  return `linear-gradient(160deg, ${stops.join(", ")})`;
}

export function useAmbientTheme(
  lat?: number,
  lng?: number,
  role: "customer" | "provider" | "business" = "customer"
): AmbientTheme {
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
    if (season === "monsoon") {
      boost = ["plumber", "waterproofing", "umbrella-repair", ...boost];
      banner = "☁️ Monsoon season — waterproofing & plumbers listed up top";
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
      bg     = "linear-gradient(180deg, var(--amber-50) 0%, #fff 100%)";
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
      bg     = "linear-gradient(180deg, var(--amber-50) 0%, #fff 100%)";
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

    // Season decides the drifting particle; live weather overrides it.
    let seasonEffect: SeasonEffect =
      season === "monsoon" ? "haze"   : // default to haze (sunny/cloudy) during monsoon unless actively raining
      season === "winter"  ? "snow"   :
      season === "spring"  ? "petals" :
                             "haze";   // summer

    if (weather) {
      if (weather.isRaining) {
        seasonEffect = "rain";
      } else if (weather.code >= 71 && weather.code <= 86) {
        // WMO codes 71-86 indicate snowfall or snow showers
        seasonEffect = "snow";
      }
    }

    // ── Poetic Ambient Subtitle calculation ──
    let ambientSubtitle = "";
    const isRaining = weather?.isRaining;
    const isHot = weather?.isHot;
    const isSnowing = weather ? (weather.code >= 71 && weather.code <= 86) : false;
    const isCold = weather ? (weather.tempC < 15) : false;

    if (isRaining) {
      ambientSubtitle = dayPart === "morning" ? "Damp morning showers" :
                        dayPart === "afternoon" ? "Cooling afternoon rain" :
                        dayPart === "evening" ? "Rainy twilight cozy vibes" :
                                                "Rain-swept quiet night";
    } else if (isHot) {
      ambientSubtitle = dayPart === "morning" ? "Warm & sunny morning start" :
                        dayPart === "afternoon" ? "Intense midday heat, stay hydrated! 🥤" :
                        dayPart === "evening" ? "Warm, balmy sunset breeze" :
                                                "Warm summer night";
    } else if (isSnowing) {
      ambientSubtitle = dayPart === "morning" ? "Frosty morning chill & snow" :
                        dayPart === "afternoon" ? "Crisp snowy afternoon" :
                        dayPart === "evening" ? "Chilly evening snow flurries" :
                                                "Freezing silent night";
    } else if (isCold) {
      ambientSubtitle = dayPart === "morning" ? "Brisk, chilly morning start" :
                        dayPart === "afternoon" ? "Cool, crisp winter afternoon" :
                        dayPart === "evening" ? "Cold winter twilight" :
                                                "Freezing quiet night";
    } else {
      ambientSubtitle = season === "monsoon" ? "Cloudy monsoon skies & cool breeze" :
                        dayPart === "morning" ? "Golden rays & fresh morning air" :
                        dayPart === "afternoon" ? "Bright skies & clear afternoon" :
                        dayPart === "evening" ? "Sunset hues & evening winds" :
                                                "Starry skies & quiet streets";
    }

    // ── Header sky gradient (day part + rain only — see getHeaderGradient) ──
    const headerGradient = getHeaderGradient(dayPart, weather);

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
      weather,
      headerGradient,
      ambientSubtitle,
    };
  }, [weather, role]);
}
