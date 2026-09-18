# Release runbook — production database, edge functions, merge

**For:** the owner · **Written:** 2026-09-18 · **Covers:** owner steps 4–8 of
[`PLAY_LAUNCH_PLAN.md`](PLAY_LAUNCH_PLAN.md)

Do the parts **in order**. Merging to `main` ships to every current user by over-the-air update, and the new
code needs the database changes below, so parts 1 and 2 must be finished before part 4.

---

## What was checked before this was written

Read-only checks against production and staging on 2026-09-18:

| Check | Result |
|---|---|
| Migrations missing on production | Exactly the 17 expected: `20260973` → `20260989`. Production's last is `20260972`. |
| Same 17 on staging | All applied, and the full E2E suite passes against them. |
| Each migration file unchanged since its staging test | **17 of 17** match the sha256 recorded in `supabase/APPLY_LOG.md`, and so do all 17 rollback files. |
| A rollback file for each | Yes — `supabase/rollbacks/<name>.rollback.sql`. |
| `verification-docs` bucket (Aadhaar/PAN) | Private on both projects. No read policy for any client role, only an insert into the uploader's own folder. |

> **Added 19 Sept 2026: two more migrations, `20260990_community_moderation` and
> `20260991_moderation_text_everywhere`** (the table above was checked before they existed). Both are required
> before the merge: the admin Reports tab and the review, request, deal and story screens read the new
> `hidden_at` columns. Both are applied on staging; their rows are in `supabase/APPLY_LOG.md`.

**Urgent context:** `20260973` fixes chat sending, which the apply log records as **broken for every
production user right now**. It is first in the order for that reason as well.

---

## Part 1 — Production database

### 1.1 Take a fresh backup — this is your only way back

The project is on the Supabase **Free plan: no restorable backups** (`APPLY_LOG.md` Status). The restore point
recorded in the apply log is from 2026-09-16 and production has changed since, so take a new one:

```
node scripts/export-live-data.mjs D:/STRYT-db-backups/<UTC-timestamp> --verify
```

It must report **N/N restored**. If it does not, stop here.

### 1.2 Snapshot, and confirm nobody changed production

```
node scripts/snapshot-live-schema.mjs supabase/snapshots/<date>_pre_20260973.sql
```

Diff it against `supabase/snapshots/2026-09-16_pre_20260973.sql`. They should be identical except the
timestamp. **Any other difference means someone changed production directly — stop and find out why before
applying anything.**

### 1.3 Apply the 19 migrations, one at a time, in order

`20260973`, `20260974`, … `20260989`, then `20260990` and `20260991`. For **each** one, follow its row in the *Pending* table of
`supabase/APPLY_LOG.md`, which records the specifics. The loop is `docs/database/HANDOFF.md` §5:

1. **Forced-rollback test** of the behaviour (HANDOFF §6.2). It proves the change works and leaves no trace.
   The agent's safety classifier refused to run this against production on 2026-09-16, which is why this
   step is yours.
2. **Apply** with MCP `apply_migration`, with `name` = the file name **without** `.sql` — for example
   `20260973_messages_insert_policy_block_check`. Never the SQL Editor, never pasted bundles (APPLY_LOG rule 3).
3. **Verify** — the live definition matches the file, reload the schema cache (`notify pgrst, 'reload
   schema'`), run the security advisor.
4. **Record** — move the row from *Pending* to applied, with the ledger version.

### 1.4 Snapshot after

```
node scripts/snapshot-live-schema.mjs supabase/snapshots/<date>_after_20260991.sql
```

The diff against 1.2 must show only the objects these 19 migrations create or change.

### If something goes wrong

- A migration fails, or its verification fails: apply its rollback file the same way (MCP, named after the
  rollback file), then stop and investigate. The rollbacks are verbatim copies of what was live before.
- Data is damaged: restore from the export in 1.1.

---

## Part 2 — Edge functions

### 2.1 Deploy the three functions

With `SUPABASE_ACCESS_TOKEN` set in your shell:

```
npx supabase functions deploy purge-deleted-accounts --project-ref gnswxlfmcwyhmzlfipql --use-api
npx supabase functions deploy admin-delete-profile   --project-ref gnswxlfmcwyhmzlfipql --use-api
npx supabase functions deploy verification-review    --project-ref gnswxlfmcwyhmzlfipql --use-api
```

These versions also **delete Aadhaar/PAN documents with the account** (ledger P15-001). Before this change
the documents outlived the account, which the retention policy says they don't. Production gets the fix only
through this deploy.

### 2.2 Confirm they boot

