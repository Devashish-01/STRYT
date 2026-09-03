# STRYT — Workflow Debug Scripts (Android launch pass)

**Purpose:** one file per major product flow, written as a literal step-by-step
script — screen → action → expected result — so anyone (not just someone who
knows the codebase) can walk the Android build end to end and know exactly
what "working" looks like at each step.

**How this differs from the other launch docs:**
- [`../MANUAL_TEST_PLAN.md`](../MANUAL_TEST_PLAN.md) is the terse P0/P1/P2
  checklist — one row per flow, sign-off table, regression-focused. Use it to
  *track* what's been run.
- **This folder** is the actual script for each row — what to tap, in what
  order, what you should see. Use it to *execute* the checklist.
- [`../PLAY_SUBMISSION_CHECKLIST.md`](../PLAY_SUBMISSION_CHECKLIST.md) is
  Play Console paperwork + security posture, not in-app flows.

Read a workflow file, do exactly what it says on the real device, mark each
step ✅/❌ inline or in the linked test-plan row. A ❌ needs the exact step
number, a screenshot, and the device model.

---

## Start here if you're short on time

1. **[16 — Business bulk-buying campaigns](16_business_bulk_buying_campaigns.md)**
   and **[06 — Customer bulk-buying campaigns](06_customer_bulk_buying_campaigns.md)**
   — the newest feature in the app (built 2–3 Sep 2026), has **never been run
   on a device or against a live database**, and the two migrations it needs
   (`20260900`, `20260901`) still need manual apply — check that first, or
   every step below "sign in" will 500.
2. Everything under **§1 of `MANUAL_TEST_PLAN.md`** — the standing regression
   list for this cycle's other fixes.
3. **[22 — Android platform checks](22_android_platform_checks.md)** —
   permissions, push, deep links, background/foreground, install.

---

## Test accounts

Same accounts as `MANUAL_TEST_PLAN.md` §"Test accounts to prepare" — reuse
them rather than creating new ones, so role-switching and team-access scripts
below already have what they need:

| # | Account | Purpose |
|---|---------|---------|
| A1 | Fresh phone number, never used | Sign-up, onboarding, first-run states |
| A2 | Business owner (owns 1 shop, package that sells countable units — a store/grocery type, not a salon) | Console, catalog, campaigns |
| A3 | Team member (SCOPED, appointments only) | Privilege-escalation regression |
| A4 | ⏸ Delivery agent — deferred for v1.0, skip | — |
| A5 | Provider | Provider console |
| A6 | Customer with bookings + history | Customer flows |
| A7 | Admin | Admin panel |

**A2 needs a package with `showCartStepper: true`** (see
`src/lib/businessPackages.ts`) or the bulk-buying toggle in the composer and
the "Bulk deals" tile in the Store hub simply won't appear — that's by
design (workflow 16 explains why), not a bug, but it'll look like one if A2
is a salon/clinic-type business.

## Devices

Minimum: one real Android phone (not emulator) + one browser at 360px width.
Add a low-end Android (Xiaomi/Oppo/Vivo) if you can — those are where
background work and battery managers misbehave first.

## Priority legend

- **P0** — launch blocker. Do not upload to Play with one of these failing.
- **P1** — fix before launch unless consciously accepted.
- **P2** — log it, ship, fix after.

---

## Index

| # | File | Covers |
|---|------|--------|
| 01 | [Auth & onboarding](01_auth_and_onboarding.md) | Phone/OTP, Google sign-in, terms, first-run, guest browsing |
| 02 | [Home, discovery, search, map](02_customer_discovery.md) | Home launchpad, Explore's 4 tabs, Search, Map, Categories |
| 03 | [Appointments / booking](03_customer_appointments_booking.md) | Book → pay → reschedule/cancel, queue, walk-in |
| 04 | [Requests, proposals, agreements](04_customer_requests_agreements.md) | Ask → quote → counter → accept → rate |
| 05 | [Community posts](05_customer_community_posts.md) | 6 post types, comments, stories, activity feed |
| 06 | [Customer: bulk-buying campaigns](06_customer_bulk_buying_campaigns.md) | **NEW** — pledge, deposit, claim pass |
| 07 | [Customer: legacy group buys](07_customer_group_buy_legacy.md) | Existing peer pools (creation now removed) |
| 08 | [Payments, wallet, loyalty](08_payments_wallet_loyalty.md) | UPI deep link, deposit claim/confirm, coupons, stamps |
| 09 | [Chat & notifications](09_chat_and_notifications.md) | 1:1 messages, push, in-app notification deep links |
| 10 | [Safety & live location](10_safety_and_live_location.md) | My People sharing, emergency contacts |
| 11 | [Profile, settings, account](11_profile_settings_account.md) | Edit profile, all 7 settings screens, deletion |
| 12 | [Roles & switching](12_roles_and_switching.md) | Customer/business/provider hats, console password gate |
| 13 | [Business onboarding & verification](13_business_onboarding_verification.md) | 4-step onboarding → admin review → live |
| 14 | [Business: catalog, store, inventory](14_business_catalog_store_inventory.md) | Add/edit items, photos, stock, portfolio, hours |
| 15 | [Business: appointments & queue](15_business_appointments_queue.md) | Accept/reject/complete bookings, queue console |
| 16 | [Business: bulk-buying campaigns](16_business_bulk_buying_campaigns.md) | **NEW** — create, roster, confirm deposits, close |
| 17 | [Business: team, leads, community](17_business_team_leads_community.md) | Grant/revoke access, Q&A, leads inbox, posting |
| 18 | [Business: settings, payments, profile](18_business_settings_payments_profile.md) | UPI setup, broadcast radius, delete business |
| 19 | [Provider onboarding & console](19_provider_onboarding_console.md) | Same shape as business, service-specific |
| 20 | [Delivery agent console](20_delivery_agent_console.md) | ⏸ Deferred for v1.0 — confirm it's unreachable |
| 21 | [Admin panel](21_admin_panel.md) | Verification queue, business approval, disputes |
| 22 | [Android platform checks](22_android_platform_checks.md) | Permissions, push, deep links, OTA, install |
| 23 | [Cross-cutting regression risks](23_cross_cutting_regression_risks.md) | This cycle's fixes — team access, delivery cancel, email leak, live-location explainer, battery prompt, map, deploy pipeline |

---

*Created 2026-09-03, alongside the business bulk-buying campaign rebuild
(Phases 0–5 of `indexed-nibbling-hearth` plan). Keep this index in sync when
a workflow file is added or renamed.*
