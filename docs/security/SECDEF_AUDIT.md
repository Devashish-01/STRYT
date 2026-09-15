# SECURITY DEFINER Functions Audit (P05)

> ⚠️ **Correction (2026-09-15, independent check).** This audit classified `appointment_update_delivery_status` and `assign_delivery` as LOW/SAFE, but both returned the whole `appointment_deliveries` row, including the customer's delivery OTP, to the rider and staff. Fixed by `20260967` (APPLY_LOG row 30). The keyword-based risk rating misses functions that *return* sensitive columns; review `RETURNS <table>` results by hand. Other verdicts were not re-reviewed one by one — see `docs/plan/reports/P05_REPORT.md` §6.

Audit of all 44 HIGH and 15 MEDIUM risk `public` SECURITY DEFINER functions in STRYT, conducted pursuant to Phase P05 Step 5.B.

---

## Summary Matrix

| Total Screened | HIGH | MEDIUM | SAFE | FIX |
|---|---|---|---|---|
| **59** | 44 | 15 | **43** | **16** |

### Findings & Fix Categories
1. **Trigger Functions Executable by `authenticated` (13 functions)**:
   - `notify_admins_business_pending`, `notify_on_chat_message`, `notify_on_comment_mention`, `notify_on_comment_reaction`, `notify_on_nearby_alert`, `notify_on_post_like`, `notify_on_post_resolved`, `notify_on_qna_answered`, `recompute_rating_aggregates`, `sync_post_comments_count`, `sync_post_likes_count`, `sync_request_proposal_count`, `tg_delivery_batch_in_progress`.
   - **Risk**: Client-callable trigger functions. Triggers run under table mutation/owner context and should never be callable directly via PostgREST RPC by `authenticated`.
   - **Fix**: `REVOKE EXECUTE ... FROM authenticated, anon, public;`
2. **Internal Catalog Reservation Functions Executable by `authenticated` (2 functions)**:
   - `reserve_catalog_item(p_item_id text)`
   - `reserve_catalog_items(p_items jsonb)`
   - **Risk**: Internal helpers invoked exclusively by `appointment_create*` SECURITY DEFINER procedures. Callable by `authenticated` directly via RPC, enabling unauthorized inventory decrements.
   - **Fix**: `REVOKE EXECUTE ... FROM authenticated, anon, public;` (owner `postgres` retains execution privilege).
3. **Unprotected Location Probing RPC (1 function)**:
   - `get_nearby_user_ids(p_lat double precision, p_lng double precision, p_radius_km double precision)`
   - **Risk**: Queries `users.lat` and `users.lng` in bounding box bypassing RLS. Callable by any signed-in user without admin check, allowing arbitrary coordinate probing.
   - **Fix**: Add `if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;` to match adminService caller restriction.
4. **Shelved Loyalty Stamping Function (1 function)**:
   - `increment_stamp(p_card_id text, p_user_id text)`
   - **Risk**: Allows specifying arbitrary `p_user_id` without verifying caller identity.
   - **Fix**: Guard `if auth.uid() is null or auth.uid()::text <> p_user_id then raise exception 'NOT_ALLOWED'; end if;`

---

## Detailed Function Audits (1 to 59)

### 1. `admin_recent_users()`
- **Allowed callers**: `authenticated`
- **What the code checks**: `if not exists (select 1 from public.users where id = auth.uid()::text and 'admin' = any(roles)) then raise exception 'NOT_ADMIN'; end if;`
- **Can a stranger exploit?**: No. Non-admins receive `NOT_ADMIN`.
- **Verdict**: `SAFE` (Enforces role check).

### 2. `admin_search_users(term text)`
- **Allowed callers**: `authenticated`
- **What the code checks**: `if not exists (select 1 from public.users where id = auth.uid()::text and 'admin' = any(roles)) then raise exception 'NOT_ADMIN'; end if;`
- **Can a stranger exploit?**: No. Non-admins receive `NOT_ADMIN`.
- **Verdict**: `SAFE` (Enforces role check).

