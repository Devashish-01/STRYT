# Team Member Access — HLD / LLD / Tracker

**Status:** live; TMA-001…006 fixed (2026-08-01/02). TMA-007 open.
**Owner surface:** `/account/business-access` (BusinessAccess.tsx)
**Member surface:** `/business/:id/manage*` (BusinessAccessGuard → console)
**Original plan docs (read-only):** `docs/plans/app-plans/03_team_member_access.md`, `04_delegate_access.md`
**Last updated:** 2026-08-02

> This file is the retro-spec the feature should have been built from, plus the
> live tracker for the work still outstanding. Sections 1–5 describe the system
> as it is **designed to work**; §6 onward is the tracker of what actually
> works, what doesn't, and what's next.
>
> **Verification note:** DB statements below were verified against the LIVE
> database on 2026-08-02 via the Supabase MCP server (function bodies, grants,
> constraints). Re-verify after any further migration — a migration file
> existing is still not proof it was applied.

---

## 1. Why this exists

A business owner needs help running their shop without handing over the shop.
Two distinct needs, deliberately kept separate:

| Need | Mechanism | Level |
|------|-----------|-------|
| "Run the whole thing while I'm away" | Delegate access | `FULL` |
| "Just handle the bookings" | Team member | `SCOPED` |

Neither is ownership. Ownership is a single row fact — `businesses.owner_user_id`
— and nothing else in the system may manufacture it.

---

## 2. HLD

### 2.1 The three roles

```
                     ┌──────────────────────────────────────────┐
                     │  businesses.owner_user_id = me           │
   OWNER ────────────┤  • every console section                 │
                     │  • settings, payments, verification      │
                     │  • grants + revokes access               │
                     │  • business password + recovery          │
                     └──────────────────────────────────────────┘
                     ┌──────────────────────────────────────────┐
                     │  business_access_sessions                │
   FULL DELEGATE ────┤    status=ACTIVE, access_level=FULL      │
                     │  • every scoped section                  │
                     │  • NOT settings/payments/verification    │
                     │  • cannot grant, revoke, or change pwd   │
                     └──────────────────────────────────────────┘
                     ┌──────────────────────────────────────────┐
                     │  business_access_sessions                │
   TEAM MEMBER ──────┤    status=ACTIVE, access_level=SCOPED    │
                     │    scopes = subset of the scope list     │
                     │  • only the sections in `scopes`         │
                     └──────────────────────────────────────────┘
```

### 2.2 Scopes

`appointments` · `queue` · `catalog` · `leads` · `delivery`

A scope is a **section of the console**, not a permission verb. There is no
read-vs-write split within a scope: if you hold `catalog` you can edit the
catalogue.

### 2.3 The two-layer enforcement rule

This is the load-bearing invariant of the whole feature:

| Layer | Enforces | Failure mode if broken |
|-------|----------|------------------------|
| **DB (RLS + SECURITY DEFINER RPCs)** | What a user can *do* | Data breach |
| **Client (guards + nav)** | What a user can *see* | Confusing/leaky UI, no data loss |

The DB is authoritative and must be assumed to be the only real defence. The
client layer exists so a team member isn't shown doors that will slam in their
face — **it is not a security boundary, and no DB check may be relaxed on the
grounds that the UI already hides it.**

Corollary, and the source of the current defect class: the client layer must
still be *correct*, because "shown a door that opens" and "shown a door that
slams" are both bugs, and the second one hides the first during testing.

### 2.4 Onboarding lifecycle

