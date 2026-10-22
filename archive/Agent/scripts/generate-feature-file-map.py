#!/usr/bin/env python3
"""
Bootstrap feature → file maps for manual engineer verification.

Usage:
  python Agent/scripts/generate-feature-file-map.py \
    --project-root "path/to/Prod_Invoice_LLM" \
    --output-root "path/to/new-tracker/Prod_Invoice_LLM"
"""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import NamedTuple

EXCLUDE_DIRS = {
    "node_modules",
    ".git",
    ".next",
    "dist",
    "build",
    "out",
    "coverage",
    "vendor",
    "__pycache__",
    "new tracker",
    "new-tracker",
    ".venv",
    "venv",
    "site-packages",
}

# Slug → search hints (must appear in path; avoid single common words)
SLUG_HINTS: dict[str, list[str]] = {
    "be-auth": ["routers/auth", "dependencies.py", "feature_1_auth"],
    "be-ingestion-pipeline": ["extraction_agent", "handlers.py", "invoices.py", "feature_2_pipeline"],
    "be-sse": ["status/stream", "sse", "test_sse"],
    "be-duplicate-detection": ["duplicate", "feature_3.1"],
    "be-queries-pdf": ["invoices.py", "feature_4_queries"],
    "be-rag": ["routers/chat", "query_agent", "chroma_client", "feature_6_rag"],
    "be-audit": ["routers/audit", "feature_7_audit"],
    "be-dashboard": ["routers/dashboard", "feature_8_dashboard"],
    "be-connectors": ["routers/connectors", "connector_oauth", "feature_9_connectors"],
    "be-trainer": ["routers/trainer", "trainer_sessions", "feature_10_trainer"],
    "be-billing": ["billing", "feature_11_billing"],
    "be-alembic": ["alembic/"],
    "be-test-benchmark": ["tests/benchmark", "tests/test_", "feature_13_test"],
    "be-email-ingestion": ["email_ingestion", "feature_14_email"],
    "be-webhooks": ["routers/webhooks", "feature_15_webhooks"],
    "be-settings": ["routers/settings", "feature_16_settings"],
    "be-invoice-builder": ["invoice_builder", "feature_17"],
    "be-outbound-ingestion": ["outbound_invoices", "feature_2.1"],
    "be-outbound-auditor": ["outbound_audit", "feature_7.1"],
    "be-outbound-dashboard": ["outbound_dashboard", "feature_8.1"],
    "be-direction-aware-chat": ["feature_6.1", "direction"],
    "fe-layout-theme": ["layout.tsx", "Sidebar.tsx", "ThemeProvider", "feature_1_layout"],
    "fe-dashboard": ["dashboard/page", "components/dashboard", "feature_2_dashboard"],
    "fe-ingestion": ["ingestion/page", "StatusTable", "LogTerminal", "feature_3_ingestion"],
    "fe-auditor": ["auditor", "AlertConsole", "PdfViewerCanvas", "feature_4_auditor"],
    "fe-chat": ["chat/page", "ChatWindow", "SqlAuditDrawer", "feature_5_chat"],
    "fe-trainer": ["trainer/page", "ScopeSelector", "feature_6_trainer"],
    "fe-connectors": ["connectors/page", "IntegrationCard", "feature_7_connectors"],
    "fe-email-settings": ["settings/email", "EmailSendersList", "feature_8_email"],
    "fe-webhooks": ["webhooks", "feature_9_webhooks"],
    "fe-settings": ["settings/page", "ServiceFlowToggles", "feature_10_settings"],
    "fe-send-invoices": ["SendInvoices", "feature_3.1"],
    "fe-outbound-auditor": ["OutboundAuditor", "feature_4.1"],
    "fe-outbound-dashboard": ["OutboundMetricsGrid", "feature_2.1"],
    "fe-flows-visualization": ["flows/page", "feature_11_flows"],
    "web-landing": ["invoice-website/app/page", "feature_1"],
    "web-showcase": ["showcase", "feature_2"],
    "web-pricing": ["pricing", "feature_3"],
    "web-auth-gateway": ["create-user", "login", "signup", "feature_4_auth"],
    "web-vendor-flow-pricing": ["feature_3.1", "pricing"],
}

# Limit scan roots for features that would otherwise match too broadly
SLUG_SCAN_ROOTS: dict[str, list[str]] = {
    "be-test-benchmark": ["apps/invoice-be/tests"],
    "be-alembic": ["apps/invoice-be/alembic", "apps/invoice-be/models.py"],
}

