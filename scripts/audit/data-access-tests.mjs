// P05 5.C — real data-access tests on production, one forced-rollback transaction per table.
//
// Replaces the generated DATA_ACCESS_MATRIX that ran no tests. For every public table with
// personal/sensitive-looking columns, this acts as each actor and measures what it can do:
//   anon        guest (no JWT)
//   stranger    signed in with a random user id that owns nothing
//   participant the user most present in the table's user column (if it has one)
//   owner       the owner of the business most present in the table's business_id (if any)
//   team_right  a fresh ACTIVE SCOPED team session with the scope that domain needs (mapped tables only)
//   team_wrong  a fresh ACTIVE SCOPED team session with an unrelated scope
// Per actor: in_scope = rows that "belong" to that actor (all rows for anon/stranger); visible = rows it
// can SELECT; visible_in_scope; update = rows an UPDATE (pk = pk) touches; delete = rows a DELETE touches.
// INSERT is not tested generically (it needs table-specific values).
// Each actor runs in its own sub-block that is rolled back, so one actor's writes never affect the next;
// the whole statement ends with RAISE EXCEPTION, so no row, notification or push survives.
// Output: counts only — no ids, names or values. Refuses any project but production's.
//
// Usage: node scripts/audit/data-access-tests.mjs <out.json>

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REF = "gnswxlfmcwyhmzlfipql";
const OUT = process.argv[2];
if (!OUT) { console.error("usage: node scripts/audit/data-access-tests.mjs <out.json>"); process.exit(1); }

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const urlRef = (env.VITE_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
if (urlRef !== REF) { console.error(`refusing: .env points at ${urlRef}, expected ${REF}`); process.exit(1); }
console.log("target:", REF);

const api = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SUPABASE_PERSONAL_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return { status: r.status, text: await r.text() };
};

const PATTERN = "phone|email|name|address|lat|lng|password|hash|reference|note|handoff|otp|token|document|dob|aadhaar|pan";
// Team scope each domain needs (has_business_scope scopes: appointments, queue, catalog, leads, delivery).
const SCOPE = {
  appointments: "appointments", appointment_items: "appointments", appointment_deliveries: "appointments",
  delivery_batches: "appointments", blocked_slots: "appointments", queue_tokens: "queue", queue_settings: "queue",
  catalog_items: "catalog", business_packages: "catalog", portfolio_items: "catalog", leads: "leads",
  business_qna: "leads", proposals: "leads", bulk_deals: "catalog", bulk_deal_pledges: "catalog", bulk_deal_tokens: "catalog",
};
const USER_COLS = ["customer_user_id", "user_id", "requester_user_id", "owner_user_id", "sender_id", "sender_user_id", "agent_user_id", "grantee_user_id", "reporter_user_id", "rater_user_id", "pledger_user_id", "author_user_id", "created_by"];

const meta = await api(`
  select c.table_name,
    array_agg(distinct c.column_name::text) filter (where c.column_name ~* '(${PATTERN})') sensitive,
    (select array_agg(k.column_name::text order by k.ordinal_position) from information_schema.table_constraints tc
       join information_schema.key_column_usage k on k.constraint_name = tc.constraint_name and k.table_schema = tc.table_schema
      where tc.table_schema = 'public' and tc.table_name = c.table_name and tc.constraint_type = 'PRIMARY KEY') pk,
    (select x.column_name::text from information_schema.columns x where x.table_schema = 'public' and x.table_name = c.table_name
      and x.column_name in (${USER_COLS.map((c) => `'${c}'`).join(",")})
      order by array_position(array[${USER_COLS.map((c) => `'${c}'`).join(",")}], x.column_name::text) limit 1) user_col,
    bool_or(c.column_name = 'business_id') has_business
  from information_schema.columns c
  join pg_tables t on t.schemaname = 'public' and t.tablename = c.table_name
  where c.table_schema = 'public' and c.table_name <> 'spatial_ref_sys'
  group by c.table_name
  having bool_or(c.column_name ~* '(${PATTERN})')
  order by c.table_name`);
const tables = JSON.parse(meta.text);

function extractResult(text) {
  let msg = text;
  try { msg = JSON.parse(text).message || text; } catch { /* keep raw */ }
  const i = msg.indexOf("DAT_RESULT ");
  if (i < 0) return null;
  const rest = msg.slice(i + "DAT_RESULT ".length);
  const end = rest.lastIndexOf("}");
  try { return JSON.parse(rest.slice(0, end + 1)); } catch { return { parse_error: rest.slice(0, 200) }; }
}

