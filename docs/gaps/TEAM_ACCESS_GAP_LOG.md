# Team & Access Flow — Bug & Gap Log

**Purpose:** Every real defect, missing control, and dead path found while
auditing the **Team & access** flow — `/account/business-access`,
`businessAccessService.ts`, `BusinessAccessGuard.tsx`, and the
`business_access_sessions` / `business_login_credentials` tables.

## What this flow is meant to do

Two separate ways for someone other than the owner to run a shop:

1. **Named grant** — the owner adds a person by mobile/email/username and picks
   what they can manage. Works today.
2. **Shared shop login** — the owner sets a login id and password (like a till
   login) that staff use to open the console, optionally needing the owner to
   approve each session. **Every part of this exists in the database and none of
   it is reachable from the app.**

## Triage

| Gap # | Title | Classification | Status |
| :--- | :--- | :--- | :--- |
| **#1** | Shop-login has no UI at all — 4 service methods, 0 callers | **Blocker** | Fixed |
| **#2** | Pending access requests can never be approved or denied | **Blocker** | Fixed |
| **#3** | Editing a full delegate silently demotes them to scoped | **Blocker** | Fixed |
| **#4** | Team notifications are typed `QUEUE_UPDATE` | **Blocker** | Fixed |
| **#5** | Session expiry is fetched and never shown | Ready-to-Use | Fixed |
| **#6** | Revoking access is a single unconfirmed tap | Ready-to-Use | Fixed |

**All 6 closed 2026-09-08.** One migration (`20260934`); everything else was
client-side, because the server side of this feature was already complete — it
simply had no front door.

---

## How to use this

- One entry per issue.
- **Status** is one of: `Open` · `Fixed` · `Won't fix` (with reason) · `By design` (with reason).
- Root cause cites the exact file/line/function/migration.

---

## #1 — The shared shop login has no interface anywhere in the app

**Status:** Fixed — 2026-09-08 (client only)

Both halves built; no backend work was needed, because the backend was never
the missing part.

**Owner side** — a "Shop login" section in the manage sheet: login id (with
`suggestLogin` and a copy button), password, "approve each sign-in", session
length, and an on/off switch. One detail that matters: `set_business_login`
keeps the existing hash when the password is blank — that's what lets an owner
change the session length without retyping it — but there is no existing hash
the first time, so a blank password on creation would produce a login nobody
could ever use. The form requires it on create and allows it blank thereafter.

**Staff side** — a new `/business-login` screen. Deliberately inside the authed
layout: `business_login_attempt` raises `UNAUTHENTICATED` without a session,
because staff sign in to STRYT as themselves first and this only decides which
shop they open. That is what keeps `grantee_user_id` a real person rather than a
shared account, which is the whole basis of the owner's roster and history — so
the copy says "on their own phone" rather than presenting it as a shared login.

An ACTIVE result switches context and goes straight to the console;
`refreshUser()` is awaited first, because the console's guard reads the
owned/delegated ids off the store and would otherwise bounce a grant made
seconds earlier. A PENDING result renders a "waiting for approval" state rather
than a toast — it's a state to sit in, not an event that just happened.

Entry point added to Team & access, which is already where "which shops can I
open" is answered but until now only answered it for people added by name.

**Status was:** Open  
**Area:** `src/services/marketplace/businessAccessService.ts:65-131`, `src/App.tsx:621`

**Root cause:** Counted callers across the whole `src/` tree:

| Method | Callers |
| :--- | :--- |
| `getConfig` | 0 |
| `suggestLogin` | 0 |
| `setLogin` | 0 |
| `login` | 0 |

The database side is complete and careful — `business_login_credentials` with a
bcrypt `password_hash`, `set_business_login` validating the login id shape,
`business_login_attempt` with a 5-attempt/15-minute lockout and a constant-time
dummy hash so a wrong id and a wrong password take the same time, `session_hours`
capped to 720, and `BUSINESS_ACCESS` notifications with display metadata.

None of it can be reached. The owner has no screen to set a login id or
password, and a staff member has no screen to enter one. `/account/business-access`
only offers the named-grant path.

**Fix direction:**
1. A "Shop login" section in the owner's manage sheet — id (with
   `suggestLogin`), password, require-approval, session length, enable/disable.
2. A staff login screen on its own route, calling `login`.

---

## #2 — A pending access request can never be approved or denied

**Status:** Fixed — 2026-09-08 (client only)

A "Waiting for your approval" section with Approve / Deny, wired to the
`decide()` that had never been called.

