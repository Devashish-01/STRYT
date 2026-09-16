import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import en from "./i18n/en";
import { initialLang, loadLang, loaded } from "./i18n/runtime";

export type Lang = "en" | "hi" | "mr";

interface I18nCtx {
  lang: Lang;
  t: (key: string, fallback?: string) => string;
  /** Interpolated variant of t() — replaces every "{paramName}" occurrence in
   *  the resolved string with the matching value. Existing call sites that do
   *  `t("key").replace("{name}", x)` by hand are untouched (not force-migrated);
   *  new interpolated keys should use this instead. */
  tf: (key: string, params: Record<string, string | number>) => string;
  setLang: (l: Lang) => void;
}
const Ctx = createContext<I18nCtx>({ lang: "en", t: (k, fb) => fb ?? k, tf: (k) => k, setLang: () => {} });

/** Whether this device already carries an explicit language choice. Lets the
 *  store adopt the language saved on the user's profile on a NEW device
 *  without overriding a choice made here (see refreshUser in store.tsx). */
export function hasStoredLang(): boolean {
  const saved = localStorage.getItem("naya_lang");
  return !!saved && ["en", "hi", "mr"].includes(saved);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  // Bumped when a language finishes loading, so the tree re-renders with the new strings.
  const [, setVersion] = useState(0);

  useEffect(() => {
    if (loaded[lang]) return;
    let active = true;
    void loadLang(lang).then(() => { if (active) setVersion((v) => v + 1); });
    return () => { active = false; };
  }, [lang]);

  function changeLang(l: Lang) {
    setLang(l);
    localStorage.setItem("naya_lang", l);
  }

  function t(key: string, fallback?: string): string {
    return loaded[lang]?.[key] ?? en[key] ?? fallback ?? key;
  }

  function tf(key: string, params: Record<string, string | number>): string {
    let resolved = t(key);
    for (const [name, value] of Object.entries(params)) {
      // split/join instead of replaceAll — this project's TS lib target predates ES2021.
      resolved = resolved.split(`{${name}}`).join(String(value));
    }
    return resolved;
  }

  return <Ctx.Provider value={{ lang, t, tf, setLang: changeLang }}>{children}</Ctx.Provider>;
}

export function useI18n() { return useContext(Ctx); }

export const LANG_LABELS: Record<Lang, string> = { en: "English", hi: "हिन्दी", mr: "मराठी" };
/** English strings, for the few places that need the canonical term regardless of the display language. */
export { en as englishStrings };