const results = [];
for (const t of tables) {
  const T = `public.${t.table_name}`;
  const pk = (t.pk && t.pk[0]) || null;
  const scope = t.has_business ? SCOPE[t.table_name] || null : null;
  const partScope = t.user_col ? `'${t.user_col}::text = ' || quote_literal(coalesce(v_part, ''))` : `'false'`;
  const bizScope = t.has_business ? `'business_id::text = ' || quote_literal(coalesce(v_biz, ''))` : `'false'`;
  const teamScope = scope ? bizScope : `'false'`;
  const block = `
do $dat$
declare
  r jsonb := '{}'::jsonb; tot int; v_part text; v_biz text; v_owner text; v_right text; v_wrong text;
  v_stranger text := gen_random_uuid()::text;
  actors text[]; a text[]; i int;
  in_scope int; vis int; vis_scope int; upd int; del int; e text;
begin
  set local lock_timeout = '2s';
  set local statement_timeout = '25s';
  execute 'select count(*) from ${T}' into tot;
  r := r || jsonb_build_object('rows', tot);
  ${t.user_col ? `execute 'select ${t.user_col}::text from ${T} where ${t.user_col} is not null group by 1 order by count(*) desc limit 1' into v_part;` : ""}
  ${t.has_business ? `execute 'select business_id::text from ${T} where business_id is not null group by 1 order by count(*) desc limit 1' into v_biz;
  if v_biz is not null then select owner_user_id into v_owner from public.businesses where id = v_biz; end if;` : ""}
  ${scope ? `if v_biz is not null then
    select u.id into v_right from public.users u where u.id ~ '^[0-9a-f-]{36}$' and u.id is distinct from v_owner
      and not exists (select 1 from public.business_access_sessions s where s.business_id = v_biz and s.grantee_user_id = u.id) order by u.id limit 1;
    select u.id into v_wrong from public.users u where u.id ~ '^[0-9a-f-]{36}$' and u.id is distinct from v_owner and u.id is distinct from v_right
      and not exists (select 1 from public.business_access_sessions s where s.business_id = v_biz and s.grantee_user_id = u.id) order by u.id limit 1;
    insert into public.business_access_sessions (business_id, grantee_user_id, status, decided_at, access_level, scopes)
      values (v_biz, v_right, 'ACTIVE', now(), 'SCOPED', array['${scope}']),
             (v_biz, v_wrong, 'ACTIVE', now(), 'SCOPED', array['${scope === "catalog" ? "queue" : "catalog"}']);
  end if;` : ""}

  -- label, role, sub, SQL predicate for the rows that belong to this actor
  actors := array[
    'anon', 'anon', '', 'true',
    'stranger', 'authenticated', v_stranger, 'true',
    'participant', 'authenticated', coalesce(v_part, ''), ${partScope},
    'owner', 'authenticated', coalesce(v_owner, ''), ${bizScope},
    'team_right', 'authenticated', coalesce(v_right, ''), ${teamScope},
    'team_wrong', 'authenticated', coalesce(v_wrong, ''), ${teamScope}
  ];
  for i in 0..5 loop
    a := actors[i*4+1 : i*4+4];
    if a[1] <> 'anon' and a[3] = '' then
      r := r || jsonb_build_object(a[1], 'n/a');
      continue;
    end if;
    in_scope := null; vis := null; vis_scope := null; upd := null; del := null; e := null;
    execute 'select count(*) from ${T} where ' || a[4] into in_scope;
    begin
      if a[1] = 'anon' then
        perform set_config('request.jwt.claims', '{"role":"anon"}', true);
      else
        perform set_config('request.jwt.claims', json_build_object('sub', a[3], 'role', 'authenticated')::text, true);
      end if;
      execute 'set local role ' || a[2];
      begin
        execute 'select count(*) from ${T}' into vis;
        execute 'select count(*) from ${T} where ' || a[4] into vis_scope;
      exception when others then e := 'S:' || sqlstate;
      end;
      ${pk ? `begin
        execute 'with u as (update ${T} set ${pk} = ${pk} returning 1) select count(*) from u' into upd;
      exception when others then e := coalesce(e || ' ', '') || 'U:' || sqlstate;
      end;
      begin
        execute 'with d as (delete from ${T} returning 1) select count(*) from d' into del;
      exception when others then e := coalesce(e || ' ', '') || 'D:' || sqlstate;
      end;` : ""}
      raise exception 'rollback_actor';
    exception when others then
      if sqlerrm <> 'rollback_actor' then e := coalesce(e || ' ', '') || 'X:' || sqlstate; end if;
    end;
    reset role;
    r := r || jsonb_build_object(a[1], jsonb_build_object('in_scope', in_scope, 'visible', vis, 'visible_in_scope', vis_scope, 'update', upd, 'delete', del, 'errors', e));
  end loop;
  raise exception 'DAT_RESULT %', r::text;
end $dat$;`;
  const out = await api(block);
  const parsed = extractResult(out.text);
  results.push({ table: t.table_name, sensitive: t.sensitive, pk, user_col: t.user_col, has_business: t.has_business, team_scope: scope, result: parsed || { error: out.text.slice(0, 300) } });
  console.log(t.table_name, parsed && !parsed.parse_error ? "ok" : `ERROR ${out.text.slice(0, 200)}`);
}
fs.writeFileSync(OUT, JSON.stringify({ project: REF, generated_at: new Date().toISOString(), tables: results }, null, 1));
console.log("wrote", OUT, "tables:", results.length);
