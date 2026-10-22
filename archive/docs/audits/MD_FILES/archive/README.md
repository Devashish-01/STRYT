# Archive

Design docs and audit reports from 2026-06-30 – 07-01, before this session's
work. Kept for historical record, not current status — checked against the
live codebase on 2026-07-04 before archiving:

- **`account_deletion_flow_design.md`** — implemented. Matches
  `profileControlService.ts`'s `requestDeletion`/`cancelDeletion`,
  `DeletionPending.tsx`, and the admin deletion queue.
- **`story_views_and_privacy_design.md`** — implemented. Matches
  `Stories.tsx`'s viewer tracking, `close_friends`/hidden-from visibility.
- **`unimplemented_features_audit.md`** — stale. Its central claim
  ("no database tables exist for appointments") predates the real
  DB-backed appointment console (`ISS-F04` in `ISSUES.md`). Superseded by
  `ISSUES.md`'s `ISS-F11`/`ISS-F12` audits, which are current and far more
  thorough.
- **`hardcoded_and_misconfigured_report.md`** — stale. Its main finding
  (hardcoded Pune fallback coordinates scattered across 6 files) no longer
  reproduces — every cited file now references `config.defaultLocation`.
- **`code_organization_design.md`** — superseded by
  `../../REORGANIZATION_PLAN.md`, which explicitly reconciles with this doc
  (keeps some ideas, rejects others, with reasoning).
- **`workflows/`** — predates the STRYT rebrand (still refers to the app as
  "Naya" throughout) and predates the real admin-auth rebuild (`ISS-F09`).
  Describes a system that no longer exists in this form.

`optional_onboarding_design.md` stayed in `MD_FILES/` (not archived) —
`src/lib/alias.ts`'s `generateAlias()` exists but has zero callers anywhere
in the app, meaning the backend piece this doc specs out was built but never
wired into an onboarding flow. Still genuinely open.
