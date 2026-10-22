# STRYT — Change Requests (implementation backlog)

## Group REORG — ad-hoc (2026-07-04) ✅ IMPLEMENTED
### Codebase reorganization, Priorities 0–4 ✅
Full plan in `REORGANIZATION_PLAN.md` (repo root) — implemented one priority
tier at a time, `tsc`/`build` verified after each:
- **P0:** untracked `tsconfig.tsbuildinfo` (build artifact, was committed);
  moved 7 loose debug/admin scripts from the repo root into `scripts/`
  (fixed their `.env` path resolution and `.mcp.json`'s reference to
  `supabase_mcp_wrapper.js` accordingly); deleted 2 exact-duplicate docs and
  1 stale duplicate (`MD_FILES/ISSUES.md`, hours out of date) sitting
  alongside the real ones; archived 5 pre-session design docs into
  `MD_FILES/archive/` after verifying each against the current codebase
  (2 confirmed implemented, 2 confirmed stale/superseded by this session's
  own audits, 1 superseded by the new reorg plan) — kept
  `optional_onboarding_design.md` un-archived since it's genuinely still
  open (`generateAlias()` exists with zero callers).
- **P1:** moved 21 loose, undated `.sql` files (plus 7 coupled runner/test
  scripts and the original setup `README.md`) into `supabase/legacy/` —
  `supabase/migrations/` is now unambiguously the only place schema changes
  go. This exact loose-vs-dated split was the root cause behind multiple
  "schema drift" bugs this session, including the `society_members`
  infinite-recursion outage (`ISS-F13`). New `supabase/README.md` explains
  the current layout.
- **P2:** flattened the single-file `screens/manage/` into `screens/ManageHub.tsx`
  (was colliding, in name only, with `screens/business/manage/` and
  `screens/provider/manage/`); moved `BusinessProUpgrade.tsx` and
  `Promote.tsx` into `screens/future-enhancement/` to join their already-shelved
  siblings — both were dead-but-left-behind from earlier fixes this session
  (`ISS-F12`, `ISS-F11`).
- **P3:** split `types.ts` (676 lines, every domain type in one file) into
  `types/{marketplace,requests,chat,user,social,console}.ts` +
  `types/index.ts` as a barrel (`export * from "./..."`) — every existing
  `@/types` import in the app resolves unchanged; verified via `tsc` showing
  zero new errors and a byte-identical build output hash.
- **P4:** the 3 higher-risk items, done as their own pass with `tsc`/`build`
  verified after each sub-item.
  - **`services/` grouping (25 flat files):** grouped into `services/{core,marketplace,engagement}/`
    (10/5/10 files) via `git mv`. Rewrote the `services/index.ts` barrel, fixed
    4 internal cross-group relative imports that broke on the move
    (`adminService`→`notificationService`, `requestService`→`leaderboardService`,
    `businessService`/`providerService`→`appointmentService`), then found and
    fixed all **28 direct (non-barrel) `@/services/xxxService` import sites**
    across ~20 files that bypassed the barrel — not anticipated from the plan,
    which assumed barrel-only usage based on the `types.ts` precedent.
  - **`store.tsx` (751 lines):** kept `useApp()`/`AppState` as the single,
    byte-identical public surface per the plan's explicit constraint — no new
    hooks, zero consumer call-site changes (89 files import `@/store`, only
    `useApp`/`AppProvider` are consumed externally, confirmed by grep before
    touching anything). Internally split into `src/store/{useToast,useAuthSession,
    useSocialSlice,useCommerceSlice,useNotificationBadges}.ts` — each a real
    custom hook owning its own `useState`/`useCallback`s (valid, since React
    tracks hook state by call order, not by which function textually contains
    the `useState`). Cross-cutting logic that touches multiple slices at once
    (`hydratePersonalData`'s single batched `Promise.all`, `refreshUser`,
    `signOut`) stayed in `AppProvider`, calling the slices' exposed setters
    directly — same setter identities, so no behavior change. `AppProvider`
    now composes 5 hooks + ~90 lines of identity/context state instead of one
    750-line body.
  - **`MapView.tsx` (1053 lines, largest file in the app):** split into
    `screens/MapView/{mapIcons.ts,MapControllers.tsx,SearchBar.tsx,
    LayerToggles.tsx,RadiusStrip.tsx,MapMarkers.tsx,NearbySheet.tsx,index.tsx}`.
    Each Leaflet-map-adjacent piece (radius fly-to, GPS recenter, long-press-to-set-location)
    became its own controller component; the search bar, layer/avail-only
    toggles, and the bottom radius strip (with its own custom-km input) became
    self-contained components owning their own local state; marker rendering
    and the "Nearby on your Street" tab sheet each became one component taking
    the already-filtered lists as props. `MapView/index.tsx` kept only the
    data-fetching (`useQuery` ×4), filtering, and layout composition — down
    from 1053 lines to ~210. `App.tsx`'s `import("./screens/MapView")` resolves
    unchanged to the new `index.tsx`.
- **Files:** ~60 files moved/renamed (git-tracked as renames) in P0–P3; P4 adds
  7 new `services/{core,marketplace,engagement}/` folders (no new files, pure
  `git mv`), 5 new `src/store/*.ts` files, 8 new `src/screens/MapView/*` files
  (replacing the 1 flat `MapView.tsx`); 7 new `types/*.ts` files, 1 deleted
  `types.ts`, new `scripts/README`-equivalent context in `.gitignore`/`.mcp.json`,
  new `supabase/README.md` and `MD_FILES/archive/README.md`. No migration
  needed for any of P0–P4 — zero database changes.

