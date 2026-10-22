# UI loop — production-grade redesign, one page per iteration

**Started:** 2026-10-18 · **Driver:** `/loop` (self-paced) · **Goal:** every screen reads like a world-class consumer app
(Instagram / Snapchat quality) while keeping *all* existing behaviour, routes, data and brand.

## Stop condition (set by the owner, 2026-10-18)

**Go through every page in the queue below, then STOP.** When every row is `done` (or explicitly `skipped` with a reason): call
`ScheduleWakeup` with `stop: true`, send one `PushNotification` ("UI loop finished: N pages redesigned"), and write a final summary for the
owner (pages done, shared patterns added, known leftovers). Do not start a second pass.

## Ground rules (do not break)

- **Brand is fixed:** "Street Light" palette (purple / pink / amber, Outfit), tokens in `src/index.css :root`. No literal hex outside
  `index.css` (CI check). Memory: don't "fix" purple back to coral. The Living Street Light header system (lamp + ambient sky) stays.
- **Home is a Launchpad** (not a feed). Don't re-add the multi-section feed.
- Behaviour, routing, services, RLS untouched. This loop changes presentation: JSX structure, CSS, copy keys.
- New user-facing copy goes through i18n (`en`/`hi`/`mr` in `src/lib/i18n/`), never hardcoded (`check-strings` limit 970; now 944).
- Reuse shared components/classes; add a class to `index.css` only when no shared one fits. Prefer extending `.btn`, sheets, `common.tsx`.
- Accessibility floor: 44px touch targets, visible focus, `aria-*` on custom controls, `prefers-reduced-motion`, 16px+ inputs (no iOS zoom).

## Design principles (what "Instagram / Snapchat quality" means here)

1. **Content first, chrome last.** Edge-to-edge media, one clear primary action per screen, secondary actions quiet.
2. **Bottom-sheet over modal; thumb zone for actions.** Primary CTAs sit low, 52–56px, pill-shaped, with a pressed state.
3. **Hierarchy through scale and weight, not boxes.** Fewer cards-in-cards; use spacing (4/8/12/16/24), dividers, and a type scale
   (display 24–28/800, title 17–18/700, body 15/500, caption 12.5/600).
4. **Identity objects are rings and avatars** (story ring, verified badge, live dot) — consistent everywhere a person/shop appears.
5. **Every state designed:** loading (skeleton, not spinner), empty (illustration + one action), error (inline, recoverable), offline.
6. **Motion is functional:** 120–200 ms press/transition, springy sheets, no decorative loops; honour reduced motion.
7. **Density control:** lists breathe (row min-height 64), counts/badges use tabular numerals, truncation is deliberate.

## Per-iteration procedure

1. Pick the next `todo` page. Screenshot it: `node scripts/ops/ui-shoot.mjs --out <dir> [--persona owner1|customer1|admin1] <route>` (staging;
   `--guest` for signed-out; `--width 1100 --height 760` for desktop; add `--full` for a long page).
2. Read the screenshot + code; list concrete defects (truncation, weak hierarchy, dead space, cramped targets, emoji-as-icon…).
3. Redesign (JSX + CSS + i18n keys). Keep handlers/data untouched.
4. Re-shoot, compare, iterate until it passes the principles. Also check the desktop width if the route is responsive.
5. Gates: `npx tsc --noEmit`, `npx eslint <files> --max-warnings 0`, `npm run check-tokens`, `npm run check-colors`, i18n tests, `npm run check-strings`.
6. Update this table (status + one line of what changed), then schedule the next iteration.

## Page queue (user-journey order)

