# Business & Provider Pages — UX Redesign Plan

Companion to [`DESIGN_PRINCIPLES.md`](../DESIGN_PRINCIPLES.md). This doc is
exclusively about the **customer-facing Business and Provider pages** (plus the
owner-side buttons that feed them): what's wrong today, the reframe, the
out-of-the-box signature features, and a page-by-page blueprint with a phased
rollout.

---

## 1. What's wrong today (honest diagnosis)

1. **Repetitive anatomy.** Both pages are the same skeleton: hero → stat row →
   tab strip → lists of near-identical cards (menu cards, review cards, post
   cards, Q&A cards). Nothing tells the customer *what kind of place this is*.
2. **The 3 things a customer came to do are not privileged.** Call / Directions
   / Book–Message exist but visually compete with follow, vouch, share, tabs.
3. **Everything is static.** The page reads like a listing archive, not a live
   neighborhood place. Nothing changes between 9 AM and closing time.
4. **Decision info is scattered.** Price signals live in one tab, trust in
   another, availability in a third — the customer assembles it manually.

## 2. The reframe (the out-of-the-box core idea)

> **A business page is a LIVE STOREFRONT. A provider page is a PERSON YOU'RE
> ABOUT TO HIRE.** They must stop being two skins of the same profile template.

Organize both by the customer's jobs, in order, as **one scrolling spine**
(no more equal-weight tabs):

| Zone | Job | Business flavor | Provider flavor |
|---|---|---|---|
| ① Right Now | "Is it worth going/booking *now*?" | live pulse | availability heat |
| ② Decide | "Can I trust them, what does it cost?" | trust receipt + peek menu | work reel + instant estimate |
| ③ Act | "Do the thing" | action dock | action dock |
| ④ Explore | "Tell me more" | full menu/posts/reviews/map | portfolio/reviews/map |

---

## 3. Signature features (never-seen-elsewhere layer)

### 3.1 "Right Now" pulse strip  🔴 the headline invention
A slim, live, honest strip directly under the hero — the page's heartbeat:

```
🟢 Open · closes 9 PM  |  👥 3 in queue (~18 min)  |  🏷️ Today: 10% off cakes
```
- Data already exists: `queue_tokens` (realtime ✓), `hours` evaluator,
  `offers`. Zero new backend.
- Closed state flips it to forward-looking: `🌙 Opens 9 AM · Book tomorrow's
  first slot →` — a closed shop still converts.
- Provider version: `⚡ Free now` / `Next free: today 4 PM` from
  `generateWorkingSlots()` + `🔥 3 jobs completed this week`.

### 3.2 Action Dock (context-aware thumb bar)
One persistent bottom dock, max 3 actions, that **changes with state** — the
"important buttons" fix:

| State | Business dock | Provider dock |
|---|---|---|
| Open/free | Call · Directions · **Join queue / Book** | Message · **Book now** · Call |
| Busy | Call · Directions · **Join queue (#4)** | Message · **Book 4 PM slot** |
| Closed | Message · Directions · **Book tomorrow** | Message · **Request quote** |
| You have an active booking/deal | **View my booking** replaces Book | **View my deal** |

### 3.3 Ask Chips — kill the blank chat box
Under the dock trigger, 3 one-tap prefilled questions that open chat already
typed: business → *"Is ___ in stock?" / "Do you deliver to {my area}?" /
"Price for ___?"*; provider → *"Are you free today?" / "Rough cost for ___?" /
"Can you come to {my area}?"*. First message friction → zero. (Uses existing
`chatService.getOrCreate` + prefilled draft.)

### 3.4 Trust Receipt (one-glance credibility row)
Replace scattered badges with a single scannable receipt in zone ②:
`✓ Verified · ⭐ 4.6 (38) · 🤝 12 neighbor vouches · 🔁 buyers come back`.
Below it, **"Known for" chips** mined from review keywords ("honest pricing",
"on time") — reviews become skimmable in 2 seconds. New users show `🌱 New on
STRYT — be their first review` (per §4 of design principles: zero is not data).

### 3.5 Peek Menu / Instant Estimate (price up front)
- **Business:** top-3 catalog items with prices pinned in zone ② ("from ₹45").
  Full menu stays in Explore.
- **Provider:** an **Instant Estimate** mini-widget — pick a job chip + a size
  chip → `Est. ₹400–600 · confirmed after chat`. It's `startingPrice` +
  per-category multipliers; sets honest expectations and doubles as a quote CTA.

### 3.6 Visit Planner (business) / Availability Heat (provider)
- Business: `📊 Best time today: 4–6 PM (usually no queue)` — computed from
  historical `queue_tokens` timestamps. Nobody in hyperlocal does this.
- Provider: today's free slots as tappable pills right on the page
  (`10:30 · 12:00 · 16:00 →`); tapping one opens AppointmentSheet with that
  slot preselected.

### 3.7 Work Reel (provider hero)
Portfolio-first, full-bleed swipeable hero (stories-style) with the provider's
face/name/rating overlaid — you hire a *person and their work*, not a bio.
Before/after pairs get a slider. Falls back to avatar hero when no portfolio.

### 3.8 Location freshness (ties into today's fixes)
- Real **MiniMap** on both pages (✅ shipped) with one-tap Directions.
- `📍 Location updated 2h ago` timestamp chip; providers auto-sync coords on
  app open (✅ shipped), so the pin is honestly *where they are*.

### 3.9 Relationship memory
If you've dealt with this place before, the page says so up top:
`You booked here twice · Last: haircut, 12 May ⭐ you gave 5` + **Book again**
(one tap re-books the same thing). Data: `appointments`/`agreements` filtered
by both parties. Repeat business is the whole neighborhood game.

---

## 4. Page-by-page blueprint

### 4.1 Business page (top → bottom)
1. **Hero** (compact, 200px): cover, name+✓, category, story-ring avatar.
   Overflow menu holds share/report/follow (declutters hero).
2. **Right Now strip** (§3.1) — realtime.
3. **Trust Receipt** (§3.4) + "Known for" chips.
4. **Peek Menu** (§3.5): 3 items + `Full menu (24) →`.
5. **Offer card** (only when a live offer exists — never an empty shell).
6. **Relationship memory** (§3.9, only when history exists).
7. **Explore spine** with sticky chip-nav (`Menu · Posts · Reviews · Info`):
   full catalog, posts, reviews (+ Q&A merged under Info), **MiniMap + hours
   grid + address**.
8. **Action Dock** (§3.2) + **Ask Chips** (§3.3).

### 4.2 Provider page
1. **Work Reel hero** (§3.7) with name/rating/verified overlay.
2. **Right Now strip**: `⚡ Free now · responds ~10 min` / next slot.
3. **Trust Receipt** + skills chips (endorsement counts inline: `Plumbing ×8`).
4. **Instant Estimate** (§3.5).
5. **Availability Heat pills** (§3.6) → prefilled booking.
6. **Relationship memory** (`Hired twice · Book again`).
7. **Explore spine**: full portfolio grid, reviews, **MiniMap** + serves-radius.
8. **Action Dock** + **Ask Chips**.

### 4.3 Owner side — the missing "important buttons"
Top of ManageDashboard / ProviderDashboard, one tap each (these power the
customer-facing live layer):
- Business: **Open/Close queue** · **Post today's offer** · **Update location**
  · **Reply to questions (n)**.
- Provider: **⚡ I'm available now** (big toggle — feeds §3.1) · **Update my
  location** · **Add portfolio photo** · **Set today's slots**.

## 5. Rollout plan

| Phase | Ships | Effort | Needs backend? |
|---|---|---|---|
| **P0 (done today)** | MiniMap on both pages · location auto-refresh · dead-map placeholder removed | — | no |
| **P1 — Live layer** | Right Now strip · context-aware Action Dock · Ask Chips · Trust Receipt (existing fields) | ~2–3 focused sessions | no — all data exists |
| **P2 — Decide layer** | Peek Menu · Availability Heat pills · Instant Estimate · owner quick-buttons | ~2 sessions | tiny (estimate multipliers optional) |
| **P3 — Delight layer** | Work Reel + before/after · Visit Planner analytics · "Known for" review mining · Relationship memory | ~3 sessions | 1 small RPC for queue-history + review keywords |

Each phase must pass the Definition-of-Done checklist in
`DESIGN_PRINCIPLES.md` §9 (skeletons, revert-on-failure, realtime, privacy
gates, tsc/build/audit).

## 6. Success measures
- Time-to-first-action (page open → call/book/message) **< 8 s**.
- % of chats started via Ask Chips; % bookings via Heat pills / Book-again.
- Repeat-booking rate per business/provider (the Relationship-memory loop).
- Zero "is it open?" chats — the Right Now strip should answer it.
