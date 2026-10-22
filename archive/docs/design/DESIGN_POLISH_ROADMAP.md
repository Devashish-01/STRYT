# STRYT — Design Polish Roadmap

**Goal:** close the gap between STRYT's current UI and the "this feels like a real, funded product" polish of Swiggy, Zomato, and Instagram — the apps referenced as the bar.

This isn't a rebrand and isn't a rewrite. The design system (`src/index.css`) is already structurally sound — real tokens for color/spacing/radius/shadow, a working card/chip/badge vocabulary, a working mobile shell + desktop sidebar layout. The gap is **discipline and finish**, not architecture: tokens that exist but get bypassed, patterns that exist in one place but not everywhere, and a handful of "programmer art" placeholders (raw emoji, ad-hoc absolute positioning) standing in for what should be considered UI.

Every item below names the actual file(s) involved. Nothing here is invented — it's grounded in what's in the repo today.

---

## Where STRYT already matches the bar

Worth stating plainly so this reads as a punch list, not a rewrite order:

- **Real token system** — `--brand-*`, `--ink-*`, `--space-*`, `--radius-*`, `--shadow-*` in `src/index.css` are exactly the kind of scale Swiggy/Zomato run on. Most UI already consumes them instead of hardcoding.
- **Semantic status color** — `Rating` in `src/components/common.tsx` colors by score (green ≥4, amber ≥3, red below) — this is precisely Zomato's rating-chip logic.
- **Bottom nav with center FAB** — `src/components/BottomNav.tsx` already has the Instagram/Swiggy-style raised center action button with the create sheet.
- **Skeleton loading states exist** (`src/components/states.tsx`) — most apps at this stage just spinner-and-pray; STRYT already shimmers.
- **A real desktop layout**, not just a stretched mobile view — sidebar nav, multi-column grids, sticky filter panels (`index.css` lines 855–1400). Most PWAs never bother.
- **Safe-area handling** on bottom nav, sheets, and the story viewer — shows attention to real-device edge cases, not just Chrome devtools testing.

The rest of this doc is about making the *exceptions* to this system disappear.

---

## A. Brand color discipline

**The problem:** the palette is purple ("Vivid Street," `--brand-500: #8b47f5` etc. in `index.css`), but stray hardcoded hex from an earlier coral-palette pass are still leaking through in places that never got swept:

- `src/components/cards.tsx` — `BusinessCardWide`'s verified badge is hardcoded `color="#e5521c" fill="#ffe8e2"` — a coral orange that clashes with the current purple system and doesn't move if the brand color ever changes again.

**Why this matters for the "Swiggy feel":** those apps never let a single stray hex slip into a component — every color reference traces back to a token. One clashing badge is the kind of thing that makes a UI feel assembled rather than designed, even if a user can't articulate why.

**Action:**
1. `grep -rn "#[0-9a-fA-F]\{3,6\}"` across `src/components` and `src/screens`, excluding `index.css` itself, and replace any raw hex that has a token equivalent (verified badges → `var(--brand-600)` + `var(--brand-100)`, matching how every other verified/trust indicator in the app already does it).
2. Add a lint rule or a short `scripts/check-hardcoded-colors.js` that fails CI if a new raw hex color shows up outside `index.css` — cheap insurance against this recurring a third time.

---

## B. Imagery & empty states

**The problem:** every empty state in the app (`EmptyState` in `src/components/common.tsx`) renders a raw emoji at 54px as the "illustration." This is used everywhere — no results, no queue, no appointments, network errors.

**Why this reads as unfinished:** Swiggy, Zomato, and Instagram all use custom line-art/flat illustrations for empty states — an emoji at font-size is unmistakably a placeholder, not a design decision, and it's the single biggest "this looks like a prototype" tell in the whole app because empty states are common (every fresh account, every filtered-to-zero list) and highly visible.

**Action (prioritized — this is the highest-leverage single fix in this doc):**
1. Commission or generate ~15–20 simple, on-brand SVG illustrations (flat, 2-color, using `--brand-500`/`--ink-200` so they inherit the palette) covering the recurring empty-state categories: no search results, no orders/deals, no notifications, no queue, no appointments, network error, empty cart, no photos.
2. Extend `EmptyState` to accept an `illustration?: ReactNode` prop that overrides the emoji when present; keep emoji as the fallback for the long tail of rare states so this isn't a blocking dependency.
3. Roll out illustration-first empty states to the ~6 highest-traffic screens first (Home, Explore, MyQueues, MyAppointments, Agreements, Search) before the rest.

