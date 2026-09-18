// Forced-rollback test for 20260990 on STAGING.
// Sends the migration and a probe block as ONE multi-statement query: Postgres runs that as one transaction, and the
// probe block ends by raising, so the migration, the throwaway users and every probe are rolled back together.
// Each probe runs as a real role (authenticated / anon) with real JWT claims, so row-level security is what's tested.
import fs from "fs";
const REF = "laswruzdyqehziyupmdm";
const pat = fs.readFileSync("D:/zetax/name/STRYT/.env", "utf8").match(/^SUPABASE_PERSONAL_ACCESS_TOKEN=(.*)$/m)[1].trim();
const live = process.argv.includes("--live"); // after the real apply: probes only, no migration text
const migration = live ? "" : fs.readFileSync("D:/zetax/name/STRYT/supabase/migrations/20260990_community_moderation.sql", "utf8");

// The seeded staging admin: a guard trigger refuses to grant `admin` outside the admin console, even here.
// Throwaway ids must be UUID-shaped: auth.uid() casts the JWT subject to uuid.
const A = "00000000-0000-4000-9000-0000000000a0", ADM = "00000000-0000-4000-8000-000000000007";
const R = [1, 2, 3, 4, 5, 6].map((i) => `00000000-0000-4000-9000-00000000000${i}`);

const as = (uid) => uid === "anon"
  ? `perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true); set local role anon;`
  : `perform set_config('request.jwt.claims', json_build_object('sub','${uid}','role','authenticated')::text, true); set local role authenticated;`;

// Run one statement as a user; record OK or the SQLSTATE and message.
const tryAs = (key, uid, stmt) => `
  begin
    ${as(uid)}
    ${stmt};
    reset role;
    res := res || '${key}=OK;';
  exception when others then
    reset role;
    res := res || '${key}=' || sqlstate || ':' || replace(sqlerrm, ';', ',') || ';';
  end;`;

// Count rows a user can see.
const seeAs = (key, uid, sql) => `
  ${as(uid)}
  select count(*) into n from (${sql}) q;
  reset role;
  res := res || '${key}=' || n || ';';`;

const report = (who, type, id) =>
  `insert into public.reports (target_type, target_id, target_name, reason, reporter_user_id) values ('${type}', '${id}', 'probe', 'SPAM', '${who}')`;

