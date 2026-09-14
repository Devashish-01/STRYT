# P08 — Gap ledger: verify every finding

**Who:** agent. **Read-only for app code**; no fixes in this phase.
**Size:** 13 sessions. 8.0 builds the ledger, then one session per domain (8.1–8.12).
**Depends on:** P07

## Goal
One authoritative, machine-checkable list of **every** known defect, each with a verified status and evidence:
- the 426 findings in the 52 gap logs;
- the W3 frontend items;
- `fixme` ids from P07.

P09 then fixes exactly what's really open.

## Why
- The gap logs list findings but don't track which are fixed.
- `DOMAIN_SPRINT_EXECUTION_PLAN.md` marks sprints 1–6 "Completed", yet the flow tracker still shows 46 flows 🟡.
- Past audits here were wrong in both directions: findings that weren't real, and "fixed" claims that weren't true.

## Preconditions
| Check | Command | Expected |
|---|---|---|
| Branch | `git switch -c phase/08-gap-ledger origin/develop` | Switched |
| E2E suite exists | `tests/e2e/COVERAGE.md` | 52 flows mapped |
| Staging seeded | `npm run seed:staging -- --reset` | Success |

## Read first
- `docs/gaps/MASTER_FLOW_AUDIT_TRACKER.md`, `docs/gaps/EXECUTION_PHASE_PLAN.md` ("Read this before trusting anything below"), `docs/gaps/DOMAIN_SPRINT_EXECUTION_PLAN.md`
- The P07 report (the list of `fixme` ids)
- For each session: every gap log in that domain, fully

