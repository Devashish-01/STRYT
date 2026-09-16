import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import en from "./i18n/en";

/**
 * A key that is called but never defined is worse than a missing translation: `t()` falls back to the key itself, so
 * the screen shows "share_word" to everyone, in every language. Five of those were live before this test existed —
 * three of them written as `t("x") || "Fallback"`, which never reaches the fallback because `t()` never returns
 * falsy. This walks the source and fails on any key that has no entry in en.ts.
 */
const SRC = path.resolve(__dirname, "..");
const CALL = /\b(?:t|tf|qt|qtf)\(\s*"([a-z][a-zA-Z0-9_]*)"/g;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // The language files themselves hold the definitions, not calls.
      if (entry.name !== "i18n") sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("translation keys", () => {
  it("every key passed to t() exists in English", () => {
    const missing: { key: string; file: string }[] = [];
    for (const file of sourceFiles(SRC)) {
      const text = fs.readFileSync(file, "utf8");
      for (const match of text.matchAll(CALL)) {
        const key = match[1];
        // i18n.tsx defines t() itself, where `key` is the parameter name.
        if (key === "key") continue;
        if (!(key in en)) missing.push({ key, file: path.relative(SRC, file).replace(/\\/g, "/") });
      }
    }
    expect(missing).toEqual([]);
  });
});
