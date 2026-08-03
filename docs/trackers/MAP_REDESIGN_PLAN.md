# Map Screen Redesign — Plan

**Created:** 2026-08-03
**Scope:** the map page only (`src/screens/MapView/*`, its CSS block)
**Status:** planned
**Requirement from you:** must be good on **native (Capacitor Android) and the web app**

## Decisions taken

| # | Question | Decision |
|---|----------|----------|
| D1 | Search model | **"Search this area" button** — pan freely, one tap re-queries the viewport |
| D2 | Structure | **Collapse chrome into a bottom sheet**; map gets the screen back |
| D3 | Reach | Whole map page. Not a reskin, not a from-scratch rewrite |

---

## 1. What's actually wrong

### 1.1 The map doesn't search where you're looking `the core issue`

```js
const centerLat = user.lat || config.defaultLocation.lat;   // profile location
discoveryService.businesses({ lat: centerLat, lng: centerLng, radius: radiusKm })
```

Every query is keyed on the user's **saved profile location**, never the
viewport. Pan to the next neighbourhood and the results are identical. The map
is a viewer of a fixed circle around where you live.

Everything else follows from this. The radius strip, the radius ring, the
recenter button and the "N places within 5 km" badge all exist to operate a
circle the user can't move by dragging. Fix the query and most of that chrome
stops having a job.

### 1.2 Six floating layers over one map

`SearchBar` · `LayerToggles` · places badge · `RadiusStrip` · pin FAB ·
recenter FAB — plus the app's own bottom nav. On a 360 px phone the map is the
smallest part of the map screen.

The stylesheet shows the strain: **6 CSS variables** exist only to stack this
(`--map-fab-bottom` is computed from three others), plus **4 `:has()`
selectors** that shift FABs when the places badge appears. Layout by CSS
variable arithmetic is a symptom, not a design.

### 1.3 No real desktop treatment

Desktop just stretches the phone layout to `100vh`. A 1400 px browser gets
mobile chrome floating over a very wide map.

### 1.4 The search bar doesn't search the map

