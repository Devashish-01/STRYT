import { createContext, useContext } from "react";
import en from "./i18n/en";

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
/** Exported so i18n/I18nProvider.tsx can fill it. Everything else uses useI18n(). */
export const I18nContext = createContext<I18nCtx>({ lang: "en", t: (k, fb) => fb ?? k, tf: (k) => k, setLang: () => {} });

/** Whether this device already carries an explicit language choice. Lets the
 *  store adopt the language saved on the user's profile on a NEW device
 *  without overriding a choice made here (see refreshUser in store.tsx). */
export function hasStoredLang(): boolean {
  const saved = localStorage.getItem("naya_lang");
  return !!saved && ["en", "hi", "mr"].includes(saved);
}

export function useI18n() { return useContext(I18nContext); }

export const LANG_LABELS: Record<Lang, string> = { en: "English", hi: "हिन्दी", mr: "मराठी" };
/** English strings, for the few places that need the canonical term regardless of the display language. */
export { en as englishStrings };
