# Business and provider UI polish review

Reviewed 17 November 2026. Scope: all TSX files in `src/screens/business/`, `src/screens/provider/`, `src/screens/manage/`, plus `BusinessAccess.tsx` and `ManageHub.tsx`. The findings below describe the original source-level audit; the resolution section records subsequent code changes. No visual or device test has been run. Severity describes user impact, not implementation difficulty. A route can share a component with another route.

## Priority findings

| ID | Priority | Finding and code evidence | Proposed change |
| --- | --- | --- | --- |
| BP-01 | P0 | Business Payments only exposes `queueLoading`; appointments, custom payments and bulk deposits are read as `data ?? []`, then the empty card renders whenever derived counts are zero. A slow or failed request can therefore say there are no claims even when there are claims to act on. [BusinessPayments.tsx:29](../../src/screens/business/manage/BusinessPayments.tsx#L29), [BusinessPayments.tsx:78](../../src/screens/business/manage/BusinessPayments.tsx#L78), [BusinessPayments.tsx:216](../../src/screens/business/manage/BusinessPayments.tsx#L216). Provider Money also displays zero analytics after loading without inspecting query errors. [ProviderMoney.tsx:28](../../src/screens/provider/manage/ProviderMoney.tsx#L28), [ProviderMoney.tsx:206](../../src/screens/provider/manage/ProviderMoney.tsx#L206). | Treat each source as loading, ready, or error; show a full payment skeleton until required sources settle; show retry for failures and an empty state only when all required data loaded successfully. |
| BP-02 | P1 | The business and provider dashboard triage totals use `?? []` for multiple independent queries and do not consume their error values. Failed appointments, queue, payments or leads can silently turn action counts into zero, which is risky for operational screens. [ManageDashboard.tsx:64](../../src/screens/business/manage/ManageDashboard.tsx#L64), [ManageDashboard.tsx:152](../../src/screens/business/manage/ManageDashboard.tsx#L152), [ProviderDashboard.tsx:68](../../src/screens/provider/manage/ProviderDashboard.tsx#L68), [ProviderDashboard.tsx:144](../../src/screens/provider/manage/ProviderDashboard.tsx#L144). | Add per-section loading/error/retry, a visible stale-data cue where cached data exists, and avoid a reassuring all-caught-up state until its input queries succeed. |
| BP-03 | P1 | Manage Hub ignores query errors and computes `myBiz ?? []`, `mySessions ?? []`, and `myProviders ?? []`. On a failed business query, its add-business prompt appears because the only guard is `!bizLoading`; a provider-role user with a failed provider query can see a perpetual “Loading your provider profile…”. [ManageHub.tsx:12](../../src/screens/ManageHub.tsx#L12), [ManageHub.tsx:16](../../src/screens/ManageHub.tsx#L16), [ManageHub.tsx:73](../../src/screens/ManageHub.tsx#L73), [ManageHub.tsx:142](../../src/screens/ManageHub.tsx#L142). | Make each section distinguish failure from empty, provide retry, and render creation prompts only after a successful empty response. |
| BP-04 | P1 | “New leads” and “New reviews” notification switches in business settings, and “New leads” in provider settings, only persist to localStorage. The source comments explicitly say notification emission is not wired. The UI presents them as working notification controls. [BusinessSettings.tsx:30](../../src/screens/business/manage/BusinessSettings.tsx#L30), [ProviderSettings.tsx:22](../../src/screens/provider/manage/ProviderSettings.tsx#L22). | Wire actual notification events and stored preferences, or hide/disable these switches with clear availability copy until functional. |
| BP-05 | P1 | The provider settings fetch swallows failure and enters the normal page with default toggle values; toggles for public phone, email and exact location update local state before `persist()` and do not roll back on a failed write. Business settings uses the same fire-and-forget `persist` pattern. Privacy controls can appear saved when they are not. [ProviderSettings.tsx:60](../../src/screens/provider/manage/ProviderSettings.tsx#L60), [ProviderSettings.tsx:221](../../src/screens/provider/manage/ProviderSettings.tsx#L221), [BusinessSettings.tsx:128](../../src/screens/business/manage/BusinessSettings.tsx#L128). | Show a load error before controls; disable a row while saving; restore the previous value on failure; confirm success with persistent state or refetch. |
| BP-06 | P1 | Edit Profile forms use visible `<label>` elements without `htmlFor`/input IDs for core fields. Examples: business name, address, phone, provider display name and bio. The provider skill input and icon-only add/remove controls also lack accessible names. [ProfileEditor.tsx:216](../../src/screens/business/manage/ProfileEditor.tsx#L216), [ProfileEditor.tsx:256](../../src/screens/business/manage/ProfileEditor.tsx#L256), [ProviderProfileEditor.tsx:92](../../src/screens/provider/manage/ProviderProfileEditor.tsx#L92), [ProviderProfileEditor.tsx:113](../../src/screens/provider/manage/ProviderProfileEditor.tsx#L113). | Give each input a stable ID and associated label, and name icon-only skill actions. Apply the same pattern to catalog price fields and other forms. |
| BP-07 | P1 | A customer question upvote is a clickable `div` with `role="button"` but no `tabIndex` or keyboard handler; the business profile review teaser is also a clickable `div`. Keyboard users cannot operate them. [BusinessDetail.tsx:847](../../src/screens/business/BusinessDetail.tsx#L847), [BusinessProfileHub.tsx:112](../../src/screens/business/manage/BusinessProfileHub.tsx#L112). | Use native `<button>` or link elements, preserving existing appearance and state. |
| BP-08 | P1 | Most business/provider custom overlays use plain `div.overlay` and `div.sheet`, without a modal role, `aria-modal`, a focus target, focus return, or Escape handling in the local code. This includes catalog editing/deletion, appointment actions, team access and settings. Two sheets add `role="dialog"`, showing partial adoption. [CatalogManager.tsx:183](../../src/screens/business/manage/CatalogManager.tsx#L183), [BusinessAppointments.tsx:916](../../src/screens/business/manage/BusinessAppointments.tsx#L916), [BusinessAccess.tsx:611](../../src/screens/BusinessAccess.tsx#L611), [BusinessPortfolio.tsx:173](../../src/screens/business/manage/BusinessPortfolio.tsx#L173). | Introduce a shared accessible sheet/dialog primitive with focus trapping, Escape, named heading, focus return and safe-area behavior; migrate these screens in batches. |
| BP-09 | P1 | Time-critical queue payment decisions are rendered at `10px` with `3px 8px` padding; queue message/remove buttons and several dashboard header controls are fixed at 32px. These are small touch targets for operational use. [QueueManager.tsx:359](../../src/screens/business/manage/QueueManager.tsx#L359), [QueueManager.tsx:511](../../src/screens/business/manage/QueueManager.tsx#L511), [ProviderDashboard.tsx:356](../../src/screens/provider/manage/ProviderDashboard.tsx#L356). | Use at least a 44px effective tap area for primary touch actions, with a readable label size; preserve density with invisible hit-area padding or grouping where needed. |
| BP-10 | P2 | The business console hides most tools inside a long-press/swipe/tap “Home” dial, while the provider console exposes Jobs, Find Work and Money directly in five bottom tabs. The business home copy confirms every other tool is in the dial; `ManageNav` routes only Dashboard/Home/Profile in its visible nav. [BusinessHome.tsx:35](../../src/screens/business/manage/BusinessHome.tsx#L35), [ManageNav.tsx:186](../../src/screens/business/manage/ManageNav.tsx#L186), [ProviderManageNav.tsx:25](../../src/screens/provider/manage/ProviderManageNav.tsx#L25). | Validate the two information architectures with task completion checks. Expose the most frequent business actions directly and make the dial’s affordance explicit if retained. This is a navigation hypothesis, not a measured usability defect. |
| BP-11 | P2 | Category/availability choices are visual chips whose selected state is only a CSS class; examples have no `aria-pressed` or radio semantics. [ProfileEditor.tsx:219](../../src/screens/business/manage/ProfileEditor.tsx#L219), [ProviderProfileEditor.tsx:95](../../src/screens/provider/manage/ProviderProfileEditor.tsx#L95), [CatalogManager.tsx:359](../../src/screens/business/manage/CatalogManager.tsx#L359). | Standardize selectable chips as radio groups or pressed buttons with announced state, consistent selection contrast and keyboard focus. |
| BP-12 | P2 | Queue average-service-time number and range inputs have no programmatic label. [QueueManager.tsx:418](../../src/screens/business/manage/QueueManager.tsx#L418), [QueueManager.tsx:445](../../src/screens/business/manage/QueueManager.tsx#L445). | Give both controls concise names and explain the unit/range with `aria-describedby`. |
| BP-13 | P2 | Onboarding uses a text step subtitle and decorative progress bars with no semantic progress value. Restored draft banners contain a 24px dismiss button and a destructive “Start over” action without an explicit confirmation in the shown handler. [BusinessOnboard.tsx:401](../../src/screens/business/BusinessOnboard.tsx#L401), [BusinessOnboard.tsx:421](../../src/screens/business/BusinessOnboard.tsx#L421), [ProviderOnboard.tsx:287](../../src/screens/provider/ProviderOnboard.tsx#L287), [ProviderOnboard.tsx:302](../../src/screens/provider/ProviderOnboard.tsx#L302). | Add accessible step progress (`aria-valuenow`/text), enlarge dismiss target, and confirm draft discard or offer undo. |
| BP-14 | P2 | Queue payment badge says `₹ UPI paid` or `₹ Cash paid` and may then append a second amount, resulting in inconsistent money formatting. [QueueManager.tsx:347](../../src/screens/business/manage/QueueManager.tsx#L347). | Use the common currency formatter and one clear amount/method presentation. |

## Screen coverage

All entries below received source inspection. “Pattern” refers to the finding IDs above. “No additional finding” means the screen was included in the pass, not that visual quality has been certified. Routes are from `src/App.tsx`; helper components are marked as such.

| Screen file under `src/screens/` | Route / role | Review result |
| --- | --- | --- |
| `BusinessAccess.tsx` | `/account/business-access` | BP-08; dense team sheet. |
| `ManageHub.tsx` | `/manage` | BP-03. |
| `manage/LeadsInbox.tsx` | Business/provider `/manage/inbox` | Explicit loading, error, retry and empty states; no additional finding. |
| `business/BizCatalogGrid.tsx` | Detail child component | Catalog layout inspected; no additional finding. |
| `business/BusinessDetail.tsx` | `/business/:id` | BP-07; booking, cart, reviews, questions inspected. |
| `business/BusinessLogin.tsx` | `/business-login` | Waiting approval state and sign-in feedback inspected; no additional finding. |
| `business/BusinessOnboard.tsx` | `/onboard/business` | BP-13. |
| `business/manage/BroadcastRadius.tsx` | `/business/:id/manage/broadcast` | Radius editor inspected; no additional finding. |
| `business/manage/BulkDealDetail.tsx` | `/business/:id/manage/bulk-deals/:dealId` | Deal detail/actions inspected; no additional finding. |
| `business/manage/BulkDealsManager.tsx` | `/business/:id/manage/bulk-deals` | BP-08 for confirmation sheet. |
| `business/manage/BusinessAppointments.tsx` | `/business/:id/manage/appointments` | BP-08; list loading/error/empty states present. |
| `business/manage/BusinessDeliveries.tsx` | `/business/:id/manage/deliveries` | Explicit list loading/error/empty states; no additional finding. |
| `business/manage/BusinessFeatures.tsx` | `/business/:id/manage/features` | Feature directory inspected; no additional finding. |
| `business/manage/BusinessHome.tsx` | `/business/:id/manage` | BP-02, BP-10. |
| `business/manage/BusinessHub.tsx` | `/business/:id/manage/business` | Tool hub inspected; no additional finding. |
| `business/manage/BusinessPayments.tsx` | `/business/:id/manage/payments` | BP-01. |
| `business/manage/BusinessPortfolio.tsx` | `/business/:id/manage/portfolio` | BP-08; delete dialog partially semantic. |
| `business/manage/BusinessProfileHub.tsx` | `/business/:id/manage/profile` | BP-07. |
| `business/manage/BusinessRequests.tsx` | `/business/:id/manage/requests` | Request management inspected; no additional finding. |
| `business/manage/BusinessSettings.tsx` | `/business/:id/manage/settings` | BP-04, BP-05, BP-08. |
| `business/manage/BusinessStoreHub.tsx` | `/business/:id/manage/store` | Store tool hub inspected; no additional finding. |
| `business/manage/CatalogManager.tsx` | `/business/:id/manage/catalog` | BP-06, BP-08, BP-11. |
| `business/manage/HoursEditor.tsx` | `/business/:id/manage/hours` | Hours and open-now controls inspected; no additional finding. |
| `business/manage/InventoryAlerts.tsx` | `/business/:id/manage/inventory` | Stock controls inspected; no additional finding. |
| `business/manage/ManageDashboard.tsx` | `/business/:id/manage/dashboard` | BP-02. |
| `business/manage/ManageNav.tsx` | Business console nav | BP-10. |
| `business/manage/ProfileEditor.tsx` | `/business/:id/manage/edit-profile` | BP-06, BP-08, BP-11. |
| `business/manage/QnaManager.tsx` | `/business/:id/manage/qna` | Explicit loading, error, retry and empty states; no additional finding. |
| `business/manage/QueueManager.tsx` | `/business/:id/manage/queue` | BP-08, BP-09, BP-12, BP-14. |
| `business/manage/ReviewsManager.tsx` | Business/provider `/manage/reviews` | Explicit loading, error, retry and empty states; no additional finding. |
| `business/manage/TeamMyDeliveries.tsx` | `/business/:id/manage/my-deliveries` | Delivery list inspected; no additional finding. |
| `business/manage/VerificationCenter.tsx` | `/business/:id/manage/verify` | Shared verification wrapper; no additional finding. |
| `provider/ProviderDetail.tsx` | `/provider/:id` | Public profile, booking, portfolio and review sections inspected; no additional finding. |
| `provider/ProviderOnboard.tsx` | `/onboard/provider` | BP-13. |
| `provider/manage/ProviderAvailability.tsx` | `/provider/:id/manage/availability` | Availability control inspected; no additional finding. |
| `provider/manage/ProviderCatalog.tsx` | `/provider/:id/manage/catalog` | Wrapper to shared provider catalog; BP-11 should be checked in shared UI. |
| `provider/manage/ProviderCommunity.tsx` | `/provider/:id/manage/community` | Wrapper to shared community; no additional finding here. |
| `provider/manage/ProviderDashboard.tsx` | `/provider/:id/manage` | BP-02, BP-09. |
| `provider/manage/ProviderFindWork.tsx` | `/provider/:id/manage/find-work` | Explicit list loading/error/empty states; no additional finding. |
| `provider/manage/ProviderInventory.tsx` | `/provider/:id/manage/inventory` | Wrapper to shared provider inventory; no additional finding here. |
| `provider/manage/ProviderJobs.tsx` | `/provider/:id/manage/jobs` | BP-08; list loading/error/empty states present. |
| `provider/manage/ProviderManageNav.tsx` | Provider console nav | BP-10 comparison. |
| `provider/manage/ProviderMoney.tsx` | `/provider/:id/manage/money` | BP-01. |
| `provider/manage/ProviderPortfolio.tsx` | `/provider/:id/manage/portfolio` | BP-08. |
| `provider/manage/ProviderProfileEditor.tsx` | `/provider/:id/manage/edit-profile` | BP-06, BP-11. |
| `provider/manage/ProviderProfileHub.tsx` | `/provider/:id/manage/profile` | Profile hub inspected; no additional finding. |
| `provider/manage/ProviderSettings.tsx` | `/provider/:id/manage/settings` | BP-04, BP-05, BP-08. |
| `provider/manage/ProviderVerification.tsx` | `/provider/:id/manage/verify` | Shared verification wrapper; no additional finding. |

## Suggested implementation order after approval

1. Correct data-state handling in Payments, dashboards, Manage Hub and Settings (BP-01–05). These affect trust in operational information and privacy controls.
2. Migrate interactive forms and sheets to shared accessible primitives (BP-06–08, BP-11–12), then fix touch sizing (BP-09).
3. Validate navigation architecture and onboarding refinements with real mobile flows (BP-10, BP-13), then standardize small formatting details (BP-14).

## Validation needed after changes

Use mobile viewport and keyboard checks for core owner/provider journeys: onboarding → manage hub → dashboard → booking/payment action → settings; simulate slow and failed responses; verify all sheets with focus, Escape and screen reader names. This audit did not execute those journeys.

## Resolution status (implemented; device verification pending)

Code changes for all 14 priority findings (BP-01 through BP-14) have been implemented. Build, lint and automated tests pass, but the owner/provider journeys, keyboard interactions, slow-network states and Android device behavior still need hands-on verification. A later review corrected the shared sheet's focus handling, radio-chip arrow navigation and Provider Money's weekly-total loading/error state.

- **BP-01 (Implemented; device check pending)**:
  - `src/screens/business/manage/BusinessPayments.tsx`: Captured `loading` and `error` states for all four payment queries (`appointments`, `queue`, `customPayments`, `bulkDeposits`). Added full initial skeleton loader, an `ErrorView` retry card when all queries fail, a retry banner if any query fails, and only shows the empty state when all required sources settle cleanly with zero claims.
  - `src/screens/provider/manage/ProviderMoney.tsx`: Handled loading skeletons and query errors for `analytics`, `ledger`, and `appointments`. Earnings, claims, and ledger sections now show retry triggers and skeletons rather than defaulting to zero.
- **BP-02 (Implemented; device check pending)**:
  - `src/screens/business/manage/ManageDashboard.tsx`: Triage action queries (`queue`, `appointments`, `customPayments`, `pendingBulkDeposits`, `questions`) now track per-query error and loading states. Replaced instant false "all caught up" with loading skeleton, error retry block, and warning banner when some queries fail.
  - `src/screens/provider/manage/ProviderDashboard.tsx`: Added error handling and retry for appointments in the Action Needed section, preventing misleading all-caught-up indicators.
- **BP-03 (Implemented; device check pending)**:
  - `src/screens/ManageHub.tsx`: Distinguishes network/query errors (`bizError`, `provError`, `sessError`) from empty states with dedicated error cards and retry buttons. "Add a business" only appears on confirmed empty businesses list (`!bizLoading && !bizError && businesses.length < 5`). Provider section shows retry on error and "Become a provider" only when confirmed not a provider.
- **BP-04 (Implemented; device check pending)**:
  - `src/screens/business/manage/BusinessSettings.tsx` & `src/screens/provider/manage/ProviderSettings.tsx`: Added clear explanatory availability copy to "New leads" and "New reviews" switches ("Saved on this device. Live push notifications coming soon.") so users are clearly informed of their local status.
- **BP-05 (Implemented; device check pending)**:
  - `src/screens/business/manage/BusinessSettings.tsx`: Wrapped toggles (`showPhone`, `showEmail`, `locPublic`, `bookingsEnabled`, `acceptingOrders`, `deliveryEnabled`) with state rollbacks, toast feedback on success/failure, and row disabling during in-flight writes (`savingPrivacy`, `savingBookings`, etc.).
  - `src/screens/provider/manage/ProviderSettings.tsx`: Handled `loadError` before controls, disabled privacy toggles while saving (`disabled={savingPrivacy}`), and rolled back values on write failures with toast notifications.
- **BP-06 (Implemented; device check pending)**:
  - `src/screens/business/manage/ProfileEditor.tsx`: Added explicit `id` and `<label htmlFor="...">` for business name, description, address, city, pincode, phone, and whatsapp inputs.
  - `src/screens/provider/manage/ProviderProfileEditor.tsx`: Added IDs and matching labels for display name, bio, and new skill input (`id="providerprofileeditor-new-skill" aria-label="Add a skill"`). Added `aria-label="Remove skill ..."` on skill removal buttons and `aria-label="Add skill"` on addition button.
  - `src/screens/business/manage/CatalogManager.tsx`: Added `htmlFor`/`id` bindings for item name, description, price, sale price, slot capacity, and max party size inputs. Added `aria-label="Remove photo"` to photo picker remove button.
- **BP-07 (Implemented; device check pending)**:
  - `src/screens/business/BusinessDetail.tsx`: Replaced customer question upvote clickable `div` with a semantic `<button type="button" aria-pressed={q.upvoted} aria-label={`Upvote question (${q.upvotes} upvotes)`} ...>` with min 44px tap target.
  - `src/screens/business/manage/BusinessProfileHub.tsx`: Replaced review teaser clickable `div` with a semantic `<button type="button" className="card row between center-v" ...>` for full keyboard accessibility and screen-reader support.
- **BP-08 (Implemented; device check pending)**:
  - Replaced legacy `div.overlay` / `div.sheet` modals with `AccessibleSheet` (focus trap, Escape key, `data-back-close`, `aria-modal="true"`) or `ConfirmDialog` across:
    - `src/screens/business/manage/CatalogManager.tsx`: Item editor sheet (`AccessibleSheet`) and delete item (`ConfirmDialog`).
    - `src/screens/business/manage/BusinessAppointments.tsx`: Response note modal (`AccessibleSheet`), payment confirmation modal (`AccessibleSheet`), and delivery batch agent picker (`AccessibleSheet`).
    - `src/screens/BusinessAccess.tsx`: Team & access management sheet (`AccessibleSheet`) and revoke access confirmation (`ConfirmDialog`).
    - `src/screens/business/manage/BusinessPortfolio.tsx`: Remove work sample sheet (`AccessibleSheet`).
    - `src/screens/business/manage/BulkDealsManager.tsx`: Delete campaign modal (`ConfirmDialog`) and campaign composer sheet (`AccessibleSheet`).
    - `src/screens/provider/manage/ProviderJobs.tsx`: Response note modal (`AccessibleSheet`) and payment confirmation modal (`AccessibleSheet`).
    - `src/screens/provider/manage/ProviderPortfolio.tsx`: Delete work sample confirmation (`ConfirmDialog`).
    - `src/screens/business/manage/QueueManager.tsx`: Close queue modal (`AccessibleSheet`) and add walk-in sheet (`AccessibleSheet`).
    - `src/screens/business/manage/BusinessSettings.tsx`: Delete business sheet (`AccessibleSheet`) and package picker (`AccessibleSheet`).
    - `src/screens/provider/manage/ProviderSettings.tsx`: Package picker sheet (`AccessibleSheet`).
    - `src/screens/business/manage/ReviewsManager.tsx`: Delete reply confirmation (`ConfirmDialog`).
- **BP-09 (Implemented; device check pending)**:
  - `src/screens/business/manage/QueueManager.tsx`: Enlarged payment row confirm/reject buttons to `minHeight: 44, padding: "8px 14px"`; enlarged message, remove, call, and serve action buttons to 44px x 44px (`minWidth: 44, minHeight: 44`).
  - `src/screens/provider/manage/ProviderDashboard.tsx`: Enlarged header notification and chat icon buttons to 44px x 44px (`minWidth: 44, minHeight: 44`).
- **BP-10 (Implemented; device check pending)**:
  - `src/screens/business/manage/ManageNav.tsx`: Added `aria-haspopup="dialog"` and explicit `aria-label` / `aria-expanded` to the Home dial button.
  - `src/screens/business/manage/BusinessHome.tsx`: Ensured quick actions for bookings, queue, and payments are discoverable with live badge counts (`badgeFor`).
  - `src/screens/provider/manage/ProviderManageNav.tsx`: Verified direct tab discoverability for Today, Jobs, Find Work, and Money.
- **BP-11 (Implemented; device check pending)**:
  - Standardized visual choice chips with `SelectableChip` (`role="radio"` / `role="checkbox"`, `aria-checked`, `aria-pressed`, keyboard focus, and >=44px touch targets) wrapped in `role="radiogroup"` with descriptive labels in:
    - `src/screens/business/manage/ProfileEditor.tsx`: Category selector.
    - `src/screens/provider/manage/ProviderProfileEditor.tsx`: Category selector.
    - `src/screens/business/manage/CatalogManager.tsx`: Availability (`INFINITE`/`FINITE`), Food type, Veg/Non-veg, and Featured items.
    - `src/screens/business/manage/ReviewsManager.tsx`: Star rating filter chips.
- **BP-12 (Implemented; device check pending)**:
  - `src/screens/business/manage/QueueManager.tsx`: Added programmatic `<label id="qm-avg-time-label" htmlFor="qm-avg-time-num">`, `aria-labelledby="qm-avg-time-label"`, and `aria-describedby="qm-avg-time-hint"` to both the numeric input and the range slider.
- **BP-13 (Implemented; device check pending)**:
  - `src/screens/business/BusinessOnboard.tsx` & `src/screens/provider/ProviderOnboard.tsx`: Added accessible progress bar semantics (`role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-valuetext`), enlarged draft dismiss buttons to 44px x 44px, and confirmed "Start over" draft discard with `ConfirmDialog` to prevent accidental loss of form progress.
- **BP-14 (Implemented; device check pending)**:
  - `src/screens/business/manage/QueueManager.tsx`: Standardized all queue payment badge amounts and history entries to use the unified `inr()` formatter, eliminating duplicate "₹ ₹" currency symbol issues.
