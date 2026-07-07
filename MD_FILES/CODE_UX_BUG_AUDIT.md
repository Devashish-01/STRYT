# STRYT code-based UX, bug, and error audit

Date: 2026-07-07

Scope: this report is based on the current application code only. Workflow documents were intentionally skipped because they are outdated.

## Summary

The native notch/status-bar issue was real. The app was configuring the native Capacitor status bar color, but the WebView could still draw into the status-bar region and several custom floating surfaces did not account for device safe areas. This pass fixes the main safe-area problems in the native shell, app bars, bottom nav, map overlays, and the most important custom bottom sheets.

The highest product risks were not visual polish issues. They were discovery radius correctness, push-notification delivery dependency on database trigger configuration, onboarding/schema rollout safety, and location/error states that could tell users an action succeeded even when persistence failed. The app-code portions are now fixed or hardened; database-enforced guarantees are prepared in migrations for the owner to run manually.

## Resolution update

Status as of this pass: native safe-area UI is fixed in app code; discovery now intersects the viewer radius with each listing's own service/broadcast radius in app code; onboarding routing is defensive for older schemas; location permission no longer marks prompts as seen on mount and no longer fakes success after failed persistence; unread notification count failures preserve the previous badge instead of becoming zero; provider appointment payment verification now has a real confirm/reject UI; appointment photo preview object URLs are lifecycle-managed.

Database-only guardrails prepared but not run: `supabase/migrations/20260801_code_audit_guardrails.sql` adds nearby RPC enforcement, server-side appointment daily-limit enforcement, server-side proposal responder ownership enforcement, and a push-trigger health-check function. Per owner instruction, this migration was not applied.

## Fixed in this pass

### Native status bar and notch overlap

Severity: high

Evidence: `src/App.tsx` now calls `StatusBar.setOverlaysWebView({ overlay: false })` during native boot. `src/index.css` defines `--safe-area-top` and `--safe-area-bottom`; `.appbar`, `.bottom-nav`, `.with-nav`, and `.sheet` consume those variables.

User impact before fix: on native builds, the app could visually collide with the Android/iOS status bar or look like it was using the notch as content space. This makes the app feel unpolished and harder to trust.

Status: fixed in current working tree.

### Map controls were not safe-area aware

Severity: medium

Evidence: `src/screens/MapView/SearchBar.tsx`, `src/screens/MapView/LayerToggles.tsx`, and `src/screens/MapView/RadiusStrip.tsx` now offset their absolute top/bottom positioning with `env(safe-area-inset-top, 0px)` or `env(safe-area-inset-bottom, 0px)`.

User impact before fix: map search, layer chips, and radius controls could sit too close to the status bar or gesture area on native devices.

Status: fixed in current working tree.

### Custom payment and booking sheets bypassed shared sheet spacing

Severity: medium

Evidence: `src/components/AppointmentSheet.tsx`, `src/components/PaymentSheet.tsx`, `src/components/QueuePaymentSheet.tsx`, `src/components/DealUpiSheet.tsx`, and `src/components/LocationPickerSheet.tsx` now add safe-area-aware bottom padding. `src/screens/ProfileEdit.tsx` now uses a fallback in `env(safe-area-inset-bottom, 0px)`.

User impact before fix: primary CTAs such as payment confirmation, booking confirmation, and save actions could sit too close to the native gesture area.

Status: fixed in current working tree for the major custom sheets found.

## Issue resolution ledger

### 1. Discovery ignores provider and business work-area radius by default

Severity: critical

Evidence: `src/services/marketplace/discoveryService.ts:35` defines `GLOBAL_RADIUS_KM = 20000`. `listBusinesses` and `listProviders` use `explicitRadius ?? GLOBAL_RADIUS_KM` at `src/services/marketplace/discoveryService.ts:50` and `src/services/marketplace/discoveryService.ts:91`. The result filtering only applies when the viewer passes an explicit radius at `src/services/marketplace/discoveryService.ts:60`, `src/services/marketplace/discoveryService.ts:73`, `src/services/marketplace/discoveryService.ts:101`, and `src/services/marketplace/discoveryService.ts:114`.

User impact: if a viewer does not set a radius filter, providers and businesses can appear far outside their actual service/work area. This can create bad leads, irrelevant results, and a feeling that local discovery is broken.

Recommended fix: add a default service-area filter based on each row's service radius field, while still allowing an explicit viewer radius to narrow the results further. The RPC should ideally return only entities where distance is within the entity's service radius and within the viewer-selected radius when present.

Status: app-code fixed in `src/services/marketplace/discoveryService.ts`; database RPC enforcement prepared in `supabase/migrations/20260801_code_audit_guardrails.sql`.

### 2. Push delivery now depends fully on database trigger deployment and secrets

Severity: critical

Evidence: `src/services/engagement/notificationService.ts` inserts notification rows and relies on the database trigger added in `supabase/migrations/20260731_push_on_every_notification.sql`. The migration comments require `app.settings.supabase_url` and `app.settings.service_role_key` to be set for `send-push` calls.

