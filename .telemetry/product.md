# Product: STRYT

**Last updated:** 2026-10-27
**Method:** codebase scan + conversation

## Product Identity
- **One-liner:** A neighbor posts "I need a plumber tomorrow" or books a haircut, nearby shops and freelancers reply with prices or open slots, and the job gets done and paid for — all within walking distance.
- **Category:** hyperlocal two-sided marketplace (community + local commerce), mobile-first
- **Product type:** hybrid — B2C on the demand side (neighbors browse, ask, book), B2B-lite on the supply side (businesses run storefronts, queues and staff from a console). Supply-side activity rolls up to a business or provider group.
- **Collaboration:** multiplayer — every core loop has two parties (customer ↔ business/provider), and businesses have team members working in the same console.

## Business Model
- **Monetization:** free — not monetizing yet (confirmed by the user).
- **Pricing tiers:** Business Pro plans are defined in code but not live: Basic (₹499 / 3 mo), Pro (₹999 / 6 mo), Premium (₹1999 / 12 mo), plus lead credit packs (10 for ₹199, 50 for ₹799). Treat these as future conversion events, not current revenue.
- **Billing integration:** none for the platform. The earlier Razorpay flow was removed. Customer-to-business payments go peer-to-peer over UPI deeplinks, and the payee verifies them in their console. STRYT does not take a cut.

## Tech Stack
- **Primary language:** TypeScript
- **Framework:** React 18 + Vite SPA (react-router-dom), shipped as a PWA and as native Android/iOS through Capacitor, with OTA updates via Capgo
- **Database:** PostgreSQL on Supabase (RLS-heavy; logic in SQL RPCs; Realtime subscriptions)
- **Background jobs:** Supabase Edge Functions (push sending, moderation, verification review, purge of deleted accounts and expired stories) plus SQL-side scheduled sweeps
- **HTTP client patterns:** supabase-js client (`from()`, `rpc()`, `functions.invoke`), plain `fetch` elsewhere
- **Module organization:** TS modules split by domain — `src/services/{core,engagement,marketplace}`, `src/screens` by role area, `src/features` for self-contained surfaces, `src/store` slices behind a single AppProvider

## Value Mapping

### Primary Value Action
**Deal completed** — a customer's need is fulfilled by a nearby business or provider: an agreement from a request is marked done, a booked appointment is completed, or a queue token is served. If this drops to zero, the street isn't trading and the product has failed.

### Core Features (directly deliver value)
1. **Service requests → proposals → agreements** — the marketplace loop. A neighbor broadcasts an ask within a radius, businesses and providers bid, both sides counter, a mutual 10-minute confirmation locks it in, and the work is tracked to completion and rated. This is the purest form of the value action.
2. **Appointments & bookings** — customers book slots or catalog items directly from a storefront or provider profile (one booking per day per target). This is the fastest path to a completed deal.
3. **Live queues** — customers join a business's walk-in queue remotely and are served in turn. "Right now" value for shops with footfall.
4. **Storefronts & provider profiles** — catalog, hours, portfolio, Q&A, ratings. This is the supply that makes requests and bookings possible.
5. **Delivery & live tracking** — business deliveries with riders, handoffs and shareable tracking links, which complete the deal for goods.

### Supporting Features (enable core actions)
1. **Discovery (map, search, categories, explore, Neighborhood Today)** — gets customers to a business, provider or request.
2. **Chat** — one-tap questions and negotiation between parties ahead of a deal.
3. **Trust layer (ratings, vouches, endorsements, verification, moderation, disputes/appeals)** — makes a stranger down the street safe to hire.
4. **Community (posts, comments, stories, polls, follows)** — keeps neighbors coming back between transactions and seeds requests.
5. **Phone OTP onboarding & hats** — one login that can switch between customer, business and provider contexts.
6. **Business team access** — named staff grants and shared shop/terminal logins, so staff can run the queue or deliveries.
7. **Engagement extras (loyalty stamps, bulk/group-buy deals, offers, recurring subscriptions, bookmarks/lists, leaderboard/achievements)** — drive repeat deals.
8. **Notifications (push via FCM/web push)** — tell supply about new nearby requests and tell demand about replies.
9. **Safety (SOS, emergency contacts, live location share)** — personal-safety features that build trust in the neighborhood.