# Explicit primary files per slug (always included when they exist)
SLUG_EXPLICIT: dict[str, list[str]] = {
    "be-auth": [
        "apps/invoice-be/routers/auth.py",
        "apps/invoice-be/dependencies.py",
        "apps/invoice-be/docs/feature_1_auth.md",
    ],
    "be-ingestion-pipeline": [
        "apps/invoice-be/routers/invoices.py",
        "apps/invoice-be/agents/extraction_agent.py",
        "apps/invoice-be/queue_worker/handlers.py",
    ],
    "be-sse": ["apps/invoice-be/routers/invoices.py"],
    "be-rag": ["apps/invoice-be/routers/chat.py", "apps/invoice-be/agents/query_agent.py"],
    "be-audit": ["apps/invoice-be/routers/audit.py"],
    "be-dashboard": ["apps/invoice-be/routers/dashboard.py"],
    "be-connectors": ["apps/invoice-be/routers/connectors.py"],
    "be-trainer": ["apps/invoice-be/routers/trainer.py"],
    "be-webhooks": ["apps/invoice-be/routers/webhooks.py"],
    "be-settings": ["apps/invoice-be/routers/settings.py"],
    "be-email-ingestion": ["apps/invoice-be/routers/email_ingestion.py"],
    "fe-dashboard": [
        "apps/invoice-fe/app/dashboard/page.tsx",
        "apps/invoice-fe/components/dashboard/MetricsGrid.tsx",
        "apps/invoice-fe/components/dashboard/RecentInvoicesTable.tsx",
    ],
    "fe-chat": ["apps/invoice-fe/app/chat/page.tsx", "apps/invoice-fe/components/chat/ChatWindow.tsx"],
    "web-auth-gateway": [
        "apps/invoice-fe/app/api/admin/create-user/route.js",
        "apps/invoice-be/routers/auth.py",
    ],
}


class Feature(NamedTuple):
    num: int
    name: str
    slug: str
    layer: str
    route: str
    tracker_ref: str
    status: str


def parse_inventory(path: Path) -> list[Feature]:
    if not path.exists():
        raise FileNotFoundError(f"feature-inventory.md not found: {path}")

    features: list[Feature] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.startswith("|") or line.startswith("| #") or line.startswith("|---"):
            continue
        cols = [c.strip() for c in line.split("|")[1:-1]]
        if len(cols) < 7 or not cols[0].isdigit():
            continue
        features.append(
            Feature(
                num=int(cols[0]),
                name=cols[1],
                slug=cols[2],
                layer=cols[3],
                route=cols[4],
                tracker_ref=cols[5],
                status=cols[6].replace("**", ""),
            )
        )
    return features


def extract_paths_from_text(text: str, project_root: Path) -> set[str]:
    found: set[str] = set()
    patterns = [
        r"`((?:apps|docs|test-suite|tests|alembic|components|lib|routers|agents|services|utils|queue_worker)/[^`\s]+)`",
        r"`([a-zA-Z0-9_./-]+\.(?:py|ts|tsx|js|jsx|md|sql|yaml|yml))`",
    ]
    for pat in patterns:
        for m in re.finditer(pat, text):
            p = m.group(1).replace("\\", "/")
            if "://" in p or p.startswith("http"):
                continue
            if any(x in p for x in ("file:", "line", "Gap ", "§")):
                continue
            full = project_root / p
            if full.exists():
                found.add(p.replace("\\", "/"))
    return found


def resolve_spec_doc(feature: Feature, project_root: Path) -> str | None:
    """Find feature_N_*.md from tracker_ref or inventory layer."""
    ref = feature.tracker_ref
    # e.g. fe_features_tracker.md §Feature 2 → feature_2_dashboard.md
    m = re.search(r"§Feature\s+([\d.]+)", ref)
    if m:
        feat_num = m.group(1).replace(".", "_")
        layer_dirs = {
            "backend": project_root / "apps/invoice-be/docs",
            "frontend": project_root / "apps/invoice-fe/docs",
            "website": project_root / "apps/invoice-website/website_features",
        }
        base = layer_dirs.get(feature.layer)
        if base and base.exists():
            if "." in feat_num:
                candidates = list(base.glob(f"feature_{feat_num}*.md"))
            else:
                candidates = [
                    c
                    for c in base.glob(f"feature_{feat_num}*.md")
                    if not re.match(rf"feature_{re.escape(feat_num)}\.\d", c.name)
                ]
            for candidate in sorted(candidates):
                return str(candidate.relative_to(project_root)).replace("\\", "/")
    m2 = re.search(r"\((feature_[^)]+\.md)\)", ref)
    if m2:
        name = m2.group(1)
        for base in (
            project_root / "apps/invoice-be/docs",
            project_root / "apps/invoice-fe/docs",
            project_root / "apps/invoice-website/website_features",
        ):
            candidate = base / name
            if candidate.exists():
                return str(candidate.relative_to(project_root)).replace("\\", "/")
    return None


