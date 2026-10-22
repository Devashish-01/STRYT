# Task 4 — Delegate Access (full matured flow)

## Goal
Delegate access = granting another *account* the ability to operate a business
on the owner's behalf (broader than a scoped team member — up to FULL). Mature
the end-to-end flow with production UI.

## Current state (verified)
- `has_business_full_access(business_id, uid)` powers the `delegated_access_*`
  RLS policies (businesses UPDATE, etc.) — **execute grant just fixed**.
- `business_access_sessions` table (10 rows) + `business_login_credentials`
  (1 row) → a business can be operated via a separate login/PIN.
- `useAccountOptions` merges owned + delegated grants into the account switcher;
  `PinGateSheet` + `attemptSwitchContext` gate entry.
- `BusinessAccess` screen at `/account/business-access`.

## Gaps to close / mature
1. **Grant lifecycle** — issue, view, revoke a delegate grant from the owner
   side; expiry/last-used surfaced.
2. **Distinction from team scopes** — document + UI: FULL delegate vs scoped team
   member (Task 3). One = whole console, other = specific scopes.
3. **Session security** — PIN attempts are rate-limited (`switch_pin_attempts`,
   `admin_login_resolve_attempts` exist); verify lockout UX.
4. **Audit trail** — who acted as the business + when (for owner trust).
5. **Revocation propagation** — revoked delegate is bounced immediately
   (BusinessAccessGuard resets context).

## Steps
- [ ] Audit `BusinessAccess`, `businessAccessService`, `switchPinService`.
- [ ] Ensure owner can revoke; revoked session can't re-enter.
- [ ] Production UI: session list, last-active, revoke confirm, PIN lockout msg.
- [ ] Document FULL-vs-scoped model in-app (short helper text).

## Risk
Medium. Security-sensitive; keep RLS as the true boundary and only add
owner-side management + UX. No weakening of existing checks.
