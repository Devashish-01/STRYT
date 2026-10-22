# Production data reset — keep the admin, remove every other user and all data

**Status:** PLAN + READY-TO-RUN FILES — nothing has been run against production. Written 2026-10-18. Decisions locked: keep ONLY the admin account (`b0f894ce…`) and reset it to a fresh profile; wipe everything else (D1–D2 answered). Staging rehearsal not yet run (the tool declined the destructive statements — run it yourself, see §9). Production = `gnswxlfmcwyhmzlfipql`, staging = `laswruzdyqehziyupmdm`.
**Why now:** the closed test has not started; this is the last moment a wipe costs nobody anything. Do it **before** inviting testers.

---

## 1. What exists today (read-only inventory, 2026-10-18)

| Area | Count | Verdict |
|---|---|---|
| `auth.users` | **97** (61 have no profile row — abandoned logins/tests) | delete all but admin |
| `public.users` (profiles) | **36** | delete all but admin |
| `auth.identities` / `auth.sessions` | 99 / 98 | cascade from `auth.users` |
| `client_errors` 358, `business_view_logs` 215, `notifications` 190, `provider_view_logs` 73 | logs / noise | wipe |
| `catalog_items` 64, `business_portfolio_items` 44, `portfolio_items` 30, `businesses` 21, `appointments` 23, `places` 22, `leads` 17, … (~60 more tables, 0–50 rows each) | user content | wipe |
| `categories` **56** | taxonomy the app needs (onboarding validates interests against it) | **KEEP** |
| `spatial_ref_sys` 8,500 | PostGIS system table | **KEEP** (never touch) |
| `moderation_settings` 1 | config | **KEEP** |
| `admin_actions` 2 | audit log of admin actions | **KEEP** (decision D3) |
| Storage `uploads` (public) **144** objects | user uploads | wipe via Storage API |
| Storage `verification-docs` | KYC documents (0 listed) | wipe (verify empty) |
| Storage `app-updates` (public) **89** objects | **OTA bundles + manifest** | **KEEP — deleting breaks over-the-air updates** |
| `pg_cron` jobs (3), edge functions (8), migrations, vault secrets | system | untouched |

**The admin:** exactly one profile has the `admin` role — `Devashish`, alias `dev`, id `b0f894ce-c34c-4ea4-8eae-b9f3425fec5e` (`zetax.business@gmail.com`; Google identity + a password for `/admin/login`).
Other privileged-looking accounts (candidates for deletion — see D1): `stryt_demo_1` (`devashish.ind@…`, business_owner/provider), `harshal` (`harshalpatel811@…`, business_owner), 4 empty "New user" test accounts.

**Why it is not a one-liner:** 40 foreign keys point at `public.users` with **NO ACTION** (businesses, appointments, requests, messages, ratings…), so `delete from users` fails until every referencing table is emptied first; 35 more cascade; 2 set null. Deleting only users would also leave orphaned storage files, because deleting rows from `storage.objects` does **not** remove the files.

---

## 2. Decisions needed from you (defaults in bold)

| ID | Question | Default |
|---|---|---|
| D1 | Keep **only** `b0f894ce…`? (`stryt_demo_1` / `harshal` are deleted.) | **Yes, only the admin** |
| D2 | Delete the admin's **own** content too (their businesses, bookings, posts, uploads) — "all data"? Or keep the admin's content? | **Wipe it; keep only the admin account + its settings** |
| D3 | Keep `admin_actions` (audit trail of staff actions)? | **Keep** |
| D4 | Also delete the users from **Firebase Authentication** (Console → Authentication → Users)? Supabase accounts are re-created on next sign-in either way. | **Yes, except the admin's Google user** — cleaner, no ghost accounts |
| D5 | Keep a backup copy inside the database for 30 days (PII — restricted schema), then drop it? | **Yes** |

---

## 3. Pre-requisites (must be true before anything else)