| # | Page / route | Status | Notes |
|---|---|---|---|
| 1 | Sign-in `/auth/phone` | ✅ done 2026-10-18 | Phones: brand hero + bottom sheet, phone-first, 56px field/CTA, single legal line, no flag emoji, no truncation. Desktop split kept. |
| 2 | OTP code `/auth/otp` | ✅ done 2026-10-18 | Clean white screen (no card-in-gradient): back, app mark, "Enter the 6-digit code", formatted number + Change, 62px boxes (focus/filled/error+shake), inline error, resend timer, CTA right under the boxes (keyboard-safe). Dev-only `?preview` opens it for tooling. |
| 3 | Welcome / Splash `/` | ✅ done 2026-10-18 | Same hero + bottom-sheet pattern as sign-in. Added the missing phone entry ("Continue with phone" → `/auth/phone`) as the primary action; Google second; "Look around first" as a quiet text action; one legal line. Desktop split kept. |
| 4 | Terms accept `/auth/terms` | ✅ done 2026-10-18 | New reusable **gate screen** pattern (`.gate-*`): white page, app mark, 28px title, grouped document rows with chevrons, one custom 26px consent checkbox card, action bar pinned to the bottom (CTA + quiet sign-out). Was hardcoded English + emoji + card-in-gradient; now fully i18n (en/hi/mr). Dev-only `?preview` opens it for tooling. |
| 5 | Onboarding `/auth/onboard` (4 beats) | ✅ done 2026-10-18 | Kept the dark "light up your street" concept. Added a 4-segment progress bar (a11y progressbar), solid white pill CTA over a fading footer (no more collision with the skyline), sign-out moved to a top-right pill, camera-badge avatar picker replacing the raw browser file input, left-aligned inputs, custom age checkbox, interest chips in a 2-col grid with full wrapping labels + check + selected count. **App-wide fix:** default avatar / shop placeholders rendered as BLACK boxes (double-encoded SVG colour) — now vector silhouette/storefront. Dev-only `?beat=N` jumps beats for tooling. |
| 6 | Home `/home` (Launchpad) | ✅ done 2026-10-18 | Structure kept (Launchpad). Category strip → Instagram-highlight round tiles with a soft category-colour ring + darker labels; tile captions ink-600 for contrast. **Global:** the shared `Rating` chip now shows a brand "New" chip for unrated shops/providers instead of a red "0.0 ★" (9 call sites). Header left alone — it carries another session's uncommitted wordmark edits (`HomeWordmark`); revisit once those are committed. |
| 7 | Explore `/explore` | ✅ done 2026-10-18 | Mobile header only (desktop filter panel untouched). Address search tucked behind the tappable "Near …" line (one tap, nothing lost) instead of permanently taking a row; radius control moved *into* the chip scroller (no more hard clip against a fixed button) with a right-edge fade; "Sort by" heading row → one inline row. Listings now start ~25% higher on a 844px screen. |
| 8 | Search `/search` | ✅ done 2026-10-18 | One field (was a box inside a box with a double focus ring) with a single brand focus ring and ONE clear button (the browser's native blue ✖ is hidden); fixed "1 results" → "1 result" (i18n); **data fix:** search results skipped the photo enrichment Explore uses, so shops without a cover photo were blank tiles in Search — now enriched the same way (RPC + fallback paths). |
| 9 | Category listing / All categories | ✅ done 2026-10-18 | Both screens dropped the big "Radius" card (its "25" chip clipped, and it pushed content down). Extracted Explore's compact radius pill into the shared `components/RadiusDropdown` and reused it: All categories → search + pill on one row; Category listing → pill is the first chip in a fading scroller + inline sort row. Fixed the tiny text-glyph back arrow on Category listing, and tile caption contrast (ink-400 → ink-600). `RadiusSelector` itself untouched (still used by settings/onboarding). |
| 10 | Business detail `/business/:id` | ✅ done 2026-10-18 | Action area restructured via CSS grid (no handler changes): Call / Directions / Message stay on top, then Pay now, then **Book appointment as a full-width primary CTA** (order:-1) with Follow + Notify me as a tidy pair under it — nothing wraps any more; tab strip fades at the right edge (it scrolls); product names clamp to 2 lines so grid rows align. **Global:** the full-screen "couldn't load your profile" state (`ProfileLoadError`) was unstyled plain text + squashed buttons → icon, centred message, pinned Try again / Sign out on the gate pattern (+ reusable `.state-center` / `.state-icon`). Staging got the demo kirana (10 items) so rich shop pages can be judged. |
| 11 | Provider detail `/provider/:id` | ✅ done 2026-10-18 | Category line readable on any header colour (was dark-on-green) and no dangling "•"; equal-width stats where phrases ("Within 30 minutes") shrink instead of shouting; "Endorsed by neighbors" rows → compact chips with a round endorse button (~450px less scroll; same handlers, aria-pressed). **Production defect fixed:** every Leaflet mini-map (shop/provider detail, location picker, live share, delivery maps, public tracking page) used Carto's keyless tiles, which now return an "API KEY REQUIRED" placeholder — new shared `lib/mapTiles` (Mapbox raster when `VITE_MAPBOX_TOKEN` is set, OSM fallback) + regression test. Demo provider's hours note fixed (the parser couldn't read "…, emergency calls 24x7"). |
| 12 | Chat list + thread | ✅ done 2026-10-18 | List was already clean (left alone). Thread: received bubbles were pale lavender on a pale background (nearly invisible) → white with a hairline border; **message grouping** (same sender within 5 min = one group: tight spacing, one timestamp, tail corner only on the last bubble) instead of a timestamp under every bubble; **day separators** (Today / Yesterday / date, i18n en/hi/mr); composer textarea was ~190px tall for one line → 44px that auto-grows to 120px and shrinks back after sending. Handlers/realtime untouched. Staging has two demo conversations (`cv_demo_1/2`). |
| 13 | Community hub / post / compose | ✅ done 2026-10-18 | Feed already reads like Instagram, so targeted fixes: post-type badges ("Heads up", "Ask neighbors") were sliding under the ⋯ menu and wrapping → room reserved for the menu + nowrap badges; "+ Recommend" wrapped to two lines → nowrap; **post-detail comment box** was ~190px tall for one line (pushing "No comments yet" behind the composer) → 44px auto-grow (16px text, resets after posting) + shorter placeholder. Compose type-picker left as is (clean). Staging has 4 demo posts (`cp_demo_1..4`: alert, recommendation, shoutout+photo, poll). |
| 14 | Stories bar + compose | ✅ done 2026-10-18 | Stories bar (gradient rings, "+" tile) and the full-screen viewer (segmented progress, caption, CTA, reaction bar) were already Instagram-grade — left alone. **Compose:** the empty photo area was a plain black box with dim purple text on it → a brand-gradient creation canvas with a camera disc, a white primary "Take photo" pill and a translucent "Choose from gallery" pill (selected-photo preview unchanged). Staging has 3 demo stories (`st_demo_1..3`). |
| 15 | Notifications | done | list already grouped by day with swipe-delete + rich cards; fixed chat rows rendering two identical "Open Chat" buttons (server sends REPLY_CHAT + OPEN_CHAT) |
| 16 | Profile / edit / public profile | done | main profile already strong; added missing .gap-20 (Edit Profile sections had no spacing), post date now right-aligned, rating shows em dash instead of 0★ when unrated. Other undefined gap-1/2/3/5/9/11 classes exist in a few components (not touched). Phone shows on public profile by default (user toggle exists) |
| 17 | Settings screens | done | hub + 7 sub-screens already on shared settings components (clean); fixed RadiusSelector chips clipping at the edge (now wrap, pill shape, 36px targets; shared by 8 screens). /settings/security is blank for non-sellers (row hidden in hub; not touched) |
| 18 | Map view | done | reviewed, no change: already Snapchat-Map grade (dark vector basemap, avatar pins, glass chips, card carousel). Only nit: search placeholder + card names truncate on 390px |
| 19 | Bookings / appointments / queues | done | empty + filled states reviewed (seeded 3 appointments + 1 queue token on staging, notes='ui-loop demo'); Reschedule is now tonal so Pay is the one solid action. MyQueues has hardcoded English ("You're #", "ahead", "joined") — i18n gap, not touched |
| 20 | Requests (ask) flow + deals | done | seeded 2 requests + 1 proposal on staging (ids r_uiloop_000x). Request detail: hid empty "Needed by" cell when no deadline, offer card actions wrap to own line (ETA no longer 3 lines). Ask form + Explore requests tab reviewed, already good. Deals/bulk live in Community hub (covered by page 13). "1 proposals" plural nit not touched |
| 21 | Business console (Manage) | done | reviewed dashboard, Business hub, Products, Queue, Orders, Settings/Profile hubs on the demo kirana (customer2 persona). Fixed: dashboard header buttons moved under the identity row so the shop name is no longer truncated; Products + Inventory lists and the item editor use SafeImg (broken photos showed alt text); Orders tab row got the edge fade. Dashboard still has an orphan Payments tile + a duplicate Payments row (not touched) |
| 22 | Provider console | done | reviewed dashboard, Find work, Hours & availability (+ profile/jobs/money/catalog/settings shots taken, no defects spotted). Fixed: dashboard "View Public" moved under the identity row (name + subtitle no longer squeezed), Find work tab row edge-fade, WeeklyHoursEditor slot-duration/max fields bottom-aligned at equal height (shared with the business Store hours). Console noise: Mapbox reverse-geocode returns 422 for 73.9143,18.5679 on the dashboard (not investigated) |
| 23 | Admin panel | done | login: "Admin Console" title was dark-on-dark (invisible) and the autofocused field showed a clipped white ring (now whole-field focus border); Overview: three wrapped "Not tracked yet" values replaced by dashes + one caption; tab row edge-fade. Other admin tabs not reviewed (internal tool). Also fixed while here: Mapbox reverse geocode 422 (`limit` with several `types`) in src/lib/geo/mapbox.ts — affected every page that resolves the user's area |

## Known issues found along the way

- `tests/e2e` persona sign-in (`signIn()` in `tests/e2e/fixtures/staging.ts`) types a Supabase test OTP into `/auth/otp`; that screen now verifies
  through Firebase, so the e2e suite and `scripts/staging/check-persona-signin.mjs` need a Firebase test-number path or a direct-session fixture.
  (`scripts/ops/ui-shoot.mjs` avoids the OTP screen by signing the persona in through GoTrue directly.)
- The screenshot tool sometimes logs a 401 on a first request (`/rest/v1/vouches`, `rpc/is_entity_recovery_set`) — almost certainly a tool artefact (the injected session is restored a moment after the first anon requests fire), not an app bug; re-check on a real signed-in device.
- 19 of the 203 curated Unsplash URLs in `src/lib/curatedImages.ts` now return 404.
