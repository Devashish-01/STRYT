# Plan — Change Server Location (Tokyo → Mumbai)

**Status:** planned (not started)  
**Decision:** approved  
**Risk:** High (auth, storage, OTA, payments, push)  
**Expected downtime:** 30–60 minutes  
**Cost:** $0/month (free tier)  
**Detailed runbook:** [`../engineering/MUMBAI_MIGRATION.md`](../engineering/MUMBAI_MIGRATION.md)

---

## Goal

Move the STRYT Supabase backend from **Tokyo** to **Mumbai** so latency for
Pune / Bangalore users drops from ~120–180 ms to ~10–30 ms per request.

| | Current (live) | Target |
|--|----------------|--------|
| Project | `gnswxlfmcwyhmzlfipql` (`Name`) | new project (`$NEW`) |
| Region | `ap-northeast-1` (Tokyo) | `ap-south-1` (Mumbai) |
| Postgres | 17.6 | **17.x** (must match major) |
| Status | `ACTIVE_HEALTHY` (verified 2026-08-12) | create inside the migration window |

> Do **not** create the Mumbai project days early — free-tier projects pause
> after ~7 days of inactivity.

---

## Why now

- Users are in India; DB is in Japan.
- Small user base → weekend job. At scale this becomes a staged incident.
- Do it **before** Play Store / heavy launch traffic.

---

## Current state (verified)

Hardcoded Tokyo project refs that **must** change at cutover:

| File | What points at Tokyo |
|------|----------------------|
| `supabase/config.toml` | `project_id = "gnswxlfmcwyhmzlfipql"` |
| `capacitor.config.ts` | OTA `updateUrl` → `…/functions/v1/app-update` |
| `vercel.json` | `/stryt.apk` redirect → Storage `uploads/stryt.apk` |
| `src/lib/apkDownload.ts` | APK download URL |
| `scripts/publish-ota-update.mjs` | `SUPABASE_URL` |
| `scripts/rollback-ota-update.mjs` | `SUPABASE_URL` |
| Vercel + GitHub Actions secrets | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `.env` / `.env.local` | local dev keys |

Edge functions to redeploy on `$NEW` (repo has 8 with `index.ts`):

`app-update`, `send-push`, `send-support-email`, `ai-assist`, `profile-control`,
`admin-delete-profile`, `verification-review`, `purge-deleted-accounts`

Also re-check dashboard for any extras (e.g. Razorpay helpers) not in this list.

---

## Prerequisites

- [ ] Maintenance window booked (low / zero traffic)
- [ ] Supabase CLI installed + logged in (`supabase login`)
- [ ] Old + new DB passwords ready
- [ ] Vercel project access (env + redeploy)
- [ ] GitHub repo secrets access (Android + OTA workflows)
- [ ] Google Cloud Console access (OAuth redirect URLs for Firebase / Google sign-in)
- [ ] Android release path ready (new AAB/APK after env change)
- [ ] Backup / dump directory on a machine that can reach both DBs

---

## Phase 0 — Prep (before window)

- [ ] Read full runbook: `docs/engineering/MUMBAI_MIGRATION.md`
- [ ] Confirm Postgres major on source is still **17**
- [ ] Draft maintenance message / flag for the app (or schedule 3am IST)
- [ ] List all Storage buckets used in prod (avatars, business photos, OTA, APK, etc.)
- [ ] List Vault / Edge Function secrets to recreate (`SMTP_PASS`, `VAPID_PRIVATE_KEY`, `FIREBASE_SERVICE_ACCOUNT`, Razorpay keys if any, `functions_url`, service role)
- [ ] Confirm Google OAuth authorized redirect URIs for current project (to mirror for `$NEW`)

---

## Phase 1 — Create Mumbai project (start of window)

- [ ] Dashboard → New project
  - Region: **`ap-south-1` (Mumbai)**
  - Postgres: **17**
  - Save DB password once
- [ ] Record `$NEW` project ref
- [ ] Enable required extensions: `postgis`, `pg_net`, `pg_cron`, `pg_stat_statements` (as used today)

---

## Phase 2 — Freeze writes

- [ ] Put app in maintenance (env flag + Vercel redeploy) **or** confirm zero traffic
- [ ] Stop accepting new sign-ups / writes on Tokyo

**Do not skip.** Writes after the dump are lost forever.

---

## Phase 3 — Dump Tokyo

