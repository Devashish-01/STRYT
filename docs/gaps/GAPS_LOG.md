# Bug / Gap Log

**Purpose:** every real defect or usability gap found while dogfooding the app
gets one entry here — not just filed and forgotten in chat. Read this before
re-reporting something that sounds familiar; check it's not already fixed.

## How to use this

- One entry per issue. Never edit history — if a "Fixed" entry regresses,
  open a **new** entry that references the old one (`Regression of #N`).
- **Status** is one of: `Open` · `Fixed` · `Won't fix` (with reason) · `By design` (with reason).
- Keep the **Reported** field verbatim-ish — the user's own words for the
  symptom, not a cleaned-up paraphrase. What it looked like to them is the
  fact that matters most when re-verifying.
- Root cause should name the actual file/line/function, not a vague area —
  that's what makes this log useful for a future debugging session instead
  of just being a changelog.

---

## #32 — Map's two location buttons were indistinguishable on a phone

**Status:** Fixed — 2026-09-20 (not yet committed).
**Reported:** "Map पर दो buttons हैं… एक location का और एक change location का, तो वह समझ नहीं पा रहे user
कि कौन-सा वाला है।"

**Root cause — the labels existed, but not where a phone user could see them.** Both controls sat in the
same right-hand column as identical 40px glass circles:

| | Element | Icon | Label |
|---|---|---|---|
| Upper | `.map-fab-pin` (`MapView/index.tsx`) | `MapPinPlus`, `--brand-600` | `title="Set location manually"` |
| Lower | `.map-fab-recenter` (`MapView/MapControllers.tsx`) | `Navigation`, `--brand-500` | `title="Re-centre"` |

`title` is a **hover tooltip**. On a touch device it renders nothing at all, and neither button had an
`aria-label`, so screen readers got nothing either. What a phone user actually saw was two same-sized,
same-styled purple circles one above the other — and `--brand-500` vs `--brand-600` is not a
distinguishable difference at 18px.

**Why it mattered more than it looked.** The two are not variants of one thing:
- **Re-centre** is a *view* action — move the camera, costs nothing, tapped constantly, and it follows
  the arrow-in-a-circle convention every map app shares.
- **Set location** is a *data* action — it rewrites `users.lat/lng`, the coordinates the entire app
  filters discovery by. Tapping it by mistake silently moves your home.

A reversible action and a consequential one looked identical.

**Fix:** stop making them look alike, and put the words where they are visible.
- `.map-fab-pin` is now a **labelled pill** (`chip-pill`) reading "Set my location" — icon plus text.
  The unfamiliar, consequential control is the one that gets words.
- Re-centre stays **icon-only**, deliberately: it is the control people already know, and turning both
  into pills would just create two competing labels in the same corner.
- Both gained a real `aria-label` describing the *effect*, not the control's name —
  "Centre the map on where I am now" and "Change my saved location by picking a point on the map".
- The pill uses `width: max-content` with a viewport-bounded `max-width`; the Hindi and Marathi strings
  are considerably longer than the English, and a fixed width would have clipped them.

**Files:** `src/screens/MapView/index.tsx`, `src/screens/MapView/MapControllers.tsx`, `src/index.css`,
`src/lib/i18n/{en,hi,mr}.ts` (3 new keys each, counts stay equal at 1780).

**Not changed:** the stacking maths. `--map-pin-bottom` is derived from the *Re-centre* button's height,
which sits below, so the pill's own height does not affect the offset.

---

## #31 — `spatial_ref_sys` is writable by anyone holding the publishable key

**Status:** Open — **we cannot fix this with a migration**; options below are for the owner.
**Found:** 2026-09-20 by the new IDOR sweep (`scripts/db-tests/idor-sweep.mjs`), on its first real run.

