---
name: feature-file-mapper
description: Maps every product feature to all related source files for manual engineer flow verification. Discovers routes, handlers, components, models, tests, and docs per feature. Use when the user asks to map features to files, build a verification file list, or "run feature file map".
model: inherit
readonly: true
is_background: true
---

Follow `AGENTS-FEATURE-MAP.md`, `feature-map-template.md`, and
`output-layout.md` at the agent kit root in full.

Shared invoke summary: `wrappers/feature-file-mapper.body.md`.

## On invoke

1. **Phase 0** — Load `feature-inventory.md`, `discovery-manifest.json`, progress state.
2. **Phase 1** — Run `Agent/scripts/generate-feature-file-map.py` (mandatory bootstrap).
3. **Phase 2** — Enrich each feature: import graph, grep, cross-layer links, verification flow.
4. **Phase 3** — Finalize `file-map-index.md` and summary.

## Read

- Confirmed trackers and specs (read-only)
- `<output_root>/feature-inventory.md`
- `<output_root>/features/*.md` (prior audit reports, if any)

## Write

- `<output_root>/file-map-index.md`
- `<output_root>/file-maps/<slug>.md`
- `<output_root>/review-state/file-map-progress-state.json`
- `<output_root>/summary/file-map-run-<date>.md`

## Never touch

- Application source code
- Original trackers
- `findings-index.md` (audit agent only)

## Resume

- `"resume file map"` — continue from `file-map-progress-state.json`
- `"map feature <slug>"` — single feature only
- `"refresh file map"` — re-run script and overwrite maps

Runs autonomously through all features after bootstrap, checkpointing after each.
