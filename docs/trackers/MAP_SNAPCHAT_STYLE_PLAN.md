# Map Redesign v2 — "Living Street" (Snapchat-inspired)

**Created:** 2026-08-04
**Supersedes:** `MAP_REDESIGN_PLAN.md` Phases 2 & 3 (the results sheet, filter
chips) and the "Map search" / "Map visual pass" rows in `NEXT_BATCH_PLAN.md` —
this document is now the plan for both. Phase 1 (viewport search) and Phase 4
(desktop) are **kept**, adapted below.
**Decisions locked (asked via 3 questions, all "Recommended" chosen):**

| # | Question | Decision |
|---|----------|----------|
| D1 | Interaction model | **Carousel replaces the sheet.** Full-bleed map; browsing moves the map, it doesn't open a panel over it |
| D2 | Pin style | **Every pin is a circular avatar photo** — shops, providers, stories, all one visual language |
| D3 | Heat layer | **Business density + open-now** |

---

## 0. What "Snapchat-style, our styling" means here

Not a re-skin. Snap Map's actual signature is three mechanics working together:
a map with almost no chrome, every point-of-interest rendered as a circular
photo instead of a generic pin, and a warm glow showing where things are
happening. None of that requires copying Snapchat's colors or its friend-
tracking feature (STRYT already has live-location sharing, built separately,
and it stays separate — this redesign is about *browsing*, not *tracking
people*).

**"Our unique styling"** means the glow, the motion and the palette come from
the **Living Street Light** ambient system that already exists in this app
(`useAmbientTheme` — `lampGlow`, `dayPartKey`, `seasonEffect`). That system
already brightens a lamp-glow by time of day and drifts weather particles
through headers elsewhere in the app. The map's heat layer reuses the *same*
signal instead of inventing a second theming system: at night the glow around
a cluster of open shops should look like the same warm streetlight the rest of
the app already uses, not a generic orange blob.

That's the actual differentiator: Snapchat's map glows because things are
*happening*; STRYT's map glows like a **street lamp**, because that's the
brand.

---

## 1. What gets removed

Being direct about this rather than burying it: **Phases 2 and 3 of the
previous redesign shipped `MapResultsSheet.tsx`** — a 3-detent drawer with
filter chips, built one work session ago. This plan retires it.

That is not wasted work — Phase 1's underlying data layer
(`useMapViewport`, the searched-vs-live split, "Search this area") is untouched
and is exactly what the carousel reads from. Only the *presentation* of results
changes, from a drawer to a carousel. The query logic, the guest radius clamp,
and the desktop/mobile split in `useMapViewport` all carry over unmodified.

| File | Fate |
|------|------|
| `useMapViewport.ts` | **Kept as-is** — this is the part that actually fixed the "map doesn't search where you look" bug |
| `SearchThisArea.tsx` | **Kept as-is** — still the right control for "you panned away, want to re-search here?" |
| `MapResultsSheet.tsx` | **Removed** — replaced by `MapCarousel.tsx` + `MapFilterStrip.tsx` |
| `mapIcons.ts` (`pinHtml`, teardrop SVG) | **Removed** — replaced by one avatar-chip renderer shared by every pin type |
| `StoryAvatar` (in `MapMarkers.tsx`) | **Generalized**, not removed — becomes the base component every pin type renders through |

---

## 2. Target design

### 2.1 Mobile

```
╭─────────────────────────────────╮
│ 🔍 Search        [All ▾] [🟢]   │  ← slim strip: search + type + open-now
│                                  │
│                                  │
│         M A P  (full-bleed)     │
│                                  │
│      ◉        ◉                │  ← avatar pins, warm glow behind clusters
│           ◉  ░░░  ◉             │     (░ = heat, brighter where shops cluster
│    ◉    ░░░░░░░                 │      + are open right now)
│         ░░░░░                   │
│                            ⊕ ◎  │  ← pin-drop + recenter, unchanged
│                                  │
│ ╭────╮ ╭────╮ ╭────╮ ╭────╮     │
│ │ ◉  │ │ ◉  │ │ ◉  │ │ ◉  │ ←→  │  ← carousel, snap-scroll
│ │Shop│ │Shop│ │Prov│ │Story    │
│ │120m│ │340m│ │1.1k│ │now │    │
│ ╰────╯ ╰────╯ ╰────╯ ╰────╯     │
╰─────────────────────────────────╯
```