Call each one without privileges, using the app's public anon key. The expected answer is **401 with
`{"ok":false,...}`** — that JSON shape is the function's own, so it proves the code loaded. A 5xx or a
gateway-shaped error means it did not boot. The agent ran exactly this check against staging after deploying
there.

### 2.3 Make sure something actually calls the purge

`purge-deleted-accounts` is called daily at 08:00 IST by `.github/workflows/purge-deleted-accounts.yml`. That
workflow **is not on `main` yet** — it arrives with the merge in part 4. It needs two GitHub secrets:

- `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Check both exist now. After the merge, run the workflow once by hand (Actions → *Purge deleted accounts* →
*Run workflow*). The response should contain `"ok":true` and `"mode":"cron"`.

Until then, the 30-day deletion that the privacy policy and store listing promise never completes.

### 2.4 Moderation (optional — not needed for the Play launch)

Migration `20260990` already makes posts and comments hide themselves after 5 different people report them;
that part needs no function. The `moderation` function adds two things on top: a priority label on each
report in the admin queue, and the automatic check of every new or edited public text — posts, comments,
reviews, requests, story captions, bulk deals, business listings and provider profiles (`20260991`). Both use
TypeSafe. Photos are not checked (v2, D22).

1. **Privacy policy first.** Public text (posts, comments, reviews, requests, captions, deals, listings) goes to TypeSafe (a processor; personal details are masked
   before sending). Name TypeSafe in the privacy policy's list of service providers — part of the lawyer
   review. Data safety answers do not change: a service provider is not "sharing".
2. **Secret:** Dashboard → Edge Functions → Secrets → add `TYPESAFE_API_KEY`. Never paste it into a chat.
3. **Deploy** (reads `verify_jwt = false` from `supabase/config.toml`; the function checks its callers itself):

   ```
   npx supabase functions deploy moderation --project-ref gnswxlfmcwyhmzlfipql --use-api --no-verify-jwt
   ```

   Report labels start working at once.
4. **Turn the automatic check on** when you are ready — it uses the push trigger's vault secrets
   (`functions_url`, `service_role_key`), which production already has if push notifications work:

   ```sql
   update public.moderation_settings set content_check_enabled = true;
   ```

   Off again: the same with `false`. The threshold for hiding after reports is
   `moderation_settings.report_hide_threshold` (5).

To check it on staging first: `scripts/db-tests/live-moderation-staging.mjs` runs the whole chain there and
cleans up after itself.

---

## Part 3 — Sentry (optional before merge)

Add a repository secret **`VITE_SENTRY_DSN`** (not `SENTRY_DSN` — the P14 report had the name wrong). Both
release workflows now pass it to the build. Without it, the build ships with Sentry off, which is harmless.

---

## Part 4 — Merge to `main`

### Before you merge

- [ ] Part 1 finished: all 19 applied, verified and recorded
- [ ] Part 2 finished: three functions deployed and booting
- [ ] The agent's final `npm run verify` and full E2E on the release commit are green (recorded in
  `PLAY_LAUNCH_PLAN.md`)
- [ ] Your background-location decision is applied (plan owner step 1)

### What merging triggers

| Workflow | Effect |
|---|---|
| `ota-release.yml` | Bumps the patch version itself (1.0.63 → 1.0.64), builds the web bundle and publishes it as an **over-the-air update to every existing install**. Pushes that only touch `docs/`, `android/`, `package.json` or `package-lock.json` do not trigger it. |
| `android-release.yml` | Builds and signs the AAB for Play. `versionCode` comes from the workflow run number, so it always increases. |

### Merge

It is a clean fast-forward — `origin/main` has nothing this branch lacks:

```
git switch main
git pull
git merge --ff-only night/2026-09-18
git push origin main
```

---

## Part 5 — After the merge

- [ ] `ota-release` run is green. On your own phone the update arrives; **send a chat message** — that is the
  `20260973` fix.
- [ ] `android-release` run is green. Download the AAB artifact for the Play Console.
- [ ] Run the purge workflow once by hand (2.3).
- [ ] Watch `client_errors` (and Sentry, if you set the DSN) for the first hours.

### Rolling back the app

```
SUPABASE_SERVICE_ROLE_KEY=... node scripts/rollback-ota-update.mjs 1.0.63
```

That repoints the update pointer at the bundle before the merge. `bundle-1.0.63.zip` was confirmed present in
production storage on 2026-09-18 (1.6 MB), so the target exists. If the new database objects must also go, use
the rollback files from part 1 — **newest first**, `20260991` down to `20260973`.
