// P06: seed STAGING with synthetic data only. Idempotent with --reset.
//
// Hard guard: the target must equal the staging ref in docs/plan/DECISIONS.md (D6) and must not be
// production. The check runs before any network call.
//
// What it writes (staging):
//   - categories copied from production (reference data: ids, names, kinds — no personal data)
//   - auth users + public.users rows for the personas in personas.mjs (phone sign-in via test OTP)
//   - one business (owner1) with catalog, all-day hours, open queue; two scoped team sessions
//   - one provider (provider1) with two packages; admin1 gets the admin role
// --reset first truncates every staging table in `public` and `private` and deletes all staging auth users.
//
// Usage:
//   node scripts/staging/seed-staging.mjs [--reset]
//   node scripts/staging/seed-staging.mjs --target <ref> --dry-run     (guard check only; sends nothing)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PERSONAS, BUSINESS, PROVIDER, STAGING_AREA } from "./personas.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PROD = "gnswxlfmcwyhmzlfipql";
const args = process.argv.slice(2);
const decisions = fs.readFileSync(path.join(ROOT, "docs", "plan", "DECISIONS.md"), "utf8");
const STAGING = decisions.match(/\*\*D6\*\*[^\n]*ref:\s*([a-z0-9]{20})/)?.[1];
const TARGET = args.includes("--target") ? args[args.indexOf("--target") + 1] : STAGING;

if (TARGET === PROD) { console.error(`REFUSED: ${TARGET} is PRODUCTION. Seeding never touches production. Nothing was sent.`); process.exit(2); }
if (!STAGING || TARGET !== STAGING) { console.error(`REFUSED: ${TARGET} is not the staging ref in DECISIONS.md D6 (${STAGING ?? "none"}). Nothing was sent.`); process.exit(2); }
if (args.includes("--dry-run")) { console.log(`guard ok: ${TARGET} is staging; --dry-run, nothing sent`); process.exit(0); }

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
async function sql(ref, query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SUPABASE_PERSONAL_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`[${ref}] HTTP ${r.status}: ${t.slice(0, 500)}`);
  return JSON.parse(t);
}
const lit = (s) => (s === null || s === undefined ? "null" : `'${String(s).replace(/'/g, "''")}'`);
const arr = (a) => `array[${a.map(lit).join(",")}]::text[]`;
const persona = (k) => PERSONAS.find((p) => p.key === k);

console.log("target:", TARGET, "(staging)");
const categories = await sql(PROD, "select to_jsonb(c) row from public.categories c order by id");
console.log(`categories read from production (read-only): ${categories.length}`);

const ALL_DAY = JSON.stringify({
  v: 2, mode: "weekly", slotDurationMin: 30,
  days: Object.fromEntries(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => [d, { open: true, ranges: [{ from: "00:00", to: "23:59" }] }])),
});

const reset = args.includes("--reset") ? `
  for r in select schemaname, tablename from pg_tables where schemaname in ('public','private') and tablename <> 'spatial_ref_sys' loop
    execute format('truncate table %I.%I restart identity cascade', r.schemaname, r.tablename);
  end loop;
  delete from auth.identities;
  delete from auth.users;` : "";

const users = PERSONAS.map((p) => `
  insert into auth.users (instance_id, id, aud, role, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, phone_change,
    phone_change_token, email_change_token_current, reauthentication_token, is_sso_user, is_anonymous)
  values ('00000000-0000-0000-0000-000000000000', '${p.id}', 'authenticated', 'authenticated', '${p.phone.replace("+", "")}', now(),
    '{"provider":"phone","providers":["phone"]}', '{}', now(), now(), '', '', '', '', '', '', '', '', false, false)
  on conflict (id) do nothing;
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values ('${p.id}', '${p.id}', '${p.id}', 'phone', jsonb_build_object('sub', '${p.id}', 'phone', '${p.phone.replace("+", "")}'), now(), now(), now())
  on conflict do nothing;
  insert into public.users (id, name, roles) values ('${p.id}', ${lit(p.name)}, ${arr(p.roles)}) on conflict (id) do nothing;
  update public.users set name = ${lit(p.name)}, alias = ${lit(p.alias)}, roles = ${arr(p.roles)}, phone = ${lit(p.phone)},
    area = ${lit(STAGING_AREA.area)}, city = ${lit(STAGING_AREA.city)}, lat = ${STAGING_AREA.lat}, lng = ${STAGING_AREA.lng},
    onboarding_completed_at = now(), terms_accepted_version = '2026-08-26', terms_accepted_at = now(), customer_enabled = true
   where id = '${p.id}';`).join("\n");