```
  owner enters identifier (phone | email | @alias) + picks scopes
        │
        ▼
  grant_team_member_access()  ── owner check ──▶ reject if not owner
        │
        ▼
  business_access_sessions row: status=ACTIVE, access_level=SCOPED, scopes[]
        │
        ├──▶ notification to grantee
        │
        ▼
  grantee's switcher (useAccountOptions) gains a "Team member · <scopes>" hat
        │
        ▼
  grantee switches → PIN/password gate → /business/:id/manage
        │
        ▼
  BusinessAccessGuard: checkAccess() → myScope() → publish context
        │
        ▼
  ManageNav / BusinessHub render only granted sections
  RequireScope / RequireOwner block direct URL entry to the rest
        │
        ▼
  owner revokes  ──▶ status flips off ACTIVE
        │
        ▼
  realtime on business_access_sessions → hat disappears, user bounced to /home
```

---

## 3. LLD

### 3.1 Data

**`business_access_sessions`** — one row per grant.

| Column | Notes |
|--------|-------|
| `id` | uuid, PK — the session id used by revoke/update RPCs |
| `business_id` | the granting business |
| `grantee_user_id` | who was granted |
| `status` | `PENDING` · `ACTIVE` · `EXPIRED` · `REVOKED` · `DENIED` |
| `access_level` | `FULL` · `SCOPED` |
| `scopes` | `text[]`, meaningful only when `SCOPED` |
| `expires_at` | nullable; `null` = no expiry |

**`business_login_credentials`** — the shareable login-id/password path
(`04_delegate_access.md`). RLS: owner-only `select`. Writes only through
`set_business_login()`.

### 3.2 DB predicates (verified live 2026-08-02)

| Function | Purpose | Security |
|----------|---------|----------|
| `has_business_scope(biz, uid, scope)` | owner OR active session whose level/scopes cover `scope` | not client-executable |
| `has_business_full_access(biz, uid)` | owner OR active `FULL` session | not client-executable |
| `my_business_access_status(biz)` | "may I open this console at all" | `authenticated` |
| `my_business_access_scope(biz)` | returns `(access_level, scopes)` | `authenticated` |
| `my_delegated_businesses()` | **every** active session, any level | `authenticated` |
| `grant_team_member_access(biz, ident, scopes[])` | owner-gated grant | `authenticated` |
| `update_team_member_scopes(session, scopes[])` | owner-gated scope edit | `authenticated` |
| `revoke_business_session(session)` | owner-gated revoke | `authenticated` |

RLS policies (`20260841_business_team_scopes.sql`) map each business-owned table
to the scope that governs it:

| Table | Predicate |
|-------|-----------|
| `catalog_items`, `business_portfolio_items` | `has_business_scope(…, 'catalog')` |
| `queue_tokens`, `queue_settings` | `has_business_scope(…, 'queue')` |
| `appointments` (update) | `has_business_scope(…, 'appointments')` |
| `business_qna` | `has_business_scope(…, 'leads')` |
| `businesses` (update), `loyalty_cards` | `has_business_full_access(…)` |

**`my_delegated_businesses()` is level-agnostic by design.** It answers "can I
open this console at all" — never "am I the owner". Any caller that treats its
output as ownership is wrong. See TMA-001.

### 3.3 Client

| File | Role |
|------|------|
| `src/services/core/userService.ts` → `owned()` | splits **owned** vs **delegated** business ids |
| `src/store.tsx` | holds `ownedBusinessIds` (authority) · `delegatedBusinessIds` · `manageableBusinessIds` (owned ∪ delegated) |
| `src/components/BusinessAccessGuard.tsx` | route guard + `useBusinessAccess()` context |
| `src/components/RequireOwner.tsx` | owner-only routes |
| `src/components/RequireScope.tsx` | one-scope routes |
| `src/components/RequireBusinessDeliveryMember.tsx` | delivery scope **or** an active assigned run |
| `src/lib/teamConsole.ts` | `resolveConsoleMode()`, `buildScopeLabel()` |
| `src/hooks/useAccountOptions.ts` | the hat switcher; realtime-backed revoke self-heal |
| `src/screens/BusinessAccess.tsx` | owner's team management screen |

**The three store fields are not interchangeable.** Picking the wrong one is
exactly how TMA-001 happened, so the rule is:

