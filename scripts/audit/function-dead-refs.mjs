// Read-only audit: finds references in live SQL/plpgsql function bodies to relations, functions or columns that
// don't exist. Postgres does not validate plpgsql bodies when a function is created, so a wrong table or column
// name only fails when the statement runs (P07 found functions breaking chat, reviews, story reactions, provider
// recommendations and counter-offers this way). Checks:
//   - `public.<name>` references (relations, functions, types);
//   - `select a, b into … from public.t` column lists;
//   - `update public.t set a = …, b = …` assignments;
//   - `insert into public.t (a, b, …)` column lists.
// PostGIS internals show up as missing functions and can be ignored. Exit 1 when anything else is found.
// Usage: node scripts/audit/function-dead-refs.mjs [project-ref]   (default: production; read-only transaction)
import fs from "fs";

const ref = process.argv[2] || "gnswxlfmcwyhmzlfipql";
const pat = fs.readFileSync(new URL("../../.env", import.meta.url), "utf8").match(/^SUPABASE_PERSONAL_ACCESS_TOKEN=(.*)$/m)[1].trim();
const run = async (q) =>
  (await (await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "set transaction read only;\n" + q }),
  })).json());

const fns = await run(`select p.proname, p.prosrc from pg_proc p where p.pronamespace='public'::regnamespace and p.prolang in (select oid from pg_language where lanname in ('plpgsql','sql'))`);
const names = new Set((await run(`select relname n from pg_class where relnamespace='public'::regnamespace union select proname from pg_proc where pronamespace='public'::regnamespace union select typname from pg_type where typnamespace='public'::regnamespace`)).map((r) => r.n));
const colset = {};
for (const r of await run(`select table_name t, column_name c from information_schema.columns where table_schema='public'`)) (colset[r.t] ??= new Set()).add(r.c);

const IDENT = /^[a-z_][a-z0-9_]*$/;
const out = {};
const report = (fn, msg) => (out[fn] ??= new Set()).add(msg);

/** Splits on commas that are not inside parentheses. */
function topLevelParts(text) {
  const parts = [];
  let depth = 0, cur = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
  }
  parts.push(cur);
  return parts;
}

for (const f of fns) {
  const src = f.prosrc.replace(/--[^\n]*/g, "");

  for (const m of src.matchAll(/\bpublic\.([a-z_][a-z0-9_]*)/gi)) {
    const n = m[1].toLowerCase();
    if (!names.has(n)) report(f.proname, `missing relation/function public.${n}`);
  }

  // "select a, b into x, y from public.t" and plain "select a, b from public.t" (e.g. "for m in select … from") —
  // simple identifier lists only; anything with expressions is skipped rather than guessed at.
  for (const m of src.matchAll(/select\s+([a-z0-9_,\s]+?)(?:\s+into\s+[a-z0-9_,\s]+?)?\s+from\s+public\.([a-z_]+)\s/gi)) {
    const t = m[2].toLowerCase();
    if (!colset[t]) continue;
    for (const c of m[1].split(",").map((x) => x.trim().toLowerCase())) {
      if (IDENT.test(c) && !colset[t].has(c) && !["count", "exists", "distinct", "1"].includes(c)) report(f.proname, `missing column ${t}.${c} (select)`);
    }
  }

  for (const m of src.matchAll(/update\s+public\.([a-z_]+)(?:\s+(?:as\s+)?[a-z_]+)?\s+set\s+([\s\S]*?)\s+(?:where|returning|from)\b/gi)) {
    const t = m[1].toLowerCase();
    if (!colset[t]) continue;
    for (const part of topLevelParts(m[2])) {
      const c = part.split("=")[0].trim().toLowerCase().replace(/^[a-z_]+\./, "");
      if (IDENT.test(c) && !colset[t].has(c)) report(f.proname, `missing column ${t}.${c} (update)`);
    }
  }

  for (const m of src.matchAll(/insert\s+into\s+public\.([a-z_]+)\s*\(([^)]*)\)/gi)) {
    const t = m[1].toLowerCase();
    if (!colset[t]) continue;
    for (const c of m[2].split(",").map((x) => x.trim().toLowerCase())) {
      if (IDENT.test(c) && !colset[t].has(c)) report(f.proname, `missing column ${t}.${c} (insert)`);
    }
  }
}

let real = 0;
for (const [fn, msgs] of Object.entries(out)) {
  if (fn.startsWith("postgis_")) continue;
  real++;
  console.log(fn, "→", [...msgs].join("; "));
}
console.log(`scanned ${fns.length} functions; ${real} with dead references`);
process.exit(real ? 1 : 0);
