# Task 1 — Profile Routing Isolation

## Goal
The app has four "hats": **customer**, **business** (owner), **provider** (owner),
and **employee/team member** (delegated access to a business). Routing must keep
them isolated so chrome (sidebar / bottom nav / profile header) and the page
never disagree, and so a user can never land in a console for an entity they no
longer have access to.

## Current state (verified)
- `activeContext` (type: customer|business|provider, id, name) persisted in
  localStorage; `contextHomePath()` maps it to the right home.
- `PublicOnlyLayout`, `GuestOrAuthLayout`, `ProtectedLayout` gate auth tiers.
- `BusinessAccessGuard` / `ProviderAccessGuard` bounce a session out of a
  console for an entity it doesn't own/can't manage, resetting context→customer.
- `RequireScope` gates individual business manage routes by team scope
  (catalog / queue / appointments / leads / full).
- `attemptSwitchContext` + `PinGateSheet` gate switching INTO a business/provider.
- Employee = a `customer`-type user who has a delegated grant; they switch into
  the business context and are constrained by `RequireScope`.

## Gaps to close
1. **Context/path coherence guard.** `activeContext` can be `business` while the
   user navigates to a customer tab (`/home`), or vice-versa; today only the
   bottom-nav visibility is path-gated. Add a small guard/effect that keeps
   `activeContext` consistent with the current route family so chrome never
   shows the wrong hat.
2. **Employee never sees owner-only chrome.** Confirm `ManageNav` / `BusinessHub`
   / `ManageDashboard` hide owner-only entries for a scoped team member (they
   claim to self-filter — verify and tighten).
3. **Deep-link safety.** Entering `/business/:id/manage/settings` directly as a
   scoped employee must bounce (RequireScope full) — verify.
4. **Provider employee.** Providers have no delegation today; document that
   employee access is business-only (by design) so it isn't assumed elsewhere.

## Steps
- [ ] Add `useContextRouteSync()` (or extend ProtectedLayout) so navigating to a
      customer route while in a business/provider context does not leave stale
      console chrome; and navigating into `/business/:id/manage*` sets context.
- [ ] Audit `ManageNav`, `BusinessHub`, `ManageDashboard` scope-filtering.
- [ ] Add a `RouteFamily` helper (`customer` | `business` | `provider`) derived
      from `location.pathname` and assert chrome renders from it, not just
      `activeContext`.
- [ ] Verify guards on direct deep-link entry for each scope.

## Risk
Medium — touches global layout. Mitigate: additive guard, no route removals;
build + manual reasoning after each change.
