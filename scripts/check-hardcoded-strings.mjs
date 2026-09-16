// P10 — finds user-facing English that isn't going through t(), so a Hindi or Marathi user doesn't meet English in
// the middle of their own language.
//
// Reports three kinds of finding in src/**/*.tsx and src/store/**/*.ts:
//   * showToast("literal")           — the most common one, and the most visible
//   * JSX attribute literals          — placeholder, title, aria-label, alt, label
//   * JSX text nodes with 2+ letters  — the words themselves
//
// Not reported: tests, the admin panel (English-only by decision D9), code comments, keys, class names, numbers,
// punctuation and anything listed in scripts/i18n-allowlist.json with a reason.
//
// Usage:
//   node scripts/check-hardcoded-strings.mjs            list every finding
//   node scripts/check-hardcoded-strings.mjs --max 120  exit 1 if there are more than 120 (the CI ratchet)
//   node scripts/check-hardcoded-strings.mjs --by-file  counts per file, worst first
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "..", "src");
const ALLOWLIST = JSON.parse(fs.readFileSync(path.join(HERE, "i18n-allowlist.json"), "utf8"));
const allowed = new Set(ALLOWLIST.strings.map((s) => s.value));

const SKIP_DIRS = new Set(["admin", "future-enhancement", "__tests__"]);
const SKIP_FILE = /\.(test|spec)\.(ts|tsx)$/;
const ATTRS = ["placeholder", "title", "aria-label", "alt", "label"];

const args = process.argv.slice(2);
const maxArg = args.indexOf("--max");
const max = maxArg >= 0 ? Number(args[maxArg + 1]) : null;
const byFile = args.includes("--by-file");

/** A string worth translating: at least two letters, and not a lone token like "OK" inside code. */
const hasWords = (s) => (s.match(/[A-Za-z]/g) ?? []).length >= 2;

/** Strings that are identifiers or values rather than prose. */
const isTechnical = (s) =>
  /^[a-z0-9_]+$/.test(s) ||                       // snake_case key
  /^[a-zA-Z]+([A-Z][a-z0-9]*)+$/.test(s) ||       // camelCase identifier
  /^[\w-]+\/[\w-/]+$/.test(s) ||                  // path or mime type
  /^https?:/.test(s) ||
  /^[#.][\w-]+$/.test(s) ||                       // selector
  /^\d[\d\s,.%+-]*$/.test(s);

const findings = [];

function scanFile(file) {
  const rel = path.relative(path.join(HERE, ".."), file).replace(/\\/g, "/");
  const lines = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").split("\n");
  let inBlockComment = false;

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (inBlockComment) {
      if (trimmed.includes("*/")) inBlockComment = false;
      return;
    }
    if (trimmed.startsWith("/*")) {
      if (!trimmed.includes("*/")) inBlockComment = true;
      return;
    }
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;

    const report = (kind, text) => {
      if (!hasWords(text) || isTechnical(text) || allowed.has(text)) return;
      findings.push({ file: rel, line: i + 1, kind, text: text.slice(0, 80) });
    };

    for (const m of line.matchAll(/showToast\(\s*["'`]([^"'`]+)["'`]/g)) report("toast", m[1]);

    for (const attr of ATTRS) {
      const re = new RegExp(`${attr}=["']([^"']+)["']`, "g");
      for (const m of line.matchAll(re)) report("attr", m[1]);
    }

    // JSX text between tags on one line: >Some words<
    for (const m of line.matchAll(/>([^<>{}\n]{2,})</g)) {
      const text = m[1].trim();
      if (text) report("text", text);
    }
  });
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full);
      continue;
    }
    if (SKIP_FILE.test(entry.name)) continue;
    if (entry.name.endsWith(".tsx")) scanFile(full);
    else if (entry.name.endsWith(".ts") && full.replace(/\\/g, "/").includes("/src/store/")) scanFile(full);
  }
}

walk(SRC);

if (byFile) {
  const counts = {};
  for (const f of findings) counts[f.file] = (counts[f.file] ?? 0) + 1;
  for (const [file, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(4), file);
} else if (max === null) {
  for (const f of findings) console.log(`${f.file}:${f.line}: [${f.kind}] ${f.text}`);
}

console.log(`${findings.length} hardcoded user-facing string(s)${max === null ? "" : ` (limit ${max})`}`);
if (max !== null && findings.length > max) {
  console.error(`FAIL: ${findings.length} > ${max}. Translate the new strings, or add a reasoned entry to scripts/i18n-allowlist.json.`);
  process.exit(1);
}