User impact: if the migration is not applied, `pg_net` is unavailable, or the database GUC secrets are missing, in-app notifications may still be created but OS push notifications silently stop. This is especially risky because users will not know they are missing urgent messages.

Recommended fix: add an explicit deployment check or health check for the notification trigger path. At minimum, surface a clear admin warning when trigger config is missing. Consider keeping a safe server-side fallback path until the trigger health is verified in production.

Status: database health-check function prepared in `supabase/migrations/20260801_code_audit_guardrails.sql`. The existing trigger migration and required Supabase database settings still need to be applied/configured manually.

### 3. Onboarding completion depends on database schema rollout

Severity: high

Evidence: `src/App.tsx` routes users through onboarding when `!user.onboardingCompletedAt`. `src/services/core/userService.ts:100` selects `onboarding_completed_at`. The required migration is `supabase/migrations/20260730_onboarding_completed_flag.sql`.

User impact: if the app ships before the database migration is applied everywhere, user profile loads can fail or first-login routing can behave incorrectly. This can block users from entering the app.

Recommended fix: verify the migration is deployed before release. Add a defensive fallback path for older schemas, or gate the app release on a schema-version check.

Status: app-code hardened in `src/App.tsx` by only forcing onboarding when `onboardingCompletedAt === null`, so missing older-schema data does not trap users. The onboarding migration still needs to be run for account-level first-login behavior.

### 4. Location permission screen marks the prompt as seen before the user acts

Severity: high

Evidence: `src/screens/auth/LocationPermission.tsx:17` writes `localStorage.setItem("locationPromptShown", "true")` on screen mount. That happens before the user allows, denies, skips, or successfully saves location.

User impact: if the user lands on the screen and exits, reloads, or hits an error before making a choice, the app can stop showing the location prompt even though the user never completed it.

Recommended fix: move the `locationPromptShown` write into the explicit success, deny, and skip branches. Do not mark it seen on mount.

Status: fixed in `src/screens/auth/LocationPermission.tsx`.

### 5. Location permission success can be shown even when saving location fails

Severity: high

Evidence: `src/screens/auth/LocationPermission.tsx:31` calls `userService.setLocation(...)`, but failures are caught and ignored before the app shows success UI and navigates home.

User impact: a user can see a "location set" experience while their profile location remains unchanged. Local discovery then appears wrong, which feels like a map/feed bug even though the root cause is persistence failure.

Recommended fix: match the newer `LocationPickerSheet` behavior: if GPS succeeds but saving fails, show a retryable error and do not navigate as if setup succeeded.

Status: fixed in `src/screens/auth/LocationPermission.tsx`.

### 6. Appointment daily limit is enforced client-side and can race

Severity: high

Evidence: `src/services/engagement/appointmentService.ts:149` defines `DAILY_APPOINTMENT_LIMIT = 5`, counts existing rows, and then inserts. `src/components/AppointmentSheet.tsx:121` mirrors this in the UI.

User impact: two devices or two fast requests can pass the client-side count and create more appointments than allowed. The UI then promises a limit that the backend may not enforce.

Recommended fix: enforce the daily limit in a database transaction, RPC, or constraint-like trigger. Keep the UI check for fast feedback, but do not rely on it for correctness.

Status: database trigger prepared in `supabase/migrations/20260801_code_audit_guardrails.sql`. Existing client-side fast feedback remains.

### 7. Payment status UI is not consistently reused outside agreements

Severity: medium

Evidence: `src/components/PaymentStatusCard.tsx` exists, but current usage found is `src/screens/requests/AgreementScreen.tsx:730`. Appointment and queue flows still use their own payment sheets and scattered status treatment.

User impact: users can see different wording and confidence levels for payment state depending on whether they are in an agreement, appointment, or queue. Payment trust UX should be more consistent than normal content UI.

Recommended fix: reuse a shared payment status component across agreements, appointments, and queues. It should show who claimed payment, who must confirm next, amount, method, and failure/timeout states in one consistent pattern.

Status: provider appointment verification gap fixed with `PaymentStatusCard` in `src/screens/provider/manage/ProviderLeads.tsx`. Agreement already used the shared component. Business appointment and queue surfaces already had functional confirm/reject/status UI, but still have some custom presentation and can be visually consolidated later.

### 8. Notification unread count hides backend errors as zero

Severity: medium

Evidence: `src/services/engagement/notificationService.ts:43` exposes `getUnreadCount()`. The store consumes it in `src/store.tsx:213`.

User impact: if unread-count loading fails, users can see no badge instead of an error or stale indicator. That makes notification failures invisible and can cause missed requests.

Recommended fix: return an error state separately from a count, or keep the previous known count when refresh fails. The UI can show a small degraded-state indicator instead of silently showing zero.

Status: fixed in `src/store.tsx`; unread-count refresh errors now preserve the existing badge count.

### 9. Proposal responder identity relies heavily on client-side checks

Severity: medium

Evidence: proposal creation lives in `src/services/engagement/requestService.ts`. The app validates responder context client-side before writing proposal data.

