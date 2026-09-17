# P11 Report — Dependencies, bundle & performance

**Agent / model:** Claude (Opus 5), Claude Code
**Sessions:** 2026-09-16 → 2026-09-18
**Branch:** `phase/07-e2e` (report finished on `night/2026-09-18`)

## 1. 11.A — Dependencies ✅

**Baseline (2026-09-13):** 15 advisories — 2 critical, 7 high, 6 moderate.

| Advisory | Then | Now |
|---|---|---|
| `maplibre-gl` 5.24.0 — **critical, ships to users** (XSS sanitiser bypass) | open | **Fixed** — upgraded to 6.x |
| `vitest` 2.1.9 — critical | open | Still open, **dev-only** |
| `vite` 5.4.21 — high | open | Still open, **dev-only** |
| Transitive highs (`@xmldom/xmldom`, `brace-expansion`, `browserslist`, `fast-uri`, `js-yaml`, `nanoid`) | open | Resolved |
| `react-router` | — | 2 moderate, shipped; fix is a major version bump |

**`npm audit --omit=dev` today: 2 moderate, nothing higher.** The gate — no high or critical advisory in
shipped code — holds. Re-checked on 2026-09-18 after adding `@sentry/react`, which introduced nothing.

**Unused dependencies:** `lucide-react` was in `dependencies` and imported by zero files; `@types/leaflet` was
in the wrong section. Both corrected.

### The maplibre upgrade cost more than the advisory

Worth recording because it was the largest single piece of work in the phase. maplibre-gl 6 is not a drop-in:

- `Map` no longer extends `Camera`, so `react-map-gl` 8.1.1 reading `map.transform` broke;
- the worker became a separate ES module that has to be handed to the map explicitly;
- the style validator rejects Mapbox's `projection` property;
- sprite URLs changed shape.

The basemap rendered blank until all four were fixed. `tests/e2e/critical/map-basemap.spec.ts` was written to
catch exactly that — it waits for a real vector tile response, which only the worker can make, and was proven
to fail when the worker is blocked.

## 2. 11.B — Bundle ✅

| Measure | Before | After |
|---|---|---|
| Guest `/home` first load | 2,136 KB | **1,605 KB** |
| `vendor-react` | 167 KB | 170.53 KB |
| Precache total | — | 6,010 KiB |

Three things did the work, and all three are the same lesson:

- **Firebase** is not given a manual chunk. Naming one pinned it to the entry graph and it was preloaded on
  every page; left alone it follows the dynamic import in `firebaseWeb.ts` and downloads only when someone
  signs in with Google.
- **Leaflet** likewise: `main.tsx` imports `leaflet.css`, and a manual chunk matching that path made the whole
  Leaflet JS a static dependency of the entry — 150 KB on every page load for something only map screens use.
- **maplibre** is reached through a `?worker&url` import so the map screen's chunk carries the worker URL, not
  the library.

**The same trap caught `@sentry/react` in P14.** Its path contains `/react/`, so the `manualChunks` react rule
pinned it into `vendor-react` — +27 KB eagerly, and the dynamic import defeated. Then the service worker
precached the 350 KB chunk. Both fixed; the comments in `vite.config.ts` now name the pattern three times over
because it has now happened three times.

## 3. 11.C — Web performance ⬜ owner-blocked

Lighthouse needs a deployed preview URL. **Owner step 8.** Nothing was measured, and this report does not
estimate it.

## 4. 11.D — Database performance ✅ (staging)

Migration `20260989_rls_initplan_and_fk_indexes.sql`, applied to **staging only**, following
`docs/database/HANDOFF.md` §5 — backup, snapshot, verbatim rollback file, forced-rollback test, apply, verify,
snapshot, advisor, APPLY_LOG row with a script-computed sha256.

| Advisor finding | Baseline | Action |
|---|---|---|
| `auth_rls_initplan` | 10 | **Fixed** — 9 policies rewritten to `(select auth.uid())` via `alter policy`, so the call is evaluated once per query instead of once per row |
| `unindexed_foreign_keys` | 4 | **Fixed** — 4 indexes added |
| `unused_index` | 59 | **Not touched** — an unused index on a young database usually means the feature has not been used yet, not that the index is wrong. Dropping them now would be guessing. |
| `multiple_permissive_policies` | 237 | **Not touched** — consolidating permissive policies changes who can see what. That is an authorization change wearing a performance costume, and P05 owns it. |

**Production has not had this applied** — that is owner step 1, along with `20260973`–`20260988`.

## 5. Verification

| Check | Result |
|---|---|
| `npm audit --omit=dev` | 2 moderate; no high or critical |
| Guest `/home` first load | 1,605 KB (from 2,136 KB) |
| Basemap renders, pans, zooms | `critical/map-basemap.spec.ts` green |
| Staging advisor after `20260989` | `auth_rls_initplan` 0, `unindexed_foreign_keys` 0 |
| Lighthouse | **not run** — owner step 8 |

## 6. Definition of Done

- [x] No high or critical advisory in shipped code
- [x] Unused dependencies removed
- [x] Bundle reduced and the reduction explained
- [x] RLS initplan and FK index findings fixed on staging
- [x] Report
- [ ] Lighthouse against a deployed preview — **owner**
- [ ] `20260989` applied to production — **owner**
