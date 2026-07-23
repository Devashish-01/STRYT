# Task 8 — Alias-Name Privacy Model

## Goal
A user's **alias** is the only name shown publicly. Their **real name** is hidden
from other users, and is revealed ONLY to a business/provider they are actively
transacting with — i.e. while in that business's **queue** or during an
**appointment** — for the duration of that active relationship. After it ends,
the business reverts to seeing the alias.

## Current state (verified) — partially built
- `users.alias`, `users.show_name_publicly` columns exist.
- `aliasName({alias, name, showNamePublicly}, fallback)` helper resolves the
  display name.
- Queue: `queueOwnerState` shows the real `customer_name` while WAITING/CALLED,
  then reverts to `aliasName(...)` for SERVED history (privacy model already
  applied there — good reference implementation).
- `ownerVisibleCustomerName(apt)` in appointmentService: real name during active
  appointment, alias once terminal.

## Gaps to close / mature
1. **Default to alias everywhere public** — audit every place a user's name is
   rendered to *other users* (community posts, comments, reviews, followers,
   public profile, chat list) and ensure it uses `aliasName`, not raw `name`.
2. **Reveal only to the counterparty business/provider, only while active** —
   confirm queue (WAITING/CALLED) and appointment (non-terminal) reveal real
   name; everything else (including other customers) sees alias.
3. **Real name never leaks via API** — ensure list endpoints don't select `name`
   for public consumers where alias suffices (defense-in-depth; RLS/column
   choice).
4. **Alias generation** — every user has a stable alias; backfill any nulls;
   ensure onboarding sets one.
5. **Setting** — user can toggle `show_name_publicly` and edit alias.

## Steps
- [ ] Grep all renderers of user `name`; route public ones through `aliasName`.
- [ ] Verify queue + appointment reveal logic matches "active relationship only".
- [ ] Backfill aliases for users with null alias (additive migration).
- [ ] Ensure profile settings expose alias + show-name toggle.

## Risk
Medium — privacy correctness. Prefer over-hiding to over-exposing. Build-verify.
