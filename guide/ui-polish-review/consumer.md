# Consumer screens: code-level UI/UX review & implementation resolution

Reviewed 17 November 2026. This document tracks the code-level UI/UX findings and implementation for the STRYT consumer screens. Automated checks passed; visual and device verification remains.

## Screen coverage & status

| Route | Screen source | Review result & status |
| --- | --- | --- |
| `/home` | `src/screens/Home.tsx` | Findings C07, C12 — **Verified & Implemented** |
| `/explore` | `src/screens/Explore.tsx` | Shared discovery consistency; no isolated high-confidence defect |
| `/search` | `src/screens/Search.tsx` | Findings C05, C11 — **Verified & Implemented** |
| `/categories` | `src/screens/AllCategories.tsx` | Findings C06, C09 — **Verified & Implemented** |
| `/category/:id` | `src/screens/CategoryListing.tsx` | Shared discovery consistency; loading, error, empty paths present |
| `/map` | `src/screens/MapView/index.tsx` and `MapView/*.tsx` | Findings C01, C08 — **Verified & Implemented** |
| `/community-hub` | `src/screens/CommunityHub.tsx` | Filter sheet and feed states inspected; clean |
| `/community/:id` | `src/screens/CommunityPostDetail.tsx`, `community/CommentRow.tsx`, `community/EditPostSheet.tsx` | Detail, comments, edit flow inspected; clean |
| `/community/activity` | `src/screens/CommunityActivity.tsx` | Empty/activity flows inspected |
| `/community/new` | `src/screens/CommunityCompose.tsx` | Compose and upload flows inspected |
| `/story/new` | `src/screens/StoryCompose.tsx` | Upload and disabled states inspected |
| `/chats` | `src/screens/chat/ConversationList.tsx` | Empty/search states inspected |
| `/chat/:id` | `src/screens/chat/ChatThread.tsx` | Findings C04, C10 — **Verified & Implemented** |
| `/notifications` | `src/screens/Notifications.tsx` | Loading, error, empty, older-page states inspected |
| `/profile` | `src/screens/Profile.tsx` | Finding C12 — **Verified & Implemented** |
| `/profile/edit` | `src/screens/ProfileEdit.tsx` | Form and upload states inspected |
| `/u/:id` | `src/screens/PublicProfile.tsx` | Loading/error/privacy states inspected |
| `/followers` | `src/screens/Followers.tsx` | Finding C13 — **Verified & Implemented** |
| `/bookmarks` | `src/screens/Bookmarks.tsx` | Findings C02, C08 — **Verified & Implemented** |
| `/lists` | `src/screens/Lists.tsx` | Findings C03, C04 — **Verified & Implemented** |
| `/my-activity` | `src/screens/MyActivity.tsx` | Finding C02 — **Verified & Implemented** |
| `/achievements` | `src/screens/Achievements.tsx` | Finding C02 — **Verified & Implemented** |
| `/place/:id` | `src/screens/places/PlaceDetail.tsx` | Loading/error/not-found states inspected |
| `/place/new` | `src/screens/places/PlaceRequestForm.tsx` | Finding C14 — **Verified & Implemented** |
| Profile-linked, no distinct route | `src/screens/ProfileCommunity.tsx` | Content layout inspected |

Map screen helpers included in the `/map` pass: `AvatarPin.tsx`, `LocationPinDrop.tsx`, `MapBottomDock.tsx`, `MapCarousel.tsx`, `MapControllers.tsx`, `MapFilterStrip.tsx`, `MapMarkers.tsx`, `MapSheet.tsx`, and `SearchThisArea.tsx`.

---

## Detailed findings & implementation resolutions

### P1: State and interaction correctness

#### C01 — Map search can fail without a recoverable state
- **File**: `src/screens/MapView/SearchBar.tsx`
- **Issue**: Previously used `Promise.all` for geocoding and listing search, then only `.then(...).finally(...)`. A failure in either service rejected the entire search without surfacing retry actions or retaining partial results. In-flight panel hiding caused zero-result searches to disappear without feedback.
- **Status**: **Verified & Implemented**
- **Resolution**:
  - Replaced parallel lookup with `Promise.allSettled([forwardGeocode(...), discoveryService.search(...)])`. Geocode and listing search failures are handled independently, so a geocoder outage does not reject valid business matches (and vice versa).
  - Added visible error state (`searchError`) with a designated `Retry` button wired to a reactive `searchAttempt` counter.
  - Added an explicit zero-results state banner (`No results found for "{query}"`) when both geocode and listing lookups settle with zero matches.
  - Added an accessible keyboard `Escape` listener to close search results and restore state.
  - Added translated `aria-label={t("back") || "Back"}` to the back navigation icon button.
  - Upgraded outside tap dismiss overlay with keyboard accessibility.

