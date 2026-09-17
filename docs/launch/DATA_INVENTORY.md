# Data inventory

**Built:** 2026-09-18 · **Source:** the code and the live staging schema, not the existing docs (P15 §15.A.1)
**Schema read from:** staging `laswruzdyqehziyupmdm`, which carries `20260973`–`20260989`; production is
behind by those migrations until the owner applies them.

Every row names a file path or a `table.column` that was checked to exist. Where a claim could not be
verified from the code, it says so rather than guessing — a Play *Data safety* declaration built on a guess is
worse than one with a known gap.

**This is not a legal compliance assessment.** It is a factual map of what the app collects, where it lands,
who can read it, and what removes it. The DPDP Act / IT Rules judgement is the owner's lawyer's (P15 §15.B.4).

---

## 1. Summary for the Play *Data safety* form

| Play category | Collected | Shared with third parties | Optional | Deletable in-app |
|---|---|---|---|---|
| Name | Yes — `users.name`, plus an `alias` | No | Real name optional; alias auto-suggested | Yes (account deletion) |
| Email | Yes — `users.email`, `businesses.email`, `providers.email`, `support_tickets.email` | **Yes** — Google/Firebase Authentication supplies it at sign-in | **No** — Google is the only sign-in the UI offers, and it supplies the email | Yes |
| Phone | Yes — `users.phone` | Only if the phone-OTP route is used (OTP delivery provider) | **Yes** in the shipped UI — see §2.1 | Yes |
| Precise location | Yes — `users.lat/lng`, `live_shares.lat/lng`, `appointment_deliveries.lat/lng` | **Yes** — Mapbox (geocoding), Nominatim (fallback), map tile hosts, and other users for a live share | Yes (guest browsing works without) | Yes |
| Approximate location | Yes — `businesses.lat/lng`, `providers.lat/lng`, `places.lat/lng` | Same as above | For a listing, no | With the listing |
| Photos | Yes — `uploads` bucket; `appointments.photo_url`, `messages.image_url`, `stories.image_url` | No | Yes | Yes |
| Messages | Yes — `messages`, `post_comments` | No | Yes | Yes |
| Payment info | **References only** — `payment_reference`, `upi_id`. No card or bank credential is ever collected | No | Yes | Yes |
| Device / push tokens | Yes — `fcm_tokens.token`, `push_subscriptions` | **Yes** — Firebase Cloud Messaging | Yes (notifications can be declined) | Yes |
| Crash logs | Yes — `client_errors` (own table) | No today; **Sentry once B lands** | No | — |
| Analytics | Yes — Vercel Analytics + Speed Insights | **Yes** — Vercel | No | — |
| Government ID | Yes — `verification-docs` bucket, `businesses.aadhaar_doc_url` / `pan_doc_url` | No | Yes (only to get verified) | Yes |
| Contacts | **No device contact book access.** `emergency_contacts` stores a STRYT user id, not a phone book entry | No | Yes | Yes |

---

## 2. Per data type

### 2.1 Identity

| Field | Collected at | Stored in | Who can read | Optional |
|---|---|---|---|---|
| Phone | `src/screens/auth/OtpVerify.tsx` (route reachable, button hidden) | `users.phone`, `auth.users` | The user; admins | **Yes** — see the note below |
| Real name | Onboarding, `src/screens/settings/` | `users.name` | Per `users.show_name_publicly`; otherwise the alias is shown | Yes |
| Alias | Auto-suggested, `src/lib/aliasSuggest.ts` | `users.alias` | Everyone | No (generated) |
| Email | Settings; support | `users.email`, `support_tickets.email` | Per `users.show_email_publicly` | Yes |
| Avatar | Settings | `users.avatar` → `uploads` bucket | Everyone | Yes |

**Sign-in is Google-only in the shipped UI.** `src/screens/auth/PhoneEntry.tsx` says so in a comment —
"Number/email login is hidden for the live launch — Google is the only sign-in method until phone/email OTP
is reintroduced" — and only `handleGoogleLogin` is wired. So **email is required** (Google supplies it) and
**phone is optional**. Two consequences worth carrying into the declaration:

- **Google / Firebase Authentication is a third party in the identity path**, via `signInWithIdToken`
  (`src/services/core/authService.ts`). It is in the privacy policy §8.2 but not in the dossier's table.
- `/auth/otp` **is still routed** (`src/App.tsx:571`), so phone sign-in remains reachable by direct URL even
  though nothing links to it — that is how the E2E personas sign in. It is live but unadvertised, not gone.

The alias/real-name split is the privacy model: `src/lib/publicName.ts` `aliasName()` resolves which one a
viewer sees, and real names surface only inside an active relationship. This is worth stating in the privacy
policy because it is stronger than what the policy currently claims.

### 2.2 Location

| Field | Collected at | Stored in | Retention |
|---|---|---|---|
| Account location | `src/lib/nativeGeolocation.ts`, onboarding | `users.lat/lng`, gated by `users.location_public` | Until changed or account deleted |
| Guest location | Same, held in memory | **Not persisted** — `src/lib/guestMode.ts` | Session only |
| Listing location | Business/provider onboarding | `businesses.lat/lng`, `providers.lat/lng`; pending changes in `pending_lat/pending_lng` with `location_review_status` | With the listing |
| Live share | `src/features/live-share/`, `emergencyService` | `live_shares.lat/lng` | **Auto-expires: `expires_at` defaults to `now() + 8 hours`** |
| Delivery position | Delivery console | `appointment_deliveries.lat/lng`, `delivery_batches.lat/lng` | With the delivery record |
| Saved searches | `discoveryService` | `saved_searches.lat/lng` | Until deleted |

**Third parties in the location path:** **Mapbox is the primary geocoder** — `mapboxReverse()` and the
forward place search in `src/lib/geocode.ts` both call `api.mapbox.com`, with
`nominatim.openstreetmap.org` as the fallback. Plus map tile hosts — `tiles.openfreemap.org`, CARTO, and `api.mapbox.com` when a
Mapbox token is configured (`src/screens/MapView/mapboxFallback.ts`). A tile request reveals the viewport to
the tile host. `overpass-api.de` is also called for place data.

### 2.3 Content the user creates

| Type | Table / bucket | Retention |
|---|---|---|
| Community posts | `community_posts` (+ `image`, `media`) | `expires_at` where the post type sets one; otherwise until deleted |
| Comments | `post_comments`, including `shared_phone` + `phone_visibility` | With the post |
| Stories | `stories` | `expires_at` |
| Chat | `conversations`, `messages` (`image_url`) | Until account deletion |
| Requests | `requests` (`photos`) | `expires_at` |
| Ratings | `reviews` | Until deleted |
| Photos | `uploads` bucket — **public** | Until deleted |

`post_comments.shared_phone` deserves a policy line: a user can attach their phone to a comment, and
`phone_visibility` controls whether it is shown to everyone or only the post owner.

### 2.4 Commerce

No card, UPI PIN, or bank credential is ever collected. What is stored is a **reference to a payment made
elsewhere**: `appointments.payment_reference`, `agreements.payment_reference`,
`queue_tokens.payment_reference`, and the merchant's own `upi_id` / `upi_qr_url` so customers can pay them
directly. `custom_payments` records a claim and its confirmation.

`appointment_deliveries.handoff_code` is a short-lived proof-of-delivery code, not a credential.

### 2.5 Verification documents

`verification-docs` is the **only non-public bucket** (`public=false`; the other two, `uploads` and
`app-updates`, are public). It holds `businesses.aadhaar_doc_url`, `businesses.pan_doc_url` and
`verification_document_url` for both listing types. These are government identity documents and are the most
sensitive data the app holds.

Readable by: the uploading owner and admins (`verification-review` edge function). **To verify before the
Play declaration:** that the bucket's RLS policies match that sentence — P05 covered access broadly, but this
bucket deserves its own re-check because a public URL here would be severe.

### 2.6 Device and technical

| Field | Where | Note |
|---|---|---|
| Push token | `fcm_tokens.token`, `push_subscriptions` — `src/lib/pushNotifications.ts` | Shared with **Firebase Cloud Messaging** |
| User agent | `client_errors.user_agent`, `terms_acceptances.user_agent` | The latter is evidence of consent |
| Crash text + stack | `client_errors` — `src/lib/monitoring.ts` | Own table. Capped 2000/8000 chars, deduped, 12 inserts/minute, **only when signed in** (RLS blocks anon) |
| Analytics | Vercel Analytics + Speed Insights — `src/main.tsx:51-52` | Shared with **Vercel** |