### 3. `agreement_update_live_status(p_id text, p_status text, p_lat double precision, p_lng double precision)`
- **Allowed callers**: `authenticated`
- **What the code checks**: Validates status enum, lat/lng range, acquires row lock, and verifies `v_uid is distinct from v_agreement.responder_user_id` -> raises `NOT_RESPONDER`.
- **Can a stranger exploit?**: No. Only the assigned responder can update live status.
- **Verdict**: `SAFE` (Strict ownership validation).

### 4. `aliases_available(p_aliases text[])`
- **Allowed callers**: `authenticated`
- **What the code checks**: Read-only check checking if candidates exist in `users.alias` (excluding caller's own alias).
- **Can a stranger exploit?**: No. Returns only boolean availability, no PII.
- **Verdict**: `SAFE` (Utility query).

### 5. `booked_slots(p_target_id text)`
- **Allowed callers**: `authenticated`
- **What the code checks**: Aggregates booked slot sums (`sum(party_size)`) for active/pending appointments.
- **Can a stranger exploit?**: No. Returns aggregate capacity counts only, no customer identity.
- **Verdict**: `SAFE` (Public scheduling utility).

### 6. `bulk_deal_pledge_leave(p_deal_id text)`
- **Allowed callers**: `authenticated`
- **What the code checks**: Verifies `v_uid is not null`, locks deal, checks deal not closed, and deletes `from public.bulk_deal_pledges where deal_id = p_deal_id and user_id = v_uid`.
- **Can a stranger exploit?**: No. Deletes only caller's own pledge.
- **Verdict**: `SAFE` (Strict user_id filter).

### 7. `bulk_deal_redemption_stats(p_deal_id text)`
- **Allowed callers**: `authenticated`
- **What the code checks**: Returns integer counts (`total`, `redeemed`, `issued`).
- **Can a stranger exploit?**: No. Aggregate counts only.
- **Verdict**: `SAFE` (Aggregated statistics).

### 8. `bump_business_metric(p_business_id text, p_metric text)`
- **Allowed callers**: `authenticated`
- **What the code checks**: Accepts metric ('view', 'call', 'directions'), increments counter on `businesses`, inserts log.
- **Can a stranger exploit?**: No unauthorized data read/tamper. Guarded behind authentication in client app (Phase P04).
- **Verdict**: `SAFE` (Public metric counter).

### 9. `bump_provider_views(p_provider_id text)`
- **Allowed callers**: `authenticated`
- **What the code checks**: Increments view counter on `providers` and logs view timestamp.
- **Can a stranger exploit?**: No unauthorized data read/tamper.
- **Verdict**: `SAFE` (Public metric counter).

### 10. `business_slot_capacities(p_business_id text)`
- **Allowed callers**: `authenticated`
- **What the code checks**: Returns catalog items' `slot_capacity` and `max_party_size`.
- **Can a stranger exploit?**: No. Public store metadata.
- **Verdict**: `SAFE` (Public store metadata).

### 11. `clear_switch_pin(p_current_pin text)`
- **Allowed callers**: `authenticated`
- **What the code checks**: Verifies `v_uid`, calls `verify_switch_pin(p_current_pin)` against caller's PIN hash, updates `users` where `id = v_uid`.
- **Can a stranger exploit?**: No. Applies only to caller's row with PIN verification.
- **Verdict**: `SAFE` (Self-service security credential).

### 12. `close_expired_business_sessions()`
- **Allowed callers**: `authenticated`
- **What the code checks**: Updates `business_access_sessions` where `status in ('PENDING', 'ACTIVE') and expires_at <= now()`.
- **Can a stranger exploit?**: No. Idempotently marks expired sessions as EXPIRED.
- **Verdict**: `SAFE` (Idempotent cleanup).

### 13. `close_expired_requests()`
- **Allowed callers**: `authenticated`
- **What the code checks**: Updates `requests` where `status = 'OPEN' and expires_at < now()`.
- **Can a stranger exploit?**: No. Idempotently marks expired requests as EXPIRED.
- **Verdict**: `SAFE` (Idempotent cleanup).

### 14. `community_comment_delete(p_id text)`
- **Allowed callers**: `authenticated`
- **What the code checks**: Fetches comment and parent post author; verifies `v_comment.author_user_id = v_uid or v_post_author = v_uid` or raises `NOT_ALLOWED`.
- **Can a stranger exploit?**: No. Only comment author or post author can delete.
- **Verdict**: `SAFE` (Ownership enforced).

### 15. `community_comment_set_pinned(p_id text, p_pinned boolean)`
- **Allowed callers**: `authenticated`
- **What the code checks**: Verifies `v_post_author = v_uid` or raises `NOT_POST_AUTHOR`.
- **Can a stranger exploit?**: No. Only post author can pin.
- **Verdict**: `SAFE` (Ownership enforced).

### 16. `community_comment_update(p_id text, p_body text)`
- **Allowed callers**: `authenticated`
- **What the code checks**: Verifies `v_comment.author_user_id = v_uid` or raises `NOT_YOUR_COMMENT`.
- **Can a stranger exploit?**: No. Only author can update.
- **Verdict**: `SAFE` (Ownership enforced).

### 17. `community_poll_close(p_id text)`
- **Allowed callers**: `authenticated`
- **What the code checks**: Verifies `v_post.author_user_id = v_uid` or raises `NOT_YOUR_POST`.
- **Can a stranger exploit?**: No. Only author can close poll.
- **Verdict**: `SAFE` (Ownership enforced).

### 18. `community_post_add_recommendation(p_post_id text, ...)`
- **Allowed callers**: `authenticated`
- **What the code checks**: Appends recommendation tagged with caller's `v_uid`.
- **Can a stranger exploit?**: No. Signed-in community interaction by design.
- **Verdict**: `SAFE` (Intended feature behavior).

### 19. `community_post_delete(p_id text)`
- **Allowed callers**: `authenticated`
- **What the code checks**: Verifies `v_author = v_uid` or raises `NOT_YOUR_POST`.
- **Can a stranger exploit?**: No. Only author can delete post.
- **Verdict**: `SAFE` (Ownership enforced).

### 20. `community_post_set_profile_visibility(p_id text, p_show boolean)`
- **Allowed callers**: `authenticated`
- **What the code checks**: Verifies `v_post.author_user_id = v_uid` or raises `NOT_YOUR_POST`.
- **Can a stranger exploit?**: No. Only author can set visibility.
- **Verdict**: `SAFE` (Ownership enforced).

### 21. `community_post_set_resolved(p_id text, p_resolved boolean)`
- **Allowed callers**: `authenticated`
- **What the code checks**: Verifies `v_post.author_user_id = v_uid` or raises `NOT_YOUR_POST`.
- **Can a stranger exploit?**: No. Only author can resolve post.
- **Verdict**: `SAFE` (Ownership enforced).

### 22. `community_post_update(...)`
- **Allowed callers**: `authenticated`
- **What the code checks**: Verifies `v_post.author_user_id = v_uid` or raises `NOT_YOUR_POST`.
- **Can a stranger exploit?**: No. Only author can edit.
- **Verdict**: `SAFE` (Ownership enforced).

### 23. `get_entity_recovery_question(p_kind text)`
- **Allowed callers**: `authenticated`
- **What the code checks**: Queries `where id = v_uid` for caller's recovery question ID.
- **Can a stranger exploit?**: No. Reads only caller's own question.
- **Verdict**: `SAFE` (Scoped to auth.uid()).

### 24. `get_live_share(p_share_id text)`
- **Allowed callers**: `authenticated`
- **What the code checks**: Verifies caller is sharer or in `live_share_recipients`. If not, returns empty set.
- **Can a stranger exploit?**: No. Unauthorized callers receive 0 rows.
- **Verdict**: `SAFE` (Access controlled).

### 25. `get_nearby_user_ids(p_lat double precision, p_lng double precision, p_radius_km double precision)`
- **Allowed callers**: `authenticated`
- **What the code checks**: Bounding box query on `users.lat` and `users.lng`. No admin check!
- **Can a stranger exploit?**: **YES**. A stranger could supply coordinates and radius to scrape user IDs at specific locations.
- **Verdict**: `FIX` (Add `is_admin()` check).

### 26. `get_own_coords()`
- **Allowed callers**: `authenticated`
- **What the code checks**: `select lat, lng from public.users where id = auth.uid()::text;`
- **Can a stranger exploit?**: No. Reads only caller's own coords.
- **Verdict**: `SAFE` (Scoped to auth.uid()).

### 27. `get_own_profile()`
- **Allowed callers**: `authenticated`
- **What the code checks**: `select * from public.users where id = auth.uid()::text;`
- **Can a stranger exploit?**: No. Reads only caller's own row.
- **Verdict**: `SAFE` (Scoped to auth.uid()).

### 28. `get_public_profile(target_id text)`
- **Allowed callers**: `authenticated`
- **What the code checks**: Evaluates `show_name_publicly`, `show_phone_publicly`, `show_email_publicly`, `show_city_publicly`, masking fields if false unless caller is self or admin.
- **Can a stranger exploit?**: No. Strictly enforces privacy settings.
- **Verdict**: `SAFE` (Privacy masks enforced).

### 29. `group_buy_join(...)`
- **Allowed callers**: `authenticated`
- **What the code checks**: Inserts into `request_me_toos` with `user_id = v_uid`.
- **Can a stranger exploit?**: No. Acts only on caller's behalf.
- **Verdict**: `SAFE` (Scoped to auth.uid()).

### 30. `group_buy_leave(p_request_id text)`
- **Allowed callers**: `authenticated`
- **What the code checks**: Deletes from `request_me_toos where user_id = v_uid`.
- **Can a stranger exploit?**: No. Removes only caller's own entry.
- **Verdict**: `SAFE` (Scoped to auth.uid()).

### 31. `group_buy_redemption_stats(p_agreement_id text)`
- **Allowed callers**: `authenticated`
- **What the code checks**: Returns aggregate token counts.
- **Can a stranger exploit?**: No. Aggregate counts only.
- **Verdict**: `SAFE` (Aggregated statistics).

### 32. `increment_stamp(p_card_id text, p_user_id text)`
- **Allowed callers**: `authenticated`
- **What the code checks**: Takes `p_user_id` without verifying caller is that user.
- **Can a stranger exploit?**: **YES**. Caller can increment stamps for arbitrary users.
- **Verdict**: `FIX` (Add `auth.uid() = p_user_id` guard).

### 33. `me_too_toggle(p_request_id text)`
- **Allowed callers**: `authenticated`
- **What the code checks**: Inserts or deletes from `request_me_toos` with `user_id = v_uid`.
- **Can a stranger exploit?**: No. Affects only caller's own vote.
- **Verdict**: `SAFE` (Scoped to auth.uid()).

### 34. `my_live_share_recipients()`
- **Allowed callers**: `authenticated`
- **What the code checks**: Filters `where s.sharer_user_id = auth.uid()::text`.
- **Can a stranger exploit?**: No. Returns only caller's own recipients.
- **Verdict**: `SAFE` (Scoped to auth.uid()).

### 35. `notification_push_health()`
- **Allowed callers**: `authenticated`
- **What the code checks**: System health booleans (`pg_net`, settings, triggers).
- **Can a stranger exploit?**: No. No user data returned.
- **Verdict**: `SAFE` (System health check).

### 36. `notify_admins_business_pending()`
- **Allowed callers**: `authenticated` (trigger function!)
- **What the code checks**: Trigger function formatting admin review notifications.
- **Can a stranger exploit?**: Trigger functions should not be client-executable.
- **Verdict**: `FIX` (Revoke EXECUTE from authenticated).

### 37. `notify_on_chat_message()`
- **Allowed callers**: `authenticated` (trigger function!)
- **What the code checks**: Trigger function for chat notifications.
- **Can a stranger exploit?**: Trigger functions should not be client-executable.
- **Verdict**: `FIX` (Revoke EXECUTE from authenticated).

### 38. `notify_on_comment_mention()`
- **Allowed callers**: `authenticated` (trigger function!)
- **What the code checks**: Trigger function for comment mention notifications.
- **Can a stranger exploit?**: Trigger functions should not be client-executable.
- **Verdict**: `FIX` (Revoke EXECUTE from authenticated).

### 39. `notify_on_comment_reaction()`
- **Allowed callers**: `authenticated` (trigger function!)
- **What the code checks**: Trigger function for reaction notifications.
- **Can a stranger exploit?**: Trigger functions should not be client-executable.
- **Verdict**: `FIX` (Revoke EXECUTE from authenticated).

### 40. `notify_on_nearby_alert()`
- **Allowed callers**: `authenticated` (trigger function!)
- **What the code checks**: Trigger function for neighborhood alert fanout.
- **Can a stranger exploit?**: Trigger functions should not be client-executable.
- **Verdict**: `FIX` (Revoke EXECUTE from authenticated).

### 41. `notify_on_post_like()`
- **Allowed callers**: `authenticated` (trigger function!)
- **What the code checks**: Trigger function for post like notifications.
- **Can a stranger exploit?**: Trigger functions should not be client-executable.
- **Verdict**: `FIX` (Revoke EXECUTE from authenticated).

### 42. `notify_on_post_resolved()`
- **Allowed callers**: `authenticated` (trigger function!)
- **What the code checks**: Trigger function for post resolution notifications.
- **Can a stranger exploit?**: Trigger functions should not be client-executable.
- **Verdict**: `FIX` (Revoke EXECUTE from authenticated).

### 43. `notify_on_qna_answered()`
- **Allowed callers**: `authenticated` (trigger function!)
- **What the code checks**: Trigger function for Q&A answers.
- **Can a stranger exploit?**: Trigger functions should not be client-executable.
- **Verdict**: `FIX` (Revoke EXECUTE from authenticated).

### 44. `recompute_rating_aggregates()`
- **Allowed callers**: `authenticated` (trigger function!)
- **What the code checks**: Trigger function recomputing ratings.
- **Can a stranger exploit?**: Trigger functions should not be client-executable.
- **Verdict**: `FIX` (Revoke EXECUTE from authenticated).

### 45. `record_terms_acceptance(p_version text, p_user_agent text)`
- **Allowed callers**: `authenticated`
- **What the code checks**: Inserts terms acceptance with `user_id = v_uid` and updates `users where id = v_uid`.
- **Can a stranger exploit?**: No. Affects only caller's row.
- **Verdict**: `SAFE` (Scoped to auth.uid()).

### 46. `reserve_catalog_item(p_item_id text)`
- **Allowed callers**: `authenticated` (internal helper!)
- **What the code checks**: Decrements `quantity` on `catalog_items`.
- **Can a stranger exploit?**: **YES**. Callable directly via RPC by stranger without appointment creation.
- **Verdict**: `FIX` (Revoke EXECUTE from authenticated).

### 47. `reserve_catalog_items(p_items jsonb)`
- **Allowed callers**: `authenticated` (internal helper!)
- **What the code checks**: Decrements `quantity` on multiple `catalog_items`.
- **Can a stranger exploit?**: **YES**. Callable directly via RPC by stranger without appointment creation.
- **Verdict**: `FIX` (Revoke EXECUTE from authenticated).

### 48. `resolve_admin_email(p_login_id text)`
- **Allowed callers**: `anon`, `authenticated`
- **What the code checks**: Resolves admin ID to email with brute-force lockout (5 attempts per 15 min).
- **Can a stranger exploit?**: Rate-limited, required for admin login screen. Documented in HANDOFF §7.
- **Verdict**: `SAFE` (Accepted design requirement).

### 49. `revoke_live_share_recipient(p_recipient_user_id text)`
- **Allowed callers**: `authenticated`
- **What the code checks**: Looks up active live share where `sharer_user_id = v_uid`.
- **Can a stranger exploit?**: No. Only modifies caller's own live share.
- **Verdict**: `SAFE` (Scoped to auth.uid()).

### 50. `set_admin_login_id(p_new_id text)`
- **Allowed callers**: `authenticated`
- **What the code checks**: Verifies caller has role `'admin'`, checks uniqueness, updates `users where id = auth.uid()::text`.
- **Can a stranger exploit?**: No. Role-restricted to admin.
- **Verdict**: `SAFE` (Role check enforced).

### 51. `set_switch_pin(p_new_pin text, p_current_pin text)`
- **Allowed callers**: `authenticated`
- **What the code checks**: Verifies current PIN if set, updates `switch_pin_hash` for `auth.uid()`.
- **Can a stranger exploit?**: No. Only sets PIN for caller.
- **Verdict**: `SAFE` (Scoped to auth.uid()).

### 52. `stop_live_share()`
- **Allowed callers**: `authenticated`
- **What the code checks**: Finds active share where `sharer_user_id = v_uid` and marks ENDED.
- **Can a stranger exploit?**: No. Only stops caller's own share.
- **Verdict**: `SAFE` (Scoped to auth.uid()).

### 53. `sweep_stale_appointment_holds()`
- **Allowed callers**: `authenticated`
- **What the code checks**: Updates `appointments` where `status = 'PENDING' and created_at <= now() - interval '2 hours'`.
- **Can a stranger exploit?**: No. Idempotent cancellation of stale holds.
- **Verdict**: `SAFE` (Idempotent cleanup).

### 54. `sync_post_comments_count()`
- **Allowed callers**: `authenticated` (trigger function!)
- **What the code checks**: Trigger function updating post comment counts.
- **Can a stranger exploit?**: Trigger functions should not be client-executable.
- **Verdict**: `FIX` (Revoke EXECUTE from authenticated).

### 55. `sync_post_likes_count()`
- **Allowed callers**: `authenticated` (trigger function!)
- **What the code checks**: Trigger function updating post like counts.
- **Can a stranger exploit?**: Trigger functions should not be client-executable.
- **Verdict**: `FIX` (Revoke EXECUTE from authenticated).

### 56. `sync_request_proposal_count()`
- **Allowed callers**: `authenticated` (trigger function!)
- **What the code checks**: Trigger function updating request proposal counts.
- **Can a stranger exploit?**: Trigger functions should not be client-executable.
- **Verdict**: `FIX` (Revoke EXECUTE from authenticated).

### 57. `tg_delivery_batch_in_progress()`
- **Allowed callers**: `authenticated` (trigger function!)
- **What the code checks**: Trigger function updating batch status.
- **Can a stranger exploit?**: Trigger functions should not be client-executable.
- **Verdict**: `FIX` (Revoke EXECUTE from authenticated).

### 58. `update_live_share(p_lat double precision, p_lng double precision, p_accuracy double precision, p_heading double precision)`
- **Allowed callers**: `authenticated`
- **What the code checks**: Updates `live_shares` where `sharer_user_id = v_uid and status = 'ACTIVE'`.
- **Can a stranger exploit?**: No. Only updates caller's own coordinates.
- **Verdict**: `SAFE` (Scoped to auth.uid()).

### 59. `verify_switch_pin(p_pin text)`
- **Allowed callers**: `authenticated`
- **What the code checks**: Verifies `p_pin` against caller's PIN hash with rate-limiting table `switch_pin_attempts` for `v_uid`.
- **Can a stranger exploit?**: No. Only verifies caller's own PIN.
- **Verdict**: `SAFE` (Scoped to auth.uid()).