| Question being asked | Field |
|----------------------|-------|
| Is this user the owner? (authority, gating, recovery, "my business") | `ownedBusinessIds` |
| Can this user open this console at all? (switcher, "do you have a hat") | `manageableBusinessIds` |
| Is this access borrowed rather than owned? (labels, badges) | `delegatedBusinessIds` |

### 3.4 Route map

```
/account/business-access                     ← owner: manage team
/business/:id/manage*                        ← BusinessAccessGuard
   ├── manage                                (dashboard — self-hides by scope)
   ├── manage/business                       (hub — self-hides by scope)
   ├── RequireScope "catalog"  → store, catalog, inventory, portfolio, hours
   ├── RequireScope "queue"    → queue
   ├── RequireScope "appointments" → appointments, deliveries
   ├── RequireScope "leads"    → qna, inbox, requests
   ├── RequireBusinessDeliveryMember → my-deliveries
   └── RequireOwner            → profile, broadcast, reviews, payments,
                                 verify, settings, community
```

---

## 4. Invariants

| # | Invariant | Enforced by |
|---|-----------|-------------|
| I1 | A grant never makes anyone an owner | `ownedBusinessIds` = `owner_user_id` matches only |
| I2 | The access context fails **closed** outside its provider | `NO_ACCESS` default in BusinessAccessGuard |
| I3 | Revoking removes the hat without a reload | realtime on `business_access_sessions` |
| I4 | Client checks never substitute for RLS | review rule — see §2.3 |
| I5 | A delegate never touches the business password or its recovery | `ownedBusinessIds` gates both |
| I6 | Scope labels come from one map | `SCOPE_LABELS` |

---

## 5. Test matrix

Each cell = what the actor should observe. `∅` = bounced to console root.

| Surface | Owner | FULL delegate | SCOPED (appointments) | Revoked |
|---------|-------|---------------|------------------------|---------|
| Console root | full | full-minus-owner | appointments only | ∅ /home |
| `manage/appointments` | ✓ | ✓ | ✓ | ∅ |
| `manage/catalog` | ✓ | ✓ | ∅ | ∅ |
| `manage/settings` | ✓ | ∅ | ∅ | ∅ |
| `manage/payments` | ✓ | ∅ | ∅ | ∅ |
| `/account/business-access` | manage team | own grants only | own grants only | own grants only |
| Business password prompt | own password | owner's password | owner's password | n/a |
| "Forgot password" | offered | **not** offered | **not** offered | n/a |
| Profile → "my business" | shown | **not** shown | **not** shown | not shown |

**Every row of this table must be re-checked after a full page reload.** The
defect that prompted this document only appeared on the second page load.

---

## 6. Build tracker — how this was actually made

Reconstructed from migrations + code. Status is what shipped, not what was planned.

| ID | Phase | What | Where | Status |
|----|-------|------|-------|--------|
| B-01 | Delegate access | login-id/password + session rows | `20260809_business_delegated_login.sql` | shipped |
| B-02 | Delegate access | additive RLS for session holders | same | superseded by B-05 |
| B-03 | Delegate access | `my_delegated_businesses()` | same | shipped, **misused** (TMA-001) |
| B-04 | Grant by identifier | `grant_business_access()` (FULL) | `20260814_business_access_grant_and_check.sql` | shipped |
| B-05 | Team scopes | `access_level` + `scopes`, scope-aware RLS | `20260841_business_team_scopes.sql` | shipped |
| B-06 | Team scopes | `grant_team_member_access`, `update_team_member_scopes`, `my_business_access_scope` | same | shipped |
| B-07 | Client guard | `BusinessAccessGuard` + `RequireScope` | `src/components/` | shipped, **defaulted open** (TMA-002) |
| B-08 | Client guard | `RequireOwner` split out of `RequireScope` | `src/components/RequireOwner.tsx` | shipped |
| B-09 | Switcher | delegated hats + realtime revoke self-heal | `useAccountOptions.ts` | shipped |
| B-10 | Console UX | `TeamConsoleBanner`, scope-aware nav/hub | `20260871`, console screens | shipped |
| B-11 | Delivery scope | `delivery` added to `Scope` + labels | `businessAccessService.ts` | **partial** (TMA-005) |