User impact: if a bad or stale client supplies the wrong responder entity, sent-proposal state can become confusing, and ownership rules rely on client behavior unless matching RLS/RPC validation exists.

Recommended fix: enforce responder ownership in the database or an RPC. The client should still validate for UX, but the backend should be the source of truth.

Status: database trigger prepared in `supabase/migrations/20260801_code_audit_guardrails.sql`; existing client-side validation remains.

### 10. Queue join correctness depends on migration being deployed

Severity: medium

Evidence: queue join open-state protection is represented by `supabase/migrations/20260729_queue_join_requires_open.sql`, while client code also checks queue state.

User impact: if the migration is not deployed, users may be able to join a closed queue through stale clients or direct API calls. This causes support pain for businesses because they must handle invalid tokens.

Recommended fix: confirm the migration is applied in every environment. Add a smoke test that tries to join a closed queue and expects database rejection.

Status: existing migration `supabase/migrations/20260729_queue_join_requires_open.sql` covers this. It still needs to be run manually if not already applied.

### 11. Location UX is inconsistent across app surfaces

Severity: medium

Evidence: location can be set from `src/screens/auth/LocationPermission.tsx`, `src/components/LocationPickerSheet.tsx`, `src/screens/MapView/SearchBar.tsx`, `src/screens/MapView/MapControllers.tsx`, `src/screens/MapView/useLocationPinDrop.ts`, and `src/screens/Explore.tsx`.

User impact: users may see different language, different error handling, and different fallback behavior depending on where they set location. This creates the feeling that "the app does not remember my area" even when individual screens are technically working.

Recommended fix: centralize location save UX into one service/helper that handles GPS success, reverse geocode failure, database save failure, local state refresh, and toast copy consistently.

Status: the highest-risk onboarding permission path is fixed. Full centralization across every map/explore/profile location surface remains a follow-up refactor, not a blocking correctness bug.

### 12. Payment sheets contain native deep links but no app-return verification loop

Severity: medium

Evidence: `src/components/PaymentSheet.tsx`, `src/components/QueuePaymentSheet.tsx`, and `src/components/DealUpiSheet.tsx` open UPI links and then rely on the user tapping "I have paid" or a deal-level equivalent.

User impact: after jumping to a UPI app, users may return unsure whether STRYT recorded anything. This can lead to duplicate payment attempts or abandoned claims.

Recommended fix: add a clear post-return state and reminder: "After payment, return here and tap I have paid." If possible, listen for app resume and focus the claim action.

Status: payment sheets already instruct users to tap the paid confirmation after external payment. Deeper native app-resume handling remains optional polish.

### 13. Appointment image preview object URLs are not fully lifecycle-managed

Severity: low

Evidence: `src/components/AppointmentSheet.tsx` creates `URL.createObjectURL(file)` in `handlePhotoSelect` and revokes it only in `removePhoto`.

User impact: selecting multiple photos or closing the sheet without removing the photo can leave object URLs in memory for the session. This is low severity, but easy to clean up.

Recommended fix: revoke the old preview before replacing it, and revoke the current preview in a cleanup effect on unmount.

Status: fixed in `src/components/AppointmentSheet.tsx`.

### 14. Build verification is slow enough to mask failures in normal iteration

Severity: medium

Evidence: `npm.cmd run lint` completed successfully. `npm.cmd run build` passed the color guard and TypeScript build, entered `vite build`, and timed out after 300 seconds during transform.

User impact: when production builds exceed normal local timeouts, regressions can hide until CI or release time. Developers may assume a change is verified when only TypeScript was actually verified.

Recommended fix: profile Vite build time, check whether service worker/bundle plugins are slowing transform, and add a CI build timeout that is high enough to complete but low enough to catch pathological hangs.

## Verification performed

`node scripts/check-hardcoded-colors.js` passed.

`git diff --check` passed after removing trailing whitespace.

`npm.cmd run lint` passed. This runs the hardcoded-color guard and `tsc --noEmit`.

`npm.cmd run build` progressed through the app build and service-worker transform, then failed with `EPERM: operation not permitted, open 'D:\zetax\name\STRYT\dist\sw.mjs'`. This appears to be a Windows/generated-output write-permission or file-lock issue, not a TypeScript compile failure. Native device/emulator visual QA was not run in this pass.

## Manual migration run list

Run these manually at the end, in order, if they have not already been applied in the target Supabase project: `supabase/migrations/20260729_queue_join_requires_open.sql`, `supabase/migrations/20260730_onboarding_completed_flag.sql`, `supabase/migrations/20260731_push_on_every_notification.sql`, and `supabase/migrations/20260801_code_audit_guardrails.sql`.

After `20260731_push_on_every_notification.sql`, also set the database settings documented inside that migration: `app.settings.functions_url` and `app.settings.service_role_key`. After `20260801_code_audit_guardrails.sql`, call `select * from public.notification_push_health();` in SQL editor to confirm the push trigger prerequisites are configured.
