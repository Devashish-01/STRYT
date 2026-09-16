// Which language a device starts in, and fetching that language's strings. Kept out of src/lib/i18n.tsx so that file
// exports only the provider and its hook (React Fast Refresh needs component files to export components).
import en from "./en";
import type { Lang } from "../i18n";

/** Hindi and Marathi arrive on demand; English is always present because it is the fallback. */
const loaders: Record<Exclude<Lang, "en">, () => Promise<{ default: Record<string, string> }>> = {
  hi: () => import("./hi"),
  mr: () => import("./mr"),
};

/** Strings for every language fetched so far. */
export const loaded: Partial<Record<Lang, Record<string, string>>> = { en };

/** Fetches a language's strings once. Call before the first render for the saved language, so a Hindi or Marathi
 *  user never sees an English flash while the chunk downloads. */
export async function loadLang(lang: Lang): Promise<void> {
  if (loaded[lang]) return;
  try {
    loaded[lang] = (await loaders[lang as Exclude<Lang, "en">]()).default;
  } catch {
    // Offline on first launch or a stale deploy: English is still there, so the app keeps working.
  }
}

/** The app's language for a device that has never chosen one. Reads the OS/
 *  browser locale rather than defaulting everyone to English: this app ships
 *  in Hindi and Marathi for users who are unlikely to go hunting through
 *  settings to find that out. An explicit choice always wins over this. */
function deviceLang(): Lang {
  const tags = typeof navigator === "undefined"
    ? []
    : [...(navigator.languages ?? []), navigator.language].filter(Boolean);
  for (const tag of tags) {
    const base = tag.toLowerCase().split("-")[0];
    if (base === "hi" || base === "mr") return base;
    if (base === "en") return "en";
  }
  return "en";
}

/** The language this device will start in: an explicit choice, else the OS/browser locale. */
export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem("naya_lang") as Lang | null;
    if (saved && ["en", "hi", "mr"].includes(saved)) return saved;
  } catch {
    // Storage blocked — fall through to the device locale.
  }
  return deviceLang();
}