`src/lib/monitoring.ts` states "No PII beyond the error text/stack + URL + UA". That is a design intent, not
an enforced guarantee — an error message can contain anything the throwing code put in it. **The scrubber in
task B should cover `client_errors` too, not only Sentry.** Logged as a finding below.

### 2.7 Emergency contacts

`emergency_contacts.contact_user_id` — a **STRYT user id**, not a phone-book entry. The app never reads the
device contact list. This matters for the Play form: "Contacts" should be declared **not collected**.

---

## 3. Retention and deletion

| Mechanism | Where | Effect |
|---|---|---|
| Self-serve account deletion | `src/lib/accountDeletion.ts`, `/legal/account-deletion` | 30-day grace (`ACCOUNT_DELETION_GRACE_DAYS = 30`), then purge |
| Purge | `supabase/functions/purge-deleted-accounts/index.ts` | Runs past the grace period; sets `users.customer_deleted_at` |
| Storefront pause during grace | `profileControlService.requestDeletion` | Owned listings set `owner_enabled = false`, restored on cancel (ledger `ACCOUNT_DELETION:DEL-1`) |
| Soft delete | `businesses.deleted_at`, `providers.deleted_at` | Hidden, not yet purged |
| Automatic expiry | `live_shares` (8 h), `stories`, `requests`, `community_posts`, `tracking_tokens`, `location_share_grants`, `business_access_sessions` | `expires_at` |
| Scheduled jobs | `cron.job` | `close-expired-bulk-deals` (*/10), `close-expired-business-sessions` (* * * * *), `notify-ended-polls` (*/10) |

**Gap:** `purge-deleted-accounts` is **not deployed** (owner step 2 in `docs/plan/NIGHT_RUN.md`). Until it is,
the 30-day purge does not actually run — the grace period starts and nothing completes it. This is a
declaration risk: the Play listing and the privacy policy both promise deletion.

---

## 4. Third parties

| Party | What reaches them | Where |
|---|---|---|
| Supabase | Everything — it is the database, auth and storage | — |
| Firebase Cloud Messaging | Push token + notification payload | `src/lib/pushNotifications.ts`, `supabase/functions/send-push` |
| OTP delivery provider (Twilio / MessageCentral) | Phone number — **only on the unadvertised `/auth/otp` route** | Supabase Auth provider |
| Vercel | Page views, Web Vitals, IP-derived coarse geography | `src/main.tsx` |
| Google / Firebase Auth | Google account identity; supplies the email at sign-in | `src/services/core/authService.ts` |
| Mapbox | Coordinates (reverse geocode) and typed place queries (forward search) | `src/lib/geocode.ts` |
| Nominatim (OSM) | The same, as fallback when Mapbox is unavailable | `src/lib/geocode.ts` |
| OpenFreeMap / CARTO / Mapbox | Viewport tile requests | `src/screens/MapView/` |
| Overpass API | Place queries | place lookup |
| Google Maps | Only as an outbound link (directions); no data pushed | `src/lib/openExternal.ts` call sites |
| Sentry | **Not yet** — task B | — |

---

## 5. Findings to resolve before the Play declaration

| # | Finding | Action |
|---|---|---|
| 1 | `purge-deleted-accounts` is not deployed, so the 30-day deletion promise does not complete | **Owner step 2** — deploy it, then verify one purge on staging |
| 2 | `client_errors` has no scrubber; the "no PII" note is intent, not enforcement | Cover it with the task-B scrubber |
| 3 | `verification-docs` RLS deserves its own re-check | Verify the bucket policies before declaring |
| 4 | "Contacts" must be declared **not collected** — `emergency_contacts` holds user ids | Correct the form if it says otherwise |
| 5 | Map tile hosts and Nominatim receive location; likely absent from the current policy | Add to the privacy policy (task A3) |
| 6 | Vercel Analytics is running with no in-app disclosure found | Disclose, or decide to drop it |

*Next: A2 diffs this against the dossier §4 and the privacy policy.*
