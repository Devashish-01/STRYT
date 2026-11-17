# UI polish review — flows, settings, safety and operations

Static code review, 17 November 2026. Scope: the routed screens and embedded views below. Code changes for F01 through F15 pass TypeScript, token and color checks; authenticated and device behavior still needs verification.

## Priority findings

| ID | Priority | Verified finding and impact | Evidence | Proposed change | Status |
| --- | --- | --- | --- | --- | --- |
| F01 | P1 | Location sharing reads three queries but discards their loading and error states. Until responses arrive, all three arrays are empty and the page asserts that nobody can see the user's location. Failed reads can leave the same false reassurance. | `src/screens/settings/LocationSettings.tsx:20-30`, `:87-101` | Render a combined skeleton until initial reads finish, and a retryable error when any security-relevant query fails. Only show the empty state after successful responses. | **Resolved** — Added combined skeleton while pending/active/history queries load; renders retryable `ErrorView` with `refetchAll` if any query fails; renders empty "No one can see your location" state only when all queries succeed and all three lists are empty. |
| F02 | P1 | The admin overview assumes query data exists after loading. A failed request leaves `data` undefined and `data!` is dereferenced while building cards, so the console can crash instead of offering a retry. | `src/screens/admin/tabs/AdminDashboard.tsx:8-13` | Handle `error` and missing data explicitly with `ErrorView` and `refetch`, as `AdminDeliveries` already does. | **Resolved** — Destructured `error` and `refetch` in `AdminDashboard.tsx`; handled loading, error state via `ErrorView`, and null data guard cleanly before dereferencing dashboard cards. |
| F03 | P1 | Admin queue approve/reject actions have no busy guard or catch. Repeated taps can submit the same action twice, and a failed request produces an unhandled rejection with no feedback. | `src/screens/admin/tabs/AdminQueue.tsx:21-26`, `:86-87` | Keep a per-item pending state, disable both decisions while saving, catch errors, show a retry message, and remove the item only after success. | **Resolved** — Added `pendingIds` per-item busy state to `AdminQueue.tsx`; disabled Reject/Approve buttons while mutating; caught errors and displayed actionable toast feedback; only removed item after successful resolution. |
| F04 | P1 | Agreement and rating screens conflate a fetch error with a missing record. Both use query `data` and `loading` but omit `error`; on a failed read they show a definitive “not found” or “nothing to rate” message. | `src/screens/requests/AgreementScreen.tsx:150-157`, `:211-229`; `src/screens/requests/RateScreen.tsx:15`, `:35-41` | Add a retryable error state before the missing-record branch. Keep the missing-record message for a successful null response. | **Resolved** — In `AgreementScreen.tsx` and `RateScreen.tsx`, destructured `error` and `refetch`; added retryable `ErrorView` branches distinct from missing records; reserved "not found" / "nothing to rate" empty states for true null responses. |
| F05 | P1 | Safety Hub awaits `start()` and `stop()` without catching failures. The live-share provider can throw from its network operations; a failed tap then gives no actionable screen feedback. The start path also gives no feedback when contacts exist but `start()` returns no id, for example after the background-location disclosure is declined. | `src/screens/safety/SafetyHub.tsx:36-46`; `src/features/live-share/LiveShareProvider.tsx:74-113` | Catch failures in the hub with a clear retry message, and explain when sharing did not start after a declined disclosure or unavailable GPS fix. Confirm state before announcing success. | **Resolved** — Wrapped `start()` and `stop()` in try/catch in `SafetyHub.tsx`; provided explicit toast feedback when `start()` returns null (e.g. background location declined or GPS unavailable); caught errors with retryable feedback. |
| F06 | P2 | Language selection immediately reports success, while the server write failure is swallowed. The preference can appear saved on this device but revert elsewhere. | `src/screens/settings/LanguageSettings.tsx:24-29` | Persist with pending/success/error feedback; revert or flag a failed save. Apply the same pattern to the notification radius, whose write is also swallowed at `NotificationSettings.tsx:41-48`. | **Resolved** — In `LanguageSettings.tsx`, added `savingLang` state, pending "Saving…" label, error toast, and rollback to previous language on failure. In `NotificationSettings.tsx`, added `savingRadius` state with live status feedback and rollback on update failure. |
| F07 | P2 | Muted Stories converts load failure to an empty list, then renders the “no muted stories” empty state. The toast is transient, so the page's durable message is wrong. | `src/screens/settings/MutedStories.tsx:52-59`, `:80-85` | Preserve an error state with a retry button; render the empty state only after a successful load. | **Resolved** — In `MutedStories.tsx`, introduced explicit `error` state and retryable `ErrorView`; only renders "no muted stories" `EmptyState` after successful query completion. |
| F08 | P2 | The final onboarding interests step ignores query errors. A category-fetch failure renders no choices while Finish and Skip remain available, causing accidental empty personalization. | `src/screens/auth/onboard/BeatInterests.tsx:39-41`, `:49-77` | Add a retryable error state and make the decision to continue without interests explicit. | **Resolved** — In `BeatInterests.tsx`, destructured `error` and `refetch`; rendered retryable error banner with "Retry" and explicit "Continue without topics" CTA buttons when categories fail to fetch. |
| F09 | P2 | Request category chips show only the first word of each category. Related categories can become indistinguishable; the complete name is absent from the control. | `src/screens/requests/AskCompose.tsx:452-456` | Show complete names with wrapping or a compact two-line chip, and retain the accessible full label. | **Resolved** — In `AskCompose.tsx`, replaced `.split(" ")[0]` truncation with full category names using `SelectableChip` with flexible wrapping, `minHeight: 38`, accessible `role="radio"`, and full accessible labels. |
| F10 | P2 | Support derives its tab from `?tab=` only on mount. Navigating between `/support?tab=contact` and `/support?tab=bug` while the component stays mounted will leave the old tab visible; tapping tabs also does not update the URL. | `src/screens/Support.tsx:26-34`, `:108-137` | Derive the active tab from search params, or synchronize state and URL in both directions. | **Resolved** — In `Support.tsx`, derived `activeTab` bidirectionally from `useSearchParams()`, updating `?tab=contact` / `?tab=bug` on tab click with `{ replace: true }`, and updating tab selection when URL parameters change; added accessible tablist/tab semantics. |
| F11 | P2 | The emergency-contacts intro says only previous chat contacts can be added, while the adjacent form explicitly supports adding any existing STRYT user by mobile, email or username. The empty candidate message repeats the old restriction. | `src/screens/safety/EmergencyContacts.tsx:91-95`, `:140-163`, `:181` | Rewrite the intro and empty candidate copy to explain both add methods and the STRYT-account requirement. | **Resolved** — In `EmergencyContacts.tsx`, updated intro copy to accurately describe both adding via mobile number, email, or username and picking from chat contacts; updated empty candidate copy; replaced confirmation sheet with accessible `ConfirmDialog`. |
| F12 | P2 | The admin console places eleven tabs in one horizontal strip without semantic tab roles or active-state announcements. The active tab can be offscreen after navigation and keyboard users lack tab-list behavior. | `src/screens/admin/AdminPanel.tsx:94-104` | Use accessible tabs with `aria-selected`, panel association and focus management; consider grouping operational areas behind a compact navigation pattern. | **Resolved** — In `AdminPanel.tsx`, added accessible `role="tablist"` with `aria-label`, `role="tab"` buttons with `aria-selected`, `aria-controls`, and `tabIndex`, keyboard arrow navigation (ArrowLeft, ArrowRight, Home, End), smooth scroll-into-view for active tab, and `role="tabpanel"` on content area. |
| F13 | P2 | Several admin tabs read query data but omit errors and retries, so a failed load can resemble a clear queue or blank panel. This pattern appears in Queue, Verification, Appeals, Reports, Disputes and Location Changes. | `src/screens/admin/tabs/AdminQueue.tsx:14`, `:45-53`; `AdminVerificationQueue.tsx:12`, `:55`; `AdminAppeals.tsx:12`, `:29`; `AdminReports.tsx:36`; `AdminDisputes.tsx:12`, `:37`; `AdminLocationChanges.tsx:23`, `:45` | Standardize query handling across tabs: skeleton, retryable error, true empty, populated. Avoid destructive decisions when data freshness is unknown. | **Resolved** — Standardized query state lifecycle (skeleton -> retryable error -> true empty -> populated) across `AdminQueue.tsx`, `AdminVerificationQueue.tsx`, `AdminAppeals.tsx`, `AdminReports.tsx`, `AdminDisputes.tsx`, `AdminLocationChanges.tsx`, and `AdminBugs.tsx`. |
| F14 | P2 | Tracking page's initial RPC has no try/catch, and a rejected promise can leave `loading` true indefinitely. A missing token also returns from the effect while keeping the loading state. | `src/screens/TrackingPage.tsx:78-105`, `:190-197` | Treat transport failure separately from expired links, add retry, and resolve absent tokens to a usable invalid-link state. | **Resolved** — In `TrackingPage.tsx`, wrapped initial RPC in try/catch, treated transport/network failures separately with retry button, and handled missing token with dedicated invalid-link state. |
| F15 | P2 | The safety and emergency-contact screens use a fixed padded container rather than the app's scroll region. Long contact lists and small screens can run below the viewport, with weak keyboard and safe-area behavior. | `src/screens/safety/SafetyHub.tsx:61-62`; `src/screens/safety/EmergencyContacts.tsx:89-90` | Use `screen-scroll` with bottom safe-area padding and verify long lists plus open keyboard on a small device. **Visual hypothesis:** actual clipping requires device verification. | **Resolved** — In `SafetyHub.tsx` and `EmergencyContacts.tsx`, replaced fixed containers with `screen-scroll page-pad col scroll-pad-end` to ensure content and buttons are not clipped and respect safe area insets on small screens. |

