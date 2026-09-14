# P11 — Dependencies, bundle & performance

**Who:** agent; owner confirms database applies
**Size:** 2–3 sessions. 11.A dependencies; 11.B bundle; 11.C web performance; 11.D database performance.
**Depends on:** P10

## Goal
- **Dependencies:** no high or critical vulnerabilities in anything that ships to users; no unused dependencies.
- **Bundle:** a leaner shipped bundle.
- **Performance:** measured web performance that meets the targets below.
- **Database:** the safe database performance fixes applied.

## Baseline (2026-09-13)
- **`npm audit`:** 15 (2 critical, 7 high, 6 moderate).
  - `maplibre-gl` 5.24.0 — **critical**, ships to users: XSS sanitiser bypass, fixed in 6.x.
  - `vitest` 2.1.9 — critical (dev only); fix in 5.x.
  - `vite` 5.4.21 — high (dev server); fix in 8.x.
  - Transitive: `@xmldom/xmldom`, `brace-expansion`, `browserslist`, `fast-uri`, `js-yaml`, `nanoid` (high).
- **Unused dependencies:** `lucide-react` is in `dependencies` and imported by **0** files. `@types/leaflet` is in `dependencies` but belongs in `devDependencies`.
- **Shipped OTA bundle 1.0.63:** 5.7 MB, 192 JS files. Largest:

  | Chunk | Size |
  |---|---|
  | `maplibre-gl` | 1,030 KB |
  | `index` | 530 KB |
  | `vendor-icons` (Phosphor) | 347 KB |
  | `QrScannerSheet` | 335 KB |
  | `vendor-firebase` | 218 KB |
  | `vendor-supabase` | 207 KB |
  | `vendor-react` | 167 KB |
  | `legalDocs` | 153 KB |
  | `vendor-map` | 150 KB |
  | CSS | 215 KB |
- **Maps:** Leaflet (`react-leaflet` in 6 files, `leaflet` in 3) and MapLibre (`maplibre-gl` 5, `react-map-gl` 7) are both used. D16: keep both, lazy-loaded.
- **Performance advisor:**
  - 10 `auth_rls_initplan`
  - 4 `unindexed_foreign_keys`
  - 59 `unused_index`
  - 237 `multiple_permissive_policies`

## Preconditions
| Check | Command | Expected |
|---|---|---|
| Branch | `git switch -c phase/11-deps-perf origin/develop` | Switched |
| Suites green | `npm run verify`, `npm run e2e` | exit 0 |
| Baseline recorded | `npm audit --json > <scratch>/audit-before.json`; `npm run build` and list `dist/assets` sizes | Saved (paste the summaries) |

## Read first
- `package.json`, `vite.config.ts` (`manualChunks`, PWA plugin config), `capacitor.config.ts`
- The changelogs / migration guides for every **major** version you upgrade: MapLibre GL JS 6, react-map-gl (compatibility with MapLibre 6), Vite, Vitest, `vite-plugin-pwa` (supported Vite versions)