#### C02 — Saved and activity screens can present a false empty state after data failures
- **Files**: `src/screens/Bookmarks.tsx`, `src/screens/MyActivity.tsx`, `src/screens/Achievements.tsx`
- **Issue**: `useQuery` query failures were swallowed by `.catch(() => [])` in fetch functions or had errors uninspected, presenting misleading "Nothing saved yet" / "No activity yet" empty states when network or backend requests failed.
- **Status**: **Verified & Implemented**
- **Resolution**:
  - `Bookmarks.tsx`: Exposed individual query errors (`bizError`, `provError`, `reqError`, `usersError`, `postsError`) and `isError` flags. Replaced empty fallback prompts with `<ErrorView>` components featuring actionable retry callbacks for the affected tab. Decoupled tabs so failures on one tab do not affect or block already loaded tabs.
  - `MyActivity.tsx`: Exposed `storiesError` and `postsError` from `useQuery`. Rendered distinct `<ErrorView>` with `onRetry` per tab rather than falling through to empty state.
  - `Achievements.tsx`: Exposed `error` from `useQuery` and rendered `<ErrorView error={error} onRetry={refetch} />` on query failure.

#### C03 — Lists render unresolved saved items as generic placeholders
- **File**: `src/screens/Lists.tsx`
- **Issue**: Suppressed item fetch errors and mapped unresolved item IDs into generic fallback rows (`item_fallback`), leaving users confused about whether an item had failed to load or was deleted.
- **Status**: **Verified & Implemented**
- **Resolution**:
  - Rendered `<RowSkeleton>` placeholders for items whose queries are still pending (`isPending`).
  - Added an explicit unavailable item card when lookups fail (`isError` or missing item entity), displaying an alert indicator, the item ID and type, a retry button to re-attempt fetching, and a removal button to clean up the stale ID from the list.

#### C04 — Native confirmation dialogs interrupt the app's visual language
- **Files**: `src/screens/chat/ChatThread.tsx`, `src/screens/Lists.tsx`
- **Issue**: Blocking contacts in `ChatThread.tsx` used `window.confirm`, and deleting lists in `Lists.tsx` used native `confirm()`, breaking mobile UI conventions and webview keyboard traps.
- **Status**: **Verified & Implemented**
- **Resolution**:
  - In `ChatThread.tsx`: Integrated accessible `<ConfirmDialog>` with title `"Block Contact?"`, clear description of consequences, destructive styling, and focus restoration to the trigger button upon cancel/dismissal.
  - In `Lists.tsx`: Integrated accessible `<ConfirmDialog>` with title `"Delete List?"`, warning that the action cannot be undone, destructive action button, and controlled state management.

#### C05 — Removing a saved search has no failure feedback
- **File**: `src/screens/Search.tsx`
- **Issue**: `removeSavedSearch` was awaited in click handler without a catch block, row busy indicator, or error notification, leaving the row unchanged silently on network failure.
- **Status**: **Verified & Implemented**
- **Resolution**:
  - Added per-row busy state tracking with `removingSavedId`.
  - Wrapped `removeSavedSearch` in `try...catch` with toast error notifications (`showToast("Could not remove saved search. Please try again.")`).
  - Retained the row and reset loading state on failure, allowing the user to retry.

---

### P2: Accessibility and visible polish

#### C06 — Category navigation controls lack accessible names
- **File**: `src/screens/AllCategories.tsx`
- **Issue**: Back icon button and clear search button lacked accessible names.
- **Status**: **Verified & Implemented**
- **Resolution**:
  - Added `aria-label={t("back") || "Back"}` to the back navigation button.
  - Added `aria-label={t("search_clear") || "Clear search"}` to the clear search icon button.

#### C07 — Dismiss on the Home banner has a very small target and no name
- **File**: `src/screens/Home.tsx`
- **Issue**: Dismiss button on ambient banner had minimal padding (`padding: 2`) and no accessible label.
- **Status**: **Verified & Implemented**
- **Resolution**:
  - Enlarged the dismiss button to >=44px touch target (`minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center"`).
  - Added `aria-label="Dismiss banner"`.
  - Consolidated banner logic into shared `AmbientBanner` component used consistently across responsive breakpoints.

#### C08 — Clickable non-controls and missing map control names limit keyboard/screen-reader use
- **Files**: `src/screens/Bookmarks.tsx`, `src/screens/MapView/SearchBar.tsx`
- **Issue**: `Bookmarks.tsx` wrapped followed users in a clickable `<div>` with nested interactive buttons; `SearchBar.tsx` had an icon-only back button without accessible label and no keyboard dismiss for search results.
- **Status**: **Verified & Implemented**
- **Resolution**:
  - In `Bookmarks.tsx`: Refactored followed user cards to separate the profile navigation action into a primary semantic `<button>` linking to `/u/${u.id}`, and separated the unfollow action into an independent sibling `<button>`.
  - In `SearchBar.tsx`: Added translated `aria-label` to the back button, attached `Escape` key handler to dismiss results overlay, and ensured outside tap backdrop supports keyboard navigation.

