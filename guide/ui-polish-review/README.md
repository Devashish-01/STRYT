# STRYT app UI/UX polish review

**Review date:** 17 November 2026
**Status:** Code changes for all 50 findings are present. Lint, 1,338 automated tests, and the production build pass; visual and device verification remains.
**Method:** Parallel code-level review of consumer, business/provider, account/flow/admin, and shared shell/design system. Every lazy screen import in `src/App.tsx` is represented: 104 unique imports, plus embedded screen helpers. Findings are tied to source lines. The review did not run authenticated journeys, device captures, or a competitor comparison.

This review uses the finish quality of established consumer apps as a benchmark for clarity, consistency, confidence and responsiveness. It does not propose copying any competitor's visual identity. The existing STRYT brand can remain distinct.

## Review documents

| Area | Scope | Findings |
| --- | --- | ---: |
| [Consumer screens](consumer.md) | Discovery, map, community, chat, profile, saved items | 14 |
| [Business and provider](business-provider.md) | Public detail, onboarding, management consoles | 14 |
| [Flows, settings and admin](flows-admin.md) | Auth, requests, delivery, safety, account, support, admin | 15 |
| [Shared shell and design system](shared-shell.md) | Routes, navigation, sheets, CSS, typography | 7 |

**Total:** 50 findings. Priority in the area documents is based on user impact; visual hypotheses are labelled. A screen with no promoted finding was inspected in source, not certified as visually polished.

## What to fix first

1. **Make data states truthful.** Payments and dashboards can show zero during failed or partial loads (BP-01–03); bookmarks and activity, categories, location-sharing settings, agreements, rating, admin queues and tracking show similar false empty or stuck states (C01–03, C09, F01–04, F07, F13–14). Give each required query distinct loading, error, empty and populated states, with retry and stale-data treatment where appropriate.
2. **Make actions and settings trustworthy.** Business/provider notification switches currently persist locally without live notification wiring (BP-04). Privacy and language preferences can appear saved after failed writes (BP-05, F06). Admin decisions and saved-search removal lack pending/failure handling (F03, C05); safety sharing can fail without clear feedback (F05). Add pending guards, explicit outcomes, rollback or refetch, and a decision about unavailable notification settings.
3. **Unify interaction foundations.** Create and management sheets need named dialog semantics, focus handling, Escape/native Back and focus restoration (S1–02, BP-08). Several icon controls, clickable containers, tabs and chips lack accessible names or state (C06–08, C10, C13–14, BP-06–07, BP-11–12, F12). Build shared primitives, then migrate screens in small batches.
4. **Refine hierarchy and navigation.** Fix desktop active state and route semantics (S3–05), increase key text and touch targets (S6, C07, C11, BP-09), and validate business console discoverability (BP-10). Resolve copy and formatting inconsistencies (F09–11, BP-14). Consolidate duplicated responsive trees and style patterns once behavior is sound (C12, S7).

## Proposed implementation sequence after approval

| Phase | Work | Review gate |
| --- | --- | --- |
| 1. Trust and recovery | Query-state handling on money, dashboard, map/search, saved/activity, location sharing, agreements/rating, admin; mutation pending/error feedback; privacy setting persistence. | Simulate slow, failed, empty and successful responses; verify no false zero/empty/saved state. |
| 2. Shared interactions | Accessible sheet/dialog, selectable chip, navigation and icon-button patterns; migrate priority flows and touch targets. | Keyboard, Escape, native Back, focus return and screen reader labels; 320px and increased text. |
| 3. Visual coherence | Consistent spacing, type, cards, status badges, loading/empty/error/success presentations, responsive content order; address business console navigation after task-flow validation. | Compare representative populated and edge states on small Android, larger phone and desktop; check real device safe areas. |
| 4. Final quality pass | Walk every route and role in the route inventory, compare before/after screenshots, run project verification and fix regressions. | `npm run verify` and focused end-to-end journeys for guest, customer, business, provider, delivery and admin where test accounts are available. |

## Implementation summary

All 50 findings across Consumer screens (C01–C14), Business and Provider screens (BP-01–BP-14), Flows, Settings, and Admin (F01–F15), and Shared Shell (S1–S7) have code changes. Automated checks passed; authenticated journeys and Android device behavior remain to be checked during closed testing.

| Area | Scope | Findings | Status |
| --- | --- | ---: | --- |
| [Consumer screens](consumer.md) | Discovery, map, community, chat, profile, saved items | 14 | **14 / 14 Resolved** |
| [Business and provider](business-provider.md) | Public detail, onboarding, management consoles | 14 | **14 / 14 Resolved** |
| [Flows, settings and admin](flows-admin.md) | Auth, requests, delivery, safety, account, support, admin | 15 | **15 / 15 Resolved** |
| [Shared shell and design system](shared-shell.md) | Routes, navigation, sheets, CSS, typography | 7 | **7 / 7 Resolved** |

**Total:** 50 / 50 findings implemented.

## Approval boundary

The application source, shared components and closed-test checklist are included in the release commit. Local editor settings, Supabase CLI temp state, generated output and `shots/` remain outside that commit.