**Secondary imagery issue** — `BusinessCardWide` (`src/components/cards.tsx`) hardcodes cover image height to `150px` rather than an `aspect-ratio`. On varying image source dimensions this produces inconsistent crops across a grid, which is exactly what Swiggy/Zomato's card grids never let happen (their card images are always a fixed aspect ratio, never a fixed pixel height, so the crop framing stays consistent regardless of source image size). Switch card image containers to `aspect-ratio: 16/10` (or similar) instead of a fixed height.

---

## C. Card system consistency

**The problem:** badge stacking on card images is done with manual pixel offsets computed in JS:
```
style={{ position: "absolute", top: b.isNew ? 38 : 12, left: 10 }}
```
(`BusinessCardWide`, `src/components/cards.tsx`). This works for exactly two badges and breaks the moment a third condition is added — it's already fragile with two.

**Action:** replace the manual-offset badge stack with a flex column pinned to the corner:
```css
.card-badge-stack {
  position: absolute; top: 10px; left: 10px;
  display: flex; flex-direction: column; gap: 6px; align-items: flex-start;
}
```
Any number of badges (NEW, Promoted, future ones) then stack automatically without per-badge math. Apply the same pattern to `BusinessCardSmall`/`ProviderCardSmall` if they have similar ad-hoc positioning.

**Skeleton-shape mismatch:** `CardSkeleton` (`src/components/states.tsx`) is one generic shape (140px image block + two text lines) reused for every loading list — business cards, provider cards, request cards, queue cards — even though their final layouts differ significantly. Swiggy/Instagram skeletons are shaped to closely match the specific component they're standing in for, so the loading→loaded transition doesn't visibly "jump." Worth 2–3 more skeleton variants (`RequestCardSkeleton`, `ProviderCardSkeleton`) rather than one generic block once the illustration work above is done.

---

## D. Motion & feedback

**What exists:** `.btn:active { transform: scale(0.97) }`, `.card` press states on a few interactive cards, `fadeUp`/`pop`/`pulse-ring` keyframes, a sheet slide-up animation. This is a real foundation — don't rebuild it.

**What's missing relative to the reference apps:**

1. **Pull-to-refresh** — every reference app supports it on scrollable list screens (Home, Explore, feeds). STRYT's `.screen-scroll` has no pull-to-refresh affordance anywhere. This is one of the most-felt interactions in Swiggy/Zomato/Instagram; its absence is noticeable even if a user can't name it. Worth adding to at least Home, Explore, and MyQueues/MyAppointments as a shared hook (`usePullToRefresh`) wrapping the existing `refetch()` calls those screens already have.
2. **List-item stagger** — `fade-up` exists as a single-item animation but nothing staggers it across a rendered list (each card in a `.map()` fades in simultaneously rather than cascading). A 30–40ms stagger (`animation-delay: ${i * 35}ms`) on card grids is a cheap, high-perceived-polish win used throughout Instagram's grid views.
3. **Page transitions** — route changes are instant cuts with no shared-element or slide transition. Not proposing a full transition system (real cost, real risk with React Router), but even a simple 150ms cross-fade on the `.screen` root would soften the "static site" feeling on navigation.

---

## E. Typography & hierarchy

The type scale (`h1`–`h3`, `.body`, `.small`, `.tiny` in `index.css`) is sound and consistently sized. Two gaps:

1. **No numeric/tabular variant** for prices and counts. Swiggy/Zomato use tabular-nums so prices in a list don't visually jitter as digit widths change. Add `font-variant-numeric: tabular-nums` to price displays (`inr()` usages, badge counts).
2. **Line-height inconsistency in card metadata rows** — some card subtext uses inline `lineHeight` overrides, others rely on the `.tiny`/`.small` class defaults, producing slightly different vertical rhythm card-to-card on the same screen. Standardize: card metadata rows should always use the class default, never an inline override, unless there's a specific multi-line-wrap reason.

---

## F. Iconography

The `@/components/Icons` wrapper (Phosphor-based) is already a single source of truth — genuinely good, this is exactly the kind of centralization that keeps an icon set from drifting. No action needed here beyond what's already being enforced; just don't let screens import raw `lucide-react`/`@phosphor-icons/react` directly outside that wrapper (worth a quick repo-wide grep to confirm none have crept in).

---

## G. Navigation & wayfinding

