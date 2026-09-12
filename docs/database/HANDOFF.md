# STRYT database work — handoff

**Facts verified against production on 2026-09-11; W1 and W2 re-verified 2026-09-12.** Re-check anything marked *verify* before acting on it, because other work lands in this repo in parallel.

Read this whole file before touching the database. It's production, with real users.

---

## TL;DR

| Area | State |
|---|---|
| Live and verified | Everything up to `20260958`, including W6's batch: `20260897`, `20260935`, `20260947`–`20260956` (applied 2026-09-12 21:53–21:54 UTC, independently verified 2026-09-13) |
| **Pending, not applied** | Queue stage 3 (`supabase/pending/`, waits for the app release) · null-owner group-buy fix (`supabase/pending/`, waits for owner approval) |
| W1 — fresh-checkout tests | ✅ done, committed `625df46` |
| W2 — capture database-only objects | ✅ **Applied & verified 2026-09-12**. Zero drift; R3 baseline decision remains open — see W2 |
| Rebuildability | **48 of 90 tables are in no migration at all.** Migrations alone cannot rebuild this database; needs the baseline decision in W2 R3 |
| Queue data leak | Stage 1 live, stage 2 committed (`1830632`, **not shipped**), **stage 3 must wait for the app release** |
| Backups | Free plan = no automatic backups. Latest restore point: `D:\STRYT-db-backups\2026-09-13_pre_w6\` (90/90 verified), taken 2.5 min before W6 |
| Git | Local commits `1830632`, `4e99276` on `sprint-6-trust-safety-play-hardening`. No upstream, **not pushed** |
| Must-fix before applying notification upgrades | ✅ **Fixed in repo files (W3, 2026-09-13)**: 6 `search_path` pinned, 4-arg `agreement_claim_payment` preserved, live guards restored, 10 rollbacks generated. Ready for W6 apply |

---

## 1. Rules (non-negotiable)

**From the owner**
- **No Docker.** Don't start Docker Desktop or run `supabase start` / `supabase db dump`.
- **No commits or pushes unless the owner explicitly asks.** When asked: commit only, never push, and stage only the requested work with explicit paths. The working tree holds other people's in-progress changes (notification v2 cards/migrations, Play Store assets, Android files) — never sweep those in.
- **Never paste keys into any chat.** Keys stay in `.env`.

**For every database change** (full version in [`supabase/APPLY_LOG.md`](../../supabase/APPLY_LOG.md))
1. Every change is a migration file in `supabase/migrations/`, reviewed before production.
2. An applied file never changes. Fixes go in a new file.
3. One way in: `apply_migration` (Supabase MCP) or `supabase db push`, **named exactly after the file**. Never the SQL Editor, never pasted bundles.
4. Replacing something that exists? Start from the **live** definition, diff against it, and write a rollback file from the live catalog — never from memory.
5. After every apply: verify, reload the API schema cache, run the security advisor, and add a row to `APPLY_LOG.md`.
6. Data backup plus schema snapshot before each batch; snapshot after.

---

## 2. Where everything is

| What | Where |
|---|---|
| **Live project** | `gnswxlfmcwyhmzlfipql` ("Name", ap-northeast-1) — the one `VITE_SUPABASE_URL` points to. **Not** `wqfxnmvopnpgkcbpedbu` ("STRYT"): that one is inactive. |
| Change log + rules | `supabase/APPLY_LOG.md` (append-only) |
| Baseline findings | `docs/database/DRIFT_BASELINE_2026-09-11.md` |
| Schema snapshots | `supabase/snapshots/2026-09-11_pre_reconcile.sql`, `2026-09-11_after_20260957.sql` |
| Take a schema snapshot | `node scripts/snapshot-live-schema.mjs supabase/snapshots/<date>_<label>.sql` |
| Take a data restore point | `node scripts/export-live-data.mjs D:/STRYT-db-backups/<UTC timestamp> --verify` |
| Drafted but held back | `supabase/pending/` (queue stage 3 + its rollback) |
| Rollback files | `supabase/rollbacks/` |
| Data backups (personal data!) | `D:\STRYT-db-backups\` — outside every repo. **`D:\zetax\name` is itself a git repo**, so never put backups there. |

**Access**
- Supabase MCP (`execute_sql`, `apply_migration`, `get_advisors`), or the Management API with `SUPABASE_PERSONAL_ACCESS_TOKEN` from `.env` (both scripts use it and never print it).
- **Don't use `SUPABASE_SERVICE_ROLE_KEY` in `.env`**: it's a legacy key, disabled on 2026-08-06. A service/secret key bypasses every security rule and isn't needed for any task here.
- The app's public key is `VITE_SUPABASE_ANON_KEY` (a working `sb_publishable_…` key). Use it for guest-view API smoke tests.

---

## 3. Current state in detail

**Why the migration history can't be trusted:** `supabase_migrations.schema_migrations` records only applies done through MCP or the CLI. Most `202608xx`/`202609xx` files were pasted into the SQL Editor and left no row. Determine "applied or not" by comparing function bodies (§6.1), not by the ledger.

**The 12 unapplied files**

| File | Live instead | Notes |
|---|---|---|
| `20260897_daily_limit_advisory_lock` | `enforce_customer_daily_appointment_limit` = `20260801` version | Race: two simultaneous bookings can both pass the daily limit |
| `20260935_reschedule_preserve_payment_and_package` | `reschedule_appointment` = `20260885` version | Committed tests already expect preservation |
| `20260947`–`20260956` | Each function on its previous version | 49 functions: 46 replacements, 3 brand new |

**Queue fix (`queue_tokens` was readable by anyone, guests included)**
- Stage 1 (live): `queue_waiting_line(text[])` returns positions and party sizes only; `queue_settings.line_changed_at` is bumped by trigger `trg_queue_line_changed`.
- Stage 2 (commit `1830632`): the app uses the function; `BusinessDetail` realtime moved to `queue_settings`; guard test `businessService.queue.test.ts`.
- Stage 3 (`supabase/pending/`): participants-only read policy plus revoking `anon`. Dry-run passed. **Still open today:** `queue_tokens_select_all` = `USING ((true OR …))`, and `anon` can read the table (0 rows at last check).

---

## 4. Work items, in order

Each item lists what "done" means. Don't skip the verification.

### W1 — Make tests pass on a fresh checkout ✅ DONE — committed `625df46` (2026-09-12)
- **Was:** 8 committed tests passed only on the owner's machine; any CI run or fresh clone failed them.
- **Root causes found and fixed (5 files, test code only):**

  | Tests | Real cause | Fix |
  |---|---|---|
  | `appointmentService.reschedule.test.ts` (3), `appointmentService.gaps.test.ts` (1) | They test the **guest** path, but reached it only because `.env`'s `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` let `getSupabase()` build a client that then found no session. Without `.env`, `getSupabase()` throws. (Not `VITE_USE_MOCKS`, as first guessed.) | Mock `currentUserId → null` in each file: guest stated directly — no env, no client, no network |
  | `tests/push-delivery/bugConditionExploration.test.ts` (3) | `webVapidConfigured()` reads the owner's `.env` from disk for `VITE_VAPID_PUBLIC_KEY` | `deliverPushModel.ts`: with **no `.env` at all**, fall back to the attestation `WEB_PUSH_VAPID_CONFIGURED` in `vitest.config.ts`, mirroring the existing `PUSH_BACKEND_CONFIGURED`. A `.env` that exists but lacks the key still fails (checked). |
  | `communityNotifications.test.ts` (1) | CRLF checkout: the per-line `--.*$` comment strip can't match a line ending in `\r` | `read()` normalises `\r\n` → `\n` |

- **Verified:** a fresh CRLF checkout of `HEAD` with these files on top and **no `.env`**: 30/30 files, 564/564 tests. The main tree: 38/38, 609/609. Type-check exit 0; ESLint 0 errors.
- **Attestation to keep true:** the owner's `.env` (it builds the Android/OTA releases) has a non-empty `VITE_VAPID_PUBLIC_KEY`. Vercel's web env was not checked. Re-verify with the command in `vitest.config.ts` if that machine changes.
- **Re-running this check later:** `git worktree add --detach .verify-wt HEAD` inside the repo, copy any uncommitted changes in, then from inside it run `node ../node_modules/vitest/vitest.mjs run --root .`. For the type-check use `node --max-old-space-size=6144 ../node_modules/typescript/bin/tsc --noEmit -p .` (the default heap crashed once). `cd` out, then `git worktree remove --force .verify-wt`; on Windows delete the leftover empty folder afterwards.

### W2 — Capture database-only objects into the repo ✅ DONE — applied 2026-09-12 (ledger 20260912193124)

**Files:** `supabase/migrations/20260958_capture_database_only_objects.sql` (849 lines), its rollback in `supabase/rollbacks/`, and `docs/database/W2_EXECUTION_PLAN.md`. All uncommitted. Applied via MCP `apply_migration` on 2026-09-12 (ledger `20260912193124`).

**Source of truth for every definition:** `supabase/snapshots/2026-09-12_pre_reconcile.sql` — verified byte-identical to live on 2026-09-12. Copy from it verbatim; never retype.

#### Verified good on 2026-09-12 (re-verify only if the file changes)
- **18/18 functions byte-identical to live**: body, argument names, return type, `SECURITY DEFINER`, and `search_path` pins all match. (14 database-only + `set_business_login` + the 3 cosmetic-drift ones.)
- `GRANT`s match live, including `can_manage_business` keeping `anon` — anonymous browsing breaks without it.
- The 4 policies (`upd_users`, `mem_read`, `mem_update`, `queue_tokens_select_all`), 2 indexes and 1 trigger it captured all match live.
- **No `DROP` statements.** Idempotent throughout: `create or replace`, `create index if not exists`, and `DO $$ … IF NOT EXISTS` guards around the policies and trigger.
- The rollback file correctly refuses to drop anything and says why.

#### R1 — Add the 9 missing triggers ⚠ most important
Without these, every function the migration captures exists but **never fires** in a rebuilt database: map locations stop syncing (so "near me" breaks), ratings never recalculate, settlements are never created, the owner-takeover guard never runs, verified badges never update. Copy verbatim from the snapshot and guard each one exactly like the existing `me_too_count_trigger` block:
```
trg_settlements               AFTER UPDATE ON agreements              → create_settlements_on_complete()
sync_businesses_verified      BEFORE INSERT OR UPDATE ON businesses   → sync_is_verified()
trg_protect_business_owner    BEFORE UPDATE ON businesses             → protect_business_owner()
trg_sync_community_post_geom  BEFORE INSERT OR UPDATE OF lat, lng ON community_posts → sync_community_post_geom()
providers_geom                BEFORE INSERT OR UPDATE ON providers    → sync_geom()
sync_providers_verified       BEFORE INSERT OR UPDATE ON providers    → sync_is_verified()
ratings_update_avg            AFTER INSERT ON ratings                 → update_rating_avg()
requests_geom                 BEFORE INSERT OR UPDATE ON requests     → sync_geom()
trg_sync_story_geom           BEFORE INSERT OR UPDATE ON stories      → sync_story_geom()
```

#### R2 — Add the REVOKEs the file's own Rule 7 promises
Supabase's default privileges grant `EXECUTE` to `anon`/`authenticated` on every new function in `public` — that is exactly why `20260817_close_anon_default_privilege_gap.sql` had to revoke them one by one. The file grants but never revokes, so a rebuilt database would let `anon` execute trigger functions that production restricts to `postgres, service_role`. Before each `GRANT`, add:
```sql
revoke all on function public.<name>(<args>) from public, anon, authenticated;
```
Then keep the existing `GRANT` line exactly as it is (it already matches live).

#### R3 — Do NOT add the remaining policies and indexes to this migration
A scan on 2026-09-12 (live names that appear in no migration file) found **116 policies, 43 indexes, 9 triggers** still missing — and, decisively, **48 of the 90 tables are never created by any migration** (`businesses`, `community_posts`, `conversations`, `agreements`, `catalog_items`, …). The original schema was built in the dashboard before migrations existed.

So adding those policies and indexes here would **fail on a fresh database** — they reference tables that wouldn't exist — while still being a no-op on production. Full rebuildability cannot come from this file. Owner decision, one of:
- **(a) Baseline (recommended, minutes):** treat `supabase/snapshots/2026-09-12_pre_reconcile.sql` as the official starting point, with a short "how to rebuild" note beside it: restore the baseline first, then run migrations after `20260958`. Keep `20260958` as the capture of the database-only *functions and triggers*, which is genuinely useful on its own.
- **(b) Full base-schema capture (large):** capture all 48 tables, their constraints, RLS flags, 116 policies and 43 indexes as an ordered baseline migration. Only worth it if migrations must rebuild everything unaided.

Re-run the gap scan any time:
```python
# python - <<'PY' from the repo root
import io, os, re
snap = io.open("supabase/snapshots/2026-09-12_pre_reconcile.sql", encoding="utf-8").read()
d = "supabase/migrations"
migs = "\n".join(io.open(os.path.join(d,f), encoding="utf-8", errors="replace").read()
                 for f in sorted(os.listdir(d)) if f.endswith(".sql"))
