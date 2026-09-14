# STRYT Codebase Architecture & Reorganization Review
**Date:** September 11, 2026  
**Target Repository:** `STRYT`  
**Status:** Evaluation & Recommendation (No source code changes applied)

---

## 1. Executive Summary

STRYT is a comprehensive, production-oriented cross-platform hyperlocal commerce and community application built with **React 18, Vite, TypeScript, Capacitor (Android/iOS)**, and **Supabase**. 

The app features a wide range of capabilities: real-time location and geofencing, appointment booking, social feeds/stories, chat, merchant console, OTP auth, and background delivery tracking.

While the feature set and infrastructure tooling are mature (equipped with Playwright visual audits, Vitest unit testing, and custom token linting scripts), the code structure has accumulated significant technical debt typical of rapid scaling:
* **Massive Monolithic Files:** Several core files exceed 500–8,000 lines (e.g. `index.css`, `App.tsx`, `i18n.tsx`, `store.tsx`, `cards.tsx`).
* **Flat "Junk Drawer" Folders:** `src/lib/` contains 92 files with no clear separation between business logic, constants, tests, and static assets.
* **Component Clutter:** `src/components/` holds 78 root files mixed with 14 subfolders, combining atomic UI primitives with heavy domain sheets and access guards.
* **God-Object React State:** `src/store.tsx` exposes a single 770-line React Context that causes broad re-render ripples across mobile devices.
* **Incomplete Feature Migration:** The project is caught halfway between a layer-based structure (`screens/`, `components/`) and a feature-based structure (`features/`).

This document provides a detailed breakdown of the current architecture, identifies key bottlenecks, and outlines a phased reorganization blueprint.

---

## 2. Current Architecture & Tech Stack

### Core Technology Stack
* **Framework:** React 18 (TypeScript) + Vite
* **Mobile Runtime:** Capacitor v8 (Android & iOS) + Capgo (`@capgo/capacitor-updater`) for OTA updates
* **State Management:** React Context (`src/store.tsx`) + custom hooks
* **Routing:** React Router v6 (`react-router-dom`) with code-split lazy routes
* **Styling:** Vanilla CSS with custom token verification scripts (`check-hardcoded-colors.js`, `check-undefined-tokens.js`)
* **Backend & Auth:** Supabase (Database, Auth, SSR, Storage) + Firebase (Web & native phone OTP)
* **Testing & Quality Assurance:** Vitest for unit tests; Playwright for multi-screen visual and accessibility auditing

### Existing Directory Layout (High-Level)
```text
STRYT/
├── android/                   # Native Android Capacitor shell
├── ios/                       # Native iOS Capacitor shell
├── supabase/                  # Database migrations, seed data, edge functions
├── tests/                     # Playwright audit tests and setup
├── scripts/                   # Token, color, drift, and OTA scripts
├── docs/                      # Project documentation and audit logs
├── public/                    # Static web assets
└── src/
    ├── App.tsx                # Master routing, access guards & native lifecycle (804 lines)
    ├── store.tsx              # Monolithic application state context (771 lines)
    ├── index.css              # All tokens, utilities & component styles (8,379 lines)
    ├── components/            # 78 root files + 14 domain subdirectories
    ├── screens/               # 27 root screens + 15 subdirectories
    ├── features/              # 3 partially migrated feature slices
    ├── services/              # core/, engagement/, marketplace/ API clients
    ├── lib/                   # 92 flat files (utilities, i18n, configs, tests)
    ├── hooks/                 # 11 reusable custom React hooks
    ├── utils/                 # 4 utility files (disproportionate vs lib)
    └── types/                 # TypeScript interfaces and Supabase schema types
```

---

## 3. What is Working Well (Strengths)

1. **Robust Automation & Quality Guardrails:**
   * Custom pre-build scripts ensure design consistency (`node scripts/check-hardcoded-colors.js && node scripts/check-undefined-tokens.js`).
   * Migration drift and policy grant checkers safeguard the Supabase database layer.
   * Playwright auditing setup (`playwright.config.ts`) provides automated mobile and desktop regression checking.
2. **Layered Service Abstraction:**
   * `src/services/` is cleanly divided into `core/`, `engagement/`, and `marketplace/`. Backend queries, RPCs, and data fetching are decoupled from the UI.
3. **Route-Level Code Splitting:**
   * `App.tsx` loads screens via `React.lazy()` and `Suspense`, keeping initial app payload lean for mobile launch.
4. **Strong Native Bridge:**
   * Thoughtful integration with Capacitor plugins (geolocation, background tracking, push notifications, status bar, and haptics).

---