## Screen coverage

“Static scan” means the component and its fetch, mutation, form and rendered-state paths were inspected in source. A dash means no distinct issue was promoted from this pass; it is not a visual approval.

| Surface | Route or parent | Assessment |
| --- | --- | --- |
| `Splash.tsx` | `/` | Static scan — landing and sign-in paths; visual check pending |
| `auth/PhoneEntry.tsx` | `/auth/phone` | Static scan — phone input, validation and errors |
| `auth/OtpVerify.tsx` | `/auth/otp` | Static scan — resend, error and verification states |
| `auth/TermsAccept.tsx` | `/auth/terms` | Static scan — agreement flow |
| `auth/DeletionPending.tsx` | `/auth/deletion-pending` | Static scan — recovery and deletion state |
| `auth/UserOnboard.tsx` | `/auth/onboard` | Static scan — step orchestration; F08 |
| `auth/onboard/BeatFrame.tsx` | onboarding shell | Static scan — shared step controls |
| `auth/onboard/BeatIdentity.tsx` | onboarding step 1 | Static scan — identity form |
| `auth/onboard/BeatHandle.tsx` | onboarding step 2 | Static scan — async handle availability |
| `auth/onboard/BeatLocation.tsx` | onboarding step 3 | Static scan — search and location selection |
| `auth/onboard/BeatInterests.tsx` | onboarding step 4 | Static scan — F08 |
| `requests/AskCompose.tsx` | `/ask` | Static scan — draft, media and category form; F09 |
| `requests/RequestDetail.tsx` | `/request/:id` | Static scan — proposal and request states |
| `requests/SubmitProposal.tsx` | `/request/:id/propose` | Static scan — quote form and submission |
| `requests/AgreementScreen.tsx` | `/agreement/:id` | Static scan — F04 |
| `requests/Agreements.tsx` | `/agreements` | Static scan — list, skeleton, retry and empty states |
| `requests/MyAppointments.tsx` | `/appointments` | Static scan — booking list and actions |
| `requests/RateScreen.tsx` | `/rate/:id` | Static scan — F04 |
| `delivery/DeliveryConsole.tsx` | `/delivery` | Static scan — assigned, active and history tabs |
| `MyQueues.tsx` | `/queues` | Static scan — list, error and queue actions |
| `TrackingPage.tsx` | `/track/:token` | Static scan — F14 |
| `AccountSettings.tsx` | `/account` | Static scan — section navigation and search |
| `settings/NotificationSettings.tsx` | `/settings/notifications` | Static scan — F06 |
| `settings/PrivacySettings.tsx` | `/settings/privacy` | Static scan — visibility persistence |
| `settings/MutedStories.tsx` | `/settings/muted-stories` | Static scan — F07 |
| `settings/DiscoverySettings.tsx` | `/settings/discovery` | Static scan — local preferences |
| `settings/LanguageSettings.tsx` | `/settings/language` | Static scan — F06 |
| `settings/SecuritySettings.tsx` | `/settings/security` | Static scan — console password and recovery controls |
| `settings/LocationSettings.tsx` | `/settings/location` | Static scan — F01 |
| `settings/DataSettings.tsx` | `/settings/data` | Static scan — export and deletion confirmation |
| `safety/SafetyHub.tsx` | `/safety` | Static scan — F05, F15 |
| `safety/EmergencyContacts.tsx` | `/safety/contacts` | Static scan — F11, F15 |
| `Support.tsx` | `/support` | Static scan — F10 |
| `guide/GuideIndex.tsx` | `/guide` | Static scan — role tabs and search |
| `guide/GuideDoc.tsx` | `/guide/:slug` | Static scan — document view |
| `legal/LegalIndex.tsx` | `/legal` | Static scan — policy index |
| `legal/LegalDoc.tsx` | `/legal/:slug` | Static scan — policy view |
| `admin/AdminLogin.tsx` | `/admin/login` | Static scan — credentials and error state |
| `admin/AdminPanel.tsx` | `/admin` | Static scan — F12 |
| `admin/tabs/AdminDashboard.tsx` | admin Overview | Static scan — F02 |
| `admin/tabs/AdminQueue.tsx` | admin Queue | Static scan — F03, F13 |
| `admin/tabs/AdminVerificationQueue.tsx` | admin Verification | Static scan — F13 |
| `admin/tabs/AdminLocationChanges.tsx` | admin Location changes | Static scan — F13 |
| `admin/tabs/AdminDisputes.tsx` | admin Disputes | Static scan — F13 |
| `admin/tabs/AdminAppeals.tsx` | admin Appeals | Static scan — F13 |
| `admin/tabs/AdminReports.tsx` | admin Reports | Static scan — F13 |
| `admin/tabs/AdminBugs.tsx` | admin Bugs | Static scan — query-state pattern in F13 |
| `admin/tabs/AdminProfiles.tsx` | admin Profiles | Static scan — search and review actions |
| `admin/tabs/AdminDeliveries.tsx` | admin Deliveries | Static scan — existing retryable error handling |
| `admin/tabs/AdminAccount.tsx` | admin Account | Static scan — credential actions |
| `admin/tabs/adminPrimitives.tsx` | admin shared primitives | Static scan — stats and separator helpers |

`src/screens/admin/types.ts` and `auth/onboard/BeatIdentity.test.ts` are types/test support, not independently rendered screens.

## Implementation order after approval

1. Fix misleading or failed states in location sharing, agreements, rating, admin overview and admin queue (F01–F04).
2. Make safety status and preference saves truthful (F05–F08), then align support navigation and category copy (F09–F11).
3. Standardize admin navigation and query states (F12–F13), harden tracking and verify small-screen scrolling (F14–F15).

Verification for the implementation should include focused component or browser tests for failed reads and writes, then small-phone visual captures for the safety, onboarding, agreement and admin screens. This review did not execute authenticated journeys or make visual claims about rendered screens.