1. **Admin login works.** `/admin/login` uses email + password, so the Supabase **Email provider must be ON**. Live check on 2026-10-18 (later) showed it **OFF** (`email_provider_disabled`), the Twilio credentials still **real**, and the two auth hooks **not enabled**. Fix those first (the steps are in the chat / `PLAY_STORE_ACTION_ITEMS_2026-10-18.md` §1b) and confirm: admin logs in with password **and** with Google.
2. **Break-glass:** have the production **secret key** and database password available locally, so a mistake can be repaired without the app.
3. **Closed test not started** and no real customers on the app. (36 profiles today — confirm none is a real person you'd be deleting.)
4. **Rehearse on staging first** (§5). Do not run the production script until the staging run is clean.

---

## 4. Backup (before any delete)

1. **Supabase backups:** Dashboard → Database → Backups. If your plan has daily backups / PITR, note the latest restore point. (The free plan has none — then step 2 is your only safety net.)
2. **In-database copy** of every table that will change, in a restricted schema:
   ```sql
   create schema wipe_backup_20261018;
   revoke all on schema wipe_backup_20261018 from public, anon, authenticated;

   do $$
   declare t record;
   begin
     for t in select tablename from pg_tables
              where schemaname = 'public' and tablename <> 'spatial_ref_sys' loop
       execute format('create table wipe_backup_20261018.%I as table public.%I', t.tablename, t.tablename);
     end loop;
   end $$;

   create table wipe_backup_20261018._auth_users      as select * from auth.users;
   create table wipe_backup_20261018._auth_identities as select * from auth.identities;
   ```
   (This copies personal data — keep it service-role-only and **drop it after 30 days**, D5. Row counts of the copy must equal the source before continuing.)
3. **Storage backup:** download the `uploads` and `verification-docs` buckets to a local folder (Storage API with the secret key — a small Node script; I can write it). Do **not** back up `app-updates`; it is untouched.
4. Record the pre-wipe counts (the table in §1) in `supabase/APPLY_LOG.md`.

---

## 5. The wipe — database (one transaction, self-checking)

> Run first on **staging** (7 users) to surface FK/trigger surprises, then on production. Replace `ADMIN_ID` with the id kept.
> `TRUNCATE` is used for user-data tables because it is fast and does not fire row triggers (no notification storms, no push). It is *not* `CASCADE` — if a kept table references a truncated one, Postgres refuses and nothing changes, which is the safe failure.

```sql
begin;

-- 0. Safety rails -----------------------------------------------------------------------------------
do $$
begin
  if (select count(*) from auth.users where id::text = 'ADMIN_ID') <> 1 then
    raise exception 'ADMIN_ID not found in auth.users — aborting';
  end if;
  if not exists (select 1 from public.users where id = 'ADMIN_ID' and roles @> array['admin']) then
    raise exception 'ADMIN_ID is not an admin profile — aborting';
  end if;
end $$;

-- 1. Detach the kept profile from data about to disappear ---------------------------------------------
update public.users set society_id = null where id = 'ADMIN_ID';   -- (add any other FK column the rehearsal reveals)

-- 2. Truncate every user-data table. Kept: users (handled below), categories, spatial_ref_sys,
--    moderation_settings, admin_actions, and the two per-user config tables handled in step 3.
do $$
declare tbls text;
begin
  select string_agg(format('public.%I', tablename), ', ' order by tablename) into tbls
  from pg_tables
  where schemaname = 'public'
    and tablename not in ('users', 'categories', 'spatial_ref_sys', 'moderation_settings', 'admin_actions',
                          'terms_acceptances', 'customer_onboarding_state');
  execute 'truncate table ' || tbls || ' restart identity';
end $$;

-- 3. Per-user config: keep only the admin's rows ---------------------------------------------------
delete from public.terms_acceptances          where user_id <> 'ADMIN_ID';
delete from public.customer_onboarding_state  where user_id <> 'ADMIN_ID';

-- 4. Profiles, then auth accounts (cascades identities, sessions, refresh tokens, MFA) ------------------
delete from public.users where id <> 'ADMIN_ID';
delete from auth.users   where id::text <> 'ADMIN_ID';

-- 5. Assert the result; any mismatch rolls EVERYTHING back --------------------------------------------
do $$
declare bad text;
begin
  if (select count(*) from public.users) <> 1 then raise exception 'public.users should have 1 row'; end if;
  if (select count(*) from auth.users)   <> 1 then raise exception 'auth.users should have 1 row';   end if;
  if (select count(*) from public.categories) <> 56 then raise exception 'categories changed'; end if;
  select string_agg(tablename, ', ') into bad
  from pg_tables t
  where schemaname = 'public'
    and tablename not in ('users', 'categories', 'spatial_ref_sys', 'moderation_settings', 'admin_actions',
                          'terms_acceptances', 'customer_onboarding_state')
    and (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', tablename), false, true, '')))[1]::text::int > 0;
  if bad is not null then raise exception 'tables not empty: %', bad; end if;
end $$;

commit;    -- reached only if every assertion above passed
```

Things the rehearsal may reveal and how to handle them: a `delete` trigger on `users` (disable only that trigger inside the transaction, re-enable before commit); an FK from a kept table to a truncated one (null the column, as in step 1); a table added after this plan was written (the `tablename not in (…)` filter picks it up automatically, and the step-5 assertion proves it is empty).

---

## 6. The wipe — storage

Deleting rows in `storage.objects` leaves the files behind, so use the Storage API (secret key, run locally):

1. List recursively and `remove()` **every object** in buckets `uploads` and `verification-docs`.
2. **Never** touch `app-updates` (89 objects: OTA zips + manifest). Add an explicit allow-list check in the script.
3. Re-count: `select bucket_id, count(*) from storage.objects group by 1;` → `uploads` 0, `verification-docs` 0, `app-updates` 89.

---

## 7. After the wipe

1. **Firebase (D4):** Console → Authentication → Users → select all except the admin's Google user → Delete. (Otherwise old Firebase users linger; harmless but untidy.)
2. **Verify** (read-only): all counts from §1 are 0 except the kept set; `auth.users` = 1; storage counts as above; `get_advisors` security shows nothing new; cron jobs still present.
3. **Smoke test, on a real phone:**
   - Admin: `/admin/login` (password) and Google sign-in both work; admin panel loads with empty lists.
   - A **fresh Google signup** → profile row created → onboarding (name, username, phone, location, interests from the 56 categories) → Home.
   - A **fresh phone-OTP signup** → same.
   - Account deletion on a throwaway account still completes.
4. **Re-create the Play reviewer accounts** (`APP_ACCESS.md`: `review-customer`, `review-business`): they are wiped along with everything else. Sign each in once on a physical device, finish onboarding, and give the business account its verified demo business — **before** submitting to Play.
5. Record the result in `supabase/APPLY_LOG.md`; drop `wipe_backup_20261018` after 30 days (`drop schema wipe_backup_20261018 cascade;`).

---

## 8. Rollback

| Situation | Action |
|---|---|
| Assertion fails inside the transaction | Automatic: nothing was changed. Fix the cause, re-run. |
| Wiped by mistake after commit | Restore from `wipe_backup_20261018` (insert-select back, parents before children: `auth.users` → `auth.identities` → `public.users` → rest) **or** a Supabase backup/PITR if the plan has one. Storage: re-upload from the local backup (§4.3). |
| Admin locked out | Break-glass: secret key + `auth.admin.updateUserById` to reset the password; or sign in with Google. |

Time estimate: staging rehearsal 30 min, backup 15 min, production wipe < 5 min, storage 10 min, smoke tests + reviewer accounts 1–2 h.


---

## 9. Ready-to-run files (added after the decisions)

| File | What it does |
|---|---|
| `archive/docs/plans/data-reset/01_backup_in_database.sql` | Copies every table + `auth.users` / `auth.identities` into restricted schema `wipe_backup_20261018` and prints source vs backup row counts. |
| `archive/docs/plans/data-reset/02_wipe.sql` | The wipe + **fresh admin** reset + self-checking assertions. **Ends in `rollback;`** — running it unchanged is a rehearsal. Replace every `ADMIN_ID` and switch the last line to `commit;` for the real run. |
| `scripts/ops/wipe-storage.mjs` | Empties `uploads` and `verification-docs` through the Storage API. Dry-run by default; `--backup-dir` saves files first; hard-blocks `app-updates`; refuses if `--project-ref` does not match the URL. |

"Fresh admin" as implemented (my decision — change in step 5 of the SQL if you want otherwise): the admin keeps its **sign-in identity** (id, name, alias, email, phone, `admin_login_id`, Google identity, password, onboarding + terms accepted, so you can log in and are not pushed through onboarding) while **everything else** is reset to new-account defaults: avatar, location, ratings, privacy and notification settings, interests, PINs, business/provider passwords and recovery answers; roles become `customer` + `admin` (business/provider hats dropped); all of the admin's content, notifications and push tokens are gone with the rest.

### Run order
1. Fix the auth dashboard items (Email provider ON, hooks enabled) — admin must be able to log in.
2. **Staging rehearsal** (SQL Editor, staging project): run `01_...sql`, then `02_wipe.sql` with staging's admin id `00000000-0000-4000-8000-000000000007` (leave `rollback;`). Expect the final result row `1 / 1 / 1 / 56 / … / {customer,admin}`. If it errors, send me the message — it is exactly the FK/trigger surprise the rehearsal is for.
3. Storage dry run on staging: `node scripts/ops/wipe-storage.mjs --project-ref laswruzdyqehziyupmdm` (expect `uploads: 17`, `verification-docs: 1`).
4. **Production:** `01_...sql` → storage `--backup-dir ... ` dry-run, then `--confirm` → `02_wipe.sql` with `b0f894ce-c34c-4ea4-8eae-b9f3425fec5e` and `commit;`.
5. §7 (Firebase users, smoke tests, reviewer accounts, drop backup in 30 days).