const probe = `
do $probe$
declare
  res text := '';
  n integer;
  q0 integer;
begin
  -- Throwaway people and content, created as the owner (bypasses RLS; rolled back at the end).
  insert into public.users (id, name) values ('${A}', 'Probe Author'), ${R.map((r) => `('${r}', 'Probe ${r}')`).join(", ")};
  insert into public.community_posts (id, author_user_id, author_name, type, title, body, comment_policy)
    values ('mt_p1', '${A}', 'Probe Author', 'SHOUTOUT', 'probe one', 'hello', 'EVERYONE'),
           ('mt_p2', '${A}', 'Probe Author', 'SHOUTOUT', 'probe two', 'hello', 'EVERYONE');
  insert into public.post_comments (id, post_id, author_user_id, author_name, body)
    values ('mt_c1', 'mt_p2', '${A}', 'Probe Author', 'a comment');

  -- 1. Identity: no reporting as someone else, no second open report, no anonymous insert.
  ${tryAs("spoof_report", R[0], report(R[1], "POST", "mt_p1"))}
  ${tryAs("own_report", R[0], report(R[0], "POST", "mt_p1"))}
  ${tryAs("duplicate_report", R[0], report(R[0], "POST", "mt_p1"))}
  ${tryAs("anon_report", "anon", report(R[5], "POST", "mt_p1"))}

  -- 2. Five different people hide it; four do not.
  ${tryAs("r2", R[1], report(R[1], "POST", "mt_p1"))}
  ${tryAs("r3", R[2], report(R[2], "POST", "mt_p1"))}
  ${tryAs("r4", R[3], report(R[3], "POST", "mt_p1"))}
  select count(*) into n from public.community_posts where id = 'mt_p1' and hidden_at is not null;
  res := res || 'hidden_after_4=' || n || ';';
  ${tryAs("r5", R[4], report(R[4], "POST", "mt_p1"))}
  select count(*) into n from public.community_posts where id = 'mt_p1' and hidden_at is not null and hidden_reason = 'REPORTS';
  res := res || 'hidden_after_5=' || n || ';';

  -- 3. Who can still see it.
  ${seeAs("see_other", R[5], "select 1 from public.community_posts where id = 'mt_p1'")}
  ${seeAs("see_reporter", R[0], "select 1 from public.community_posts where id = 'mt_p1'")}
  ${seeAs("see_author", A, "select 1 from public.community_posts where id = 'mt_p1'")}
  ${seeAs("see_admin", ADM, "select 1 from public.community_posts where id = 'mt_p1'")}
  ${seeAs("see_anon", "anon", "select 1 from public.community_posts where id = 'mt_p1'")}
  ${seeAs("feed_other", R[5], "select 1 from public.community_posts_feed(null, null, 5, 500, 0, null, 'recent', null) f where f.id = 'mt_p1'")}
  ${seeAs("feed_author", A, "select 1 from public.community_posts_feed(null, null, 5, 500, 0, null, 'recent', null) f where f.id = 'mt_p1'")}

  -- 4. The author can edit their post but cannot un-hide it, create a pre-hidden one, or post as someone else.
  ${tryAs("author_unhide", A, "update public.community_posts set hidden_at = null, hidden_reason = null where id = 'mt_p1'")}
  ${tryAs("author_edit_title", A, "update public.community_posts set title = 'probe one edited' where id = 'mt_p1'")}
  ${tryAs("author_insert_prehidden", A, "insert into public.community_posts (author_user_id, author_name, type, title, comment_policy, hidden_at) values ('" + A + "', 'x', 'SHOUTOUT', 'x', 'EVERYONE', now())")}
  ${tryAs("author_insert_as_other", A, "insert into public.community_posts (author_user_id, author_name, type, title, comment_policy) values ('" + R[0] + "', 'x', 'SHOUTOUT', 'x', 'EVERYONE')")}
  ${tryAs("author_insert_own", A, "insert into public.community_posts (author_user_id, author_name, type, title, comment_policy) values ('" + A + "', 'x', 'SHOUTOUT', 'probe own', 'EVERYONE')")}

  -- 5. Comments hide the same way.
  ${R.slice(0, 5).map((r, i) => tryAs(`c_r${i + 1}`, r, report(r, "COMMENT", "mt_c1"))).join("\n")}
  select count(*) into n from public.post_comments where id = 'mt_c1' and hidden_at is not null;
  res := res || 'comment_hidden=' || n || ';';
  ${seeAs("comment_see_other", R[5], "select 1 from public.post_comments where id = 'mt_c1'")}
  ${seeAs("comment_see_author", A, "select 1 from public.post_comments where id = 'mt_c1'")}
  ${tryAs("comment_author_unhide", A, "update public.post_comments set hidden_at = null where id = 'mt_c1'")}

  -- 6. The moderator's decisions; nobody else may make them.
  ${tryAs("nonadmin_restore", R[0], "perform public.admin_moderation_restore('POST', 'mt_p1')")}
  ${tryAs("nonadmin_remove", R[0], "perform public.admin_moderation_remove('COMMENT', 'mt_c1')")}
  ${tryAs("admin_restore", ADM, "perform public.admin_moderation_restore('POST', 'mt_p1')")}
  ${seeAs("see_other_after_restore", R[5], "select 1 from public.community_posts where id = 'mt_p1'")}
  select count(*) into n from public.reports where target_id = 'mt_p1' and status in ('OPEN', 'REVIEWING');
  res := res || 'open_reports_after_restore=' || n || ';';
  select count(*) into n from public.reports where target_id = 'mt_p1' and status = 'DISMISSED';
  res := res || 'dismissed_after_restore=' || n || ';';
  ${tryAs("report_again_after_restore", R[0], report(R[0], "POST", "mt_p1"))}
  ${tryAs("admin_remove_comment", ADM, "perform public.admin_moderation_remove('COMMENT', 'mt_c1')")}
  select count(*) into n from public.post_comments where id = 'mt_c1';
  res := res || 'comment_rows_after_remove=' || n || ';';
  select count(*) into n from public.reports where target_id = 'mt_c1' and status = 'ACTION_TAKEN';
  res := res || 'actioned_after_remove=' || n || ';';
  ${tryAs("admin_unsupported", ADM, "perform public.admin_moderation_restore('BUSINESS', 'x')")}

  -- 7. Settings are admin-only.
  ${seeAs("settings_nonadmin", R[0], "select 1 from public.moderation_settings")}
  ${seeAs("settings_admin", ADM, "select 1 from public.moderation_settings")}
  ${tryAs("settings_nonadmin_update", R[0], "update public.moderation_settings set content_check_enabled = true")}
  select count(*) into n from public.moderation_settings where content_check_enabled;
  res := res || 'settings_enabled_after_nonadmin_update=' || n || ';';

  -- 8. The automatic check: nothing queued while off; one call per new post/comment or edit of its text when on;
  --    none for a moderation change.
  select count(*) into q0 from net.http_request_queue;
  insert into public.community_posts (id, author_user_id, author_name, type, title, comment_policy)
    values ('mt_p3', '${A}', 'Probe Author', 'SHOUTOUT', 'while off', 'EVERYONE');
  select count(*) - q0 into n from net.http_request_queue;
  res := res || 'queued_while_off=' || n || ';';

  update public.moderation_settings set content_check_enabled = true where id;
  -- Staging has no push secrets in its vault (so its push trigger never fires either). Create stand-ins inside this
  -- transaction; they roll back with everything else, and pg_net never sends a request that was not committed.
  if not exists (select 1 from vault.secrets where name = 'functions_url') then
    perform vault.create_secret('https://probe.invalid/functions/v1', 'functions_url');
  end if;
  if not exists (select 1 from vault.secrets where name = 'service_role_key') then
    perform vault.create_secret('probe-secret-key', 'service_role_key');
  end if;
  select count(*) into n from vault.decrypted_secrets where name in ('functions_url', 'service_role_key') and coalesce(decrypted_secret, '') <> '';
  res := res || 'vault_secrets_present=' || n || ';';
  select count(*) into q0 from net.http_request_queue;
  ${tryAs("insert_post_when_on", A, "insert into public.community_posts (id, author_user_id, author_name, type, title, comment_policy) values ('mt_p4', '" + A + "', 'x', 'SHOUTOUT', 'while on', 'EVERYONE')")}
  ${tryAs("insert_comment_when_on", A, "insert into public.post_comments (id, post_id, author_user_id, author_name, body) values ('mt_c2', 'mt_p4', '" + A + "', 'x', 'hi')")}
  ${tryAs("edit_body_when_on", A, "update public.community_posts set body = 'edited' where id = 'mt_p4'")}
  ${tryAs("resolve_when_on", A, "update public.community_posts set resolved = true where id = 'mt_p4'")}
  select count(*) - q0 into n from net.http_request_queue;
  res := res || 'queued_while_on=' || n || ';';
  select count(*) into n from net.http_request_queue
    where url like '%/moderation' and convert_from(body, 'UTF8') like '%check_content%' and convert_from(body, 'UTF8') like '%mt_p4%';
  res := res || 'queued_for_p4=' || n || ';';
  select count(*) into n from net.http_request_queue
    where url like '%/moderation' and convert_from(body, 'UTF8') like '%mt_c2%' and convert_from(body, 'UTF8') like '%COMMENT%';
  res := res || 'queued_for_c2=' || n || ';';
  -- The key travels on apikey, never Authorization (a secret key is not a JWT; see 20260883).
  select count(*) into n from net.http_request_queue
    where url like '%/moderation' and headers ? 'apikey' and not headers ? 'Authorization';
  res := res || 'queued_with_apikey_only=' || n || ';';
  select count(*) - q0 into n from net.http_request_queue;
  ${tryAs("admin_restore_when_on", ADM, "perform public.admin_moderation_restore('POST', 'mt_p4')")}
  select count(*) - q0 - n into n from net.http_request_queue;
  res := res || 'queued_by_moderation_change=' || n || ';';

  -- 9. The threshold is a setting.
  update public.moderation_settings set report_hide_threshold = 2, content_check_enabled = false where id;
  insert into public.community_posts (id, author_user_id, author_name, type, title, comment_policy)
    values ('mt_p5', '${A}', 'Probe Author', 'SHOUTOUT', 'threshold', 'EVERYONE');
  ${tryAs("t_r1", R[0], report(R[0], "POST", "mt_p5"))}
  ${tryAs("t_r2", R[1], report(R[1], "POST", "mt_p5"))}
  select count(*) into n from public.community_posts where id = 'mt_p5' and hidden_at is not null;
  res := res || 'hidden_at_threshold_2=' || n || ';';

  raise exception 'PROBE_RESULTS:%', res;
end
$probe$;
`;