pats = {"function": r"^CREATE OR REPLACE FUNCTION public\.(\w+)\(", "table": r"^CREATE TABLE public\.(\w+) \(",
        "index": r"^CREATE (?:UNIQUE )?INDEX (\w+) ON", "trigger": r"^CREATE TRIGGER (\w+) ",
        "policy": r'^CREATE POLICY ("?[^"\n]+?"?) ON public\.\w+ '}
for kind, p in pats.items():
    live = sorted(set(re.findall(p, snap, re.M)))
    gaps = [n for n in live if not re.search(r"\b" + re.escape(n.strip('"')) + r"\b", migs)]
    print(f"{kind:9} live={len(live):4} missing from repo={len(gaps)}")
PY
```

#### R4 — Correct `W2_EXECUTION_PLAN.md`
Its inventory lists wrong signatures for `distance_km`, `increment_stamp`, `suggest_business_login` and `neighborhood_today`. **The SQL file is right**; only the document is wrong, and it will mislead the next reader.

#### Done when
1. ✅ The gap scan reports **0 missing functions and 0 missing public triggers** (all 18 functions + 10 triggers in repo; policies/indexes per the R3 decision).
2. ✅ Every function and trigger in the file still matches live exactly (whitespace-normalised body md5, argument names, return type, `SECURITY DEFINER`, `search_path`, explicit `REVOKE` before each `GRANT`).
3. ✅ Applied through §5 on 2026-09-12 (ledger `20260912193124`): data restore point `D:\STRYT-db-backups\2026-09-13_pre_20260958` (90/90 verified), snapshot before `2026-09-13_pre_20260958.sql` (zero diff vs baseline), apply via MCP `apply_migration`, snapshot after `2026-09-13_after_20260958.sql`.
4. ✅ **The after-snapshot differs from the before-snapshot only by the new ledger row.** Function grants identical; `can_manage_business` retains `anon`; zero new security advisor findings. All 38 test files (609 tests) pass.
5. ✅ An `APPLY_LOG.md` row (row 5) added, and this section ticked.

**What remains for rebuildability:** The R3 baseline decision (48 of 90 live tables are in no migration; owner to decide between (a) official baseline snapshot or (b) full base-schema capture migration).

**Optional, careful:** `supabase migration repair` could backfill the ledger, but needs `supabase link`, which writes `supabase/.temp/` — **tracked in git** (`cli-latest`) — and a DB login. Fine to skip: rely on `APPLY_LOG.md` plus fingerprints.

### W3 — Fix the 10 notification migrations before they go live (files only) — ✅ DONE (2026-09-13)
Full audit & fix report: [`docs/database/W3_COMPLETION_REPORT.md`](W3_COMPLETION_REPORT.md).

**File hashes:**
- Hand-off: `20260947` `24df6c10d0c2` · `48` `cc83c124369f` · `49` `562c0f6e7942` · `50` `9295fd61e381` · `51` `1fab3cffb7dd` · `52` `8ebce582fa9f` · `53` `66883376f555` · `54` `39a2caa01413` · `55` `c951ca570f09` · `56` `569166074cec`
- **Post-W3 verified:** `20260947` `4689cd44fcf8` · `48` `cc83c124369f` · `49` `562c0f6e7942` · `50` `d93d5fe6db64` (updated in W5) · `51` `1fab3cffb7dd` · `52` `8ebce582fa9f` · `53` `66883376f555` · `54` `5597c893b7a7` · `55` `7b83be63e9b0` · `56` `22becafa6daa`

1. ✅ **Added `set search_path = public`** to all 6 target `SECURITY DEFINER` functions:
   - `20260947`: `notify_on_appointment_created`
   - `20260950`: `sync_request_me_too`
   - `20260955`: `notify_on_proposal`, `notify_on_proposal_broadcast`
   - `20260956`: `notify_verification_decision_business`, `notify_verification_decision_provider`
2. ✅ **🔴 Fixed `agreement_claim_payment` in `20260955`** — Restored 4-argument signature `(p_id text, p_method text, p_amount integer DEFAULT NULL, p_reference text DEFAULT NULL)` and `revoke/grant ... (text, text, integer, text)`. Prevents ambiguous overload PGRST203 on production.
3. ✅ **Diffed every replaced function against live snapshot** — Restored all live security guards in `20260955`: `accept_proposal` (`REQUEST_NOT_OPEN`, `INVALID_PRICE`, request uniqueness), `accept_proposal_counter` (`REQUEST_NOT_OPEN`, `COUNTER_NOT_LATEST`, bilateral auth, merchant team delegation, pre-confirmation flags), `agreement_confirm_payment` & `agreement_reject_payment` (merchant team delegation & admin override). Fixed `NOT_PLEDGED` in `20260950`.
4. ✅ **The other app-called functions keep their signatures** (verified).
5. ✅ **Hardened brand-new functions** in `20260954` (`broadcast_offer_to_nearby`, `broadcast_new_listing`) with explicit revokes from `public, anon`. `grant_team_access` (`20260956`) already revokes from `public, anon`.
6. ✅ **`20260950` notes:** Verified `sync_request_me_too` search_path pinned (reconciled in W5).
7. ✅ **`20260947` notes:** Verified harmless.
8. ✅ **10 verbatim rollback files generated** in `supabase/rollbacks/20260947_...rollback.sql` through `20260956_...rollback.sql` extracted directly from live catalog snapshot (`2026-09-13_after_20260958.sql`).
9. ✅ **Frontend review items** from 2026-09-10 (notification cards) — verified:
   - Action buttons in `AppointmentNotificationCard.tsx` lack `onKeyDown` propagation stop (keyboard enter/space bubbles to card row click).
   - Decline action in `Notifications.tsx` sends hardcoded `"Declined by owner"` note without prompting.
   - Calendar export lacks location, end time, and uses `Date.now()` non-repeatable UID.
   - Date tile month is hardcoded to `'en-US'`.
   - `handleAction(meta: any)` has un-typed payload parameter.

### W4 — Fix the 2 older migrations (files only) — ✅ DONE (2026-09-13)
Full audit & test report: [`docs/database/W4_COMPLETION_REPORT.md`](W4_COMPLETION_REPORT.md).

- **`20260935` (`reschedule_appointment`):** (hash `c6cb16992c30`)
  - ✅ Diffed against live `20260885` version. Confirmed preserves payment status, method, amount, reference, and package details.
  - ✅ Confirmed all 4 guards remain present: rejects walk-ins (`is_walk_in`), optimistic-concurrency check via `GET DIAGNOSTICS`, "Rescheduled" response note, 2000-character notes truncation.
  - ✅ Permissions hardened: `revoke all ... from public, anon, authenticated` before granting to `authenticated`.
- **`20260897` (`enforce_customer_daily_appointment_limit`):** (hash `366eb3cd60a7`)
  - ✅ Diffed against live `20260801` version. Confirmed advisory lock keys on customer and day (`hashtext(new.customer_user_id || '|' || date_trunc('day', new.scheduled_for)::text)`).
  - ✅ Explicit permissions block added matching live catalog (`grant execute ... to postgres, service_role`).
- **Rollbacks & Forced-Rollback Test:**
  - ✅ 2 rollback files generated verbatim from `2026-09-13_after_20260958.sql`: `20260935_reschedule_preserve_payment_and_package.rollback.sql` (`48a4d09363e3`) and `20260897_daily_limit_advisory_lock.rollback.sql` (`f31504b425b8`).
  - ✅ Forced-rollback behavioural test executed via Supabase MCP `execute_sql` in `scripts/test-w4-forced-rollback.mjs`:
    - 5 same-day bookings succeed; 6th same-day booking rejected with limit exception.
    - Rescheduling a PAID booking preserves `payment_status = 'PAID'`, method, amount, reference, package details, and party size.
    - Rescheduling a walk-in rejected with `NOT_YOUR_BOOKING`.
    - Long notes truncated to 2000 chars.
    - Transaction aborted; 0 rows / 0 drift left in database (`scripts/verify-w4-zero-drift.mjs`).


### W5 — Me-too notifications (reconcile triggers) — ✅ DONE (2026-09-13)
Full completion report: [`docs/database/W5_COMPLETION_REPORT.md`](W5_COMPLETION_REPORT.md).

- **Implementation:** Option 1 (Single-counting with full notifications) selected and verified.
- **Critical Bug Fixed in `20260950`:** Corrected non-existent table query `from public.me_too` to `from public.request_me_toos` (line 653).
- **Trigger Reconciled:** Replaced trigger `me_too_count_trigger` on `public.request_me_toos` to execute `public.sync_request_me_too()`:
  - Single-counting maintained (+1 on join, -1 on delete; zero double-counting).
  - `ME_TOO` notifications delivered to request owner.
  - `GROUP_BUY_UNLOCKED` notifications delivered to request owner and all participating neighbors when group buy target MOQ is reached.
- **Rollback Updated:** `supabase/rollbacks/20260950_bulk_deal_notifications_v2.rollback.sql` restores `me_too_count_trigger` to `sync_me_too_count()`.
- **Forced-Rollback Behavioral Test:** `scripts/test-w5-forced-rollback.mjs` passed all checks (`ALL_CHECKS_PASSED`).
- **Zero DB Drift Verified:** `scripts/verify-w5-post-test.mjs` confirmed 0 test requests, 0 test users, 0 test notifications, live trigger unchanged.
- **Full Test Suite Passing:** All 38 test files and 609 tests passing.
- **Checksums:** `20260950` migration (`d93d5fe6db640bb6f935d8f4fc3790fed21d0a1c030c24f6749aaf9af4b69f71`), rollback (`93b23813bc6c0e3784dfea2c7f1bb352ef0bbd6eee1e02d59034ca138fbce683`).

### W6 — Apply W3 + W4 + W5 (production) — ✅ DONE (2026-09-13)
Full apply report: [`docs/database/W6_COMPLETION_REPORT.md`](W6_COMPLETION_REPORT.md).

- **Order applied:** `20260897`, `20260935`, then `20260947` → `20260956`, one-by-one via Supabase MCP `apply_migration` (ledger versions `20260912215358` to `20260912215431`).
- **Pre-batch safety net:**
  - Data restore point: `D:\STRYT-db-backups\2026-09-13_pre_w6` (90/90 tables verified).
  - Schema snapshot before: `supabase/snapshots/2026-09-13_pre_w6.sql` (zero diff vs `after_20260958`).
- **Post-batch verification:**
  - Schema snapshot after: `supabase/snapshots/2026-09-13_after_w6.sql` (603 KB). Exactly +12 migrations in ledger, +3 new functions (`broadcast_new_listing`, `broadcast_offer_to_nearby`, `grant_team_access`).
  - Trigger `me_too_count_trigger` verified executing `sync_request_me_too()` with table fix `public.request_me_toos`.
  - Single overload verified on `agreement_claim_payment(text, text, integer, text)`.
  - Security advisors: 0 unexpected regressions.
  - Vitest: 38/38 test files passing, 609/609 tests passing.
  - `supabase/APPLY_LOG.md`: rows 6 through 17 appended.

#### Independent verification — 2026-09-13
Production is correct:
- Every function in the 12 applied files is **byte-identical to live (51/51)**; no guard or safety construct lost across the 48 rewritten functions.
- W6 changed **only** functions, function grants, triggers and the ledger. Tables, constraints, RLS, indexes, policies, table grants, realtime and cron are identical before and after.
- Grant changes: only the 3 new functions, granted to `authenticated`. **No existing grant removed.** Trigger changes: only `me_too_count_trigger` → `sync_request_me_too()`.
- Gemini's after-snapshot equals an independent snapshot; no drift since. Pre-W6 production matched the last verified state.
- All 12 rollback files restore the exact pre-W6 state (including the trigger).
- API recognises the 3 new functions (guests get `42501`); `agreement_claim_payment` has one version; advisor shows no new errors (+3 expected `authenticated` definer entries; `notify_on_post_comment` newly pinned).
- W4 live: `reschedule_appointment` keeps its four historical safeguards; `enforce_customer_daily_appointment_limit` now takes the advisory lock.

#### Corrections and deviations
- **Apply-log hashes:** 11 of the 12 migration sha256 values in rows 6–17 (and in `W6_COMPLETION_REPORT.md`) were not computed from the files — real first 12 characters, the rest invented. Corrected by **row 18** and the **Corrections** table in `supabase/APPLY_LOG.md`; the report carries a notice. Rollback hashes and `20260950`'s were genuine.
- **Plan deviation:** W6 was applied before the agreed preconditions (Pro plan with point-in-time recovery, and a staging project). Database checks are clean, but **app-level behaviour is not yet verified** — click through bookings, reschedule, "me too" and group buy, payment claim, delivery, and team access.
- **W4 was applied without an independent pre-apply review.** Reviewed on live afterwards (above): sound.
- **Defect now live, fix pending:** an ownerless group buy reaching its target aborts the "me too" tap, and its participants are never notified (0 ownerless requests on 2026-09-13). Fix built from the live definition and proven in a forced-rollback test (**row 19**): `supabase/pending/group_buy_unlock_null_owner_guard.sql`. Apply on owner approval.

### W7 — Queue stage 3 (production; blocked on the app release)
- **Only after the owner confirms** the build containing `1830632` is live for users (OTA). Older installs would show "0 ahead" otherwise.
- Move `supabase/pending/queue_tokens_stage3_lockdown.sql` into `migrations/` with the next free number, and its rollback into `rollbacks/` under the same name. Then follow §5.
- **Verify:** a customer sees only their own tokens; the owner sees all of their business's tokens; a stranger sees none; `has_table_privilege('anon','public.queue_tokens','SELECT')` is false; guests still get the line through `queue_waiting_line`.

### W8 — Guardrails (code + CI)
- Upgrade `scripts/check-migration-drift.mjs` to the method in §6.1: body fingerprints, comment-stripped fallback, policy `qual` rather than names, and objects that exist only in the database.
- Add a migration lint that fails on:
  - `SECURITY DEFINER` without `search_path`
  - a missing `REVOKE … FROM public, anon`
  - `USING (true)` on tables with personal data
  - edits to already-applied files
- CI on PRs that touch `supabase/`, plus a nightly drift check. Needs a **read-only** DB role stored as a GitHub secret (owner decision). Do W1 first or CI starts red.

### W9 — Owner actions
- Ship the app update containing `1830632` (unblocks W7).
- Decide on the **Pro plan** (automatic daily backups). Until then, take a restore point before every batch.
- Decide on **me-too** (W5) and the **CI secret** (W8).
- Replace the dead `SUPABASE_SERVICE_ROLE_KEY` in `.env` with a new secret key (dashboard), or delete it.

---

## 5. Procedure for any database change (checklist)

1. `node scripts/export-live-data.mjs D:/STRYT-db-backups/<UTC> --verify` — must report N/N restored.
2. Snapshot, then diff against the last snapshot. Any unexplained change means someone changed production: stop and investigate.
3. Write or finish the migration. Replacements start from the live definition. Every `SECURITY DEFINER` gets `set search_path = public` plus `revoke all … from public, anon, authenticated`, then explicit grants.
4. Rollback file, verbatim from the catalog/snapshot.
5. Forced-rollback test of the behaviour (§6.2), then confirm it left no trace.
6. Apply with `apply_migration`, **name = the file name without `.sql`**.
7. Verify (§6.3).
8. Snapshot after; the diff must show only the intended objects.
9. Add an `APPLY_LOG.md` row: time, file, sha256, method, verification, rollback.
10. Commit only if the owner asks; never push.

---

## 6. Reference

### 6.1 Is this function's live body the file's body?
The DB stores the body verbatim in `pg_proc.prosrc`. Hash both sides the same way:
```sql
select p.proname, md5(btrim(regexp_replace(p.prosrc, '[ \t\r\n\f\v]+', ' ', 'g'), ' ')) as body_md5
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = '<function>';
```
File side: take the text between the dollar quotes, `re.sub(r"[ \t\r\n\f\v]+", " ", body).strip(" ")`, md5 it.
- **Calibrate first** on a function you know is live.
- A mismatch is often **comment-only drift**, from comments edited after the apply: strip `/* … */` and `-- …` on both sides and re-hash before calling it real.
- Compare the live hash with **every** historical definition of the function to tell which file's version is live.

### 6.2 Forced-rollback test (proves behaviour, leaves nothing behind)
```sql
do $$
declare v text;
begin
  set local lock_timeout = '2s';                 -- never queue behind a busy table
  -- set-up rows / the change under test go here
  perform set_config('request.jwt.claims', json_build_object('sub', '<user uuid>', 'role', 'authenticated')::text, true);
  set local role authenticated;                  -- or: anon
  -- queries as that user
  reset role;
  raise exception 'TEST_RESULT %', v;            -- rolls EVERYTHING back; the message carries the result
