# Database Migration — Tokyo → Mumbai

**Decision:** approved.
**From:** `gnswxlfmcwyhmzlfipql` · `ap-northeast-1` (Tokyo) · Postgres 17.6
**To:** new project · `ap-south-1` (Mumbai) · **must be Postgres 17**
**Cost:** $0/month (free tier, confirmed via the org's billing)
**Expected downtime:** 30–60 minutes at current data size

## Why

Your users are in Pune and Bangalore. The database is in Tokyo. That's
**~120–180 ms of round trip on every request** — every map search, every
booking, every message. Mumbai is ~10–30 ms.

At 14 users this is a weekend job. At 50,000 it's an incident with a comms plan.
**Do it before launch.**

---

## Before you start

- [ ] Pick a window when nobody is using the app (you have 14 users — this is easy now)
- [ ] Supabase CLI installed and logged in: `supabase --version`, `supabase login`
- [ ] Both projects' DB passwords to hand (Dashboard → Settings → Database)
- [ ] Vercel access, to change env vars
- [ ] Google Cloud Console access, for the OAuth redirect URLs
- [ ] Android signing set up, since a new APK/AAB is needed

> **The one step that can lose everything: `auth.users`.** Password hashes and
> identity rows must arrive intact or every user is locked out and cannot
> recover. Do step 4 exactly, verify it, and don't skip the count check.

---

## Step 1 — Create the Mumbai project

Dashboard → New project.

- Region **`ap-south-1` (Mumbai)**
- Postgres **17** — must match the source; a version mismatch breaks the restore
- Name: `stryt-mumbai` (or reuse `Name` for consistency)
- Save the DB password immediately; it is shown once

Note the new project ref (looks like `abcdefgh…`). Referred to below as `$NEW`.
The old one is `$OLD = gnswxlfmcwyhmzlfipql`.

---

## Step 2 — Freeze writes

Put the app in maintenance. The cheapest version: in Vercel, set an env var the
app reads to show a "back in an hour" screen, and redeploy. Or simply do this
at 3am when nobody is on.

**Do not skip this.** Anything written to Tokyo after the dump is silently lost.

---

## Step 3 — Dump the old project

```bash
# Roles first (needed before anything that references them)
supabase db dump --db-url "postgresql://postgres:[OLD_PW]@db.gnswxlfmcwyhmzlfipql.supabase.co:5432/postgres" \
  --role-only -f roles.sql

# Schema
supabase db dump --db-url "postgresql://postgres:[OLD_PW]@db.gnswxlfmcwyhmzlfipql.supabase.co:5432/postgres" \
  -f schema.sql

# Data
supabase db dump --db-url "postgresql://postgres:[OLD_PW]@db.gnswxlfmcwyhmzlfipql.supabase.co:5432/postgres" \
  --data-only -f data.sql
```

Check all three are non-empty before continuing:
```bash
wc -l roles.sql schema.sql data.sql
```

---

## Step 4 — `auth.users` (the critical one)

`supabase db dump` covers the `public` schema. **Auth is separate**, and it is
what decides whether your users can still log in.

```bash
pg_dump "postgresql://postgres:[OLD_PW]@db.gnswxlfmcwyhmzlfipql.supabase.co:5432/postgres" \
  --data-only --schema=auth \
  --table=auth.users --table=auth.identities --table=auth.sessions \
  -f auth.sql
```

`auth.users.encrypted_password` and the `auth.identities` rows must both come
across. Passwords are bcrypt hashes — they migrate fine **as long as you copy
the column rather than resetting it**.

> If this step looks wrong in any way, **stop and check Supabase's current
> documented procedure or open a support ticket** before proceeding. It is the
> one part of this migration that is not safely reversible by re-running, and
> Supabase changes their recommended path from time to time. A failed restore
> here means every account is locked out with no self-service recovery.

---

## Step 5 — Restore into Mumbai

Order matters.

```bash
NEW="postgresql://postgres:[NEW_PW]@db.$NEW.supabase.co:5432/postgres"

psql "$NEW" -f roles.sql
psql "$NEW" -f schema.sql
psql "$NEW" -f auth.sql     # auth BEFORE public data — public.users FKs nothing,
                            # but triggers on auth.users must not fire mid-restore
psql "$NEW" -f data.sql
```

If `data.sql` errors on the `handle_new_auth_user` trigger firing during the
auth restore, disable it for the restore and re-enable after:
```sql
alter table auth.users disable trigger on_auth_user_created;
-- …restore…
alter table auth.users enable trigger on_auth_user_created;
```

---

## Step 6 — Everything that isn't in the dump

These are silent failures if missed — nothing errors, features just stop.

| Item | How |
|------|-----|
| **Storage buckets + objects** | Not in `pg_dump`. Recreate buckets, then copy objects (Supabase CLI or the Storage API). Business photos, avatars, verification docs all live here. |
| **Edge functions (9)** | `supabase functions deploy <name> --project-ref $NEW` for each: `send-push`, `create-razorpay-order`, `verify-razorpay-payment`, `ai-assist`, `send-support-email`, `profile-control`, `admin-delete-profile`, `app-update`, `verification-review` |
| **Vault secrets** | Recreate `functions_url` (pointing at the **new** project) and `service_role_key` (the **new** key). Push notifications silently no-op without these. |
| **Cron jobs** | Re-create any `pg_cron` schedules |
| **`pg_net` / extensions** | Confirm `pg_net`, `postgis`, `pg_stat_statements` are enabled |

---

## Step 7 — Verify before cutting over

Run against the **new** project. Compare to the same query on the old one.

```sql
select
  (select count(*) from auth.users)                as auth_users,
  (select count(*) from public.users)              as users,
  (select count(*) from public.businesses)         as businesses,
  (select count(*) from public.appointments)       as appointments,
  (select count(*) from public.catalog_items)      as catalog,
  (select count(*) from public.appointment_deliveries) as deliveries,
  (select count(*) from pg_policies where schemaname='public') as policies,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.prosecdef)     as security_definer_fns;
```

Expected today: 14 users, 4 businesses, 9 appointments, 185 policies.

Also confirm the performance work survived:
```sql
select
  (select count(*) from pg_policies where schemaname='public'
     and (coalesce(qual,'') ~ '(?<!SELECT )auth\.(uid|role|jwt)\(\)'
       or coalesce(with_check,'') ~ '(?<!SELECT )auth\.(uid|role|jwt)\(\)')) as unwrapped_auth_should_be_0;
```

**Then log in as a real user on the new project before touching production
env vars.** If auth didn't migrate, you find out here, not from your users.

---

## Step 8 — Cut over

The anon key and URL both change.

| Where | What |
|-------|------|
| Vercel | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` → redeploy |
| Android build | Same two, then build a new AAB |
| `capacitor.config.ts` | `CapacitorUpdater.updateUrl` → new project's `app-update` function |
| Google Cloud Console | OAuth redirect URLs → new project's callback. **Sign-in breaks without this.** |
| `vercel.json` CSP | `connect-src` allows `https://*.supabase.co`, so the wildcard covers it — no change needed |
| `.env` / `.env.local` | Local dev |

---

## Step 9 — After

- [ ] Lift maintenance mode
- [ ] Sign in as a real user, book something, send a message, check push arrives
- [ ] Watch for errors for an hour
- [ ] **Keep the Tokyo project running, read-only, for a week** — it is your rollback
- [ ] After a week with no issues, pause or delete it

---

## Rollback

Before cutover: nothing to roll back — just don't switch the env vars.

After cutover: point the env vars back at Tokyo and redeploy. Anything written
to Mumbai in the meantime is lost, which is why the read-only week matters and
why you should verify in step 7 rather than after.

---

## What I can and can't do here

**I can:** apply schema, run and verify any SQL on either project, check counts
and policies, and prepare scripts.

**I can't:** move data between two Supabase projects. MCP executes SQL against
one project; it can't pipe a dump from one to another. Steps 3–6 need the
Supabase CLI on your machine, with your database passwords — which I don't have
and shouldn't.

**Practical split:** you run steps 1–6, and I verify step 7 against both
projects and confirm the numbers match before you cut over.

> Deliberately not created the Mumbai project yet: free-tier projects **pause
> after ~7 days of inactivity**, so standing it up before you have a window just
> means a paused, half-configured project to debug later. Step 1 belongs inside
> the migration window.
