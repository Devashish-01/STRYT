# P14 — Operations & monitoring

**Who:** agent; the owner creates external accounts and secrets and confirms drills
**Size:** 2 sessions
**Depends on:** P13; D10 answered

## Goal
When something breaks after launch, you find out quickly, know what happened, and can roll back safely, all without the Pro plan.

## Preconditions
| Check | Command | Expected |
|---|---|---|
| Branch | `git switch -c phase/14-ops origin/develop` | Switched |
| Weekly backup running | `Get-Content D:\STRYT-db-backups\backup.log -Tail 3` | Recent successful entries (from P01) |
| D10 answered | `DECISIONS.md` | Present |

## Read first
- `scripts/publish-ota-update.mjs`, `scripts/rollback-ota-update.mjs`
- `.github/workflows/*.yml`
- `supabase/functions/app-update/index.ts`
- `docs/database/HANDOFF.md` §5 and the rollback files convention
- `legal/grievance-redressal-policy.md`, `legal/OPERATOR.md` (support contacts)

## Steps

### 14.A — Error monitoring (per D10 = Sentry)
1. Owner creates the Sentry project(s) and adds GitHub secrets `SENTRY_DSN` and `SENTRY_AUTH_TOKEN` (names only in the report).
2. Add `@sentry/react` for web and `@sentry/capacitor` for native, following the official guides for these library versions.
   - Initialise only when a DSN is present, so dev and tests stay silent.
   - Set `release` from `package.json` version plus the platform.
3. **Personal data scrubbing:** a `beforeSend` that removes phone numbers, emails, names, addresses, lat/lng, OTPs, tokens and handoff codes from messages, breadcrumbs, request bodies and URLs. Unit-test the scrubber with realistic samples.
4. Upload source maps in the release workflows only, using `SENTRY_AUTH_TOKEN`. Source maps must **not** be publicly served. Check that `dist/` deployed to Vercel has no `.map` files, or that they're blocked.
5. Wrap the top-level router in an error boundary that reports the error and shows a friendly retry screen. Test by throwing in a test route on the Vercel preview; the event appears in Sentry, scrubbed (screenshot).

### 14.B — Uptime and job monitoring
6. **Owner:** create free uptime monitors (e.g. UptimeRobot or Better Stack) for:
   - `https://stryt.in/`;
   - `https://gnswxlfmcwyhmzlfipql.supabase.co/functions/v1/app-update`, with the expected status and body shape;
   - the Supabase REST health (`/rest/v1/` with the publishable key).

   Alerts go to the owner's email/phone.
7. **Cron jobs:**
   - write a migration granting `ci_readonly` `select` on `cron.job_run_details` and `cron.job` (full procedure);
   - extend the nightly `db-guardrails.yml` drift job to fail when any cron job failed in the last 24 h, or hasn't run within twice its schedule;
   - GitHub emails on workflow failure (owner confirms notifications are on).
8. **Edge function errors:** document how to read logs (Dashboard → Edge Functions → Logs) and add a weekly check to the runbook; the Free plan has limited log retention.

### 14.C — Backups and restore drill
9. Extend `scripts/backup/weekly-backup.ps1` to write a small `status.json` (last success time, table count). Add `docs/ops/RUNBOOK_BACKUP_RESTORE.md`:
   - where backups are;
   - how to restore a single table into a scratch table (existing `--verify` drill approach);
   - how to restore to **staging** for a full rehearsal.
10. **Drill:** restore the latest weekly backup into **staging** (never production), then run the E2E smoke subset against it. Paste the results.

### 14.D — Release and rollback runbooks, with a drill
11. `docs/ops/RUNBOOK_RELEASE.md`:
    - release checklist (develop green, CI, E2E, ledger, owner approval);
    - merge to `main`;
    - what runs (OTA, Android, web);
    - post-release checks: OTA manifest version and bundle grep, stryt.in entry JS grep, Android artifact, Sentry error rate for 1 hour.
12. `docs/ops/RUNBOOK_ROLLBACK.md`:
    - **OTA:** `npm run ota:rollback`. Read the script first and document exactly what it changes in `app-updates`.
    - **Web:** Vercel instant rollback (dashboard).
    - **Android store build:** halt the staged rollout in Play Console.
    - **Database:** the migration's rollback file through the full procedure. Note which rollbacks re-open security holes (e.g. `20260960`).
13. **OTA drill on staging only**, using the P13 staging build:
    - publish a test bundle to **staging** storage (add a guarded `--target staging` option to the publish/rollback scripts; production stays the default and is protected);
    - confirm the staging app updates;
    - run the rollback;
    - confirm the app returns to the previous bundle.

    Paste the evidence.

### 14.E — Incident and support readiness
14. `docs/ops/RUNBOOK_INCIDENT.md`:
    - severity levels;
    - first 15 minutes: check the monitors, Sentry, Supabase status, recent releases;
    - roll back vs fix forward;
    - how to disable a feature quickly (list the existing toggles, e.g. `queue_settings`, feature flags if any);
    - user communication;
    - post-incident note.
15. Support path: confirm `send-support-email` delivers to the owner's inbox (a test on staging, then one on production with owner approval). Confirm the grievance officer contact in `legal/grievance-redressal-policy.md` is real and matches the app's Support screen.

### 14.F — Secrets hygiene
16. `docs/ops/SECRETS_INVENTORY.md`, **names only**:
    - GitHub secrets;
    - Supabase edge function secrets;
    - Vercel env var names;
    - local `.env` keys.

    For each: purpose, owner, rotation date.
17. **Owner:**
    - remove the dead legacy `SUPABASE_SERVICE_ROLE_KEY` from local `.env` (disabled 2026-08-06; see HANDOFF);
    - confirm the GitHub `SUPABASE_SERVICE_ROLE_KEY` used for OTA publish is a current secret key with a rotation date;
    - set an expiry on the personal access token;
    - restrict the Firebase Android API key to the app's package name and SHA-1 in Google Cloud Console.

## Verification
| Check | Expected |
|---|---|
| Sentry test event | Arrives with release tag; no personal data (screenshot) |
| `curl -sI https://stryt.in/assets/<entry>.js.map` | Not publicly served (404/403) |
| Uptime monitors | 3 monitors green (owner screenshot) |
| `gh run list --workflow db-guardrails.yml --limit 1` | success, including the cron check |
| Restore drill | E2E smoke subset green on staging after restore |
| OTA drill | Update and rollback proven on the staging build |
| `npm run verify` | exit 0 |

## Definition of Done
- [ ] Error monitoring live, with scrubbing tested and source maps private.
- [ ] Uptime and cron monitoring alerting the owner.
- [ ] Backup status, restore runbook and restore drill done.
- [ ] Release, rollback and incident runbooks written; OTA rollback drill done on staging.
- [ ] Support and grievance paths verified.
- [ ] Secrets inventory (names only); dead key removed; token expiry set.

## Stop and ask if
- The OTA scripts can't be targeted at staging without risking production.
- Sentry's native SDK needs a plugin or manifest change beyond its documented setup.

## Checker checklist
- Read the scrubber and its tests; feed it a sample containing a phone number and an OTP.
- Confirm no secret values are in `docs/ops/`: `git grep -n -I -E "eyJ|sb_secret_|sbp_|AIza" -- docs/ops` → no output.
- Confirm the publish script's default target is production **and** that the staging target can't write to the production bucket (read the guard).