const query = migration + "\n" + probe;
const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
});
const text = await r.text();
let message = text;
try { message = JSON.parse(text).message ?? text; } catch { /* not JSON */ }
const m = message.match(/PROBE_RESULTS:([\s\S]*?)(?:\nCONTEXT|$)/);
if (!m) {
  console.error("No probe results. HTTP", r.status, text.slice(0, 1500));
  process.exitCode = 1;
} else {
const got = Object.fromEntries(m[1].split(";").filter(Boolean).map((kv) => { const i = kv.indexOf("="); return [kv.slice(0, i), kv.slice(i + 1)]; }));

const expect = {
  spoof_report: /^42501/, own_report: "OK", duplicate_report: /^23505/, anon_report: /^42501/,
  r2: "OK", r3: "OK", r4: "OK", hidden_after_4: "0", r5: "OK", hidden_after_5: "1",
  see_other: "0", see_reporter: "0", see_author: "1", see_admin: "1", see_anon: "0", feed_other: "0", feed_author: "1",
  author_unhide: /MODERATION_FIELDS_READ_ONLY/, author_edit_title: "OK", author_insert_prehidden: /MODERATION_FIELDS_READ_ONLY/,
  author_insert_as_other: /^42501/, author_insert_own: "OK",
  c_r1: "OK", c_r2: "OK", c_r3: "OK", c_r4: "OK", c_r5: "OK", comment_hidden: "1",
  comment_see_other: "0", comment_see_author: "1", comment_author_unhide: /MODERATION_FIELDS_READ_ONLY/,
  nonadmin_restore: /NOT_ALLOWED/, nonadmin_remove: /NOT_ALLOWED/, admin_restore: "OK",
  see_other_after_restore: "1", open_reports_after_restore: "0", dismissed_after_restore: "5",
  report_again_after_restore: "OK", admin_remove_comment: "OK", comment_rows_after_remove: "0", actioned_after_remove: "5",
  admin_unsupported: /UNSUPPORTED_TARGET/,
  settings_nonadmin: "0", settings_admin: "1", settings_nonadmin_update: "OK", settings_enabled_after_nonadmin_update: "0",
  queued_while_off: "0", vault_secrets_present: "2",
  insert_post_when_on: "OK", insert_comment_when_on: "OK", edit_body_when_on: "OK", resolve_when_on: "OK",
  queued_while_on: "3", queued_for_p4: "2", queued_for_c2: "1", queued_with_apikey_only: "3", admin_restore_when_on: "OK", queued_by_moderation_change: "0",
  t_r1: "OK", t_r2: "OK", hidden_at_threshold_2: "1",
};
let fail = 0;
for (const [k, want] of Object.entries(expect)) {
  const v = got[k];
  const ok = want instanceof RegExp ? want.test(v ?? "") : v === want;
  if (!ok) fail++;
  console.log(`${ok ? "ok  " : "FAIL"} ${k.padEnd(40)} ${v}${ok ? "" : `   (want ${want})`}`);
}
const extra = Object.keys(got).filter((k) => !(k in expect));
if (extra.length) console.log("unchecked:", extra.map((k) => `${k}=${got[k]}`).join(" "));
console.log(`\n${Object.keys(expect).length - fail}/${Object.keys(expect).length} passed${live ? " (live)" : " (forced rollback)"}`);
process.exitCode = fail ? 1 : 0;
}
