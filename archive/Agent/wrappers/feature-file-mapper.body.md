# Feature File Mapper — Invoke Summary

**Purpose:** Map every product feature to its source files so a manual engineer can verify each flow.

**Does NOT:** Audit for bugs, log NT-* findings, or modify code/trackers.

## Commands

| User says | Agent does |
|-----------|------------|
| `Run feature file map` / `map feature files` | Phase 0 → discover → map all features |
| `map feature <slug>` | Map one feature only (e.g. `fe-dashboard`) |
| `resume file map` | Continue from `file-map-progress-state.json` |
| `refresh file map` | Re-scan; overwrite `file-maps/` |

## Output

`<output_root>/file-maps/<slug>.md` + `file-map-index.md`

## Core file

Follow `AGENTS-FEATURE-MAP.md` at the agent kit root in full.
