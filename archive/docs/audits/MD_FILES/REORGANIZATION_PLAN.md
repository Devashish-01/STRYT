# STRYT — Codebase Reorganization Plan

> Planning only — nothing below has been executed. Written 2026-07-04 after
> actually walking the full tree (not guessing): file counts, line counts,
> `git status` on every "loose file" claim, and a diff of every duplicated
> doc. Supersedes/reconciles with `MD_FILES/code_organization_design.md`
> (dated 2026-06-30, predates this session's work) — see "Reconciling with
> the existing design doc" below before assuming that doc is still the plan.

## What's actually wrong, ranked by evidence, not aesthetics

Four **separate** problems got lumped under "reorganize the codebase" by the
time this was written. They have very different risk profiles — a plan that
treats them the same will spend the same care budget on renaming a folder as
on splitting `store.tsx`, which is backwards. 

| # | Problem | Risk to fix | Value |
|---|---|---|---|
| 1 | Repo-root & docs clutter | ~zero | Immediate clarity |
| 2 | `supabase/` dual structure (loose `.sql` + `migrations/`) | Low (docs/archival only) | **Highest** — this exact mess caused the `society_members` infinite-recursion bug and multiple "schema drift" incidents this session |
| 3 | `src/screens/` folder-naming collisions & leftover inconsistencies | Low | Real, but cosmetic |
| 4 | Large monolithic files (`store.tsx`, `MapView.tsx`, `types.ts`) | Medium–high | Real, but speculative until it's actually blocking someone |

Do them in that order. Problem 2 alone is worth more than the rest combined,
given it's the one that's already produced a live bug.

---

## Priority 0 — Repo-root & docs hygiene (do first, near-zero risk)

**`tsconfig.tsbuildinfo` is committed to git.** It's a TypeScript incremental-
build cache, regenerated on every `tsc` run, and is already the one file that
showed up as locally modified in `git status` during this investigation.
```bash
git rm --cached tsconfig.tsbuildinfo
echo "tsconfig.tsbuildinfo" >> .gitignore
```

**7 loose one-off scripts sit at the repo root**, tracked in git, inconsistent
naming (`check_providers.js`, `list_users.js`, `sync_null_providers.js`,
`temp-list-biz.js`, `test-supabase.js`, `test_update_alias.js`,
`supabase_mcp_wrapper.js`). These read like debugging/admin one-offs
accumulated over the project's history, not part of the app or its build.
Move them into a new `scripts/` folder. `temp-list-biz.js` in particular —
audit whether it's still needed at all before moving it; the name suggests
it wasn't meant to stick around.

**`MD_FILES/` duplicates 3 of the 5 root-level docs, one of them stale.**
Confirmed by diff:
- `MD_FILES/CODEBASE_MAP.md` — byte-identical to root. Delete the copy.
- `MD_FILES/TASKS.md` — byte-identical to root. Delete the copy.
- `MD_FILES/ISSUES.md` — **different, and stale** (timestamped 09:20 same day
  vs. root's most recent version with several more hours of fixes in it).
  Delete the copy — keeping a stale snapshot next to the live doc is actively
  misleading, worse than not having it.
- The remaining `MD_FILES/*.md` are feature-design docs (`account_deletion_flow_design.md`,
  `optional_onboarding_design.md`, `story_views_and_privacy_design.md`) and
  audit reports (`hardcoded_and_misconfigured_report.md`,
  `unimplemented_features_audit.md`, `code_organization_design.md`, and the
  `workflows/` pipeline reports) — all dated 2026-06-30/07-01, **before this
  session's audit work**. `hardcoded_and_misconfigured_report.md` and
  `unimplemented_features_audit.md` specifically look superseded by
  `ISSUES.md`'s `ISS-F11`/`ISS-F12` entries (same subject, done far more
  thoroughly with actual file:line references and verified fixes). Read each
  one once, confirm what's actually still open vs. already resolved, then
  either archive the resolved ones (`MD_FILES/archive/`) or delete them —
  don't leave completed audits sitting where they read as still-pending work.

Net effect of Priority 0: repo root goes from "5 docs + a mystery folder +
7 stray scripts" to "5 docs + `scripts/` + a couple of genuinely-still-open
design docs," with zero code risk since nothing here is imported by anything.

---

## Priority 1 — `supabase/` consolidation (highest value, low risk)

This is the one worth doing carefully, because it's the one that's already
bitten this project. The current state:

- `supabase/migrations/` — 19 properly dated, sequential files (`20260701_*`
  through `20260715_*`), everything from this session. This is the correct
  pattern and should be the **only** pattern going forward.
- `supabase/` root — **21 loose `.sql` files** with no dates and no
  guaranteed ordering: `schema.sql`, `rls.sql`, `seed_core.sql`,
  `seed_listings.sql`, `ratings.sql`, `functions.sql`, `migration_writes.sql`,
  `migration_launch_hardening.sql`, `migration_phase2_supply.sql`,
  `migration_chat_subject.sql`, and `migration_r3.sql` through
  `migration_r17_agreement_expiry.sql`.

The problem isn't that these files exist — it's that **nobody can tell by
reading the repo whether the live database still matches them.** This
session repeatedly found real, live objects (RLS policies, tables, triggers)
that existed in the actual Supabase project but were absent from *every* file
in this list — `request_me_toos`, the original `queue_tokens` policy, the
`society_members` recursive policy that caused a live outage, the `alias`
column, `show_*_publicly` columns. Every one of those was "schema drift":
something changed by hand in the Supabase dashboard/SQL editor at some point,
never captured anywhere in version control. The loose-file structure doesn't
cause drift by itself, but it makes drift **invisible** — there's no single
place to look and know "is this current?"

**Fix, in order:**
1. **Don't touch the loose files' content.** They're historical record of
   what *used* to be run, in what was probably something close to numeric
   order (`r3` → `r17`). Rewriting them risks losing the only trace of how
   the schema got to its current state.
2. **Rename the folder to make its status explicit**: `supabase/` root
   loose files → `supabase/legacy/` (or `supabase/history/`). This is a
   `git mv`, zero code impact — nothing in `src/` reads these files at
   runtime, they're SQL Editor artifacts.
3. **Generate one authoritative schema dump** from the live database
   (`supabase db dump` via the Supabase CLI, or pull it from the dashboard)
   and commit it as `supabase/schema_current.sql` — this becomes the single
   source of truth for "what does the live DB actually look like right now,"
   independent of which loose file or migration originally created any given
   piece of it. Regenerate this dump periodically (after a batch of
   migrations lands) rather than trying to keep it perfectly live.
4. **Going forward, `supabase/migrations/` is the only place schema changes
   get written**, already true in practice this session — this step just
   makes it official by moving everything that isn't that pattern out of the
   way.
5. Cross-check: run a "does every live table have a matching definition
   somewhere in `migrations/` or `schema_current.sql`" pass once, using the
   same technique from this session's launch-readiness check (query
   `information_schema` via the anon key / a real session, diff against
   tracked `create table` statements). This is genuinely worth doing once,
   not as part of this reorg specifically, but flagging it here since it's
   the natural next step after the folder is cleaned up.

