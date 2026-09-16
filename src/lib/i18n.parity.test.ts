import { describe, it, expect } from "vitest";
import { translations } from "./i18n/all";
import type { Lang } from "./i18n";

/**
 * A key that exists in English but not in Hindi or Marathi shows that user an English string in the middle of their
 * own language — the fallback order is `lang → en → fallback → key`, so it fails quietly and looks like a typo
 * rather than a missing translation. These tests make it loud.
 */
const LANGS: Lang[] = ["en", "hi", "mr"];

describe("translation parity", () => {
  it("every language has exactly the same keys", () => {
    const en = Object.keys(translations.en).sort();
    for (const lang of LANGS.filter((l) => l !== "en")) {
      const keys = Object.keys(translations[lang]).sort();
      const missing = en.filter((k) => !keys.includes(k));
      const extra = keys.filter((k) => !en.includes(k));
      expect({ lang, missing, extra }).toEqual({ lang, missing: [], extra: [] });
    }
  });

  it("no translation is empty or whitespace", () => {
    for (const lang of LANGS) {
      const blank = Object.entries(translations[lang])
        .filter(([, value]) => typeof value === "string" && value.trim() === "")
        .map(([key]) => key);
      expect({ lang, blank }).toEqual({ lang, blank: [] });
    }
  });

  it("interpolation placeholders match English", () => {
    const placeholders = (s: string) => (s.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort().join(",");
    for (const lang of LANGS.filter((l) => l !== "en")) {
      const mismatched: { key: string; en: string; translated: string }[] = [];
      for (const [key, value] of Object.entries(translations.en)) {
        const other = (translations[lang] as Record<string, string>)[key];
        if (typeof value !== "string" || typeof other !== "string") continue;
        if (placeholders(value) !== placeholders(other)) {
          mismatched.push({ key, en: placeholders(value), translated: placeholders(other) });
        }
      }
      expect({ lang, mismatched }).toEqual({ lang, mismatched: [] });
    }
  });
});
