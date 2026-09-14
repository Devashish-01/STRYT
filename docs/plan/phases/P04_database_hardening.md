# P04 — Database hardening

**Who:** agent; the owner confirms each production apply
**Size:** 2 sessions (4.A–4.C, then 4.D–4.F)
**Depends on:** P03

## Goal
Close the known, specific database security findings, each through the full production procedure, with proof that no app flow breaks.

## Findings this phase closes (verified 2026-09-13)
| # | Finding | Source |
|---|---|---|
| F1 | 2 functions with an unpinned `search_path`: `enforce_queue_open_on_join`, `notify_on_queue_called` | Security advisor |
| F2 | 34 SECURITY DEFINER functions are **executable by `anon`** (guests) | Security advisor |
| F3 | Duplicate overloads: `is_admin()` / `is_admin(text)`; two `bulk_deal_token_redeem` | Catalog |
| F4 | `rls_auto_enable` is SECURITY DEFINER without `search_path` | W8 linter warning |
| F5 | Guests trigger `401`s: the app calls `bump_business_metric` and `close_stale_queue_tokens`, which `anon` can't execute | Live guest visit of stryt.in |
| F6 | `spatial_ref_sys` has RLS off (ERROR); `postgis` and `pg_net` are installed in `public` | Security advisor |

## Preconditions
| Check | Command | Expected |
|---|---|---|
| Branch | `git switch -c phase/04-db-hardening origin/develop` | Switched |
| No unexplained drift | `npm run check-drift` | 0 drift |
| Advisor baseline saved | Management API `GET /v1/projects/gnswxlfmcwyhmzlfipql/advisors/security`, saved to a scratch file | 241 findings (or explain the difference) |

## Read first
- `docs/database/HANDOFF.md` §1, §5, §6 (all of it)
- `supabase/APPLY_LOG.md` (last 5 rows; format)
- `docs/plan/AGENT_RULES.md` §4

## Known traps
1. **Functions used inside RLS policies need EXECUTE for every role that reads the table.** `can_manage_business` and `is_admin()` appear in policies that `anon` evaluates. Revoking them breaks guest browsing. Before revoking any function, run:
   ```sql
   select tablename, policyname from pg_policies
   where qual ilike '%<fn>%' or with_check ilike '%<fn>%';
   ```
   Also grep views and other functions that call it.
2. **Trigger functions don't need EXECUTE for the user who fires the trigger.** Postgres checks EXECUTE when the trigger is created, not when it fires. **Don't assume this: prove it** for each trigger you touch, with a forced-rollback test that fires the trigger as the affected role after the revoke.
3. **`CREATE OR REPLACE` resets `search_path`** unless you set it. Use `ALTER FUNCTION … SET search_path = public` for F1/F4, so bodies stay byte-identical.
4. **PostgREST caches the schema.** After each apply, run `notify pgrst, 'reload schema'`.
5. **PostGIS objects belong to the extension.** Grants you change on them can be reset by an extension update, and moving the extension out of `public` is risky.

## Steps

### 4.A — F1 and F4: pin `search_path`
1. Confirm from the catalog that `proconfig` lacks `search_path` for `enforce_queue_open_on_join`, `notify_on_queue_called` and `rls_auto_enable`, and whether each is SECURITY DEFINER.
2. Migration: `alter function public.<name>(<exact args>) set search_path = public;` for each. Rollback: `alter function … reset search_path;`.
3. Forced-rollback test:
   - apply the ALTERs;
   - join a queue and call a token as the right users (queue triggers fire);
   - prove the notifications insert;
   - raise.
4. Apply through the full procedure. The after-snapshot diff shows only `proconfig` changes. Advisor: `function_search_path_mutable` drops by 2.

### 4.B — F2: guest-callable SECURITY DEFINER functions
5. Produce the classification table below from the live catalog, **re-derived, not copied**:
   - `pg_get_function_identity_arguments`
   - `prorettype::regtype`
   - `has_function_privilege('anon', oid, 'EXECUTE')`
   - policy references (trap 1)
   - app callers: `git grep -n "rpc(\"<name>\"" -- src`
   - trigger usage (`pg_trigger`), cron usage (`cron.job.command`), edge-function usage (`git grep -n <name> -- supabase/functions`)
