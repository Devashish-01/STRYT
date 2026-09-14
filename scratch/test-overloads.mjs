import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const env = {};
for (const f of ['.env', '.env.local']) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const token = env.SUPABASE_PERSONAL_ACCESS_TOKEN;
const ref = (env.VITE_SUPABASE_URL || '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const API = `https://api.supabase.com/v1/projects/${ref}`;

const res = await fetch(`${API}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: `
      select p.proname,
             pg_get_function_identity_arguments(p.oid) as args,
             md5(btrim(regexp_replace(p.prosrc, '[ \\t\\r\\n\\f\\v]+', ' ', 'g'), ' ')) as body_md5
      from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.prokind in ('f','p','w')
        and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      order by p.proname;
    `
  })
});

const rows = await res.json();
const byName = {};
for (const r of rows) {
  byName[r.proname] = byName[r.proname] || [];
  byName[r.proname].push(r);
}

for (const [k, v] of Object.entries(byName)) {
  if (v.length > 1) {
    console.log('OVERLOAD:', k, JSON.stringify(v, null, 2));
  }
}
console.log(`Total live functions: ${rows.length}`);
