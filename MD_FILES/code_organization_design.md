# High-Level & Low-Level Design: Clean & Professional Codebase Reorganization

This document details the architectural HLD and LLD for restructuring and modularizing the STRYT codebase. It aims to eliminate flat-folder pollution, break down massive monolithic files, separate concerns (UI, state, API), and enforce modern frontend engineering patterns.

---

## High-Level Design (HLD)

### 1. Architectural Philosophy: Feature-Based Clean Architecture
We will transition from a flat, type-based directory structure (where screens, services, and components are separate flat folders) to a **Feature-Based Modular Architecture**. This organizes code by business domain (co-locating pages, services, hooks, and components that belong together).

```
src/
├── core/                  # App shell, configurations, constants
├── components/            # Reusable atomic UI (inputs, buttons, sheets)
├── features/              # Modular business domains (pages, services, state)
│   ├── auth/
│   ├── booking/
│   ├── map/
│   ├── listings/
│   └── social/
├── lib/                   # Third-party wrappers (supabase, mapbox, geocode)
├── store/                 # Modular global state slices
└── utils/                 # Pure helper functions
```

### 2. Service Layer Modularization
Currently, `src/services/` contains 24 flat service files. We will group these services into high-level gateway interfaces:
* `services/core/`: Basic operations (`auth`, `user`, `upload`, `kyc`, `payment`).
* `services/marketplace/`: Business/Provider listings and discovery (`business`, `provider`, `catalog`, `discovery`).
* `services/engagement/`: Interactions (`booking`, `chat`, `social`, `community`, `wallet`, `society`).

### 3. State Management Segregation
The single 25 KB `store.tsx` file will be split into isolated domain slices (e.g., Auth Slice, Social Slice, Queue Slice) using React Contexts or lightweight state containers (like Zustand), avoiding unnecessary app-wide re-renders.

---

## Low-Level Design (LDD)

### 1. Restructuring Directory Specifications

#### A. Central Config & Clients: `src/core/`
* `config.ts`: Centralizes env variables.
* `constants.ts`: Presets (`RADIUS_OPTIONS`, `LANGUAGES`).
* `theme.ts`: UI colors, fonts, border-radius tokens.

#### B. Component Layer: `src/components/`
* `ui/`: Stateless elements (`Button.tsx`, `Card.tsx`, `Badge.tsx`, `Skeleton.tsx`).
* `sheets/`: Reusable overlay drawers (`ReviewSheet.tsx`, `ReportSheet.tsx`, `QrScannerSheet.tsx`).
* `common/`: Global shell layout components (`BottomNav.tsx`, `ErrorBoundary.tsx`).

#### C. Feature Modules: `src/features/`
Each business feature follows this self-contained directory layout:
```
features/[feature-name]/
├── components/            # Feature-specific components
├── hooks/                 # Feature-specific React hooks
├── services/              # API and DB services for this domain
├── pages/                 # Routing pages (formerly screens)
└── store.ts               # Local state/slice
```

---

### 2. Refactoring Monolithic Files

#### A. Decomposing `MapView.tsx` (44 KB)
We will split this large component into:
1. `features/map/hooks/useMapLayers.ts`: Coordinates Mapbox layers, leaflet initialization, and marker placements.
2. `features/map/components/MapMarkers.tsx`: Renders custom provider, business, and request pins.
3. `features/map/components/MapSearch.tsx`: Geocode autocomplete input and selection.
4. `features/map/components/StoryBubble.tsx`: Renders visual local stories on the map view.
5. `features/map/pages/MapView.tsx`: Main parent controller component coordinating state.

#### B. Decomposing `store.tsx` (25 KB)
We will split this single context file into:
1. `store/UserContext.tsx`: Manages current user profiles, role switches, and active contexts.
2. `store/SocialContext.tsx`: Manages follows, bookmarks, and vouches list.
3. `store/QueueContext.tsx`: Manages active queue states.
4. `store/NotificationContext.tsx`: Handles push registration and alerts.

---

### 3. Styling Refactoring Strategy
The single `index.css` (17 KB) will be separated into:
* `styles/variables.css`: HSL Tailored color palettes, dark modes, animations.
* `styles/global.css`: Reset, typography, app layouts.
* `styles/components.css`: Common UI elements (buttons, inputs, cards).
* **Feature CSS Modules**: Use `.module.css` files adjacent to complex page components (e.g. `MapView.module.css`) to prevent stylesheet naming clashes.
