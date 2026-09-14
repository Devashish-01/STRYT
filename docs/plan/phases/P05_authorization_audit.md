# P05 — Authorization, storage, edge function & auth-config audit

**Who:** agent; owner confirms applies and dashboard/auth changes
**Size:** 3–4 sessions. Split: 5.A–5.B inventory and fixes (batches of ≤25 functions per session), 5.C data access, 5.D storage and edge functions, 5.E auth config.
**Depends on:** P04; D14 answered

## Goal
Prove, table by table and function by function, that a signed-in user can only read and change what they're entitled to. Fix every HIGH finding.

## Why
- 194 SECURITY DEFINER functions (which bypass row-level security) are callable by any signed-in user. Nobody has checked each one for its own ownership checks.
- 3 edge functions skip JWT verification (`send-push`, `app-update`, `purge-deleted-accounts`).
- Production auth has **test OTP numbers** configured, meaning fixed codes that log in without SMS.
- The `uploads` bucket is public.

## Preconditions
| Check | Command | Expected |
|---|---|---|
| Branch | `git switch -c phase/05-authz-audit origin/develop` | Switched |
| No drift | `npm run check-drift` | 0 |
| D14 answered | `DECISIONS.md` | Present |

## Read first
- `docs/database/HANDOFF.md` §5, §6
- `docs/engineering/CODE_GRAPH.md` (PII masking rules) and `docs/engineering/CODEBASE_MAP.md` §5–6
- `supabase/functions/*/index.ts` (for 5.D)
- `docs/gaps/PROFILE_PRIVACY_GAP_LOG.md`, `SECURITY_SETTINGS_GAP_LOG.md`, `TEAM_ACCESS_GAP_LOG.md` (context on the alias/real-name and team-scope models)

## Steps

### 5.A — Inventory (read-only)
1. Create `scripts/audit/secdef-inventory.mjs`, read-only via the Management API. It outputs `docs/security/SECDEF_INVENTORY.csv` with one row per `public` SECURITY DEFINER function, excluding PostGIS/extension-owned (`pg_depend` deptype `e`). Columns:
   - `signature`, `returns`, `anon_exec`, `auth_exec`, `search_path_pinned`
   - `references_auth_uid`: body matches `auth.uid()`
   - `ownership_check`: body matches any of `has_business_scope`, `has_business_access`, `can_manage_business`, `is_admin`, `owner_user_id`, `customer_user_id`, `requester_user_id`, `agent_user_id`, `grantee_user_id`
   - `writes`: `insert into`, `update`, `delete from` in the body
   - `used_by_policy`, `used_by_trigger`, `used_by_cron`
   - `app_callers`: `git grep -l "rpc(\"<name>\"" -- src`
   - `edge_callers`
2. Add `risk`:
   - **HIGH** = `auth_exec` and `writes` and not `ownership_check`;
   - **MEDIUM** = `auth_exec` and not `writes` and not `ownership_check` and the function returns table/set data;
   - **LOW** = everything else.

   Paste the counts per risk level.
3. The regex is only a first filter. Make **HIGH and MEDIUM a manual review list**.

### 5.B — Review and fix (batches of ≤25 functions per session)
4. For each HIGH/MEDIUM function, read the whole body and answer in `docs/security/SECDEF_AUDIT.md`:
   - who is allowed to call it;
   - what the code checks;
   - can a **stranger** (signed in, unrelated) cause a read or write they shouldn't;
   - verdict: `SAFE` (reason), `FIX` or `DECISION`.
5. For each `FIX`:
   - write a forced-rollback test that proves the hole as a stranger: expect success before the fix;
   - write the migration from the **live** definition (HANDOFF rule 4), with the smallest added guard;
   - run the same test after the fix and expect `NOT_ALLOWED`/`42501`;
   - prove the legitimate user still succeeds;
   - apply through the procedure, with an APPLY_LOG row.
6. Functions nothing calls (no app, policy, trigger, cron or edge caller) are candidates to revoke from `authenticated`. List them for the owner and don't drop them in this phase.

### 5.C — Data access on personal-data tables
7. Derive the personal-data tables from the catalog: columns named like `phone|email|name|address|lat|lng|password|hash|reference|note|handoff|otp|token|document|dob|aadhaar|pan`. Start from (and extend) `users`, `appointments`, `appointment_deliveries`, `agreements`, `proposals`, `conversations`, `messages`, `notifications`, `emergency_contacts`, the location-sharing tables, `business_access_sessions`, `business_login_credentials`, entity-password tables, the verification tables, `queue_tokens`, `bulk_deal_pledges`, custom payments, support and appeal tables.
8. For each table, one forced-rollback `DO` block tests SELECT/INSERT/UPDATE/DELETE as:
   - `anon`;
   - a **stranger**;
   - a **participant** (e.g. the customer on an appointment);
   - the **business owner**;
   - a **team member** with the right scope and with the wrong scope.

   Record a matrix in `docs/security/DATA_ACCESS_MATRIX.md`.
