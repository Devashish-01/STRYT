# STRYT — Codebase Review & Enhancement Ideas

**Date:** 2026-07-14 · **Type:** free-form review — code issues, robustness, a11y, i18n,
performance, and UI/UX + feature ideas. Separate from `SECURITY_AUDIT.md` (security) and
`PRODUCTION_READINESS.md` (launch blockers). **Nothing here blocks launch** — it's the
"make it genuinely great and maintainable" list.

Signals gathered across 229 source files, the live DB advisors, and the build.

---

## 🔧 Code quality & maintainability

### C-1 · No generated Supabase types → **159 `as any` casts**
Queries return `any`, so the compiler can't catch a renamed column or a wrong field. It's the
single biggest source of latent bugs and the reason so much code casts.
**Fix:** generate types (`supabase gen types typescript` / the MCP `generate_typescript_types`)
into `src/types/db.ts`, type the client `createClient<Database>(…)`, and delete casts
incrementally. Highest long-term ROI of anything in this doc.
**Status — deliberately NOT one-shotted:** flipping the global client to typed cascades
hundreds of latent type errors (strict `.insert()` shape checks against the real schema) and
would break the build. Correct execution is a dedicated pass: generate types → adopt file-by-
file → verify build at each step. Not safe as a single "no mistakes" change.

### C-2 · `key={index}` audit — ✅ **DONE (2026-07-14)**
Audited all 44 sites. **41 were already correct** — skeleton placeholders, decorative SVG,
fixed-count UI (progress bars, OTP boxes, star pickers), geocode dropdowns, and display-only
image/filename rows where index is the right key; changing them would be churn with nonzero
risk. **Fixed the 3 genuine ones** (real domain lists with stable ids): `Lists.tsx`
(`it.id`), `Community.tsx` + `CommunityPostDetail.tsx` (`rec.listingId`). tsc + build clean.
*(One residual: editable poll-option `string[]` in CommunityCompose would need a state-shape
refactor to key stably — left as a small follow-up, low impact at max 4 options.)*

### C-3 · A few very large files
`AdminPanel.tsx` (978), `Stories.tsx` (842), `businessService.ts` (802), `BusinessDetail.tsx`
(775), `Home.tsx` (723). Not broken, but hard to change safely.
**Fix:** split the god-screens into sub-components/hooks as you touch them (no big-bang refactor).
**Status — deliberately NOT one-shotted:** a behavior-preserving split of 978-line files with
no test coverage to verify against is exactly where silent regressions hide. Do it incrementally
when touching each screen, not as a risky bulk refactor.

### C-4 · Main JS chunk 844 kB → **197 kB** — ✅ **DONE (2026-07-14)**
Added a `manualChunks` (function form) in `vite.config.ts` splitting react / supabase /
leaflet / firebase / icons into independently-cached vendor chunks. The main app chunk (which
changes on every deploy) dropped **844 → 197 kB (–77%)**; heavy vendors (icons 328, firebase
223, supabase 212, react 170, map 155 kB) now cache across deploys, so a code change no longer
re-downloads them. Build clean, chunk-size warning gone. *(Further win available: `vendor-icons`
is 328 kB from shipping BOTH `@phosphor-icons/react` and `lucide-react` — consolidating to one
icon library would cut it substantially.)*

---

## 🛡️ Robustness & observability

### R-1 · Crash/error monitoring — ✅ **IMPLEMENTED (2026-07-14)**
Was invisible (ErrorBoundary only console.logged). Now wired end-to-end, zero third parties:
- **`src/lib/monitoring.ts`** — global `window.error` + `unhandledrejection` handlers, a
  `captureException()` seam, breadcrumbs, per-session dedupe, and a 12/min rate limit. Bullet-
  proof: never throws, swallows sink failures, skips resource-load noise.
- **Sink:** the `client_errors` table (migration `20260820`, applied + verified live) —
  authenticated insert-own (`user_id` stamped from the JWT, unspoofable), admin-only read.
- **Wiring:** `initMonitoring()` first thing in `main.tsx`; `ErrorBoundary.componentDidCatch`
  reports React crashes with the component stack.
- **APM seam:** drop `Sentry.captureException` into `monitoring.ts` `report()` later — every
  error already funnels through one place.
Admins can read crashes with `select * from client_errors order by created_at desc`.

### R-2 · Error-path consistency — ✅ **global safety net implemented**; per-call-site pass remains
The biggest gap (silently-swallowed async failures) is now closed globally: every unhandled
promise rejection is captured + logged by the monitoring layer above. A finer per-write-path
toast pass (ensure every failed *write* shows a toast, every failed *read* a retry/empty state)
is a broader UX task left as follow-up — deliberately not force-changed across ~20 services in
one pass to avoid regressions.

### R-3 · PostgREST `.or()` injection surface — ✅ clean (no action)
Audited all 8 `.or(\`…\`)` call sites: the `${uid}` ones use server-derived UUIDs (safe), and
the two search ones (`discoveryService.ts:177-178`) use the sanitized `term`. No injection
risk. Noted here so it's not re-flagged.

---

## ♿ Accessibility (currently thin)

### A-1 · **41 `onClick` on `<div>`/`<span>`**
Not keyboard-focusable, no `role`, no Enter/Space handling — invisible to screen readers and
keyboard users.
**Fix:** use `<button>` (the app already has unstyled-button patterns) or add
`role="button" tabIndex={0}` + key handlers.