This is what made `require_approval` a trap: turning it on meant every sign-in
created a PENDING session that nothing in the app could act on, so it sat there
until it expired. The setting now has a UI (#1) *and* something to do.

**Status was:** Open  
**Area:** `src/screens/BusinessAccess.tsx:202-203`, `businessAccessService.ts:210-238`

**Root cause:** `decide()` and `sessionForPrompt()` have **zero callers**. In
`ManageSheet`, the two lists are:

```ts
const active  = (sessions ?? []).filter((s) => s.status === "ACTIVE");
const history = (sessions ?? []).filter((s) => ["REVOKED","EXPIRED","DENIED"].includes(s.status));
```

`PENDING` is in neither, so a waiting request is invisible as well as
unactionable.

This is what makes `require_approval` a trap rather than a feature: with it on,
`business_login_attempt` creates a PENDING session, and that session then sits
until it expires because nothing in the app can decide it.

**Fix direction:** A "Waiting for your approval" section with Approve / Deny,
wired to `decide()`.

---

## #3 — Editing a full delegate silently demotes them to scoped

**Status:** Fixed — 2026-09-08 (client only)

The scope editor no longer pre-fills a FULL grant with every scope ticked. It
opens **empty**, above an amber panel stating that saving removes their full
access and limits them to whatever is picked — and the button reads "Limit
access" rather than "Save".

The trap was that all-scopes-ticked read as "nothing to change", while
`update_team_member_scopes` hard-sets `access_level = 'SCOPED'`. Every scope
ticked is **not** equivalent to FULL: `has_business_scope` short-circuits on
FULL for *any* scope, including ones that don't exist yet, and
`has_business_access` — a separate function — gates owner-equivalent surfaces
that no scope grants. Cancelling now genuinely leaves the grant untouched.

**Status was:** Open  
**Area:** `src/screens/BusinessAccess.tsx:245-249, 325-327`, `update_team_member_scopes`

**Root cause:** The edit pencil is rendered on every active row, including
`accessLevel === "FULL"`. `startEdit` pre-fills it with `ALL_SCOPES`, which reads
as "everything is already on, nothing to change" — but `update_team_member_scopes`
opens with:

```sql
set access_level = 'SCOPED', scopes = v_scopes
```

So an owner who taps the pencil on a full delegate just to look, and saves, has
demoted them — with a toast that says "Access updated" and a row that now lists
five scopes. **All five scopes is not the same as FULL**: `has_business_scope`
short-circuits on `access_level = 'FULL'` for *any* scope, so FULL also covers
scopes that don't exist yet, and `has_business_access` (a different function)
gates owner-equivalent surfaces that no scope grants.

A privilege change should never be the accidental outcome of opening a viewer.

**Fix direction:** Don't offer the scope editor on a FULL grant. Offer an
explicit "change to limited access" that states what is being taken away.

---

## #4 — Team access notifications are typed `QUEUE_UPDATE`

**Status:** Fixed — 2026-09-08 (`20260934`)

All three RPCs repointed from `QUEUE_UPDATE` to `BUSINESS_ACCESS`. Only the
notification insert changed; the surrounding logic is reproduced verbatim from
the live definitions.

The visible symptom was a queue icon on an access notification. The one that
mattered is that `notification_preferences` keys off type — so anyone who had
muted queue updates was silently opted out of being told their access to a
business had been granted, changed or removed.

**Verified live** in a rolled-back transaction: grant, scope update and revoke
each emit `BUSINESS_ACCESS`, and no `QUEUE_UPDATE` rows remain for the fixture
business. Asserted without `set local role` on purpose — the notifications
belong to the grantee, not the owner making the call, so switching role would
have let RLS hide the very rows under test.

**Status was:** Open  
**Area:** `grant_team_member_access`, `update_team_member_scopes`, `revoke_business_session`

**Root cause:** All three insert with `type = 'QUEUE_UPDATE'`:

```sql
values (v_target, 'QUEUE_UPDATE', 'Team access granted', …)
```

`BUSINESS_ACCESS` is the correct type. It already exists in `NotificationType`,
already has an icon mapped in `Notifications.tsx`, and is what every older
migration in this area uses (`20260823`, `20260824`, `20260840`).

Two consequences: the notification renders with a queue icon and colour, and —
worse — `notification_preferences` keys off type, so someone who mutes queue
updates silently stops being told when their access to a business is granted,
changed or removed.

**Fix direction:** Repoint all three at `BUSINESS_ACCESS`.

---

## #5 — Session expiry is fetched and never shown

**Status:** Fixed — 2026-09-08 (client only)

`expiryLabel()` renders the remaining time on both the owner's roster and the
grantee's own list — "Ends in 40 min", "Ends in 6 hr", "Ends 12 Sep". A null
`expiresAt` still renders nothing, which is correct: a named grant genuinely
doesn't expire, and inventing a label for it would be worse than silence.

**Status was:** Open  
**Area:** `src/screens/BusinessAccess.tsx:317-329`, `businessAccessService.ts:180`

**Root cause:** `expiresAt` is selected, mapped onto `AccessSession`, and never
rendered. A grant approved through the login path expires after
`session_hours` (default 8), but the owner's roster shows it identically to a
permanent named grant. Neither side can tell a session that ends tonight from
one that doesn't end.

**Fix direction:** Show the expiry on both the owner's roster and the grantee's
own list.

---

## #6 — Revoking access is a single unconfirmed tap

**Status:** Fixed — 2026-09-08 (client only)

A confirmation sheet naming the person, stating that they lose access
immediately including anything they have open right now, and that re-adding
creates a new session rather than restoring this one.

**Status was:** Open  
**Area:** `src/screens/BusinessAccess.tsx:328`

**Root cause:** "Revoke" sits immediately beside the edit pencil and calls
`revoke()` directly. Cutting off a staff member mid-shift is not something to do
on a mis-tap, and there is no undo — re-granting creates a new session.

**Fix direction:** Confirm first, naming the person.