Commands live in the runbook. Produce and keep:

- [ ] `roles.sql`
- [ ] `schema.sql`
- [ ] `data.sql` (public)
- [ ] `auth.sql` (`auth.users`, `auth.identities`, `auth.sessions`)

- [ ] Confirm all files non-empty (`wc -l` / size check)

> **Critical:** `auth.users` + identities must migrate intact or every user is
> locked out with no self-service recovery.

---

## Phase 4 — Restore Mumbai

Order (strict):

1. roles  
2. schema  
3. auth  
4. public data  

- [ ] Restore completes without fatal errors
- [ ] If `handle_new_auth_user` fires mid-restore: disable trigger → restore → re-enable (see runbook)

---

## Phase 5 — Non-SQL assets

- [ ] Recreate Storage buckets + copy all objects
- [ ] Deploy every Edge Function to `$NEW` (`supabase functions deploy … --project-ref $NEW`)
- [ ] Set Edge Function secrets on `$NEW`
- [ ] Recreate Vault secrets (`functions_url` → **new** URL, service role → **new** key)
- [ ] Recreate `pg_cron` jobs (incl. purge-deleted-accounts path / GitHub secret if used)
- [ ] Link local CLI: update `supabase/config.toml` `project_id` → `$NEW` (at cutover commit)

---

## Phase 6 — Verify (before any client points at Mumbai)

Run count checks on **both** projects (see runbook SQL). Agree on:

- [ ] `auth.users` count match
- [ ] `public.users` / businesses / appointments / catalog / policies match
- [ ] RLS policies + security definer fn counts look sane
- [ ] **Manual login** as a real user against Mumbai (temporary env / local `.env`) succeeds
- [ ] Spot-check: book, chat/message, storage image load, push (if testable)

**Stop here if auth or counts disagree.** Do not cut over.

---

## Phase 7 — Cut over (clients)

| Where | Action |
|-------|--------|
| Vercel env | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` → redeploy |
| GitHub Actions secrets | same two (+ any service-role secrets for cron/OTA) |
| Code hardcoded URLs | `capacitor.config.ts`, `vercel.json`, `apkDownload.ts`, OTA scripts |
| `supabase/config.toml` | `project_id = "$NEW"` |
| Google Cloud / Firebase | OAuth redirect → new Supabase callback |
| Local `.env` / `.env.local` | update for all developers |
| Android | build + ship new APK/AAB (OTA `updateUrl` is baked into native config) |

- [ ] Commit + push URL / project_id updates
- [ ] Vercel redeploy confirmed on https://stryt.in
- [ ] OTA pipeline publishes against **new** Storage
- [ ] APK redirect + download URLs serve from **new** Storage

---

## Phase 8 — Stabilize

- [ ] Lift maintenance mode
- [ ] Smoke: sign-in, map, booking, message, push, APK download, OTA check
- [ ] Watch logs / errors for ~1 hour
- [ ] Keep Tokyo project **alive, read-only** for **7 days** (rollback source)
- [ ] After a clean week: pause or delete Tokyo

---

## Rollback

| When | How |
|------|-----|
| Before cutover | Do nothing — leave clients on Tokyo |
| After cutover | Point Vercel + secrets + hardcoded URLs back to Tokyo; redeploy. Mumbai writes during the window are lost. |

---

## Ownership split

| Actor | Owns |
|-------|------|
| Human (you) | Create project, dump/restore, passwords, Storage copy, Google OAuth, Vercel/GitHub secrets |
| Agent (Cursor) | Pre/post SQL verification on either project, policy counts, cutover code edits, checklist updates |

MCP cannot pipe a dump between two projects — Steps 3–5 need the Supabase CLI on your machine.

---

## Exit criteria

Migration is **done** when:

1. Production web + Android talk only to Mumbai  
2. Auth login works for existing users without password reset  
3. Storage assets (photos, APK, OTA bundles) load  
4. Edge functions + push + cron work  
5. Tokyo is retained 7 days, then retired  

---

## Related docs

- [`../engineering/MUMBAI_MIGRATION.md`](../engineering/MUMBAI_MIGRATION.md) — CLI dump/restore commands  
- [`../engineering/DEPLOYMENT_GUIDE.md`](../engineering/DEPLOYMENT_GUIDE.md) — Vercel / Android / OTA paths  
- [`.env.example`](../../.env.example) — env var names  
