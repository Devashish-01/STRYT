# New Tracker — Audit & Implement Output

This folder holds **all runtime output** for one product. It lives at:

```
<repo-root>/new-tracker/<project-slug>/
```

**Not** inside the product source tree. **Not** inside `Agent/`.

## Contents

| Path | Purpose |
|------|---------|
| `findings-index.md` | Master list of issues (`NT-*`) |
| `feature-inventory.md` | Features extracted from trackers |
| `features/` | Per-feature audit reports |
| `plans/` | Implement plans (NOW vs DOCUMENT, steps) |
| `summary/` | End-of-run audit rollups |
| `file-maps/` | Per-feature file inventories for manual verification |
| `file-map-index.md` | Master index of feature → files |
| `review-state/` | Manifest, progress, resume pointers |

## Agents

| Agent | Writes here |
|-------|-------------|
| tracker-audit | findings, features, inventory, summary, review-state |
| tracker-implement | plans/, status updates on findings |
| feature-file-mapper | file-maps/, file-map-index.md |

Application code fixes go in the **product repo** only (after plan approval).

## Original trackers

Never modified. Read-only source of truth.

See `Agent/output-layout.md` and `Agent/README.md` in the agent kit.
