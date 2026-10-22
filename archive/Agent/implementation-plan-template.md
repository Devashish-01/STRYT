# Implementation Plan — Output Template

Referenced by `AGENTS-IMPLEMENT.md`. Every implement run writes **one**
plan file at `new tracker/plans/<work-item-id>.md` (e.g. `NT-002.md`
or `vendor-flow-login.md` for direct tracker refs).

Phases 2–7 append to this file **in order**. Do not skip sections.

---

## File header (Phase 1)

```markdown
# Implementation Plan — <work_item_id>

**Work item:** NT-002 | tracker-ref: `apps/invoice-fe/docs/fe_features_tracker.md` §Feature 3
**Type:** bug | gap | doc-mismatch | regression
**Severity:** critical | major | minor
**Feature:** <feature name>
**Layer:** backend | frontend | website | cross-layer
**Started:** <ISO timestamp>
**Status:** intake | planned | implementing | complete
```

---

## Phase 2 — Current state (NOW)

```markdown
## Phase 2 — Current state (NOW)

_What the code actually does/shows today. No recommendations yet._

### Files inspected

| Path | Purpose |
|------|---------|
| `src/...` | ... |

### Actual behavior

- **UI:** ...
- **API:** ...
- **Database:** ...
- **Config / scripts:** ...

### Evidence

- `path/to/file.ext:42` — ...
```

---

## Phase 3 — Spec state (DOCUMENT)

```markdown
## Phase 3 — Spec state (DOCUMENT)

_What the requirement tracker says must exist._

**Tracker:** `path/to/tracker.md` §Section

### Requirements (from tracker)

> Quoted or tight paraphrase from tracker...

### Expected behavior

- **UI:** ...
- **API:** ...
- **Database:** ...
- **Flow:** ...

### Tracker acceptance criteria (if any)

- [ ] ...
```

---

## Phase 4 — Gap analysis (NOW vs DOCUMENT)

```markdown
## Phase 4 — Gap analysis

| Area | Document says | Code shows now | Match? | Notes |
|------|---------------|----------------|--------|-------|
| UI / screen | ... | ... | no | ... |
| API / logic | ... | ... | partial | ... |
| Database | ... | ... | n/a | ... |
| Flow | ... | ... | unverified | ... |

**Confirmed type:** gap

**Root cause:** ...

**In scope:** ...
**Out of scope:** ...
```

---

## Phase 5 — Implementation plan

```markdown
## Phase 5 — Implementation plan

### Steps

1. ...
2. ...
3. ...

### Files to change

| File | Action | Reason |
|------|--------|--------|
| `path/new.ts` | create | tracker §... |
| `path/existing.ts` | modify | ... |

### Acceptance criteria

- [ ] Matches tracker §... (UI)
- [ ] API returns ... per tracker
- [ ] Tests pass: `npm test ...`

### Test plan

| Step | Command / action | Expected |
|------|------------------|----------|
| 1 | `npm test` | all pass |
| 2 | Manual: open /route | button visible |

### Risks

- ...
```

---

## Phase 6 — Implementation log (append per step)

```markdown
## Phase 6 — Implementation log

### Step 1 — done <ISO>

- Changed: `path/file.ts`
- Notes: ...

### Step 2 — done <ISO>

- ...
```

---

## Phase 7 — Verification

```markdown
## Phase 7 — Verification

| Criterion | Result | Evidence |
|-----------|--------|----------|
| ... | pass / fail | test output / manual note |

**Tests run:**

```
<command output summary>
```

**Overall:** pass | fail — if fail, return to Phase 6
```

---

## Phase 8 — Close (footer)

```markdown
## Phase 8 — Close

**Completed:** <ISO>
**Finding status:** fixed
**Files changed:** list
**Re-audit suggested:** feature `<slug>` — run tracker-audit to confirm
```

---

## Finding status lifecycle (`findings-index.md`)

| Status | When set |
|--------|----------|
| `open` | Audit created finding |
| `planned` | Phase 5 complete, awaiting approval |
| `in-progress` | Phase 1 intake or Phase 6 started |
| `fixed` | Phase 8 complete with verification pass |
| `wont-fix` | User decision (manual) |
| `duplicate-of-NT-xxx` | User decision (manual) |

Update the Status column in `findings-index.md`; append date on `fixed`
(e.g. `**fixed** 2026-07-31`).