def glob_by_hints(project_root: Path, hints: list[str], layer: str, slug: str = "") -> set[str]:
    found: set[str] = set()
    if slug in SLUG_SCAN_ROOTS:
        roots = [project_root / r for r in SLUG_SCAN_ROOTS[slug]]
    else:
        roots = []
        if layer in ("backend", "cross-layer"):
            roots.append(project_root / "apps/invoice-be")
        if layer in ("frontend", "cross-layer"):
            roots.append(project_root / "apps/invoice-fe")
        if layer in ("website", "cross-layer"):
            roots.append(project_root / "apps/invoice-website")

    for root in roots:
        if not root.exists():
            continue
        if root.is_file():
            rel = str(root.relative_to(project_root)).replace("\\", "/")
            if any(h.lower() in rel.lower() for h in hints) or not hints:
                found.add(rel)
            continue
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            if any(p in path.parts for p in EXCLUDE_DIRS):
                continue
            rel = str(path.relative_to(project_root)).replace("\\", "/")
            if not rel.startswith("apps/"):
                continue
            name_lower = rel.lower()
            if any(h.lower() in name_lower for h in hints):
                if path.suffix in (".py", ".ts", ".tsx", ".js", ".jsx", ".md", ".sql"):
                    found.add(rel)
    return found


def categorize(path: str) -> str:
    p = path.lower()
    if "/docs/" in p or "tracker" in p or p.endswith("_tracker.md") or "/feature_" in p:
        return "spec"
    if "/tests/" in p or "/e2e/" in p or ".spec." in p or p.startswith("tests/"):
        return "tests"
    if "/alembic/" in p or p.endswith("models.py"):
        return "database"
    if "/routers/" in p or "/route.ts" in p or "/route.js" in p or "main.py" in p:
        return "api"
    if "/agents/" in p or "/services/" in p or "/queue_worker/" in p or "/utils/" in p:
        return "services"
    if "/components/" in p:
        return "components"
    if "/app/" in p and ("/page.tsx" in p or "/page.js" in p or "/layout.tsx" in p):
        return "routes"
    if "/lib/" in p or "/hooks/" in p:
        return "lib"
    if "main.py" in p or "dependencies.py" in p:
        return "config"
    return "other"


SECTION_TITLES = {
    "spec": "Spec & documentation",
    "routes": "Routes & pages",
    "components": "Components / UI",
    "api": "API routes / handlers",
    "services": "Services / agents / workers",
    "database": "Models & database",
    "lib": "Hooks / lib / utils",
    "tests": "Tests",
    "config": "Config & registration",
    "other": "Other related files",
}


def role_for(path: str, feature: Feature) -> str:
    name = Path(path).name
    if "tracker" in path:
        return f"Tracker reference for {feature.slug}"
    if path.startswith("apps/") and "/docs/feature_" in path:
        return "Feature spec document"
    if "/page.tsx" in path or "/page.js" in path:
        return "Primary page"
    if "/route.ts" in path or "/route.js" in path:
        return "API route handler (proxy or server)"
    if "/routers/" in path:
        return "Backend router module"
    if "/agents/" in path:
        return "AI agent module"
    if path.endswith("models.py"):
        return "ORM models"
    if "/tests/" in path or ".spec." in path:
        return "Automated test"
    return name


