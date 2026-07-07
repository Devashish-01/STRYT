import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC = path.join(__dirname, "..", "src");

function getFiles(dir, acc = []) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) getFiles(full, acc);
    else if (f.endsWith(".tsx") || f.endsWith(".ts")) acc.push(full);
  }
  return acc;
}

const REPLACEMENTS = [
  // Green
  [/#e8f7ee/g, "var(--green-100)"], [/#f0fdf4/g, "var(--green-100)"], [/#e7f7ee/g, "var(--green-100)"],
  [/#bbf7d0/g, "var(--green-500)"], [/#15803d/g, "var(--green-600)"], [/#4ade80/g, "var(--green-500)"],
  [/#dcfce7/g, "var(--green-100)"], [/#14532d/g, "var(--green-700)"],
  // Red
  [/#fef2f2/g, "var(--red-50)"], [/#fee2e2/g, "var(--red-100)"], [/#fff5f5/g, "var(--red-50)"],
  [/#fecaca/g, "var(--red-100)"], [/#fca5a5/g, "var(--red-100)"], [/#991b1b/g, "var(--red-600)"],
  [/#7f1d1d/g, "var(--red-600)"], [/#b91c1c/g, "var(--red-600)"],
  // Amber / Orange
  [/#fff7ed/g, "var(--orange-50)"], [/#fff3e8/g, "var(--orange-50)"], [/#fffbeb/g, "var(--amber-50)"],
  [/#fdba74/g, "var(--orange-100)"], [/#ffd9b3/g, "var(--orange-100)"], [/#fed7aa/g, "var(--orange-100)"],
  [/#fef3c7/g, "var(--amber-100)"], [/#fef08a/g, "var(--amber-100)"], [/#fde68a/g, "var(--amber-100)"],
  [/#fefce8/g, "var(--amber-50)"], [/#b45309/g, "var(--amber-700)"], [/#d97706/g, "var(--amber-700)"],
  [/#854d0e/g, "var(--amber-700)"], [/#78350f/g, "var(--amber-700)"], [/#92400e/g, "var(--amber-700)"],
  [/#c2410c/g, "var(--orange-500)"], [/#fbbf24/g, "var(--amber-500)"], [/#facc15/g, "var(--amber-500)"],
  [/#ffd23f/g, "var(--amber-500)"], [/#ffba2b/g, "var(--accent-400)"], [/#f59e0b/g, "var(--amber-500)"],
  // Blue / Cyan
  [/#3b82f6/g, "var(--blue-500)"], [/#0ea5e9/g, "var(--blue-500)"],
  [/#e0f2fe/g, "var(--ink-100)"], [/#e6f5fe/g, "var(--ink-100)"],
  // Purple (brand-adjacent)
  [/#a855f7/g, "var(--brand-400)"], [/#8b5cf6/g, "var(--brand-500)"], [/#6366f1/g, "var(--blue-500)"],
  [/#f3e8ff/g, "var(--brand-100)"], [/#f1eef8/g, "var(--ink-100)"], [/#faf5ff/g, "var(--brand-50)"],
  // Pink
  [/#db2777/g, "var(--pink-500)"], [/#fdeef6/g, "var(--ink-50)"], [/#ffeef4/g, "var(--ink-50)"],
  // Gray neutrals
  [/#eef2ff/g, "var(--brand-50)"], [/#14111c/g, "var(--ink-900)"],
  [/#6b7280/g, "var(--ink-500)"], [/#4b5563/g, "var(--ink-600)"], [/#f3f4f6/g, "var(--ink-100)"],
  [/"#666"/g, '"var(--ink-600)"'], [/"#888"/g, '"var(--ink-500)"'], [/"#555"/g, '"var(--ink-700)"'],
  // Misc brand stops
  [/#e9d5ff/g, "var(--brand-200)"],
];

let total = 0;
for (const file of getFiles(SRC)) {
  let src = fs.readFileSync(file, "utf8");
  const orig = src;
  for (const [pat, rep] of REPLACEMENTS) src = src.replace(pat, rep);
  if (src !== orig) {
    fs.writeFileSync(file, src, "utf8");
    total++;
    console.log("PATCHED:", path.relative(SRC, file));
  }
}
console.log("Total files patched:", total);
