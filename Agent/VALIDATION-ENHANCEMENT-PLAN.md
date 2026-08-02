# Validation Enhancement Plan — UI, Visual, and Flow Control

**Status:** Plan (brainstorm → implement)  
**Audience:** Team + tracker-audit / tracker-implement agents  
**Goal:** Every feature audit produces **controlled, repeatable evidence** for
screen layout, visual design (padding, tokens, elements), and end-to-end
flow — not one-line `pass` / `unverified` rows.

**Related kit files (today):**

| File | Role |
|------|------|
| `AGENTS.md` | Audit phases |
| `review-rubric.md` | Four checks |
| `layer-checklists.md` | Visual + API detail (v1) |
| `new-tracker-template.md` | Output shapes |
| `output-layout.md` | `new-tracker/<product>/` output |

This plan extends those files in **phases** below. Do not duplicate logic
in IDE wrappers — update the kit once, all IDEs behave the same.

---

## 1. Problem statement

| Gap | Today | Target |
|-----|-------|--------|
| Screen check | Often “page exists” | Element + layout + padding evidence |
| Flow check | 40/40 `unverified` | F1 trace minimum; tests/runtime when available |
| Control | Hard to compare runs | Same tables every feature, every IDE |
| Findings | Miss subtle UI gaps | Log padding/token/flow gaps with evidence |

---

## 2. Validation model — five dimensions

Keep the existing **four checks** in the summary table. Enrich **how**
Check 1 (screen) and Check 4 (flow) are produced using **detail sections**
below the summary.

```
┌─────────────────────────────────────────────────────────────┐
│  Check summary (unchanged): screen | func | db | flow       │
├─────────────────────────────────────────────────────────────┤
│  Detail block A — Visual & screen (fe / web)                │
│    • UI elements    • Layout & padding    • States          │
│    • Design tokens  • Responsive / a11y   • visual-runtime  │
├─────────────────────────────────────────────────────────────┤
│  Detail block B — API & handler (be)                        │
├─────────────────────────────────────────────────────────────┤
│  Detail block C — Flow validation (all layers)              │
│    • F1 static trace  • F2 test-backed  • F3 runtime        │
└─────────────────────────────────────────────────────────────┘
```

### Dimension map

| Dimension | Maps to check | Layers |
|-----------|---------------|--------|
| UI elements (buttons, fields, labels) | Screen alignment | fe, web |
| Layout & padding (spacing, alignment) | Screen alignment | fe, web |
| Design tokens (colors, typography per tracker) | Screen alignment | fe, web |
| API / handler correctness | Functionality + API detail | be |
| Data / schema | Database validation | be, some fe |
| End-to-end story | Flow validation | all |

---

## 3. Visual & screen control (frontend + website)

### 3.1 Three tiers (mirror flow model)

| Tier | Name | Agent alone? | Evidence |
|------|------|--------------|----------|
| **V1** | **Static structure** | Yes | Routes, components, element present/missing |
| **V2** | **Static design** | Yes | Tailwind/classes vs tracker theme spec |
| **V3** | **Runtime visual** | If Playwright/screenshots/dev server | PNG, test name, live check |

**Check 1 `pass` rules (proposed):**

- **pass** — V1 complete, all required elements present; V2 no major token/padding deviations
- **partial** — V1 complete but V2 gaps (wrong padding, missing token class)
- **fail** — required element missing
- **n/a** — backend only

### 3.2 UI element checklist (V1 — mandatory)

For each bullet in tracker **Theme & Styling** / **Tasks** / wireframe text:

| Tracker element | Present? | Component | Evidence |
|-----------------|----------|-----------|----------|
| Primary CTA | yes/no/partial | `Button` in `Page.tsx` | `file:line` |

Already in `layer-checklists.md` — keep and enforce.

### 3.3 Layout & padding checklist (V2 — new)

Read tracker spacing/layout notes and compare to code (static).

