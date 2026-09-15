// scripts/audit/inspect-bodies.mjs
import fs from 'fs';
import path from 'path';

function readEnv() {
  const env = {};
  for (const f of ['.env', '.env.local']) {
    const p = path.resolve(f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

const env = readEnv();
const TOKEN = env.SUPABASE_PERSONAL_ACCESS_TOKEN;
const REF = (env.VITE_SUPABASE_URL || '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const API = `https://api.supabase.com/v1/projects/${REF}`;

async function query(sql) {
  const res = await fetch(`${API}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

// Fetch the 59 functions' bodies and detailed info
const sql = `
  SELECT
    p.proname,
    pg_get_function_identity_arguments(p.oid) as args,
    pg_get_function_result(p.oid) as return_type,
    p.prosrc as body,
    coalesce(array_to_string(p.proconfig, ', '), '') as proconfig,
    has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.prosecdef = true
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e'
    )
  ORDER BY p.proname, args;
`;

const allFns = await query(sql);
fs.writeFileSync('scripts/audit/all_secdef_bodies.json', JSON.stringify(allFns, null, 2), 'utf8');
console.log(`Saved ${allFns.length} function bodies to scripts/audit/all_secdef_bodies.json`);
