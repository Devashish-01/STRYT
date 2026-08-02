# Layer Checklists — Explicit Per-Feature Detail

Referenced by `AGENTS.md` Phase 2 and `review-rubric.md`. After the four
summary checks, every feature report **must** include the layer-specific
section below. The agent fills this **automatically** during audit — do
not skip because a feature "looks done."

| Layer | Required section in `features/<slug>.md` | Screen check |
|-------|------------------------------------------|--------------|
| **frontend** | Visual & screen detail | Full visual checklist |
| **website** | Visual & screen detail | Full visual checklist |
| **backend** | API & handler detail | `n/a` (no UI) |
| **cross-layer** | Both sections | Visual + API |

---

## Frontend & website — Visual & screen detail (required)

Use for every `fe-*` and `web-*` feature. Read the tracker UI spec and
map each listed element to code.

### Step A — Static visual audit (always, during audit)

The agent **must** do this without asking the user:

1. Resolve route from tracker → find `page.tsx` / `layout.tsx` under `app/`.
2. List primary components referenced by the page (imports + children).
3. Extract UI elements from tracker (buttons, fields, labels, sections, CTAs).
4. For each element: grep/read components — mark **present / missing / partial**.
5. Check loading, empty, and error UI in code (skeleton, `EmptyState`, `error.tsx`).
6. Note responsive classes (`sm:`, `md:`, `lg:`) or explicit responsive components.
7. Note a11y signals (`aria-label`, `htmlFor`, `alt`, heading hierarchy).

### Step B — Runtime visual audit (when possible)

Attempt **only if** the agent can run or find evidence without manual user help:

| Source | Action |
|--------|--------|
| Project has Playwright / screenshot tests | Read test files; note what routes are covered |
| `test-suite/` screenshot scripts | Reference existing PNG paths if present |
| Dev server already running | Optional: fetch route or note `visual-runtime: unverified` |
| None of the above | Set **`visual-runtime: unverified`** — static audit still required |

Do not mark `visual-runtime: pass` without evidence (test name, screenshot path, or live check).

### Report template (copy into every fe/web feature file)

```markdown
## Visual & screen detail

**Route:** `/chat`
**Primary files:** `app/chat/page.tsx`, `components/chat/ChatWindow.tsx`, …

### UI element checklist (from tracker)

| Tracker element | Present? | Evidence |
|-----------------|----------|----------|
| Chat input bar | yes | `ChatWindow.tsx` — `ChatInput` |
| Thread sidebar | yes | `ChatWindow.tsx:45` |
| SQL audit drawer | yes | `SqlAuditDrawer.tsx` |
| Citation pills | yes | `CitationPill.tsx` |
| Suggestion chips (empty state) | yes | `SuggestionChips` in `ChatWindow.tsx` |
| New Chat action | yes | `ChatWindow.tsx` |

### UI states (code inspection)

| State | Status | Evidence |
|-------|--------|----------|
| Loading | pass | `MessageStream` loading skeleton |
| Empty | pass | `SuggestionChips` when no messages |
| Error | partial | generic toast only — no inline error panel |

### Responsive & a11y (static)

| Check | Status | Notes |
|-------|--------|-------|
| Responsive layout | pass | `grid-cols-1 lg:grid-cols-3` |
| Labeled inputs | pass | `aria-label` on chat input |
| Keyboard / focus | unverified | needs runtime |

**visual-runtime:** unverified — no Playwright run this session; static pass
```

Log a finding when any **tracker-required** element is **missing** or
**partial** (screen alignment or functionality check).

---

## Backend — API & handler detail (required)

Use for every `be-*` feature. Screen alignment is always `n/a`.

### The agent must:

1. List each API endpoint from the tracker (method, path, purpose).
2. Find router/handler file and handler function.
3. Confirm request/response shapes vs tracker (query params, body fields).
4. Confirm auth/dependency injection (`get_current_user`, tenant scope).
5. List DB models/tables touched (for cross-check with Check 3).
6. Note SSE/webhook/job entry points if applicable.

### Report template

```markdown
## API & handler detail

| Method | Path | Handler | Auth | Status |
|--------|------|---------|------|--------|
| GET | `/api/v1/invoices/stream/{batch_id}` | `routers/invoices.py` | yes | pass |
| POST | `/api/v1/chat/message` | `routers/chat.py` | yes | pass |

**Models / tables:** `Invoice`, `ChatMessage`, …
**SSE / async:** `StreamingResponse` text/event-stream — `queue_worker/handlers.py`
**Notes:** duplicate event types documented in tracker §3
```

---

## Cross-layer features

Include **both** Visual & screen detail and API & handler detail. Link
frontend route to backend endpoints explicitly.

---

## What gets logged as findings

| Observation | Check | Type |
|-------------|-------|------|
| Tracker lists button; no component | Screen alignment | gap |
| Button wrong label | Screen alignment | bug |
| Page exists but drawer missing | Screen alignment | gap |
| API path wrong vs tracker | Functionality | bug |
| Tracker UI doc stale; code has more | Screen alignment | doc-mismatch |
| Cannot run browser; static only | — | note `visual-runtime: unverified` (not a finding by itself) |

---

## Minimum bar — do not write "pass" with one line

Unacceptable (current thin reports):

> No new findings. `app/chat/page.tsx` present.

Required: UI element table with ≥ every bullet from tracker UI section,
plus states row, plus visual-runtime status.