**What is wrong (verified on staging and matching production's advisor):** PostGIS's `spatial_ref_sys`
lives in `public`, so PostgREST exposes it, and both `anon` and `authenticated` hold
`SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER` on it with **RLS off**. Confirmed against
the live API, not just the catalogue — using only the publishable key:

```
anon DELETE /rest/v1/spatial_ref_sys?srid=eq.-999  -> 204  (authorized; filter matched nothing)
anon PATCH  /rest/v1/spatial_ref_sys?srid=eq.-999  -> 204  (authorized)
anon SELECT                                        -> 8500 rows
```

A filter that matches rows instead of none would delete them. Nothing in the app needs this table to be
writable by anyone.

**Actual blast radius — smaller than it first looks, and worth being precise about.** Wiping the table
was tested inside a transaction on staging and rolled back:

| After deleting all 8500 rows | Result |
|---|---|
| Nearby search (`ST_DWithin` on `geography`) | **still works** — PostGIS treats geography as 4326 without consulting the table |
| `ST_Transform` | **broken** (`XX000`) |

STRYT uses no `ST_Transform` anywhere (only `ST_SetSRID` / `ST_MakePoint` / `ST_DWithin`), so discovery
would survive. This is therefore **unauthorized write access to a system table in our database**, not a
discovery outage — serious, but not the emergency the raw permissions suggest. It would become one the
day any feature needs a coordinate transform.

**Why we cannot just revoke it:** the table is owned by `supabase_admin`, and `postgres` has no grant
option on it — `revoke all on public.spatial_ref_sys from anon, authenticated` runs as a silent no-op
(PostgreSQL warns rather than errors when a non-owner revokes). Tested on staging 2026-09-20. The same
reason `20260824` already records for `postgis_cache_bbox`: *"we don't own those and ALTER/REVOKE on them
fails"*.

**Options, for the owner:**
1. **Move PostGIS out of `public`** into an `extensions` schema. This is the correct fix and is what
   Supabase's own advisor means by its `extension_in_public` WARN — the table simply stops being exposed.
   Cost: every `SECURITY DEFINER` function pinned to `set search_path = public` would need
   `public, extensions`, which is 50+ functions. Its own migration and its own testing pass.
2. **Ask Supabase support to revoke** the grants on the managed table. Cheapest if they will do it.
3. **Accept and document**, on the strength of the blast-radius test above — but then re-open this the
   moment anything starts using `ST_Transform`.

**Note:** this is the only finding the sweep produced once every intentional exposure was justified in
`scripts/db-tests/idor-allowlist.json`. Every privacy-sensitive table tested clean — see #30's sibling
note below.

---

## #30 — `tracking_tokens` was world-readable: every live tracking token enumerable by anyone

**Status:** **Fixed** — applied to staging (`laswruzdyqehziyupmdm`) and production (`gnswxlfmcwyhmzlfipql`)
2026-09-20, verified read-only; migration ledger repaired the same day (see `supabase/APPLY_LOG.md` row 55).
**Found:** 2026-09-20, while proof-reading an external architecture review against the codebase. The review
flagged the *public tracking URL* as a risk and recommended high-entropy tokens plus expiry — both of which
STRYT already had. The actual hole was one line above the thing it recommended fixing.

**What was wrong (verified against production `gnswxlfmcwyhmzlfipql`, 2026-09-20):**
- `public.tracking_tokens` carried `CREATE POLICY tt_read ... FOR SELECT TO PUBLIC USING (true)`;
- `anon` and `authenticated` both held `SELECT` on the table (plus INSERT/UPDATE/DELETE/TRUNCATE/
  REFERENCES/TRIGGER).

So any holder of the publishable key could `select * from tracking_tokens`, harvest every unexpired token id,
and replay each through `get_tracking()` — which for the agreement branch returns the responder's live
`provider_lat` / `provider_lng`, name and avatar. The token's `gen_random_uuid()` entropy and its `expires_at`
window were doing no work, because the *list* of live tokens was itself public. Enumeration never needed to
guess a token; it could just read them.

**Root cause — a leftover, not a mistake in the current design:** in the initial commit (`a9d6c1d`)
`src/screens/TrackingPage.tsx:56` read the table directly
(`.from("tracking_tokens").select("*").eq("id", token).maybeSingle()`), and `tt_read` existed to let a
signed-out visitor do that. The read later moved behind the `get_tracking()` RPC
(`TrackingPage.tsx:76`, `:156`) but the policy and the table grants were never withdrawn. Same shape as the
`queue_tokens` leak: a permissive rule that outlived the code path it was written for.

**Blast radius — nil, confirmed before writing the fix:**
- the table holds **0 rows** on production, so no token has ever been created by any path and nothing has
  actually leaked;
- only three functions reference it — `get_tracking`, `agreement_create_tracking_token`,
  `appointment_create_tracking_token` — and all three are `SECURITY DEFINER` owned by `postgres`, so they
  need no grants to `anon`/`authenticated`;
- no view or materialized view references it;
- no current app code touches the table (only generated rows in `src/types/database.types.ts`).

**Fix:** `supabase/migrations/20260992_tracking_tokens_not_world_readable.sql` — drops `tt_read` and
`tt_insert`, revokes all table grants from `anon` and `authenticated`, leaves RLS enabled so the table is
default-deny rather than merely ungranted. `get_tracking(text)` stays granted to `anon` (that is the point of
a share link); the two `create_*` RPCs stay granted to `authenticated` only.
Rollback: `supabase/rollbacks/20260992_tracking_tokens_not_world_readable.rollback.sql`, built from the live
catalog.

**Staging result (2026-09-20)** — staging carried the identical pre-fix state. After applying, three
role-scoped checks run as `anon`:

| Check | Result |
|---|---|
| direct `SELECT` on `tracking_tokens` | PASS — denied (`42501`) |
| `get_tracking()` RPC | PASS — executed, 0 rows (SECURITY DEFINER still reads the table) |
| direct `INSERT` | PASS — denied (`42501`) |

So the hole closes and the signed-out share link keeps working.

**Production result (2026-09-20)** — applied by the owner; verified read-only by the agent. 0 policies, no
`anon`/`authenticated` grants, RLS on, 0 rows, `get_tracking` still granted to `anon`. The same role-scoped
checks pass, plus `authenticated`:

| Check | Result |
|---|---|
| `anon` direct `SELECT` | PASS — denied (`42501`) |
| `authenticated` direct `SELECT` | PASS — denied (`42501`) |
| `anon` direct `INSERT` | PASS — denied (`42501`) |
| `anon` `get_tracking()` RPC | PASS — executed, 0 rows |

Snapshots `2026-09-20_pre_20260992.sql` → `2026-09-20_after_20260992.sql`: policies 212→210, table grants
263→261, nothing else changed. Security advisor shows no new finding; `tracking_tokens` now sits under the
INFO lint `rls_enabled_no_policy`, which is the intended end state.

**Ledger repair (2026-09-20, same day):** the production apply initially left **no row** in
`supabase_migrations.schema_migrations` — it did not go through the Management API endpoint, so baseline +
migrations would have silently skipped this fix on any rebuild and re-opened the hole. Repaired by inserting
version `20260920045700`, name `20260992_tracking_tokens_not_world_readable`, with the migration body in
`statements` so the row matches staging's `20260920043851` exactly. Ledger now 178 → 179 rows and the tail
reads `20260920045700 20260992_tracking_tokens_not_world_readable`. Rebuildability (P06) is intact again.

**Lesson worth keeping:** applying production DDL through the Supabase SQL Editor leaves the database correct
and its provenance wrong — the most expensive kind of silent drift, because nothing fails at the time. HANDOFF
rule 3 exists for this. Prefer `apply_migration` / `scripts/release/apply-production-migrations.mjs`; if the
Editor is ever used, write the ledger row in the same sitting.

**Follow-up worth doing, not done here:** this was found by reading one file. Nothing systematically checks
for `USING (true)` policies that outlived their caller — 206 policies and 248 functions have never had a
cross-account sweep. Assume there is a second one.

---

## #29 — Pharmacy listings could be read as selling prescription medicines

**Status:** Mitigated in policy — 2026-09-20 (not yet committed). Product decision and counsel review still open.
**Found:** while filling Play Console's Health apps declaration (20 Sept).

**What the app does:** `src/lib/businessPackages.ts` ships purpose-built packages for `clinic` (consultation
booking), `diagnostics` (book a test), `pharmacy` (catalog + **orders**) and `vet`. A pharmacy can therefore list
items and take orders through STRYT, and nothing in the code or the policies distinguished prescription-only
medicines. There is no prescription upload, and no verification step anywhere (`grep -ri prescription src/`
returns one unrelated string in `curatedImages.ts`).

**Why it matters:** Google restricts apps that facilitate the sale of prescription medicines, and Indian law
(Drugs and Cosmetics Act, Schedules H/H1/X) requires a registered practitioner's prescription. The old wording
banned only "illegal drugs, controlled substances" — silent on prescription-only medicines.

**Done (policy):** an explicit ban on listing, ordering or arranging prescription-only medicines, in the three
places a merchant or member would look:
- `legal/acceptable-use-policy.md` §3 (prohibited goods and services),
- `legal/community-guidelines.md` (the trade rules),
- `legal/merchant-terms.md` §7.4 — the fullest statement: what a pharmacy, clinic or lab *may* list, the
  Schedule H/H1/X ban, that STRYT holds no prescription, and that dispensing stays the merchant's own duty.

**Still open, for the owner:**
1. Counsel to confirm the wording is enough for India, alongside the other launch documents.
2. Product: the rule is written but not enforced in code. Options — leave as policy-only (moderators remove
   offending listings, reports already exist); add a blocked-word check on pharmacy catalog items; or build a
   prescription flow in v1.1 and allow it properly.

**Play declaration filed with this:** *Healthcare services and management* (the app books appointments with
clinics and labs), not "no health features".

---

## #28 — UI spacing audit (2026-09-19): index of #19–#27

**Status:** Fixed — 2026-09-19 (not yet committed). Owner: "fix all"; #25 option B (lock text size); #27 checked fine on a phone.
**Reported:** "some buttons overlap and some are out according to the android app but not proper … do a code level through check of the spacing b/w the buttons"

**How it was checked:** every route (96, by the persona that uses it) opened on staging at 360×740 — a common
Android width — with the native app's safe-area floor (`.native-safe`) switched on, then measured in the page:
tappables overlapping, anything partly past the screen edge, tappables touching, label text wider than its
button, tap targets under 32px, and (scrolled to the end) the last items stuck under the bottom nav or a
sticky bar. Run twice: normal text, and text at 130% (Android's largest font size — the WebView scales all text
by the phone's font setting, see #25). Reads only: writes were blocked in the browser and the staging reseed was
off. Then each hit was root-caused in code, and the pinned-bar / grid patterns were swept statically.

**Most screens pass at normal size.** The real problems cluster in: bars pinned to the bottom (#19, #20), the
two console headers (#21, #22), the listing-page tab strips (#23), the map's bottom stack (#24), and what large
text does to fixed layouts (#25).

---

## #27 — Small maps may show an "API KEY REQUIRED" stamp

**Status:** Not a bug — the owner checked a small map on a real phone (2026-09-19): it renders cleanly. The stamp only shows on the local staging preview.
**Area:** `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/…` in `components/MiniMap.tsx:47`,
`components/LocationPicker.tsx:211`, `features/live-share/LiveLocationCard.tsx:46`, `screens/TrackingPage.tsx:100`,
`screens/business/manage/BusinessDeliveries.tsx:193`, `screens/delivery/DeliveryConsole.tsx:755`

**Seen:** the business Edit-profile mini map (staging preview) is covered in "API KEY REQUIRED" text. The big Map
screen is unaffected — it uses OpenFreeMap (`MapView/index.tsx:59`).

**Fix:** if it shows on stryt.in / the app too, move these six raster layers to a free source that needs no key
(OpenFreeMap raster or OSM tiles within their usage policy), keeping the attribution.

---

## #26 — Small layout slips (one entry, each a one-liner)

**Status:** Fixed — 2026-09-19 (not yet committed). All six below, plus 7–8 found while fixing.

1. **Explore — "Sort by" chips touch the first result card.** `Explore.tsx:548` sets `paddingBottom: 0` on the
   mobile sort row and the list adds no top space. Give the row 12px bottom padding.
2. **Ask — the mic button sits on the description box's text.** `AskCompose.tsx:484–500`: the button is absolute
   at the textarea's bottom-right but the textarea reserves no room, so longer text runs under it. Also no
   `aria-label`. Add right/bottom padding to the textarea and a label.
3. **Rails I broke on 2026-09-19 (`f9033af`).** `.hscroll` got `scroll-padding-inline: 16px`, but nine rails
   override its padding to 0/2px (Home ×4 `Home.tsx:806/879/889/900`, `Explore.tsx:504`, `AskCompose.tsx:382/608`,
   `PlaceDetail.tsx:110`, `CommunityHub.tsx:676`), so after a swipe they snap with a 16px sliver of the previous
   card. Make the scroll padding follow the padding (a `.hscroll-flush` modifier, or `scrollPaddingInline: 0`).
4. **Toast overlaps the nav on 3-button-navigation phones.** `index.css` `.toast { bottom: calc(var(--nav-h) + 20px) }`
   ignores `--safe-area-bottom`; with a 48px system bar the nav top is higher than the toast. Add the inset.
5. **Provider nav — "Profile" label sits ~4px higher than the rest**, because the four tabs wrap their icon in
   `.provider-nav-icon` and `FooterProfileTab` doesn't (`ProviderManageNav.tsx:31–47`). The four tab labels
   ("Today", "Jobs", "Find work", "Money") are also hard-coded English.
6. **Small tap targets** (under 32px): the radius pills ("500m" … "25 km"), text-only buttons ("Add second shift",
   "View →", "● Available", "Cancel"), `.icon-btn-sm` (32px), `.set-switch` (26px tall). Android asks for 48dp;
   this app's own rule is 44px. Grow the hit area with padding (not the visuals) on the shared classes.
   *Done:* `.icon-btn-sm` and `.set-switch` get an invisible 44px ring (`::before`; the switch's `::after` is its
   knob). The radius pills and the one-off text buttons are unchanged.
7. **Community header crowded at 360px** (found while fixing #25 — the scan only compared tappables). Back + four
   44px buttons left the title ~68px: "Community" ran under the first button and the place name in the pill
   vanished ("· 5 km"). The Filter button opened the same sheet as the pill, so it's gone; the pill is labelled
   "Filter & sort" and shows a dot when a filter is on. The title now has ~120px.
8. **Hours — the same-every-day time boxes** were 90px and cut "00:00" next to the browser's clock icon
   (`WeeklyHoursEditor.tsx`); now 104px.

---

## #25 — Large phone font size breaks fixed layouts

**Status:** Fixed — 2026-09-19 (not yet committed) — owner chose **B: lock the text size** in the app (`MainActivity.lockTextSize()` → `WebView.setTextZoom(100)`; ships with the next Android build, not an OTA). The cheap layout guards were done too, since they also protect stryt.in in a phone browser: `.nav-item` can shrink with an ellipsis label (`.manage-nav` tabs size to their labels), the 21 grids use `minmax(0, 1fr)`, the Community title ellipsizes.
**Area:** Android WebView text zoom (not set anywhere: `android/app/src/main/java/in/stryt/app/MainActivity.java`,
`capacitor.config.ts`)

**Root cause:** the WebView scales every font size by the phone's Settings → Display → Font size (up to 130%),
but boxes sized in px don't grow. At 130%:
- Business dashboard: header buttons pushed off-screen (worse #21), the 2-column tile grid runs past the right
  edge ("Appointments" cut), and the 6-tab console nav cuts "Profile" to "Prof".
- Community: the header's round buttons cover the "Community" title; the location pill shrinks to "· 5 km".
- Listing tabs run together ("AboutReviews", #23); map "Open now" label spills out of its button.
- Business console bottom nav (every console screen): "Appointments" widens its tab and the **"Profile" tab is
  pushed off the right edge** (x 329–382 of 360). `.nav-item` is `flex: 1` with no `min-width: 0`, so a tab can't
  shrink below its label (`ManageNav.tsx:60–70`; labels there are also hard-coded English).
- Provider dashboard: "View Public →" pushed past the edge (x 321–389) — worse #22.
- Community: the location pill cuts "Test Nagar · 5 km" to "· 5 km" once the title column shrinks.
- Ask: the mic button covers the description box's text (#26.2).

**Grid pattern (21 places):** `grid-template-columns: 1fr 1fr` (and `repeat(n, 1fr)`) can't shrink below a
cell's min-content, so large text or one long word pushes the grid past the screen. Seen live on the business
dashboard; the same pattern is in `index.css:850/2064/2684/3686/7861`, `ManageDashboard.tsx:666`,
`ProviderDashboard.tsx:651`, `AllCategories.tsx:115/128`, `ProviderDetail.tsx:517`, `Achievements.tsx:36`,
`MyActivity.tsx:68`, both Portfolio screens, `AppointmentSheet.tsx:862/892` (time-slot grid),
`PaymentMethodPanel.tsx:114`, `AdminDashboard.tsx:19`. Fix: `minmax(0, 1fr)`.

---

## #24 — Map: the location banner covers the map buttons and the map credit

**Status:** Fixed — 2026-09-19 (not yet committed) — new `MapView/MapBottomDock.tsx` measures itself into `--map-dock-h`; the pin/recenter buttons and the credit line add it (guest notice and pin-drop card both use it).
**Area:** `index.css` `.map-bottom-dock` (~4716), `.map-fab-recenter` / `.map-fab-pin` (~4735), `.map-attribution` (~4750)

**Seen:** with location off, "Turn on location to see what's near you" sits on top of the recenter button (and
at large text the pin button too) and over "© OpenStreetMap contributors".

**Root cause:** all three are positioned from the same baseline — `bottom: calc(var(--map-carousel-h) + 4…12px)` —
and the dock (z 1002) is drawn above the buttons (z 1001). Nothing moves the buttons up when the dock has content.

**Fix:** measure the dock (ResizeObserver → `--map-dock-h`, like `--map-carousel-h` already is) and add it to
the buttons' and the credit line's `bottom`.

---

## #23 — Business and provider pages: the six tabs don't fit a phone

**Status:** Fixed — 2026-09-19 (not yet committed) — `.detail-tabs` / `.detail-tab` (index.css): tabs share the width when they fit, scroll sideways when they don't, never wrap.
**Area:** `BusinessDetail.tsx:637–651`, `ProviderDetail.tsx:306`

**Seen (normal text):** "Services (3)" and "Posts (0)" wrap onto two lines while "Work (2)" stays on one — uneven
tabs, labels on different baselines. At 130% the labels run into each other ("AboutReviews").

**Root cause:** up to six tabs, each `flex: 1` with `gap: 0`, in a strip that can't scroll — ~55px per label.

**Fix:** a sideways-scrolling tab strip (`overflow-x: auto`, tabs `flex: 0 0 auto`, `white-space: nowrap`,
12px side padding), keeping it sticky.

---

## #22 — Provider dashboard header is overcrowded

**Status:** Fixed — 2026-09-19 (not yet committed) — "View Public →" moved next to the name (`nowrap`), the top row got an 8px gap, the name ellipsizes, the greeting line is at full strength.
**Area:** `screens/provider/manage/ProviderDashboard.tsx:351–392`

**Seen:** the switcher touches the bell (0px gap); "View Public →" is squeezed into a three-line blob at the screen
edge; the greeting line ("Good morning • cloudy monsoon skies & cool breeze • 10 km reach") is faint and wraps
into the skyline drawing.

**Root cause:** switcher + three 32px icons + a text button that isn't `nowrap`, all in one `row between`.

**Fix:** move "View Public" into the profile block as a pill (as the business dashboard's "View shop" is), keep
the three icons, add a gap; shorten or brighten the greeting line.

---

## #21 — Business dashboard header runs off the screen: "Share shop" is cut off

**Status:** Fixed — 2026-09-19 (not yet committed) — Share moved next to "View shop"; the top row (logo + switcher + two buttons ≈ 348px) now fits 360px.
**Area:** `screens/business/manage/ManageDashboard.tsx:423–456`

**Seen:** the Share button ends at x=365 on a 360px screen (half cut); at 130% text both the chat and share
buttons are off-screen. The greeting line wraps as "… 5 km / reach".

**Root cause:** one row holds the STRYT logo (83px) + the business switcher (~145px, name capped at 120px) + three
32px buttons + gaps + 32px page padding ≈ 388px — too wide for 360px whatever the business is called.

**Fix:** drop the logo from this row on narrow screens (the console already says whose shop it is) or move Share
next to "View shop"; let the icon group shrink.

---

## #20 — Bars pinned to the bottom ignore the Android navigation bar

**Status:** Fixed — 2026-09-19 (not yet committed) — shared `.action-bar` (index.css) used by the eight standard bars; BusinessDetail's floating cart button got the inset inline; each screen's end padding is `calc(90px + var(--safe-area-bottom))`.
**Area:** nine page-level bars, each `position: absolute; bottom: 0` with plain 12–14px padding:
`BusinessDetail.tsx:1032` (Book / Join), `ProviderDetail.tsx:589`, `BusinessOnboard.tsx:784`,
`ProviderOnboard.tsx:510`, `HoursEditor.tsx:201`, `ProfileEditor.tsx:269`, `ProviderProfileEditor.tsx:147`,
`AskCompose.tsx:696`, `StoryCompose.tsx:392`

**Root cause:** the app draws edge-to-edge (Capacitor 8, targetSdk 36, `StatusBar.setOverlaysWebView` in
`App.tsx:495`), so on phones with 3-button navigation the system bar covers the bottom ~48px. These bars don't add
`--safe-area-bottom`, so their main button sits partly under the Back/Home/Recents buttons. `RateScreen`,
`RequestDetail`, `SubmitProposal`, `CommunityPostDetail` and `ProfileEdit` already do it right.

**Fix:** one shared `.action-bar` class — `padding-bottom: calc(12px + var(--safe-area-bottom))` — used by all
nine, with each screen's scroll padding matched so the last field isn't hidden under the bar.

---

## #19 — Business "Edit profile": the Save button is hidden behind the bottom nav

**Status:** Fixed — 2026-09-19 (not yet committed) — `.with-nav > .action-bar` sits at `bottom: calc(var(--nav-h) + var(--safe-area-bottom))`, above the console nav. Checked on screen at 360px with a 48px Android bar.
**Area:** `screens/business/manage/ProfileEditor.tsx:269` (bar), `:175` (`screen with-nav`)

**Seen:** at the top of the screen and scrolled to the very end, "Save changes" is nowhere to be seen — the
console's bottom nav (Home · Queue · Appointments · Services · Business · Profile) sits on top of it.

**Root cause:** the Save bar is `position: absolute; bottom: 0`, and this route also shows the console nav,
which is `position: fixed; bottom: 0; z-index: 50` — the bar is drawn underneath it. The provider twin
(`ProviderProfileEditor`) doesn't show a nav on its route, so it's fine.

**Fix:** put the bar above the nav — `bottom: calc(var(--nav-h) + var(--safe-area-bottom))` when the nav is
shown — and raise the scroll padding by the same amount. Do it with #20's shared class.

---

## #18 — Two retired bulk-order RPCs are still live and callable

**Status:** Fixed — 2026-09-08 (`20260921_drop_retired_instant_order_rpcs.sql`, applied & verified live)
**Area:** `supabase/migrations/20260827_bulk_checkout.sql` — `bulk_deal_order`, `bulk_deal_quote`

**Fix:** both dropped. Worth recording that this **completes a cleanup
`20260900` explicitly deferred**, rather than reversing a decision — that
migration's own header reads: *"bulk_deal_order()/bulk_deal_quote() … are left
in place, untouched, in this migration — the client still calls them until the
pledge-flow ships (a later phase). Do not drop them here."* The pledge flow has
since shipped, so the condition it named is satisfied.

**Checked before dropping:** zero references anywhere in the repo outside
migration text and the generated `database.types.ts` — no `src/`, no
`supabase/functions/`, no `supabase/legacy/`, no scripts.

**Verified after:** both functions gone from `pg_proc`; all 12 campaign-model
RPCs still present; and a live rolled-back `bulk_deal_pledge_join` still
succeeds, confirming nothing in the current flow depended on them.
`bulk_deals.available_quota` deliberately left alone — the campaign model still
uses that column as its pool cap (`#16` / `20260920`).

`tsc`/`vitest` (518/518) clean.

**Reported:** part of the bulk-order flow audit — "make a list of all the gaps
remaining of the ui side and backend side."

**Root cause:** both functions belong to the retired instant-order model that
`20260900`'s campaign model replaced. They have zero client callers left
(confirmed by grep across `src/`, excluding generated `database.types.ts`)
but were never dropped. They were revoked from `public`/`anon` only
(`20260827:238,274`) — `authenticated` still holds EXECUTE on both, confirmed
against the live DB (`has_function_privilege('authenticated', ...) = true`).
`bulk_deal_order` still writes an appointment row and decrements
`available_quota`, so it's live surface for a model the app no longer uses.

**Fix direction:** `drop function` both, in a new migration. Check for any
non-`src/` caller (edge functions, scripts) first.

---

## #17 — Three bulk-deal notification types are orphaned, and the drift guard can't see them

**Status:** Fixed — 2026-09-08. **Scope grew: it was seven, not three.**
**Area:** `src/types/user.ts`, `src/screens/Notifications.tsx`, `src/lib/communityNotifications.test.ts`

**Fix — the guard first, deliberately.** Rather than hand-adding the three
types I'd already spotted, `typesInsertedBySql()` was rewritten to find types
by **where they appear** (positionally, inside an
`insert into public.notifications` statement) instead of **what they look
like** (an ALL_CAPS regex, then narrowed to a prefix allowlist). The orphan
check now needs no allowlist at all, so no future prefix can outrun it.

Getting that right took two attempts, worth recording:
1. First cut scoped the ALL_CAPS regex to the text of each notifications
   insert. Still wrong — it swept up `'ACTIVE'`, `'PENDING'`, `'BUSINESS'`,
   `'PROVIDER'`, `'ACTION_TAKEN'` etc. out of `WHERE` clauses and `CASE`
   expressions *within the same statement*.
2. Second cut reads the insert's own column list, finds the index of `type`,
   and pulls the expression at that index from each `VALUES` tuple (or from
   the `SELECT` list, before `FROM`). Needs paren/quote-aware splitting, since
   arguments contain `coalesce(a, b)` and `jsonb_build_object(...)`. Position
   is the only reliable signal here.

**The widened guard immediately found four more orphans than this entry
originally logged** — all silently rendering as generic grey bells:
- `BULK_DEAL_UNLOCKED`, `BULK_DEAL_REFUNDED`, `BULK_DEAL_EXTENDED` (the three
  known, from `20260900`)
- `LIVE_LOCATION` (orphaned since `20260818`)
- `CUSTOM_PAYMENT_RECEIVED` / `_CONFIRMED` / `_REJECTED` (since `20260824`)

All seven added to `NotificationType` with icon/colour metadata.
`BULK_DEAL_UNLOCKED` gets `Ticket`, matching the pass modal and the Activity
header icon — and it now has a real destination to point at, since `#9` built
the claim-pass view it deep-links to.

**Verified not vacuous:** the suite's seven existing
`"%s is actually inserted by a migration"` assertions run through the same
rewritten extractor and still pass, so it demonstrably finds real types rather
than returning an empty set. `tsc`/`eslint`/`vitest` (518/518) clean.

**Reported:** part of the bulk-order flow audit — "make a list of all the gaps
remaining of the ui side and backend side."

**Root cause:** the bulk migrations insert `BULK_DEAL_UNLOCKED`,
`BULK_DEAL_REFUNDED` and `BULK_DEAL_EXTENDED`, none of which exist in the
`NotificationType` union (`src/types/user.ts`) or the `meta` icon/colour map
(`Notifications.tsx`). All three fall through `meta[n.type] ?? meta.SYSTEM`
and render as a generic grey bell. `BULK_DEAL_UNLOCKED` is the "your claim
pass is ready" notification — the payoff of the entire feature.

**Why gap `#6` missed this:** that pass added the missing `LOCATION_*` types
only because `communityNotifications.test.ts` **failed** and forced the
issue. Its drift guard filters suspects to
`COMMUNITY_|NEARBY_|QUEUE_|LOCATION_` prefixes
(`communityNotifications.test.ts:111-113`), so every `BULK_DEAL_*` type slips
straight through it. The guard itself carries the gap — that's the real
defect here, not just the three missing entries.

**Fix direction:** add the three types + `meta` entries, and widen the test's
prefix filter (or better, drop the prefix allowlist and instead exclude known
non-notification literals, so a future prefix can't silently escape again).

---

## #16 — `available_quota` is no longer enforced server-side (oversell regression)

**Status:** Fixed — 2026-09-08 (`20260920_pledge_join_quota_guard.sql`, applied & verified live)
**Area:** `supabase/migrations/20260900_bulk_deal_campaigns.sql` — `bulk_deal_pledge_join`

**Fix:** `bulk_deal_pledge_join` now enforces the quota, with two adjustments
the campaign model demands that a straight port of the old check would have
got wrong:
- **Pool, not per-order.** Nothing decrements `available_quota` any more
  (`pledged_quantity` is the running total instead), so the check compares the
  *pool* against the cap. That matches how the card already renders it — "N
  left" — i.e. a pool cap, never a per-pledger maximum.
- **Upsert-aware.** Re-pledging updates an existing row, so the pledger's own
  current quantity is subtracted from the pool before comparing. Without this,
  someone *lowering* their pledge on a full campaign would be rejected by
  having their own units counted twice.

The pre-existing `select ... for update` on `bulk_deals` already serialises
concurrent pledgers, so two people racing for the last units can't both pass —
the same protection the original had.

Client side: `BulkOrderSheet`'s stepper ceiling now mirrors the server's rule
exactly (`availableQuota - othersPledged`) instead of using the raw quota, so
it can't offer a quantity the server will reject; a genuinely sold-out
campaign disables the pledge button with a reason rather than shipping another
guaranteed-failure tap; and `INSUFFICIENT_QUOTA` maps to a plain-words message
for the race where someone takes the last units mid-session. New
`quota_sold_out` key in en/hi/mr.

**Verified live**, one rolled-back transaction covering all five cases on a
pool capped at 10:
| case | result |
|---|---|
| P1 pledges 8 of 10 | ok, pool 8 |
| P2 pledges 5 (would be 13) | `INSUFFICIENT_QUOTA` ✓ |
| P2 pledges exactly the remaining 2 | ok, pool 10 |
| P1 lowers 8 → 3 on a **full** pool | ok, pool 5 ✓ *(the upsert case)* |
| P1 raises to 9 (others hold 2) | `INSUFFICIENT_QUOTA` ✓ |

`tsc`/`eslint`/`vitest` (518/518) clean.

**Reported:** part of the bulk-order flow audit — "make a list of all the gaps
remaining of the ui side and backend side."

**Root cause:** a genuine regression introduced when the campaign model
replaced the instant-order model. The retired `bulk_deal_order`
(`20260827_bulk_checkout.sql`) enforced the quota properly — a hard check at
`:169` plus a decrement under a row lock at `:221-223` — with the file's own
header stating the intent: "decrements available_quota under a row lock so a
deal can't oversell." The replacement `bulk_deal_pledge_join` (`20260900:125-166`)
dropped **both** the check and the decrement. The only surviving enforcement
is `maxQty` in the client's quantity stepper (`BulkOrderSheet.tsx:56`), so a
direct API call or a stale client oversells freely.

**Fix direction:** re-add the quota check inside `bulk_deal_pledge_join`.
Note it's an upsert (re-pledging changes quantity), so the check must compare
against the delta, not the raw new quantity, or a pledger lowering their own
quantity on a full campaign would be wrongly rejected.

---

## #15 — `bulk_deal_pledge_leave` has no closed-campaign guard

**Status:** Fixed — 2026-09-07 (`20260919_pledge_leave_closed_guard.sql`, applied & verified live)
**Area:** `supabase/migrations/20260900_bulk_deal_campaigns.sql:171-192` — `bulk_deal_pledge_leave`

**Fix:** the RPC now selects the deal `for update`, raises `DEAL_NOT_FOUND` if
missing and `DEAL_CLOSED` if `closed_at is not null` — symmetric with
`bulk_deal_pledge_join`, which has always had that guard.
`BulkOrderSheet.leave()` maps `DEAL_CLOSED` to plain words ("This campaign has
closed — your pledge is now part of its record and can't be withdrawn")
instead of surfacing the raw code.

**Verified live**, both directions, in rolled-back transactions:
- Closed campaign → `DEAL_CLOSED` raised, pledge count unchanged (2 → 2).
- Open campaign, impersonating a **real** pledger → leave succeeds, their row
  is deleted (1 → 0) and `bulk_deals.pledged_quantity` recomputes correctly
  (2 → 1). (First attempt at this check used a user whose pledge only existed
  in an earlier rolled-back transaction, so it proved nothing — redone against
  a genuinely persisted pledger.)

**Deliberately not included:** leaving an *open* campaign still hard-deletes a
PAID pledge. Preserving that payment record needs a soft-delete status
(`'LEFT'`), which means widening the `deposit_status` check constraint and
auditing every query that reads it — a real design change, not a guard. Left
as the open half of this entry's fix direction rather than smuggled in.

**Reported:** part of the bulk-order flow audit — "make a list of all the gaps
remaining of the ui side and backend side."

**Root cause:** `bulk_deal_pledge_join` raises `DEAL_CLOSED` when
`closed_at is not null`; `bulk_deal_pledge_leave` has no equivalent check at
all. Three consequences, all confirmed against the schema:
- It deletes the pledge row from an already-**closed** campaign and recomputes
  `pledged_quantity` downward, corrupting the historical record
  `BulkDealDetail` reads back for the business.
- `bulk_deal_tokens` FKs to `bulk_deals(id)` and `users(id)` — **not** to
  `bulk_deal_pledges`. So leaving a FULFILLED campaign deletes the pledge
  while the customer keeps a valid, still-redeemable claim pass.
- It deletes `PAID` deposit rows outright, leaving the business no record of
  who paid what. The UI warns the pledger about forfeiting
  (`leave_forfeits_deposit_note`), but the server preserves nothing.

Reachable from the UI today via `#9`/`#10` — a closed campaign still renders
its "Leave this pledge" button.

**Fix direction:** raise `DEAL_CLOSED` on leave when `closed_at is not null`.
Consider whether a paid pledge should be soft-marked (`LEFT`) rather than
hard-deleted even on an open campaign, so the business keeps the payment
record — that's a separate design call worth making explicitly.

---

## #14 — No fulfilment worklist or export for a doorstep campaign

**Status:** Fixed — 2026-09-08
**Area:** `src/screens/business/manage/BulkDealDetail.tsx`

**Fix:** a "Copy delivery list" button that puts every address the campaign
actually has to deliver to on the clipboard as one numbered block — name,
quantity, address, and any note per stop — ready to paste into whatever the
business hands its delivery person.

Two scoping choices worth recording:
- **Doorstep only.** For every other fulfilment method the customer comes to
  the shop, so there's no round to plan and the button would be noise.
- **Counts the same pledges the progress bar does** — PAID only when the
  campaign required a deposit, otherwise all of them — reusing this screen's
  existing `hasDeposit`/`confirmedQty` rule rather than inventing a second
  definition of "a pledge that counts".

Clipboard via the existing `copyText` helper (`src/lib/clipboard.ts`), same as
`ShareCard`/`PaymentMethodPanel`. `tsc`/`eslint`/`vitest` (518/518) clean.

**Reported:** part of the bulk-order flow audit — "make a list of all the gaps
remaining of the ui side and backend side."

**Root cause:** delivery addresses are shown per-pledge inline in the roster
(`BulkDealDetail.tsx:279`) and nowhere else. For a DOORSTEP campaign with
many pledgers, there's no consolidated deliverable list to work from or hand
to whoever is actually delivering.

**Fix direction:** a simple "delivery list" view or copy-to-clipboard of the
address set on a FULFILLED doorstep campaign. Low priority — flagging so it's
recorded, not because it's blocking anything.

---

## #13 — No way to contact a pledger from the business roster

**Status:** Fixed — 2026-09-08
**Area:** `src/screens/business/manage/BulkDealDetail.tsx`

**Fix:** a message button on every roster row, opening a plain 1:1 thread
(`chatService.getOrCreate(p.userId)` with no subject — the business is
contacting a customer, not the reverse, so there's no listing to attach).

One guard worth noting: the button is hidden on the viewer's own row. A team
member with `catalog` scope **can** pledge into a campaign they help manage —
only the owner is blocked server-side by `OWNER_CANNOT_PLEDGE` — so they can
genuinely meet their own pledge in this roster, and `getOrCreate` rejects
self-chat with an error. Hiding it beats catching that.

`tsc`/`eslint`/`vitest` (518/518) clean.

**Reported:** part of the bulk-order flow audit — "make a list of all the gaps
remaining of the ui side and backend side."

**Root cause:** the roster shows each pledger's name, quantity, notes and
delivery address, but offers no call or chat affordance. A business that needs
to ask about a deposit reference or a delivery address has no path to the
person from here. Mirror image of `#11` on the customer side.

**Fix direction:** a chat button per roster row, reusing the existing chat
thread path the rest of the console already uses.

---

## #12 — A campaign's fulfilment method can't be changed after creation

**Status:** By design — 2026-09-08. Not a defect; closing with the reasoning recorded.
**Area:** `src/screens/CommunityCompose.tsx` (set), `src/screens/business/manage/BulkDealsManager.tsx` (`DealComposer`)

**Decision:** leave `fulfillmentType` immutable after creation. I'd originally
flagged this as needing a product call, on the grounds that the deadline is
already editable so "locked terms" has an exception precedent. On checking the
code, it isn't only a policy question — **both switch directions break
something concrete**, which settles it:

- **PICKUP / CENTRAL_DROP → DOORSTEP.** A delivery address is only required,
  and therefore only ever collected, when `fulfillment_type = 'DOORSTEP'` *at
  pledge time* (`bulk_deal_pledge_join`'s `DELIVERY_ADDRESS_REQUIRED` check).
  Every pledge made before the switch has `delivery_address = null`, so the
  business would be left holding a roster of doorstep orders with nowhere to
  deliver them. Fixing that means re-collecting an address from every existing
  pledger — a whole flow that doesn't exist.
- **DOORSTEP → PICKUP.** Anyone who pledged *because* it was being delivered —
  which is exactly the population a delivery option exists to serve — is
  silently converted into having to travel for it.

This is materially unlike a deadline extension, which keeps the same deal and
just runs it longer.

**The owner isn't stuck**, which is what makes this defensible rather than a
dead end: `BulkDealDetail` already offers "Close campaign early" with
fulfil-anyway / refund-everyone, so a shop that can no longer deliver can close
out honestly and relaunch with the right method. That path keeps pledgers
informed instead of changing the deal under them.

**Reopen if:** a re-collect-address flow gets built, at which point the
PICKUP → DOORSTEP direction becomes safe and worth revisiting on its own.

**Reported:** part of the bulk-order flow audit — "make a list of all the gaps
remaining of the ui side and backend side."

**Root cause:** `fulfillmentType` is set once at creation in
`CommunityCompose` (`:296`) and is never editable again — `DealComposer`
deliberately exposes only title, description and quota. That file's own
comment justifies freezing price/tiers/MOQ/deposit as "terms pledgers already
joined under," which is sound reasoning. But the **deadline** is already
editable after the fact via `extendDeal` on the detail screen, so the
locked-terms rule has an exception precedent. A shop that discovers mid-campaign
that it can't deliver has no way to switch to pickup short of cancelling.

**Fix direction:** decide first whether changing fulfilment mid-campaign is
acceptable at all (it does change what a pledger signed up for — arguably
more than a deadline does). If yes, add it to `DealComposer` and notify
existing pledgers of the change. If no, close this as **By design** with that
reasoning recorded.

---

## #11 — No way to contact the business from anywhere in the pledge flow

**Status:** Fixed — 2026-09-08
**Area:** `src/components/BulkDealCard.tsx`, `src/components/BulkOrderSheet.tsx`

**Fix:** a "Message the business" action in `BulkOrderSheet`, using the same
`chatService.getOrCreate(ownerUserId, { type: "business", ... })` pattern
`BusinessDetail` and `UserProfileSheet` already use.

Shown when the viewer is signed in, isn't the owner, and the campaign is
**closed, already pledged into, or has a rejected deposit** — i.e. exactly the
states where something needs sorting out. Deliberately *not* shown on a fresh
pledge form: the sheet should stay focused on the one action, and the business
page is a tap away from the card anyway. The REFUNDED case is the one that
most needed it — its own copy says to settle "directly with the business"
while previously offering no route to them.

New `message_the_business` key in en/hi/mr. `tsc`/`eslint`/`vitest`
(518/518) clean.

**Reported:** part of the bulk-order flow audit — "make a list of all the gaps
remaining of the ui side and backend side."

**Root cause:** neither the card nor the pledge sheet has any chat or call
affordance (verified — no chat/message references in either file). For a
deposit dispute, a refund question, or a delivery problem, the customer has to
leave the flow entirely and find the business's own page. This matters most
in exactly the states where something has gone wrong: a rejected deposit, or a
REFUNDED campaign where the business is supposed to settle "directly" (see
`#9`) with no route to reach them.

**Fix direction:** a chat/contact button in `BulkOrderSheet` (at minimum on
the STATUS view and any error/refund state), reusing the existing chat path.

---

## #10 — "Leave this pledge" is still offered on a closed campaign

**Status:** Fixed — 2026-09-08 (both halves)
**Area:** `src/components/BulkOrderSheet.tsx`

**Fix:** both halves, as this entry required.
- **Server (`#15`, `20260919`):** `bulk_deal_pledge_leave` now raises
  `DEAL_CLOSED`, so the API path is shut regardless of client state.
- **Client (`#9`'s closed branch):** the PLEDGE and DEPOSIT views are now
  gated behind `!isClosed`, and the closed branch renders no leave button at
  all — so the button is gone rather than merely failing. `leave()` also maps
  a `DEAL_CLOSED` response to plain words, covering the race where a campaign
  closes while the sheet is already open.

**Reported:** part of the bulk-order flow audit — "make a list of all the gaps
remaining of the ui side and backend side."

**Root cause:** the sheet has no closed-campaign awareness at all (see `#9`),
so both the STATUS view and the PLEDGE view keep rendering their "Leave this
pledge" button after a campaign has closed. The server accepts it — `#15` is
the matching backend gap — so one tap destroys the customer's own paid-deposit
record and, on a FULFILLED campaign, orphans a claim pass they still hold.

Separate entry from `#9` because it needs the server fix (`#15`) too; hiding
the button alone leaves the API path open.

**Fix direction:** hide the leave button once `closedAtISO` is set, **and**
fix `#15` so the server refuses it regardless of client state.

---

## #9 — A closed bulk campaign renders as live, with a pledge button that always fails

**Status:** Fixed — 2026-09-08
**Area:** `src/components/BulkDealCard.tsx`, `src/components/BulkOrderSheet.tsx`, `src/screens/CommunityActivity.tsx`

**Fix:**
- `BulkDealCard` now derives `isClosed`/`outcome` from `closedAtISO` (not
  `status` — closing never flips status away from ACTIVE). Closed campaigns
  get an outcome badge (Fulfilled / Refunded / Awaiting decision) in place of
  the "Bulk buying" pill, drop the now-misleading "Closes {date}" line for a
  plain "Closed", and suppress "N more to unlock" on the progress bar (it's a
  call to action nobody can act on any more).
- The footer CTA no longer offers a pledge on a closed campaign. When the
  viewer holds a claim pass for it, it becomes a **"View claim pass"** button
  — the payoff of the whole feature, and previously unreachable from here.
- `BulkOrderSheet` gained a closed branch that replaces the pledge form
  entirely with a read-only summary: the outcome, what you pledged, and your
  deposit's final state. Copy is per-outcome and per-pledger-state, including
  the case where a campaign fulfilled but *this* pledger never got a pass
  (deposit was never confirmed), which would otherwise read as a bug to them.
- `CommunityActivity` builds a `dealId → token` map from the two lists it
  already fetches and passes each campaign its own pass. Bulk-deal tokens
  carry `dealId`; group-buy ones don't, hence the filter.
- 11 new i18n keys across en/hi/mr.

Verified: `tsc`, `eslint` and `vitest` (518/518) clean; all 11 keys confirmed
present in all three locales.

**Reported:** "see for the gaps in the bulk order flow any button should be
there which is not in the app make a list of all the gaps remaining of the ui
side and backend side."

**Root cause:** all three files contain **zero** references to `closedAtISO`
or `closeOutcome` — not one match across any of them (verified by grep).
Meanwhile `bulkService.myPledgedDeals()` deliberately returns pledges in
*every* state, its own doc comment saying the outcome should "stay reviewable
here after the campaign closes and drops out of the browse feed." So on
`/community/activity`, a FULFILLED or REFUNDED campaign renders with the same
progress bar and the same "Joined N units" CTA as a live one. Tapping it opens
the full live pledge form — quantity stepper, tier table, "Pledge N units" —
and pressing that calls `pledgeJoin`, which the server correctly rejects with
`DEAL_CLOSED`, surfacing a red error banner.

**Missing affordances, specifically:**
- No `Fulfilled` / `Refunded` / `Awaiting the business's decision` badge or
  banner anywhere on the customer side, despite the business console having a
  full status treatment for exactly these states (`BulkDealDetail.tsx:156-178`).
- **No "View claim pass" button on a fulfilled campaign** — the payoff of the
  whole feature. The pass exists, in a *separate* "Your claim passes" section
  of the same screen (`CommunityActivity.tsx`), with nothing linking the two;
  the customer has to match them up by title themselves.
- No refund status or next step on a REFUNDED campaign. The close copy tells
  the business to settle deposits "directly", but the customer is told nothing
  about what they're owed or who to contact (compounded by `#11`).

**Fix direction:** give `BulkDealCard` a closed/outcome state (badge + no
pledge CTA), give `BulkOrderSheet` a closed branch that replaces the pledge
form with the outcome and — when FULFILLED — a direct button to that
campaign's claim pass. Pairs naturally with `#10` and `#15`.

---

## #8 — An expired bulk-buying campaign keeps showing as open

**Status:** Fixed — 2026-09-07
**Area:** `close_expired_bulk_deals()` scheduling — `supabase/migrations/20260900_bulk_deal_campaigns.sql:504-518`, `src/services/marketplace/bulkService.ts:111-121`, new `supabase/migrations/20260918_cron_close_expired_bulk_deals.sql`

**Reported:** "bulk deal of which the time has gone is still showing on check
it and find the root cause."

**Confirmed live:** `bd_61f82e6bbb4d405ca4e74be26cbb43da` ("shirt") has
`closes_at = 2026-09-06 03:30 UTC`, `closed_at = null` — ~18 hours overdue at
time of writing, still `status = 'ACTIVE'` and fully visible/pledgeable in
the browse feed.

**Root cause — two layers, both confirmed:**

1. **Immediate:** closing a bulk deal past its deadline is NOT a standing
   server-side guarantee — it only happens opportunistically. `bulkService.ts`'s
   `deals()`, `dealsForBusiness()`, and `getDeal()` each call
   `sweepExpiredDeals(sb)` (`:111-121`) before their query, which invokes the
   `close_expired_bulk_deals()` RPC — but only if a session exists (skipped
   entirely for guests) and at most once per 2 minutes per browser session
   (`lastBulkSweepAt` debounce). If no authenticated client happens to hit
   one of those three methods after a deal's deadline passes, it simply
   never closes. Confirmed this is exactly what happened here: most of this
   session's interaction with this specific deal went through direct
   database calls (diagnosing the earlier pledging bug), not the actual
   running app, so no real client session ever triggered the sweep after
   `closes_at` passed.
2. **Systemic:** `close_expired_bulk_deals()` itself is correct — confirmed
   by calling it directly in a rolled-back transaction; it closes this exact
   deal cleanly (`closed_at` set, `close_outcome` correctly left `null` since
   paid quantity never reached MOQ — "needs a decision" state). The gap is
   that it has **no `pg_cron` schedule** backing it, unlike its closest
   sibling: `close_stale_queue_tokens` is the only sweep function in this
   entire codebase with a real cron job (`cron.schedule('close-stale-queues',
   '*/10 * * * *', ...)`, `20260803_queue_auto_close_and_cancel.sql:139`).
   `close_expired_requests`, `cancel_expired_agreements`, and
   `close_expired_bulk_deals` all share the same "opportunistic client call
   only" design — this isn't a regression unique to bulk deals, it's a
   pattern already present elsewhere, just surfaced here first.

**Fix:** registered a `pg_cron` schedule for `close_expired_bulk_deals()`
(`close-expired-bulk-deals`, every 10 minutes), mirroring `close-stale-queues`
exactly — confirmed live via `cron.job`. The opportunistic client-side calls
from `bulkService.ts` stay as-is (harmless, and faster than a 10-min tick
when someone's actively using the app) — this just adds the missing
backstop. Also ran the sweep for real (not rolled back) to immediately close
the specific overdue deal from the report — confirmed `closed_at` is now
set; it no longer matches `deals()`'s `.is("closed_at", null)` filter, so
it's out of the browse feed. `close_outcome` is `null` ("needs a decision" —
paid quantity never reached MOQ), same as the deal's own rules dictate; the
owner will see it in their console and can refund or manually fulfill.

**Not addressed here, flagged as a related but separate gap:**
`close_expired_requests` and `cancel_expired_agreements` share the exact
same "opportunistic-only, no cron" design — not fixed in this pass since the
report was specifically about a bulk deal, but worth the same treatment if
the same symptom ever gets reported for a request or agreement.

---

## #7 — Flow-completeness audit bucket 3: the deferred long tail

**Status:** Fixed — 2026-09-07 (2 items explicitly excluded, see below)
**Area:** 8 new migrations (`20260913`–`20260917` plus fixes bundled into
them), 20 client files across share, chat, safety, business console, admin,
and app-shell code

**Reported:** follow-up on `docs/launch/workflows/24_flow_completeness_audit.md`
— everything left after buckets 1/2 (gap `#6`). Two items were asked about
directly and excluded from scope: **Android App Links** (needs a signed
`assetlinks.json` hosted on the production domain plus the signing-key
fingerprint — infra work outside this repo) and the **background-location
error-swallowing** finding (already flagged "plausible, not confirmed" in
the audit; needs live-device testing to confirm before any fix is designed).

**Fix, by area:**
- **Native share links** (`ShareCard.tsx`, `AgreementScreen.tsx`) — both
  passed `config.apiUrl` instead of relying on `window.location.origin`,
  which is `https://localhost` in Capacitor's native WebView. Turned out to
  be a 2-line fix once traced precisely: `ShareCard` is the single shared
  component all 10 "call sites" actually render.
- **Admin `/admin` redirect** — `ProtectedLayout` (`App.tsx`) now special-cases
  `/admin*` to `/admin/login` instead of the generic `/auth/phone` redirect.
- **`HoursEditor.tsx`** — `save()` now invalidates the cached business query
  (matching `toggleOpenNow`'s existing pattern) so an immediate open-now
  toggle doesn't compute against stale hours. The dead "special/holiday
  hours" freetext list (never wired to slot generation — `date` was
  arbitrary text, not parseable) was removed and replaced with a link to the
  real, working block-date flow in the Appointments console.
- **Delivery ETA fallback** (`DeliveryTrackControl.tsx`, `MyAppointments.tsx`)
  — shows the owner's ETA text immediately after Accept instead of nothing
  until a delivery agent is separately assigned. Currently latent: the whole
  delivery-agent feature is behind `DELIVERY_AGENT_ENABLED = false`.
- **Chat read receipts** (`ChatThread.tsx`) — switched to
  `useQueryWithRealtime` on `conversations`, matching `ConversationList.tsx`'s
  existing pattern.
- **`BusinessAccessGuard`** — added a realtime subscription on
  `business_access_sessions` so a revoked/re-scoped team member is bounced
  immediately instead of only on the next mount/route-change.
- **`BulkDealsManager`/`BulkDealDetail`** — both switched to
  `useQueryWithRealtime`, matching `QueueManager`/`BusinessRequests`.
  Deleting a campaign now confirms first (stronger wording with any
  pledges), and a new `bulk_deal_delete` RPC (`20260913`) notifies every
  pledger whose deposit was `PAID` before the FK cascade wipes their row.
- **Pending bulk-deal deposits** — new `bulkService.pendingDepositsForBusiness()`,
  wired into both `ManageDashboard`'s "Action needed" list and
  `BusinessPayments`' claims section with full inline confirm/reject, not
  just a count.
- **Walk-in queue support** — new `queue_token_create_walk_in` RPC (`20260914`)
  plus an "Add walk-in" modal in `QueueManager.tsx`. Deliberately does NOT
  mirror `appointment_create_walk_in`'s exact trick (stamping
  `customer_user_id` = the owner's own id) — `queue_tokens` has a unique
  `(business_id, customer_user_id)` index for active tokens that multiple
  walk-ins would collide on sharing one id. Uses `NULL` instead (never
  collides, and is more honest — a walk-in has no account). This surfaced
  two real, separate bugs while implementing it, both fixed in the same
  pass: (1) `notify_on_queue_called` and `close_stale_queue_tokens` had
  never been exercised against a NULL `customer_user_id` and would have
  thrown on the `notifications.user_id` NOT NULL constraint — calling a
  walk-in forward would have crashed the whole status update; (2) a
  pre-existing trigger (`enforce_queue_open_on_join`, `20260729`) blocked
  *any* queue insert while the queue was toggled off, including the owner's
  own walk-in — fixed (`20260917`) to exempt `customer_user_id IS NULL`
  inserts specifically. Both found and fixed via live rolled-back testing,
  not just code review — the first attempt at a live walk-in test failed
  with exactly this error.
- **Live-share per-recipient revoke** (`20260915`) — new
  `revoke_live_share_recipient`/`my_live_share_recipients` RPCs, plus a
  "Sharing with" list in `SafetyHub.tsx` with a per-person "Stop" button.
- **Notification-permission disclosure** — new
  `NotificationPermissionExplainer.tsx`, mirroring `LiveShareExplainer.tsx`'s
  shape and its confirmed-correct consent rule exactly: dismissing does NOT
  set the "already shown" flag (dismissing isn't consent), only confirming
  does. `store.tsx`'s sign-in effect gates the first-ever native
  `registerPush` call behind it instead of calling it cold.
- **`LeadsInbox`** — QUESTION leads (business only) link to the Q&A manager,
  MESSAGE leads link to the chat list. Partial, honestly scoped: the `leads`
  table has no reference column back to the specific `business_qna`/
  `conversations` row, so this can't be a precise deep-link without a schema
  change — still real progress over "mark handled" being the only action.
- **Admin "Take action"** (`20260916`) — now has a real effect per report
  `targetType`: BUSINESS/PROVIDER reuse the existing suspend toggle already
  in `AdminProfiles`; POST hard-deletes via a new `admin_delete_post` RPC
  (mirroring the author's own existing delete exactly — a post has no
  downstream financial chain); REQUEST soft-cancels via a new
  `admin_cancel_request` RPC rather than hard-deleting, since a request can
  have a live agreement chained off it (same reasoning `delete_business`'s
  own soft-delete already established for this codebase).

**Not fixed, excluded on request:** Android App Links; background-location
error-swallowing on permission revocation.

**Verification:** `tsc`/`eslint`/`vitest` all clean (518/518 tests) after
every change. Every new/modified RPC applied live and confirmed via
`pg_get_functiondef` + rolled-back simulated calls — including catching the
two queue-trigger bugs above via an actual failed live test, not just
assumed-correct code review.

**Files:** `supabase/migrations/20260913`–`20260917`, `src/components/ShareCard.tsx`,
`src/screens/requests/AgreementScreen.tsx`, `src/App.tsx`,
`src/screens/business/manage/HoursEditor.tsx`, `src/components/delivery/DeliveryTrackControl.tsx`,
`src/screens/requests/MyAppointments.tsx`, `src/screens/chat/ChatThread.tsx`,
`src/components/BusinessAccessGuard.tsx`, `src/screens/business/manage/BulkDealsManager.tsx`,
`src/screens/business/manage/BulkDealDetail.tsx`, `src/services/marketplace/bulkService.ts`,
`src/screens/business/manage/ManageDashboard.tsx`, `src/screens/business/manage/BusinessPayments.tsx`,
`src/services/marketplace/businessService.ts`, `src/screens/business/manage/QueueManager.tsx`,
`src/services/engagement/emergencyService.ts`, `src/screens/safety/SafetyHub.tsx`,
`src/components/NotificationPermissionExplainer.tsx`, `src/store.tsx`,
`src/screens/manage/LeadsInbox.tsx`, `src/services/core/adminService.ts`,
`src/screens/admin/AdminPanel.tsx`, `src/services/engagement/locationService.ts`.

---

## #6 — Flow-completeness audit buckets 1 & 2: missing notifications + rejected-business dead end

**Status:** Fixed — 2026-09-06
**Area:** 4 new migrations (`20260909`–`20260912`), 3 admin service files,
`AccountStatusBanner.tsx`, `ManageHub.tsx`, `types/marketplace.ts`,
`types/user.ts`, `Notifications.tsx`

**Reported:** follow-up on `docs/launch/workflows/24_flow_completeness_audit.md`
— asked to fix the "business never notified of customer actions" pattern
(the full 18-instance "no notification to the other party" finding across
both directions) and the "rejected-business dead end" finding. The legacy
group-buy removal (the audit's most severe finding) was asked about directly
and confirmed **by design** — no fix, see the audit file's own updated entry.

**Fix — notifications (17 gaps, deduplicated to ~15 fixes across 4 migrations):**
- `20260909` — `proposal_submit_counter` (notify the other party),
  `accept_proposal`/`accept_proposal_counter` (notify every rejected sibling
  proposal, not just the winner), `cancel_expired_agreements`'s PENDING
  branch (notify both parties, matching its own 72h branch), a new trigger on
  `ratings` (notify the person rated).
- `20260910` — `agreement_claim_payment`/`confirm_payment`/`reject_payment`
  (notify the other party each step — this also makes `AgreementScreen.tsx`'s
  existing "requester notified" toast true instead of false), a new trigger
  on `queue_tokens.payment_status` (none existed before — the only prior
  queue trigger covered `status='CALLED'` only), `bulk_deal_pledge_join` and
  `bulk_deal_pledge_claim_deposit` (notify the campaign owner).
- `20260911` — `respond_location_share`'s deny branch, a new
  `revoke_location_share` RPC so `locationService.revoke` (previously a bare
  client update with nothing to notify through) can notify the requester,
  `update_team_member_scopes` and `revoke_business_session` (notify the
  grantee — revoke only fires when the OWNER revoked someone else, not on
  self-revoke/leave).
- `20260912` — two new triggers on `business_qna` (ask → owner, answer →
  asker — this table had zero notification coverage before), `reply_to_rating`
  (notify the reviewer), `delete_business` (notify every team member whose
  access the deletion just revoked).
- Client-side only: `appealService.resolve()`, `adminService.resolveReport()`/
  `resolveBugReport()`, `profileControlService.updateRequestStatus()` — all
  three already had `notificationService` wired for sibling actions, just
  missing the call for this specific one.
- Along the way: added 8 new `NotificationType` union members plus icon/color
  metadata in `Notifications.tsx` (`LOCATION_DENIED`, `LOCATION_REVOKED`,
  `PROPOSAL_COUNTER`, `RATING`, `RATING_REPLY`, `BULK_DEAL_PLEDGE`,
  `BULK_DEAL_DEPOSIT_CLAIMED`, `QNA`) — `communityNotifications.test.ts`'s
  drift-guard test catches exactly this class of miss and correctly failed
  until these were added. Also fixed two **pre-existing** orphaned types
  found while touching the adjacent ones: `BULK_DEAL_DEPOSIT_CONFIRMED`/
  `BULK_DEAL_DEPOSIT_REJECTED` were inserted by `20260900`'s original RPCs
  but never added to the client union — silently rendering as a generic bell
  this whole time, unrelated to this session's own changes.

**Verification wrinkle worth recording:** initial live testing of
`bulk_deal_pledge_join`'s new notification appeared to show it silently
failing (`notif_count: 0` in a rolled-back simulated call). Root cause of
*that* was the test methodology, not the code: the verification query ran
`set local role authenticated` (as the pledger) before checking
`notifications`, and RLS correctly hid the *owner's* notification row from
the pledger's own session. Re-tested by setting only the `request.jwt.claims`
GUC (which is all `auth.uid()` reads) without switching role, so the
verification query itself wasn't RLS-restricted — confirmed working
correctly, insert and trigger both. Worth remembering for any future
rolled-back-transaction verification of a notification meant for someone
other than the simulated caller.

**Fix — rejected-business dead end:**
`ManageHub.tsx`'s business card badge now branches on real `status`
(`PENDING`/`REJECTED`/`SUSPENDED`/else-Live) instead of hardcoding "● Live".
`AccountStatusBanner.tsx` now also renders for `status === "REJECTED"`
(businesses only — providers go live immediately at creation with no review
queue to resubmit into, confirmed by reading `providerService.create`, so a
REJECTED provider has no confirmed recovery flow to wire and is left as
before), showing the admin's `rejectionReason` and a "Fix & resubmit" button
calling `businessService.submitForReview` (which now also clears
`rejection_reason` on resubmit, matching `submitVerification`'s existing
reset pattern). `rejectionReason` added to the `Business` type — no service
change needed, since `toCamel()` is a generic deep key transform and the
already-live `rejection_reason` DB column flows through automatically once
the type declares it.

**Not fixed here — bucket 3, explicitly deferred:** the long tail from the
audit (walk-in queue, holiday-hours dead write, chat read-receipt realtime,
live-share per-recipient revoke, campaign-delete guard, native share-link
`localhost` bug, admin `/admin` redirect, "take action" moderation, etc.) —
see `docs/launch/workflows/24_flow_completeness_audit.md` for the full list.

**Files:** `supabase/migrations/20260909_notify_request_agreement_gaps.sql`,
`20260910_notify_payment_claim_gaps.sql`, `20260911_notify_team_access_gaps.sql`,
`20260912_notify_business_community_gaps.sql`, `src/services/core/appealService.ts`,
`src/services/core/adminService.ts`, `src/services/core/profileControlService.ts`,
`src/services/engagement/locationService.ts`, `src/services/marketplace/businessService.ts`,
`src/types/marketplace.ts`, `src/types/user.ts`, `src/screens/Notifications.tsx`,
`src/screens/ManageHub.tsx`, `src/components/AccountStatusBanner.tsx`,
`src/screens/business/manage/ManageDashboard.tsx`.

---

## #5 — After pledging, no confirmation shown; pledge invisible on Home

**Status:** Fixed — 2026-09-04
**Area:** `BulkOrderSheet.tsx` / `Home.tsx` / `BulkDealCard.tsx`

**Fix:** `BulkOrderSheet.tsx` — added a `justPledged` confirmation screen for
the no-deposit success path (mirrors the existing `justPaid` screen's
structure); added a persistent "you're pledged in, pay anytime" note to the
DEPOSIT view so closing without paying no longer looks like backing out
entirely; widened STATUS-view eligibility to `locked || (alreadyPledged &&
!needsDeposit)` so reopening an already-pledged no-deposit campaign shows a
real status view instead of the raw pledge form; moved `onOrdered?.()` to
fire immediately after a successful pledge (not only in the no-deposit
branch), fixing a related staleness bug where backing out of DEPOSIT without
paying never refreshed the feed. `src/lib/bulkFeed.ts` — added
`mostUrgentPledge()` (owing-deposit > soonest-deadline > most-recent
priority), unit tested. `src/screens/Home.tsx` — added a `bulkService.
myPledgedDeals()` query and one `todayItems` card for the single most urgent
active pledge, wired into pull-to-refresh, navigating to
`/community/activity`. Four new i18n keys (en/hi/mr):
`pledge_confirmed_note`, `pledged_pay_anytime_note`, `leave_pledge_note`,
`your_pledge`. `tsc`/`eslint`/`vitest` all clean (518/518 tests).

**Not fixed here, flagged only:** the business owner still gets no
notification when a customer pledges (`bulk_deal_pledge_join` has no
`insert into notifications`) — business-side, out of scope for this report.

**Reported:** "when the user select and try to pledge for the bulk deal then
after pledging no info of pledging is coming and on the home screen also it
should be shown in the schedule but not showing why all that check full flow
every node connected every button where what should be there do a thorough
analysis and come up with the plan which will make the flow complete."

**Full flow traced, node by node:**

1. **Discovery** — `CommunityHub.tsx` bulk view / rail → `BulkDealCard.tsx`.
   Card correctly reflects state once loaded: shows a green "Joined N units"
   pill when `myPledgeQuantity > 0` (`BulkDealCard.tsx:148-151`). This part
   works, now that `#0`'s `has_business_access` grant fix is live —
   `enrichMyPledges()` no longer 403s, so this data actually arrives.

2. **Pledge submission** — `BulkOrderSheet.tsx: submitPledge()`. Two paths:
   - **No deposit required** (the common case — most campaigns have no
     `depositAmount`): success → `showToast(...)` (auto-dismisses ~2s) →
     `onOrdered?.()` → `onClose()`. **No persistent confirmation screen at
     all.** The toast is the entire signal that anything happened. Compare
     to the deposit path, which got a proper `justPaid` confirmation screen
     (units, amount, "awaiting confirmation") in an earlier pass — the
     no-deposit path never got the equivalent treatment. This is the direct
     cause of "no info of pledging is coming."
   - **Deposit required**: success → moves to `DEPOSIT` view (pay now). If
     the customer pays, they get the `justPaid` screen — fine. But if they
     tap the header **X** to close from the `DEPOSIT` view without paying,
     the pledge **already succeeded** (it's a real `UNPAID` row) but nothing
     tells them that — the sheet just closes silently, same as a cancel.
     They likely believe they backed out entirely, when they're actually
     pledged-but-unpaid.

3. **Reopening the sheet after a successful no-deposit pledge** —
   `BulkOrderSheet.tsx:24-27`: `locked = status === "PAID" ||
   "PENDING_CONFIRM"`; the `STATUS` view (the one that shows "you're in,
   here's your pledge, leave/update options") only renders when `locked` is
   true. A no-deposit pledge's `myDepositStatus` is never PAID/PENDING_CONFIRM
   (there's no deposit to pay), so `locked` is always false for the single
   most common campaign type — reopening always drops back into the plain
   PLEDGE form. The "you previously pledged N" line (`:222`, added for gap
   `#3`) is the only hint anything happened; there's no real confirmation
   view for this path at all.

4. **Home screen** — `Home.tsx`'s `todayItems` ("Your day" rail, the one
   place the user is looking for a "schedule") is built from exactly three
   sources: `activeQueues`, `nextAppointment` (from
   `appointmentService.listForCustomer`), `activeAgreements`
   (`requestService.agreements()`). **Bulk-deal pledges are not fetched by
   Home at all** — no `bulkService` call anywhere in the file. An active
   pledge, paid deposit, or a campaign closing soon has zero presence on
   Home, confirming the report exactly.

5. **Where a pledge status IS visible today** (so the plan builds on this,
   not around it): `CommunityHub.tsx`'s "Bulk buying" filter → "Your
   pledges" compact list (`:496-539`, buckets.mine), and the dedicated
   `/community/activity` screen (`CommunityActivity.tsx`, reachable via the
   `Ticket` icon added for gap `#4`). Both work correctly. The gap is
   entry-point breadth (Home has none) and moment-of-action feedback (the
   sheet itself), not the underlying data.

6. **Adjacent, not in scope of this report but found while tracing "every
   node":** the business owner receives **no notification** when a customer
   pledges — `bulk_deal_pledge_join` (`20260900_bulk_deal_campaigns.sql:125`)
   has no `insert into notifications`, unlike `confirm_deposit`/
   `reject_deposit`/close/extend, which all do. A business only learns about
   new pledges by manually opening `BulkDealsManager.tsx`. Flagging, not
   proposing a fix here — the report was about the customer side.

**Next step:** see the plan for this issue.

---

## #0 — Pledging into a bulk-buying campaign doesn't work

**Status:** Closed — 2026-09-04. The original report (pledge button itself)
is confirmed correct behavior, not a bug (see "Final root cause" below).
Three real, adjacent bugs found while chasing it — all fixed and verified
live: `read_bulk_deal_pledges`, `read_bulk_deal_tokens`, and the actual
cause of the recurring 403s (`has_business_access` missing its
`authenticated` grant, `20260908_regrant_has_business_access.sql`, applied
and confirmed by reproducing both previously-failing browser queries
directly — both now return real data with no error).
**Area:** `bulk_deal_pledge_join` RPC / `BulkOrderSheet.tsx` / `BulkDealCard.tsx`

**Final root cause, confirmed empirically (2026-09-04):** With direct DB
query access, `bulk_deal_pledge_join('bd_61f82e6bbb4d405ca4e74be26cbb43da',
1, null, null)` — the exact deal ID from the user's failing requests — was
run twice inside rolled-back transactions, simulating two different real
accounts via `request.jwt.claims`:
- As a real non-owner customer account: **succeeded**, returned the updated
  `bulk_deals` row, no error.
- As `c7dce920-92da-4de2-973d-8e6bfc5cced1`, the deal's actual
  `owner_user_id` (business `b_demo_shop`): **raised `OWNER_CANNOT_PLEDGE`**
  (`P0001`, `bulk_deal_pledge_join` line 13).

So the RPC itself was never broken. Whoever was testing was signed in as the
business account that owns the campaign, and the RPC correctly refused to
let a business pledge into its own listing — intended behavior, confirmed
against `20260900_bulk_deal_campaigns.sql`'s own design. The UI-side
mitigation (owner sees "Manage your campaign" instead of "Join deal") was
already shipped earlier this session (`BulkDealCard.tsx`, see #3), and
`BulkOrderSheet.tsx` now shows `OWNER_CANNOT_PLEDGE` as a clear on-screen
message ("You can't pledge to your own campaign") instead of a silent toast,
in case the owner ever reaches the sheet through another path.

**Two real bugs found and fixed along the way** (not the actual cause of
this report, but genuine defects surfaced while chasing it): both
`read_bulk_deal_pledges` and `read_bulk_deal_tokens`
(`20260900_bulk_deal_campaigns.sql:77,115`) called `public.is_admin()` with
**zero arguments** — a function that exists live in the DB but is untracked
in any migration (documented drift, see `20260887_restore_rls_helper_grants.sql`).
Direct empirical testing (`set role authenticated; select public.is_admin()`)
proved this specific function call was NOT actually erroring or losing its
grant — so it was not the mechanism behind the recurring 403s the user hit
on `enrichMyPledges()`/the tokens read. The zero-arg `is_admin()` dependency
was still real, undocumented drift regardless — every other policy in the
codebase calls the tracked, granted `is_admin(text)` — so both policies
were fixed to match (`20260906_fix_bulk_deal_pledges_read_policy.sql`,
`20260907_fix_bulk_deal_tokens_read_policy.sql`), applied and verified live.
11 more policies (`custom_payments`, `places` ×3, `bulk_deals` ×2,
`group_buy_tokens`, `proposals`, `profile_deletion_requests` ×3,
`businesses`, `providers`) still depend on the same untracked function —
currently working (confirmed granted to both `anon` and `authenticated`),
left as-is rather than mass-migrated, but worth tracking `is_admin()`
properly for real at some point instead of relying on ad hoc drift that's
already caused outages three times before (per 20260887's own header).

**The 403s' real cause, found after 906/907 didn't stop them recurring:**
with direct DB access, the exact failing queries were reproduced as the
real user_id from the browser (`8adc53c5-d814-43af-9eb7-e77ccf5ccab5`),
which surfaced the true error: `permission denied for function
has_business_access` (42501). Confirmed via `pg_proc.proacl`:
`has_business_access(text,text)` has EXECUTE for `{postgres,
service_role}` only — no `authenticated`, no `anon` — despite
`20260809_business_delegated_login.sql:73` explicitly granting it to
`authenticated` at creation. Revoked at some point after (almost certainly
the `20260881`/`20260882` sweep) and never restored — `20260887`'s
restoration list covers `is_admin()`, `can_manage_business()`,
`neighborhood_today()`, `get_public_profile()`, but not this one, since 887
was scoped to what `anon` needs for guest browsing, not what
authenticated-only policies like these two need. Scope confirmed: exactly
these two policies reference `has_business_access` — no other table
affected. Fixed by `20260908_regrant_has_business_access.sql`.

**Reported:** "https://gnswxlfmcwyhmzlfipql.supabase.co/rest/v1/rpc/bulk_deal_pledge_join
// not working" — then, after several rounds of investigation, "pledging not
working" reported again as still broken.

**What's been ruled OUT so far** (each confirmed independently, not assumed):
- Migration `20260900` (campaign model) — fully applied: 6 new `bulk_deals`
  columns, all 12 RPCs, the auto-close trigger, all confirmed present via SQL.
- Migration `20260901` (`fulfillment_type` column) — was genuinely missing,
  applied by the user, then re-confirmed present.
- The function's existence, exact signature, and grant — confirmed directly:
  `bulk_deal_pledge_join(text,integer,text,text)` exists, exactly one
  overload (no ambiguous-overload risk), and
  `has_function_privilege('authenticated', ..., 'execute') = true`.
- The client call shape — `bulkService.pledgeJoin()` passes exactly
  `p_deal_id`/`p_quantity`/`p_notes`/`p_delivery_address`, matching the RPC's
  parameter names precisely. No client-side param mismatch found on review.

**Resolution:** the `OWNER_CANNOT_PLEDGE` candidate above is what it turned
out to be, confirmed empirically rather than assumed — see "Final root
cause" above. No RPC/business-logic change needed. Closed.

---

## #1 — Past-due unpaid appointments looked identical to genuinely future ones

**Status:** Fixed — 2026-09-04
**Area:** `MyAppointments.tsx` (customer appointments)

**Reported:** "in the appointment page of the customer the appointment of
which the appointment date has been gone also coming on the upcoming tab."

**Root cause:** Not a stray bug — deliberate by design, but with a real UX
gap. `isUpcoming()` (`MyAppointments.tsx:27`) is genuinely future-only. But
the Upcoming list actually uses `shouldBeUpcoming = isUpcoming(a) ||
isUnpaidActionable(a)` (`:116`) — an appointment whose slot has passed stays
in Upcoming as long as it's payable (PENDING/ACCEPTED/COMPLETED) and not yet
PAID, specifically so the "Pay now" CTA doesn't silently vanish into Past
before the customer has paid. There's even an existing `isDismissible()` /
Dismiss affordance for exactly this state (`:54`) — but nothing on the card
itself told you WHY a past-dated booking was sitting in Upcoming. It read as
a bug because it looked like one.

**Fix:** Added a `pastDueUnpaid` flag (same condition as `isDismissible`) that
renders an amber border + "⚠ Date passed — payment still pending" line on the
card. The underlying "keep it visible until paid" behavior is unchanged —
removing it would reintroduce the exact problem this design was written to
prevent (losing the payment step into Past).

**Files:** `src/screens/requests/MyAppointments.tsx`, `src/lib/i18n.tsx`
(`date_passed_payment_pending`, en/hi/mr).

---

## #2 — Bulk-buying cards looked like a bespoke commerce widget, not a post

**Status:** Fixed — 2026-09-04
**Area:** `BulkDealCard.tsx` (Community feed)

**Reported:** "the bulk deals should also be like the normal post like not
explicitly mentioned and card size should also be like the other posts."

**Root cause:** `BulkDealCard` had its own bespoke shell — a plain `.card`
with a hand-set `borderLeft: 3px solid amber`, a 64px square thumbnail, and
custom padding — while `CommunityCard` (every other post in the same feed)
uses `.community-card-squircle` with an avatar-led header, a badge PILL for
its type, and a fixed typography scale. Sitting in the same scroll, the two
read as different kinds of screen, not different kinds of post — and
`BulkDealCard` was visibly a different size/footprint.

**Fix:** Rebuilt on `CommunityCard`'s exact shell: `community-card-squircle`,
44px circular avatar (`deal.image`/`deal.businessCover`, orange ring to match
the existing "🏪 Business" author badge), the business name where a post's
author name goes, and a `badge-orange` pill for "Bulk buying" instead of the
amber border — same treatment ALERT/POLL already get on the same shell, not
a separate visual language. Campaign-specific content (progress bar, tier
preview, price/CTA) stays, tightened to keep the card's height in the same
range as a normal post.

**Files:** `src/components/BulkDealCard.tsx`.

---

## #3 — Bulk-buying cards weren't fully tappable, and the pledge sheet was missing detail

**Status:** Partially fixed — 2026-09-04 (see "Still open" below)
**Area:** `BulkDealCard.tsx`, `BulkOrderSheet.tsx`

**Reported:** "the bulk buying cards should be touchable and when touching
the customer should see how many they have been pledged previously and how
many he will pledge now... and see if the business has placed an advance
amount then the customer should see that details in the card and when
pressing the pledge button the pay option should come and after which the
details of how many in the pending should also be seen."

**Root cause / current state, item by item:**
- **"Touchable"** — confirmed real gap. Only the title text and the CTA
  button opened the sheet; the image, description, progress bar and tier
  table were all dead space. Fixed as part of #2's rebuild — the whole card
  is now one tap target (`onClick` on the outer div), matching the listing-
  card convention already used elsewhere (`RequestCard`, `BusinessCardWide`)
  rather than `CommunityCard`'s region-specific taps.
- **Deposit amount on the card** — was already present
  (`deposit_amount_badge` badge, `BulkDealCard.tsx`) before this pass. Not a
  gap; flagging so it's not "fixed" twice.
- **Pledge → pay flow** — was already wired: `submitPledge()` transitions to
  a `DEPOSIT` view with `PaymentMethodPanel` when the deal has a deposit
  (`BulkOrderSheet.tsx:37-51`). Not new.
- **"How many pledged previously vs now"** — real gap. The sheet let you
  *update* a prior pledge but never stated the old number next to the new
  stepper. Fixed: added a "You previously pledged N unit(s)" line above the
  quantity stepper when `alreadyPledged`.
- **"Pending" details after paying** — real gap, confirmed. `payDeposit()`
  called `claimDeposit()`, showed a toast, and closed the sheet immediately —
  there was no screen showing the pending amount/quantity, so the moment of
  "you just paid, here's what's outstanding" didn't exist. Fixed: added a
  `justPaid` state that renders a pending-confirmation screen (units,
  deposit amount, "awaiting business confirmation") instead of auto-closing.

**Still open:** none of the four sub-asks remain unaddressed as of this
entry, but this hasn't been exercised on a device yet — same caveat as the
rest of the bulk-buying feature this session. Re-verify on real hardware
before closing this out for good.

**Files:** `src/components/BulkDealCard.tsx`, `src/components/BulkOrderSheet.tsx`,
`src/lib/i18n.tsx` (`you_previously_pledged`, en/hi/mr).

---

## #4 — No way to see bulk-buy status after pledging

**Status:** Fixed — 2026-09-04
**Area:** `CommunityHub.tsx` (navigation)

**Reported:** "when the user pledge for the item then no option from where
the customer can see the bulk buy status is coming for the customer."

**Root cause — confirmed, this was a genuine dead end:**
`/community/activity` (the screen that lists "Your campaigns" — every
pledge, any state) had **exactly one entry point in the entire app**: a
banner in `CommunityHub.tsx` gated on `issuedPassCount > 0`
(`CommunityHub.tsx:433`, pre-fix). A claim pass is only minted once a
campaign *closes* — so a customer who had pledged, even one who'd paid a
deposit and had it confirmed, had `issuedPassCount === 0` and **zero
clickable path** to the one screen built to show their status. The
`CommunityHub` bulk-view's own "Your pledges" section (added in an earlier
pass) was the only other place this was visible, and only if the customer
thought to go back to Community → the "Bulk buying" filter specifically.

This was the most severe of the four — a built feature (`myPledgedDeals()`,
the "Your campaigns" section) with no discoverable door into it for most of
its own lifecycle.

**Fix:** Added a persistent `Ticket` icon button to `CommunityHub`'s header,
visible for every signed-in user regardless of `issuedPassCount`, with a
small red dot only as a hint when there's an issued pass — not the only
door. Routes straight to `/community/activity`.

**Files:** `src/screens/CommunityHub.tsx`, `src/lib/i18n.tsx`
(`your_activity_label`, en/hi/mr).

**Follow-up worth doing, not done here:** this screen still has no entry
point from `Profile.tsx` or `BottomNav.tsx` — the header icon is the only
door now, singular. Worth a second, independent path (e.g. a Profile row)
so it isn't back to a single point of failure.

---

*Log started 2026-09-04. Add new entries above this line, newest first per
section, oldest section-numbers stay stable (never renumber a closed entry).*
