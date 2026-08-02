# Discovery Rules

Referenced by `AGENTS.md` Phase -1. Use these heuristics to identify
requirement files in **any** project opened in any IDE or agent tool.
The target project root is the workspace root (or an explicit path the
user gives).

Do not treat discovery output as final until Phase 0 user confirmation.

---

## Exclude paths (never scan or register as requirements)

Skip these directories and file patterns entirely:

```
node_modules/
.git/
dist/
build/
.next/
out/
coverage/
vendor/
__pycache__/
*.min.js
*.min.css
```

Also exclude:

- `deployment_tracker*` — infra staging, not a code gap
- `test_automation_tracker*` — automation build plan, not a code gap
- `new tracker/` — legacy in-product output (deprecated)
- `review-state/` — legacy in-product session state (deprecated)
- Sibling `../new-tracker/` — scan only for resume; not a requirement source

---

## Category A — Feature / requirement trackers (primary spec)

**Glob patterns** (search from project root, respect excludes):

```
**/*tracker*.md
**/*features*.md
**/requirements*.md
**/spec*.md
**/*feature*tracker*
```

**Content signals** (read first ~80 lines if filename is ambiguous):

- Headings or labels: `Feature`, `Page`, `Screen`, `Route`, `API`,
  `Endpoint`, `Status:`, `GAP-`, `TODO`, `User story`
- Table columns: feature name, status, priority, assignee
- Layer hints in path or filename: `be_`, `fe_`, `backend`, `frontend`,
  `website`, `api`, `mobile`

**Layer assignment** (best match wins):

| Signal in path or content | Layer |
|---|---|
| `be_`, `backend`, `api`, `server` | backend |
| `fe_`, `frontend`, `client`, `ui`, `app/src` | frontend |
| `website`, `web`, `marketing`, `landing` | website |
| None of the above | unknown |

**Confidence:**

- `high` — filename contains `tracker` or `features_tracker`, plus
  content signals match
- `medium` — filename match only, or content signals without filename
- `low` — weak signals; include in manifest but flag for user review

**Priority:** If multiple trackers exist, sort backend trackers first
(they anchor the spec per audit workflow).

---

## Category B — Architecture and data model

**Glob patterns:**

```
**/architecture/**/*.md
**/*schema*.{md,sql}
**/migrations/**
**/prisma/schema.prisma
**/models/**/*
**/entities/**/*
**/database/**/*
**/*Database*Schema*
**/*Technical*Architecture*
**/*System*Journey*
```

**Content signals:**

- ER diagrams, table definitions, FK relationships
- Multi-tenant rules, RLS policies
- API architecture, service boundaries

Register each hit as `architecture_docs` or `database_sources` based
on whether it describes structure (schema/migrations) vs system design.

---

## Category C — Test and journey docs (read-only cross-check)

**Glob patterns:**

```
**/*test*.md
**/test_cases/**
**/*journey*
**/*test*inventory*
**/*e2e*
```

Exclude files that are pure automation config (e.g. `playwright.config.ts`)
unless they embed human-readable test descriptions.

---

## Category D — Application code roots

Detect where audit targets live:

1. **Mono-repo workspaces** — read root `package.json` `workspaces` or
   `pnpm-workspace.yaml` / `lerna.json` entries
2. **Common folder names:**
   ```
   apps/
   packages/
   src/
   backend/
   frontend/
   server/
   client/
   api/
   web/
   ```
3. **Framework config files** (indicate a code root in same directory
   or parent):
   - `next.config.*`, `vite.config.*`, `nuxt.config.*`
   - `manage.py`, `settings.py` (Django)
   - `go.mod`, `Cargo.toml`, `pom.xml`, `build.gradle`
   - `docker-compose.yml` (note services, don't audit infra-only)

Assign `layer` using the same table as Category A. If a root contains
both API and UI, split only when subfolders are obvious (`/api`, `/web`).

**Exclude from code roots:** `infra/`, `test-suite/`, `scripts/`,
`.github/`, pure CI/config folders unless they contain application logic.

---

## Category E — Log sources (flow validation)

**Glob patterns:**

```
**/logs/**
**/*.log
**/log/**
```

**Config search** (grep in code roots, limit to config/entry files):

- `winston`, `pino`, `bunyan`, `log4j`, `logback`
- Django `LOGGING`, Rails `config.log`, Python `logging.basicConfig`
- Structured log paths referenced in env examples (`.env.example`)

If no logs or logging config found, set manifest note:
`flow_validation: manual_or_runtime_required`

---

## Category F — Project onboarding docs (context, not trackers)

Always attempt to find (register under `onboarding_docs`):

```
README.md
**/README.md          (first hit at repo root only, unless mono-repo)
.agents/AGENTS.md
.agents/rules/**
docs/README.md
CONTRIBUTING.md
```

These are read in Phase 1 for context; they are not gap targets.

---

## Discovery output

Write draft results to `review-state/discovery-manifest.json`. See
`AGENTS.md` Section 1 for the full schema.

After writing the draft:

1. Present a summary table to the user (Phase 0).
2. Do **not** read application source code until status is `confirmed`.
3. If the user adds/removes paths, update the manifest and set
   `user_overrides` with the diff.

---

## Re-discovery triggers

Run Phase -1 again when the user says:

- `"re-discover"`
- `"start fresh"` (also resets progress-state)
- Manifest is older than 7 days and user did not say `"resume"`

Otherwise, if `discovery-manifest.json` has `"status": "confirmed"`,
skip Phase -1 and use the confirmed file list.