| Area | Tracker spec | Code shows | Match? | Evidence |
|------|--------------|------------|--------|----------|
| Page padding | `p-6` / container | `className` on layout | yes/no | `layout.tsx:12` |
| Section gap | `gap-4` between cards | flex/grid gap | partial | `Dashboard.tsx:45` |
| Card internal padding | `p-4` | Card component | yes | `Card.tsx` |
| Sidebar width | 280px / `w-72` | sidebar class | yes | `Shell.tsx` |
| Button size / height | `h-10`, `px-4` | button classes | no → finding | `Button.tsx` |
| Max content width | `max-w-7xl mx-auto` | container | yes | `page.tsx` |
| Mobile stack | single column `< md` | `grid-cols-1 md:grid-cols-2` | yes | responsive classes |

**When to log a finding:**

| Issue | Type | Severity |
|-------|------|----------|
| Tracker specifies padding; code uses clearly different scale | screen | minor |
| Broken layout (overlap, no responsive stack) | screen | major |
| Wrong brand colors from tracker theme block | screen | minor |
| Missing entire section | screen | major (gap) |

**Invoice LLM note:** Trackers often use explicit Tailwind in `feature_*.md`
(e.g. chat bubble classes in `feature_5_chat.md`). Agent must compare those
strings to `className` in components.

### 3.4 Design token cross-check (V2 — optional depth)

If project has a token source, agent reads it once per run:

| Source | Path (Invoice LLM) |
|--------|-------------------|
| FE theme | `apps/invoice-fe` globals, `tailwind.config` |
| Website | `apps/invoice-website` theme |
| Tracker theme block | per `feature_*.md` |

Table in feature file:

| Token | Tracker | Code | Match? |
|-------|---------|------|--------|
| Primary bg | `#1E293B` | `bg-[#1E293B]` | yes |

Skip token table if tracker has no theme section — note `tokens: n/a`.

### 3.5 UI states (mandatory for fe/web)

| State | Status | Evidence |
|-------|--------|----------|
| Loading | pass/partial/n/a | skeleton, spinner |
| Empty | pass/partial/n/a | empty component |
| Error | pass/partial/n/a | toast, inline error |

### 3.6 Runtime visual (V3)

| Source | Action |
|--------|--------|
| `apps/invoice-fe/tests/e2e/*.spec.ts` | Map spec → feature slug; cite coverage |
| `test-suite/docs/screenshots/` | Reference PNG if route matches |
| Dev server running | Optional screenshot; else `visual-runtime: unverified` |

Never mark V3 `pass` without test or image evidence.

---

## 4. Flow validation control (all layers)

### 4.1 Three tiers

| Tier | Name | Agent alone? | Evidence |
|------|------|--------------|----------|
| **F1** | **Static flow trace** | Yes | Trigger → steps → side effects table |
| **F2** | **Test-backed** | Yes if tests run | pytest / Playwright / test-suite |
| **F3** | **Runtime** | Sometimes | Logs, SSE, live API, webhook receiver |

**Check 4 status rules (proposed):**

| Status | Meaning |
|--------|---------|
| **pass** | F1 complete + (F2 all green OR F3 verified) |
| **partial** | F1 complete only |
| **unverified** | F1 missing or audit blocked |
| **n/a** | Static marketing with no flow |

### 4.2 F1 — Flow trace table (mandatory every feature)

```markdown
## Flow validation

### Expected flow (from tracker)
1. …
2. …

### F1 — Static trace

| Step | Expected | Evidence | Status |
|------|----------|----------|--------|
| 1 User action / API trigger | … | `file:line` | pass |
| 2 Backend processing | … | … | pass |
| 3 State / DB update | … | model/status enum | pass |
| 4 UI / webhook / SSE side effect | … | … | partial |

**flow-runtime:** unverified | verified — reason
**flow-tests:** not run | 14/14 pass — `tests/test_webhooks.py`
```

### 4.3 F2 — Test mapping (per product)

Maintain **`flow-test-map.md`** in output root (generated Phase 1, curated):