**What the build was missing that this document adds:** an explicit
owned-vs-delegated vocabulary (§3.3), the fail-closed invariant (I2), and a
reload-aware test matrix (§5). All three defects below are direct consequences
of those three gaps.

---

## 7. Findings tracker

Status: `open` → `planned` → `in-progress` → `fixed` · `wont-fix`

### TMA-001 — [bug/critical] A scoped team member became the owner after any reload — **fixed**

- **Reported as:** "one time user is in team and if they reload, full access of business will get to the team member"
- **Root cause:** `userService.owned()` merged `my_delegated_businesses()` output
  into `businessIds`. `BusinessAccessGuard` defines `isOwner` as
  `ownedBusinessIds.includes(id)` and short-circuits to `FULL_ACCESS`
  (`isOwner: true`, `hasScope: () => true`) — so every scoped grantee was
  promoted to owner as soon as that list hydrated.
- **Why only after a reload:** the grant/switch path reaches the console before
  `owned()` is re-fetched, so the array is still empty and the guard correctly
  takes the `checkAccess` → `myScope` path. `refreshUser()` on the next load
  populates it, and the guard never asks again.
- **Blast radius (client):** every `RequireOwner` route — settings, payments,
  verification, profile editor, broadcast, reviews, community — plus every
  `RequireScope` section, plus `consoleMode: "owner"` (banner suppressed, so
  nothing on screen said "you're a team member").
- **Blast radius (data):** contained. RLS is scope-correct
  (`20260841`), and `grant_team_member_access` re-checks `owner_user_id`, so
  writes past the exposed UI fail server-side. `db-unverified`.
- **Collateral found while fixing:**
  - `store.tsx` `businessPasswordRequired` looped over the merged array, so a
    delegated business's real (owner-set) password requirement was overwritten
    with the *delegate's own* flag — a team member with no business password
    walked straight past the gate.
  - `PinGateSheet` offered **"forgot business password" recovery** on a business
    the user doesn't own.
  - `Profile` showed and shared someone else's business as the user's own.
  - `SecuritySettings` exposed business-password settings to delegates.
- **Fix:** `owned()` now returns `businessIds` (owned only) and
  `delegatedBusinessIds` separately; the store derives `manageableBusinessIds`
  for the "can open" question. Each call site was re-pointed per the §3.3 table.
  The four collateral bugs are fixed by the split itself.
- **Evidence:** `src/services/core/userService.ts:162`, `src/store.tsx:266`,
  `src/components/BusinessAccessGuard.tsx:48`
- **Status:** fixed · **Regression guard:** §5, reload row

### TMA-002 — [bug/major] `useBusinessAccess()` defaulted to full access — **fixed**

- `createContext(FULL_ACCESS)` meant any component reading the context outside
  `BusinessAccessGuard`'s provider — a route that forgot the guard, or a render
  during a route transition — behaved as if the viewer owned the business.
- **Fix:** default is now `NO_ACCESS` (deny-all). All 9 current consumers render
  inside the provider, so this is purely a fail-safe change.
- **Evidence:** `src/components/BusinessAccessGuard.tsx:31`
- **Status:** fixed

### TMA-003 — [bug/minor] Guard could strand on the loading skeleton — **fixed**

- A thrown rejection (not a returned Supabase error) from `myScope()` or
  `checkAccess()` skipped `.then` entirely, leaving `status` on `"checking"`
  forever with no retry affordance.
- **Fix:** `.catch(() => setStatus("retry"))` on both.
- **Status:** fixed

### TMA-004 — [gap/major] No test covers the reload path — **fixed**

