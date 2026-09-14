# P07 — End-to-end test suite on staging

**Who:** agent
**Size:** 4–6 sessions. 7.A infrastructure; 7.B critical journeys; 7.C–7.E remaining flows by domain.
**Depends on:** P06

## Goal
Every one of the 52 flows in `docs/gaps/MASTER_FLOW_AUDIT_TRACKER.md` has an automated browser test, run as real signed-in personas on staging. Multi-person flows (customer ↔ owner ↔ staff) are tested together.

## Why
- Only a view-only route audit exists today.
- Signed-in screens, and everything that writes, have never been tested automatically.
- Database checks can't see screen-level breakage.

## Preconditions
| Check | Command | Expected |
|---|---|---|
| Branch | `git switch -c phase/07-e2e origin/develop` | Switched |
| Staging seeded | `npm run seed:staging -- --reset` | Success |
| Personas sign in | P06 evidence | All personas |

## Read first
- `playwright.config.ts`, `tests/audit.spec.ts`, `tests/audit-helpers.ts`, `tests/routes.ts`, `tests/auth.setup.ts`
- `docs/gaps/MASTER_FLOW_AUDIT_TRACKER.md` (the 52 flows, their routes and personas)
- `docs/engineering/CODEBASE_MAP.md` §3 (routes)

## Rules for this suite
1. **Staging only.** A global setup must assert the app's Supabase URL contains the staging ref and **abort** otherwise.
2. **Deterministic data.** Reset and seed before the run. Tests create their own records with unique suffixes and never depend on execution order.
3. **No fixed sleeps.** Use Playwright auto-waiting and `expect.poll`. Use role, label and text locators; add `data-testid` only where no accessible locator exists.
4. **A failure caused by a real bug is not "fixed" in the test.** Mark it `test.fixme(true, '<GAP_LOG>:<ID> — <one line>')`, with a real gap id or a new `E2E-###` id recorded in the report for P08. Never weaken an assertion to go green.
5. **Flaky means broken.** A test that only passes on retry must be fixed before the phase is done.

## Steps

### 7.A — Infrastructure
1. Create `playwright.e2e.config.ts`:
   - `testDir: tests/e2e`;
   - `webServer` runs `npm run dev:staging` on a fixed port;
   - projects `mobile` (Pixel 7) and `desktop`;
   - `globalSetup` with the staging guard and `seed:staging -- --reset`;
   - `retries: 0` locally, `1` in CI, with retried tests reported.
2. `tests/e2e/fixtures/personas.ts`:
   - signs in each persona through the real `/auth/phone` → `/auth/otp` screens with the staging test OTP (read from `.env.staging`, never hardcoded);
   - saves `.auth/staging-<persona>.json`;
   - exposes `test.extend` fixtures `customer`, `owner`, `staffQueue`, `staffAppointments`, `provider`, `admin` (and `rider` if D2 ships delivery), each a `Page` in its own browser context.
3. `tests/e2e/fixtures/db.ts` (optional, staging only): read-only helper for asserting server state through the Management API with the staging ref. Guard it like the seed script.
4. Add scripts `"e2e": "playwright test -c playwright.e2e.config.ts"` and `"e2e:ui": "... --ui"`.
5. `.github/workflows/e2e.yml`:
   - `workflow_dispatch` and a nightly schedule, **not** on every PR at first;
   - uses repository secrets holding **staging-only** values;
   - uploads the HTML report and traces on failure.

   Owner creates the secrets; the agent lists their names.