## 4. Key Pain Points & Architectural Bottlenecks

### 4.1 Monolithic Files
| File | Lines / Size | Current Responsibilities / Issues |
|---|---|---|
| `src/index.css` | 8,379 lines (~213 KB) | Entire design system, animations, resets, screen-specific CSS, and utility classes in one file. Difficult to maintain and prone to merge conflicts. |
| `src/App.tsx` | 804 lines (~44 KB) | Houses route tables, access guards, Capacitor lifecycle events (hardware back button, push notifications, status bar), and deep linking. |
| `src/lib/i18n.tsx` | ~250 KB | All translations, dictionary tokens, and locale switching logic hardcoded in one single file. |
| `src/store.tsx` | 771 lines (~33 KB) | Single React context binding user profile, auth session, business role switcher, toast messages, social feeds, and bookmarks. |
| `src/components/cards.tsx` | 57 KB | Multiple complex card layouts concatenated in a single file instead of modular components. |
| `src/components/AppointmentSheet.tsx` | 52 KB | Monolithic modal containing calendar logic, booking state, UI rendering, and payment flow. |
| `src/lib/curatedImages.ts` | 68 KB | Massive hardcoded image catalog stored inside `lib/`. |

### 4.2 "Junk Drawer" `src/lib/` (92 Files) vs `src/utils/` (4 Files)
* `src/lib/` currently holds:
  * Pure utilities (`format.ts`, `geocode.ts`)
  * Large datasets (`curatedImages.ts`, `businessPackages.ts`)
  * Localization (`i18n.tsx`)
  * Test files (`*.test.ts` co-located inconsistently)
  * Feature business rules (`commentPolicy.ts`, `communityPost.ts`)
  * Hardware/Capacitor integrations (`batteryOptimization.ts`, `nativeGeolocation.ts`)
* Meanwhile, `src/utils/` contains only 4 files. There is no clear convention for what belongs in `lib/` vs `utils/`.

### 4.3 Component Directory Clutter (`src/components/`)
* 78 root-level files exist directly under `src/components/`.
* Low-level primitives (`Toggle.tsx`, `Icons.tsx`, `AnimatedNumber.tsx`) sit alongside high-level domain sheets (`DealUpiSheet.tsx`, `BulkOrderSheet.tsx`) and routing guards (`RequireScope.tsx`, `BusinessAccessGuard.tsx`).
* New contributors or AI agents struggle to determine where a component belongs.

### 4.4 God-Object React State (`src/store.tsx`)
* Everything is funneled through `useApp()`.
* When a user saves a bookmark or updates a badge count, any component subscribed to `useApp()` is subject to re-rendering unless aggressively memoized with `React.memo` or fine-grained selectors.
* On resource-constrained mobile devices running Capacitor WebViews, this causes avoidable frame drops.

### 4.5 Half-Finished Feature-Based Migration
* `src/features/` has only 3 directories (`ambient/`, `live-share/`, `neighborhood-today/`).
* The remaining features (auth, community, commerce, appointments, profile, settings) are scattered across `screens/`, `components/`, and `services/`.
* The codebase sits in an ambiguous state between layer-based and feature-based organization.

### 4.6 Root Workspace Hygiene
* JVM/Gradle crash logs from Android Studio (`hs_err_pid*.log`, `replay_pid*.log`) linger in the project root.
* Multiple AI assistant directories (`.agents`, `.claude`, `.codex`, `.kiro`, `Agent`, `skills`) create root noise.
* Three separate documentation/guide directories exist at root (`docs/`, `guide/`, `legal/`).

---

## 5. Target Architecture Blueprint

Below is the recommended future structure. It maintains compatibility with existing build tooling while establishing strict separation of concerns.

