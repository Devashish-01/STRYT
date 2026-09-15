// Read-only audit: finds references in live SQL/plpgsql function bodies to relations, functions or columns that
// don't exist. Postgres does not validate plpgsql bodies when a function is created, so a wrong table or column
// name only fails when the statement runs (P07 found 4 such functions breaking chat, reviews, story reactions and
// provider recommendations). Checks `public.<name>` references and simple `select a, b into ... from public.t`
// column lists. PostGIS internals are reported too and can be ignored.
// Usage: node scripts/audit/function-dead-refs.mjs [project-ref]   (default: production, read-only transaction)
import fs from "fs";
const ref = process.argv[2] || "gnswxlfmcwyhmzlfipql";
const pat = fs.readFileSync(new URL("../../.env", import.meta.url), "utf8").match(/^SUPABASE_PERSONAL_ACCESS_TOKEN=(.*)$/m)[1].trim();
const run = async (q) => (await (await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: "set transaction read only;\n" + q }) })).json());
const fns = await run(`select p.proname, p.prosrc from pg_proc p where p.pronamespace='public'::regnamespace and p.prolang in (select oid from pg_language where lanname in ('plpgsql','sql'))`);
const names = new Set((await run(`select relname n from pg_class where relnamespace='public'::regnamespace union select proname from pg_proc where pronamespace='public'::regnamespace union select typname from pg_type where typnamespace='public'::regnamespace`)).map((r) => r.n));
const cols = await run(`select table_name t, column_name c from information_schema.columns where table_schema='public'`);
const colset = {};
for (const r of cols) (colset[r.t] ??= new Set()).add(r.c);
const out = {};
for (const f of fns) {
  const src = f.prosrc.replace(/--[^\n]*/g, "");
  for (const m of src.matchAll(/\bpublic\.([a-z_][a-z0-9_]*)/gi)) {
    const n = m[1].toLowerCase();
    if (!names.has(n)) (out[f.proname] ??= new Set()).add(`missing relation/function public.${n}`);
  }
  // "select a, b, c into ... from public.t" column check for simple single-table selects
  for (const m of src.matchAll(/select\s+([a-z0-9_,\s]+?)\s+into\s+[a-z0-9_,\s]+?\s+from\s+public\.([a-z_]+)\s/gi)) {
    const t = m[2].toLowerCase();
    if (!colset[t]) continue;
    for (const c of m[1].split(",").map((x) => x.trim().toLowerCase())) {
      if (/^[a-z_][a-z0-9_]*$/.test(c) && !colset[t].has(c) && c !== "count" && c !== "exists") (out[f.proname] ??= new Set()).add(`missing column ${t}.${c}`);
    }
  }
}
for (const [k, v] of Object.entries(out)) console.log(k, "→", [...v].join("; "));
console.log(`scanned ${fns.length} functions`);
