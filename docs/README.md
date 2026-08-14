# STRYT Documentation

All project documentation lives under `docs/`.  
**Exception:** `legal/` and `guide/` stay at the repo root because the app bundles them at build time (`src/lib/legalDocs.ts`, `src/lib/guideDocs.ts`).

---

## Quick links

| I want to… | Start here |
|------------|------------|
| **Launch the app (Play + website)** | [launch/LAUNCH_REPORT.md](./launch/LAUNCH_REPORT.md) |
| **Play Store checklist** | [plans/app-plans/PLAY_STORE_CHECKLIST.md](./plans/app-plans/PLAY_STORE_CHECKLIST.md) |
| **Background location (Play Console)** | [launch/play-console/BACKGROUND_LOCATION_DECLARATION.md](./launch/play-console/BACKGROUND_LOCATION_DECLARATION.md) |
| **Deploy / build Android** | [engineering/DEPLOYMENT_GUIDE.md](./engineering/DEPLOYMENT_GUIDE.md) |
| **Understand the codebase** | [engineering/CODEBASE_MAP.md](./engineering/CODEBASE_MAP.md) |
| **Product overview** | [product/PRODUCT_GUIDE.md](./product/PRODUCT_GUIDE.md) |
| **Legal policies (source)** | [`../legal/README.md`](../legal/README.md) |
| **In-app user guides (source)** | [`../guide/`](../guide/) |

---

## Folder structure

```
docs/
├── README.md                 ← you are here
├── launch/                   Launch readiness, go-live, Play Console
├── product/                  Features, strategy, product guides
├── design/                   UX/UI design docs per role
├── engineering/              Codebase, deployment, build, debug
├── analysis/                 Deep-dive audits (app-analysis)
├── plans/                    Feature & implementation plans (app-plans)
├── audits/                   Reviews, readiness, historical MD_FILES
└── marketing/                SEO and growth docs
```

---

## launch/

| File | Description |
|------|-------------|
| [LAUNCH_REPORT.md](./launch/LAUNCH_REPORT.md) | **Main launch report** — code fixes done + your manual to-do |
| [GOAL_LIVE.md](./launch/GOAL_LIVE.md) | Launch scope trims (what's in / out for v1) |
| [GOAL_LIVE_AUDIT.md](./launch/GOAL_LIVE_AUDIT.md) | Pre-launch product audit & known bugs |
| [play-console/](./launch/play-console/) | Google Play Console copy & declarations |

---

## product/

| File | Description |
|------|-------------|
| [PRODUCT_GUIDE.md](./product/PRODUCT_GUIDE.md) | End-to-end product guide |
| [STRYT-FEATURES.md](./product/STRYT-FEATURES.md) | Feature inventory |
| [STRYT-STRATEGY-MAPS.md](./product/STRYT-STRATEGY-MAPS.md) | Strategy & positioning maps |

---

## design/

| File | Description |
|------|-------------|
| [DESIGN_PRINCIPLES.md](./design/DESIGN_PRINCIPLES.md) | Core design principles |
| [DESIGN_POLISH_ROADMAP.md](./design/DESIGN_POLISH_ROADMAP.md) | UI polish backlog |
| [BUSINESS_DESIGN.md](./design/BUSINESS_DESIGN.md) | Business console UX |
| [PROVIDER_DESIGN.md](./design/PROVIDER_DESIGN.md) | Provider console UX |
| [GUEST_MODE_PLAN.md](./design/GUEST_MODE_PLAN.md) | Guest browse funnel |

---

## engineering/

| File | Description |
|------|-------------|
| [CODEBASE_MAP.md](./engineering/CODEBASE_MAP.md) | Repo structure & key modules |
| [DEPLOYMENT_GUIDE.md](./engineering/DEPLOYMENT_GUIDE.md) | Deploy web + mobile |
| [MUMBAI_MIGRATION.md](./engineering/MUMBAI_MIGRATION.md) | Tokyo → Mumbai dump/restore runbook |
| [android_build_steps.md](./engineering/android_build_steps.md) | Android build steps |
| [debug/PAYMENT_CONFIRMATION_DEBUG.md](./engineering/debug/PAYMENT_CONFIRMATION_DEBUG.md) | Payment flow debugging |

See also: [audits/MD_FILES/CAPACITOR_ANDROID_GUIDE.md](./audits/MD_FILES/CAPACITOR_ANDROID_GUIDE.md)

---

## analysis/

Executive and technical analysis reports (formerly `app-analysis/`):

| # | File |
|---|------|
| 00 | [MASTER_EXECUTIVE_SUMMARY.md](./analysis/app-analysis/00_MASTER_EXECUTIVE_SUMMARY.md) |
| 01 | [ARCHITECTURAL_ANALYSIS.md](./analysis/app-analysis/01_ARCHITECTURAL_ANALYSIS.md) |
| 02 | [BUSINESS_POTENTIAL_AND_MONETIZATION.md](./analysis/app-analysis/02_BUSINESS_POTENTIAL_AND_MONETIZATION.md) |
| 03 | [DATA_AND_ALGORITHMS_SPECIFICATION.md](./analysis/app-analysis/03_DATA_AND_ALGORITHMS_SPECIFICATION.md) |
| 04 | [SECURITY_PERFORMANCE_AND_CODE_AUDIT.md](./analysis/app-analysis/04_SECURITY_PERFORMANCE_AND_CODE_AUDIT.md) |
| 05 | [UX_DESIGN_AND_USER_FLOW_REVIEW.md](./analysis/app-analysis/05_UX_DESIGN_AND_USER_FLOW_REVIEW.md) |

---

## plans/

Feature implementation plans (formerly `app-plans/`):

| File | Description |
|------|-------------|
| [00_INDEX.md](./plans/app-plans/00_INDEX.md) | Plans index |
| [SERVER_LOCATION_MUMBAI.md](./plans/SERVER_LOCATION_MUMBAI.md) | **Plan:** move Supabase Tokyo → Mumbai |
| [PLAY_STORE_CHECKLIST.md](./plans/app-plans/PLAY_STORE_CHECKLIST.md) | Play Store launch checklist |
| [DONE_SUMMARY.md](./plans/app-plans/DONE_SUMMARY.md) | Completed plan items |
| `01_` – `10_*.md` | Individual feature plans |

---

## audits/

Historical reviews and readiness reports (formerly `MD_FILES/`):

| File | Description |
|------|-------------|
| [PRODUCTION_READINESS.md](./audits/MD_FILES/PRODUCTION_READINESS.md) | Production ship-readiness |
| [SECURITY_AUDIT.md](./audits/MD_FILES/SECURITY_AUDIT.md) | Security audit |
| [ISSUES.md](./audits/MD_FILES/ISSUES.md) | Tracked issues |
| [TASKS.md](./audits/MD_FILES/TASKS.md) | Task backlog |
| [archive/](./audits/MD_FILES/archive/) | Older audits & pipeline reports |
| [semantic-review/](./audits/semantic-review/) | Automated semantic reviews |

---

## marketing/

| Folder | Description |
|--------|-------------|
| [seo/](./marketing/seo/) | SEO master plan, keywords, content calendar, technical SEO |

---

## At repo root (not moved)

| Path | Why it stays |
|------|--------------|
| [`README.md`](../README.md) | GitHub project home |
| [`legal/`](../legal/) | Bundled into app for Terms / Privacy screens |
| [`guide/`](../guide/) | Bundled into app for in-app Help & FAQ |
| [`supabase/README.md`](../supabase/README.md) | Lives with Supabase config |
| [`.env.example`](../.env.example) | Environment variable template |
