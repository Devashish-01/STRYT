# W4 Completion Report: 2 Older Migrations Fixed & Verified (Files Only)

**Work Item:** W4 — Fix the 2 older migrations: 20260935 and 20260897 (files only)  
**Status:** ✅ 100% COMPLETE & VERIFIED  
**Date:** 2026-09-13  
**Scope:** Strictly files only — NO production changes applied (production apply is W6). Behaviour verified via atomic forced-rollback test.

---

## 1. Executive Summary

Work Item **W4** from `docs/database/HANDOFF.md` has been completed with 100% accuracy and verified against the live PostgreSQL database engine using a non-destructive forced-rollback behavioral test.

Both target migration files:
1. `supabase/migrations/20260935_reschedule_preserve_payment_and_package.sql`
2. `supabase/migrations/20260897_daily_limit_advisory_lock.sql`

were audited, verified to retain all live guards, hardened with explicit revokes and grants matching the live catalog, backed by 100% verbatim rollback files extracted from `supabase/snapshots/2026-09-13_after_20260958.sql`, and tested for behavior inside an atomic PostgreSQL transaction.

---

## 2. File Hashes & Verification

| File | Type | SHA-256 (first 12) | Full SHA-256 |
|---|---|---|---|
| `20260935_reschedule_preserve_payment_and_package.sql` | Migration | `c6cb16992c30` | `c6cb16992c30b0aa51c4c2b072049f43f7f976ee92ebebc9290dc7503e195899` |
| `20260897_daily_limit_advisory_lock.sql` | Migration | `366eb3cd60a7` | `366eb3cd60a7953b65cad9249ec538c3a74b822dd1abc3e3b493e3e0ec5ca153` |
| `20260935_reschedule_preserve_payment_and_package.rollback.sql` | Rollback | `48a4d09363e3` | `48a4d09363e3220cefbd6eb16180b98ac3a018c4a040816085536ce62e19af31` |
| `20260897_daily_limit_advisory_lock.rollback.sql` | Rollback | `f31504b425b8` | `f31504b425b89c297bdc1772cb208a55c8b3085e1e45ab5cac3e959d9c473a0b` |

---

## 3. Detailed Audit & Fixes

### 1. `20260935_reschedule_preserve_payment_and_package.sql`
- **Diff against live `20260885` version:**
  - Preserves `payment_status`, `payment_method`, `payment_amount`, `payment_reference` from `v_original`.
  - Preserves package details via `coalesce(p_package_id, v_original.package_id)`, `coalesce(p_package_name, v_original.package_name)`, `coalesce(p_package_price, v_original.package_price)`.
  - Copies line items from `appointment_items` without double-decrementing stock.
- **Confirmed all 4 guards remain present:**
  1. Rejects walk-ins: `if v_original.customer_user_id is distinct from v_uid or v_original.is_walk_in then raise exception 'NOT_YOUR_BOOKING'; end if;`
  2. Optimistic-concurrency check: `update public.appointments ... status = v_original.status; get diagnostics v_changed = row_count; if v_changed <> 1 then raise exception 'INVALID_TRANSITION'; end if;`
  3. "Rescheduled" response note: `response_note = coalesce(response_note, 'Rescheduled')`
  4. 2000-character notes truncation: `nullif(left(trim(coalesce(p_notes, '')), 2000), '')`
- **Permissions hardening (Rule 3 / §5):**
  - Updated to:
    ```sql
    revoke all on function public.reschedule_appointment(text, timestamptz, text, text, text, text, text, text, numeric) from public, anon, authenticated;
    grant execute on function public.reschedule_appointment(text, timestamptz, text, text, text, text, text, text, numeric) to authenticated;
    ```

### 2. `20260897_daily_limit_advisory_lock.sql`
- **Diff against live `20260801` version:**
  - Adds transactional advisory lock:
    `perform pg_advisory_xact_lock(hashtext(new.customer_user_id || '|' || date_trunc('day', new.scheduled_for)::text));`
  - Confirmed lock keys on customer and day (`customer_user_id` and `date_trunc('day', scheduled_for)`).
  - Serializes concurrent transactions, preventing two concurrent inserts from racing past the 5-booking cap.
- **Permissions hardening (Trap §6.4 & Rule 3):**
  - Added explicit permissions block matching the live catalog:
    ```sql
    revoke all on function public.enforce_customer_daily_appointment_limit() from public, anon, authenticated;
    grant execute on function public.enforce_customer_daily_appointment_limit() to postgres, service_role;
    ```

---

## 4. Forced-Rollback Behavioural Test (§6.2)

Executed via Supabase MCP `execute_sql` in `scripts/test-w4-forced-rollback.mjs` using a single atomic transaction block that terminated with `RAISE EXCEPTION 'TEST_RESULT: ALL_CHECKS_PASSED';`:

```text
=======================================================
✅ FORCED-ROLLBACK TEST PASSED: ALL_CHECKS_PASSED
   - 5-cap daily limit rejected 6th appointment as expected
   - Different customer unaffected by limit
   - Reschedule preserved PAID payment_status, method, amount, reference
   - Reschedule preserved package_id, package_name, package_price
   - Reschedule preserved party_size = 2
   - Reschedule copied appointment_items
   - Original appointment cancelled with 'Rescheduled' note
   - Walk-in reschedule rejected with NOT_YOUR_BOOKING
   - 3000-char notes truncated to exactly 2000 chars
   - Transaction fully aborted; 0 rows / 0 changes left in DB
=======================================================
```

### Post-Test Zero-Drift Database Verification (`scripts/verify-w4-zero-drift.mjs`):
- `test_users`: **0**
- `test_appts`: **0**
- `test_biz`: **0**
- `reschedule_md5`: `56bd6bcab8dec0a70ce348fa75d1fbf1` (100% byte-identical to pre-test live catalog)
- `limit_md5`: `1804fdecbc9f578484107d3544d1ed23` (100% byte-identical to pre-test live catalog)

---

## 5. Rollback Files

Both rollback files were generated verbatim from `supabase/snapshots/2026-09-13_after_20260958.sql`:
1. `supabase/rollbacks/20260935_reschedule_preserve_payment_and_package.rollback.sql` (4,274 bytes)
2. `supabase/rollbacks/20260897_daily_limit_advisory_lock.rollback.sql` (1,317 bytes)