- The defect class in TMA-001 is invisible to any test that grants access and
  asserts in the same session: the grant path reaches the console *before*
  `owned()` is refetched, so the escalation only appears on the next load.
- **Fix:** `src/services/core/userService.owned.test.ts` — 5 cases asserting on
  the shape of `owned()` itself rather than on a downstream screen, precisely
  because the bug is a hydration-order bug. Covers: a delegated id never
  appearing in `businessIds`; owned ids still present; a business that is both
  owned and delegated counting once as owned and never as delegated; both row
  shapes the RPC can return; and signed-out returning empty rather than throwing.
  Test 1 fails if the merge is ever reintroduced.
- **Also fixed to make this possible:** `vitest.config.ts` had **no `@` alias**,
  so any test importing a module that uses the path alias failed at collection.
  That is why the suite had only ever covered dependency-free helpers. Mirrored
  from `vite.config.ts`.
- **Status:** fixed · 5/5 pass

### TMA-005 — [doc-mismatch/major] The `delivery` scope can't actually be granted — **open**

- `Scope`, `SCOPE_LABELS`, `SCOPE_ORDER` and `useAccountOptions` all treat
  `delivery` as a grantable scope, and the comment in `businessAccessService.ts`
  claims "the DB grant whitelist + `has_business_scope` already accept it".
- `grant_team_member_access` whitelists only
  `('appointments','queue','catalog','leads')` — `delivery` is filtered out
  silently, so a grant that includes it succeeds while dropping it.
- Consequence: the Delivery hat can only ever appear via
  `countMyActiveDeliveries() > 0`, never from a standing grant.
  `RequireDeliveryAgent`'s `hasDeliveryScope` branch is dead code today.
- **Evidence:** `supabase/migrations/20260841_business_team_scopes.sql:415`,
  `src/services/marketplace/businessAccessService.ts:14`
- **Decision (D1):** standing delivery agents — widen the whitelist.
- **Fix — `20260874_delivery_scope_grantable.sql`:** `delivery` added to the
  whitelist in **both** `grant_team_member_access` and
  `update_team_member_scopes`. Widening only the grant would have let a delivery
  grant be created and then silently stripped on the owner's first scope edit.
- **No client change needed:** `BusinessAccess` already listed `delivery` in
  `ALL_SCOPES` and shipped a "Delivery rider" preset — the UI had been offering
  a scope the DB was discarding.
- **Verified live:** both function bodies now carry the widened whitelist.
- **Status:** fixed

### TMA-006 — [gap/minor] `manage` and `manage/business` have no route guard — **fixed (documented)**

- Both sit directly under `BusinessAccessGuard` with no `RequireScope`; they
  self-hide sections instead. That's defensible for hub screens, but it's an
  implicit contract — any widget added to either screen inherits "visible to
  every grantee" by default.
- **Fix:** the contract is now stated at the `useBusinessAccess()` call site in
  both `ManageDashboard.tsx` and `BusinessHub.tsx`, where anyone adding a
  section will actually read it. Deliberately *not* a `RequireAnyScope` wrapper:
  a zero-scope grantee can't exist today (both grant RPCs reject an empty scope
  array), so the wrapper would guard an unreachable state while adding a second
  place for the two screens' access rules to drift.
- **Revisit if** grants ever become creatable with no scopes.
- **Status:** fixed (documented)

### TMA-007 — [gap/minor] Grants have no audit trail — **open**

- Nothing records who granted/revoked what, when. `business_access_sessions`
  carries current state only, so an owner can't answer "who gave this person
  catalogue access last month".
- **Status:** open

---

## 8. Next

Only TMA-007 (grant audit trail) remains. Everything else in §7 is fixed.

### Superseded plan

1. TMA-005 — decide the `delivery` scope question (blocks the delivery tracker).
2. TMA-004 — reload regression test.
3. TMA-006 — hub-screen contract.
4. Re-run §5 end to end against a live DB and mark each DB row verified.