## Group AUDIT-CLEANUP — ad-hoc (2026-07-03) ✅ IMPLEMENTED
### Full pass over the hardcoded-values / dead-code / should-be-live audit ✅
Worked the three-category audit list one problem at a time, own judgment on scope per item:
- **Dead code:** deleted `UserOnboard copy.tsx`, `src/lib/alias.ts`, `uploadService.sign()`, `socialService.queue()` (zero callers each). Removed unused exported types `FeedItem`/`SavedList`/`NotifySub`/`SosAlert`/`TrackingToken` and the unused `CategoryKind` import in `catalogService.ts`. `BusinessSettings.tsx`'s Team card now shows an honest "not available yet" empty state instead of a permanently-empty list behind a working-looking "Invite" button. Left `Promote.tsx`/`Reservations.tsx`/`PhotosManager.tsx`/`StoryComposer.tsx`/`LoyaltySetup.tsx` alone — routed-but-unlinked is a deliberate, already-commented decision, not an accident.
- **Hardcoded values:** new `src/lib/placeholders.ts` (6 named constants replacing 10 duplicated Unsplash URLs across 6 files). New `src/lib/badges.ts` centralizing all three badge/achievement threshold systems — fixed the real bug: "Trusted" meant 5 vouches in one system and 10 ratings in another; renamed the profile-chip one to "Well Vouched" to remove the collision. New `functionUrl()` helper in `config.ts`, replacing 14 hand-built Edge Function URLs across 8 files (2 of which had a duplicate `create-razorpay-order` builder). Added `--amber-500`/`--orange-500` CSS tokens and swept all 7 raw hex-color literals (~150 occurrences across ~90 files) to `var(--token)` form. Fixed 2 stale "arrives in V3" copy sites.
- **Should be live:** migration `20260711_realtime_publication_gaps.sql` adds `conversations`, `notifications`, `post_comments`, `business_qna`, `ratings`, `proposals`, `society_members`, `gate_passes`, `vouches`, `endorsements`, `providers`, `businesses`, `categories`, `reports`, `bug_reports`, `provider_verifications` to the realtime publication, plus re-creates `get_leaderboard()` to expose a real `target_id`. Switched one-shot `useQuery` to `useQueryWithRealtime` in: `ConversationList`, `Notifications`, `CommunityPostDetail` (post + comments), `RequestDetail` (added a second subscription for `proposals`, since it's a separate table from `requests`), `BusinessDetail`/`ProviderDetail` (reviews/Q&A/posts/vouches/endorsements), `AvailableNow`, `ReviewsManager`, `QnaManager`, `SocietyScreen` (gate passes + pending members), and 5 `AdminPanel` tabs (Queue/Reports/Bugs/KYC/Disputes). `store.tsx`'s `chatUnread` is now populated on login (was stuck at 0 all session) and both global unread badges (`unread`, `chatUnread`) update live via a new realtime channel instead of freezing at hydrate-time.
- **Logic bugs found along the way:** Leaderboard row clicks always routed to hardcoded `/u/u1` regardless of which entry was tapped — RPC now returns a real `target_id`. `Achievements.tsx` had two 100%-fabricated badges ("5-week streak", "Level 4") with zero backing computation, mixed in with real computed ones — replaced with a real unlocked-count badge.
- **Files:** touches ~110 files; full list not enumerated here — see the diff. Migration: `supabase/migrations/20260711_realtime_publication_gaps.sql`.
- **Migration needed:** `supabase/migrations/20260711_realtime_publication_gaps.sql` (run manually in SQL editor)

### Follow-up: the 3 deferred items, done properly ✅
- **`Stories.tsx` viewer realtime:** added a second realtime channel scoped to `story_views` filtered by `story_id`, alongside the existing manual fetch — new viewers now appear live while the owner has the viewer sheet open, same pattern as `RequestDetail.tsx`'s extra `proposals` subscription.
- **Real team-members feature:** new `business_team_members` table (name, phone, avatar, role, owner-only RLS) replaces the `team()`-style permanent stub. `BusinessSettings.tsx` now has a real add-member form (name, phone, Staff/Manager role) and a remove button per row, live via `useQueryWithRealtime`. Deliberately scoped as a roster only — no login/permission grant, since the original UI never implied one and building real multi-user access control safely would mean touching RLS across most of the business-management surface.
- **UI/UX pass — got real visual verification, not guesses:** no saved Playwright session existed in this environment (`.auth/session.json` absent, no test credentials available), so authenticated screens (Home, Profile, BusinessDetail, every manage console) stayed unreachable. What *was* reachable: the app's top-level `!isAuthed` gate (`App.tsx`) shows the Splash/Welcome screen for literally any route when logged out — including `/business/b1`. Wrote a one-off Playwright script, screenshotted it, and found a real bug: `Splash.tsx`'s content block used `flex: 1` with short content, dumping ~40% of the screen as dead space between the feature list and the "Get started" button. Fixed with `justify-content: center` + increased internal rhythm (feature-row gap 12→28, header spacing bumped), re-screenshotted, confirmed the dead space is gone. This is the one piece of "feel more arranged" that could actually be verified end-to-end rather than asserted.
- **Files:** `Stories.tsx`, `businessService.ts`, `BusinessSettings.tsx`, `Splash.tsx`, migration `20260711_realtime_publication_gaps.sql` (extended with `story_views` + `business_team_members`).
- **Still open, and why:** everything past the login screen. Fixing this for real needs either the user running `npm run audit:login` once (interactive — needs a real account/OTP this environment doesn't have) so a screenshot pass can reuse that session, or the user pointing at specific screens/screenshots that feel cramped so targeted fixes can be made and verified the same way the splash screen was.

---


> **How to use:** each task has a stable ID (e.g. `BP-1`). Give me one ID at a time; I implement just that,
> run `npx tsc --noEmit` + `npm run build`, and tick it here. Tasks are **grouped by shared files** and
> ordered so sequential work touches the same files back-to-back = minimal churn / minimal re-reads.
> See `CODEBASE_MAP.md` for where everything lives.
>
> Legend: 🟡 = partly done in earlier sessions (verify + finish) · 🆕 = needs a DB migration.

## Group ADMIN-AUTH — ad-hoc (2026-07-02) ✅ IMPLEMENTED
### Real admin ID/password login, changeable only from the admin console ✅
- **Was:** `AdminPanel.tsx` gated access via `user.roles.includes("admin")` OR a shared `VITE_ADMIN_BYPASS_TOKEN` env value typed into a plaintext input and cached in `localStorage` — a static shared secret, not real authentication, and anyone who learned the token got permanent access from any device.
- **Fix:** admin identity now rides on real Supabase Auth (the same password hashing/verification already backing customer email+password login) — no custom password storage anywhere. New `/admin/login` screen takes an "Admin ID" + password; the ID resolves to the underlying auth email via `resolve_admin_email()`, a SECURITY DEFINER function that can only ever return an email for a row *already* tagged `admin` (can't be used to harvest arbitrary user emails). First-time bootstrap is self-service: `claim_first_admin()` lets the current signed-in user grant themselves the admin role, but only while zero admins exist anywhere — it permanently refuses once the first admin exists, so it can't be replayed to mint extra admins. Both the login ID and password are changeable only from a new "Account" tab inside the admin console itself (`set_admin_login_id()` is self-only + uniqueness-checked; password change is a direct `supabase.auth.updateUser()` call). The old bypass-token UI is removed from `AdminPanel.tsx`.
- **Bootstrap steps (first login = ID "admin" / password "Admin"):** ① run the migration. ② In the app, create an account via email+password (Email tab → "Use password instead" → "Create account") using a real email you control, password `Admin`. ③ Confirm the account if your Supabase project requires email confirmation. ④ Visit `/admin` while signed into that account → "Claim first-admin access (one-time)" → sets the login ID to `admin`. From then on, sign in directly at `/admin/login` with ID `admin` / password `Admin`, and change either from the new Account tab.
- **Note:** `VITE_ADMIN_BYPASS_TOKEN` is no longer read by the app — safe to remove from `.env`/Vercel once the new login is verified working, since it granted access with zero real authentication.
- **Files:** migration `20260709_admin_auth.sql`, new `src/lib/adminAuth.ts`, `adminService.ts`, new `src/screens/admin/AdminLogin.tsx`, `AdminPanel.tsx`, `App.tsx` (route).
- **Migration needed:** `supabase/migrations/20260709_admin_auth.sql` (run manually in SQL editor)

---

## Group CATALOG-CHECKOUT — ad-hoc (2026-07-02) ✅ IMPLEMENTED
### Cart checkout reuses the appointment booking + payment flow ✅
- **Was:** `BusinessDetail.tsx`'s cart "Next" button was a stub toast ("Checkout & in-app pay arrive in V3 — call the shop to order!") — no real checkout existed.
- **Fix:** Checkout now opens the same `AppointmentSheet` used by "Book appointment" — cart contents become a single locked package (itemized list in the pre-filled, editable notes field), customer picks a pickup slot, then pays via the existing UPI/Cash `PaymentSheet` flow exactly like an appointment. Cart clears only on a successful checkout booking (not on unrelated appointment bookings). `AppointmentSheet` gained an `initialNotes` prop to support this. Providers have no cart/catalog, so their existing "Book now" already provided this same parity — no change needed there.
- **Files:** `AppointmentSheet.tsx`, `BusinessDetail.tsx`. No migration.

---

## Group AUTH+BUG — ad-hoc (2026-07-02) ✅ IMPLEMENTED
### Bug reports tagged by reporter role, admin-visible ✅
- **Was:** `bug_reports` write-only — no RLS select policy existed (`rls.sql`: "read access is restricted for security"), so even admins couldn't read submitted reports back. No role tagging.
- **Fix:** `reporter_role` column (CUSTOMER/BUSINESS/PROVIDER, defaults from the reporter's active app role). Admin-scoped SELECT+UPDATE RLS added for `bug_reports`+`support_tickets` (same "no read policy" bug existed on both). `Support.tsx` bug tab gained a role selector. New AdminPanel "Bugs" tab: role-filter chips, dismiss/resolve actions.
- **Files:** migration `20260707_bug_report_roles.sql`, `supportService.ts`, `Support.tsx`, `adminService.ts`, `AdminPanel.tsx`.
- **Migration needed:** `supabase/migrations/20260707_bug_report_roles.sql` (run manually)

### Email + password login ✅
- **Was:** email tab only sent an OTP (magic-code) — no password option even though Supabase's email/password provider is now configured.
- **Fix:** `authService.signInWithPassword`/`signUpWithPassword`. Email tab on `PhoneEntry.tsx` gained a "Use password instead" toggle (sign-in/create-account), same post-auth flow as OTP (`signIn()` + `returnTo.consume()`). Handles the email-confirmation-required case (no session yet → toast to check inbox).
- **Files:** `authService.ts`, `PhoneEntry.tsx`. No migration (uses Supabase Auth directly).

---

## Recommended order (why)
1. **Group BP + BIZ** first — they pile onto the *same* files (`businessService`, `ManageDashboard`, `ManageNav`, `BusinessDetail`, `AppointmentSheet`, `appointmentService`). Doing them together avoids re-touching those files 5×.
2. **Group COM** (community posting) — isolated to compose + community service.
3. **Group CUST** (identity/profile/privacy/followers) — shares `Profile`, `PublicProfile`, `UserOnboard`, `userService`, `store`.
4. **Group Q** (queues) — mostly new screen + store + `businessService` queue methods.
5. **Group UI** (public-profile polish) — pure `BusinessDetail`/`ProviderDetail` styling, do after their logic is final so you polish once.
6. **GEN-1** (notifications) — standalone.

---

## Group BIZ+BP — seller parity (business ⇄ provider)
*Shared files: `src/services/businessService.ts`, `src/services/appointmentService.ts`, `src/screens/business/manage/{ManageDashboard,ManageNav,HoursEditor,BusinessAppointments}.tsx`, `src/screens/business/BusinessDetail.tsx`, `src/components/AppointmentSheet.tsx`, `src/screens/provider/ProviderDetail.tsx`.*

### BIZ-1 — Business online/offline toggle on the profile (like provider) [x]
- **Goal:** a shop open/closed presence toggle that the owner flips, shown the provider way.
- **Now:** an "Open right now" toggle exists in `HoursEditor` (added earlier). Provider surfaces it on `ProviderAvailability` **and** its dashboard.
- **Do:** surface the same toggle prominently — a quick toggle on `ManageDashboard` (business console home), reading/writing `businessService.setAvailability` + `is_available_now`/`available_until`. Confirm `BusinessDetail` pill already reflects it (it does).
- **Files:** `ManageDashboard.tsx` (+ maybe a small `businessService` read). No migration (columns exist).

### BIZ-3 — Business Hours tab = provider Availability screen 🟡
- **Goal:** the business Hours editor should look/behave like `ProviderAvailability` (presence toggle on top + working-hour range + slot duration).
- **Now:** `HoursEditor` has the toggle + per-day grid.
- **Do:** align layout/labels with `ProviderAvailability` so they feel identical (keep per-day grid as the richer option, per earlier decision).
- **Files:** `src/screens/business/manage/HoursEditor.tsx` only.

### BIZ-2 — Business packages (create + show) like provider 🆕
- **Goal:** businesses define real service **packages** (name, desc, price, duration) shown on the public page and selectable at booking — exactly like provider packages.
- **Now:** provider has `provider_packages` + `ProviderPackages` screen; booking maps them in. Business currently fakes "packages" from catalog items in `AppointmentSheet`.
- **Do:** add `business_packages` table (mirror `provider_packages`); `businessService.packages/addPackage/deletePackage`; a `BusinessPackages` manage screen (clone `ProviderPackages.tsx`) + route + dashboard tile; show packages on `BusinessDetail`; feed them into `AppointmentSheet` instead of catalog.
- **Files:** new migration, `businessService.ts`, new `BusinessPackages.tsx`, `App.tsx` route, `ManageDashboard.tsx` tile, `BusinessDetail.tsx`, `types.ts`.

### BIZ-4 — Appointment button in footer (replaces Promote) 🟡
- **Goal:** where Promote was, show an "Appointments" entry to see all bookings.
- **Now:** `ManageNav` bottom tab already swapped Promote→Appointments; `BusinessAppointments` screen exists.
- **Do:** verify the footer/nav on all business screens shows Appointments and no Promote; ensure `BusinessDetail` owner view has the "View appointments" button (it does).
- **Files:** `ManageNav.tsx` (verify), `ManageDashboard.tsx`.

### BIZ-5 — Remove Promote from the business entirely 🟡
- **Goal:** no Promote anywhere in the business surface for now.
- **Now:** removed from `ManageNav`; the `/business/:id/manage/promote` route + `Promote.tsx` still exist.
- **Do:** remove/guard the route + any lingering links (dashboard, settings). Keep `Promote.tsx` file for later, just unreferenced.
- **Files:** `App.tsx` (route), grep for `promote` links.

### BP-2 — Owner can cancel an appointment with a note; customer sees it
- **Goal:** business/provider can **cancel** (not just accept/decline) a confirmed appointment with a reason; the customer sees the cancellation + note.
- **Now:** owners can Accept/Decline PENDING with a note (`ProviderLeads`, `BusinessAppointments`). No owner-side cancel of an ACCEPTED booking. `AppointmentStatus` already includes `CANCELLED`.
- **Do:** add a "Cancel with note" action on ACCEPTED rows in both owner consoles → `appointmentService.updateStatus(id,"CANCELLED",note)`; show the note on the customer card in `MyAppointments` (already renders REJECTED/response notes — extend to CANCELLED).
- **Files:** `BusinessAppointments.tsx`, `ProviderLeads.tsx`, `MyAppointments.tsx`. No migration.

---

## Group APT — Appointment Console 2.0 (owner timetable + cancel attribution) ✅ IMPLEMENTED
*Shipped session 2026-07-02. Migration: `supabase/migrations/20260703_appointment_console.sql` (run manually).*
*New shared components: `src/components/appointments/{DateStrip,DayTimetable,BlockSlotModal,WalkInModal}.tsx`. New service: `src/services/slotBlockService.ts`.*

**Not implemented (deferred, noted for a future session):**
- **Slot capacity** (multi-chair/parallel bookings per slot) — needs a real redesign of the booking-collision check in `generateWorkingSlots`, skipped to avoid destabilizing the core booking flow.
- **Day-summary share is text, not image** — "Copy day summary" copies a WhatsApp-ready text block (📅 date + line-per-booking + revenue) via clipboard instead of rendering a shareable image, to avoid adding a canvas/html-to-image dependency for a nice-to-have.

### APT-1 — "Cancelled by whom" attribution 🆕
- **Goal:** every cancelled appointment says WHO cancelled it — customer sees "Cancelled by you" vs "Cancelled by {shop}" vs "Auto-cancelled (no response)"; owner sees "Cancelled by customer" vs "Cancelled by you".
- **Now:** `status: CANCELLED` is anonymous. Three writers all look identical: customer cancel (`MyAppointments.cancel()`), owner cancel (owner consoles), and the new auto-cancel of stale PENDING bookings (`checkAndAutoCancelAppointments`).
- **Do:** add `cancelled_by TEXT` column (`'CUSTOMER' | 'OWNER' | 'SYSTEM'`); `updateStatus()` gains a `cancelledBy` arg; set it at all 3 call sites (+ reschedule auto-cancel in `MyAppointments.handleBooked` = CUSTOMER); render attribution banners on both sides. Bonus: owner console shows customer-cancelled rows dimmed with "Customer cancelled" instead of the generic gray badge.
- **Files:** migration, `types.ts`, `appointmentService.ts`, `MyAppointments.tsx`, `BusinessAppointments.tsx`, `ProviderLeads.tsx`.

### APT-2 — Owner blocks time slots ("can't take bookings 2–4 PM today") 🆕
- **Goal:** owner taps slots in their day timetable to block them; blocked slots disappear from the customer booking sheet. Whole-day block too ("closed this Sunday").
- **Do:** new `blocked_slots` table (`business_id/target_id`, `target_type`, `date` (YYYY-MM-DD), `time_label` nullable — NULL = whole day blocked, `reason` optional, unique index). `appointmentService.blockedSlots(targetId, date?)`, `blockSlot()`, `unblockSlot()`. Extend `generateWorkingSlots` to take `blockedSlots` and mark them unavailable. `AppointmentSheet` fetches blocked slots for the target alongside existing appointments.
- **Files:** migration (same file as APT-1), `availability.ts`, `appointmentService.ts`, `AppointmentSheet.tsx`, consumed by APT-3's timetable UI.

### APT-3 — BusinessAppointments redesign: day timetable + tabs + history
- **Goal:** turn the flat list into a real console:
  - **Tabs:** `Today` (live day view) · `Upcoming` · `History` · `Cancelled`.
  - **Today tab = vertical timetable:** every working-hour slot of the selected day rendered top-to-bottom; booked slots show the customer card inline (accept/decline/cancel/payment actions preserved); empty slots show "＋ tap to block"; blocked slots show 🚫 with "tap to unblock"; a "now" line marks current time.
  - **Date strip:** horizontally scrollable 14-day chips with per-day booking-count dots, so "history of the days with appointments" is scannable at a glance.
  - **Summary header:** "{n} booked · {n} pending · {n} blocked" for the selected day.
  - **History tab:** past appointments grouped by day (sticky day headers), COMPLETED/served vs no-show visible.
  - **Cancelled tab:** all cancelled/rejected with APT-1 attribution ("by customer" / "by you" / "auto").
- **Files:** `BusinessAppointments.tsx` (major rewrite), reuses APT-2 service methods; mirror later to `ProviderLeads.tsx` (APT-6).

### APT-4 — Realtime + auto-complete housekeeping
- **Goal:** console updates live; stale states self-heal.
- **Do:** switch `BusinessAppointments` + `ProviderLeads` to `useQueryWithRealtime` on `appointments` (closes ISS-004); auto-mark past ACCEPTED appointments as COMPLETED on load (mirror of the existing PENDING auto-cancel), so History fills itself.
- **Files:** `BusinessAppointments.tsx`, `ProviderLeads.tsx`, `appointmentService.ts`.

### APT-5 — Out-of-the-box extras (pick any)
- **Walk-in entry:** owner adds a manual appointment from the timetable's empty slot (name + phone) — paper-diary replacement, makes the timetable the single source of truth.
- **Recurring blocks:** "block 1–2 PM every day" (lunch) — `recurring` flag on `blocked_slots`.
- **Day revenue strip:** sum of confirmed `payment_amount` for the day shown in the summary header.
- **Share day sheet:** owner exports the day's timetable as an image/WhatsApp text ("Today's bookings: 10 AM Asha, 11:30 Rahul…").
- **No-show tracking:** owner marks a COMPLETED-due appointment as NO_SHOW; repeat no-show customers get a warning chip at booking review time (pairs with the payment fraud flags).
- **Slot capacity:** allow N parallel bookings per slot (multi-chair salon) — `capacity` in the hours config string.

### APT-6 — Mirror the console to providers
- **Goal:** `ProviderLeads` gets the same timetable/tabs treatment once APT-3 stabilizes on business.
- **Files:** `ProviderLeads.tsx`, shared components extracted from APT-3 (e.g. `components/AppointmentTimetable.tsx`).

---

## Group COM — universal Post-to-Community for sellers
### BP-1 — Business & provider post to community the same, universal way ✅ IMPLEMENTED
- **Goal:** one identical posting flow for both business and provider owners; posts attributed to the seller and reliably shown on their profile Posts tab. Business/provider get a distinct entry point from the regular customer compose flow, but share the same `CommunityCompose` UI — the resulting post visually differs to other users (a "🏪 Business"/"🔧 Provider" badge + colored avatar ring, vs. no badge for a regular member post).
- **Was:** `CommunityCompose` (`/community/new`) ignored the `businessId/businessName` route state `ManageDashboard` passed — always posted as the individual user. Provider had no community-post entry at all.
- **Fix:** `community_posts` gained `author_type` (`'user'|'business'|'provider'`) + `author_ref_id` (nullable). `author_user_id` still always holds the real signed-in user (ownership/RLS unchanged) — `author_type`/`author_ref_id` only control the displayed identity. `CommunityCompose` now reads seller context from `location.state` via `useLocation()`, shows a non-editable "Posting as {name}" chip, and passes `authorType`/`authorRefId`/`authorName`/`authorAvatar` into `communityService.create()` (which now overrides the post's displayed name/avatar with the seller's when present). New `communityService.byAuthorRef(type, refId)` powers both profile Posts tabs precisely (only posts made *as* that business/provider, not the owner's unrelated personal posts) — `BusinessDetail`'s existing Posts tab switched to it, and a **new Posts tab was added to `ProviderDetail`** (it had none before) for parity. `ProviderDashboard` got a new "📣 Post to community" tile mirroring the business one. `CommunityCard` now shows the seller badge + ring.
- **Files:** new migration `20260704_community_seller_posts.sql`, `types.ts`, `communityService.ts`, `CommunityCompose.tsx`, `Community.tsx` (`CommunityCard`), `ManageDashboard.tsx`, `ProviderDashboard.tsx`, `BusinessDetail.tsx`, `ProviderDetail.tsx`.
- **Migration needed:** `supabase/migrations/20260704_community_seller_posts.sql` (run manually in SQL editor)

---

## Group CUST — customer identity, onboarding, profile, privacy, followers ✅ IMPLEMENTED
*Shipped session 2026-07-02. Migration: `supabase/migrations/20260705_privacy_and_followers.sql` (run manually).*
*New: `src/lib/publicName.ts` (`firstName()` helper), `src/screens/Followers.tsx` + `/followers` route.*

### CUST-6 — "You" page (`Profile.tsx`) redesign for scannability ✅
- **Goal:** ad-hoc follow-up request — the self-profile hub should feel easy to handle, with memorable buttons and low cognitive load.
- **Was:** "Agreements" appeared 3× (stat pill, feature tile, menu row); "Saved"/"Following" appeared as stat pills *and* again as a "Saved & following" menu row; header had 5 icon buttons crammed together (Share, account-switch, chat, bell, settings); "Admin console" was shown to every user regardless of role; 5 stacked list-card sections meant a lot of scrolling to compare options.
- **Fix:** removed every duplicate — stat pills are now the single source of truth for Saved/Following/Followers/Agreements. Header cut to 3 icons (Messages, Notifications, Settings) — Share moved next to the Edit/Public-profile buttons where it's contextually relevant, account-switching moved into the role-switcher card as a labeled link (its natural conceptual home). The old 3-tile "feature" row + "Activity & community" list merged into one 3×2 icon grid (Appointments, Requests, Community, Map, Badges, Heroes) — fixed spatial position across visits aids memorability more than a scrolling list does. "Admin console" now only renders for actual admins (role check mirrors `AdminPanel.tsx`'s own gate; its bypass-token entry screen is unaffected since it lives on `/admin` itself, not gated by this nav visibility). "Manage business & profile" only shows for users who actually own a business/provider.
- **Files:** `Profile.tsx` (full rewrite, same route/behavior contracts — no destinations removed, only deduplicated and regrouped).

### CUST-1 — Remove the customer "user id"/alias; first name is the identity ✅
- **Was:** customers had an editable `alias` shown in place of their real name across posts, comments, requests, proposals, story viewers, follow lists, and the public profile — required at onboarding with a live uniqueness check.
- **Fix:** `alias` fully retired from the app layer — removed from `CurrentUser`/`PublicUser` types, `USER_COLUMNS`, `userService.me()`'s backfill, `authService.ensureProfile()`'s seed, and `checkAliasUnique()` deleted outright. Every "alias-or-name" display site (`communityService.create/addComment`, `requestService` requester/responder names, `socialService.searchNeighbors`) now calls a new `firstName()` helper (`src/lib/publicName.ts`) instead — first name is the public identity everywhere. `src/lib/alias.ts` (the random-alias generator) is left in place but fully unreferenced, matching the codebase's existing pattern for retired files (e.g. `Promote.tsx`). The DB `alias` column itself is untouched (non-destructive) — just unused.
- **Also removed:** the alias-based admin-bypass-token branch in `AdminPanel.tsx` (phone + localStorage-token bypass still work).
- **Files:** `types.ts`, `authService.ts`, `userService.ts`, `UserOnboard.tsx`, `ProfileEdit.tsx`, `Profile.tsx`, `PublicProfile.tsx`, `Bookmarks.tsx`, `Stories.tsx`, `StoryCompose.tsx`, `AdminPanel.tsx`, `communityService.ts`, `requestService.ts`, `socialService.ts`, new `publicName.ts`.

### CUST-2 — First-time login → required setup form (rest optional) ✅
- **Was:** `UserOnboard` required both Name *and* Alias to continue (with a uniqueness debounce on alias); the router guard (`App.tsx`) only checked `name`, so the two gates could disagree.
- **Fix:** with alias gone, the required field collapsed to **Name only** — matches the router guard exactly (no more latent inconsistency). Area/neighborhood is explicitly labeled "(optional)" and stays skippable; "Skip for now" unchanged.
- **Files:** `UserOnboard.tsx` (alias removal covers this); `App.tsx` guard verified unchanged/correct, no edit needed.

### CUST-4 — Field-level privacy: hide chosen details from others ✅
- **Was:** `showPostsPublicly`/`showAsksPublicly`/`showBadgesPublicly` existed on the types and were read in `PublicProfile`, but `USER_COLUMNS` didn't include them — any toggle UI would have silently failed to save. No toggle UI existed anywhere. Only 3 fields, no phone/city/rating control.
- **Fix:** extended to 6 flags (`showPostsPublicly`, `showAsksPublicly`, `showBadgesPublicly`, `showPhonePublicly`, `showCityPublicly`, `showRatingPublicly`), all added to `USER_COLUMNS` so writes actually persist. New "Privacy" section in `ProfileEdit.tsx` with 6 toggle switches (saved together with the rest of the profile form). `PublicProfile.tsx` now gates city/rating/phone display client-side (`isSelf || flag !== false`) — same pattern as the existing posts/asks/badges gates, so the profile owner always sees their own full profile regardless of their privacy settings. Phone is now actually displayed on the public profile (tappable `tel:` link) for the first time, gated by the new flag — previously not shown at all, so the toggle would've had nothing to control.
- **Security fix bundled in:** `users` table's `update` RLS policy had no ownership check (`auth.role() = 'authenticated'` only — any signed-in user could write *any* user's row). Tightened to `id = auth.uid()::text`. Read stays public (unchanged).
- **Files:** migration `20260705_privacy_and_followers.sql`, `types.ts`, `userService.ts`, `ProfileEdit.tsx`, `PublicProfile.tsx`.

### CUST-5 — Followers on the "You" page ✅
- **Was:** `follows` RLS only allowed reading rows where `follower_user_id = auth.uid()` — a "who follows me" query returned zero rows for everyone, full stop. No followers UI existed.
- **Fix:** new additive RLS policy on `follows` allowing public read of `target_type = 'USER'` rows (matches the `users` table's existing public-read posture; the pre-existing "who do I follow" policy for BUSINESS/PROVIDER targets is untouched). New `socialService.followers(userId)` method. `Profile.tsx` gained a 4th stat pill ("Followers") linking to a new `/followers` screen (self-only list, avatar + first name, mirrors `Bookmarks.tsx`'s following-list style). `PublicProfile.tsx`'s stats row also gained a Followers count for parity.
- **Files:** migration (same file as CUST-4), `socialService.ts`, new `Followers.tsx` + `App.tsx` route, `Profile.tsx`, `PublicProfile.tsx`.

### CUST-3 — Enhance customer public profile UI/UX ✅
- **Was:** double name/alias display in the hero (both `publicProfile()`'s alias-substituted `name` *and* a separate `@{alias}` line rendered the same text twice); title bar also showed alias.
- **Fix:** resolved naturally by CUST-1 (single first-name header, no duplication); title bar now shows first name too. Stats row extended with Followers (CUST-5) and gated Rating (CUST-4). Phone line added to the hero, gated by privacy flag.
- **Files:** `PublicProfile.tsx` (folded into the CUST-1/4/5 edits above — no separate restyle pass needed since those tasks already touched every visible element this polish would have).

---

## Group Q — queues ✅ IMPLEMENTED
### Q-1 — "My Queues" dashboard: sortable, count, live position, history ✅
- **Was:** `store.queuesJoined` was local-only (in-memory, one browser, no cross-device sync); no "my queues across shops" read, no history, no leave capability. `queue_tokens` had no `LEFT` status — only WAITING/CALLED/SERVED.
- **Fix:** `businessService.myQueues()` — DB-authoritative (not dependent on local store state), joins `businesses(name, cover_image)`, computes live position per shop from WAITING tokens ordered by join time. New `leaveQueueToken()`. New `MyQueues.tsx` screen: Active/History tabs, sort-by-name toggle on Active, per-row Leave button. Conditional banner on `Profile.tsx` (only rendered when in ≥1 active queue) + a permanent "My queues" row in the Manage section (badge shows active count) so History stays reachable at 0 active.
- **Files:** migration `20260706_queues_and_notifications.sql`, `types.ts` (`MyQueueEntry`/`QueueTokenStatus`), `businessService.ts`, new `MyQueues.tsx` + `/queues` route, `Profile.tsx`.
- **Migration needed:** `supabase/migrations/20260706_queues_and_notifications.sql` (run manually — also covers GEN-1 below)

---

## Group UI — public profile polish (sellers) ✅ IMPLEMENTED
### UI-1 — Enhance business & provider public profile UI/UX ✅
- **Was:** `ProviderDetail`'s primary bottom-bar CTA ("Book now"/"Schedule Appointment") had no owner branch at all — a provider viewing their own public profile saw a booking button targeting themselves (Message was correctly hidden for self, booking wasn't). No `isOwner` was even computed. Visually flat compared to `BusinessDetail`: no hero photo (business has a 230px cover + gallery; provider was a plain gradient), and Call was buried in the fixed bottom bar only (business surfaces Call up top, near Share/Bookmark).
- **Fix:** added `isOwner` (`p.userId === user.id`); owners now see "View leads & appointments" → `/provider/:id/manage/leads` instead of a self-targeting booking button, and the tel:/Message buttons hide for self (matching `BusinessDetail`'s existing pattern exactly). Header background now uses the provider's first portfolio photo as a cover image (gradient overlay) when one exists, falling back to the plain gradient otherwise — closes the visual-richness gap with `BusinessDetail`'s cover. Added a Call icon button to the top icon row for parity with Business's Call/Share/Bookmark row.
- **Files:** `ProviderDetail.tsx`. (`BusinessDetail.tsx` reviewed — already owner-aware, no bug found there; left as-is.)

---

## Group GEN — general ✅ IMPLEMENTED
### GEN-1 — Notification "why am I getting this" flow is broken ✅
- **Investigation finding:** the notification *schema and rendering* were fine (`type`/`title`/`body`/`deep_link` all present, `Notifications.tsx` already renders a distinct icon per type). The actual bugs were in *creation*: (1) `adminService.ts`'s 3 calls to `notificationService.send`/`sendBulk` omitted the `type` argument, so approval/rejection/new-nearby-listing notifications all silently defaulted to generic `SYSTEM` — new-business/new-provider notifications rendered with the gray bell icon instead of their own dedicated Store/Briefcase icons despite those types already existing in the union. (2) `NEARBY_REQUEST` had a declared type + icon but **zero creation path anywhere** — posting a service request never notified nearby users. (3) The `notify_on_proposal`/`notify_on_agreement` DB triggers only existed in an untracked ad-hoc file (`supabase/migration_r8.sql`, not in `supabase/migrations/`) — unknown whether ever actually applied to the live DB (same schema-drift pattern as `alias`/`show_*_publicly` found earlier this project).
- **Fix:** `adminService.ts` now passes explicit types (`NEW_BUSINESS`/`NEW_PROVIDER` for nearby-listing broadcasts, `SYSTEM` for approval/rejection — made explicit rather than implicit-default). New migration re-applies the proposal/agreement triggers idempotently (safe no-op if already live) and adds a new `notify_on_request()` trigger — mirrors the same lat/lng bounding-box "nearby" technique already used client-side in `adminService.ts`, capped at 200 recipients.
- **Files:** migration `20260706_queues_and_notifications.sql` (same file as Q-1), `adminService.ts`.
- **Migration needed:** `supabase/migrations/20260706_queues_and_notifications.sql` (run manually in SQL editor)

---

## Quick index
| ID | Title | Migration? | Status |
|---|---|---|---|
| BIZ-1 | Business online/offline toggle on profile | no | ✅ |
| BIZ-3 | Business Hours = provider Availability UI | no | ✅ |
| BIZ-2 | Business packages like provider | 🆕 | ✅ (run 20260702_business_packages.sql) |
| BIZ-4 | Appointment button replaces Promote (footer) | no | ✅ |
| BIZ-5 | Remove Promote entirely | no | ✅ |
| BP-2 | Owner cancel appointment w/ note; customer sees | no | ✅ |
| UPI-1 | UPI payment flow (catalog→appt→pay→history) | 🆕 run 20260702_payment_system.sql | ✅ |
| APT-1 | Cancel attribution (by customer/owner/system) | 🆕 run 20260703_appointment_console.sql | ✅ |
| APT-2 | Owner blocks time slots (specific + recurring) | 🆕 (same migration) | ✅ |
| APT-3 | Owner console: day timetable + 4 tabs + history | no | ✅ |
| APT-4 | Realtime console + auto-complete past bookings | no | ✅ |
| APT-5 | Extras: walk-ins, recurring blocks, revenue strip, no-shows, day-summary share | 🆕 (same migration) | ✅ (slot capacity + image export not done — see notes) |
| APT-6 | Mirror console to ProviderLeads | no | ✅ |
| BP-1 | Universal seller post-to-community | 🆕 run 20260704_community_seller_posts.sql | ✅ |
| CUST-1 | Remove user-id/alias; first name is identity | no | ✅ |
| CUST-2 | First-login required setup form | no | ✅ |
| CUST-4 | Field-level profile privacy | 🆕 run 20260705_privacy_and_followers.sql | ✅ |
| CUST-5 | Followers on You page | 🆕 (same migration) | ✅ |
| CUST-3 | Enhance customer public profile UI | no | ✅ |
| CUST-6 | "You" page redesign for scannability | no | ✅ |
| Q-1 | My Queues dashboard + history | 🆕 run 20260706_queues_and_notifications.sql | ✅ |
| UI-1 | Enhance seller public profiles UI | no | ✅ |
| GEN-1 | Fix notification reason/flow | 🆕 (same migration) | ✅ |

*Backlog cleared — all tracked tasks implemented. Give me a new ID/request to start the next one.*
