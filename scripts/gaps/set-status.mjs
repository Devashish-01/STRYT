// P08 — records verification results in docs/gaps/GAP_LEDGER.csv without hand-editing the CSV.
// Input: a JSON file with [{ gap_id, status, evidence, commit?, notes? }, ...]. verified_by / verified_on are stamped.
// Refuses unknown gap ids and statuses; run scripts/gaps/ledger-summary.mjs afterwards for the integrity check.
// Usage: node scripts/gaps/set-status.mjs <updates.json> [--by "claude (P08)"]

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = path.join(ROOT, "docs", "gaps", "GAP_LEDGER.csv");
const STATUSES = ["UNVERIFIED", "FIXED", "OPEN", "NOT_A_BUG", "DECISION", "DEFERRED"];
const by = process.argv.includes("--by") ? process.argv[process.argv.indexOf("--by") + 1] : "claude (P08)";
const updates = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));

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
const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

const [head, ...data] = parseCsv(fs.readFileSync(FILE, "utf8")).filter((r) => r.length > 1);
const rows = data.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
const byId = new Map(rows.map((r) => [r.gap_id, r]));
const today = new Date().toISOString().slice(0, 10);
let changed = 0;
for (const u of updates) {
  const row = byId.get(u.gap_id);
  if (!row) throw new Error(`unknown gap_id ${u.gap_id}`);
  if (!STATUSES.includes(u.status)) throw new Error(`${u.gap_id}: bad status ${u.status}`);
  if (u.status !== "UNVERIFIED" && !String(u.evidence ?? "").trim()) throw new Error(`${u.gap_id}: evidence required`);
  Object.assign(row, { status: u.status, evidence: u.evidence ?? row.evidence, verified_by: by, verified_on: today });
  if (u.commit !== undefined) row.commit = u.commit;
  if (u.notes !== undefined) row.notes = u.notes;
  changed++;
}
fs.writeFileSync(FILE, [head.join(","), ...rows.map((r) => head.map((h) => csvCell(r[h])).join(","))].join("\n") + "\n");
console.log(`updated ${changed} row(s)`);
