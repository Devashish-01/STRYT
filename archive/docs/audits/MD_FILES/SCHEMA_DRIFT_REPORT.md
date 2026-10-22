# STRYT — Schema Drift Report (repo vs live database)

**Date:** 2026-07-16
**Live project:** `gnswxlfmcwyhmzlfipql` (status: ACTIVE_HEALTHY, Postgres 17)
**Method:** Every `.rpc()` call and schema dependency in the current codebase was
extracted and diffed against the live Postgres inventory (functions, tables,
columns, indexes, policies, triggers) queried directly from the database.
Verified live — **not** inferred from the migration tracking table, which is
unreliable here because migrations were applied manually / out of band.

---

## ✅ RESOLVED — 2026-07-16

Both fixes below have been applied to the live database via Supabase MCP and
re-verified live:

1. **`booking_and_deal_integrity` migration applied** — all 11 missing functions,
   both indexes, `ratings.agreement_id`, and the upgraded `notify_on_appointment_status`
   trigger are now present and confirmed live.
2. **Weak `proposal_counters` insert policy dropped** — only the properly-scoped
   `pc_insert`/`pc_select` policies remain.

**Post-apply verification (live):**
- All 11 functions confirmed present: `accept_proposal_at_price`, `agreement_start_work`,
  `agreement_submit_review`, `agreement_complete`, `agreement_dispute`,
  `agreement_claim_payment`, `agreement_confirm_payment`, `agreement_reject_payment`,
  `sweep_my_appointments`, `reschedule_appointment`, `booked_slots`.
- Both indexes confirmed: `appointments_no_double_book`, `ratings_one_per_agreement`.
- `ratings.agreement_id` column confirmed present.
- `notify_on_appointment_status` confirmed upgraded (contains `PENDING_CONFIRM` branch).
- `proposal_counters` policies confirmed scoped: only `pc_insert` (INSERT) +
  `pc_select`/`Proposal parties can read counters` (SELECT, both correctly scoped)
  remain — the unscoped insert policy is gone.
- Security advisor re-run post-apply: no new errors introduced. New functions show
  the same expected `SECURITY DEFINER`-exposed warning as the pre-existing
  `accept_proposal`, consistent with the app's existing pattern (auth checked
  internally, not via schema exposure).

**Remaining open items (not schema drift — tracked separately):**
- No functional/regression QA pass has been run against the now-repaired flows.
- Frontend deploy config (`VITE_USE_MOCKS`, real Supabase/Mapbox/Firebase keys in
  production) has not been independently re-verified since this fix.

---

## Auth hardening — 2026-07-16

**Leaked-password protection (HaveIBeenPwned check):** confirmed **not enabled**,
and **cannot be enabled from this environment** — the org (`Devashish-01's Org`) is
on the Supabase **Free plan**, and this feature is Pro-plan-and-above per Supabase's
own docs. It's also a GoTrue Auth config setting only exposed via the Dashboard or
Management API with a personal access token — no MCP tool covers it. Action needed
from you: upgrade to Pro and toggle it in **Auth → Policies → Password Security**,
or accept the risk at current scale.

**Business delegated-login brute-force — found and fixed.** `business_login_attempt`
(the RPC behind "log into a business with an id + password" for delegated access)
had **zero rate limiting** — any signed-in user could call it unlimited times to
guess another business's login id + password. This is a custom credential system
separate from Supabase Auth, so Supabase's own auth rate limits don't cover it.

Applied migration `business_login_rate_limit`:
- New `business_login_attempts` table (RLS enabled, **zero policies** — only the
  `SECURITY DEFINER` function touches it; no client access at all).
- `business_login_attempt` rewritten to track failures per (login_id, attempting
  user): locks out for **15 minutes** after **5 failed attempts**, resets on success,
  re-locks if attempted again during the lockout window.

**Post-apply verification (live):**
- `business_login_attempts` table exists, RLS on, 0 policies (correct — default-deny).
- Security advisor re-run: only new item is the expected `rls_enabled_no_policy` INFO
  for the new table (intentional). No new WARN/ERROR.

---

## Original report (for the record — issue is now closed)

The live database was **almost fully in sync** with the code. The drift was cleanly
isolated to a **single migration: `supabase/migrations/20260822_booking_and_deal_integrity.sql`**,
which had never been applied to production. Everything else the code depended on existed
live.

**Apply-safety pre-checks (verified live before applying):**
- **0** duplicate active bookings → the double-booking unique index created cleanly.
- Data volume was small — **36 appointments, 13 agreements** (effectively pre-launch/pilot data), so applying was low-risk.

---

## 1. Missing functions (11) — all from `20260822`

Every other RPC the client calls (~40: auth, business login, queues, live-share,
nearby search, tracking, admin, etc.) **exists live**. These 11 do not, and each is
actively called by the current code:

| Missing function | Called from | What breaks at runtime |
|---|---|---|
| `accept_proposal_at_price` | `requestService.acceptProposalAtPrice` | "Accept at ₹X" (negotiated-counter accept) — hard error |
| `agreement_start_work` | `requestService.startWork` | Provider can't start a job |
| `agreement_submit_review` | `requestService.submitForReview` | Provider can't submit for review |
| `agreement_complete` | `requestService.completeAgreement` | Requester can't complete/close a deal |
| `agreement_dispute` | `requestService.dispute` | Disputes can't be raised |
| `agreement_claim_payment` | `requestService.claimAgreementPayment` | Buyer can't mark payment (UPI/cash) |
| `agreement_confirm_payment` | `requestService.confirmAgreementPayment` | Seller can't confirm receipt |
| `agreement_reject_payment` | `requestService.rejectAgreementPaymentClaim` | Seller can't reject a false claim |
| `sweep_my_appointments` | `appointmentService` (list reads) | Housekeeping fails — wrapped in try/catch, so degrades quietly |
| `reschedule_appointment` | `appointmentService.create` (reschedule path) | Reschedule — hard error |
| `booked_slots` | `appointmentService.bookedSlots` | Privacy-safe slot availability — the double-booking guard's read side |

**Net effect:** the entire post-acceptance agreement lifecycle and the UPI payment
claim/confirm flow are non-functional against the live DB, plus reschedule and
negotiated-price accept. This is the single largest launch risk.

## 2. Missing indexes (2)

- `appointments_no_double_book` — partial unique index that prevents double-booking
  at the DB level. **Not present.** (Pre-check: 0 existing duplicates → applies cleanly.)
- `ratings_one_per_agreement` — one-rating-per-agreement guard. **Not present.**

## 3. Missing column (1) — has a live consequence now

- `ratings.agreement_id` — **does not exist.** But `requestService.rate()` always
  includes `agreement_id` in its insert, so **submitting a rating currently fails**
  against live (unknown-column error). (`ratings.tip` *does* exist, so tips are fine.)

## 4. Stale function version (1)

- `notify_on_appointment_status` exists but is the **old version** — confirmed its
  body has no `PENDING_CONFIRM` branch. So owners are **not** notified of payment
  claims or customer cancellations. `20260822` replaces it with the newer version.

## 5. RLS partially open (audit P1-5)

`proposal_counters` has RLS, but the two live policies aren't fully scoped:

- **SELECT** (`Proposal parties can read counters`) — correctly scoped to
  requester/responder. ✅
- **INSERT** (`Users can insert their own counters`) — checks **only**
  `by_user_id = auth.uid()`, **not** that the caller is a party to that proposal
  thread. ⚠️ Any authenticated user can insert a counter on someone else's proposal.

**Apply nuance:** `20260822` adds a properly-scoped `pc_insert` policy but does
**not** drop the old one. Two permissive INSERT policies are OR'd, so the weak one
would still allow the hole. **The old `Users can insert their own counters` policy
must be dropped** for the fix to take effect.

---

## What's already correct (not drift)

- Daily appointment limit **is** DB-enforced live (`enforce_customer_daily_appointment_limit`
  trigger + `trg_customer_daily_appointment_limit`) — better than the original audit assumed.
- `proposal_counters`, `blocked_slots`, `appointments`, `agreements`, `catalog_items`,
  `account_appeals`, `fcm_tokens`, `saved_searches`, `live_shares`, `client_errors` all exist.
- Dependent columns the missing functions need (`appointments.rescheduled_from`,
  `appointments.cancelled_by`, `agreements.dispute_reason`) all exist, so `20260822`
  will apply without missing-column failures.

---

## Remediation (single migration + one extra drop)

1. Apply `supabase/migrations/20260822_booking_and_deal_integrity.sql` (idempotent —
   safe to run). Adds the 11 functions, both indexes, `ratings.agreement_id`, the
   upgraded notify trigger, and the scoped `pc_insert`/`pc_select` policies.
2. **Additionally** run:
   ```sql
   drop policy "Users can insert their own counters" on public.proposal_counters;
   ```
   so the tightened insert policy isn't undercut.

**Post-apply verification:** re-run the `pg_proc` / index / policy checks to confirm
all 11 functions + 2 indexes + the `ratings.agreement_id` column are present, and
that only the scoped insert policy remains on `proposal_counters`.

---

## Appendix — full RPC diff (client call → live status)

**Present live (✅):** `get_own_coords`, `get_own_profile`, `get_public_profile`,
`my_delegated_businesses`, `bump_provider_views`, `bump_business_metric`,
`businesses_nearby`, `providers_nearby`, `community_posts_nearby`,
`neighborhood_today`, `get_nearby_user_ids`, `close_stale_queue_tokens`,
`suggest_business_login`, `set_business_login`, `business_login_attempt`,
`grant_business_access`, `decide_business_session`, `revoke_business_session`,
`close_expired_business_sessions`, `increment_stamp`, `get_leaderboard`,
`cancel_expired_agreements`, `close_expired_requests`, `accept_proposal`,
`notify_agreement_confirm`, `request_location_share`, `respond_location_share`,
`renew_location_share`, `get_shared_location`, `start_live_share`, `update_live_share`,
`stop_live_share`, `get_live_share`, `reserve_catalog_item`, `get_tracking`,
`claim_first_admin`, `set_admin_login_id`, `resolve_admin_email`, `admin_recent_users`,
`admin_search_users`.

**Missing live (❌ — all from `20260822`):** `accept_proposal_at_price`,
`agreement_start_work`, `agreement_submit_review`, `agreement_complete`,
`agreement_dispute`, `agreement_claim_payment`, `agreement_confirm_payment`,
`agreement_reject_payment`, `sweep_my_appointments`, `reschedule_appointment`,
`booked_slots`.
