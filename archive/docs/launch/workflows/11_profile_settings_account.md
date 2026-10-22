# 11 — Profile, Settings, Account

**Priority:** P1.
**Screens:** `Profile`, `ProfileEdit`, `PublicProfile`, `Bookmarks`,
`Followers`, `Lists`, `MyActivity`, `Achievements`, `AccountSettings` (hub) +
7 settings screens (`NotificationSettings`, `PrivacySettings`,
`DiscoverySettings`, `LanguageSettings`, `SecuritySettings`,
`LocationSettings`, `DataSettings`), `Support`, `BusinessAccess`.

## Flow A — Profile

| # | Step | Expected |
|---|------|----------|
| 1 | `/profile` | Tapping your own name/handle does **nothing** (not a jump to edit — this was a fixed UX regression) |
| 2 | "Edit profile" button specifically | Opens `ProfileEdit` |
| 3 | No business/provider yet | Two CTAs: "Create a business" and "Become a provider" |
| 4 | With an owned business | "Share my business" / management entry points present |
| 5 | `/u/:id` viewing **someone else's** profile | Public view only — no edit controls, alias-first identity (real name only inside an active relationship) |
| 6 | `/achievements` | Renders whatever badges/points exist without crashing on a zero-state |

## Flow B — Bookmarks, follows, lists

| # | Step | Expected |
|---|------|----------|
| 1 | `/bookmarks` | Saved items, removable |
| 2 | `/followers` | List renders |
| 3 | `/lists` with zero lists | Illustration + "Create your first list" (not blank) |
| 4 | Create a list, add an item to it | Works |
| 5 | Open an empty list | Illustration + "Explore nearby" |
| 6 | `/my-activity` | Archive of past actions renders |

## Flow C — Settings hub

| # | Step | Expected |
|---|------|----------|
| 1 | `/account` | All 7 rows present, each opens its own screen |
| 2 | `/settings` (old path) | Redirects to `/account` |
| 3 | Notification settings | Toggle categories persist |
| 4 | Privacy settings | Alias/real-name visibility controls work |
| 5 | Discovery settings | Radius/visibility controls persist |
| 6 | Language settings | Switching language actually changes UI strings app-wide (P2 in the base plan, but check at least once) |
| 7 | Security settings | Password/PIN management for owned businesses; **A3 (scoped team member) must NOT see a business-password section here at all** — privilege-escalation regression, see workflow 23 |
| 8 | Location settings | Manual area override works |
| 9 | Data settings | Export/delete-adjacent controls present and functional |

## Flow D — Business access (delegated logins)

| # | Step | Expected |
|---|------|----------|
| 1 | `/account/business-access` as an owner | See/manage every team grant across owned businesses |
| 2 | As a team member (A3) | Sees only what they've been granted, cannot see other businesses' access lists |

## Flow E — Support & account deletion

| # | Step | Expected |
|---|------|----------|
| 1 | `/support` | Submits a ticket |
| 2 | Request account deletion | Confirm flow, lands on `/auth/deletion-pending` |
| 3 | Public deletion page signed out | `https://stryt.in/legal/account-deletion` loads (200) |
| 4 | Trigger `purge-deleted-accounts` on a throwaway deleted account (backend check) | Row anonymised — this path has **never executed in production**, verify it actually works |
