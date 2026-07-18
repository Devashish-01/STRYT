# Business Role — Reorganization for Speed

> Implementation blueprint and shipped reorganization for making the **business** role
> faster to operate — the companion to [PROVIDER_DESIGN.md](PROVIDER_DESIGN.md). Goal: a shop owner opens
> the app and, in one screen and one tap, handles the thing that earns them money
> right now (accept a booking, call the next customer, confirm a payment, answer a
> question). Grounded in the current business console; every reference links to the
> file it came from.
>
> Compiled 2026-07-15 · scope: the full business experience (console + storefront).

---

## 1. Who the business is, and what they do all day

A STRYT business is a **physical storefront** (salon, clinic, café, repair shop…)
operating under its **real name** — no alias, like providers, but unlike a provider
it has **walk-in traffic, a catalog/menu, and staff**. Its jobs-to-be-done, ranked by
how often they happen:

| Rank | Job to be done | How often | Where it lives today |
|------|----------------|-----------|----------------------|
| 1 | **Run the live queue** (call next, serve, verify pay) | Constantly, for walk-in shops | Not in nav — dashboard rail/tile → `/queue` |
| 2 | **Respond to what needs action now** (accept booking, confirm payment, answer question, reply to review) | Every open | Scattered across 4 screens (see F2) |
| 3 | **See today’s bookings** | Every open | Two places (Inbox tab **and** Appointments) |
| 4 | **Toggle “open now”** | Daily | Dashboard card |
| 5 | **Keep the storefront current** (menu, photos, hours, stock) | Weekly | 4 separate tiles |
| 6 | **Confirm payments / see what’s owed** | Daily | Buried per-card in Inbox / Queue |
| 7 | **Grow** (promote, loyalty, community, requests) | Weekly | Scattered tiles; Promote hidden |

**The design principle** (same as the provider): put the daily drivers (1–4) one tap
away, make the “needs a response” items a single triage feed, and fold the long tail
into an organized hub instead of a 12-tile launcher.

---

## 2. Current information architecture (what exists)

