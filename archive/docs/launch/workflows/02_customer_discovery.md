# 02 — Home, Discovery, Search, Map

**Priority:** P0/P1 mixed.
**Screens:** `Home`, `Explore` (4 tabs), `Search`, `MapView/`, `AllCategories`,
`CategoryListing`, `BusinessDetail`, `ProviderDetail`, `PlaceDetail`.

## Flow A — Home launchpad

| # | Step | Expected |
|---|------|----------|
| 1 | Open `/home` signed in | Greeting uses alias/name (never email), every tile renders |
| 2 | Tap **every** tile/section on Home | Each one navigates correctly — this screen is a launchpad, not a feed; a dead tile is P0 |
| 3 | Stories bar | Renders avatars, broken images hide cleanly (no broken-image icon) |
| 4 | Upcoming-appointment badge (if A6 has a booking) | Shows count, tapping opens `/appointments` |
| 5 | "My People" tile | See workflow 10 — do not test the location-sharing mechanics here, just confirm the tile navigates |

## Flow B — Explore's 4 tabs

Explore was fully restructured — category + radius are now **one universal
filter above the tabs**, not per-tab, and there's a 4th "Requests" tab folded
in from the old standalone `/requests` screen.

| # | Step | Expected |
|---|------|----------|
| 1 | `/explore` | Universal category+radius filter row, then tabs: **All / Business / Provider / Requests** |
| 2 | Change radius | All four tabs respect it without re-selecting |
| 3 | Business tab | List + infinite scroll, sort options |
| 4 | Provider tab | Same shape as Business |
| 5 | Requests tab | **Nearby / Mine** split, urgent/group/recurring filters |
| 6 | Requests tab, guest | "Ask" button prompts sign-in with a return-here redirect (not a silent bounce — this was a fixed regression) |
| 7 | Scroll each tab to the end | Infinite scroll loads more, no duplicate rows, no infinite spinner |
| 8 | Empty result (obscure category + tiny radius) | Empty state with a clear next action, not a blank screen |

## Flow C — Search

| # | Step | Expected |
|---|------|----------|
| 1 | `/search`, type a shop name | Results filter live |
| 2 | Search a provider name | Results filter live |
| 3 | Search nonsense | Empty state, not an error |
| 4 | Clear search | Returns to whatever the pre-search state was |

## Flow D — Categories

| # | Step | Expected |
|---|------|----------|
| 1 | `/categories` | Full category grid |
| 2 | Tap one | `/category/:id` — filtered listing |
| 3 | Subcategories (if any) | Filter further, don't lose the parent filter |

## Flow E — Map

Full detail already in `MANUAL_TEST_PLAN.md` §1.8 (P1, regression-tracked
this cycle) — repeat that table here at minimum:

| # | Step | Expected |
|---|------|----------|
| 1 | Open Map on good connection | Mapbox tiles, no jump after first paint |
| 2 | Throttle to slow 3G, reopen | Falls back to free map within ~30s, never a stuck spinner |
| 3 | Pan/pinch | Smooth, stays north-up |
| 4 | Drag from map edge | Page doesn't scroll/pull-to-refresh behind it |
| 5 | Tap a pin | Reliable hit target, popup opens |
| 6 | Toggle that pin's layer off with popup open | Popup closes, no orphan |
| 7 | Long-press map | Pin-drop confirm, doesn't silently relocate you |
| 8 | Long-press + drag | Treated as pan, no accidental pin-drop |
| 9 | Leave and return via tab | No white flash / full re-init |

## Flow F — Business / Provider / Place detail

| # | Step | Expected |
|---|------|----------|
| 1 | Open a business detail page | Tabs (Services/Products — **not** "Menu" unless it's a restaurant), photos, reviews, share |
| 2 | Salon/gym/chemist | Tab literally reads **Services**/**Products** |
| 3 | Restaurant | Tab reads **Menu** |
| 4 | Share button | Opens `ShareCard`; QR tab generates on-device (not via a third-party API) and actually scans |
| 5 | Bookmark / follow toggles | Optimistic update, persists after reload, reverts on a forced failure (airplane mode) |
| 6 | Provider detail | Same shape as business, service-specific fields |
| 7 | Place detail (`/place/:id`) | Renders; "request a new place" flow (`/place/new`) reachable and submits |