```text
src/
├── app/                              # Core application orchestration
│   ├── App.tsx                       # Clean root shell (<AppProviders> + <AppRouter>)
│   ├── AppProviders.tsx              # Composed context providers (Auth, Theme, I18n, Toast)
│   ├── AppRouter.tsx                 # Route declarations, code-split lazy imports
│   └── useAppLifecycle.ts            # Capacitor hardware back button, push & status bar hooks
│
├── assets/                           # Static datasets and media registries
│   └── curatedImages.ts              # Relocated out of lib/
│
├── components/                       # Shared / Generic UI Only
│   ├── ui/                           # Primitives (Button, Toggle, Modal, BottomSheet, Badge)
│   ├── layout/                       # Shell components (BottomNav, DesktopSidebar, OfflineBanner)
│   ├── guards/                       # Access guards (RequireOwner, RequireScope, BusinessGuard)
│   └── feedback/                     # Skeletons, ErrorBoundary, EmptyStates
│
├── features/                         # Domain-driven feature modules
│   ├── auth/                         # PhoneEntry, OtpVerify, Onboarding screens & hooks
│   ├── community/                    # CommunityHub, Compose, PostDetail, comments
│   ├── appointments/                 # AppointmentSheet, booking logic, time slot helpers
│   ├── commerce/                     # CartCheckout, BulkOrderSheet, UPI payment sheets
│   ├── explore/                      # MapView, Search, CategoryListing
│   ├── live-share/                   # Existing live-share feature
│   └── notifications/                # Notification screens, permission sheets, badges
│       ├── components/               # Feature-specific sub-components
│       ├── hooks/                    # Feature-specific React hooks
│       └── screens/                  # Screen entry points for this feature
│
├── i18n/                             # Dedicated internationalization
│   ├── index.ts                      # i18n initialization & useI18n hook
│   └── locales/                      # Modular locale files (en.json/ts, hi.json/ts)
│
├── services/                         # API / Supabase query layer (Keep existing 3 domains)
│   ├── core/
│   ├── engagement/
│   └── marketplace/
│
├── store/                            # Modular State Management (Isolated slices)
│   ├── authStore.ts                  # Auth & session slice
│   ├── contextStore.ts               # Active role / business switcher
│   ├── uiStore.ts                    # Toasts, active sheets, modal states
│   └── commerceStore.ts              # Cart, checkout & orders
│
├── styles/                           # Modular CSS Architecture
│   ├── main.css                      # Single entry point importing sub-files
│   ├── tokens.css                    # CSS variables & color ramps (checked by scripts)
│   ├── base.css                      # Resets, safe-area-insets, typography
│   ├── utilities.css                 # Helper utility classes
│   └── components/                   # Specific component or sheet styles
│
└── utils/                            # Pure, framework-agnostic utilities
    ├── format.ts                     # Date, currency, string formatters
    ├── geocode.ts                    # Coordinates & distance calculation
    └── platform.ts                   # Capacitor platform helpers (isNative, isAndroid)
```

---

## 6. Phased Implementation Roadmap

To avoid disruptions to ongoing development, refactoring should be executed in 5 low-risk phases:

### Phase 1: Workspace Hygiene & Quick Wins (Zero Risk)
* Add `hs_err_pid*.log` and `replay_pid*.log` to `.gitignore` and delete them from root.
* Consolidate or document the role of AI tool folders (`.agents`, `.claude`, `.codex`, `.kiro`).
* Move `curatedImages.ts` from `src/lib/` to `src/assets/`.

### Phase 2: Modularize Stylesheet (`src/index.css`)
* Keep token variable definitions intact to ensure `scripts/check-hardcoded-colors.js` and `scripts/check-undefined-tokens.js` continue passing.
* Split `src/index.css` into logical files imported via `@import`:
  1. `tokens.css` (Brand purple, accent, status ramps)
  2. `base.css` (Font definitions, resets, mobile safe area)
  3. `animations.css` (Keyframes, transitions)
  4. `utilities.css` (Layout helpers, badges)

### Phase 3: Decompose `src/App.tsx`
* Extract route definitions into `src/app/AppRouter.tsx`.
* Extract Capacitor hardware back button and push notification registration into `src/app/useAppLifecycle.ts`.
* Extract providers into `src/app/AppProviders.tsx`.
* Shrink `src/App.tsx` from 804 lines to under 80 lines.

### Phase 4: Organize `src/components/` & Clean `src/lib/`
* Group root components into categorized subfolders:
  * `components/ui/` (primitives)
  * `components/guards/` (route and permission guards)
  * `components/layout/` (headers, navbars, sidebars)
* Extract `i18n.tsx` into a dedicated `src/i18n/` module with separate language files.
* Differentiate `utils/` (pure helpers) from domain logic.

### Phase 5: State Decoupling (`src/store.tsx`)
* Break down the 770-line `store.tsx` into decoupled domain contexts or lightweight stores (e.g. Zustand):
  * `AuthStore` (user profile, login state)
  * `ContextStore` (customer vs merchant active context)
  * `SocialStore` (bookmarks, following)
  * `UIStore` (toasts, global modals)
* This eliminates unnecessary component re-renders and improves mobile battery/memory performance.

---

## 7. Conclusion

STRYT's foundation is technically solid and feature-rich. Transitioning from the current overgrown flat folders and monolithic files to a modular, feature-oriented structure will significantly improve developer velocity, reduce merge conflicts, speed up IDE responsiveness, and enhance mobile runtime performance.
