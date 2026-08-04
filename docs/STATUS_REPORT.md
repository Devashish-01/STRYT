# STRYT — Founder Status Report

**Date:** 2026-08-04 · **Version:** 1.0.4 · **Stage:** pre-launch, engineering-complete-ish
**Prepared from:** live production database + repository state. Every number is measured, not estimated.

---

## 1. Where we actually are

**The app is built. It is not validated.**

The engineering is in decent shape — this week closed a privilege-escalation bug,
a production rate-limiting failure, a stale-deployment bug, and a database
performance problem that would have bitten hard at scale. The code is clean,
typed, tested where it matters, and deployed.

What hasn't happened is a real user doing a real transaction. That's the gap
between where you are and a launch.

> **One-line summary:** you have a broad, working product with almost no
> content, no revenue events, and no external users. The remaining risk is
> commercial, not technical.

---

## 2. The numbers

| Metric | Value | What it means |
|--------|-------|---------------|
| Registered users | **14** | 5 have a real name; 9 are placeholders |
| Live businesses | **3** | |
| Providers | **2** | |
| Catalogue items | **4** | Across 3 shops — **~1.3 items per shop** |
| Appointments | 9 (8 completed) | Almost certainly internal testing |
| Deliveries ever | **1** | |
| **Payments** | **0** | **The money loop has never run once** |
| Queue tokens | 9 | |
| Community posts | 2 | |
| Messages | 6 | |
| Team grants | 1 | |

### The two numbers that matter most

**0 payments.** Your revenue mechanic — UPI deep-link, deposits, payment timing,
settlement — has never executed end to end with real money. It is fully built
and entirely unproven.

**4 catalogue items.** The core promise is "discover shops on your street." Three
shops with one item each is not something a customer can shop from. Content is
the product here, and there isn't any yet.

---

## 3. What exists

99 routes. 329 source files. 128 database migrations.

| Area | State |
|------|-------|
| Customer: discovery, map, booking, queues, requests, chat, community, stories | Built |
| Business console: catalogue, queue, appointments, hours, payments, verification, team access | Built |
| Provider console | Built |
| Delivery: assignment, batched runs, handoff codes, live tracking, cancel | Built |
| Admin: verification queue, disputes, appeals, reports | Built |
| Payments (UPI deep-link) | Built, **never used** |
| Safety / live location sharing | Built |
| Android app + OTA updates | Built |

**Observation:** this is a very large surface for a pre-launch product. Nine
distinct areas, 99 routes, and 14 users. Most startups at this stage have a
tenth of this built and ten times the user feedback.

That's not necessarily wrong — but it means **your validated learning per line
of code is very low**, and it's the main strategic risk in this report.

---

## 4. What changed this cycle (22 commits, ~1 week)

**Security**
- **Critical:** scoped team members were silently promoted to owner on page reload — full access to settings, payments, verification. Fixed, with a regression test.
- Email addresses were rendering as display names (8 of 10 accounts) — a contact-detail leak to strangers. Fixed at source + backfilled.
- Removed an anonymous-callable path to authorization predicates; hardened the first-admin claim.

**Production failures fixed**
- **Geocoding was being rate-limited (HTTP 429).** One address lookup fired up to 7 requests with no caching; the location picker could fire ~28. Rewritten around Mapbox with a cache and a rate limiter.
- **Deployments weren't reaching users.** A service-worker misconfiguration meant new versions sat waiting indefinitely; people kept opening old builds.

**Product gaps closed**
- Delivery agents had **no way to report an undeliverable order**, and were then permanently stuck "on duty". Now fixed.
- Completed deliveries never closed their appointment.
- Business owners had no way to delete a business (now a safe soft-delete that preserves customer history).
- Map rebuilt: it now searches **where you're looking** rather than a fixed circle around your home address.

**Performance**
- 31 missing database indexes added; 188 security policies re-evaluating per row fixed; 36 redundant policies removed. This is the difference between fine at 10k rows and unusable at 500k.

---

## 5. Launch readiness

### Blocking

| # | Item | Owner |
|---|------|-------|
| 1 | **Play Console: background-location declaration + demo video** | You |
| 2 | Data safety form, content rating | You |
| 3 | **Legal docs need a public URL** (they exist only as files) | You |
| 4 | Confirm deploys reach users (deploy twice, check) | You |