| Feature slug | pytest | Playwright | test-suite catalog |
|--------------|--------|------------|-------------------|
| be-webhooks | `tests/test_webhooks.py` | — | — |
| fe-chat | — | `tests/e2e/chat.spec.ts` | — |
| fe-dashboard | — | `tests/e2e/dashboard.spec.ts` | — |

Agent during Phase 2:

1. Look up slug in map (or discover by grep).
2. Run tests if shell allowed and env supports.
3. Record pass/fail count in feature file.

**Policy (recommended):** `partial` acceptable for minor features;
**critical/major tracker features** require F2 for Check 4 `pass`.

### 4.4 F3 — Runtime (critical paths only)

Run F3 for a **short allowlist** per audit (not all 40 every time):

| Priority | Journeys (Invoice LLM) |
|----------|------------------------|
| P0 | Auth gateway, ingestion upload, audit approve, chat send |
| P1 | Connectors OAuth, webhooks delivery, outbound send |
| P2 | Dashboard metrics, settings, website signup |

Document in `review-state/discovery-manifest.json`:

```json
"flow_runtime_allowlist": ["web-auth-gateway", "be-ingestion-pipeline", "fe-chat"]
```

### 4.5 Layer-specific flow focus

| Layer | F1 focuses on | F2 typical source | F3 typical |
|-------|---------------|-------------------|------------|
| **backend** | Hook after commit, queue, dispatch | `tests/test_*.py` | API + worker logs |
| **frontend** | click → hook → API → UI state | Playwright e2e | browser journey |
| **website** | auth redirect, CTA → API | Playwright / manual | Clerk staging |
| **cross-layer** | sequence across apps | journey doc + test-suite | full E2E |

---

## 5. Unified feature report schema (target)

Every `new-tracker/<product>/features/<slug>.md` must contain:

```markdown
# Feature: …
**Layer:** … | **Tracker ref:** … | **Audited at:** …

## Check summary
| Check | Status | Finding IDs |
…

## Findings
…

## Visual & screen detail          ← fe / web only
### UI element checklist
### Layout & padding checklist      ← NEW (V2)
### Design tokens (if tracker spec) ← NEW optional
### UI states
### Responsive & a11y
**visual-runtime:** …

## API & handler detail             ← be / cross-layer

## Flow validation                  ← ALL layers
### Expected flow
### F1 static trace
### F2 test-backed
### F3 runtime (if attempted)
**Check 4 derived status:** pass | partial | unverified
```

**Reject thin reports:** fewer than UI element table + F1 flow table =
audit incomplete (agent must not checkpoint feature).

---

## 6. Discovery manifest extensions

Add to Phase -1 schema (`discovery-manifest.json`):

```json
{
  "visual_sources": [
    { "path": "apps/invoice-fe/tests/e2e/", "type": "playwright" },
    { "path": "test-suite/docs/screenshots/", "type": "screenshots" },
    { "path": "apps/invoice-fe/tailwind.config.ts", "type": "design_tokens" }
  ],
  "flow_sources": [
    { "path": "apps/invoice-be/tests/", "type": "pytest" },
    { "path": "apps/invoice-fe/tests/e2e/", "type": "playwright" },
    { "path": "../test-suite/catalog/", "type": "test-suite" }
  ],
  "flow_runtime_allowlist": [],
  "validation_policy": {
    "require_f1_flow_table": true,
    "require_v2_padding_for_fe_web": true,
    "require_f2_for_check4_pass": "critical_and_major_only",
    "run_tests_during_audit": true
  }
}
```

---

## 7. Finding types for new dimensions

| Observation | Check column | Type |
|-------------|--------------|------|
| Tracker padding `p-6`, code `p-2` | Screen | minor bug or gap |
| Missing button from tracker | Screen | gap |
| Flow step missing in code | Flow | gap |
| Tracker flow wrong vs System Journey | Flow | doc-mismatch |
| No pytest for “done” backend feature | Flow | gap (coverage) |
| Tests fail | Flow / Functionality | regression or bug |

---

## 8. Implementation phases

### Phase 0 — Plan approval (this document)