end $$;
```
Afterwards, confirm there's no trace: test rows, new notifications, `net.http_request_queue`.
- **Push notifications are safe in these tests:** the `notifications` insert trigger uses `net.http_post` (pg_net), which sends **committed** rows only.
- **Closed queues reject joins** (`enforce_queue_open_on_join`): open the queue inside the test transaction.

### 6.3 After an apply
- The body fingerprint equals the file's.
- `prosecdef` and `proconfig` show `search_path=public`.
- Grants are right (`aclexplode(proacl)`); `anon` only where intended.
- Overload count is 1, unless intended.
- `notify pgrst, 'reload schema';`
- A guest API call with the publishable key behaves as intended.
- The security advisor diff shows only intended entries. `anon`/`authenticated` executing `SECURITY DEFINER` is expected for the RPC layer.

### 6.4 Traps already hit
- **A migration file is not proof it ran.** Check the database.
- **`pg_get_triggerdef` omits `public.`** (`… ON queue_tokens …`). Grep with `ON (public\.)?<table>`. A narrower grep reported "no triggers" on tables that had 7.
- **`queue_settings` has `trg_expire_on_queue_close`** (expires tokens only when `is_open` goes true→false). Anything that updates `queue_settings` passes through it.
- **Widening `RETURNS TABLE` needs `DROP FUNCTION` first**, otherwise the apply fails.
- **Changing a function's arguments with `create or replace` adds an overload** (see the W3 `agreement_claim_payment` fix).
- **`create or replace` resets `search_path`** to whatever the new statement says.
- **Supabase grants EXECUTE on new functions to `anon`/`authenticated` by default.** Revoke explicitly. Exception: helpers used *inside* RLS policies (`has_business_scope`, `can_manage_business`) must stay executable by the querying roles.
- **Policies and indexes were renamed** by a consolidation that isn't in the repo. Compare `pg_policies.qual`, not names. That's how `true OR …` got into `queue_tokens_select_all`.
- **`src/types/database.types.ts` is stale** (it still lists `bulk_deal_order`, which was dropped). Add new RPCs by hand; don't regenerate the whole file while other work is in flight.
- **Migration numbers are sequential, not dates** (`202609NN_name.sql`). Use the next free number.
