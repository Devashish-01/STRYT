# Provider Role — Reorganization for Speed

> A design proposal (not code) for making the **provider** role faster to operate.
> Goal: a provider opens the app and, in one screen and one tap, handles the thing
> that earns them money today. Grounded in the current provider screens; every
> reference links to the file it came from.
>
> Compiled 2026-07-15 · scope: the full provider experience (console + public page).

---

## 1. Who the provider is, and what they do all day

A STRYT provider is an individual professional (electrician, tutor, beautician…)
operating under their **real name** (`displayName`) — no alias, unlike customers.
Their jobs-to-be-done, ranked by how often they happen:

| Rank | Job to be done | How often | Where it lives today |
|------|----------------|-----------|----------------------|
| 1 | **See what needs a response right now** (new booking to accept/decline) | Every open | Buried: Leads → Appointments chip → Upcoming |
| 2 | **See today’s schedule** | Every open | Dashboard rail + Leads → Appointments → Day view |
| 3 | **Toggle “available now”** | Daily | 2 places (dashboard card + Availability screen) |
| 4 | **Confirm a payment / see what’s unpaid** | Daily | Buried inside each appointment card in Leads |
| 5 | **Hunt for new work when idle** (open requests → send proposal) | When free | Leads → Open Requests chip |
| 6 | **Build trust** (portfolio, reviews, verification) | Weekly | Split across Portfolio / public page / a hidden Verify route |
| 7 | **Edit who I am** (bio, skills, price, hours, radius) | Rarely | Split across 3 screens (see §3) |

**The design principle:** put jobs 1–4 on the home screen as a *triage feed*, give
job 5 its own dedicated space, and consolidate 6–7 so they stop being scattered.

---

## 2. Current information architecture (what exists)