- **Top strip** replaces the old sheet's header + filter chips. Search (now
  dual-intent, see §3), a type filter (`All / Shops / People / Stories`), and
  an "open now" toggle. That's the entire persistent chrome besides the two
  FABs.
- **Carousel** sits low, one card per result, nearest-first (same sort
  `MapResultsSheet` used). Snap-scroll, not free scroll — one card settles at a
  time, like Snap Map's story tray.
- **Bidirectional sync**: scrolling the carousel eases the map to that card's
  point (a *soft* fly, not a hard jump — reuses the easing already tuned in
  `PickCenterTracker`'s `easeTo`); tapping a map avatar scrolls the carousel to
  that card. One state (`selectedId`), two views of it.
- **Carousel scroll is not "the user panned."** `useMapViewport.onMapMove` must
  ignore moves that originate from carousel-driven `easeTo` calls, or every
  swipe would trigger the "Search this area" pill on itself. A ref flag set
  around the programmatic move, same pattern already used to distinguish
  `searchHere` from a live pan.
- **Empty carousel** (nothing in view): a single dim card — *"Nothing here yet
  — try Search this area"* — not a blank row.

### 2.2 Desktop (≥768px)

Swipe-to-scrub doesn't map cleanly to a mouse, so the carousel becomes a
**vertical list in a left panel** — same card design, same `selectedId` sync,
scroll instead of swipe. This reuses the docking pattern Phase 4 already built
(`.map-sheet` → 380px side panel); only the *contents* of the panel change from
a filterable list to the same avatar-card design as the mobile carousel, so the
two platforms share one card component even though the container differs.

### 2.3 Avatar pins (D2)

One renderer, four skins:

| Type | Photo | Ring |
|------|-------|------|
| Business | Cover image, or a colour-tinted store glyph if none | Brand purple if open now, grey if closed |
| Provider | Avatar photo, or initials on a tint | Green if available, grey if not |
| Story | Author avatar (existing `StoryAvatar`) | Gradient if unseen, grey if seen — **unchanged from today** |
| Request | No photo (a request isn't a place) — **stays a small brand dot**, not forced into an avatar it doesn't have | — |

Sizing: **44×44px minimum**, matching the tap-area fix already applied to the
teardrop pins — that constraint carries over, not lost in the redesign.

### 2.4 Heat layer (D3)

MapLibre's built-in `heatmap` layer type — no new dependency, same
`<Source>/<Layer>` pattern the radius ring already uses in `index.tsx`.

- **Source:** every visible business point, weighted `2` if open-now, `1` if
  closed. Providers excluded from heat (services aren't "foot traffic" the same
  way shops are) — worth revisiting once there's real data to look at.
- **Colour ramp:** not Snapchat's red/orange. Driven by `useAmbientTheme`'s
  existing tokens — dim purple by day, warm amber at night (`lampGlow` scales
  the ramp's max opacity). The map should visibly warm up as evening comes in,
  the same way the rest of the app's headers already do.
- **Honest caveat, said plainly:** heat needs density to mean anything. **At 3
  live businesses today, this will render as three faint dots, not a glow.**
  Building it now is fine — it's cheap and the data source is just "businesses
  in view" — but don't expect it to look like the mockup above until there are
  a few dozen shops in one area. Gate it in code: below a small cluster-size
  threshold, skip the heat layer entirely rather than show something that
  reads as broken.

---

## 3. Search (folds in the old Phase 5)

Same dual-intent design as originally planned — one box, shops **and** areas,
grouped in the dropdown — now living in the top strip instead of a floating
bar. No change to that part of the plan; only its container moved.

**The location-rewrite bug found while planning Phase 5 is still real and still
in scope here:** `SearchBar.pickPlace()` today calls `userService.setLocation()`
on every picked result, permanently overwriting the user's saved home location
just for looking somewhere else. Fixed the same way regardless of which map
shell it ships in — picking an *area* result moves the map only.

---

## 4. What does NOT change

- `useLocationPinDrop` / long-press pin-drop flow — unrelated surface, untouched.
- `RecenterButton`, north-up lock, `reuseMaps`, the 30s Mapbox→free-map
  fallback, `overscroll-behavior: none` — every fix from the original map work
  this cycle. None of it lived in the sheet; all of it survives.
- Guest radius clamp (`GUEST_RADIUS_KM`) — still applied to the actual searched
  area, same as today.
- My People / live-location sharing — a different feature, not touched by any
  of this.

---

## 5. Build order

| Phase | Work | Ships alone? |
|-------|------|---------------|
| **A** | ✅ Unified avatar-pin renderer (§2.3), replacing `mapIcons.ts` teardrops | Yes — visible improvement even before the carousel exists |
| **B** | ✅ `MapCarousel.tsx` + top filter strip, retiring `MapResultsSheet.tsx` | Yes |
| **C** | ✅ Bidirectional carousel↔map sync + the "ignore programmatic moves" fix | Depends on B |
| **D** | ✅ Dual-intent search in the top strip + the location-rewrite fix | Independent, can ship anytime |
| **E** | Heat layer, with the low-density gate | Last — least useful at current scale |
| **F** | Desktop vertical-list panel reusing the same cards | After B/C are stable on mobile |

**Phase B, as shipped:** `MapCarousel.tsx` renders the snap-scroll card tray
(no background panel — cards float directly over the map, each its own glass
chip); `MapFilterStrip.tsx` replaces the sheet's filter-chips row, the
"Within …" radius row and the open-now toggle with one `[Label ▾]` popover
chip plus a persistent open-now chip. `AvatarPin`/`RingTone` were pulled out
of `MapMarkers.tsx` into their own file so the carousel's cards and the map's
pins render through the identical component.
`--map-sheet-peek-h` was renamed to `--map-carousel-h`; the dead
`.map-layer-toggles*` CSS (unused since `LayerToggles.tsx` was removed in an
earlier phase) was deleted in the same pass. Desktop lost its 380px docked
side panel (it targeted the now-deleted `.map-sheet` element) and currently
renders the same full-bleed layout as mobile — that specific side-panel
treatment is Phase F, not started.

**Phase C, as shipped:** `selected` (business/provider/request kind+id — the
same type MapMarkers' Popup already used) moved out of `MapMarkers.tsx` and
into `MapView/index.tsx` as controlled state, passed to both `MapMarkers`
and `MapCarousel`. Tapping a card (replacing Phase B's placeholder
`flyToPlace()` call) and settling a scroll gesture both now call one
`selectRow()` inside `MapCarousel.tsx`: select + a soft `map.easeTo()`
(`easeToPoint()` in index.tsx, 350ms — the same duration `PickCenterTracker`
already used, not `flyToPlace`'s harder `fitBounds` reframe). Tapping a map
pin sets `selected` from the other side; `MapCarousel` scrolls the matching
card into view via `scrollIntoView`. Each direction tracks the last row key
it synced (`lastSyncedKeyRef`) so the resulting echo — a pin tap's
`scrollIntoView` firing its own settle handler, or a scroll's `onSelect`
re-triggering the map→carousel effect — doesn't re-fire the same action a
second time. `index.tsx` gained `suppressViewportMoveRef`: set for the life
of an `easeToPoint()` call and cleared on that specific `moveend`, so
`useMapViewport.onMapMove` never sees a carousel-driven pan and can't
mistake it for the user panning (which would otherwise pop "Search this
area" on every swipe). Stories are deliberately outside this sync — they
don't have a Popup/selection state on the map either, so a story card still
opens the viewer directly, unchanged from Phase B.

Code-level only: `tsc`/`eslint`/`vitest` (127/127)/`build` all pass, but this
environment has no browser to actually swipe the carousel or tap a pin in —
the §6 checklist below is still unverified on a real device/browser and
should get a pass before considering C done-done.

**If time is short: A + D are the highest visible impact for the lowest risk** —
new pins and working search, without touching the interaction model yet.
B/C (the carousel swap) is the real redesign and deserves a device pass before
E and F stack on top of it.

---

## 6. Verification

Beyond the standard `tsc`/`eslint`/`vitest`/build pass:

- [ ] Swiping the carousel eases the map — no jump, no fighting a manual pan mid-swipe
- [ ] Carousel-driven moves never trigger "Search this area"
- [ ] Tapping a map avatar scrolls the carousel to match, both directions stay in sync
- [ ] Picking a searched *area* moves the map only — profile location unchanged (the bug found in Phase 5 planning)
- [ ] Every pin type readable at 44×44 one-handed
- [ ] Heat layer absent (not broken-looking) below the density threshold
- [ ] Heat ramp visibly warmer at night than at noon, same device, time-shifted
- [ ] Desktop: vertical list scroll syncs the map the same way the carousel does on mobile
- [ ] Guest radius clamp still holds through the new search flow