---

## Priority 2 — `src/screens/` folder-naming fixes (low risk, few files)

Three concrete, evidence-based issues found by walking the actual tree:

**Three different folders are named "manage" at different depths:**
`screens/manage/` (just `ManageHub.tsx` — the top-level "pick which listing
to manage" screen), `screens/business/manage/` (18 files — the business
owner console), `screens/provider/manage/` (10 files — the provider owner
console). Functionally fine, but genuinely confusing to navigate or grep
("which `manage/`?"). Fix: `screens/manage/ManageHub.tsx` → flatten to
`screens/ManageHub.tsx` (it's a single file, doesn't need a folder, and
matches the pattern of every other top-level hub screen like `Home.tsx`/
`Explore.tsx` already sitting flat in `screens/`). Update the one `App.tsx`
lazy-import path. Done.

**`screens/monetization/` is a single-file folder for an already-shelved
feature.** `BusinessProUpgrade.tsx` is the only file in it, and its route was
removed from `App.tsx` this session (`ISS-F12` — the Razorpay Edge Functions
it depends on aren't configured). Every other shelved screen this session
found (`SocietyScreen`, `Wallet`, the subscriptions trio, `Neighborhood`,
`AvailableNow`, `LoyaltySetup`, `PhotosManager`, `StoryComposer`) already
lives in `screens/future-enhancement/`. Move this one there too for
consistency — it's in the exact same state as its neighbors.

**`screens/business/manage/Promote.tsx` was missed during this session's own
`future-enhancement/` move.** Confirmed dead (`ISS-F11`'s audit: no route in
`App.tsx`, no import anywhere, a comment in `ManageNav.tsx` explicitly says
"Promote temporarily hidden") — same status as `PhotosManager.tsx`/
`StoryComposer.tsx`/`LoyaltySetup.tsx`, which *did* get moved. This is this
session's own inconsistency; move it to `future-enhancement/` to match its
siblings.

All three are `git mv` + one import-path update each. Verify with
`npx tsc --noEmit` after each, not batched — these are cheap enough to do
one at a time and it makes any mistake trivial to isolate.

---

## Priority 3 — Split `types.ts` (676 lines), keep the import path stable

`types.ts` is one flat file holding every domain's types — `Business`/
`Provider`, `RequestPost`/`Proposal`/`Agreement`, chat types, social/
community types, admin/console types, all mixed together (it does have
section-header comments already, so the natural split points already exist
in the file). Splitting it is legitimate, but **every file in the app
imports from `@/types`** — this is the one place where a mechanical mistake
would be maximally disruptive, so the constraint that matters most is: don't
change the import path anywhere else in the codebase.

**Approach: split into `src/types/*.ts`, re-export everything from
`src/types/index.ts`.** Nothing outside `types/` changes — `@/types` keeps
resolving, because `index.ts` is what a bare directory import resolves to.

Proposed split, based on the file's own existing section comments:
- `types/marketplace.ts` — `Business`, `Provider`, `CatalogItem`, `Offer`,
  `PortfolioItem`, `Category`, `EntityStatus`, `VerificationStatus`, etc.
- `types/requests.ts` — `RequestPost`, `Proposal`, `Agreement`, `ProposalCounter`,
  related statuses.
- `types/social.ts` — the "SOCIAL + COMMUNITY LAYER" section (Story,
  Achievement, Vouch, Endorsement, LeaderEntry, etc.)
- `types/chat.ts` — `Conversation`, `Message`, `ChatSubject`.
- `types/user.ts` — `CurrentUser`, `PublicUser`, `Role`.
- `types/console.ts` — the "Console / management" section (admin/owner
  dashboard types).
- `types/index.ts` — `export * from "./marketplace"` etc., nothing else.

Verification: `npx tsc --noEmit` after the split must show **zero new
errors** — since every consumer still imports from `@/types`, any error here
means a type was missed in the barrel, not that a consumer needs updating.
That's a strong, cheap safety check for this specific refactor.

---

## Priority 4 — larger, higher-risk items: do these opportunistically, not as one pass

These are real, but the payoff is architectural cleanliness rather than
fixing something currently broken — treat each as its own isolated task with
its own testing pass, not a line item in a batch reorg.

### `store.tsx` (751 lines) — internal slice split, same public API
Currently one `AppProvider` + one `useApp()` hook backing everything: auth,
bookmarks, follows, lists, notifications, chat-unread, queues, endorsements,
vouches, coupons. Splitting the *state* into logical internal groupings
(auth, social, commerce, notifications) is reasonable — but **keep a single
`useApp()` as the public surface**. Every screen in the app calls `useApp()`
and destructures what it needs; introducing multiple new hooks
(`useAuthStore()`, `useSocialStore()`, etc.) means touching every one of
those call sites for a purely internal reorganization, which is the same
mechanical-risk problem as the full feature-based restructuring below — not
worth it unless a specific slice is causing a measured re-render problem.

### `MapView.tsx` (1053 lines, the largest file in the app)
Genuinely the best isolated-refactor candidate — it already has clearly
separable concerns: layer/marker rendering, the search box + geocoding,
radius controls, and the story-viewer integration. Split into a `MapView/`
folder with the main component plus 3-4 focused sub-components, following
this session's own established pattern of "cheap ways to verify without
guessing" (screenshot before/after via the Playwright technique used
earlier this session, since this is exactly the kind of visual-heavy screen
where a refactor can silently break rendering without a type error).

