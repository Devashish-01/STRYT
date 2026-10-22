# Feature File Map — Output Templates

Referenced by `AGENTS-FEATURE-MAP.md`. Runtime output goes to
`<output_root>/file-maps/` (see `output-layout.md`).

---

## Folder structure

```
<output_root>/
  file-map-index.md              # Master index + engineer checklist
  file-maps/
    <feature-slug>.md            # One file per feature
  review-state/
    file-map-progress-state.json # Resume pointer
```

---

## file-map-index.md (initial)

```markdown
# Feature File Map Index

**Project:** <project_slug>
**Generated:** <ISO timestamp>
**Features mapped:** <n> / <total>
**Purpose:** Manual engineer verification — every file tied to a feature flow

| # | Feature | Slug | Layer | Route | Files | Flow steps | Status |
|---|---------|------|-------|-------|-------|------------|--------|
| 1 | … | be-auth | backend | GET /auth/me | 12 | 5 | complete |

## How to use (manual engineer)

1. Pick a feature row below (or open `file-maps/<slug>.md`).
2. Walk **Verification flow** steps in order — check each box.
3. Open every file in **File inventory** and confirm it matches the tracker.
4. Mark **Manual sign-off** at the bottom of the feature map when done.

## Layer summary

| Layer | Features | Total files |
|-------|----------|-------------|
| backend | … | … |
| frontend | … | … |
| website | … | … |
```

---

## Per-feature map (`file-maps/<feature-slug>.md`)

```markdown
# Feature: <Feature Name>

**Slug:** `<feature-slug>`
**Layer:** backend | frontend | website | cross-layer
**Route / entry:** `/dashboard` or `POST /api/v1/invoices/upload`
**Tracker ref:** `<path/to/tracker.md §Feature N>`
**Spec doc:** `<path/to/feature_N_*.md>`
**Mapped at:** <ISO timestamp>

## Verification flow (manual)

Engineer: execute in order; check each box when verified.

- [ ] **1. Spec** — Read tracker §section and spec doc; note acceptance criteria
- [ ] **2. Entry point** — Open route/page or API handler listed below
- [ ] **3. UI / API** — Walk primary user or API flow end-to-end
- [ ] **4. Data** — Confirm DB models/migrations if applicable
- [ ] **5. Tests** — Run or review automated tests listed below
- [ ] **6. Cross-layer** — If FE+BE, verify proxy → backend chain
- [ ] **7. Sign-off** — All files reviewed; flow matches tracker

## File inventory

### Spec & documentation

| File | Role |
|------|------|
| `apps/invoice-be/docs/feature_1_auth.md` | Feature spec |
| `apps/invoice-be/docs/be_features_tracker.md` | Tracker §Feature 1 |

### Routes & pages

| File | Role |
|------|------|
| `app/dashboard/page.tsx` | Primary page |

### Components / UI

| File | Role |
|------|------|
| `components/dashboard/MetricsGrid.tsx` | Metrics widgets |

### API routes / handlers (FE proxies or BE routers)

| File | Role |
|------|------|
| `routers/dashboard.py` | `GET /metrics` handler |

### Services / agents / workers

| File | Role |
|------|------|
| `agents/query_agent.py` | RAG query agent |

### Models & database

| File | Role |
|------|------|
| `models.py` | `User`, `Tenant` |
| `alembic/versions/xxx.py` | Migration |

### Hooks / lib / utils

| File | Role |
|------|------|
| `lib/dashboard-service.ts` | API client |

### Tests

| File | Role |
|------|------|
| `tests/test_dashboard.py` | Backend unit tests |
| `e2e/dashboard.spec.ts` | Playwright E2E |

### Config & registration

| File | Role |
|------|------|
| `main.py` | Router registration |

## API endpoints (if applicable)

| Method | Path | Handler file |
|--------|------|--------------|
| GET | `/api/v1/dashboard/metrics` | `routers/dashboard.py` |

## Cross-layer links

| From | To | Notes |
|------|-----|-------|
| `app/api/dashboard/metrics/route.ts` | `GET /api/v1/dashboard/metrics` | FE proxy |

## Manual sign-off

| Field | Value |
|-------|-------|
| Reviewed by | |
| Date | |
| Result | pass / fail / partial |
| Notes | |
```

---

## file-map-progress-state.json

```json
{
  "schema_version": 1,
  "status": "in_progress",
  "current_feature": "fe-dashboard",
  "current_feature_index": 22,
  "features_completed": ["be-auth", "be-ingestion-pipeline"],
  "features_total": 40,
  "files_discovered_total": 0,
  "last_run_at": "<ISO>",
  "run_started_at": "<ISO>"
}
```