9. Mismatch with intended access → `FIX` via the procedure, as in step 5. Especially check:
   - `appointment_deliveries.handoff_code` (delivery OTP): must be visible only to the customer, never the rider before handoff;
   - `business_login_credentials.password_hash`: no one via the API;
   - the real-name vs alias rules.

### 5.D — Storage and edge functions
10. Storage policies: list `storage.objects` policies per bucket (`uploads` public, `app-updates` public, `verification-docs` private). Prove, in forced rollbacks or with the publishable key:
    - a user can't overwrite or delete another user's object in `uploads`;
    - only admins and the owner can read `verification-docs`;
    - nobody but CI can write `app-updates`.

    Check the upload size and MIME limits configured per bucket.
11. Edge functions: review each of the 8 (`send-push`, `ai-assist`, `send-support-email`, `profile-control`, `admin-delete-profile`, `app-update`, `verification-review`, `purge-deleted-accounts`). Record in `docs/security/EDGE_FUNCTIONS_AUDIT.md`:
    - how auth is enforced (JWT, a shared secret compared in **constant time**, or public by design);
    - input validation;
    - allowed methods, CORS;
    - rate limiting and abuse cost (especially `ai-assist` and `send-support-email`);
    - error messages leaking internals.

    Fix HIGH findings. Deploy with `npx supabase functions deploy <name> --project-ref <ref> --use-api` (no Docker), owner-confirmed.

### 5.E — Auth configuration (owner applies dashboard changes)
12. Read the auth config via the Management API (`GET /v1/projects/{ref}/config/auth`); **never print secrets**. Report:
    - enabled providers, OTP expiry and length;
    - rate limits for OTP send and verify;
    - CAPTCHA status;
    - leaked-password protection;
    - JWT expiry;
    - site URL and redirect allow-list;
    - whether `sms_test_otp` is set.
13. **Test OTP numbers on production:** list which phone numbers have fixed OTPs (numbers only, never the OTPs in the report) and which accounts they map to. They must belong to reviewer/demo accounts **with no admin or business privileges** and no real data. Otherwise stop and ask.
14. Per D14, the owner:
    - enables leaked-password protection;
    - enables CAPTCHA for sign-in/OTP;

    and the agent implements the matching CAPTCHA widget on `/auth/phone` and `/admin/login`, with a unit test for the token being passed. Tighten rate limits if they're defaults.
15. Update HANDOFF with an *Auth configuration* section recording the settings (not secrets).

## Verification
| Command / artefact | Expected |
|---|---|
| `docs/security/SECDEF_INVENTORY.csv` | One row per non-extension SECURITY DEFINER function (count matches the catalog query in the report) |
| `docs/security/SECDEF_AUDIT.md` | Every HIGH/MEDIUM row has a verdict; 0 `FIX` left open |
| `docs/security/DATA_ACCESS_MATRIX.md` | Every personal-data table × 6 actors × 4 operations filled, each cell backed by a test |
| `docs/security/EDGE_FUNCTIONS_AUDIT.md` | 8 functions reviewed; 0 HIGH open |
| `npm run check-drift` | 0 drift |
| `npm run verify` | exit 0 |

## Definition of Done
- [ ] Inventory complete; HIGH and MEDIUM reviewed; all FIXes applied through the procedure with stranger tests before and after.
- [ ] Data access matrix complete with no unintended access.
- [ ] Storage and edge function audits complete; HIGH fixed.
- [ ] Test OTP accounts confirmed harmless; CAPTCHA and leaked-password protection per D14.

## Stop and ask if
- A fix would change what a legitimate user can do.
- A table's intended access isn't documented anywhere; that's a product decision.
- Any finding suggests real data has already been exposed. Report it immediately, before fixing.

## Checker checklist
- Pick 10 random HIGH/MEDIUM rows and re-review the bodies yourself.
- Re-run 5 random cells of the data access matrix as your own forced-rollback tests.
- `curl` a public `uploads` object URL; try to overwrite it with another user's JWT (expect a refusal).
- Confirm no secret or OTP value appears in any committed file: `git grep -n -I -E "sms_test_otp|[0-9]{6}\b" -- docs/security` (review hits by hand).
