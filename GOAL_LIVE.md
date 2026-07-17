# Goal Live — session log

Tracks changes made specifically to get STRYT ready for live launch (scope trims, launch-blocker fixes). Newest entry on top.

---

## 2026-07-16 — Removed the "Me too" button (temporary)

**What:** Removed the clickable "Me too" button from both places it rendered:
the request feed card and the request detail page. Requester can no longer
see/tap a way to join another neighbor's request as "me too."

**Why:** Requested to be pulled temporarily — revisit later.

**Changed:**
- [`src/screens/requests/RequestDetail.tsx`](src/screens/requests/RequestDetail.tsx) — removed the "Me too — I need this as well" button; removed the now-unused `toggleMeToo` from the `useApp()` destructure.
- [`src/components/cards.tsx`](src/components/cards.tsx) — removed the "Me too" chip button in `RequestCard`'s open-request branch (kept the passive "N interested" text for closed/archived requests, since that's not a control); removed the now-unused `requestService` import and `toggleMeToo` destructure.

**Left in place (unreachable, not deleted):**
- `requestService.meToo()` — still fully implemented, toggles a row in `request_me_toos`.
- The `request_me_toos` table, the `sync_me_too_count` DB trigger, and the `meTooCount`/`isGroupBuy`/`groupBuyTarget` fields — all still live and functional.
- The group-buy progress bar ("X of Y neighbors in") on both the card and detail page — still renders if `isGroupBuy` + `groupBuyTarget` are set on a request (currently only possible via seed data — no compose-screen UI sets these).
- The "Send this quote to everyone who said 'me too'" broadcast checkbox in `SubmitProposal.tsx`, and its backing DB trigger `notify_on_proposal_broadcast` — untouched, since it's a provider-facing control, not "the me too button."

**To bring it back later:** re-add the two button blocks removed above (see git
history on this commit) and restore the `toggleMeToo` destructure /
`requestService` import; nothing on the backend/service side needs any change.

## 2026-07-15 — Removed neighborhood heroes / leaderboard

**What:** Removed both entry points to the "Neighborhood heroes" leaderboard
feature: the Profile menu row (`Trophy` icon, "Neighborhood heroes" → `/leaderboard`)
and the "Leaderboard" banner on Home (mobile + desktop layouts). Also removed
the `/leaderboard` route registration in [`App.tsx`](src/App.tsx), so the
screen is unreachable from the app.

**Why:** Out of scope for launch.

**Changed:**
- [`src/screens/Profile.tsx`](src/screens/Profile.tsx) — removed the menu row + unused `Trophy` icon import.
- [`src/screens/Home.tsx`](src/screens/Home.tsx) — removed both the mobile and desktop "Leaderboard" banners.
- [`src/App.tsx`](src/App.tsx) — removed the `/leaderboard` route + lazy import.

**Left in place (unreachable, not deleted):**
- [`src/screens/Leaderboard.tsx`](src/screens/Leaderboard.tsx) (the "Local heroes" screen itself).
- `leaderboardService`, `socialService.leaderboard()`, and the `get_leaderboard` RPC / points-earning calls (`leaderboardService.addPoints` in `businessService.ts`, `requestService.ts`) — still run in the background, just nothing displays the results now.
- `src/screens/future-enhancement/Neighborhood.tsx` — was already unrouted/dead before this change, also references the leaderboard.

**To bring it back later:** re-add the route in `App.tsx` and the two entry points removed above; nothing on the backend/service side was touched.

---

## 2026-07-15 — Google-only login

**What:** Hid phone-number and email login from the app. `/auth/phone` (the
login page) now shows only "Continue with Google" — no "Other sign-in
options" toggle, no phone/email tabs, no password/OTP forms.

**Why:** Phone/email auth (SMS OTP, email OTP, email+password) is not part
of the live launch scope right now. Google is the only supported sign-in
method for launch.

**Changed:** [`src/screens/auth/PhoneEntry.tsx`](src/screens/auth/PhoneEntry.tsx)
— stripped the tab switcher, phone form, email form, and the `showOther`
toggle; component now only renders the Google button.

**Left in place (unreachable, not deleted):**
- `/auth/otp` route + [`OtpVerify.tsx`](src/screens/auth/OtpVerify.tsx) — no longer linked from the UI.
- `authService.sendOtp`, `sendEmailOtp`, `signInWithPassword`, `signUpWithPassword` — still implemented, just unused.

**To bring phone/email login back later:** restore the removed JSX block in
`PhoneEntry.tsx` (see git history on this file around 2026-07-15) or re-add
a simplified toggle; the backing `authService` methods and `/auth/otp`
screen were not touched.
