# Output Layout — new-tracker store

All audit and implement **runtime output** lives in a **`new-tracker/`**
folder that is a **sibling** of the target product and the agent kit —
never inside the product repo or inside `Agent/`.

## Standard layout (mono-repo)

```
repo-root/
  Agent/                          ← kit (read-only templates)
  Prod_Invoice_LLM/               ← target product (source code + trackers)
  new-tracker/                    ← ALL agent output (this folder)
    Prod_Invoice_LLM/             ← one subfolder per product
      README.md
      feature-inventory.md
      findings-index.md
      features/
      plans/
      summary/
      review-state/
        discovery-manifest.json
        progress-state.json
        implement-progress-state.json
    another-product/              ← second product, same pattern
      ...
```

## Path resolution (every IDE, same rules)

1. **Target project root** — workspace root, or path the user gives.
2. **Project slug** — basename of target root (e.g. `Prod_Invoice_LLM`).
3. **Output root** — `<parent-of-target>/new-tracker/<project-slug>/`

Examples:

| Target opened in IDE | Output root |
|--------------------|-------------|
| `.../Invoice-LLM-SOLO-Dev/Prod_Invoice_LLM` | `.../Invoice-LLM-SOLO-Dev/new-tracker/Prod_Invoice_LLM/` |
| `.../my-startup/backend-api` | `.../my-startup/new-tracker/backend-api/` |

### Overrides (optional)

Store in `review-state/discovery-manifest.json` after first discovery:

```json
{
  "output_root": "d:\\path\\to\\new-tracker\\Prod_Invoice_LLM",
  "project_slug": "Prod_Invoice_LLM"
}
```

If `output_root` is set and absolute, use it. If relative, resolve from
parent of target project root.

User may say: *"use output root ../new-tracker/MyProduct"* — merge into
manifest `user_overrides`.

## What goes where

| Location | Written by | Contents |
|----------|------------|----------|
| `new-tracker/<slug>/` | audit + implement | Findings, plans, inventory, summaries |
| `new-tracker/<slug>/review-state/` | audit + implement | Manifest, progress, resume pointers |
| Target product | implement only (Phase 6+) | Application source code fixes |
| Target product trackers | **never** | Read-only |

## Legacy paths (do not use)

- ~~`<product>/new tracker/`~~ — deprecated; migrate to `new-tracker/<slug>/`
- ~~`<product>/review-state/`~~ — deprecated; use `new-tracker/<slug>/review-state/`
- ~~`Agent/review-state/`~~ — kit templates only, not runtime

## First run

On first write, create:

```
new-tracker/<project-slug>/
new-tracker/<project-slug>/features/
new-tracker/<project-slug>/plans/
new-tracker/<project-slug>/summary/
new-tracker/<project-slug>/review-state/
```

Copy `Agent/new-tracker/README.md` → `new-tracker/<slug>/README.md` on first audit.

## Exclude from discovery scans

Always exclude in target project:

- `new tracker/` (legacy in-product folder)
- `new-tracker/` if accidentally nested inside product

Scan the sibling `new-tracker/` only for resume state, not as requirement files.