**Bottom nav** ([ManageNav.tsx:8-15](src/screens/business/manage/ManageNav.tsx#L8-L15)):
`Home · Catalog · Inbox · Appointments · Settings` (Promote is temporarily hidden).

**Home / dashboard** ([ManageDashboard.tsx](src/screens/business/manage/ManageDashboard.tsx)):
ambient header (weather, role switcher, notifications, **messages** → `/chats?scope=BUSINESS`,
share, “View Shop”), an **availability toggle**, a **live-queue rail**, a **today’s-appointments
rail**, a **6-metric KPI grid**, an **“Action Needed”** card (Q&A + reviews, links out
only), and a **12-tile launcher** in 3 groups
([ManageDashboard.tsx:508-546](src/screens/business/manage/ManageDashboard.tsx#L508-L546)).

**Console routes** (from [CODEBASE_MAP.md](CODEBASE_MAP.md)): `catalog`, `portfolio`,
`profile`, `hours`, `photos`, `story`, `queue`, `loyalty`, `qna`, `reservations`
(stub), `appointments`, `inbox`, `promote` (hidden), `verify`, `settings`, `requests`,
`community`.

**The daily tools today:**
- **Queue** — a full live console: go-live toggle, avg service time, waiting/called/served
  columns, call-next / serve / verify-payment ([QueueManager.tsx](src/screens/business/manage/QueueManager.tsx)).
- **Inbox** — customer reachouts (calls/directions/questions as leads) **and** a second
  appointments tab with accept/decline ([LeadsInbox.tsx:64-182](src/screens/business/manage/LeadsInbox.tsx#L64-L182)).
- **Appointments** — the *full* booking console (Day view, walk-ins, blocks, payment
  confirm, cancel attribution) ([BusinessAppointments.tsx](src/screens/business/manage/BusinessAppointments.tsx)).
- **Q&A** ([QnaManager.tsx](src/screens/business/manage/QnaManager.tsx)) · **Reviews**
  ([ReviewsManager.tsx](src/screens/business/manage/ReviewsManager.tsx)) · **Requests**
  ([BusinessRequests.tsx](src/screens/business/manage/BusinessRequests.tsx)) · **Settings**
  (incl. **team/staff** members, [BusinessSettings.tsx:17-40](src/screens/business/manage/BusinessSettings.tsx#L17-L40)).

**Storefront** ([BusinessDetail.tsx](src/screens/business/BusinessDetail.tsx)) — what
customers see: cover, rating, open-now, call/directions/message, follow/notify, book,
live queue, tabs Menu/Posts/Work/About/Reviews.

---

## 3. What’s slowing the business down (friction map)

**F1 — The #1 daily tool (Queue) isn’t in the nav.** For a walk-in shop the live queue
is the whole job, yet it’s reachable only via a dashboard rail/tile
([ManageDashboard.tsx:393-422](src/screens/business/manage/ManageDashboard.tsx#L393-L422)),
not a bottom-nav slot.

**F2 — “Respond to a customer” is split across four screens.** Leads/reachouts live in
[LeadsInbox.tsx](src/screens/business/manage/LeadsInbox.tsx), chat messages in
`/chats?scope=BUSINESS` ([ManageDashboard.tsx:205](src/screens/business/manage/ManageDashboard.tsx#L205)),
questions in [QnaManager.tsx](src/screens/business/manage/QnaManager.tsx), and reviews
in [ReviewsManager.tsx](src/screens/business/manage/ReviewsManager.tsx). Nothing shows
“everything a customer is waiting on me for” in one place.

**F3 — Appointments are managed in two places.** The nav has **Inbox** (whose second
tab does basic accept/decline, [LeadsInbox.tsx:103-182](src/screens/business/manage/LeadsInbox.tsx#L103-L182))
**and** **Appointments** (the full console). Two nav destinations, overlapping jobs,
the lesser one shown first.

**F4 — Two navigation systems point at the same places.** The bottom nav has Catalog
and Appointments; the dashboard tile grid repeats Catalog, Appointments, plus 10 more
tiles ([ManageDashboard.tsx:513-544](src/screens/business/manage/ManageDashboard.tsx#L513-L544)).

**F5 — No money home.** Businesses confirm appointment payments
([BusinessAppointments.tsx](src/screens/business/manage/BusinessAppointments.tsx)) and
queue payments (`claimQueuePayment`/`confirmQueuePayment`) and set a UPI id, but there’s
no “what did I take today / what’s unpaid / confirm this payment” screen — it’s buried
per-card.

**F6 — “Action Needed” exists but only counts two things and links out.** The dashboard
card surfaces Q&A + review counts and navigates away
([ManageDashboard.tsx:488-506](src/screens/business/manage/ManageDashboard.tsx#L488-L506));
it can’t accept a booking, confirm a payment, or post an answer inline, and it ignores
pending bookings and payment claims entirely.

**F7 — Growth tools are scattered and half-hidden.** Promote is hidden from the nav
([ManageNav.tsx:12](src/screens/business/manage/ManageNav.tsx#L12)); Loyalty, Community,
Story, Requests are loose tiles with no grouping logic.

---

## 4. Proposed information architecture

Reassign the 5 nav slots to the 5 *modes* a shop owner is actually in, and make Home a
triage feed instead of a launcher.

**New bottom nav:**

```
┌─────────┬─────────┬────────────┬─────────┬───────────┐
│  Today  │  Queue  │  Bookings  │  Store  │  Business │
│ (triage)│ (live   │ (the       │ (menu / │  (hub:    │
│         │  walk-  │  appt      │ photos /│  money,   │
│         │  ins)   │  console)  │ hours + │  inbox,   │
│         │         │            │ preview)│  grow, …) │
└─────────┴─────────┴────────────┴─────────┴───────────┘
   home     the #1     merges the    the        the long
            walk-in    two appt      storefront tail, in
            tool       surfaces      customers  one place
                                     browse
```

| Nav | Absorbs today’s… | Backing services (mostly exist) |
|-----|------------------|--------------------------------|
| **Today** | dashboard triage + open-now toggle | `analytics`, `appointmentService.listForTarget`, `setAvailability`, `qna`, `reviews` |
| **Queue** | `/queue` console | `queueOwnerState`, `callNextToken`, `serveToken`, queue-payment verify |
| **Bookings** | Appointments **+** Inbox’s appointments tab (dedup) | `appointmentService.*`, `slotBlockService.*` |
| **Store** | Catalog + Photos + Hours + Portfolio + a public preview | `businessService` catalog/photos/hours/portfolio |
| **Business** (hub) | Money, Inbox/leads, Messages, Q&A, Reviews, Promote, Loyalty, Community, Requests, Verify, Team, Profile, Settings | existing services |

This puts Queue in the nav (F1), unifies the two appointment surfaces (F3), removes the
tile/nav duplication (F4), gives money a home inside the hub + a Today card (F5), and
organizes the long tail (F7).

**Queue-vs-Money nav tradeoff (call it out):** not every business runs a queue. Two
options — (a) keep **Queue** as a fixed slot (STRYT leans on live queue as a headline
feature) and surface Money as a Today card + hub section; or (b) make the 2nd slot
**adaptive**: Queue for shops that have ever opened one, else Orders/Money. Recommend
(a) for launch simplicity; note (b) as a fast follow.

---

## 5. The “Today” home — a triage feed (the core change)

Same pattern as the provider’s Today: answer *“what do I do right now?”* top-to-bottom,
most-urgent first, each item resolvable in one tap.

```
┌───────────────────────────────────────────┐
│  ☀️  Good morning, Sana Salon    🔔 ✉️ ⚙  │   ← streamlined header
│  Beauty & Spa · ⭐ 4.7 · ✓ Verified        │
├───────────────────────────────────────────┤
│  ⚡ OPEN NOW                  [ ●===  ON ]  │   ← job #4, primary
├───────────────────────────────────────────┤
│  👥 QUEUE — 4 waiting · now #12   Manage → │   ← job #1 snapshot
│     [ Call next ]                          │      one-tap from home
├───────────────────────────────────────────┤
│  ⚠ ACTION NEEDED (5)                        │   ← jobs #2 & #6
│  ┌───────────────────────────────────────┐ │
│  │ 📅 Priya — Today 3:00 PM · Haircut    │ │
│  │            [ Accept ]  [ Decline ]    │ │   ← inline
│  ├───────────────────────────────────────┤ │
│  │ 💳 Amit paid ₹800 — confirm receipt   │ │
│  │            [ Confirm ] [ Reject ]     │ │
│  ├───────────────────────────────────────┤ │
│  │ ❓ 2 unanswered questions   Answer →   │ │
│  │ ⭐ 1 new review to reply    Reply →    │ │
│  └───────────────────────────────────────┘ │
├───────────────────────────────────────────┤
│  🗓 TODAY’S BOOKINGS            View all →  │   ← job #3
│   Next ▸ 3:00 PM  Priya · Haircut          │
├───────────────────────────────────────────┤
│  💰 TODAY        ₹4,200 taken · 2 to confirm│   → Money (in hub)
├───────────────────────────────────────────┤
│  🙋 3 nearby requests match you  Requests → │   → Business hub
├───────────────────────────────────────────┤
│  GROW  · Post update · Story · Share QR     │   ← only non-nav actions
│         · Promote · Get verified            │
└───────────────────────────────────────────┘
```

**Why this is faster:**
- **Queue is one tap and “Call next” is on the home screen** — the walk-in shop’s core
  loop no longer starts two taps deep. The live state is already computed on the
  dashboard ([ManageDashboard.tsx:85-88](src/screens/business/manage/ManageDashboard.tsx#L85-L88)).
- **Accept / Confirm-payment / Answer / Reply become one tap** in the Action Needed
  block. Every handler already exists — accept/decline in
  [LeadsInbox.tsx:46-59](src/screens/business/manage/LeadsInbox.tsx#L46-L59) and
  BusinessAppointments; answer in [QnaManager.tsx:49-54](src/screens/business/manage/QnaManager.tsx#L49-L54);
  reply in [ReviewsManager.tsx:73-80](src/screens/business/manage/ReviewsManager.tsx#L73-L80).
  This is re-surfacing, not new logic — and it folds F2’s four scattered inboxes into
  one triage list.
- **The 6-KPI vanity grid collapses to a “Today ₹ taken / to confirm” line** that links
  to Money — six metrics ([ManageDashboard.tsx:470-483](src/screens/business/manage/ManageDashboard.tsx#L470-L483))
  don’t help an owner *act*; one money line does.
- **The 12-tile launcher is deleted.** Non-nav actions (Post update, Story, Share QR,
  Promote, Get verified) become the small “Grow” row; everything else lives in the
  Store tab or the Business hub.

---

## 6. Screen-by-screen changes

### Queue (new nav slot)
Promote the existing [QueueManager.tsx](src/screens/business/manage/QueueManager.tsx) to
a top-level tab; badge the nav with `waiting` count. Add a “Call next” affordance to the
Today snapshot so the most common action doesn’t require opening the tab.

### Bookings (was Appointments + Inbox’s appt tab)
Route to the full [BusinessAppointments.tsx](src/screens/business/manage/BusinessAppointments.tsx)
console and **remove the duplicate appointments tab from LeadsInbox** (F3) — LeadsInbox
becomes pure “customer reachouts,” which moves into the Business hub’s Inbox.

### Store (was Catalog + Photos + Hours + Portfolio)
A storefront hub with a **public-page preview** at top (edit-and-see-what-customers-see,
closing the console↔storefront gap) and sections: Menu/Catalog, Photos, Hours, Portfolio.
Reuses the existing managers; adds nothing but a landing page + preview.

### Business (the hub — new)
One organized home for the long tail, grouped by intent:
- **Money** — today’s takings, unpaid list, confirm appointment **and** queue payments
  (`confirmQueuePayment`), UPI/QR + payment timing. **[NEW]** `businessService.takings()`
  (or derive client-side from paid appointments/queue tokens; business `analytics` has no
  earnings field today, [ManageDashboard.tsx](src/screens/business/manage/ManageDashboard.tsx)).
- **Inbox** — reachouts (leads) + chat messages + Q&A + reviews, grouped as “customer
  communication.”
- **Grow** — Promote (unhide it), Loyalty, Community, Find requests.
- **Business profile** — Edit profile, Team/staff ([BusinessSettings.tsx:17-40](src/screens/business/manage/BusinessSettings.tsx#L17-L40)),
  Verification, Settings & privacy.

---

## 7. Old → new mapping (nothing is lost)

| Today’s location | Moves to |
|------------------|----------|
| Dashboard availability card | **Today** (top) |
| Dashboard queue rail | **Today** snapshot + **Queue** tab |
| Dashboard appointments rail | **Today** timeline + **Bookings** |
| Dashboard KPI grid | collapsed to **Today** money line → **Money** |
| Dashboard “Action Needed” (Q&A + reviews) | **Today** triage (expanded: + bookings + payments) |
| Dashboard 12-tile grid | deleted; nav + Today “Grow” + Store hub replace it |
| Catalog (nav) | **Store → Menu** |
| Inbox → reachouts | **Business → Inbox** |
| Inbox → appointments tab | removed (dup) → **Bookings** |
| Appointments (nav) | **Bookings** |
| Queue | **Queue** (now a nav slot) |
| Photos / Hours / Portfolio | **Store** |
| Q&A / Reviews | **Business → Inbox** (+ Today triage) |
| Loyalty / Promote / Community / Requests | **Business → Grow** |
| Team / Verify / Profile / Settings | **Business → Business profile** |

---

## 8. Rollout — smallest set of changes for the biggest speed win

**Phase 1 (launch, highest ROI, mostly re-surfacing existing logic):**
1. Expand the dashboard **Action Needed** block to inline-handle pending bookings,
   payment claims, unanswered questions and new reviews (reuse existing handlers).
2. Add a **Queue snapshot with “Call next”** to the dashboard.
3. Collapse the KPI grid to a **Today money line**; delete tile-grid entries that
   duplicate the nav.

*This alone turns the top jobs from several taps to one, with no new backend.*

**Phase 2 (structural):**
4. New bottom nav `Today · Queue · Bookings · Store · Business`; promote Queue, unify
   the two appointment surfaces (remove LeadsInbox’s appt tab).
5. Build the **Store** hub (menu/photos/hours/portfolio + public preview) and the
   **Business** hub (money/inbox/grow/profile).
6. Build **Money** (confirm appointment + queue payments, unpaid, UPI setup).

**Phase 3 (polish / new endpoints):**
7. `businessService.takings()` ledger, adaptive Queue↔Orders nav slot, unified
   customer-communication inbox, storefront live preview.

---

## 9. Notes / non-goals

- **Identity:** businesses use their **real name** everywhere — the customer
  alias/`showNamePublicly` question does **not** apply here, so no name-visibility toggle.
- **Team/staff** is business-only (Manager/Staff, [BusinessSettings.tsx:17-40](src/screens/business/manage/BusinessSettings.tsx#L17-L40));
  it belongs under **Business → Business profile**, not a daily-driver slot.
- **Messaging** is already correctly scoped to `/chats?scope=BUSINESS&id=<id>`
  ([ManageDashboard.tsx:205](src/screens/business/manage/ManageDashboard.tsx#L205)); keep
  the Today header’s messages icon pointing there. App-wide chat fixes are in
  [GOAL_LIVE_AUDIT.md](GOAL_LIVE_AUDIT.md) §4/§9.
- **Consistency with the provider:** this mirrors the shipped provider reorg
  ([PROVIDER_DESIGN.md](PROVIDER_DESIGN.md)) — Today-as-triage, mode-based nav, a Money
  home, a public-preview profile/storefront — so both seller roles feel like one system.
- This document now describes the implemented launch-safe reorganization. The exact
  historical takings ledger and adaptive Queue↔Orders slot remain fast-follow backend work.

---

## Appendix — business files reviewed

Console: [ManageDashboard.tsx](src/screens/business/manage/ManageDashboard.tsx) ·
[ManageNav.tsx](src/screens/business/manage/ManageNav.tsx) ·
[LeadsInbox.tsx](src/screens/business/manage/LeadsInbox.tsx) ·
[BusinessAppointments.tsx](src/screens/business/manage/BusinessAppointments.tsx) ·
[QueueManager.tsx](src/screens/business/manage/QueueManager.tsx) ·
[BusinessRequests.tsx](src/screens/business/manage/BusinessRequests.tsx) ·
[QnaManager.tsx](src/screens/business/manage/QnaManager.tsx) ·
[ReviewsManager.tsx](src/screens/business/manage/ReviewsManager.tsx) ·
[BusinessSettings.tsx](src/screens/business/manage/BusinessSettings.tsx) ·
[CatalogManager.tsx](src/screens/business/manage/CatalogManager.tsx) ·
[HoursEditor.tsx](src/screens/business/manage/HoursEditor.tsx) ·
[ProfileEditor.tsx](src/screens/business/manage/ProfileEditor.tsx) ·
[BusinessPortfolio.tsx](src/screens/business/manage/BusinessPortfolio.tsx).
Storefront: [BusinessDetail.tsx](src/screens/business/BusinessDetail.tsx).
