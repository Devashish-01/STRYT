// P08 — summary and integrity check for docs/gaps/GAP_LEDGER.csv. Exits non-zero when:
//   - a gap_id is duplicated;
//   - a row's status is not one of UNVERIFIED | FIXED | OPEN | NOT_A_BUG | DECISION | DEFERRED;
//   - a FIXED / NOT_A_BUG / DECISION / DEFERRED row has no evidence;
//   - a DEFERRED row's evidence doesn't name a decision id (D1…);
//   - a DECISION row's evidence doesn't name a decision id (D17+) or the word "decision".
// Usage: node scripts/gaps/ledger-summary.mjs [--domain N]

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = path.join(ROOT, "docs", "gaps", "GAP_LEDGER.csv");
const onlyDomain = process.argv.includes("--domain") ? process.argv[process.argv.indexOf("--domain") + 1] : null;

function parseCsv(text) {
  const out = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell.replace(/\r$/, "")); out.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out;
}
const [head, ...data] = parseCsv(fs.readFileSync(FILE, "utf8")).filter((r) => r.length > 1);
const rows = data.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
const STATUSES = ["UNVERIFIED", "FIXED", "OPEN", "NOT_A_BUG", "DECISION", "DEFERRED"];
const problems = [];
const ids = new Set();
for (const r of rows) {
  if (ids.has(r.gap_id)) problems.push(`duplicate gap_id ${r.gap_id}`);
  ids.add(r.gap_id);
  if (!STATUSES.includes(r.status)) problems.push(`${r.gap_id}: bad status "${r.status}"`);
  if (["FIXED", "NOT_A_BUG", "DECISION", "DEFERRED"].includes(r.status) && !r.evidence.trim()) problems.push(`${r.gap_id}: ${r.status} without evidence`);
  if (r.status === "DEFERRED" && !/\bD\d+\b/.test(r.evidence)) problems.push(`${r.gap_id}: DEFERRED without a decision id`);
  if (r.status === "DECISION" && !/\bD\d+\b|decision/i.test(r.evidence)) problems.push(`${r.gap_id}: DECISION without a decision reference`);
  if (r.status !== "UNVERIFIED" && (!r.verified_by || !r.verified_on)) problems.push(`${r.gap_id}: ${r.status} without verified_by/verified_on`);
}

const scope = onlyDomain ? rows.filter((r) => r.domain === onlyDomain) : rows;
const sevs = ["P0", "P1", "P2", "P3", ""];
const table = {};
for (const r of scope) {
  table[r.status] ??= Object.fromEntries(sevs.map((s) => [s, 0]));
  table[r.status][sevs.includes(r.severity) ? r.severity : ""]++;
}
console.log(`GAP_LEDGER${onlyDomain ? ` domain ${onlyDomain}` : ""}: ${scope.length} rows`);
console.log("status      |  P0  P1  P2  P3  n/a | total");
for (const s of STATUSES) {
  if (!table[s]) continue;
  const t = table[s];
  const total = sevs.reduce((a, k) => a + t[k], 0);
  console.log(`${s.padEnd(11)} | ${sevs.map((k) => String(t[k]).padStart(3)).join(" ")} | ${total}`);
}
const byDomain = {};
for (const r of rows) { byDomain[r.domain || "?"] ??= { rows: 0, unverified: 0, open: 0 }; byDomain[r.domain || "?"].rows++; if (r.status === "UNVERIFIED") byDomain[r.domain || "?"].unverified++; if (r.status === "OPEN") byDomain[r.domain || "?"].open++; }
console.log("by domain:", Object.entries(byDomain).sort((a, b) => Number(a[0]) - Number(b[0])).map(([d, v]) => `${d}: ${v.rows} (unverified ${v.unverified}, open ${v.open})`).join(" | "));
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems.slice(0, 40)) console.log("  -", p);
  process.exit(1);
}
console.log("integrity: OK");