def build_verification_flow(feature: Feature) -> list[str]:
    layer = feature.layer
    steps = [
        f"**1. Spec** — Read `{feature.tracker_ref}` and linked spec doc",
    ]
    if layer == "backend":
        steps += [
            f"**2. API** — Verify endpoints at `{feature.route}` in router files",
            "**3. Handler logic** — Trace service/agent/worker calls",
            "**4. Database** — Confirm models and migrations",
            "**5. Tests** — Run pytest files listed below",
            "**6. Auth** — Confirm tenant scoping in dependencies.py",
            "**7. Sign-off** — Flow matches tracker",
        ]
    elif layer == "frontend":
        steps += [
            f"**2. Page** — Open route `{feature.route}` in browser",
            "**3. Components** — Verify UI elements in component files",
            "**4. API proxies** — Trace `app/api/**` routes to backend",
            "**5. States** — Check loading, empty, error UI",
            "**6. Tests** — Run Playwright/E2E if listed",
            "**7. Sign-off** — Flow matches tracker",
        ]
    elif layer == "website":
        steps += [
            f"**2. Page** — Open `{feature.route}` on invoice-website",
            "**3. Auth flow** — Verify Clerk login/signup if applicable",
            "**4. Provisioning** — Trace org → tenant creation",
            "**5. Cross-app** — Confirm links to invoice-fe",
            "**6. Tests** — Review website test files",
            "**7. Sign-off** — Flow matches tracker",
        ]
    else:
        steps += [
            "**2. Entry** — Walk primary user flow",
            "**3. Cross-layer** — Verify FE proxy → BE endpoint chain",
            "**4. Data** — Confirm DB impact",
            "**5. Tests** — Run listed tests",
            "**6. Edge cases** — Error paths and auth",
            "**7. Sign-off** — Flow matches tracker",
        ]
    return [f"- [ ] {s}" for s in steps]


def render_feature_map(
    feature: Feature,
    files: dict[str, set[str]],
    spec_doc: str | None,
    project_root: Path,
) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    lines = [
        f"# Feature: {feature.name}",
        "",
        f"**Slug:** `{feature.slug}`",
        f"**Layer:** {feature.layer}",
        f"**Route / entry:** `{feature.route}`",
        f"**Tracker ref:** `{feature.tracker_ref}`",
        f"**Spec doc:** `{spec_doc or '— (not found)'}`",
        f"**Tracker status:** {feature.status}",
        f"**Mapped at:** {now}",
        "",
        "## Verification flow (manual)",
        "",
        "Engineer: execute in order; check each box when verified.",
        "",
        *build_verification_flow(feature),
        "",
        "## File inventory",
        "",
    ]

    total = sum(len(v) for v in files.values())
    if total == 0:
        lines += ["_No files discovered — run agent enrichment pass._", ""]
    else:
        for cat in (
            "spec",
            "routes",
            "components",
            "api",
            "services",
            "database",
            "lib",
            "tests",
            "config",
            "other",
        ):
            paths = sorted(files.get(cat, []))
            if not paths:
                continue
            lines += [f"### {SECTION_TITLES[cat]}", ""]
            lines += ["| File | Role |", "|------|------|"]
            for p in paths:
                lines.append(f"| `{p}` | {role_for(p, feature)} |")
            lines.append("")

    lines += [
        "## Manual sign-off",
        "",
        "| Field | Value |",
        "|-------|-------|",
        "| Reviewed by | |",
        "| Date | |",
        "| Result | pass / fail / partial |",
        "| Notes | |",
        "",
    ]
    return "\n".join(lines)


def discover_files(feature: Feature, project_root: Path) -> dict[str, set[str]]:
    by_cat: dict[str, set[str]] = defaultdict(set)
    texts: list[str] = []

    # Tracker path — layer-specific only
    layer_tracker = {
        "backend": "apps/invoice-be/docs/be_features_tracker.md",
        "frontend": "apps/invoice-fe/docs/fe_features_tracker.md",
        "website": "apps/invoice-website/website_features/website_features_tracker.md",
    }.get(feature.layer)
    if layer_tracker:
        tp = project_root / layer_tracker
        if tp.exists():
            texts.append(tp.read_text(encoding="utf-8", errors="ignore"))
            by_cat["spec"].add(layer_tracker)

    spec_doc = resolve_spec_doc(feature, project_root)
    if spec_doc:
        by_cat["spec"].add(spec_doc)
        texts.append((project_root / spec_doc).read_text(encoding="utf-8", errors="ignore"))

    for p in extract_paths_from_text("\n".join(texts), project_root):
        by_cat[categorize(p)].add(p)

    hints = SLUG_HINTS.get(feature.slug, [feature.slug.replace("-", "_")])
    for p in glob_by_hints(project_root, hints, feature.layer, feature.slug):
        by_cat[categorize(p)].add(p)

    for explicit in SLUG_EXPLICIT.get(feature.slug, []):
        full = project_root / explicit
        if full.exists():
            by_cat[categorize(explicit)].add(explicit)

    # Route-based page discovery
    route = feature.route.split(",")[0].strip()
    if route.startswith("/"):
        segment = route.strip("/").split("/")[0] or "page"
        for app in ("apps/invoice-fe", "apps/invoice-website"):
            for page in (project_root / app).rglob(f"app/**/{segment}/**/page.tsx"):
                if page.is_file():
                    by_cat["routes"].add(str(page.relative_to(project_root)).replace("\\", "/"))
            for page in (project_root / app).rglob(f"app/{segment}/page.tsx"):
                if page.is_file():
                    by_cat["routes"].add(str(page.relative_to(project_root)).replace("\\", "/"))

    return by_cat