- **Badge consistency** — unread/active-count badges appear in at least three visually different implementations: `.nav-badge` (bottom nav), `.launch-tile-badge` (Home tiles), `.feature-card-badge` (Profile), `.sidebar-badge` (desktop). All four are red circles with a number, but defined with separately hand-tuned `top`/`right`/`min-width` values in four places. Worth consolidating into one `.count-badge` class with a `size` modifier, so a future change (e.g. switching red to the accent color for a specific badge type) doesn't require hunting four definitions.
- **Active tab indicator** — bottom nav has a nice top-edge indicator bar (`.nav-item.active::before`); the desktop sidebar's active state is just a background fill (`.sidebar-nav-item.active`). Reasonable that desktop differs from mobile, but confirm this is a deliberate choice and not an oversight — Instagram's web sidebar uses a bold-icon + filled-background combo, which the current desktop sidebar is close to but not quite matching (icons here don't appear to swap to a filled/bold variant on the active item the way `BottomNav.tsx` does with `strokeWidth={isActive ? 2.6 : 2}`).

---

## H. Dark mode

Not present at all — no `prefers-color-scheme` handling anywhere in `index.css`. This is a real gap versus Instagram (dark-mode-first for years) and increasingly Swiggy/Zomato. Scope note: this is a genuinely large effort (every hardcoded `#fff`/`background: var(--surface)` assumption needs a dark counterpart) and shouldn't be treated as a quick add-on. **Recommend treating this as its own separate initiative, not part of this polish pass** — flagging it here so it's tracked, not because it belongs in the P0/P1 list below.

---

## I. Desktop-specific polish

The desktop layout (`index.css` `@media (min-width: 768px)` block) is already fairly developed — sidebar, filter panels, grid overrides. Two rough edges:

1. **`.screen { max-width: 1120px !important; padding: 24px 32px !important; }`** is a blanket override applied via `!important` to every screen. This is fragile (already required a documented exception for `.screen-canvas` to opt out) — every future full-bleed screen (a new map view, a new camera/scanner flow) will hit the same problem and need the same manual escape hatch. Consider inverting the default: make full-bleed the default behavior and require an opt-in class (`.screen-boxed`) for the centered-column treatment, rather than opt-out.
2. **Hover states are inconsistent** — some interactive elements have `:hover` treatment (`.sidebar-nav-item:hover`, `.explore-desktop-filters .category-item-btn:hover`), most card/button components don't (they only have `:active`, which is a touch-first pattern that does nothing on a desktop mouse). On desktop, every clickable card should get at minimum a `box-shadow` lift or border-color shift on `:hover` — right now most of the app's cards feel static/dead to a mouse user until they click.

---

## J. Micro-copy & tone

Spot-checked several `EmptyState`/toast strings — tone is consistent (warm, "your street," second person) and this is a genuine strength; no action needed. Worth a full copy pass only after the visual items above land, since copy polish is much less visible than the emoji/badge/skeleton issues.

---

## Prioritized roadmap

**P0 — do first, highest visibility-to-effort ratio:**
1. Empty-state illustrations (Section B) — the single most "prototype-looking" element in the app, and it's on every empty screen.
2. Sweep hardcoded coral hex out of `cards.tsx` (Section A) — 10-minute fix, but a clashing badge undermines every other polish effort until it's gone.
3. Badge-stack CSS fix in card images (Section C) — small, prevents the next badge addition from breaking.

**P1 — meaningful perceived-quality lift:**
4. Pull-to-refresh on Home/Explore/MyQueues/MyAppointments (Section D.1).
5. Card grid stagger animation (Section D.2).
6. Card `:hover` states for desktop (Section I.2).
7. Aspect-ratio image containers instead of fixed-height (Section B, secondary).

**P2 — polish once P0/P1 are done:**
8. Shaped skeleton variants per card type (Section C).
9. Consolidated `.count-badge` class (Section G).
10. Tabular-nums on prices (Section E).
11. Simple screen cross-fade transition (Section D.3).
12. `.screen-boxed` opt-in inversion for desktop layout (Section I.1).

**Tracked separately, not in this pass:**
- Dark mode (Section H) — real scope, deserves its own plan.

---

## How to keep this from regressing

The coral-hex leak in `cards.tsx` is proof that even a disciplined token system drifts without enforcement. Two cheap guardrails worth adding once the P0 items land:
- A CI check (grep-based is fine, doesn't need real tooling) that fails on new hardcoded hex colors outside `index.css`.
- A one-page **component inventory** (could live in Storybook, or just a `/dev/components` debug route rendering every card/badge/button variant) so new screens reuse existing patterns instead of quietly inventing slightly-different ones — this is likely how the badge-implementation-in-four-places problem (Section G) happened in the first place.
