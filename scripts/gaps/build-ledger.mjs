// P08.0 — builds docs/gaps/GAP_LEDGER.csv from every docs/gaps/*_GAP_LOG.md.
//
// One row per finding. `doc_claim` records what the log itself says (Resolved / Fixed / Deferred …) — a claim,
// not a verified status. `status` starts as UNVERIFIED; verification sessions set FIXED / OPEN / NOT_A_BUG /
// DECISION / DEFERRED with evidence. Re-running keeps every row's verified columns (merge by gap_id).
//
// Formats handled (surveyed 2026-09-15):
//   A  | **ID** | Title | 🔴 P0 | Impact |                     (43 logs)
//   B  | **ID** | Title | **Ready-to-Use Blocker** | Impact |   (classification instead of severity; 4 logs)
//   C  | **ID** | 🔴 P0 | Description | Action item |          (3 logs)
//   D  | **ID** | Title | **Blocker** | Fixed |                (TEAM_ACCESS)
//   E  ## #N — Title … **Status:** Fixed — date                (COMMUNITY_POSTS, no table)
//
// Usage: node scripts/gaps/build-ledger.mjs

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(ROOT, "docs", "gaps");
const OUT = path.join(DIR, "GAP_LEDGER.csv");
const COLS = ["gap_id", "log_file", "domain", "flow_id", "severity", "title", "doc_claim", "status", "evidence", "commit", "verified_by", "verified_on", "notes"];

const tracker = fs.readFileSync(path.join(DIR, "MASTER_FLOW_AUDIT_TRACKER.md"), "utf8");
const flowOf = {};
for (const m of tracker.matchAll(/^\| \*\*(\d+)\.(\d+)\*\* \|.*\[`([A-Z_]+)_GAP_LOG\.md`\]/gm)) flowOf[m[3]] = { domain: m[1], flow: `${m[1]}.${m[2]}` };

const clean = (s) => s.replace(/~~/g, "").replace(/\*\*/g, "").replace(/`/g, "").replace(/\s+/g, " ").trim();
const sevOf = (s) => {
  const p = s.match(/P([0-3])/);
  if (p) return `P${p[1]}`;
  if (/Ready-to-Use Blocker|^\W*Blocker/i.test(s)) return "P0";
  if (/Ready-to-Use/i.test(s)) return "P1";
  return "";
};
const claimOf = (...cells) => {
  const t = cells.join(" ");
  if (/Resolved|\bFixed\b/i.test(t)) return /Resolved/i.test(t) ? "Resolved" : "Fixed";
  const d = t.match(/Deferred \(([^)]+)\)/i);
  if (d) return `Deferred (${d[1]})`;
  if (/~~/.test(cells[0] || "")) return "struck through";
  return "";
};

const rows = [];
const perLog = {};
for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith("_GAP_LOG.md")).sort()) {
  const stem = file.replace(/_GAP_LOG\.md$/, "");
  const text = fs.readFileSync(path.join(DIR, file), "utf8");
  const where = flowOf[stem] || { domain: "", flow: "" };
  const found = [];
  const header = text.match(/^\|\s*(Gap #|Gap ID)\s*\|([^\n]*)$/m);
  if (header) {
    const heads = [header[1], ...header[2].split("|").map((h) => h.trim()).filter(Boolean)];
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\|\s*\*\*([^*]+)\*\*\s*\|(.*)\|\s*$/);
      if (!m) continue;
      const cells = m[2].split("|").map((c) => c.trim());
      const col = (name) => { const i = heads.findIndex((h) => h.toLowerCase() === name.toLowerCase()); return i > 0 ? cells[i - 1] ?? "" : ""; };
      const id = m[1].trim().replace(/^#/, "#");
      const titleCell = col("Title") || col("Description");
      const sevCell = col("Severity") || col("Priority") || col("Classification");
      found.push({
        id, title: clean(titleCell), severity: sevOf(sevCell), claim: claimOf(titleCell, sevCell, col("Status")),
        notes: clean(col("Impact on Ready-to-Use") || col("Action Item") || ""),
      });
    }
  } else {
    // format E: headings with a Status line below
    const parts = text.split(/^## (#\d+) — /m);
    for (let i = 1; i < parts.length; i += 2) {
      const body = parts[i + 1] || "";
      const title = body.split(/\r?\n/)[0];
      const status = body.match(/\*\*Status:\*\*\s*([^\n]+)/)?.[1] || "";
      found.push({ id: parts[i], title: clean(title), severity: "", claim: clean(status), notes: "" });
    }
  }
  // de-duplicate ids within a log (keep first; later duplicates get a suffix so nothing is lost)
  const seen = {};
  for (const f of found) {
    let gid = `${stem}:${f.id}`;
    seen[gid] = (seen[gid] || 0) + 1;
    if (seen[gid] > 1) gid = `${gid}~${seen[gid]}`;
    rows.push({ gap_id: gid, log_file: file, domain: where.domain, flow_id: where.flow, severity: f.severity, title: f.title, doc_claim: f.claim, status: "UNVERIFIED", evidence: "", commit: "", verified_by: "", verified_on: "", notes: f.notes });
  }
  perLog[file] = found.length;
}

// keep verified columns from an existing ledger
const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
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
const kept = {};
if (fs.existsSync(OUT)) {
  const [head, ...data] = parseCsv(fs.readFileSync(OUT, "utf8")).filter((r) => r.length > 1);
  for (const r of data) { const o = Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])); kept[o.gap_id] = o; }
}
const extra = Object.values(kept).filter((o) => !rows.some((r) => r.gap_id === o.gap_id)); // rows added by hand (E2E-###, W3-FE:…, P04/P05)
const merged = [...rows.map((r) => kept[r.gap_id] ? { ...r, status: kept[r.gap_id].status, evidence: kept[r.gap_id].evidence, commit: kept[r.gap_id].commit, verified_by: kept[r.gap_id].verified_by, verified_on: kept[r.gap_id].verified_on, notes: kept[r.gap_id].notes || r.notes } : r), ...extra];

fs.writeFileSync(OUT, [COLS.join(","), ...merged.map((r) => COLS.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n");
console.log(`wrote ${path.relative(ROOT, OUT)}: ${merged.length} rows (${rows.length} from ${Object.keys(perLog).length} logs, ${extra.length} extra rows kept)`);
const noFlow = [...new Set(rows.filter((r) => !r.flow_id).map((r) => r.log_file))];
if (noFlow.length) console.log("logs without a tracker flow link:", noFlow.join(", "));
const zero = Object.entries(perLog).filter(([, n]) => n === 0).map(([f]) => f);
if (zero.length) console.log("logs with 0 parsed rows:", zero.join(", "));
