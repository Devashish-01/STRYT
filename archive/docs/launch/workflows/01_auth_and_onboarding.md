# 01 — Auth & Onboarding

**Priority:** P0 — nothing else is reachable if this is broken.
**Screens:** `Splash`, `PhoneEntry`, `OtpVerify`, `TermsAccept`, `UserOnboard`
(+ beats: `BeatHandle`, `BeatIdentity`, `BeatInterests`, `BeatLocation`),
`DeletionPending`.
**Guards:** `PublicOnlyLayout` (`/`, `/auth/phone`, `/auth/otp` — bounces OUT
if already signed in), `ProtectedLayout` (`/auth/terms`, `/auth/onboard`).

## Flow A — Fresh sign-up (A1)

| # | Step | Expected |
|---|------|----------|
| 1 | Cold install, open app | `Splash` → `/auth/phone` if signed out |
| 2 | Enter a **never-used** phone number | OTP sent, `/auth/otp` |
| 3 | Enter wrong OTP | Clear error, does not advance |
| 4 | Wait for OTP expiry, then enter the (now-expired) code | Clear "expired" message, offers resend |
| 5 | Tap resend, enter the correct new code | Advances |
| 6 | First-time user | Routed to `/auth/terms` before anything else |
| 7 | Try to navigate away from `/auth/terms` (back button, deep link) | **Cannot skip** — always redirected back until accepted |
| 8 | Accept terms | `/auth/onboard` — beats: Handle → Identity → Interests → Location |
| 9 | Handle/alias step | Enforces the app's alias rules (uniqueness, length) — check `aliasSuggest`/`publicName` behaviour if the chosen handle collides |
| 10 | Location beat — allow permission | Location captured, used for `area`/`city` |
| 11 | Location beat — deny permission | Graceful fallback (manual area pick or default), does not crash or block completion |
| 12 | Complete onboarding | Lands on customer Home, greeting shows **alias or "Neighbor" — never the email/phone** |

## Flow B — Google sign-in

| # | Step | Expected |
|---|------|----------|
| 1 | `/auth/phone` → Google sign-in option | Opens Google auth |
| 2 | Complete with a **new** Google account | Same onboarding beats as phone sign-up |
| 3 | Complete with an **existing** account's email | Signs straight in, no duplicate onboarding |
| 4 | Sign up with an email-only Google account (no phone on file) | Home greeting still never shows the raw email — this is the "email-as-name leak" regression, see workflow 23 |

## Flow C — Guest browsing

| # | Step | Expected |
|---|------|----------|
| 1 | Skip/decline sign-in at the entry point (if offered) or just deep-link into `/home` signed out | `GuestOrAuthLayout` — Home/Explore/Map/Search/business & provider detail all browsable |
| 2 | Try to book, pledge, post, or message as guest | `useRequireAuth()` gate fires — a "Sign in to…" toast/prompt, **not** a silent no-op or a crash |
| 3 | Sign in from that prompt | Returns to the exact screen/action you were on, not dumped to Home |
| 4 | Guest opens a community post card | Share button is hidden for guests (regression check, see workflow 23) |

## Flow D — Session hygiene

| # | Step | Expected |
|---|------|----------|
| 1 | Sign out | Returns to `/auth/phone`, no residual personal data flashes on the way out |
| 2 | Sign back in as the **same** user | All personal state (bookmarks, follows, roles) intact |
| 3 | Sign out, sign in as a **different** account on the same device | **No stale data** from account 1 — check bookmarks, notifications, active role/hat, drafts |
| 4 | Request account deletion (from Settings) | Routed to `/auth/deletion-pending`; confirm the public deletion page also works signed out: `https://stryt.in/legal/account-deletion` |
| 5 | Attempt sign-in during the deletion grace period | Confirm the app's actual behaviour matches what the account-deletion policy promises (blocked, or reactivates — whichever this app implements) |

## Edge cases

- Two accounts in sequence on one device — no cross-contamination in
  localStorage-backed state (drafts, appointment fallback rows).
- Deep link to a protected route while signed out — bounced to `/auth/phone`,
  then returned to the original destination after sign-in (`authReady` must
  resolve before the guard redirects — don't let an OAuth/magic-link redirect
  race the guard).
- Airplane mode during OTP submit — clear network-error toast, not a hang.