def write_index(features: list[Feature], output_root: Path, file_counts: dict[str, int]) -> None:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    lines = [
        "# Feature File Map Index",
        "",
        f"**Generated:** {now}",
        f"**Features mapped:** {len(features)}",
        "**Purpose:** Manual engineer verification — every file tied to a feature flow",
        "",
        "## How to use",
        "",
        "1. Pick a feature row below.",
        "2. Open `file-maps/<slug>.md`.",
        "3. Follow the **Verification flow** checklist.",
        "4. Review every file in **File inventory**.",
        "5. Complete **Manual sign-off** in the feature map.",
        "",
        "| # | Feature | Slug | Layer | Route | Files | Status |",
        "|---|---------|------|-------|-------|-------|--------|",
    ]
    for f in features:
        cnt = file_counts.get(f.slug, 0)
        lines.append(
            f"| {f.num} | {f.name} | `{f.slug}` | {f.layer} | `{f.route}` | {cnt} | draft |"
        )

    by_layer: dict[str, list[int]] = defaultdict(list)
    for f in features:
        by_layer[f.layer].append(file_counts.get(f.slug, 0))

    lines += [
        "",
        "## Layer summary",
        "",
        "| Layer | Features | Total files |",
        "|-------|----------|-------------|",
    ]
    for layer, counts in sorted(by_layer.items()):
        lines.append(f"| {layer} | {len(counts)} | {sum(counts)} |")

    lines.append("")
    (output_root / "file-map-index.md").write_text("\n".join(lines), encoding="utf-8")


def write_progress(output_root: Path, features: list[Feature], completed: list[str]) -> None:
    state = {
        "schema_version": 1,
        "status": "complete" if len(completed) == len(features) else "in_progress",
        "current_feature": completed[-1] if completed else None,
        "current_feature_index": len(completed),
        "features_completed": completed,
        "features_total": len(features),
        "files_discovered_total": 0,
        "last_run_at": datetime.now(timezone.utc).isoformat(),
        "run_started_at": datetime.now(timezone.utc).isoformat(),
    }
    progress_path = output_root / "review-state" / "file-map-progress-state.json"
    progress_path.parent.mkdir(parents=True, exist_ok=True)
    progress_path.write_text(json.dumps(state, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate feature file maps")
    parser.add_argument("--project-root", required=True, type=Path)
    parser.add_argument("--output-root", required=True, type=Path)
    parser.add_argument("--slug", default=None, help="Map single feature slug only")
    args = parser.parse_args()

    project_root = args.project_root.resolve()
    output_root = args.output_root.resolve()
    maps_dir = output_root / "file-maps"
    maps_dir.mkdir(parents=True, exist_ok=True)

    inventory_path = output_root / "feature-inventory.md"
    features = parse_inventory(inventory_path)
    if args.slug:
        features = [f for f in features if f.slug == args.slug]
        if not features:
            raise SystemExit(f"Unknown slug: {args.slug}")

    file_counts: dict[str, int] = {}
    completed: list[str] = []

    for feature in features:
        files = discover_files(feature, project_root)
        spec_doc = resolve_spec_doc(feature, project_root)
        total = sum(len(v) for v in files.values())
        file_counts[feature.slug] = total
        content = render_feature_map(feature, files, spec_doc, project_root)
        (maps_dir / f"{feature.slug}.md").write_text(content, encoding="utf-8")
        completed.append(feature.slug)
        print(f"  mapped {feature.slug}: {total} files")

    write_index(features, output_root, file_counts)
    write_progress(output_root, features, completed)
    print(f"\nWrote {len(features)} maps to {maps_dir}")
    print(f"Index: {output_root / 'file-map-index.md'}")


if __name__ == "__main__":
    main()