## Rules
- **One upgrade per commit.** After each: `npm run verify`, plus the E2E specs for the affected area (maps: search, map view, business detail, place, delivery tracking).
- If a major upgrade breaks compatibility (e.g. `react-map-gl` doesn't support MapLibre 6), **stop and report the options**. Don't fork or patch libraries.

## Steps

### 11.A — Dependencies
1. Remove `lucide-react`. Prove zero imports first: `git grep -n "lucide-react" -- src` → no output. Move `@types/leaflet` to `devDependencies`.
2. `npm audit fix` (non-breaking only). Paste the before/after summary.
3. Upgrade `maplibre-gl` to 6.x and `react-map-gl` to a compatible version. Fix API changes. Verify:
   - map screens via E2E;
   - manual checks with screenshots: pins, avatar pins, "me" icon, recenter, clustering if present, and the delivery tracking map.
4. Upgrade the dev tooling: Vitest to the fixed major, then Vite plus `@vitejs/plugin-react` plus `vite-plugin-pwa` to versions that support each other. Check `vite.config.ts` and the PWA/service worker (`src/sw.js`) still build and register (`npm run build` and `npm run preview`; paste the SW registration from the browser console).
5. `npm audit --omit=dev` must report 0 high/critical. List any remaining dev-only moderate items, each with a reason.

### 11.B — Bundle
6. Add `rollup-plugin-visualizer` (dev dependency) behind `ANALYZE=1`. Generate `docs/perf/bundle-before.html` (from the baseline commit) and `bundle-after.html`.
7. **Icons:** make sure Phosphor icons are imported per icon, or through the project's `@/components/Icons` wrapper with tree-shakeable imports, so `vendor-icons` contains only used icons.
8. **Lazy loading:** confirm `QrScannerSheet` (`html5-qrcode`), `legalDocs`, `maplibre-gl`, Leaflet and Firebase load **only** when their screens need them. Use `import()` at the point of use where they don't. Verify by loading `/home` in Playwright with network logging: none of those chunks are fetched.
9. Targets: first load for `/home` (sum of JS fetched) reduced by ≥25% from baseline, and no single initial chunk over 400 KB. Paste the before/after network totals.

### 11.C — Web performance
10. Run Lighthouse (mobile preset) three times on the Vercel preview of this branch, for `/home` (guest), `/business/<seeded id>` and `/search`. Use the median. Save the JSON to `docs/perf/lighthouse/`.
11. Targets:
    - Performance ≥ 80
    - Accessibility ≥ 90
    - Best Practices ≥ 90
    - SEO ≥ 90 (public pages)
    - LCP ≤ 2.5 s
    - CLS ≤ 0.1

    Fix what's under target within this phase's scope: image sizes and `loading="lazy"`, font loading, preconnect to Supabase, layout shift from images without dimensions. Anything bigger → `Found, not fixed`.

### 11.D — Database performance (full HANDOFF §5 procedure)
12. `auth_rls_initplan` (10): rewrite each listed policy so `auth.uid()`/`auth.role()` is wrapped as `(select auth.uid())`. **The policy logic must stay identical:** the diff of `qual` must only change the wrapping. Test each in a forced rollback: the same rows are visible to owner/participant/stranger before and after.
13. `unindexed_foreign_keys` (4): add the indexes. Use `create index concurrently` **outside a transaction**. Check whether `apply_migration` runs in a transaction; if it does, use a plain `create index` (the tables are small today) and document why.
14. **Don't** drop "unused" indexes. With pre-launch traffic, "unused" means nothing. **Don't** merge permissive policies in this phase. Record both as accepted for now in HANDOFF, with a reason.

## Verification
| Command | Expected |
|---|---|
| `npm audit --omit=dev` | 0 high, 0 critical |
| `git grep -n "lucide-react" -- src package.json` | No output |
| Bundle table before/after | `/home` initial JS −25% or better; no initial chunk > 400 KB |
| Lighthouse medians | Meet targets (or listed exceptions, with reasons) |
| Advisor `auth_rls_initplan` / `unindexed_foreign_keys` | 0 / 0 |
| `npm run e2e` | 0 failed |
| `npm run verify` | exit 0 |

## Definition of Done
- [ ] No high/critical vulnerabilities in production dependencies; unused dependencies removed.
- [ ] MapLibre 6 working on every map screen (E2E + screenshots).
- [ ] Bundle and Lighthouse targets met, with reports committed.
- [ ] RLS initplan and FK index fixes applied via the procedure.

## Stop and ask if
- A major upgrade has no compatible combination.
- A policy rewrite changes which rows are visible.

## Checker checklist
- Re-run `npm audit --omit=dev` and a production build; compare chunk sizes with the report.
- Open the map on the Vercel preview; pan, zoom and tap a pin.
- Compare one rewritten policy's `qual` before/after from the snapshots: only the `(select auth.uid())` wrapping changed.