### `services/` grouping (25 flat files)
The prior design doc's `services/core/` `services/marketplace/`
`services/engagement/` split is reasonable *as an idea*, but only worth
doing with the same barrel-export discipline as the `types.ts` split above
— otherwise it's a large mechanical diff for a cosmetic win. If done, do it
file-by-file with `git mv` + a re-export shim, verified by `tsc` each time,
not as a single wholesale move.

---

## Reconciling with the existing design doc (`MD_FILES/code_organization_design.md`)

That doc (written 2026-06-30, before this session) proposed a full
**feature-based restructuring** of `src/` — `features/auth/`,
`features/booking/`, `features/map/`, etc., each with its own
`components/hooks/services/pages/store.ts`, plus a Zustand migration for
state and CSS Modules per feature. Worth being direct about which parts of
that survive contact with the actual codebase and which don't:

**Rejecting the full feature-based restructuring.** The core assumption —
that screens/services cleanly partition into independent business domains —
doesn't hold up against how this codebase actually works. `requestService`
alone is imported by `Home.tsx`, `MapView.tsx`, `Neighborhood.tsx`,
`CommunityHub.tsx`, `BusinessRequests.tsx`, `ProviderLeads.tsx`, and
`RequestDetail.tsx` — it doesn't belong to one feature, and forcing an
ownership decision either duplicates logic across features or produces
awkward cross-feature imports that defeat the stated purpose. A restructuring
at this scale means touching the import statements of essentially every file
in `src/` in one pass; this session found real regressions from moving *ten*
files into `future-enhancement/`. Doing this to ~150 files without the
ability to run the app end-to-end and visually verify each screen (a real,
demonstrated limitation this session — see `ISSUES.md`'s launch-readiness
entries) is not a responsible amount of risk for a purely organizational
change.

