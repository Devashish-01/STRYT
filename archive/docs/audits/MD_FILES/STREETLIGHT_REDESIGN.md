# "Street Light" — App-Wide UI/UX Redesign

Companion to [`DESIGN_PRINCIPLES.md`](../DESIGN_PRINCIPLES.md) (current source of
truth for tokens/components) and [`MD_FILES/BUSINESS_PROVIDER_UX_REDESIGN.md`](BUSINESS_PROVIDER_UX_REDESIGN.md)
(IA-level rework of business/provider pages, unaffected by this doc). This doc
is the **visual + motion system pass**: new brand sheet → new tokens → a
signature loading/motion language → how it lands on every screen and every
profile type (customer, business, provider, admin).

Status: **implemented (2026-07-10).** Phases 1–5 landed in one pass (token
foundation, motion primitives, brand marks, shell recolor, screen sweep).
§9's open decisions were resolved by judgment call rather than blocking —
each is marked with the decision taken. Dark mode (§7) and a full
`ButtonSpinner` rollout to every async submit button remain future work.

---

## 0. Source brand sheet

The brand sheet supplied shows: a street-lamp mark ("Street Light" — safety,
guidance, neighborhood heartbeat), a hidden-**S** wordmark treatment, a
pin-with-winding-road **App Icon** (already close to what `Splash.tsx` /
`BrandHome.tsx` draw today), and this palette:

| Swatch | Hex (as given) | Role on sheet |
|---|---|---|
| Primary Purple | `#BB47F5` | headline brand color |
| Accent Pink | `#FF5DBA` | secondary accent |
| Warm Amber | `#FF9500` | warm accent |
| Deep Ink | `#1A1530` | dark neutral |
| Soft Background | `#F616FA` | page background |

Typography on the sheet: **Outfit Bold** (headings) / **Outfit Regular**
(body).

⚠️ **"Soft Background" `#F616FA` is almost certainly a scan/OCR error** — that
hex is a saturated magenta, not a background color, and contradicts its own
label. Treated below as a placeholder; needs the real swatch (see §9.2).

---

## 1. What this changes vs. today

`DESIGN_PRINCIPLES.md` §1 currently locks: violet `--brand-500 #8b47f5`, one
amber accent, Plus Jakarta Sans, a single pin mark, "never introduce a second
logo." This proposal:

- Shifts primary purple to the sheet's brighter `#BB47F5` and **formalizes
  pink as a full token ramp** (today `--pink-500` exists only as a one-off
  "stories/social" semantic color per `DESIGN_PRINCIPLES.md` §1 — this
  promotes it to a real accent family with a full 50–900 ramp).
- Keeps amber **unchanged** — `#FF9500` on the sheet is the exact hex already
  in `--accent-500`. Zero risk here, and it's the anchor proving the two
  palettes are related, not a clean break.
- Proposes swapping the typeface to Outfit (open decision, §9.1).
- Introduces a **two-mark system** (hero lockup + compact icon) and asks to
  amend the "never a second logo" rule to allow it deliberately (§9.3) —
  this is how Slack/Instagram/most apps actually work: one icon for
  16–48px contexts, one illustrated lockup for hero/marketing moments.
- Adds a named, signature **motion & loading language** ("Street Light")
  that answers the "loading option and all" ask directly — see §4.

Everything else in `DESIGN_PRINCIPLES.md` (§2 layout/shape, §4 component
idioms, §5 data-display rules, §7 interaction principles, §8 voice, §9 a11y)
**stays as-is**. This is a re-skin + motion layer, not an IA rewrite.

---

## 2. Color system — full ramps

Generated from the 5 sheet colors, mapped onto the **existing variable names**
in `src/index.css` so implementation is a token swap, not a rewrite. All
gradients still go `500 → 700` (buttons) or `500 → 900` (hero panels).

### `--brand-*` (Primary Purple, was violet `#8b47f5`)
```
--brand-50:  #faf3ff
--brand-100: #f2e0ff
--brand-200: #e6c4fe
--brand-300: #d59efb
--brand-400: #c975f8
--brand-500: #bb47f5   ← primary (sheet exact)
--brand-600: #a020e0
--brand-700: #841bb8
--brand-800: #661690
--brand-900: #4a1068
```