- [ ] Team agrees on tier rules (V1–V3, F1–F3)
- [ ] Agree Check 1/4 pass vs partial rules
- [ ] Agree test-running during audit (yes/no)
- [ ] Agree F3 allowlist for Invoice LLM

### Phase 1 — Kit docs (Agent/)

| Task | File |
|------|------|
| Add layout & padding section | `layer-checklists.md` |
| Add flow F1/F2/F3 section | `layer-checklists.md` or new `flow-checklists.md` |
| Update Check 1 / Check 4 rules | `review-rubric.md` |
| Update feature template | `new-tracker-template.md` |
| Phase 2 mandatory sections | `AGENTS.md` |
| Wrapper pointer | `wrappers/codebase-reviewer.body.md` |
| Link plan | `README.md` |

### Phase 2 — Product artifacts (first run generates)

| Task | Output |
|------|--------|
| Generate `flow-test-map.md` | `new-tracker/Prod_Invoice_LLM/` |
| Extend discovery manifest | `review-state/discovery-manifest.json` |
| Pilot 3 features | `fe-chat`, `be-webhooks`, `web-pricing` (full new format) |

### Phase 3 — Re-audit pass

| Task | Scope |
|------|-------|
| Re-audit all `fe-*` + `web-*` | Visual V1+V2 + flow F1 |
| Re-audit all `be-*` | API detail + flow F1; run pytest where mapped |
| Run F2 tests | Map-driven pytest + Playwright |
| F3 spot-check | P0 allowlist only |

### Phase 4 — Ongoing control

| Task | Owner |
|------|-------|
| New tracker feature → add to flow-test-map | Dev at PR time |
| Audit on release branch | CI or manual `Run tracker audit` |
| `implement NT-*` uses flow + visual sections in plan | tracker-implement |

---

## 9. Invoice LLM — quick reference

### Visual sources

| App | Routes | E2E tests | Theme |
|-----|--------|-----------|-------|
| invoice-fe | `app/**/page.tsx` | `tests/e2e/*.spec.ts` | Tailwind + tracker theme blocks |
| invoice-website | `app/**` | (add as needed) | marketing components |

### Flow sources

| App | Tests | Runtime |
|-----|-------|---------|
| invoice-be | `apps/invoice-be/tests/test_*.py` | worker logs, SSE |
| invoice-fe | Playwright e2e | browser |
| test-suite | `Invoice-LLM-SOLO-Dev/test-suite/` | catalog + screenshots |

### P0 runtime allowlist (proposed)

- `web-auth-gateway` (NT-017, NT-018)
- `be-ingestion-pipeline`
- `fe-chat`
- `fe-auditor`

---

## 10. Decisions needed (brainstorm)

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | Run tests during every audit? | yes / no / critical only | **yes** for mapped tests |
| 2 | Padding mismatch = finding? | always / major only | **minor** finding if tracker explicit |
| 3 | Check 4 `pass` without F2? | never / allowed for minor | **F2 required** for P0/P1 features |
| 4 | Separate `flow-checklists.md`? | yes / merge into layer-checklists | **merge** until file too large |
| 5 | Include test-suite in full-product audit? | yes / optional | **yes** as flow_source |
| 6 | Screenshot diff in agent? | future / never | **future** — cite existing PNGs first |

---

## 11. Success criteria

Audit is **in control** when:

- [ ] Zero fe/web feature files without **UI element + padding** tables
- [ ] Zero feature files without **F1 flow trace**
- [ ] Check 4 is not blanket `unverified` — at least **partial (F1)** everywhere
- [ ] **F2** recorded where tests exist
- [ ] P0 journeys have **F3** attempted or documented why not
- [ ] Same schema in **every IDE** (single `AGENTS.md` source)

---

## 12. Next steps

1. **Review this plan** — comment on Section 10 decisions.
2. **Approve Phase 1** — implement kit doc updates.
3. **Pilot** — re-audit `fe-chat`, `be-webhooks`, `web-pricing` with full schema.
4. **Roll out** — `re-audit with visual and flow detail` on full product.

---

*Plan version: 2026-07-31 · Universal Tracker Agent Kit*