`SearchBar` is a **location** search (forward-geocode: "take me to Koregaon
Park"). On a map screen, users expect it to find *shops*. Two different
intentions, one input, no signposting.

---

## 2. Target design

### 2.1 Mobile (native + mobile web)

```
╭─────────────────────────────╮
│  🔍  Search shops or areas  │  ← one input, two modes (§2.4)
│                             │
│         M A P               │
│    ╭──────────────────╮     │
│    │ ↻ Search this area│     │  ← only after the map moves
│    ╰──────────────────╯     │
│                        ⊕    │  ← pin drop
│                        ◎    │  ← recenter
├─────────────────────────────┤
│ ━━━                         │  ← drag handle
│ 12 places nearby            │
│ [All][Shops][People][Asks]  │  ← layers become filters
│ ▢ Sharma Kirana    120 m    │
│ ▢ Anand Salon      340 m    │
╰─────────────────────────────╯
```

Sheet detents: **peek** (handle + count + filters, ~140 px) → **half** (50 %) →
**full** (~90 %). Peek is the default.

### 2.2 Desktop (≥768 px)

```
╭────────────────┬────────────────────────────╮
│ 🔍 Search      │                            │
│                │                            │
│ 12 places      │          M A P             │
│ [All][Shops]…  │                            │
│ ▢ Sharma Kirana│      ╭──────────────────╮  │
│ ▢ Anand Salon  │      │ ↻ Search this area│  │
│ ▢ …            │      ╰──────────────────╯  │
│                │                       ⊕ ◎  │
╰────────────────┴────────────────────────────╯
```

Same components, same state — the sheet **docks as a left panel** instead of
sliding from the bottom. No separate desktop implementation.

### 2.3 "Search this area"

| Concern | Decision |
|---------|----------|
| When the pill appears | Map centre moves > ~25 % of the viewport, or zoom changes by ≥1 |
| What it queries | Viewport centre + a radius derived from the visible bounds |
| Cost | **One query per tap.** Never on pan |
| While searching | Pill shows a spinner; results fade, don't clear (no empty flash) |
| Recenter | Kept — jumps back to the user and searches there |
| First load | Searches around the user's location, as today |

Radius stops being a user-facing control and becomes a function of zoom.

### 2.4 The search input

One field, two intents, disambiguated by results:

- **Areas** (forward-geocode) → moves the map there, then auto-searches.
- **Shops/providers** (discovery search) → results in the sheet, pins on the map.

Grouped headers in the dropdown, so it's obvious which is which.

---

## 3. Component plan

| File | Fate |
|------|------|
| `index.tsx` | Slims to an orchestrator: map + sheet + search, state via `useMapViewport` |
| `useMapViewport.ts` | **New.** Viewport centre/zoom/bounds, derived radius, `hasMovedSinceSearch` |
| `MapResultsSheet.tsx` | **New.** Absorbs `NearbySheet`, `LayerToggles`, places badge |
| `SearchThisArea.tsx` | **New.** The pill |
| `SearchBar.tsx` | Reworked into the dual-intent input |
| `LayerToggles.tsx` | **Removed** — becomes filter chips inside the sheet |
| `RadiusStrip.tsx` | **Removed** — radius derives from zoom (see §5 caveat) |
| `NearbySheet.tsx` | **Removed** — folded into the results sheet |
| `MapMarkers.tsx` | Kept. Selection already resolves against live data |
| `MapControllers.tsx` | Keeps `RecenterButton` + long-press; `RadiusController` retires with the strip |
| `LocationPinDrop.tsx`, `useLocationPinDrop.ts` | Kept as-is |
| `mapIcons.ts`, `mapboxFallback.ts` | Kept as-is |

**CSS:** delete the 6 stacking variables and all 4 `:has()` layout selectors.
The sheet owns the bottom; only two FABs float, in one column.

---

## 4. Native vs web — the part that's easy to get wrong

You asked for this to be good on both. They are not the same problem.

| Concern | Native (Capacitor) | Web |
|---------|--------------------|-----|
| Viewport height | Stable, no URL bar | URL bar collapses → **`100dvh`, never `100vh`** |
| Safe areas | Notch + gesture bar are real | Usually zero, but must not be assumed |
| Sheet bottom | `env(safe-area-inset-bottom)` above the nav | Same rule, usually resolves to 0 |
| Back button | **Hardware back must collapse the sheet before leaving the screen** | Browser back = history; the sheet uses a history entry so it behaves identically |
| Input | Touch only | Touch **and** mouse — sheet drag needs a scrollbar/keyboard equivalent |
| Keyboard | Opening search resizes the WebView — the sheet must not jump | Same, less severe |
| `:has()` | Old Android WebViews lack it | Fine in modern browsers |

**Rules this imposes:**

1. **No `:has()` for layout.** It's currently load-bearing for FAB positioning
   and silently no-ops on an un-updated Android WebView. The redesign removes
   the need entirely.
2. **`100dvh` everywhere**, with `100vh` only as a fallback line above it.
3. **Sheet drag must not steal map pans.** The sheet claims vertical gestures
   only within its own bounds; the map keeps everything else.
4. **Desktop is a layout change, not a code fork** — one component tree, a
   media query decides bottom-sheet vs side-panel.
5. **Every control reachable without a drag**: tapping the handle cycles
   detents, so a mouse user is never stuck.

---

## 5. Consequence to resolve before starting

**Retiring `RadiusStrip` removes the only place a user sets their notification
radius from the map.** The strip currently writes through:

```js
void userService.update({ notificationRadiusKm: radiusKm })
```

So it isn't only a map control — it's doubling as a *profile* setting, which is
part of why the screen feels overloaded.

**Proposal:** the map's radius becomes purely visual (derived from zoom), and
notification radius stays where it belongs, in Settings → Discovery. **To
confirm before Phase 3:** that `/settings/discovery` genuinely exposes it, so
nothing is lost.

Guests are pinned to `GUEST_RADIUS_KM` (1 km) with the strip hidden. That cap
must survive as a **clamp on the searched area**, not just a hidden control.

---

## 6. Must not regress

Fixes landed on this screen earlier this cycle. A redesign is exactly how they
get lost:

- 30 s Mapbox timeout → free-map fallback; **no idle style-swapping**
- North-up lock (rotate/pitch off, incl. touch)
- `reuseMaps` — no re-init when returning to the tab
- First-frame `fitBounds` lurch removed
- **Long-press opens the pin-drop confirm** — it must never silently rewrite the saved location again
- Pin hit areas ≥ 44 pt
- Popup resolves against live data (closes when its layer/radius drops it)
- `StoryAvatar` is JSX — no inline `onerror`, no unescaped `alt` (CSP + injection)
- `overscroll-behavior: none` on the map screen

---

## 7. Phases

| Phase | Work | Ships alone? |
|-------|------|--------------|
| **1** | `useMapViewport` + viewport-based queries + "Search this area" pill. Existing chrome untouched. | Yes — biggest win, smallest diff |
| **2** | `MapResultsSheet` (peek/half/full), absorbing NearbySheet + layer filters + count | Yes |
| **3** | Retire `RadiusStrip`/`RadiusController`/`LayerToggles`; delete the stacking CSS and `:has()` | Yes, after §5 |
| **4** | Desktop side-panel media query | Yes |
| **5** | Dual-intent search input | Yes |
| **6** | Visual pass — pins, glass, spacing to Street Light | Yes |

Phase 1 alone fixes the thing that actually makes the screen feel broken. If
the launch gets tight, ship 1–2 and stop.

**Deliberately not in scope:** marker clustering. It's a real need at density
but it's its own project, and nothing in your current data volume requires it.

---

## 8. Verification

Per phase: `tsc`, `eslint`, `vitest`, build. Then on device:

- [ ] Pan two neighbourhoods away → pill appears → tap → **results actually change**
- [ ] Pan without tapping → results stay put, no surprise refetch
- [ ] Zoom out to a city → radius grows sensibly, no absurd query
- [ ] Guest → searched area still clamped to 1 km
- [ ] Sheet drag never pans the map underneath, and vice versa
- [ ] Android hardware back collapses the sheet before leaving the screen
- [ ] Keyboard open (search focused) doesn't displace the sheet
- [ ] 360 px / 414 px / desktop — no horizontal scroll, panel docks ≥768 px
- [ ] Every §6 item re-verified
- [ ] Native **and** mobile web, both — the height and safe-area rules differ

---

## 9. Open question

**§5** — confirm notification radius is settable from Settings → Discovery
before the strip is removed. That's the one thing here that could quietly cost
a user a feature.