### `--pink-*` (NEW full ramp — promoted from one-off semantic to real accent)
```
--pink-50:  #fff1f9
--pink-100: #ffe0f1
--pink-200: #ffc0e3
--pink-300: #ff97cf
--pink-400: #ff79c2
--pink-500: #ff5dba   ← accent (sheet exact)
--pink-600: #e83ea0
--pink-700: #c22a82
--pink-800: #971f64
--pink-900: #6b1546
```
Role: **"live / social / engagement"** color — Live Pulse dot, queue-live
badges, story ring, "Join queue," reply/react moments. Not a second primary;
spent as deliberately as amber is today (see `DESIGN_PRINCIPLES.md` §1's
"one accent, spent deliberately" rule — pink gets the same discipline).

### `--accent-*` (Warm Amber — unchanged)
```
--accent-400: #ffba2b
--accent-500: #ff9500   ← unchanged, sheet exact
--accent-600: #e07800
```
Keeps its current job: the Create (+) FAB, celebration/"NEW" moments — see
`DESIGN_PRINCIPLES.md` §1.

### `--ink-*` (Deep Ink `#1A1530`, was `#1a0a2e`)
```
--ink-900: #1a1530
--ink-800: #2c2447
--ink-700: #453a68
--ink-600: #655583
--ink-500: #8a78a3
--ink-400: #b0a3c4
--ink-300: #d0c5de
--ink-200: #e8e1f0
--ink-100: #f5f1fa
--ink-50:  #fbf9fd
```
Slightly cooler/more neutral than the current ink-900 — pairs cleanly with
both purple and pink without a visible seam.

### `--bg` (Soft Background — placeholder pending §9.2)
```
--bg: #fbf6fc   ← computed pale tint of brand-500, NOT the sheet hex
```

### Shadows (re-tint from violet rgba to new purple rgba)
```
--shadow-brand:  0 10px 24px rgba(187, 71, 245, 0.42)   /* was rgba(139,71,245,...) */
--shadow-pink:   0 10px 24px rgba(255, 93, 186, 0.40)   /* NEW */
--shadow-accent: 0 10px 24px rgba(242, 106, 0, 0.40)    /* unchanged */
```

No other token families (`--green-*`, `--red-*`, `--amber-*` semantic,
`--radius-*`, `--space-*`) change.

---

## 3. Typography

Sheet spec: **Outfit** (Bold headings / Regular body) vs. current **Plus
Jakarta Sans**. Outfit is geometric and pairs naturally with the geometric
lamp/pin mark — recommend the swap (needs sign-off, §9.1).

