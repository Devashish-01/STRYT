# Database drift baseline — 2026-09-11

Where the production database (`gnswxlfmcwyhmzlfipql`) stood against `supabase/migrations/` (207 files) before reconciliation began. Schema snapshot: `supabase/snapshots/2026-09-11_pre_reconcile.sql`.

## How this was measured

The migration ledger (`supabase_migrations.schema_migrations`) can't answer "was this applied?": most files were pasted into the SQL Editor, which records nothing. Instead:

- **Function bodies:** every body in every file was fingerprinted (md5 of whitespace-collapsed text) and compared with `pg_proc.prosrc`, calibrated first on three known-live functions. Mismatches were re-checked with comments stripped, and matched against *every* historical definition to identify which file's version is live.
- **Objects:** existence of 42 tables, 190 columns, 119 indexes, 58 triggers and 46 policies; 18 dropped objects confirmed gone.
- **Not covered:** 25 files that only change grants, RLS flags, realtime publications or cron.

## Result

| Verdict | Files |
|---|---|
| Applied and verified | 151 |
| Superseded (their objects were later redefined; later versions verified live) | 19 |
| **Not applied** | **12** |
| Not checkable by this method | 25 |

### Not applied

| File | Live instead |
|---|---|
| `20260897_daily_limit_advisory_lock` | `enforce_customer_daily_appointment_limit` = `20260801` version |
| `20260935_reschedule_preserve_payment_and_package` | `reschedule_appointment` = `20260885` version |
| `20260947`–`20260956` (`*_notifications_v2`, 10 files, 49 functions) | 46 functions on their previous versions; `broadcast_offer_to_nearby`, `broadcast_new_listing`, `grant_team_access` don't exist (referenced only by tests) |

Four of those files (`20260947`, `20260950`, `20260955`, `20260956`) redefine six `SECURITY DEFINER` functions without `set search_path`. All six are pinned to `search_path=public` today; applying as written would remove the pin.

## Exists only in the database (not in any migration file)

The repo cannot rebuild the production database until these are captured:

- **14 functions:** `can_manage_business` (RLS helper used by policies), `create_settlements_on_complete`, `distance_km`, `increment_stamp`, `neighborhood_today`, `protect_business_owner`, `rls_auto_enable`, `suggest_business_login`, `sync_community_post_geom`, `sync_geom`, `sync_is_verified`, `sync_me_too_count`, `sync_story_geom`, `update_rating_avg`.
- **A hardened `set_business_login`:** login-ID validation, 1–720h session clamp, session revocation on disable. The repo only has the weaker `20260809` original.
- **`me_too_count_trigger` → `sync_me_too_count`** on `request_me_toos`, replacing the `20260710` triggers. Nothing calls `sync_request_me_too`, so me-too notifications never fire.
- **Renamed policies and indexes** (same rules/columns), e.g. `update_users` → `upd_users`, `read_society_members` → `mem_read`, `bas_business_idx` → `business_access_sessions_biz_status_idx`. Most likely from the ledger-only `consolidate_multiple_permissive_policies` migration.
- **Cosmetic body drift:** `bump_provider_views` (hand edit, sets `viewed_at` explicitly), `bump_business_metric`, `resolve_admin_email` (reformatted; same logic).

## Security

**`queue_tokens` is readable by anyone, including `anon`.** Live policy `queue_tokens_select_all` is `USING ((true OR …))`, and `anon` holds `SELECT` on the table. Columns include `customer_name`, `customer_user_id`, `payment_amount`, `payment_reference`. It had 0 rows when checked, so nothing had leaked yet. The intended restriction from `20260713_critical_security_fixes` is nullified.

It can't be closed with a policy change alone: the app currently reads other customers' `WAITING` rows —
- `businessService.queue()` (public business page, guests included): `party_size` of every waiting token → "N ahead · ~X min";
- `businessService.myQueues()`: every waiting token at the customer's businesses → position and ETA;
- `BusinessDetail` subscribes to realtime changes on all of a business's tokens.

A safe fix needs a counts-only function and an app update before the policy is tightened.

## Other safety facts

- **No data restore point:** the Management API reported point-in-time recovery off and 0 completed backups.
- **Legacy API keys are disabled** (since 2026-08-06). `SUPABASE_SERVICE_ROLE_KEY` in `.env` is a dead legacy key; `VITE_SUPABASE_ANON_KEY` is already the working publishable key.

## Repo hygiene done alongside

- Removed `supabase/CONSOLIDATED_SPRINT_1_TO_6_MIGRATIONS.sql` (working tree). It contained pre-`20260946` versions of `enforce_slot_capacity`, `appointment_create` and `booked_slots`; pasting it again would have silently reverted out-of-range bookings.
