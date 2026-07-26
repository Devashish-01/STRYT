# STRYT Design Principles

The single source of truth for how STRYT looks, feels, and behaves. Every new
screen, component, or copy change must pass this document. Tokens live in
[`src/index.css`](src/index.css) — this doc explains *why* and *how* to use them.

**Product one-liner:** *Your street. Your people.* A hyperlocal marketplace —
warm, trustworthy, fast, and never corporate.

---

## 1. Brand foundation

| Element | Value | Rule |
|---|---|---|
| Identity mark | Pin-with-winding-street SVG ("App Icon") | Same mark everywhere as an *icon*: favicon, PWA icons, compact badges, share cards. A second element — an illustrated street-lamp — appears **only** as decorative hero art (`Splash.tsx` left panel), never as a substitute icon; see [`STREETLIGHT_REDESIGN.md`](MD_FILES/STREETLIGHT_REDESIGN.md) §9.3. |
| Primary | Purple `--brand-500 #bb47f5` → `--brand-900` | The "street at dusk" brand color. Gradients go 500→600→900. (Was violet `#8b47f5` pre-2026-07 refresh — see [`STREETLIGHT_REDESIGN.md`](MD_FILES/STREETLIGHT_REDESIGN.md).) |
| Accent | Golden amber `--accent-500 #ff9500` | One accent, spent deliberately: the Create (+) FAB, celebration moments, "NEW" energy. Never as a second primary. Unchanged across the 2026-07 refresh. |
| Semantic | `--green-500` success/available · `--red-500` danger/urgent · `--amber-500` warning · `--pink-500 #ff5dba` live/social (full ramp — queue-live, story ring, "Join queue", `LivePulseDot`) | Semantic colors are not decoration — each maps to one meaning app-wide. |
| Neutrals | Purple-tinted ink scale `--ink-900 #1a1530` → `--ink-100` on `--bg #fbf6fc` | Never pure gray/black; neutrals carry the brand hue. |
| Typeface | Outfit (400/500/600/700/800) | One family. Hierarchy comes from weight + size, never from a second font. (Was Plus Jakarta Sans pre-2026-07 refresh.) |

**Hard rule:** no raw hex values in components. Every color is a `var(--token)`.
Adding a color = adding a token first.

## 2. Layout & shape language

- **480px phone shell.** Everything designs mobile-first inside `.app-shell`;
  desktop just centers it.
- **Radius scale:** `--radius-sm 10` inputs/chips · `--radius 16` cards ·
  `--radius-lg 22` sheets/heroes · `--radius-xl 28` + pill `999` for
  chips/badges/FAB. Soft corners everywhere — STRYT has no sharp edges.
- **Shadows** are violet-tinted (`--shadow-sm/-/md/lg`), used for elevation only:
  appbars, floating buttons, sheets. Cards on the page sit on `1px var(--line)`
  borders, not shadows.
- **Spacing rhythm (4px grid):** multiples of 4; always use spacing variables:
  * `--space-xxs` (4px)
  * `--space-xs` (8px)
  * `--space-sm` (12px)
  * `--space-md` (16px) — page gutter (`.page-pad`) & default `.card` padding
  * `--space-lg` (24px)
  * `--space-xl` (32px)
- **Surfaces:** page `--bg`, cards `#fff` (defaults to `var(--space-md)` padding; use `.card-condensed` for `12px` and `.card-flat` for `0px` padding), tinted fills use the 50-shade of the
  semantic family (`--brand-50`, `#e8f7ee`, `#fef2f2`) with a matching 100/200
  border.

## 3. Typography Standard

We enforce a strict, semantic typographic hierarchy. Avoid using arbitrary font sizes or inline text style configurations. Always use the following standards (defined as tags and classes in `index.css`):