### 7.B — Critical journeys (multi-persona, full depth)
6. One spec file per journey under `tests/e2e/critical/`, each asserting **both sides** of the interaction:

   | Spec | Journey |
   |---|---|
   | `customer-onboarding.spec.ts` | New phone → OTP → terms → onboarding beats → home |
   | `business-onboarding.spec.ts` | Owner creates a business → catalog item → hours → visible to customer in search/category |
   | `booking-accept.spec.ts` | Customer books → owner sees New + accepts → customer sees Confirmed notification + calendar action |
   | `booking-decline-reason.spec.ts` | Owner declines from notification with a reason → customer sees reason; blank reason → "Try another slot" |
   | `booking-reschedule-paid.spec.ts` | Paid booking rescheduled → payment preserved, original cancelled |
   | `booking-daily-limit.spec.ts` | 6th same-day booking refused with a clear message |
   | `queue.spec.ts` | Customer joins → guest sees correct "N ahead" → owner calls next → customer "your turn" → served → pay claim → owner confirms |
   | `request-proposal-agreement.spec.ts` | Customer asks → provider proposes → counter → accept → agreement → payment claim → confirm → rate |
   | `me-too-group-buy.spec.ts` | Two customers "me too" → target reached → both notified |
   | `bulk-deal.spec.ts` | Owner creates deal → customers pledge → deposit claim → confirm → unlock → claim pass |
   | `chat.spec.ts` | Customer ↔ owner messages, image, unread badge clears |
   | `team-access.spec.ts` | Owner grants `queue` scope → staff sees only the queue console; wrong-scope screens are blocked |
   | `ratings-reviews.spec.ts` | Customer rates → owner replies → customer sees reply |
   | `account-deletion.spec.ts` | Request deletion → deletion-pending screen → owned storefront hidden → cancel deletion restores it |
   | `admin-moderation.spec.ts` | Report content → admin resolves → audit entry exists |
   | `guest-wall.spec.ts` | Guest browses home/search/business → write action shows the sign-in wall → after sign-in returns to the intended action |

### 7.C–7.E — Every remaining flow
7. For each flow in the tracker without a critical spec, add `tests/e2e/<domain>/<flow-id>-<slug>.spec.ts` covering:
   - the screen loads for the right persona;
   - the flow's main action succeeds and persists after reload;
   - one error path, e.g. an invalid input or a permission refusal.

   Suggested sessions:
   - 7.C Domains 0–4;
   - 7.D Domains 5–8 (skip delivery runs if D2 defers them, but test that their routes are hidden);
   - 7.E Domains 9–11.
8. Write `tests/e2e/COVERAGE.md`: a table of all 52 flow ids → spec file(s) → persona(s) → status (`green` / `fixme <gap id>`).

### Finish
9. Run `npm run e2e` **three times in a row**. Paste the summary of each: passed, failed, fixme and flaky counts.
10. Trigger `e2e.yml` once (owner-confirmed) and paste the run result.
11. Commit (owner-confirmed); push; open a PR into `develop`.

## Verification
| Command | Expected |
|---|---|
| Staging guard | Running with production env aborts before any page loads (show output) |
| `npm run e2e` ×3 | 0 failed, 0 flaky; `fixme` count identical across runs |
| `tests/e2e/COVERAGE.md` | 52/52 flows mapped |
| `gh run list --workflow e2e.yml --limit 1` | success |
| `npm run verify` | exit 0 (the unit suite is unaffected) |

## Definition of Done
- [ ] Staging-guarded infrastructure with a persona sign-in through the real OTP screens.
- [ ] 16 critical multi-persona journeys.
- [ ] All 52 flows covered (COVERAGE.md).
- [ ] 3 consecutive green local runs; 1 green CI run.
- [ ] Every `fixme` names a gap id, and those ids are listed in the report for P08.

## Stop and ask if
- A flow's expected behaviour is unclear (it's a decision, not a guess).
- Staging behaves differently from production in a way that invalidates a test. Compare schema first.

## Checker checklist
- Run `npm run e2e` once yourself.
- Open 3 random critical specs: confirm they assert both personas' views and have no fixed `waitForTimeout`.
- Temporarily point the config at production env and confirm the guard aborts (don't let it run).
- Check that every `fixme` id exists in a gap log or the report's new-id list.
