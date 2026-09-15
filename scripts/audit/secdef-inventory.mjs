// scripts/audit/secdef-inventory.mjs
// Read-only catalog audit for all public SECURITY DEFINER functions in STRYT.
// Implements Step 5.A of Phase P05 (Authorization Audit).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OUTPUT_CSV = path.join(ROOT, 'docs', 'security', 'SECDEF_INVENTORY.csv');

function readEnv() {
  const env = {};
  for (const f of ['.env', '.env.local']) {
    const p = path.join(ROOT, f);
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

if (!TOKEN || !REF) {
  console.error('Error: Missing SUPABASE_PERSONAL_ACCESS_TOKEN or VITE_SUPABASE_URL');
  process.exit(1);
}

const API = `https://api.supabase.com/v1/projects/${REF}`;
const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

async function query(sql) {
  const res = await fetch(`${API}/database/query`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Management API error (${res.status}): ${text}`);
  }
  return await res.json();
}

function getAllFiles(dir, exts = ['.ts', '.tsx', '.js', '.jsx']) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(getAllFiles(full, exts));
    } else if (exts.some(ext => entry.name.endsWith(ext))) {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  console.log(`Connecting to project ${REF} via Supabase Management API...`);

  // 1. Fetch all public SECURITY DEFINER functions excluding extension dependencies
  const sql = `
    WITH cron_jobs AS (
      SELECT command
      FROM cron.job
      WHERE to_regclass('cron.job') IS NOT NULL
    ),
    policies AS (
      SELECT
        polrelid::regclass::text AS table_name,
        polname,
        pg_get_expr(polqual, polrelid) AS qual,
        pg_get_expr(polwithcheck, polrelid) AS with_check
      FROM pg_policy
    )
    SELECT
      p.oid,
      p.proname,
      pg_get_function_identity_arguments(p.oid) AS args,
      pg_get_function_result(p.oid) AS return_type,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
      coalesce(array_to_string(p.proconfig, ', '), '') AS proconfig,
      p.prosrc AS body,
      (
        SELECT count(*)
        FROM pg_trigger t
        WHERE t.tgfoid = p.oid
      ) AS trigger_count,
      (
        SELECT count(*)
        FROM cron_jobs c
        WHERE c.command ~* ('\\m' || p.proname || '\\M')
      ) AS cron_count,
      (
        SELECT string_agg(table_name || '.' || polname, '; ')
        FROM policies pol
        WHERE (pol.qual ~* ('\\m' || p.proname || '\\M') OR pol.with_check ~* ('\\m' || p.proname || '\\M'))
      ) AS policy_refs
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prosecdef = true
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e'
      )
    ORDER BY p.proname, args;
  `;

  const rows = await query(sql);
  console.log(`Retrieved ${rows.length} public SECURITY DEFINER functions from catalog.`);

  // 2. Pre-index src and edge function callers
  const srcFiles = getAllFiles(path.join(ROOT, 'src'));
  const edgeFiles = getAllFiles(path.join(ROOT, 'supabase', 'functions'), ['.ts', '.js']);

  const srcContents = srcFiles.map(f => ({
    rel: path.relative(ROOT, f).replace(/\\/g, '/'),
    content: fs.readFileSync(f, 'utf8'),
  }));

  const edgeContents = edgeFiles.map(f => ({
    rel: path.relative(ROOT, f).replace(/\\/g, '/'),
    content: fs.readFileSync(f, 'utf8'),
  }));

  // Helper to escape CSV values
  function csvEscape(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  const csvRows = [];
  const riskCounts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  const highRiskList = [];
  const mediumRiskList = [];

  for (const r of rows) {
    const fnName = r.proname;
    const sig = `${fnName}(${r.args || ''})`;
    const ret = r.return_type || '';
    const body = r.body || '';

    const anonExec = Boolean(r.anon_exec);
    const authExec = Boolean(r.auth_exec);
    const searchPathPinned = /search_path\s*=/i.test(r.proconfig);

    // references_auth_uid: body matches auth.uid()
    const referencesAuthUid = /auth\.uid\s*\(\s*\)/i.test(body);

    // ownership_check: body matches any of the specified tokens
    const ownershipRegex = /\b(has_business_scope|has_business_access|can_manage_business|is_admin|owner_user_id|customer_user_id|requester_user_id|agent_user_id|grantee_user_id)\b/i;
    const ownershipCheck = ownershipRegex.test(body);

    // writes: insert into, update, delete from
    const writesRegex = /\b(insert\s+into|update\s+[a-z0-9_.]+\s+set|delete\s+from)\b/i;
    const writes = writesRegex.test(body);

    const usedByPolicy = Boolean(r.policy_refs && r.policy_refs.length > 0);
    const usedByTrigger = Number(r.trigger_count) > 0;
    const usedByCron = Number(r.cron_count) > 0;

    // Callers in src: search for rpc('<fnName>' or rpc("<fnName>"
    const rpcPattern = new RegExp(`rpc\\s*\\(\\s*['"\`]${fnName}['"\`]`, 'g');
    const appCallers = srcContents
      .filter(f => rpcPattern.test(f.content))
      .map(f => f.rel);

    // Edge callers: search in edge functions
    const edgeCallers = edgeContents
      .filter(f => rpcPattern.test(f.content) || new RegExp(`\\b${fnName}\\b`).test(f.content))
      .map(f => f.rel);

    // Determine returns table/set data: returns record, table(...), setof ...
    const returnsTableOrSet = /\b(table\b|setof\b|record\b)/i.test(ret);

    // Risk classification:
    // HIGH = auth_exec and writes and not ownership_check
    // MEDIUM = auth_exec and not writes and not ownership_check and the function returns table/set data
    // LOW = everything else
    let risk = 'LOW';
    if (authExec && writes && !ownershipCheck) {
      risk = 'HIGH';
      highRiskList.push({ sig, fnName, ret, appCallers: appCallers.length });
    } else if (authExec && !writes && !ownershipCheck && returnsTableOrSet) {
      risk = 'MEDIUM';
      mediumRiskList.push({ sig, fnName, ret, appCallers: appCallers.length });
    }

    riskCounts[risk]++;

    csvRows.push({
      signature: sig,
      returns: ret,
      anon_exec: anonExec,
      auth_exec: authExec,
      search_path_pinned: searchPathPinned,
      references_auth_uid: referencesAuthUid,
      ownership_check: ownershipCheck,
      writes: writes,
      used_by_policy: usedByPolicy ? r.policy_refs : false,
      used_by_trigger: usedByTrigger,
      used_by_cron: usedByCron,
      app_callers: appCallers.join('; '),
      edge_callers: edgeCallers.join('; '),
      risk: risk,
    });
  }

  // Ensure output directory exists
  const outDir = path.dirname(OUTPUT_CSV);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Write CSV
  const headersList = [
    'signature',
    'returns',
    'anon_exec',
    'auth_exec',
    'search_path_pinned',
    'references_auth_uid',
    'ownership_check',
    'writes',
    'used_by_policy',
    'used_by_trigger',
    'used_by_cron',
    'app_callers',
    'edge_callers',
    'risk',
  ];

  const csvContent = [
    headersList.join(','),
    ...csvRows.map(row => headersList.map(h => csvEscape(row[h])).join(',')),
  ].join('\n');

  fs.writeFileSync(OUTPUT_CSV, csvContent, 'utf8');
  console.log(`\nWritten inventory to: ${path.relative(ROOT, OUTPUT_CSV)}`);

  console.log('\n=======================================================');
  console.log('📊 SECURITY DEFINER INVENTORY SUMMARY');
  console.log('=======================================================');
  console.log(`Total public secdef functions: ${rows.length}`);
  console.log(`  🔴 HIGH Risk:   ${riskCounts.HIGH}`);
  console.log(`  🟡 MEDIUM Risk: ${riskCounts.MEDIUM}`);
  console.log(`  🟢 LOW Risk:    ${riskCounts.LOW}`);
  console.log('=======================================================');

  if (highRiskList.length > 0) {
    console.log(`\n🔴 HIGH RISK FUNCTIONS (${highRiskList.length}):`);
    for (const h of highRiskList) {
      console.log(`   - ${h.sig} -> returns ${h.ret} (App callers: ${h.appCallers})`);
    }
  }

  if (mediumRiskList.length > 0) {
    console.log(`\n🟡 MEDIUM RISK FUNCTIONS (${mediumRiskList.length}):`);
    for (const m of mediumRiskList) {
      console.log(`   - ${m.sig} -> returns ${m.ret} (App callers: ${m.appCallers})`);
    }
  }
}

main().catch(err => {
  console.error('Inventory generation failed:', err);
  process.exit(1);
});
