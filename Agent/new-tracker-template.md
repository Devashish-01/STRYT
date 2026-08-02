# New Tracker — Output Templates

Referenced by `AGENTS.md` Sections 5–6. All audit findings are written
to `<output_root>/` (see `output-layout.md`) — typically
`new-tracker/<project-slug>/` sibling to the product. Original project
trackers are **read-only**.

---

## Folder structure (created at runtime)

```
<output_root>/   (new-tracker/<project-slug>/)
  README.md
  feature-inventory.md
  findings-index.md
  features/
  plans/
  summary/
  review-state/
```

---

## findings-index.md (initial)

```markdown
# Findings Index

| ID | Feature | Type | Severity | Check | Summary | Status |
|----|---------|------|----------|-------|---------|--------|
| NT-001 | login | bug | major | functionality | ... | open |

**Counts:** bug: 0 | gap: 0 | doc-mismatch: 0 | regression: 0

Next ID: NT-002
```

Rules:

- ID prefix is always `NT-` (New Tracker).
- Increment from the last ID in this file; never reuse or duplicate.
- Append one row per finding; update counts footer.

---

## Per-feature report (`features/<feature-slug>.md`)

```markdown
# Feature: <Feature Name>

**Tracker ref:** <path/to/tracker.md#section or row ID>
**Layer:** backend | frontend | website | cross-layer
**Audited at:** <ISO timestamp>

## Check summary

| Check | Status | Finding IDs |
|-------|--------|-------------|
| Screen alignment | pass / fail / partial / n/a | NT-001 |
| Functionality | pass / fail / partial | NT-002, NT-003 |
| Database validation | pass / fail / partial / n/a | — |
| Flow validation | pass / fail / partial / unverified | NT-004 |

## Findings

### NT-001 — [bug] <one-line summary>

- **Check:** Screen alignment
- **Severity:** critical | major | minor
- **Tracker says:** ...
- **Code shows:** ...
- **Evidence:** `path/to/file.ext:line`
- **Status:** open

---

## Visual & screen detail (required for frontend | website)

**Route:** `/…`
**Primary files:** `…`

### UI element checklist (from tracker)

| Tracker element | Present? | Evidence |
|-----------------|----------|----------|
| … | yes / no / partial | `file:line` |

### UI states (code inspection)

| State | Status | Evidence |
|-------|--------|----------|
| Loading | pass / partial / n/a | … |
| Empty | … | … |
| Error | … | … |

### Responsive & a11y (static)

| Check | Status | Notes |
|-------|--------|-------|
| Responsive layout | … | … |
| Labeled inputs | … | … |

**visual-runtime:** verified | unverified — reason

---

## API & handler detail (required for backend | cross-layer)

| Method | Path | Handler | Auth | Status |
|--------|------|---------|------|--------|
| GET | `/api/…` | `routers/….py` | yes | pass |

**Models / tables:** …
**Notes:** …
```

Skip **Visual** section for pure backend slugs; skip **API** section for
pure marketing pages with no API. See `layer-checklists.md`.

Status values: `open`, `planned`, `in-progress`, `fixed`, `wont-fix`, `duplicate-of-NT-xxx`

Implement agent lifecycle: `open` → `planned` → `in-progress` → `fixed`
(see `implementation-plan-template.md`).

---

## plans/ folder (implement agent output)

```
new tracker/plans/
  NT-002.md                 ← one file per work item
  <feature-slug>.md         ← direct tracker-ref fixes
```

Each plan file contains Phases 2–8 sections in order (NOW, DOCUMENT, gap
analysis, plan, implementation log, verification, close). See
`implementation-plan-template.md`.

---

## Finding types

| Type | When to use |
|------|-------------|
| `bug` | Spec says X; code does something wrong |
| `gap` | Spec missing but code exists, or spec exists but code missing |
| `doc-mismatch` | Tracker contradicts architecture doc or itself |
| `regression` | Tracker marks feature done/resolved but audit fails |

---

## feature-inventory.md (Phase 1 output)

```markdown
# Feature Inventory

Extracted from confirmed trackers on <date>.

| # | Feature | Slug | Layer | Route/Page | Tracker ref |
|---|---------|------|-------|------------|-------------|
| 1 | User Login | user-login | frontend | /login | fe_features_tracker.md §Login |

## Feature detail: user-login

- **Expected UI:** email field, password field, Submit button, Forgot password link
- **Expected APIs:** POST /api/auth/login
- **Expected DB:** users, sessions
- **Expected flow:** submit → validate → token → redirect dashboard
```

Build one detail block per feature before Phase 2 audit begins.

---

## Run summary (`summary/run-<timestamp>.md`)

```markdown
# Audit Run Summary — <ISO timestamp>

## Scope
- Project: <project_root>
- Manifest: review-state/discovery-manifest.json (confirmed <date>)
- Features audited this run: N
- Features remaining: M

## Findings
- New: NT-001 … NT-015
- By type: bug N, gap N, doc-mismatch N, regression N
- By check: screen N, functionality N, database N, flow N

## Unverified
- Features with flow validation `unverified`: ...

## Resume
- Next feature: `<slug>`
- progress-state: review-state/progress-state.json
```
