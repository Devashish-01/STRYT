// Static audit: every literal `.from("<table>").select("<columns>")` in src/ checked against the live catalog of the
// STAGING project (identical schema to production). Postgres/PostgREST only reject an unknown column at runtime, so
// a typo ships silently and the screen shows an error or empty state (P07 found E2E-004, 006, 020, 021 this way).
// Embedded relations are skipped. Exit 1 when unknown columns are found.
// Usage: node scripts/audit/select-columns.mjs
import fs from "fs";
import path from "path";
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "..");
const REF = (fs.readFileSync(`${ROOT}/.env.staging`, "utf8").match(/^STAGING_REF=(.*)$/m) ?? [])[1]?.trim();
if (!REF || REF === "gnswxlfmcwyhmzlfipql") { console.error("REFUSED: needs .env.staging with the staging ref"); process.exit(2); }
const pat = fs.readFileSync(`${ROOT}/.env`, "utf8").match(/^SUPABASE_PERSONAL_ACCESS_TOKEN=(.*)$/m)[1].trim();
const rows = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: "select table_name t, column_name c from information_schema.columns where table_schema='public'" }) })).json();
const cols = {}; for (const r of rows) (cols[r.t] ??= new Set()).add(r.c);
const files = []; const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f) && !/\.test\./.test(f)) files.push(p); } };
walk(`${ROOT}/src`);
let hits = 0;
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(/\.from\(\s*"([a-z_]+)"\s*\)([\s\S]{0,80}?)\.select\(\s*(["`])([^"`]*)\3/g)) {
    const table = m[1]; const sel = m[4];
    if (!cols[table] || sel.includes("${")) continue;
    // split on top-level commas, keeping embeds (anything with parentheses) whole, then skip embeds
    const items = []; let cur = ""; let depth = 0;
    for (const ch of sel) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "," && depth === 0) { items.push(cur); cur = ""; } else cur += ch; }
    items.push(cur);
    for (let c of items.map((x) => x.trim()).filter((x) => x && !x.includes("("))) {
      if (c === "*" ) continue;
      if (c.includes(":")) c = c.split(":")[1].trim(); // alias:column
      c = c.replace(/::.*$/, "");
      if (!/^[a-z_][a-z0-9_]*$/.test(c)) continue;
      if (!cols[table].has(c) && !cols[c]) { hits++; const line = src.slice(0, m.index).split("\n").length; console.log(`${path.relative(ROOT, f)}:${line}  ${table}.${c}`); }
    }
  }
}
console.log(`${hits} unknown column(s)`);
process.exit(hits ? 1 : 0);
