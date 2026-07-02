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

## Group COM — universal Post-to-Community for sellers
### BP-1 — Business & provider post to community the same, universal way
- **Goal:** one identical posting flow for both business and provider owners; posts attributed to the seller and reliably shown on their profile Posts tab. 100% coverage (all sellers).
- **Now:** `CommunityCompose` (`/community/new`) **ignores** the `businessId/businessName` route state ManageDashboard passes — it always posts as the individual user. Provider has no explicit community-post entry.
- **Do:** make `CommunityCompose` accept an optional author context (seller id/name/type) from route state and stamp the post's author accordingly (verify `communityService.create` + `byAuthor` support it); add a "Post to community" entry to the **provider** dashboard/nav mirroring the business tile; ensure both profiles' Posts tabs read them.
- **Files:** `CommunityCompose.tsx`, `communityService.ts`, `ManageDashboard.tsx` (business, exists), provider dashboard/`ProviderManageNav.tsx`, maybe `types.ts`. Possibly a `posted_as`/author column (🆕 only if attribution needs it).

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
| BP-1 | Universal seller post-to-community | maybe 🆕 | todo |
| CUST-1 | Remove user-id/alias; first name is identity | no | todo |
| CUST-2 | First-login required setup form | no | todo |
| CUST-4 | Field-level profile privacy | 🆕 | todo |
| CUST-5 | Followers on You page | no | todo |
| CUST-3 | Enhance customer public profile UI | no | todo |
| Q-1 | My Queues dashboard + history | maybe 🆕 | todo |
| UI-1 | Enhance seller public profiles UI | no | todo |
| GEN-1 | Fix notification reason/flow | maybe 🆕 | todo |

*Give me an ID to start. I'll confirm scope if a task needs a decision, otherwise implement + build + tick.*
