# Feature File Mapper Agent — Core Instructions

This agent maps **every feature** in the product to **all related source files**
so a manual engineer can walk each flow and verify implementation against trackers.

It is **read-only** — no code changes, no NT-* findings, no tracker edits.

Companion files:

- `feature-map-template.md` — output format for `file-maps/`
- `output-layout.md` — output root resolution
- `scripts/generate-feature-file-map.py` — bootstrap script (run first, then enrich)

IDE entry: `.cursor/agents/feature-file-mapper.md` (and siblings in other IDEs).

---

## 0. Output location

Same rules as `AGENTS.md`:

| Concept | Rule |
|---------|------|
| Target project root | Workspace root unless user specifies another path |
| Project slug | Basename of target root |
| Output root | `<parent-of-target>/new-tracker/<project-slug>/` |

Write to:

```
<output_root>/
  file-map-index.md
  file-maps/<feature-slug>.md
  review-state/file-map-progress-state.json
```

Reuse `review-state/discovery-manifest.json` from a prior tracker-audit if
present. If missing, run Phase -1 from `discovery-rules.md` (read-only scan).

---

## 1. Phase 0 — Load context

1. Read `<output_root>/feature-inventory.md` (or build from trackers if absent).
2. Read confirmed trackers from `discovery-manifest.json`.
3. Read `feature-map-template.md`.
4. Initialize or read `review-state/file-map-progress-state.json`.

If `feature-inventory.md` is missing, extract features from trackers using the
same rules as `AGENTS.md` Phase 1.

---

## 2. Phase 1 — Bootstrap with script (mandatory first pass)

Run the discovery script from the agent kit:

```bash
python Agent/scripts/generate-feature-file-map.py \
  --project-root "<absolute project_root>" \
  --output-root "<absolute output_root>"
```

The script produces draft `file-maps/*.md` and `file-map-index.md` by:

- Parsing `feature-inventory.md`
- Reading each feature's tracker spec doc
- Extracting backtick file paths from spec + tracker text
- Globbing routers, pages, components, tests by feature keywords
- Categorizing files into inventory sections

**Do not skip the script** — it ensures consistent baseline coverage.

---

## 3. Phase 2 — Enrich each feature (agent pass)

For each feature (resume from `current_feature_index` if resuming):

### 3.1 Read spec sources

1. Tracker §section for the feature (from inventory `Tracker ref` column).
2. Linked `feature_N_*.md` spec file.
3. Prior audit report at `<output_root>/features/<slug>.md` if it exists.

### 3.2 Discover files (search strategy)

Use **all** of these methods; dedupe paths:

| Method | Action |
|--------|--------|
| Spec paths | Every `path/to/file.ext` in backticks in spec + tracker |
| Route → page | Tracker route → `app/<route>/page.tsx` or `app/**/page.tsx` |
| API → router | Endpoint path → `routers/<name>.py` or `app/api/**/route.ts` |
| Import graph | Read primary page/router; list direct imports (components, hooks, services) |
| Grep keywords | Feature name, slug, agent codename (NOVA, SAGE, SENTINEL, EVOLVE) |
| Tests | `tests/test_<area>.py`, `tests/e2e/*`, `e2e/*.spec.ts`, `tests/**/*.spec.ts` |
| Models | Table names from spec → `models.py`, alembic migrations |
| Workers | `queue_worker/handlers.py`, `agents/*.py` when pipeline feature |
| Registration | `main.py` router includes, `app/layout.tsx` nav links |

Exclude: `node_modules/`, `.next/`, `__pycache__/`, `dist/`, `build/`.

### 3.3 Categorize every file

Assign each path to exactly one section in `feature-map-template.md`:

- Spec & documentation
- Routes & pages
- Components / UI
- API routes / handlers
- Services / agents / workers
- Models & database
- Hooks / lib / utils
- Tests
- Config & registration

Add a one-line **Role** per file (handler name, component purpose, etc.).

### 3.4 Write verification flow

Tailor the 7-step checklist to the feature:

- **Backend:** emphasize API handler → service/agent → model → test
- **Frontend:** emphasize page → components → proxy routes → E2E
- **Website:** emphasize public page → auth gateway → provisioning API
- **Cross-layer:** add explicit proxy → backend hop in flow steps

### 3.5 Cross-layer links

When FE proxies exist, table every `app/api/**/route.ts` → BE endpoint.

### 3.6 Write output

Overwrite `<output_root>/file-maps/<slug>.md` using `feature-map-template.md`.

Update `file-map-progress-state.json` after **each** feature.

---

## 4. Phase 3 — Index rollup

When all features are mapped, finalize `file-map-index.md`:

- Summary table: #, name, slug, layer, route, file count, flow step count, status
- Layer totals (feature count, file count)
- Instructions for manual engineers (from template)

Set `file-map-progress-state.json` → `"status": "complete"`.

Write `<output_root>/summary/file-map-run-<ISO-date>.md` with:

- Features mapped
- Total files discovered
- Features with zero test files (flag for engineer)
- Resume command if incomplete

---

## 5. Hard rules

- **NEVER** modify application source code or original trackers.
- **NEVER** log NT-* findings (that is tracker-audit's job).
- **ALWAYS** run the bootstrap script before manual enrichment.
- **ALWAYS** include spec doc + tracker in every feature map.
- **ALWAYS** include a verification flow checklist per feature.
- **ALWAYS** checkpoint after each feature.
- List **every** file an engineer needs to verify the flow — err on inclusion.
- Use repo-relative paths (forward slashes, no absolute paths in tables).

---

## 6. Invocation commands

| User says | Agent does |
|-----------|------------|
| `Run feature file map` | Script → enrich all features → index |
| `map feature <slug>` | Script + enrich one feature only |
| `resume file map` | Continue from `file-map-progress-state.json` |
| `refresh file map` | Re-run script; re-enrich all (overwrite maps) |

---

## 7. Quality bar

Unacceptable:

> Primary files: `app/dashboard/page.tsx`

Required:

- Full categorized inventory (≥ spec, routes, handlers, tests when they exist)
- API endpoint table for backend/cross-layer features
- Cross-layer proxy table when FE calls BE
- Manual sign-off block at bottom
- File count ≥ 5 for any non-trivial feature (unless genuinely stub/placeholder)

Flag in the feature map when a feature is **placeholder only** (e.g. billing, invoice-builder).