### A-2 · Image alt coverage
164 image usages, only 36 `alt=`. `SafeImg` may default some, but decorative vs meaningful
images aren't distinguished.
**Fix:** meaningful images get real `alt`; decorative ones get `alt=""`. Audit `SafeImg` default.

### A-3 · Focus management on route change / sheets
Bottom-sheets and modals don't visibly trap/restore focus. Add focus trap + `Esc` to close +
return focus to the trigger. Improves keyboard and screen-reader UX across the many sheets
(Payment, Appointment, Review, QR, etc.).

---

## 🌍 Localization — the biggest missed opportunity

### L-1 · i18n exists but is **~99% unused**
`src/lib/i18n.tsx` ships `en` / `hi` / `mr` dictionaries and there's a language picker in
Settings — but only **13 `t()` calls exist in the entire app**. Virtually all UI text is
hardcoded English, so **switching to Hindi/Marathi changes almost nothing.** For a hyperlocal
India app whose users are exactly Hindi/Marathi speakers, this is both a broken-feeling setting
and a large growth lever.
**Fix (staged):** migrate high-traffic screens first (Home, Onboarding, Requests, Agreement,
Chat) to `t()`, expand the `hi`/`mr` dictionaries. Even the top ~150 strings would make the
app feel truly local. Consider a lint rule to flag new hardcoded JSX text.

---

## ⚡ Performance

### P-1 · **No list virtualization**
Zero `react-window`/`react-virtual`. Feeds, notifications, chat, leaderboard, and search render
every row. Fine at 75 users; janky once a feed has hundreds of items.
**Fix:** virtualize the long, unbounded lists (community feed, notifications, chat history).

### P-2 · DB performance (from the live advisor — 497 warnings)
- **173 × Auth RLS Init Plan** — policies call `auth.uid()` per-row; wrap as
  `(select auth.uid())` so it's evaluated once. Biggest DB win.
- **28 × unindexed foreign keys** — add covering indexes (slow joins/cascade deletes).
- **260 × multiple permissive policies**, 32 unused / 4 duplicate indexes — consolidate/prune.
Not blockers at current scale; do as one reviewed migration before a growth push.

---

## 🎨 UI/UX enhancements (free ideas)

**Already strong (keep it):** 213 skeleton usages (great loading coverage), pull-to-refresh,
an `EmptyState` component, offline banner, the ambient/"living" brand header, optimistic writes.

Ideas that would raise the feel:
- **U-1 · Trust surface on profiles** — response time ("usually replies in ~10 min"),
  completion rate, "member since", verified-badge prominence. Marketplaces live or die on trust
  signals; the data (ratings, agreements) already exists.
- **U-2 · Provider "available now" / presence** — a live green dot + "active today" using the
  existing `available_now` / view-log data. Drives the "call someone right now" use case.
- **U-3 · Reviews with photos** — let customers attach a photo to a rating (upload infra exists).
- **U-4 · Search filters & sort** — distance / rating / price / open-now chips on results;
  right now search is mostly a name match.
- **U-5 · Map marker clustering** — as listings grow, cluster nearby pins (Leaflet is already in).
- **U-6 · Richer notification preferences** — per-category toggles already partly exist; expose
  quiet-hours + per-type push cleanly.
- **U-7 · Skeleton → content shift polish** — a few screens pop layout on load; reserve space.
- **U-8 · Live-location (new feature) polish** — show ETA/distance on the recipient card, a
  "share expires in Xh" hint, and a one-tap "I've arrived / stop" — turns it from a raw pin into
  a Zomato-grade tracking card.

---

## 🚀 Feature ideas (bigger bets, freely)

- **F-1 · Referral / invite loop** — "invite a neighbor" with a deep link; the app is
  inherently viral (your street = your contacts). Cheapest growth lever.
- **F-2 · UPI payment auto-reconcile** — since payments are UPI-deeplink, add a lightweight
  "mark paid / confirm received" two-sided confirmation with a reference field (partly there via
  `PaymentStatusCard`) and a gentle nudge if one side hasn't confirmed.
- **F-3 · Saved-search alerts** — `saved_searches` is already surfaced (12 refs); make sure the
  push alert on new matching listings/requests actually fires (verify the cron/trigger).
- **F-4 · "Near me right now" street feed** — a time-boxed feed of what's happening on your
  street today (new spots, live queues, open requests) — leans into the brand.
- **F-5 · Business analytics** — views→leads→bookings funnel for owners (view-log data exists).
- **F-6 · Ratings-gated dispute/escrow** — if online payments ever return, the escrow model is
  half-built; otherwise lean fully into the reputation system.

---

## ✅ Prioritized quick wins (highest value / lowest risk first)

1. **Wire error monitoring** (R-1) — ~1 hr, makes prod failures visible. *Do this week.*
2. **Fix `key={index}`** (C-2) — mechanical, kills a class of subtle list bugs.
3. **Generate Supabase types** (C-1) — removes the `as any` debt, catches column bugs at compile.
4. **Localize the top ~150 strings to hi/mr** (L-1) — makes the language picker real; growth lever.
5. **DB perf migration** (P-2) — one reviewed migration; do before scaling.
6. **a11y pass** — buttons-not-divs + alt text (A-1/A-2).
7. **Trust signals on profiles** (U-1) — high conversion impact, data already exists.

**None of this blocks launch** — the app is functional and secure today. This is the roadmap
from "works" to "polished, localized, observable, and maintainable."
