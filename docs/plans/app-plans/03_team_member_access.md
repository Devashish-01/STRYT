# Task 3 — Team Member Access (full matured flow)

## Goal
A business owner can add team members with **scoped** access; a team member sees
and can act on **only** what their scope allows. Production-grade UI.

## Current state (verified)
- `business_team_members` table (0 rows) + `business_team_scopes` migration.
- Scopes wired into routing via `RequireScope` (catalog / queue / appointments /
  leads / full).
- RLS helpers `has_business_scope(business_id, uid, scope)` and
  `can_manage_business(id)` — **execute grant just fixed** (was breaking writes).
- `has_business_scope` used by `queue_settings` delegated policy; parallel
  delegated policies exist on other business-owned tables.

## Gaps to close / mature
1. **Owner UI to manage team** — add/remove members, assign scopes, see status.
   Confirm a screen exists (BusinessAccess / team manager); if partial, mature.
2. **Invited member acceptance flow** — how a member is linked (by phone/email/
   uid), invite → accept → appears in `useAccountOptions` switcher.
3. **Scope-accurate chrome** — `ManageNav` + `BusinessHub` + `ManageDashboard`
   must hide every entry the member's scope can't reach (defense already at
   RequireScope; UI must match so there are no dead ends).
4. **Server parity** — every delegated table has a `has_business_scope` policy
   matching the UI scope; no table lets a scoped member exceed their scope.
5. **Revocation** — removing a member instantly bounces them (guards already
   reset context; verify with revoked grant).

## Steps
- [ ] Locate/ða audit the team-management screen + service methods.
- [ ] Verify each scope maps 1:1 UI ↔ route guard ↔ RLS policy; fill gaps.
- [ ] Polish UI to production grade (empty states, scope chips, confirm dialogs).
- [ ] Test matrix: each scope × each protected screen (allowed/blocked).

## Risk
Medium. RLS already the boundary; changes are additive policies + UI. Verify no
policy calls an ungranted function (the class of bug just fixed).
