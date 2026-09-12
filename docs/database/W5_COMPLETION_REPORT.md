# W5 Completion Report — Me-Too Notifications Reconciliation

**Date:** 2026-09-13  
**Status:** ✅ COMPLETED (Verified via non-destructive forced-rollback testing, zero DB drift, full test suite pass)  
**Target Migration:** `supabase/migrations/20260950_bulk_deal_notifications_v2.sql`  
**Rollback File:** `supabase/rollbacks/20260950_bulk_deal_notifications_v2.rollback.sql`  

---

## 1. Executive Summary

Work Item **W5** resolves the me-too notifications reconciliation gap documented in `docs/database/HANDOFF.md` (§W5):
- **Previous State:** The database had trigger `me_too_count_trigger` on `public.request_me_toos` pointing to `sync_me_too_count()` (which maintains the integer count on `public.requests`, but sends **no** notifications). Migration `20260950` defined `sync_request_me_too()`, which implements the full viral notification loop (`ME_TOO` and `GROUP_BUY_UNLOCKED`), but was orphaned and never invoked by any trigger.
- **Implemented Solution (Option 1 — Single-Counting with Full Notifications):**
  Trigger `me_too_count_trigger` is re-pointed to execute `public.sync_request_me_too()` upon `INSERT` or `DELETE` on `public.request_me_toos`. This activates notifications for both individual joins and group-buy unlocking, while preserving exact single-counting and avoiding the +2 double-counting hazard.

---

## 2. Critical Bug Discovered and Fixed

During our static analysis and behavioral verification of `sync_request_me_too()` in `20260950_bulk_deal_notifications_v2.sql`:
- **Bug:** Line 653 originally queried:
  ```sql
  for v_joiner in
    select distinct user_id from public.me_too
    where request_id = new.request_id and user_id <> req_owner
  loop
  ```
  In PostgreSQL, the table is named `public.request_me_toos`. There is no table named `public.me_too`.
- **Impact:** When a group buy reached its target count, the group buy unlock transaction would throw an undefined table exception (`relation "public.me_too" does not exist`), failing the transaction and preventing the group buy from unlocking.
- **Resolution:**
  - Corrected SQL in `20260950_bulk_deal_notifications_v2.sql` to `public.request_me_toos`.
  - Updated string assertion in test `src/lib/bulkNotifications.test.ts` to assert on `public.request_me_toos`.

---

## 3. Implementation Details

### 3.1 Migration `20260950_bulk_deal_notifications_v2.sql`
1. `sync_request_me_too()` function has `set search_path = public` pinned and `SECURITY DEFINER`.
2. Explicit permissions block:
   ```sql
   revoke all on function public.sync_request_me_too() from public, anon, authenticated;
   grant execute on function public.sync_request_me_too() to authenticated, postgres, service_role;
   ```
3. Trigger replacement:
   ```sql
   drop trigger if exists me_too_count_trigger on public.request_me_toos;
   create trigger me_too_count_trigger
     after insert or delete on public.request_me_toos
     for each row execute function public.sync_request_me_too();
   ```

### 3.2 Rollback File `20260950_bulk_deal_notifications_v2.rollback.sql`
Restores live state verbatim:
1. Replaces `sync_request_me_too()` with previous snapshot definition.
2. Restores trigger:
   ```sql
   drop trigger if exists me_too_count_trigger on public.request_me_toos;
   create trigger me_too_count_trigger
     after insert or delete on public.request_me_toos
     for each row execute function public.sync_me_too_count();
   ```

---

## 4. Non-Destructive Forced-Rollback Verification

Executed via Supabase MCP `execute_sql` in `scripts/test-w5-forced-rollback.mjs` inside an explicit transaction block aborted with `RAISE EXCEPTION 'TEST_RESULT: ALL_CHECKS_PASSED'`:

1. **Single-Counting on 1st "Me Too":**
   - Created test request with `group_buy_target = 3` and initial `me_too_count = 0`.
   - Neighbor 1 joined via `insert into public.request_me_toos`.
   - Verified `me_too_count = 1` (single-counting verified; no double-counting).
   - Verified 1 `ME_TOO` notification delivered to request owner.
2. **Increment on 2nd "Me Too":**
   - Neighbor 2 joined.
   - Verified `me_too_count = 2`.
   - Verified 2nd `ME_TOO` notification delivered to request owner.
3. **Group Buy Target Reached (3rd "Me Too"):**
   - Neighbor 3 joined.
   - Verified `me_too_count = 3` (target reached).
   - Verified 1 `GROUP_BUY_UNLOCKED` notification delivered to request owner.
   - Verified 3 `GROUP_BUY_UNLOCKED` notifications delivered to all participating neighbors (`v_n1`, `v_n2`, `v_n3`).
4. **Decrement on Deletion:**
   - Deleted Neighbor 1's me-too record.
   - Verified `me_too_count = 2` (accurate decrement).
5. **Forced Rollback & Zero DB Drift:**
   - Transaction raised `TEST_RESULT: ALL_CHECKS_PASSED`.
   - Confirmed via `scripts/verify-w5-post-test.mjs`:
     - 0 leftover test requests
     - 0 leftover test users
     - 0 leftover test notifications
     - Live trigger on `public.request_me_toos` remains pointing to `sync_me_too_count()`.

---

## 5. Verification & Test Results

- **Vitest Suite:** 38 test files, 609 tests passing (0 failures).
- **Behavioral Verification:** Passed (`scripts/test-w5-forced-rollback.mjs`).
- **Zero DB Drift Verification:** Passed (`scripts/verify-w5-post-test.mjs`).

---

## 6. SHA-256 Checksums

| File | SHA-256 Hash | Status |
| :--- | :--- | :--- |
| `supabase/migrations/20260950_bulk_deal_notifications_v2.sql` | `d93d5fe6db640bb6f935d8f4fc3790fed21d0a1c030c24f6749aaf9af4b69f71` | Ready for W6 |
| `supabase/rollbacks/20260950_bulk_deal_notifications_v2.rollback.sql` | `93b23813bc6c0e3784dfea2c7f1bb352ef0bbd6eee1e02d59034ca138fbce683` | Ready for W6 |
