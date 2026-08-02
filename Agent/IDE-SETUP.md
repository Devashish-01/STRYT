# IDE Setup — Universal Tracker Agent Kit

Two agents, one kit, **identical behavior in every IDE**.

| Agent | Core file | Purpose |
|-------|-----------|---------|
| **tracker-audit** | `AGENTS.md` | Find gaps/bugs vs trackers |
| **tracker-implement** | `AGENTS-IMPLEMENT.md` | Fix: NOW → DOCUMENT → plan → implement |
| **feature-file-mapper** | `AGENTS-FEATURE-MAP.md` | Map features → files for manual flow verification |

IDE wrappers are thin pointers — never duplicate phase logic.

---

## Supported IDEs

| IDE / agent | Audit entry | Implement entry |
|-------------|-------------|-----------------|
| **Any AGENTS.md tool** | Say `Run tracker audit` | Say `implement NT-002` |
| **Cursor** | `.cursor/agents/tracker-audit.md` | `.cursor/agents/tracker-implement.md` |
| | `.cursor/agents/feature-file-mapper.md` | (read-only file maps) |
| **Claude Code** | `.claude/agents/tracker-audit.md` | `.claude/agents/tracker-implement.md` |
| **Kiro** | `.kiro/agents/tracker-audit.md` | `.kiro/agents/tracker-implement.md` |
| **Antigravity** | `.agent/workflows/tracker-audit.md` | `.agent/workflows/tracker-implement.md` |
| **Devin** | `.devin/agents/tracker-audit.md` | `.devin/agents/tracker-implement.md` |
| **GitHub Copilot** | `.github/copilot-instructions.md` | same file |
| **Windsurf** | `.windsurf/workflows/tracker-audit.md` | `.windsurf/workflows/tracker-implement.md` |
| **Codex CLI** | `AGENTS.md` | `AGENTS-IMPLEMENT.md` |

Shared invoke summaries:

- Audit: `wrappers/codebase-reviewer.body.md`
- Implement: `wrappers/tracker-implement.body.md`

---

## Install the kit

### Option A — Kit inside target project

```
repo/
  tracker-audit-kit/     ← copy Agent/ here (optional)
  your-product/
  new-tracker/           ← created at runtime
    your-product/
```

### Option B — Kit adjacent (mono-repo)

```
repo/
  Agent/
  Prod_Invoice_LLM/      ← open as workspace
  new-tracker/           ← all runtime output
    Prod_Invoice_LLM/
```

Output path: `new-tracker/<project-slug>/` — see `output-layout.md`.

---

## tracker-implement — universal fix workflow

Use for **any** gap, bug, or issue from **any** tracker — not tied to a
specific module.

### What every IDE must do (mandatory, none skippable)

| Phase | Name | Action |
|-------|------|--------|
| 1 | Intake | Load `NT-*` finding or tracker §section |
| 2 | **NOW** | Document what code **actually** does today |
| 3 | **DOCUMENT** | Read **source tracker**; quote requirements |
| 4 | **Gap analysis** | Table: NOW vs DOCUMENT |
| 5 | **Plan** | Steps + acceptance criteria → **STOP** |
| 6 | **Implement** | Code changes after approval only |
| 7 | **Verify** | Tests + criteria |
| 8 | **Close** | Mark `fixed`; summary |

### Commands (same in every IDE)

| Say | Effect |
|-----|--------|
| `implement NT-002` / `fix NT-002` | Phases 1→5, stop for approval |
| `plan NT-002` | Phases 1→5 only |
| `approve plan NT-002` | Phases 6→8 |
| `implement from tracker <path> §<section>` | Fix directly from any tracker |
| `resume implement` | Continue from `implement-progress-state.json` |

### Approval gate (Phase 5)

Every IDE must ask exactly:

> **This is the implementation plan for &lt;work_item_id&gt;. Approve to implement, or tell me what to change.**

No application code changes before approval.

### Per-IDE quick start

**Cursor** — Run `tracker-implement` subagent or say `implement NT-002`.

**Claude Code** — `/tracker-implement` or chat command.

**Kiro** — Select `tracker-implement` in agent picker.

**Antigravity** — Open `.agent/workflows/tracker-implement.md` or chat.

**Devin** — Invoke `tracker-implement` subagent.

**Copilot** — `implement NT-002` in chat (reads `AGENTS-IMPLEMENT.md`).

**Windsurf** — `tracker-implement` workflow or chat.

---

## tracker-audit — find issues

| Say | Effect |
|-----|--------|
| `Run tracker audit` | Discover → confirm → audit |
| `resume` | Continue audit |
| `re-discover` | Re-scan files |

Phase 0 hard stop: confirm requirement files before auditing.

See `wrappers/codebase-reviewer.body.md` and `AGENTS.md`.

---

## Implement parity checklist

Verify any IDE follows the same pipeline:

- [ ] Phase 2 documents **current code** (not recommendations)
- [ ] Phase 3 reads **original tracker** (not only finding text)
- [ ] Phase 4 has NOW vs DOCUMENT table
- [ ] Phase 5 writes `<output_root>/plans/<id>.md` (under `new-tracker/<slug>/`)
- [ ] Agent **stops** at Phase 5 until user approves
- [ ] No code changes before approval
- [ ] Phase 6 executes **every** plan step with checkpoints
- [ ] Phase 7 runs tests from plan
- [ ] Phase 8 updates finding status to `fixed` only after verify pass
- [ ] Original trackers never modified

---

## Audit parity checklist

- [ ] Phase 0 stops for file confirmation
- [ ] Four checks per feature
- [ ] `NT-*` IDs in `findings-index.md`
- [ ] Original trackers and app code never modified by audit

---

## Adding a new IDE

1. Create `tracker-audit` and `tracker-implement` wrappers in that tool's native folder.
2. Point both to `AGENTS.md` / `AGENTS-IMPLEMENT.md` and wrapper body files.
3. Add rows to the table at the top of this file.
4. Run both parity checklists.

**Never** fork phase logic into IDE-specific rules.