## Entity Model

### Users
- **ID format:** text holding the Supabase Auth UUID (`auth.uid()::text`). Sign-in is phone OTP via Firebase, bridged to a Supabase session.
- **Roles:** `customer` (the default "hat"), `business_owner`, `provider`, `admin` — a single user can hold several and switch context. Businesses also have team roles: OWNER, MANAGER, STAFF, and delivery rider.
- **Multi-account:** yes. A user can own one or more businesses, run a provider profile, and be a team member at someone else's business, all on the same login.

### Accounts
STRYT has two kinds of supply-side account, and both are the group for tracking:
- **Business** — a physical shop, salon, clinic or restaurant with a storefront, catalog, queue, deliveries and staff. **ID format:** prefixed string `b_` + 32 hex chars (UUID with dashes stripped).
- **Provider** — an independent freelancer profile (plumber, tutor, photographer) with packages, availability slots and a portfolio. **ID format:** prefixed string `p_` + 32 hex chars.
- **Hierarchy:** flat. Each business or provider is a standalone group. A business has team members, but they are users with scoped access, not a sub-group.

Other prefixed IDs worth knowing for event context: requests `r_…`, appointments `apt_…`. Societies (housing complexes) exist as UUIDs, but by the user's decision they are user-level context, not a group.

## Group Hierarchy

```
Business (b_…)   |   Provider (p_…)
└── (flat — team members are users acting on the business)
```

| Group Type | Parent | Where Actions Happen |
|------------|--------|---------------------|
| business | none | Storefront management, catalog, queue serving, appointment verification, deliveries, proposals sent as the business, team access, verification |
| provider | none | Proposals sent as the provider, availability, packages, jobs, portfolio, verification |

**Default event level:** user. Customer-side actions (browse, request, book, join queue, rate) are user events. When the acting user is wearing a business or provider hat, events also carry that business/provider group.
**Admin actions at:** group level (business/provider settings, team access, verification) and a separate platform-admin context (moderation, disputes, verification review), which should be excluded from product metrics.

## Current State
- **Existing tracking:** first-party Supabase `events` table, fed by `src/lib/analytics.ts` — a small whitelisted set of funnel events (signup, request/proposal/booking/deal/review, share-link opens, phone-OTP funnel), PII-scrubbed and guest-capable. Marketplace liquidity (answer rate, time to first reply, disputes) comes from the `marketplace_health()` RPC over the real tables. Vercel Analytics and Speed Insights cover page views and performance. Sentry and a `client_errors` table cover errors. There are also view logs for businesses and providers.
- **Documentation:** partial. Design intent is documented inline in `analytics.ts` and its migrations. There is no standalone tracking plan.
- **Known issues:** not visible from code; needs user input. Structurally, the event whitelist is enforced by a DB CHECK constraint, so every new event needs a migration. Supply-side, community and retention behavior is mostly untracked client-side by design ("if the database can count it, don't track it").

## Integration Targets
| Destination | Purpose | Priority |
|-------------|---------|----------|
| Supabase `events` table + `marketplace_health()` RPC | Primary product analytics store: funnels, liquidity, deal completion | High |
| Vercel Analytics / Speed Insights | Web traffic and performance (already wired) | Low |
| Sentry + `client_errors` | Error monitoring, not product analytics | Out of scope |

Constraint to carry forward: the `events` table has a CHECK-constrained name whitelist and no external vendor, so event names must be stable and few. Variants belong in properties. Any new event costs a migration. Everything client-sent must pass the existing PII scrubber.

## Codebase Observations
- **Feature areas inferred:** onboarding/auth (phone OTP, multi-beat onboard, terms), home/explore/map/search, requests & proposals & agreements, appointments, queues, business console (catalog, hours, queue, deliveries, payments, team, verification, bulk deals, Q&A, reviews), provider console (availability, jobs, find-work, money, portfolio), chat, community & stories, delivery console & live tracking, safety hub, settings, admin panel (moderation, disputes, appeals, verification).
- **Entity model inferred:** users (multi-hat) → own/operate businesses and providers; businesses have team members and access sessions; customers interact with businesses/providers through requests, proposals, agreements, appointments, queue tokens, deliveries, payments and ratings; users also belong to societies and follow, vouch for and chat with one another.