### Not blocking, but should land first

- Admin review screen shows a reviewer only a name, category and photo — they cannot actually verify a business. (Found this week; fix is small.)
- Inventory screen is read-only despite being labelled for management.
- Database is in **Tokyo** serving **Indian** users — ~120–180 ms on every request.

### Done

Device testing and the security-header check are complete on your side. Code,
migrations and performance work are complete and deployed.

---

## 6. The three risks that actually matter

### Risk 1 — No supply. *(highest)*
3 shops, 4 items. A marketplace with no inventory has nothing to open with.
Customers who arrive to an empty app don't come back, and you only get one
first impression per user.
**This is a business-development problem, not an engineering one, and it is
currently the thing standing between you and a launch that works.**

### Risk 2 — The money loop is unproven.
Zero payments have ever been taken. Payment timing, deposits, UPI hand-off,
settlement and refunds are all built and all untested with real money. The first
time this runs should not be with a paying stranger.
**Do one real transaction, end to end, with your own money.**

### Risk 3 — Surface area vs. team size.
99 routes and 9 feature areas is a lot to keep correct. This week alone
uncovered a privilege escalation, a stuck-agent bug and a rate-limit failure —
all in *shipped* code. More surface means more of these.
**Consider what you would cut, or hide behind a flag, for launch.**

### Lower, but on the radar
- Google Play may reject the battery-optimisation permission (re-scoped this week to reduce that risk, but not eliminated).
- Two known scaling landmines: push notifications fire one HTTP request per row from inside the database, and delivery GPS writes go straight to the primary database. Both are fine now; both need work around 10k users.
- 6 test files for 329 source files. Regression safety is thin.

---

## 7. Infrastructure

| | |
|---|---|
| Database | Supabase Postgres 17, `ap-northeast-1` (**Tokyo**) |
| Web | Vercel |
| Mobile | Android, Capacitor, self-hosted OTA updates |
| Maps | Mapbox (with a free-tier fallback) |
| Push | Firebase Cloud Messaging |
| Payments | UPI deep-link (no gateway fees) |

Costs are near zero at this scale. The Tokyo region is the one infrastructure
decision that is actively wrong, and it gets more expensive to fix as you grow.

---

## 8. Decisions I need from you

| # | Decision | Why it's blocking |
|---|----------|-------------------|
| 1 | **Move the database to Mumbai?** | Every user request is ~120–180 ms slower than it should be. Migrating 14 users is a weekend; migrating 50,000 is an incident. |
| 2 | **Inventory: rename only, or add real stock editing?** | Currently labelled "Inventory" but cannot edit stock. |
| 3 | **What's the launch scope?** | Do all 9 areas ship, or do you launch narrow and expand? |
| 4 | **Who is onboarding the first 20 shops?** | Nothing else matters if this doesn't happen. |

---

## 9. Recommended next 30 days

**Weeks 1–2 — Supply, not code**
Onboard 15–20 real shops in one neighbourhood with real catalogues. This is the
single highest-value activity available and it needs almost nothing from
engineering.

**Week 2 — Prove the money loop**
One real booking, one real payment, one real settlement, with your own money.
Fix whatever it reveals.

**Week 3 — Play submission**
Declarations, data safety, legal URLs. Expect a review round-trip; the
background-location video is scrutinised by a human.

**Week 4 — Soft launch, one neighbourhood**
Small enough that problems are survivable, real enough that the feedback is
worth something.

**In parallel (engineering, low risk):** admin review fields, inventory editing,
Mumbai migration, remaining map polish.

---

## 10. The honest summary

You have built a genuinely capable product. The engineering quality is
reasonable and this week materially improved its security and reliability.

**But you are not blocked on engineering, and haven't been for a while.** You're
blocked on supply, on proving that anyone will pay, and on Play Store paperwork.
Adding more features right now would increase the surface you have to keep
correct without reducing any of the three risks above.

The most useful thing you could do this month involves no code at all: get 20
shops onto the platform with real catalogues, and put one real rupee through
the payment flow.

---

*Numbers pulled live from production on 2026-08-04. Engineering detail:
`docs/launch/ANDROID_LAUNCH_BLOCKERS.md`, `docs/engineering/SCALING_RUNBOOK.md`,
`docs/trackers/`.*