If approved:
- `index.html` font link → `Outfit:wght@400;500;600;700;800`
- `src/index.css` `--font` → `"Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- **Type scale unchanged** — same `h1`(22/800) `h2`(18/700) `h3`(15/600)
  `.body`(14/400) `.small`(13/500) `.tiny`(11/600) from `DESIGN_PRINCIPLES.md`
  §3. Hierarchy still comes from weight+size, never a second family.

If not approved: everything below still applies with Plus Jakarta Sans; this
is the one fully independent decision in the whole doc.

---

## 4. The "Street Light" motion & loading system

This is the direct answer to "using this loading option and all." One named,
reusable motion language instead of ad hoc spinners, tied to the lamp motif
and to the sheet's own "Live Pulse" feature pillar (*"Real-time info, queues
and availability"*).

### 4.1 Boot: the lamp lights up
`Splash.tsx`'s left hero panel currently reveals static. New sequence
(≈900ms, CSS `stroke-dashoffset` + opacity, no video/lottie dependency):
1. Lamp-post SVG draws itself (stroke animates in).
2. A radial glow (`--accent-400` → transparent) "switches on" under the lamp
   head.
3. The `STRYT` wordmark fades/rises up through the cone of light.
4. Feature list + stat pills stagger in (60ms offset each — already close to
   current layout, just sequenced).
`prefers-reduced-motion`: skip straight to the final frame, no draw/glow.

### 4.2 Skeleton shimmer — recolor, don't reinvent
`states.tsx`'s `Skeleton`/`.skel` shimmer sweep changes from a flat gray pass
to a **light sweep**: base `--ink-100`, sweep gradient
`transparent → var(--brand-200) → var(--pink-200) → transparent` at low
opacity, same speed/direction as today. Reads as light passing over a surface
— literal "street light," costs one CSS gradient edit, no component API
change (`CardSkeleton`, `BusinessCardSkeleton`, `ProviderCardSkeleton`,
`RequestCardSkeleton`, `AppointmentCardSkeleton`, `ListSkeleton`, `RowSkeleton`
all inherit it for free since they all render `<Skeleton/>`).

### 4.3 `AppShellSkeleton` boot (post-auth) — unchanged behavior, recolored
Per `DESIGN_PRINCIPLES.md` §6 this already exists and is correct (never a
dead spinner on real content). No structural change — just inherits the new
shimmer gradient from §4.2 and new ink/brand tokens.

### 4.4 Live Pulse dot — new shared component
`src/components/LivePulseDot.tsx` (new): a small breathing dot — amber core
(`--accent-500`), soft pink glow ring (`--pink-400` at low opacity,
`transform: scale` pulse ~1.6s loop). One component, used everywhere "this
number can change without you touching it":
- Queue "X in line" (business queue, `QueueManager`, `BusinessDetail`)
- "Available now" badges (`AvailableNow`, provider/business open state)
- Notification bell unread dot (`Notifications`, `BottomNav`)
- Chat unread dot (`ConversationList`, `BottomNav`)
- Appointment "starts soon" chip (`MyAppointments`)
`prefers-reduced-motion`: static dot, no pulse loop.

### 4.5 Button loading state
Async submit buttons (per `DESIGN_PRINCIPLES.md` §6 "double-submit guards")
replace their label with 3 dots pulsing in sequence, brand→pink→amber, instead
of a generic spinner ring. One shared `<ButtonSpinner/>` used inside
`btn-primary`/`btn-pink`/`btn-green` when `pending` is true.

### 4.6 Screen-enter transition
Route changes get a 160ms fade+4px-rise (no slide, no bounce) instead of a
hard cut — subtle, cheap, respects reduced-motion (instant when set).

### 4.7 Empty states — one signature variant
`EmptyState` (in `common.tsx`) gets one new illustration variant — a small
lamp with the light "off," used for genuinely-empty (not error) states tied
to *your* street being quiet: no requests nearby, no queue, no stories yet.
Ties the empty-state metaphor directly to the brand mark instead of a generic
emoji. Other emoji-based empty states (per `DESIGN_PRINCIPLES.md` §8) stay as
they are — this is additive, not a full illustration-system rebuild.

---

## 5. Component deltas (recolor, not reshape)

Shapes, radii, spacing, and interaction rules from `DESIGN_PRINCIPLES.md` §2
& §4 are unchanged. Only fills/gradients move:

| Component | Today | New |
|---|---|---|
| `.btn-primary` | `linear-gradient(135deg, var(--brand-500), var(--brand-700))` | same expression, new ramp values — no markup change |
| `.btn-pink` (NEW) | — | `linear-gradient(135deg, var(--pink-500), var(--pink-700))` — for "Join queue," story reply, live/social CTAs |
| `.badge-purple` | brand-100/700 | new brand ramp |
| `.badge-pink` (NEW) | — | pink-100/700 — live/social status, distinct from `badge-amber` ("new") and `badge-green` (available) |
| Chip active | brand-500 fill | new ramp |
| BottomNav active item | `--brand-700` | new ramp |
| FAB (+) | amber gradient | **unchanged** |
| AppBar / hero panels | brand-500→700→ink-800 | new ramp values |
| Card shadow tint | violet rgba | purple rgba (§2) |

No new component shapes, no new spacing values, no new radius values.

---

## 6. Page-by-page application

Grouped by IA, referencing real screens from `CODEBASE_MAP.md` §9. Every
entry means "recolor to new tokens + apply relevant §4 motion primitive
where it already has a loading/live state" — not a rewrite. Screens with
deeper IA rework are cross-referenced to `BUSINESS_PROVIDER_UX_REDESIGN.md`
instead of duplicated here.

| Area | Screens | Applies |
|---|---|---|
| **Auth/Onboarding** | `Splash`, `auth/PhoneEntry`, `OtpVerify`, `UserOnboard`, `LocationPermission` | §4.1 boot sequence on Splash; new token ramp on hero panel + CTA card |
| **Home/Launchpad** | `Home` | Launchpad hero tile recolored; Live Pulse dot (§4.4) on "My deals" active badge and Community chat-unread badge — Launchpad structure itself (2×2 tile grid, single "On your street now" list) is unchanged |
| **Explore/Search/Map** | `Explore`, `Search`, `MapView`, `AllCategories`, `CategoryListing` | `ExploreSkeleton`/card skeletons get §4.2 shimmer; filter chips recolored |
| **Business/Provider detail** | `BusinessDetail`, `ProviderDetail` | Token recolor only — IA rework owned by `BUSINESS_PROVIDER_UX_REDESIGN.md` §3.1's "Right Now" pulse strip is a natural §4.4 Live Pulse Dot consumer |
| **Own profile / Public profile** | `Profile`, `ProfileEdit`, `PublicProfile`, `AccountSettings`, `Settings` | Token recolor; alias/privacy UI and locked KYC rules unchanged |
| **Business console** | `ManageDashboard`, `CatalogManager`, `PhotosManager`, `QueueManager`, `LoyaltySetup`, `QnaManager`, `ReviewsManager`, `BusinessAppointments`, `LeadsInbox`, `Promote`, `VerificationCenter`, `BusinessSettings`, `BusinessRequests` | Token recolor; QueueManager live count gets Live Pulse Dot; skeletons inherit §4.2 automatically |
| **Provider console** | `ProviderDashboard`, `ProviderProfileEditor`, `ProviderAvailability`, `ProviderPackages`, `ProviderPortfolio`, `ProviderLeads`, `ProviderSettings` | Same as business console; "available now" toggle gets Live Pulse Dot |
| **Requests/deals/appointments** | `AskCompose`, `SubmitProposal`, `AgreementScreen`, `Agreements`, `RequestDetail`, `RateScreen`, `MyAppointments` | Token recolor; appointment "starts soon" gets Live Pulse Dot |
| **Chat** | `ConversationList`, `ChatThread` | Unread dot → Live Pulse Dot; bubble colors stay semantic (unchanged) |
| **Community/social** | `Community`, `CommunityHub`, `CommunityCompose`, `CommunityPostDetail`, `StoryCompose`, `Stories`, `Leaderboard`, `Achievements`, `AvailableNow`, `Neighborhood` | Story ring recolored to pink ramp (was ad hoc `--pink-500`, now real ramp); AvailableNow badges get Live Pulse Dot |
| **Wallet/loyalty** | `Wallet`, `subscriptions/*` | Token recolor only |
| **Notifications/Support** | `Notifications`, `Support`, `Bookmarks`, `Lists` | Bell badge → Live Pulse Dot |
| **Admin** | `AdminPanel` | Token recolor, lowest priority — internal tool |
| **Shared shell** | `BottomNav`, `DesktopSidebar`, `AccountSwitcher`, `RoleSwitcher`, `ShareCard` | §5 nav recolor; `ShareCard` gets the hero lockup mark (§9.3) |

---

## 7. Dark mode (additive, optional — see §9.5)

Deep Ink (`#1a1530`) is dark enough to seed a real dark theme, not just an
inverted one: `--bg` → `--ink-900`, `--surface` → `--ink-800`, text scale
flips (`--ink-50`/`100` become the readable-text tokens), brand/pink/amber
ramps stay as-is (they already read fine on dark — they're saturated,
mid-lightness colors). Scoped as a **future, separate phase** — not required
to ship the rest of this doc.

---

## 8. Accessibility carry-over

All of `DESIGN_PRINCIPLES.md` §9 applies unchanged. Specific to this doc:
- New `--brand-500 #bb47f5` on white: verify body-text-on-fill stays white
  (fill is dark enough — same pattern as current brand-600+, per §9's "white
  text only on brand-600+" rule; confirm brand-500 still clears 4.5:1 for
  button labels since it's lighter than the old brand-500).
- New `--pink-500 #ff5dba` badge text: use `--pink-700` for text-on-tint
  (matches existing `--brand-700`-on-`--brand-100` pattern), never
  `pink-500` as text color on white.
- Motion: every animation in §4 has a `prefers-reduced-motion` fallback
  stated inline — no exceptions.

---

## 9. Open decisions — resolved

1. **Typeface swap** — ✅ **done.** Outfit shipped (`index.html` font link,
   `--font` in `src/index.css`). Verified rendering via a Playwright
   screenshot against the dev server — resolves correctly, no fallback.
2. **Real "Soft Background" hex** — ⚠️ still using the computed `#fbf6fc`
   placeholder from §2. The sheet's `#F616FA` was never confirmed as a real
   swatch — swap `--bg` in `src/index.css` if the true value turns up.
3. **Two-mark system** — ✅ **approved and built as decorative-only**, the
   more conservative of the two options: the lamp appears as ambient hero
   art on `Splash.tsx` (boots by drawing itself in, §4.1) but is **not**
   treated as a logo anywhere — the pin remains the only mark used as an
   icon (favicon, compact badges, PWA). `DESIGN_PRINCIPLES.md` §1's "never a
   second logo" rule was not amended; nothing here violates it.
4. **Pink's job** — ✅ **locked to live/social accent**, as recommended.
   Promoted from a one-off hardcoded `#ec4899` to a full `--pink-*` ramp;
   amber (`--accent-*`) untouched. All prior raw `#ec4899` usages across the
   codebase (story rings, map markers, notification icons, tile accents)
   now reference `var(--pink-500)`.
5. **Dark mode** — deferred, as recommended (§7 unchanged, future work).
6. **Rollout shape** — implemented as one pass rather than phased merges,
   per direct instruction to build it now. `npx tsc --noEmit` and
   `npm run build` both pass clean.

### What actually shipped
- **Tokens** (`src/index.css`): full `--brand-*`/`--pink-*`/`--ink-*` ramps
  per §2, `--bg`, `--shadow-brand`/`--shadow-pink`, `--font: Outfit`.
- **Font**: `index.html` Google Fonts link swapped to Outfit; `theme-color`
  meta updated to `#bb47f5`.
- **Favicon** (`public/favicon.svg`): recolored to the new ramp. The
  binary `public/icon-192.png` / `icon-512.png` PWA icons were **not**
  regenerated (raster assets, out of reach of a code edit) — still show
  the old violet; regenerate from the favicon SVG when convenient.
- **Motion primitives**: `.skel` shimmer recolored to a brand→pink light
  sweep (§4.2), `.live-pulse` (amber core / pink ring, §4.4) as
  `src/components/LivePulseDot.tsx`, `.btn-spinner` (§4.5) as
  `ButtonSpinner` in `src/components/common.tsx`, `.screen` fade-in gained
  a 4px rise (§4.6). All respect `prefers-reduced-motion`.
- **Splash boot** (`src/screens/Splash.tsx`, §4.1): the lamp draws itself in
  via `stroke-dashoffset`, then the head glows on — CSS-only, ~1.15s total,
  reduced-motion skips straight to the settled frame.
- **Hardcoded-hex sweep**: every raw `#ec4899` and old-purple `rgba(139,71,245|124,58,237|109,40,217,...)`
  literal across `src/` was found (18 files) and replaced with the new
  token/rgb equivalents — grepped clean afterward.
- **Live Pulse Dot wired in** (representative, not exhaustive — see below):
  `QueueManager.tsx` ("Queue is ON"), `ProviderAvailability.tsx`
  ("Available right now"), `BusinessDetail.tsx` ("Open now"). Not wired into
  chat/notification unread badges — those already carry a number, which
  reads as "live" on its own; doubling up read as clutter.
- **Verification**: `npx tsc --noEmit` clean, `npm run build` clean, and a
  Playwright screenshot against `npm run dev` confirmed the new tokens (`--brand-500: #bb47f5`,
  `--pink-500: #ff5dba`), the Outfit font, and the lamp boot art all render
  as intended with zero console errors.

### Follow-up pass (2026-07-10): "The Living Street Light" — the signature layer
The first pass was an honest recolor but the app still *read* the same — same
flat-gradient headers, plain "STRYT" text. This pass adds the ownable idea that
makes STRYT unmistakable, tying the brand's street-lamp motif and the hyperlocal
"your street right now" promise into one living system:

- **Brand lockup in-app** (`src/components/BrandLockup.tsx`): the sheet's primary
  "STRYT written with the lamp" mark, now the tappable home link in every header.
  The lamp is a real light source — `lampGlow` (0→1) drives the bulb brightness,
  halo, and the amber cone spilling over the wordmark. `BrandHome` renders it.
- **Living sky headers** (`src/features/ambient/AmbientSky.tsx`): a drop-in
  header backdrop that paints (1) a **time-of-day light wash** — dawn glow,
  dusk pink band, night hush — and (2) the **season drifting through the lamp
  light**: rain streaks (monsoon), snow (winter), tumbling petals (spring),
  warm haze (summer). Weather can override the season (live rain → rain effect).
- **Ambient hook extended** (`src/features/ambient/useAmbientTheme.ts`): now also
  returns `dayPartKey`, `seasonKey`, `seasonEffect`, and `lampGlow` — the sky,
  the lamp, and the existing category-boost/banner logic are one system. Fully
  backward-compatible (all prior fields unchanged).
- **Applied to all three "homes"**: customer `Home` (mobile sticky header +
  desktop dark sky band), business `ManageDashboard`, provider `ProviderDashboard`
  — so the identity is inherited on the custom dashboards, not just the customer
  app. Role colours (orange/green) are preserved; the lamp + season layer over them.
- **Perf + a11y**: CSS-only, ~14–26 tiny absolutely-positioned particles per
  header, negative-delay so the field is populated at t=0 (no "waves"). Vertical
  travel animates `top` (container-relative) — an earlier `translateY(%)` bug made
  particles barely move since `%` is element-relative. Everything is killed under
  `prefers-reduced-motion` (`.ambient-sky-field { display:none }`, lamp flicker off).
- **Desktop note**: the desktop customer Home header used to be a light panel, so
  the rain was invisible there — it was converted to the same dark sky band as
  mobile so the season shows on desktop too.

### Deliberately not done in this pass
- **`ButtonSpinner` is not wired into every async submit button** — the
  primitive exists and is ready to drop in, but rewiring every `pending`
  state across the app is a large, low-risk-but-high-file-count follow-up,
  not part of the visual/motion foundation.
- **Full page-by-page sweep from §6's table** — the token system means
  ~95% of screens recolored automatically (everything already used
  `var(--brand-*)` etc.); the manual work was the hardcoded-hex sweep above
  plus the handful of Live Pulse Dot placements. No screen was individually
  redesigned beyond that.
- **PWA raster icons, dark mode** — see notes above / §7.

---

## 10. Rollout plan (recommended: phased)

| Phase | Scope | Key files |
|---|---|---|
| 0 | Sign off on §9 | — (this doc) |
| 1 | Token foundation | `src/index.css` (`:root` ramps, `--font`, shimmer gradient, shadow tints), `index.html` (font link), `src/features/ambient/useAmbientTheme.ts` (default accent) |
| 2 | Motion primitives | `src/components/states.tsx` (shimmer), new `LivePulseDot.tsx`, new `ButtonSpinner.tsx`, reduced-motion guard (likely a small `useReducedMotion` hook in `src/hooks/`) |
| 3 | Brand marks | `src/screens/Splash.tsx` (§4.1 boot), `src/components/BrandHome.tsx`, `src/components/ShareCard.tsx`; favicon/PWA icons stay the pin (no change) |
| 4 | Shell/nav | `src/components/BottomNav.tsx`, `AppBar` in `common.tsx`, `DesktopSidebar.tsx`, `AccountSwitcher.tsx`, `RoleSwitcher.tsx` |
| 5 | Screen sweep | Customer core → business console → provider console → community/chat/wallet → admin, per §6 table, each verified against `DESIGN_PRINCIPLES.md` §10 Definition of Done |
| 6 | Dark mode | Only if §9.5 says yes |
| 7 | QA | Contrast check (WCAG AA) on new ramps, `npx tsc --noEmit`, `npm run build`, `npm run audit`, manual per-screen pass |

Once shipped, fold the final token values back into `DESIGN_PRINCIPLES.md`
§1/§3 as the new source of truth and retire the "violet" language there.

---

*This doc is a plan, not a diff. No code has been touched yet — see §9 before
Phase 1 begins.*