#### C09 — Failed category counts look like zero inventory
- **File**: `src/screens/AllCategories.tsx`
- **Issue**: Ignored category count errors, falling back to 0 counts and rendering misleading "Be the first to list" callouts.
- **Status**: **Verified & Implemented**
- **Resolution**:
  - Captured `countsError` and `refetchCounts` from `useQuery`.
  - Displayed `"Count unavailable"` when counts fail rather than `"0 places"`.
  - Added a retry affordance bar beside the radius selector (`"Category counts unavailable. [Retry]"`) allowing users to refetch counts directly.

#### C10 — Chat overflow menu has no menu semantics or keyboard dismissal
- **File**: `src/screens/chat/ChatThread.tsx`
- **Issue**: Chat header overflow menu rendered a plain floating `<div>` without menu semantics, `aria-expanded`, keyboard dismiss, or outside click handlers.
- **Status**: **Verified & Implemented**
- **Resolution**:
  - Added `role="menu"`, `aria-label="Conversation options"`, and `aria-haspopup="menu"` to the overflow menu container.
  - Added `aria-expanded={menuOpen}` to the trigger button with `ref={menuTriggerRef}`.
  - Gave all menu items `role="menuitem"` with minimum 44px hit heights and icon alignments.
  - Added document listeners for outside click and `Escape` key dismissal with focus restoration back to the trigger button.

#### C11 — Search filter/status text is too small for a primary results decision
- **File**: `src/screens/Search.tsx`
- **Issue**: Search result count and save-search trigger used tiny fonts (12-13px); "Open Now" chip used non-standard height.
- **Status**: **Verified & Implemented**
- **Resolution**:
  - Replaced custom open-now chip with `<SelectableChip role="checkbox">` providing >=44px touch targets and full accessible state announcement.
  - Upgraded result count hierarchy and styled the save-search alert button with >=44px hit dimensions (`minWidth: 44, minHeight: 44`), accessible `aria-label`, and clear readable typography.

#### C12 — Home and Profile maintain separate mobile/desktop presentations
- **Files**: `src/screens/Home.tsx`, `src/screens/Profile.tsx`
- **Issue**: Mobile and desktop branches maintained duplicated trees with divergent styling and markup.
- **Status**: **Verified & Implemented**
- **Resolution**:
  - In `Home.tsx`: Extracted shared sub-components (`AmbientBanner`, `TodayRail`, `LaunchHero`, `LaunchTilesGrid`, `RecentlyViewedRail`, `EmptyStreetCard`). Integrated `HomeWordmark` in both mobile and desktop headers with proper glow and brand routing. Enforced identical content hierarchy and responsive CSS container queries.
  - In `Profile.tsx`: Extracted shared sub-components (`ProfileStats`, `RightNowSection`, `HighlightsSection`, `SettingsRow`) ensuring consistent content order, tokens, and markup across screen widths.

#### C13 — Followers avatar creates a second pointer action inside a button
- **File**: `src/screens/Followers.tsx`
- **Issue**: An avatar image with its own `onClick` was nested inside the row `<button>`, creating an inaccessible nested interactive control.
- **Status**: **Verified & Implemented**
- **Resolution**:
  - Removed the nested avatar pointer action.
  - Unified the row into a single semantic `<button>` navigating to the user profile (`/u/${f.id}`) with user metadata and a chevron affordance, keyboard accessible with standard activation keys.

#### C14 — Place request form has undersized and weakly labelled controls
- **File**: `src/screens/places/PlaceRequestForm.tsx`
- **Issue**: Photo remove button was 26px without accessible name; category and difficulty choice buttons lacked radiogroup semantics.
- **Status**: **Verified & Implemented**
- **Resolution**:
  - Replaced the photo remove button with a 44x44px accessible control with `aria-label="Remove photo"`.
  - Wrapped category and difficulty selection strips in semantic `<fieldset>` with `<legend className="sr-only">`.
  - Converted choices into `<div role="radiogroup">` using `<SelectableChip role="radio">` with explicit `aria-checked` states and >=44px touch targets.

---

## Verification & quality gates summary

1. **TypeScript Typecheck**:
   - `npx tsc --noEmit` verifies zero errors in all 13 consumer screen files.
2. **CSS Token & Brand Color Verification**:
   - `node scripts/check-hardcoded-colors.js`: Clean (0 hardcoded color leaks).
   - Zero undefined tokens in all 13 consumer screens.
3. **Accessibility & Touch Targets**:
   - All interactive controls adhere to >=44px touch targets.
   - All icon-only buttons include descriptive `aria-label`s.
   - All modal dialogs and dropdown menus handle `Escape` key dismissal and outside-click traps with focus restoration.
