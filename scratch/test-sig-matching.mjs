import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");

function normWhitespace(s) {
  if (!s) return "";
  return s.replace(/[ \t\r\n\f\v]+/g, " ").trim();
}

function stripComments(s) {
  if (!s) return "";
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
}

function md5(s) {
  return crypto.createHash("md5").update(s).digest("hex");
}

function splitArgs(argStr) {
  if (!argStr || !argStr.trim()) return [];
  const args = [];
  let depth = 0;
  let current = "";
  for (const ch of argStr) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      args.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

function normalizeType(t) {
  let s = t.toLowerCase().trim();
  s = s.replace(/"/g, "");
  if (s === 'int' || s === 'int4' || s === 'integer') return 'integer';
  if (s === 'int8' || s === 'bigint') return 'bigint';
  if (s === 'int2' || s === 'smallint') return 'smallint';
  if (s === 'bool' || s === 'boolean') return 'boolean';
  if (s === 'timestamptz' || s === 'timestamp with time zone') return 'timestamp with time zone';
  if (s === 'timestamp' || s === 'timestamp without time zone') return 'timestamp without time zone';
  if (s === 'float8' || s === 'double precision') return 'double precision';
  if (s === 'float4' || s === 'real') return 'real';
  if (s.startsWith('character varying') || s.startsWith('varchar')) return 'text';
  return s;
}

function normalizeArgTypes(argStr) {
  const cleanStr = normWhitespace(stripComments(argStr));
  const parts = splitArgs(cleanStr);
  const types = parts.map(p => {
    let s = p.replace(/\s+default\s+[\s\S]*$/i, '').trim();
    s = s.replace(/^(?:in|out|inout|variadic)\s+/i, '').trim();
    const tokens = s.split(/\s+/);
    if (tokens.length === 1) {
      return normalizeType(tokens[0]);
    }
    return normalizeType(tokens.slice(1).join(' '));
  });
  return types.join(', ');
}

// 1. Live catalog
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
             p.prosrc as raw_body,
             md5(btrim(regexp_replace(p.prosrc, '[ \\t\\r\\n\\f\\v]+', ' ', 'g'), ' ')) as body_md5
      from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.prokind in ('f','p','w')
        and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      order by p.proname;
    `
  })
});
const liveRows = await res.json();
const liveFunctions = new Map();
for (const r of liveRows) {
  const name = r.proname.toLowerCase();
  const normArgs = normalizeArgTypes(r.args || "");
  const sig = `${name}(${normArgs})`;
  const normalized = normWhitespace(r.raw_body);
  const stripped = normWhitespace(stripComments(r.raw_body));
  liveFunctions.set(sig, {
    name,
    sig,
    args: r.args,
    bodyMd5: r.body_md5 || md5(normalized),
    strippedMd5: md5(stripped),
  });
}

// 2. Repo migrations
const migrationFiles = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith(".sql")).sort();
const repoFunctions = new Map();

for (const file of migrationFiles) {
  const filePath = path.join(MIGRATIONS_DIR, file);
  const sql = fs.readFileSync(filePath, "utf8");

  // Track function drops
  for (const m of sql.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?(?:public\.)?([a-zA-Z0-9_]+)(?:\s*\(([^)]*)\))?/gi)) {
    const fnName = m[1].toLowerCase();
    const args = m[2];
    if (args !== undefined && args.trim()) {
      const sig = `${fnName}(${normalizeArgTypes(args)})`;
      repoFunctions.delete(sig);
    } else {
      for (const k of Array.from(repoFunctions.keys())) {
        if (k.startsWith(`${fnName}(`)) {
          repoFunctions.delete(k);
        }
      }
    }
  }

  const fnRegex = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)[\s\S]*?as\s+\$([a-zA-Z0-9_]*)\$([\s\S]*?)\$\3\$/gi;
  for (const m of sql.matchAll(fnRegex)) {
    const fnName = m[1].toLowerCase();
    const args = m[2].trim();
    const normArgs = normalizeArgTypes(args);
    const sig = `${fnName}(${normArgs})`;
    const body = m[4];
    const normalized = normWhitespace(body);
    const stripped = normWhitespace(stripComments(body));
    repoFunctions.set(sig, {
      name: fnName,
      sig,
      bodyMd5: md5(normalized),
      strippedMd5: md5(stripped),
      file,
    });
  }
}

console.log(`Live functions cataloged: ${liveFunctions.size}`);
console.log(`Repo functions analyzed:  ${repoFunctions.size}`);

const missingFromDb = [];
const bodyDrift = [];
const commentDrift = [];
const databaseOnly = [];

for (const [sig, repoFn] of repoFunctions.entries()) {
  const liveFn = liveFunctions.get(sig);
  if (!liveFn) {
    missingFromDb.push({ sig, file: repoFn.file });
  } else {
    if (liveFn.bodyMd5 !== repoFn.bodyMd5) {
      if (liveFn.strippedMd5 === repoFn.strippedMd5) {
        commentDrift.push({ sig, file: repoFn.file });
      } else {
        bodyDrift.push({ sig, file: repoFn.file, repoMd5: repoFn.bodyMd5, liveMd5: liveFn.bodyMd5 });
      }
    }
  }
}

for (const [sig, liveFn] of liveFunctions.entries()) {
  if (!repoFunctions.has(sig)) {
    databaseOnly.push(sig);
  }
}

console.log(`Missing from DB:     ${missingFromDb.length}`, missingFromDb);
console.log(`Body drift:          ${bodyDrift.length}`, bodyDrift);
console.log(`Comment drift:       ${commentDrift.length}`);
console.log(`Database only:       ${databaseOnly.length}`, databaseOnly);