**Bottom nav** ([ProviderManageNav.tsx:21-27](src/screens/provider/manage/ProviderManageNav.tsx#L21-L27)):
`Home · Leads · Slots · Work · Settings`

**Home / dashboard** ([ProviderDashboard.tsx](src/screens/provider/manage/ProviderDashboard.tsx)):
ambient header (weather + role switcher + notifications + messages + share + “View
Public”), an **availability toggle card**, a **today’s-appointments rail**, **KPI
analytics** (views / leads / won / earnings / jobs / rating), and a **9-tile launcher
grid** ([ProviderDashboard.tsx:436-472](src/screens/provider/manage/ProviderDashboard.tsx#L436-L472)).

**Leads** ([ProviderLeads.tsx](src/screens/provider/manage/ProviderLeads.tsx)) — one
screen doing **three** unrelated jobs via a chip switcher
([ProviderLeads.tsx:361-371](src/screens/provider/manage/ProviderLeads.tsx#L361-L371)):
- *Open Requests* — prospecting + send proposal
- *Sent* — proposal tracking
- *Booked Appointments* — a full calendar console with **4 more inner tabs** (Day view
  / Upcoming / History / Cancelled, [ProviderLeads.tsx:418-421](src/screens/provider/manage/ProviderLeads.tsx#L418-L421)),
  accept/decline/cancel, payment verify, no-show, walk-in, block slots, copy-day-summary.

**Slots** ([ProviderAvailability.tsx](src/screens/provider/manage/ProviderAvailability.tsx)) —
instant “available now” toggle + duration slider, plus structured working hours
(days / from / to / slot length / max per day).

**Settings** ([ProviderSettings.tsx](src/screens/provider/manage/ProviderSettings.tsx)) —
notifications, **payments** (UPI id, custom QR, payment timing), contact & privacy
(email, show-phone/email/location), profile visibility, exit provider mode.

**Edit Profile** ([ProviderProfileEditor.tsx](src/screens/provider/manage/ProviderProfileEditor.tsx)) —
bio, skills, starting price, service radius, **and availability timing again**.

**Public page** ([ProviderDetail.tsx](src/screens/provider/ProviderDetail.tsx)) — the
conversion surface customers actually see: hero, availability, book/message/call,
follow/vouch/endorse, tabs About/Posts/Portfolio/Reviews.

---

## 3. What’s slowing the provider down (friction map)

**F1 — The most frequent job is the most buried.** Accepting a pending booking (job
#1) takes: open → *Leads* → *Booked Appointments* chip → *Upcoming/Today* → find card →
Accept modal → note → confirm. The provider dashboard has **no “action needed”
triage list** — even though the *business* dashboard does
([ManageDashboard.tsx:488-506](src/screens/business/manage/ManageDashboard.tsx#L488-L506)).

**F2 — Two navigation systems point at the same places.** The bottom nav already has
Leads / Slots / Work, and the dashboard tile grid repeats “Leads & Requests”,
“Availability Slots”, “Photo Portfolio”
([ProviderDashboard.tsx:445-456](src/screens/provider/manage/ProviderDashboard.tsx#L445-L456)).
Two paths to the same screen = decision overhead, not speed.

**F3 — “Leads” is three mental modes in one screen.** Hunting for work, tracking
proposals, and running today’s calendar are different headspaces
([ProviderLeads.tsx:28](src/screens/provider/manage/ProviderLeads.tsx#L28)). Bundling
them means the calendar (opened many times a day) sits behind a chip *and* behind the
proposal-hunting UI (opened occasionally).

**F4 — Working hours have two different editors.** The same `availabilityNote` string
is edited structurally in [ProviderAvailability.tsx:196-299](src/screens/provider/manage/ProviderAvailability.tsx#L196-L299)
**and** via `HoursSelector` in [ProviderProfileEditor.tsx:105-113](src/screens/provider/manage/ProviderProfileEditor.tsx#L105-L113).
Two UIs writing one field is a drift/confusion risk.

**F5 — Identity editing is split across 3 screens.** Bio/skills/price/radius live in
ProfileEditor; hours live in Availability; email/UPI/privacy/visibility live in
Settings. “Change my provider profile” has no single home.

**F6 — Money is scattered.** Earnings is one KPI number
([ProviderDashboard.tsx:410-414](src/screens/provider/manage/ProviderDashboard.tsx#L410-L414));
payment confirmation is a per-card action deep in Leads
([ProviderLeads.tsx:107-123](src/screens/provider/manage/ProviderLeads.tsx#L107-L123)).
There’s no “what’s unpaid / what did I earn” home, despite money being the point.

**F7 — Trust-building is hidden.** Verification is a thin, un-surfaced route; reviews
are only visible on the public page — the console can’t show or reply to them.

---

## 4. Proposed information architecture

Reassign the 5 nav slots to the 5 *modes* a provider is actually in, and make Home a
triage feed instead of a launcher.

**New bottom nav:**

```
┌─────────┬─────────┬────────────┬─────────┬──────────┐
│  Today  │  Jobs   │ Find work  │  Money  │ Profile  │
│ (triage)│(calendar│ (requests) │(earnings│ (identity│
│         │+bookings)│+proposals)│+unpaid) │ +public) │
└─────────┴─────────┴────────────┴─────────┴──────────┘
   home      the        prospect     new!      merges 3
             calendar    for work             old screens
             half of     half of
             old Leads   old Leads
```

| Nav | Absorbs today’s… | Backing services (mostly exist) |
|-----|------------------|--------------------------------|
| **Today** | dashboard triage + availability toggle | `analytics`, `appointmentService.listForTarget`, `setAvailability` |
| **Jobs** | Leads → *Booked Appointments* console (Day/Upcoming/History/Cancelled, walk-in, block) | `appointmentService.*`, `slotBlockService.*` |
| **Find work** | Leads → *Open Requests* + *Sent* | `requestService.feed`, `requestService.myProposals` |
| **Money** | earnings + payment claims + UPI setup | `analytics.earnings`, `appointmentService.confirmPayment/rejectPaymentClaim`; **[NEW]** `providerService.earningsLedger()` |
| **Profile** | ProfileEditor + Availability(hours) + Portfolio + Verification + Settings, with a public-page preview | `providerService.update`, `addPortfolio`, `submitVerification`, `profileControlService.setEnabled` |

This removes the tile-grid/nav duplication (F2), splits the three-headed Leads (F3),
gives money a home (F6), and folds the three identity editors into one Profile hub
(F4, F5, F7).

---

## 5. The “Today” home — a triage feed (the core change)

Instead of a launcher that repeats the nav, Today answers *“what do I do right now?”*
top-to-bottom, most-urgent first. One tap resolves each item.

```
┌───────────────────────────────────────────┐
│  ☀️  Good morning, Ravi        🔔  ✉️  ⚙   │   ← streamlined header
│  Electrician · ⭐ 4.8 · ✓ Verified         │
├───────────────────────────────────────────┤
│  ⚡ AVAILABLE NOW            [ ●===  ON ]   │   ← job #3, primary
│     Showing in “Free right now” · 2h left  │
├───────────────────────────────────────────┤
│  ⚠ ACTION NEEDED (3)                        │   ← NEW: jobs #1 & #4
│  ┌───────────────────────────────────────┐ │
│  │ 📅 Priya — Today 3:00 PM · AC service │ │
│  │           [ Accept ]   [ Decline ]    │ │   ← one-tap, inline
│  ├───────────────────────────────────────┤ │
│  │ 💳 Amit paid ₹800 — confirm receipt   │ │
│  │           [ Confirm ]   [ Reject ]    │ │
│  ├───────────────────────────────────────┤ │
│  │ 🔥 Boost expires in 20h · [ Renew ]   │ │
│  └───────────────────────────────────────┘ │
├───────────────────────────────────────────┤
│  🗓 TODAY’S TIMELINE            View all →  │   ← job #2
│   Next ▸ 3:00 PM  Priya · AC service       │
│         5:30 PM  Sana · Wiring check       │
├───────────────────────────────────────────┤
│  💰 THIS WEEK      ₹6,400 earned · 2 unpaid │   → Money
├───────────────────────────────────────────┤
│  🙋 5 open requests match you   Find work → │   → Find work (job #5)
├───────────────────────────────────────────┤
│  GROW  · Post update · Story · Share QR     │   ← only non-nav actions
│         · Get verified (if unverified)      │
└───────────────────────────────────────────┘
```

**Why this is faster:**
- **Accept/Decline and Confirm-payment move to one tap** on the home screen (today
  they’re 4–5 taps deep). The data already exists — `todayAppts` is computed on the
  dashboard already ([ProviderDashboard.tsx:68-75](src/screens/provider/manage/ProviderDashboard.tsx#L68-L75)),
  and the accept/decline/confirm handlers already exist in Leads
  ([ProviderLeads.tsx:87-123](src/screens/provider/manage/ProviderLeads.tsx#L87-L123)) — this
  is re-surfacing, not new logic.
- **Availability stays top** because presence is the provider’s main revenue lever;
  keep the instant toggle here and move *structured hours* to Profile (kills F4’s dual
  editor by making Today = presence, Profile = schedule).
- **The KPI grid becomes a single “This week” line** that links to Money — six vanity
  metrics ([ProviderDashboard.tsx:400-430](src/screens/provider/manage/ProviderDashboard.tsx#L400-L430))
  don’t help a provider *act*; one earned/unpaid line does.
- **The launcher grid is deleted.** Anything worth a shortcut that isn’t in the nav
  (Post update, Story, Share QR, Get verified) becomes the small “Grow” row.

---

## 6. Screen-by-screen changes

### Jobs (was Leads → Booked Appointments)
Promote the calendar console to its own tab so the daily driver isn’t nested. Keep
Day view / Upcoming / History / Cancelled, walk-in, block-slot, copy-day-summary — all
already built ([ProviderLeads.tsx:415-503](src/screens/provider/manage/ProviderLeads.tsx#L415-L503)).
Default to **Day view** (today). Add a badge on the nav for pending count (already
computed at [ProviderManageNav.tsx:19](src/screens/provider/manage/ProviderManageNav.tsx#L19)).

### Find work (was Leads → Open Requests + Sent)
A focused prospecting space: matching open requests + your sent proposals with status.
Reuses `requestService.feed` filtered by category/radius
([ProviderLeads.tsx:34-42](src/screens/provider/manage/ProviderLeads.tsx#L34-L42)) and
`myProposals` ([ProviderLeads.tsx:30-33](src/screens/provider/manage/ProviderLeads.tsx#L30-L33)).
**[NEW, optional]** saved **quote templates** so a proposal is 2 taps, not a retype.

### Money (new)
- **This week / month earned** (from `analytics.earnings`, `jobsDone`).
- **Unpaid list** — appointments with `paymentStatus !== "PAID"`, each with Confirm/Reject
  (handlers exist, [ProviderLeads.tsx:107-123](src/screens/provider/manage/ProviderLeads.tsx#L107-L123)).
- **Payment setup** — UPI id + custom QR + payment timing, moved out of Settings
  ([ProviderSettings.tsx:156-227](src/screens/provider/manage/ProviderSettings.tsx#L156-L227)).
- **[NEW]** `providerService.earningsLedger()` for a dated history behind the totals.

### Profile (merges ProfileEditor + Availability-hours + Portfolio + Verification + Settings)
One hub with a **live preview of the public page** at top (so the provider edits and
sees what customers see, closing the console↔public gap). Sections:
1. **Identity** — photo, bio, skills, starting price, service radius
   ([ProviderProfileEditor.tsx](src/screens/provider/manage/ProviderProfileEditor.tsx)).
2. **Schedule** — the *one* structured working-hours editor
   ([ProviderAvailability.tsx:196-299](src/screens/provider/manage/ProviderAvailability.tsx#L196-L299)); remove the duplicate `HoursSelector` from Identity (fixes F4).
3. **Portfolio** — work photos ([ProviderPortfolio.tsx](src/screens/provider/manage/ProviderPortfolio.tsx)).
4. **Verification** — surface it here with a clear “Get the ✓ badge” CTA (fixes F7).
5. **Payments & privacy & visibility** — the rest of Settings.

---

## 7. Old → new mapping (nothing is lost)

| Today’s location | Moves to |
|------------------|----------|
| Dashboard availability card | **Today** (top) |
| Dashboard today’s rail | **Today** timeline + **Jobs** Day view |
| Dashboard KPI grid | collapsed to **Today** “This week” line → **Money** |
| Dashboard 9-tile grid | deleted; nav + Today “Grow” row replace it |
| Leads → Open Requests / Sent | **Find work** |
| Leads → Booked Appointments (+4 inner tabs) | **Jobs** |
| Slots (instant toggle) | **Today** |
| Slots (working hours) | **Profile → Schedule** |
| Edit Profile (bio/skills/price/radius) | **Profile → Identity** |
| Edit Profile (hours) | removed (dup) → **Profile → Schedule** |
| Settings (payments) | **Money** |
| Settings (privacy/visibility/notifs) | **Profile** |
| Work (portfolio) | **Profile → Portfolio** |
| Verify route | **Profile → Verification** |

---

## 8. Rollout — smallest set of changes for the biggest speed win

**Phase 1 (launch, highest ROI, mostly re-surfacing existing logic):**
1. Add the **Action Needed** triage block to the current dashboard with inline
   Accept / Decline / Confirm-payment (reuse existing handlers).
2. Collapse the KPI grid to one **This week** line.
3. Delete the tile-grid entries that duplicate the nav; keep only non-nav actions.

*This alone turns the #1 job from 5 taps to 1, with no new backend.*

**Phase 2 (structural):**
4. Split **Leads** into **Jobs** and **Find work**; update the bottom nav to
   `Today · Jobs · Find work · Money · Profile`.
5. Build **Money** (earnings + unpaid + payment setup relocated from Settings).
6. Merge the three identity editors into the **Profile** hub; remove the duplicate
   hours editor.

**Phase 3 (polish / new endpoints):**
7. `providerService.earningsLedger()`, quote templates, reviews-reply in the console,
   public-page live preview inside Profile.

---

## 9. Notes / non-goals

- **Identity:** providers use their **real** `displayName` everywhere — the
  customer alias/`showNamePublicly` question does **not** apply to this role, so no
  name-visibility toggle is needed here.
- **Messaging:** the provider inbox is already correctly scoped to
  `/chats?scope=PROVIDER&id=<id>` ([ProviderDashboard.tsx:177](src/screens/provider/manage/ProviderDashboard.tsx#L177));
  keep the Today header’s messages icon pointing there. (See the messaging fixes in
  [GOAL_LIVE_AUDIT.md](GOAL_LIVE_AUDIT.md) §4/§9 — they apply app-wide, not just here.)
- This document is **design only** — no code has been changed.

---

## Appendix — provider files reviewed

Console: [ProviderDashboard.tsx](src/screens/provider/manage/ProviderDashboard.tsx) ·
[ProviderManageNav.tsx](src/screens/provider/manage/ProviderManageNav.tsx) ·
[ProviderLeads.tsx](src/screens/provider/manage/ProviderLeads.tsx) ·
[ProviderAvailability.tsx](src/screens/provider/manage/ProviderAvailability.tsx) ·
[ProviderSettings.tsx](src/screens/provider/manage/ProviderSettings.tsx) ·
[ProviderProfileEditor.tsx](src/screens/provider/manage/ProviderProfileEditor.tsx) ·
[ProviderPortfolio.tsx](src/screens/provider/manage/ProviderPortfolio.tsx) ·
[ProviderVerification.tsx](src/screens/provider/manage/ProviderVerification.tsx).
Public: [ProviderDetail.tsx](src/screens/provider/ProviderDetail.tsx) ·
[ProviderOnboard.tsx](src/screens/provider/ProviderOnboard.tsx).
Service: [providerService.ts](src/services/marketplace/providerService.ts) ·
[appointmentService.ts](src/services/engagement/appointmentService.ts) ·
[requestService.ts](src/services/engagement/requestService.ts).