## Status definitions (exactly one per row)
| Status | Meaning | Required evidence |
|---|---|---|
| `FIXED` | The defect described no longer happens | `file:line` of the fix **and** a test (unit, E2E or forced-rollback) that would fail if it came back; or, if no test is possible, the manual check performed. Include the commit sha when findable (`git log -S`). |
| `OPEN` | Reproduced, or current code clearly still has it | `file:line` showing the defect, plus reproduction steps or a failing test |
| `NOT_A_BUG` | The premise is false (the cited column doesn't exist, the behaviour is intended, etc.) | What was checked and why it's not a defect |
| `DECISION` | A product choice is needed | The exact question for the owner; add it to `DECISIONS.md` as D17+ |
| `DEFERRED` | Out of v1.0 scope **by an existing owner decision** (e.g. D2 delivery runs, D4 `#fff`) | The decision id |

## Steps

### 8.0 — Build the ledger (one session)
1. Write `scripts/gaps/build-ledger.mjs`. It parses the triage table of every `docs/gaps/*_GAP_LOG.md`, rows like `| **ID** | Title | 🔴 P0 | Impact |`, and writes `docs/gaps/GAP_LEDGER.csv` with columns:
   `gap_id, log_file, domain, flow_id, severity, title, status, evidence, commit, verified_by, verified_on, notes`.
   - `gap_id` = `<LOG_STEM>:<ID>`, unique;
   - `status` starts as `UNVERIFIED`;
   - the flow and domain come from the tracker's gap-log links.
2. Handle logs whose format differs: `COMMUNITY_POSTS_GAP_LOG.md` yields 0 rows from the table regex. Read it by hand and add its rows, noting how they were extracted.
3. Append rows for:
   - the P07 `fixme` ids (`E2E-###`);
   - the two W3 frontend items already fixed on 2026-09-13 (`W3-FE:CALENDAR_UID`, `W3-FE:DECLINE_NOTE`), with evidence commit `dabd033`;
   - the P04/P05 findings (status `FIXED`, with APPLY_LOG rows).
4. Write `scripts/gaps/ledger-summary.mjs`:
   - prints counts by status × severity × domain;
   - **exits non-zero** if any row other than `UNVERIFIED`/`OPEN` lacks evidence, if an id is duplicated, or if any `DEFERRED` row lacks a decision id.
5. Paste the summary. On 2026-09-13 the table regex counted 426 rows across 52 logs. Explain any difference.

### 8.1–8.12 — Verify one domain per session
| Session | Domain | Gap logs |
|---|---|---|
| 8.1 | 0 Onboarding & identity | CUSTOMER_ONBOARDING, BUSINESS_ONBOARDING, PROVIDER_ONBOARDING, GUEST_BROWSING |
| 8.2 | 1 Discovery & search | HOME_FEED, GLOBAL_SEARCH, INTERACTIVE_MAP, CATEGORY_DIRECTORY, USER_SUBMITTED_PLACES |
| 8.3 | 2 Booking & scheduling | APPOINTMENT_BOOKING, MY_APPOINTMENTS, BUSINESS_APPOINTMENTS, PROVIDER_JOBS, SLOT_BLOCKING |
| 8.4 | 3 Queue | CUSTOMER_QUEUE, MERCHANT_QUEUE |
| 8.5 | 4 Requests & agreements | ASK_REQUEST_CREATION, SELLER_PROPOSALS, AGREEMENT_NEGOTIATION |
| 8.6 | 5 Delivery + 6 Chat | MERCHANT_DELIVERY_DISPATCH, DELIVERY_RIDER_CONSOLE, CUSTOMER_DELIVERY_TRACKING, CHAT_MESSAGING |
| 8.7 | 7a Merchant console | TEAM_ACCESS, CATALOG_MANAGEMENT, STORE_HOURS, BULK_DEALS, INVENTORY_ALERTS |
| 8.8 | 7b Merchant console | STOREFRONT_BRANDING, BUSINESS_PORTFOLIO, STOREFRONT_QNA, BROADCAST_RADIUS, BUSINESS_VERIFICATION |
| 8.9 | 8 Provider console | PROVIDER_CATALOG, PROVIDER_AVAILABILITY, PROVIDER_PORTFOLIO, PROVIDER_LEADS, PROVIDER_MONEY, PROVIDER_VERIFICATION |
| 8.10 | 9 Community & trust | COMMUNITY_POSTS, CUSTOMER_RATINGS, REVIEWS_MANAGER, VOUCHES_TRUST, BOOKMARKS_LISTS |
| 8.11 | 10 Safety | EMERGENCY_CONTACTS, LOCATION_SHARING |
| 8.12 | 11 Account & platform | ROLE_SWITCHER, PROFILE_PRIVACY, NOTIFICATION_CENTER, SECURITY_SETTINGS, ACCOUNT_DELETION, ADMIN_MODERATION |

For every row in the session's domain:
6. Read the finding's **detailed analysis** section, not just the title.
7. Open the cited file at the cited place. Code has moved, so search by symbol, not by line number. Decide what the code does **now**.
8. If it involves the database, check the live catalog read-only, or with a forced-rollback test on production, or on staging.
9. Where the E2E suite covers the flow, run that spec and use its result as evidence. Where it doesn't, write steps a human could follow.
10. Set status, evidence, `verified_by` (model name), `verified_on` (UTC date). **Evidence is concrete:** `src/screens/MyAppointments.tsx:212 openRebook passes initialPartySize` — not "looks fixed".
11. At the end of the session:
    - run `node scripts/gaps/ledger-summary.mjs` (must exit 0) and paste the domain's counts;
    - in each gap log's triage table, append a status marker to the Title cell: `✅ FIXED`, `🔴 OPEN`, `⚪ NOT A BUG`, `❓ DECISION` or `⏸ DEFERRED`;
    - commit the session's rows (owner-confirmed).

### After 8.12
12. Update the dashboard in `MASTER_FLOW_AUDIT_TRACKER.md` with **real** numbers per domain: open P0/P1/P2/P3. Replace "Launch Readiness 🟢 100%" with the true open counts.
13. Add a banner to `DOMAIN_SPRINT_EXECUTION_PLAN.md` and `EXECUTION_PHASE_PLAN.md`: *"Superseded by `docs/gaps/GAP_LEDGER.csv` (P08). Statuses there are verified."*
14. Push; open a PR into `develop`.

## Verification
| Command | Expected |
|---|---|
| `node scripts/gaps/ledger-summary.mjs` | exit 0; 0 `UNVERIFIED` rows after 8.12 |
| `node -e "…count rows…"` vs sum of the triage tables | Numbers reconcile (explain differences) |
| Tracker dashboard | Matches the summary counts per domain |

## Definition of Done
- [ ] Every finding has a status; 0 `UNVERIFIED`.
- [ ] Every non-OPEN row has concrete evidence; the summary script enforces it.
- [ ] New decisions added to `DECISIONS.md` as D17+.
- [ ] Gap logs and tracker show real statuses.

## Stop and ask if
- More than ~40 rows in one session. Split it rather than rushing.
- A finding looks like an active data exposure. Report it immediately.

## Checker checklist
- Randomly sample **20% of the rows** per domain (at least 5). Re-verify each from scratch and compare. More than 1 wrong status in a sample fails that domain session.
- Re-run the summary script.
- Confirm no app code changed in this phase: `git diff --stat origin/develop...HEAD -- src supabase/migrations` is empty.