const owner = persona(BUSINESS.ownerKey);
const prov = persona(PROVIDER.userKey);
const seed = `
do $seed$
declare r record; v_service text; v_service_name text;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  ${reset}
  insert into public.categories select * from jsonb_populate_recordset(null::public.categories, ${lit(JSON.stringify(categories.map((c) => c.row)))}::jsonb)
    on conflict do nothing;
  ${users}

  insert into public.businesses (id, owner_user_id, name, slug, category_id, category_name, description, address_line1, city, pincode,
    lat, lng, phone, hours, is_open_now, status, bookings_enabled, default_slot_capacity, created_at)
  values (${lit(BUSINESS.id)}, '${owner.id}', ${lit(BUSINESS.name)}, 'test-salon-one', 'c-beauty-salon', 'Unisex Salon',
    'Synthetic staging business — not real.', '1 Test Street', ${lit(STAGING_AREA.city)}, '411001',
    ${STAGING_AREA.lat}, ${STAGING_AREA.lng}, ${lit(owner.phone)}, ${lit(ALL_DAY)}, true, 'ACTIVE', true, 2, now())
  on conflict (id) do nothing;
  insert into public.catalog_items (id, business_id, name, description, price, stock_status, sort_order, inventory_type, max_party_size) values
    ('ci_test_1', ${lit(BUSINESS.id)}, 'Test Haircut', 'Synthetic item', 300, 'IN_STOCK', 1, 'INFINITE', 4),
    ('ci_test_2', ${lit(BUSINESS.id)}, 'Test Beard Trim', 'Synthetic item', 150, 'IN_STOCK', 2, 'INFINITE', 2),
    ('ci_test_3', ${lit(BUSINESS.id)}, 'Test Hair Spa', 'Synthetic item', 800, 'IN_STOCK', 3, 'INFINITE', 1)
  on conflict (id) do nothing;
  insert into public.queue_settings (business_id, is_open, avg_service_min, last_activity_at) values (${lit(BUSINESS.id)}, true, 10, now())
    on conflict (business_id) do update set is_open = true, last_activity_at = now();
  insert into public.business_access_sessions (business_id, grantee_user_id, status, decided_at, access_level, scopes)
  select ${lit(BUSINESS.id)}, g, 'ACTIVE', now(), 'SCOPED', s
    from (values ('${persona("staff_queue").id}', array['queue']), ('${persona("staff_appointments").id}', array['appointments'])) v(g, s)
   where not exists (select 1 from public.business_access_sessions x where x.business_id = ${lit(BUSINESS.id)} and x.grantee_user_id = v.g);

  -- A real speciality, as onboarding stores it (requests carry the top-level group c-home; E2E-019).
  select id, name into v_service, v_service_name from public.categories where id = 'c-home-plumb';
  insert into public.providers (id, user_id, display_name, category_id, category_name, bio, lat, lng, service_radius_km, starting_price,
    status, phone, bookings_enabled, is_open_now, created_at)
  values (${lit(PROVIDER.id)}, '${prov.id}', ${lit(PROVIDER.name)}, v_service, v_service_name, 'Synthetic staging provider — not real.',
    ${STAGING_AREA.lat}, ${STAGING_AREA.lng}, 10, 300, 'ACTIVE', ${lit(prov.phone)}, true, true, now())
  on conflict (id) do nothing;
  insert into public.provider_packages (id, provider_id, name, description, price, duration, instant_book) values
    ('pp_test_1', ${lit(PROVIDER.id)}, 'Test Basic Visit', 'Synthetic package', 300, '1 hour', true),
    ('pp_test_2', ${lit(PROVIDER.id)}, 'Test Full Service', 'Synthetic package', 900, '3 hours', false)
  on conflict (id) do nothing;
end $seed$;`;

await sql(TARGET, seed);
const counts = await sql(TARGET, `select
  (select count(*) from auth.users) auth_users, (select count(*) from public.users) users, (select count(*) from public.categories) categories,
  (select count(*) from public.businesses) businesses, (select count(*) from public.catalog_items) catalog_items,
  (select count(*) from public.queue_settings) queue_settings, (select count(*) from public.business_access_sessions) team_sessions,
  (select count(*) from public.providers) providers, (select count(*) from public.provider_packages) provider_packages,
  (select count(*) from public.users where 'admin' = any(roles)) admins`);
console.log("staging counts:", JSON.stringify(counts[0]));