| Level / Class | Font Size | Weight | Line Height | Usage |
|---|---|---|---|---|
| `h1` / `.h1` | 22px | 800 (ExtraBold) | 1.25 | Screen-level headings, main titles, splash title |
| `h2` / `.h2` | 18px | 700 (Bold) | 1.30 | Section titles, bottom sheet titles |
| `h3` / `.h3` | 15px | 600 (SemiBold) | 1.40 | Card titles, group subheadings |
| `.body` | 14px | 400 (Regular) | 1.50 | Standard body copy, descriptions |
| `.small` | 13px | 500 (Medium) | 1.40 | Form labels, secondary text, metadata labels |
| `.tiny` | 11px | 600 (SemiBold) | 1.30 | Status badges, captions, small tags |

## 4. Component idioms (use these, don't reinvent)

| Component | Class / file | Use |
|---|---|---|
| Card | `.card` | Any grouped content block (defaults to 16px padding. Use `.card-condensed` for 12px padding, `.card-flat` for 0 padding) |
| Chip | `.chip` (+`.active`) | Filters, categories, selectors — active = filled brand |
| Badge | `.badge badge-{purple,pink,green,red,blue,amber,gray,new}` | Status & lifecycle labels — `badge-pink` is for live/social status, distinct from `badge-amber` ("new") |
| Sheet | `.overlay` + `.sheet` + `.sheet-grab` | All modal actions slide up from the bottom; tap-outside closes |
| Buttons | `.btn btn-{primary,pink,green,outline,ghost,block,sm}` | One primary action per screen region — `btn-pink` for live/social CTAs (join queue, story reply) |
| Toggle | Local `Toggle`/`ToggleRow` pattern | 44–46px pill, brand fill when on, thumb slides |
| Toast | `showToast()` from `useApp()` | The only transient feedback channel — never `alert()` |
| Empty state | `EmptyState` (emoji + title + text + optional CTA) | Every list has one; actionable ones carry a CTA button |
| Skeletons | `Skeleton/CardSkeleton/ListSkeleton/RowSkeleton`, `AppShellSkeleton` | See §6 |
| Live indicator | `LivePulseDot` (`src/components/LivePulseDot.tsx`) | Amber-core/pink-ring breathing dot for state that changes without the user acting — queue live, available-now, open-now |
| Button loading | `ButtonSpinner` (`src/components/common.tsx`) | 3-dot pulse replacing a button's label while `pending`; drop-in for any `.btn` variant |
| Icons | @phosphor-icons/react via `@/components/Icons`, 12–22px | Central wrapper layer only. Set global style in `IconContext.Provider` |

## 5. Data display rules (trust & honesty)

These came from real audits — they are non-negotiable:

1. **Never show a phone number as a name.** All display names go through
   [`displayName()` / `firstName()`](src/lib/publicName.ts) which detect
   phone-like strings and fall back to "Neighbor" / "Local provider" /
   "Customer". Anything *persisted* as a public name (stories, queue tokens,
   proposals, recommendations, bookings) must be sanitized the same way.
2. **Zero is not data.** No "0 km" (→ `distanceLabel()` = "nearby"), no
   "0 (0)" ratings (→ "New"), no "0 jobs" (hide), no dangling labels
   ("Responds " with nothing after it → hide the row).
3. **Lifecycle is visible.** Anything with a state shows it: request cards get
   Expired/In-progress/Completed badges and dim when archived; actions that no
   longer apply (Me-too on a closed request) disappear.
4. **Privacy toggles are enforced at render.** If `showPhonePublicly` is off,
   no Call button renders anywhere — not a disabled one, none. Same for email
   and exact location (request→approve flow).
5. **First names in public.** Customers appear as first name only
   (`firstName()`); full/business names are for businesses & providers who
   opted into a public identity.

## 6. Loading, speed & feedback

- **Never a dead spinner on content.** Post-auth boot shows `AppShellSkeleton`
  (a shimmering silhouette of the real screen + bottom nav) — the branded
  purple splash is only for pre-auth. Lists show `ListSkeleton`, rows
  `RowSkeleton`.