6. Starting hypothesis to **verify, not trust**:

   | Group | Functions | Expected action |
   |---|---|---|
   | Trigger functions (return `trigger`) | `_enforce_business_owner_limit`, `check_self_vouch`, `enforce_places_status_freeze`, `notify_admins_business_pending`, `notify_on_chat_message`, `notify_on_comment_mention`, `notify_on_comment_reaction`, `notify_on_nearby_alert`, `notify_on_post_like`, `notify_on_post_recommendation`, `notify_on_post_resolved`, `notify_on_qna_answered`, `notify_on_qna_asked`, `notify_on_queue_payment_status`, `notify_on_rating`, `recompute_rating_aggregates`, `sync_post_comments_count`, `sync_post_likes_count`, `sync_request_proposal_count`, `trg_bulk_deal_pledge_check_target` (20) | Revoke EXECUTE from `public, anon` (and `authenticated` where no policy or app needs it). Trigger functions can't be called over REST anyway, but the grant is noise the advisor flags. |
   | Internal helpers | `_bulk_deal_close_internal(text, text, text)`, `check_bulk_deal_target_and_close(text)` | **High priority.** Find every caller. If only triggers or cron call them, revoke from `public, anon, authenticated`. Otherwise stop and report exactly what a guest could do with them. |
   | Needed by guests (keep; verify output) | `can_manage_business`, `is_admin()`, `queue_waiting_line`, `get_public_profile`, `get_tracking`, `get_live_share`, `is_blocked_between`, `neighborhood_today` | Keep EXECUTE. For each, prove in a forced-rollback test as `anon` that it returns only intended fields (e.g. `get_public_profile` returns the alias, not the real name, unless consented; `get_tracking` needs a valid token). |
   | Review | `resolve_admin_email(p_login_id text)` | Used by the admin login page. Check whether a guest can enumerate admin emails. If so, change it to return a boolean or rate-limited result, keeping the admin login working, or stop and ask. |
   | PostGIS | `st_estimatedextent` (3 overloads) | Extension-owned. Record as accepted, with a reason. Don't alter. |
7. Write a migration with the revokes, and a rollback that regrants exactly the current grants (from the live catalog).
8. Forced-rollback tests, all inside one `DO` block:
   - **Guest browsing:** as `anon`, read the tables the home, search, business, provider, place and community detail screens read, and call `queue_waiting_line`, `get_public_profile` and `get_tracking`. No `42501`.
   - **Triggers still fire** as `authenticated` for each revoked trigger function. Fire at least one per table: like a post, comment, rate, send a chat message, ask/answer Q&A, pledge a bulk deal, create a place, submit a proposal.
   - **Internal helpers:** `anon` gets `42501`.
9. Apply through the procedure. Advisor: the `anon_security_definer_function_executable` count drops by the number revoked. Paste before and after.
10. Guest smoke test on the live API with the publishable key: `curl` the home and business-detail REST calls the app makes, and each kept RPC → 200.

### 4.C — F5: guest `401`s (app change)
11. In the app, don't call `bump_business_metric` or `close_stale_queue_tokens` when there's no signed-in user:
    - find the call sites with `git grep -n -e bump_business_metric -e close_stale_queue_tokens -- src`;
    - use `currentUserId()` or `useApp().isAuthed`.

    This changes nothing functionally, because guest calls already fail.
12. Unit test: with no user, the service doesn't call `rpc` for these, mirroring `businessService.queue.test.ts`.

### 4.D — F3: duplicate overloads
13. For each overload, show its definition and every reference: policies, other functions, triggers, app `rpc(` calls, edge functions.
14. An overload with **zero references**: migration to drop it, rollback recreating it verbatim from the snapshot, forced-rollback test that the kept overload still works for its callers. Both still referenced: stop and document why.

### 4.E — F6: PostGIS items
15. Don't move extensions and don't enable RLS on `spatial_ref_sys`. It's owned by the extension, and it holds only public spatial reference data.
16. Record both as **accepted risks**, with this reason, in `docs/database/HANDOFF.md` (new *Accepted advisor findings* list).

### 4.F — Finish
17. Update the HANDOFF TL;DR and APPLY_LOG rows. Run `npm run verify` and `npm run lint:migrations -- --all`.
18. Commit (owner-confirmed), push, open a PR into `develop`.

## Verification
| Command | Expected |
|---|---|
| Advisor `function_search_path_mutable` | 0 app functions |
| Advisor `anon_security_definer_function_executable` | Only the kept list + PostGIS, each justified in HANDOFF |
| `npm run check-drift` | 0 drift after applies |
| Guest `curl` smoke (step 10) | All 200 |
| Live guest visit of 2 business pages (Playwright, view-only) | No `401` on `bump_business_metric`, `close_stale_queue_tokens` or any other RPC. This needs the app change deployed, so run it on the Vercel preview of this PR. |
| `npm run verify` | exit 0 |

## Definition of Done
- [ ] F1–F6 each closed or recorded as an accepted risk, with evidence.
- [ ] Every production change has a migration, a rollback, a forced-rollback test, an APPLY_LOG row and snapshots before and after.
- [ ] Guest browsing and triggers proven unaffected.
- [ ] Advisor before/after pasted.

## Stop and ask if
- A function in the "internal" group has an app or guest caller.
- `resolve_admin_email` can't be made safe without changing the admin login flow.
- A snapshot shows a change you didn't make.

## Checker checklist
- Recompute the classification table from the catalog; compare it with the report.
- As `anon` in your own forced-rollback test: call `_bulk_deal_close_internal` (expect `42501`) and `queue_waiting_line` (expect rows).
- Verify APPLY_LOG sha256 values from the files.
- Re-run the advisor and compare its counts with the report.
