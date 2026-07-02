# STRYT — Change Requests (implementation backlog)

> **How to use:** each task has a stable ID (e.g. `BP-1`). Give me one ID at a time; I implement just that,
> run `npx tsc --noEmit` + `npm run build`, and tick it here. Tasks are **grouped by shared files** and
> ordered so sequential work touches the same files back-to-back = minimal churn / minimal re-reads.
> See `CODEBASE_MAP.md` for where everything lives.
>
> Legend: 🟡 = partly done in earlier sessions (verify + finish) · 🆕 = needs a DB migration.

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

## Group CUST — customer identity, onboarding, profile, privacy, followers
*Shared files: `src/screens/Profile.tsx`, `src/screens/PublicProfile.tsx`, `src/screens/auth/UserOnboard.tsx`, `src/screens/ProfileEdit.tsx`, `src/services/userService.ts`, `src/store.tsx`, `src/lib/alias.ts`, `src/types.ts`.*

### CUST-1 — Remove the customer "user id"/alias; first name is the identity
- **Goal:** drop the username/alias/user-id concept for customers; the user's **first name** is the public identity shown everywhere.
- **Do:** remove alias input from `UserOnboard`/`ProfileEdit`; render first name (`user.name.split(" ")[0]`) wherever alias was shown (`PublicProfile`, `Profile`, community/author labels); retire `src/lib/alias.ts` usage. Check `CurrentUser` type + any `alias` DB column references.
- **Files:** `UserOnboard.tsx`, `ProfileEdit.tsx`, `PublicProfile.tsx`, `Profile.tsx`, `alias.ts`, `types.ts`, grep `alias`. ⚠️ interacts with the existing alias/real-name privacy model — confirm nothing else depends on alias.

### CUST-2 — First-time login → required setup form (rest optional)
- **Goal:** after first OAuth/phone login, force a short "important details" form (required fields), everything else optional, before entering the app.
- **Now:** `/auth/onboard` `UserOnboard` exists; routing redirects new users there.
- **Do:** define required vs optional fields; block "continue" until required are filled; make optional clearly skippable; ensure the redirect only fires when required fields are missing (check `App.tsx`/guard + `userService.me`).
- **Files:** `UserOnboard.tsx`, `App.tsx` (redirect condition), `userService.ts`.

### CUST-4 — Field-level privacy: hide chosen details from others 🆕
- **Goal:** user picks which profile details others cannot see.
- **Now:** `profileControlService` only toggles the **whole** profile on/off + deletion — no per-field control. This is new.
- **Do:** add a `privacy` flags shape (e.g. hide phone/city/ratings/etc.) — a JSON column on `users` (🆕 migration) + `userService.update`; a picker UI in `ProfileEdit`/Settings; `PublicProfile` respects the flags.
- **Files:** migration, `userService.ts`, `types.ts`, `ProfileEdit.tsx`, `PublicProfile.tsx`.

### CUST-5 — Followers on the "You" page
- **Goal:** on `Profile`, the user can see who follows them (count + list).
- **Now:** `store.follows`/`toggleFollow` cover **who I follow**; no reverse (followers) query. DB `follows` has `follower_user_id` + `target_id`.
- **Do:** add `socialService.followers(userId)` (query `follows` where `target_id = me && target_type = USER`, join user names); show count on `Profile` + a followers list (new small screen or sheet).
- **Files:** `socialService.ts` (or `userService`), `Profile.tsx`, maybe new `Followers` screen + route.

### CUST-3 / UI-pub — Enhance customer public profile UI/UX
- **Goal:** polish `PublicProfile` visual/UX.
- **Do:** after CUST-1/4/5 land (they change what's shown), restyle in one pass.
- **Files:** `PublicProfile.tsx` (+ `common.tsx` if shared primitives needed).

---

## Group Q — queues
### Q-1 — "My Queues" dashboard: sortable, count, live position, history 🆕
- **Goal:** after joining any queue, a Queue entry appears on the dashboard showing every queue the user is in — which queue, position, how many total — plus a history of completed ones.
- **Now:** `store.queuesJoined`/`joinQueue` is local-only (business ids); `businessService` has queue token methods but no "my joined queues across shops" or history read.
- **Do:** add `businessService.myQueues()` (join `queue_tokens` where `customer/user = me`, status WAITING/SERVED/DONE) → live position per shop; a `MyQueues` screen (sort by shop/joined-time, Active vs History tabs); a dashboard/Home/Profile entry that only appears when in ≥1 queue. May need a `user_id` on `queue_tokens` / a history status (🆕 if missing).
- **Files:** `businessService.ts`, new `MyQueues.tsx` + route, `Home.tsx` or `Profile.tsx` entry, `store.tsx` (maybe), possibly migration.

---

## Group UI — public profile polish (sellers)
### UI-1 — Enhance business & provider public profile UI/UX
- **Goal:** visual/UX upgrade of `BusinessDetail` and `ProviderDetail`.
- **Do:** do this **last** (after BIZ/BP change what these pages render — packages, availability, appointments, posts) so you restyle once.
- **Files:** `BusinessDetail.tsx`, `ProviderDetail.tsx` (+ `common.tsx`/`index.css` tokens as needed).

---

## Group GEN — general
### GEN-1 — Notification "why am I getting this" flow is broken
- **Goal:** every notification should clearly convey its reason/source; fix the broken context.
- **Do:** audit where notifications are created (DB triggers/functions + `notificationService`) and what `Notifications.tsx` renders; ensure each row has a type + human reason + deep link to the source; fix missing/duplicated/mis-typed entries.
- **Files:** `src/services/notificationService.ts`, `src/screens/Notifications.tsx`, likely a Supabase function/trigger (`supabase/*.sql`). 🆕 possible if a `reason`/`type` column is missing.
- **Note:** needs investigation first — I'll read the notification creation path before proposing the exact fix.

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
| CUST-1 | Remove user-id/alias; first name is identity | no | todo |
| CUST-2 | First-login required setup form | no | todo |
| CUST-4 | Field-level profile privacy | 🆕 | todo |
| CUST-5 | Followers on You page | no | todo |
| CUST-3 | Enhance customer public profile UI | no | todo |
| Q-1 | My Queues dashboard + history | maybe 🆕 | todo |
| UI-1 | Enhance seller public profiles UI | no | todo |
| GEN-1 | Fix notification reason/flow | maybe 🆕 | todo |

*Give me an ID to start. I'll confirm scope if a task needs a decision, otherwise implement + build + tick.*
