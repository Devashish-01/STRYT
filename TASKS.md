# STRYT — Change Requests (implementation backlog)

## Group AUDIT-CLEANUP — ad-hoc (2026-07-03) ✅ IMPLEMENTED
### Full pass over the hardcoded-values / dead-code / should-be-live audit ✅
Worked the three-category audit list one problem at a time, own judgment on scope per item:
- **Dead code:** deleted `UserOnboard copy.tsx`, `src/lib/alias.ts`, `uploadService.sign()`, `socialService.queue()` (zero callers each). Removed unused exported types `FeedItem`/`SavedList`/`NotifySub`/`SosAlert`/`TrackingToken` and the unused `CategoryKind` import in `catalogService.ts`. `BusinessSettings.tsx`'s Team card now shows an honest "not available yet" empty state instead of a permanently-empty list behind a working-looking "Invite" button. Left `Promote.tsx`/`Reservations.tsx`/`PhotosManager.tsx`/`StoryComposer.tsx`/`LoyaltySetup.tsx` alone — routed-but-unlinked is a deliberate, already-commented decision, not an accident.
- **Hardcoded values:** new `src/lib/placeholders.ts` (6 named constants replacing 10 duplicated Unsplash URLs across 6 files). New `src/lib/badges.ts` centralizing all three badge/achievement threshold systems — fixed the real bug: "Trusted" meant 5 vouches in one system and 10 ratings in another; renamed the profile-chip one to "Well Vouched" to remove the collision. New `functionUrl()` helper in `config.ts`, replacing 14 hand-built Edge Function URLs across 8 files (2 of which had a duplicate `create-razorpay-order` builder). Added `--amber-500`/`--orange-500` CSS tokens and swept all 7 raw hex-color literals (~150 occurrences across ~90 files) to `var(--token)` form. Fixed 2 stale "arrives in V3" copy sites.
- **Should be live:** migration `20260711_realtime_publication_gaps.sql` adds `conversations`, `notifications`, `post_comments`, `business_qna`, `ratings`, `proposals`, `society_members`, `gate_passes`, `vouches`, `endorsements`, `providers`, `businesses`, `categories`, `reports`, `bug_reports`, `provider_verifications` to the realtime publication, plus re-creates `get_leaderboard()` to expose a real `target_id`. Switched one-shot `useQuery` to `useQueryWithRealtime` in: `ConversationList`, `Notifications`, `CommunityPostDetail` (post + comments), `RequestDetail` (added a second subscription for `proposals`, since it's a separate table from `requests`), `BusinessDetail`/`ProviderDetail` (reviews/Q&A/posts/vouches/endorsements), `AvailableNow`, `ReviewsManager`, `QnaManager`, `SocietyScreen` (gate passes + pending members), and 5 `AdminPanel` tabs (Queue/Reports/Bugs/KYC/Disputes). `store.tsx`'s `chatUnread` is now populated on login (was stuck at 0 all session) and both global unread badges (`unread`, `chatUnread`) update live via a new realtime channel instead of freezing at hydrate-time.
- **Logic bugs found along the way:** Leaderboard row clicks always routed to hardcoded `/u/u1` regardless of which entry was tapped — RPC now returns a real `target_id`. `Achievements.tsx` had two 100%-fabricated badges ("5-week streak", "Level 4") with zero backing computation, mixed in with real computed ones — replaced with a real unlocked-count badge.
- **Deliberately not done:** `Stories.tsx` per-story viewer list realtime — narrow, low-traffic, and the surrounding effect chain was dense enough that a rushed change risked destabilizing it more than the fix was worth. `businessService.team()`/`reservations()`/`setReservation()` stay stubs — building real multi-staff accounts or un-deprecating Reservations is a net-new feature, not a cleanup-pass fix.
- **UI/UX polish pass (`UIfull app.txt`: "proper padding... feel more arranged"):** investigated the shared `.card` utility (has no default padding — every call site sets it inline) as the highest-leverage single change, but checking the 17 sites that omit inline padding showed they're deliberately edge-to-edge list-row containers, not bugs — adding a default would have broken them. No visual/browser tool is available in this environment to verify subjective spacing changes, and a blind CSS sweep already almost produced one wrong "fix" here — so this half of the request is deliberately left undone rather than guessed at. Needs either a screenshot/browser-capable pass or the user flagging specific screens that feel cramped.
- **Files:** touches ~110 files; full list not enumerated here — see the diff. Migration: `supabase/migrations/20260711_realtime_publication_gaps.sql`.
- **Migration needed:** `supabase/migrations/20260711_realtime_publication_gaps.sql` (run manually in SQL editor)

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