**Rejecting the Zustand migration.** This isn't a reorganization, it's a
state-management rewrite of a working, heavily-tested system, introducing a
new dependency to solve a re-render performance problem that hasn't actually
been measured or reported as a problem in this app. If `store.tsx`'s size
becomes a genuine pain point, the internal-slice-split approach in Priority
4 gets most of the maintainability benefit without the rewrite risk.

**Rejecting CSS Modules / splitting `index.css` per-feature.** This
codebase's actual styling pattern is centralized design tokens in
`index.css` (`.card`, `.row`, `.btn`, the color variables) plus heavy use of
inline `style={{}}` props for anything component-specific — confirmed by
reading dozens of screens this session. That's a legitimate, consistent
pattern already in use; fragmenting the shared tokens into per-feature CSS
Modules works against it rather than with it, and buys nothing given
components aren't fighting global class-name collisions today.

**Keeping, in modified form:** the `services/` grouping idea (Priority 4,
done with barrel exports instead of a hard cutover), and the general
instinct that `store.tsx` and `MapView.tsx` are too large (Priority 4, done
as isolated single-file refactors preserving their public interfaces rather
than as part of a directory-wide restructuring).

---

## Execution protocol, if any of this actually gets done

1. `git status` clean (or explicitly stash/commit first) before starting any
   phase — several of these are file moves, and moves on top of uncommitted
   work are how history gets lost.
2. One priority tier at a time, in the order above. Don't start Priority 2
   until Priority 0/1 are committed.
3. Within a tier, batch size scales inversely with risk: Priority 0/2 items
   can be done a few at a time; Priority 3 (`types.ts`) should be one
   complete split verified in isolation; Priority 4 items are each their own
   session.
4. `npx tsc --noEmit` and `npm run build` after every batch — this project's
   own established discipline all session, no exceptions.
5. Prefer `git mv` over delete+recreate for anything being relocated, so
   `git log --follow` still works on the file afterward.
6. For anything touching a screen a user actually looks at (Priority 4's
   `MapView.tsx` in particular), use the Playwright-screenshot technique
   from this session to visually confirm before/after rather than trusting
   "it compiles" — this project's own audit history is proof that "compiles
   clean" and "renders correctly" are not the same claim.