- **Optimistic + revert + toast.** Every social/light write (like, vote,
  bookmark, follow, coupon, stamp) updates the UI instantly, persists in the
  background, and **reverts with a toast** if the write fails. The UI must
  never lie.
- **Double-submit guards.** Every async submit sets a `saving/submitting/busy`
  flag and disables its button. No exceptions.
- **Realtime where state changes without you.** Chats, notifications badges,
  queues, appointments, proposals, agreements, community use
  `useQueryWithRealtime`. One-shot `useQuery` is only for data the user
  themselves changes.
- **Fire-and-forget only for telemetry** (`recordView`, `recordInteraction`)
  and localStorage-first preference syncs. User-initiated actions always
  surface failure.
- **Persist preferences.** Any toggle/filter a user sets survives a reload
  (localStorage first, DB where it matters).

## 7. Interaction & flow principles

- **Progressive disclosure.** Lead with the goal, hide power features behind
  one "More options ▾" (AskCompose is the model: title + category + post;
  timing/urgency/radius/expiry collapsed). Max ~5 visible decisions per screen.
- **One primary CTA** per screen, bottom-anchored, full-width. Secondary
  actions are outline/ghost.
- **Everything tappable does something.** No `onClick={() => {}}` — a button
  that can't work yet doesn't render.
- **Escape hatches everywhere:** onboarding is skippable ("Skip for now"),
  sheets close on tap-outside, destructive actions get a confirm sheet
  ("Keep it" as the safe option).
- **Nudge, don't block.** Missing name/location → route through onboarding
  once, skippable; never a hard wall after signup.
- **Chat before commit.** Anywhere a user weighs a stranger (offers, bookings)
  they can message first — trust is built in conversation.
- **SPA always.** Never `window.location.reload()`; refresh state via
  `refreshUser()`/refetch.

## 8. Voice & copy

- **Street-warm, not corporate.** "All quiet nearby", "Tell your street what
  you need", "You're in the queue — we'll ping you".
- **Errors say what to do next:** "Couldn't save — try again", never codes or
  blame.
- **Buttons name the outcome:** "Post request", "Confirm this location",
  "Mark paid (cash / UPI)".
- **Customer words, not system words:** "Offers" not "Proposals", "Deals" not
  "Agreements" (screen titles), "nearby" not "0 km".
- Emoji are seasoning in feedback/empty states (📭 ⚡ 🎉), never in buttons or
  navigation labels.

## 9. Accessibility & quality bar

- Icon-only buttons carry `aria-label`; images have `alt` (or `SafeImg`
  fallbacks).
- Touch targets ≥ 36px; text ≥ 11px (`tiny` is the floor, muted only).
- Contrast: body text `--ink-700`+ on light surfaces; white text only on
  brand-600+ or semantic-500+ fills.
- Every screen handles all four states: loading (skeleton), error
  (`ErrorView` + retry), empty (`EmptyState` + CTA), content.

## 10. Definition of done — new screen/component checklist

- [ ] Spacing via `--space-*` tokens and standard paddings; typography via `h1`-`h3` tags or classes
- [ ] Loading skeleton + error retry + empty state + content states
- [ ] Names via `displayName/firstName`; distances via `distanceLabel`;
      no zero-data renders
- [ ] Optimistic writes revert + toast on failure; submits have busy guards
- [ ] Live-changing data uses realtime; preferences persist
- [ ] One primary CTA; sheets for modals; toast for feedback
- [ ] Privacy toggles honored at render
- [ ] `npx tsc --noEmit` + `npm run build` clean; screen passes the Playwright
      audit (`npm run audit`)

## 11. Roadmap of design debt (known, deliberate)

1. **Profile pages visual redesign** (business/provider) — deferred pass.
2. **Posting/messaging micro-interactivity polish** — deferred pass.
3. Notification-preference toggles are local-only until a backend prefs table
   exists.
4. `future-enhancement/` screens are unrouted by design; re-adding one means
   bringing it up to this document first.
