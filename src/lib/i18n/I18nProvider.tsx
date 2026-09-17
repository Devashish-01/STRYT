import { useEffect, useState, type ReactNode } from "react";
import en from "./en";
import { initialLang, loadLang, loaded } from "./runtime";
import { I18nContext, type Lang } from "@/lib/i18n";

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

  return <I18nContext.Provider value={{ lang, t, tf, setLang: changeLang }}>{children}</I18nContext.Provider>;
}
