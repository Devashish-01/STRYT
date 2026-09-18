// Live test of the moderation chain on STAGING only. Refuses any other project.
//
//   1. secrets: puts TYPESAFE_API_KEY (from .env) into staging's function secrets — never printed.
//   2. direct:  calls the deployed function the way the trigger does (apikey = staging's secret key) for an abusive
//               post and an ordinary one; checks the database afterwards.
//   3. chain:   temporarily gives staging's vault the two secrets the trigger needs, turns the check on, inserts a
//               post, and waits for pg_net -> function -> TypeSafe -> hidden + filed. Then turns it all back off.
//   4. gate:    the function refuses a wrong key, and a non-admin session.
// Everything it creates is deleted at the end, including the vault secrets (staging had none before).
import fs from "fs";

const REF = "laswruzdyqehziyupmdm";
if (REF === "gnswxlfmcwyhmzlfipql") process.exit(2);
const stagingEnv = fs.readFileSync("D:/zetax/name/STRYT/.env.staging", "utf8");
if (!stagingEnv.includes(`STAGING_REF=${REF}`)) { console.error("REFUSED: not the staging ref"); process.exit(2); }
const env = fs.readFileSync("D:/zetax/name/STRYT/.env", "utf8");
const pat = env.match(/^SUPABASE_PERSONAL_ACCESS_TOKEN=(.*)$/m)[1].trim().replace(/^["']|["']$/g, "");
const tsKey = env.split(/\r?\n/).map((l) => l.match(/^\s*TYPESAFE_API_KEY\s*=\s*"?([^"]*)"?\s*$/)).find(Boolean)[1];
const anon = stagingEnv.match(/^VITE_SUPABASE_ANON_KEY=(.*)$/m)[1].trim();
const BASE = `https://${REF}.supabase.co`;
const FN = `${BASE}/functions/v1/moderation`;
const mgmt = (path, init = {}) =>
  fetch(`https://api.supabase.com/v1/projects/${REF}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
async function sql(query) {
  const r = await mgmt("/database/query", { method: "POST", body: JSON.stringify({ query }) });
  const text = await r.text();
  if (!r.ok) throw new Error(`SQL ${r.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The staging secret key, held in memory only.
const keys = await (await mgmt("/api-keys?reveal=true")).json();
const secret = (keys.find((k) => k.type === "secret" && k.name === "default") ?? keys.find((k) => k.type === "secret"))?.api_key;
if (!secret) { console.error("no staging secret key"); process.exit(1); }

const AUTHOR = "00000000-0000-4000-8000-000000000001";
const ids = { abusive: "mod_live_abusive", ordinary: "mod_live_ordinary", chain: "mod_live_chain" };

try {
  // 1. The function's TypeSafe key.
  const s = await mgmt("/secrets", { method: "POST", body: JSON.stringify([{ name: "TYPESAFE_API_KEY", value: tsKey }]) });
  check("TYPESAFE_API_KEY set on staging", s.ok, `HTTP ${s.status}`);

  // 2. Direct calls, the way the trigger calls.
  await sql(`insert into public.community_posts (id, author_user_id, author_name, type, title, body, comment_policy) values
    ('${ids.abusive}', '${AUTHOR}', 'Test Customer One', 'SHOUTOUT', 'Parking again', 'Abe saale kamine, teri aukaat kya hai. Chup reh chutiye.', 'EVERYONE'),
    ('${ids.ordinary}', '${AUTHOR}', 'Test Customer One', 'SHOUTOUT', 'Garba this Saturday', 'Society garba on Saturday at 7, everyone welcome with family!', 'EVERYONE')`);
  const call = (targetId, headers = { apikey: secret }) =>
    fetch(FN, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ action: "check_content", targetType: "POST", targetId }) });
  const r1 = await call(ids.abusive);
  const j1 = await r1.json();
  check("abusive post: function says hide", r1.ok && j1.verdict?.action === "hide", `${r1.status} ${j1.verdict?.action ?? j1.message}`);
  const r2 = await call(ids.ordinary);
  const j2 = await r2.json();
  check("ordinary post: function says pass", r2.ok && j2.verdict?.action === "pass", `${r2.status} ${j2.verdict?.action ?? j2.message}`);
  const [db] = await sql(`select
      (select hidden_reason from public.community_posts where id = '${ids.abusive}') abusive_hidden,
      (select hidden_at is null from public.community_posts where id = '${ids.ordinary}') ordinary_visible,
      (select count(*) from public.reports where target_id = '${ids.abusive}' and reason = 'AUTO_CHECK' and reporter_user_id is null and status = 'OPEN') abusive_filed,
      (select count(*) from public.reports where target_id = '${ids.ordinary}') ordinary_filed,
      (select details from public.reports where target_id = '${ids.abusive}' and reason = 'AUTO_CHECK' limit 1) summary`);
  check("abusive post hidden in the database", db.abusive_hidden === "AUTO_CHECK", db.abusive_hidden);
  check("abusive post filed for a moderator", Number(db.abusive_filed) === 1, db.summary);
  check("ordinary post untouched", db.ordinary_visible === true && Number(db.ordinary_filed) === 0);
  const r3 = await call(ids.abusive);
  const [again] = await sql(`select count(*) n from public.reports where target_id = '${ids.abusive}' and reason = 'AUTO_CHECK'`);
  check("checking again does not file a second report", r3.ok && Number(again.n) === 1);

  // 4. The gate.
  const bad = await call(ids.ordinary, { apikey: "sb_secret_wrong" });
  check("wrong key refused", bad.status === 401, `HTTP ${bad.status}`);
  const noauth = await fetch(FN, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "classify_report", reportId: "x" }) });
  check("no session refused", noauth.status === 401, `HTTP ${noauth.status}`);
  const anonCall = await fetch(FN, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${anon}` }, body: JSON.stringify({ action: "classify_report", reportId: "x" }) });
  check("anon key is not a session", anonCall.status === 401, `HTTP ${anonCall.status}`);

  // 3. The whole chain through pg_net.
  await sql(`
    select vault.create_secret('${BASE}/functions/v1', 'functions_url');
    select vault.create_secret('${secret}', 'service_role_key');
    update public.moderation_settings set content_check_enabled = true where id;`);
  await sql(`insert into public.community_posts (id, author_user_id, author_name, type, title, body, comment_policy) values
    ('${ids.chain}', '${AUTHOR}', 'Test Customer One', 'GIVEAWAY', 'You have won!', 'Your number won 25 lakh in the KBC lucky draw. Pay 2500 processing fee to lucky@ybl and send the OTP to claim.', 'EVERYONE')`);
  let chain;
  for (let i = 0; i < 20; i++) {
    await sleep(1500);
    [chain] = await sql(`select (select hidden_reason from public.community_posts where id = '${ids.chain}') hidden,
      (select count(*) from public.reports where target_id = '${ids.chain}' and reason = 'AUTO_CHECK') filed`);
    if (chain.hidden && Number(chain.filed) === 1) break;
  }
  check("chain: trigger -> pg_net -> function -> TypeSafe -> hidden and filed", chain.hidden === "AUTO_CHECK" && Number(chain.filed) === 1,
    `hidden=${chain.hidden} filed=${chain.filed}`);
} catch (e) {
  check("run", false, e.message);
} finally {
  // Back to how staging was: check off, no vault secrets, no test rows.
  await sql(`
    update public.moderation_settings set content_check_enabled = false where id;
    delete from vault.secrets where name in ('functions_url', 'service_role_key');
    delete from public.reports where target_id in ('${ids.abusive}', '${ids.ordinary}', '${ids.chain}');
    delete from public.community_posts where id in ('${ids.abusive}', '${ids.ordinary}', '${ids.chain}');`).catch((e) => console.error("CLEANUP FAILED:", e.message));
  const [left] = await sql(`select (select content_check_enabled from public.moderation_settings) check_on,
    (select count(*) from vault.secrets where name in ('functions_url','service_role_key')) vault,
    (select count(*) from public.community_posts where id like 'mod_live_%') posts,
    (select count(*) from public.reports where target_id like 'mod_live_%') reports`);
  check("cleanup: check off, vault empty, no test rows",
    left.check_on === false && Number(left.vault) === 0 && Number(left.posts) === 0 && Number(left.reports) === 0, JSON.stringify(left));
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exitCode = results.every(Boolean) ? 0 : 1;
}
