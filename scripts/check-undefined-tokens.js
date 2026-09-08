import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC_DIR = path.join(__dirname, "..", "src");
const CSS_FILE = path.join(SRC_DIR, "index.css");

/**
 * Fails the build when a `var(--token)` in the app refers to a custom property
 * that `index.css` never defines.
 *
 * This is the blind spot in check-hardcoded-colors.js. That script's job is
 * "no raw hex outside index.css", which it does well — but it is satisfied by
 * `var(--red-700)` whether or not `--red-700` exists. An undefined custom
 * property is not an error in CSS: it resolves to nothing, the declaration is
 * dropped, and the element silently inherits. So the failure mode is invisible
 * text, a transparent border, or a gradient with a missing stop — never a
 * console message, and never a failed build.
 *
 * That is exactly how eleven of these shipped:
 *   · --red-700, referenced bare in three screens, defined nowhere
 *   · --green-400 and --orange-400 as the FIRST STOP of two gradients
 *   · --amber-600 in five places across the appointments console
 *
 * Because the two checks are complementary, the honest fix for a violation is
 * almost always to define the token — not to reach for a hex fallback, which
 * just moves the problem into the other script's jurisdiction.
 */

/** Every `--custom-property:` declared anywhere in index.css. */
function definedTokens() {
  const css = fs.readFileSync(CSS_FILE, "utf8");
  const found = new Set();
  for (const m of css.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)) found.add(m[1]);
  return found;
}

/**
 * Tokens the app sets at runtime from an inline style, e.g.
 * `style={{ "--pf-accent": accent } as CSSProperties}`. These are legitimately
 * absent from index.css — the whole point is that the value is per-instance.
 *
 * Discovered by scanning rather than hand-listed: a maintained allowlist grows
 * stale in one direction only (nobody ever removes an entry), which would
 * quietly re-open the hole this script exists to close. If the assignment is
 * deleted, the token stops being discovered and the reference starts failing —
 * which is the correct outcome.
 */
function runtimeAssignedTokens(files) {
  const found = new Set();
  for (const file of files) {
    if (file.endsWith(".css")) continue;
    const text = fs.readFileSync(file, "utf8");
    // "--x": value  /  '--x': value  /  setProperty("--x", …)
    for (const m of text.matchAll(/["'](--[a-zA-Z0-9_-]+)["']\s*[:,]/g)) found.add(m[1]);
  }
  return found;
}

/** Strip // line comments and block comments so a token NAMED in prose isn't
 *  mistaken for a reference. */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(Math.max(0, m.length - p1.length)));
}

function sourceFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, acc);
    else if (/\.(tsx?|jsx?|css)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

const files = sourceFiles(SRC_DIR);
const defined = definedTokens();
const runtime = runtimeAssignedTokens(files);
const violations = [];

for (const file of files) {
  // Comments are blanked (not removed) so reported line numbers stay true.
  const text = stripComments(fs.readFileSync(file, "utf8"));
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    // `var(--x)` and `var(--x, fallback)` alike. A token WITH a fallback still
    // counts: the fallback is a second chance, not a definition, and relying on
    // it means the real value lives in a component instead of the palette.
    for (const m of line.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)/g)) {
      const token = m[1];
      if (defined.has(token) || runtime.has(token)) continue;
      violations.push({
        file: path.relative(path.join(__dirname, ".."), file),
        line: i + 1,
        token,
        text: line.trim().slice(0, 120),
      });
    }
  });
}

if (violations.length > 0) {
  console.error("\x1b[31mUndefined CSS tokens referenced!\x1b[0m");
  console.error("These resolve to nothing at runtime — the declaration is dropped and the");
  console.error("element inherits, so the bug is invisible rather than loud.\n");
  console.error("Define them in src/index.css (preferred), or point the call site at an");
  console.error("existing token. Do NOT add a hex fallback — check-hardcoded-colors.js");
  console.error("will reject that, correctly.\n");

  const byToken = new Map();
  for (const v of violations) {
    if (!byToken.has(v.token)) byToken.set(v.token, []);
    byToken.get(v.token).push(v);
  }
  for (const [token, list] of [...byToken].sort((a, b) => b[1].length - a[1].length)) {
    console.error(`  \x1b[36m${token}\x1b[0m — ${list.length} use${list.length === 1 ? "" : "s"}`);
    for (const v of list.slice(0, 4)) {
      console.error(`    \x1b[33m${v.file}:${v.line}\x1b[0m  ${v.text}`);
    }
    if (list.length > 4) console.error(`    …and ${list.length - 4} more`);
  }
  console.error(`\n${violations.length} reference(s) across ${byToken.size} undefined token(s).`);
  process.exit(1);
}

console.log(
  `✓ All var(--token) references resolve — ${defined.size} defined in index.css, ` +
  `${runtime.size} set at runtime`
);
