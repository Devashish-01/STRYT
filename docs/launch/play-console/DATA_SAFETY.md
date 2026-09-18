# Play Console — Data safety form (copy/paste)

**App:** STRYT · `in.stryt.app`
**Prepared:** 4 August 2026 · derived from the shipping code, not from memory
**Revised:** 18 September 2026 — see *What changed on 18 September* at the end. Two answers changed
(search history, and the deletion answer's precondition); the rest are corrected justifications.
**Privacy policy URL:** `https://stryt.in/legal/privacy-policy`
**Account deletion URL:** `https://stryt.in/legal/account-deletion`

Every row cites the code or schema that justifies it, so this stays honest and
re-auditable when the app changes. **If you remove a feature, update this file
and the Console form together** — a Data safety answer that no longer matches the
binary is a policy violation, not a paperwork slip.

---

## 0. The three global questions

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** — all traffic is HTTPS/TLS (Supabase, Firebase, Mapbox); CSP in `vercel.json` blocks any non-HTTPS destination |
| Do you provide a way for users to request that their data is deleted? | **Yes** — `https://stryt.in/legal/account-deletion`, plus in-app **Account → Delete account** |

> **Blocking precondition for the "Yes" above.** The 30-day purge is done by the `purge-deleted-accounts`
> edge function, which has **never been deployed to production**, and the workflow that calls it daily is not
> on `main` yet. Until both are live, a deletion request enters the grace period and nothing completes it.
> Deploy it before submitting this form — `docs/launch/RELEASE_RUNBOOK.md` part 2.

**Data deletion type:** *Account deletion and data deletion.*
STRYT deletes uploads and anonymises the user record; the retained-data
exceptions are documented in `legal/data-retention-policy.md` §3.4.

---

## 1. Location

| Field | Approximate location | Precise location |
|---|---|---|
| Collected | **Yes** | **Yes** |
| Shared | No | **Yes** — see below |
| Processed ephemerally | No | No |
| Required or optional | **Optional** | **Optional** |
| Purposes | App functionality; Personalisation | App functionality |

**Why:** `users.lat` / `users.lng` store a last-known position for nearby
discovery (`neighborhood_today`, map/Explore). Live share streams position
while active — `ACCESS_BACKGROUND_LOCATION` +
`FOREGROUND_SERVICE_LOCATION` in `android/app/src/main/AndroidManifest.xml:89-91`,
driven by `src/lib/backgroundLocation.ts`. (⏸ Delivery runs are the same
mechanism but are deferred to v1.1 — `DELIVERY_AGENT_ENABLED` is `false` for
this submission, see `BACKGROUND_LOCATION_DECLARATION.md`.)

**Sharing — declare this explicitly:** precise location is shared **with other
users the person chooses** — the contacts they start a My People live share
with. (⏸ v1.1: also the shop and the customer on a delivery run.) It is
**not** shared with advertisers, data brokers, or analytics providers.

> STRYT stores only the *last known* position, not a movement history. Say so in
> the "data usage and handling" free text — it is true (`DataSettings.tsx`
> repeats the same claim to users) and it materially reduces reviewer concern.

> **Decided 18 Sept 2026 (D19):** background location stays for live share and is declared, so the
> declaration below applies. The rows above would have been the same either way — precise location is
> collected in the foreground too.

**Background location declaration:** required separately under App content →
Sensitive permissions. See `BACKGROUND_LOCATION_DECLARATION.md` in this folder —
it needs a demo video. For v1.0 it covers **one** feature (My People live
share); delivery is deferred to v1.1.

---

## 2. Personal info

| Data type | Collected | Shared | Optional? | Purposes | Source |
|---|---|---|---|---|---|
| Name | **Yes** | **Yes** (shown to other users; `show_name_publicly` controls visibility) | Required | App functionality | `users.name`, `users.alias` |
| Email address | **Yes** | No | Required | App functionality; Account management | `users.email` (from Google sign-in) |
| User IDs | **Yes** | No | Required | App functionality | `users.id`, `users.admin_login_id` |
| Phone number | **Yes** | **Yes** (only if `show_phone_publicly`) | **Optional** | App functionality | `users.phone` |
| Address | **Yes** | No | **Optional** | App functionality | `users.area`, `users.city`, `users.unit_number` (society flat); delivery addresses `appointments.delivery_address_line`, `bulk_deal_pledges.delivery_address`, `request_me_toos.delivery_address`; a business's `address_line1` |
| Other info | **Yes** | No | **Optional** | Account management | recovery Q&A hashes, role passwords — stored **hashed** (`users.*_hash`) |

**Note on names:** STRYT has an alias/real-name split — a user can present an
alias publicly while their real name stays private. Declare the collection
honestly (name *is* collected); the visibility toggles are a privacy control, not
a reason to answer "No".

---

## 3. Financial info

| Data type | Collected | Shared | Optional? | Purposes |
|---|---|---|---|---|
| Purchase history | **Yes** | No | Required for the feature | App functionality |
| Other financial info | **Yes** | No | Optional (merchants only) | App functionality |

**Why:** orders, appointments, and deal/agreement records are stored. Merchants
may save a **UPI VPA** for their payment QR.

**Do not declare "Payment info" as shared.** As of this release the payment QR is
generated **on-device** (`src/components/ShareCard.tsx`, `qrcode.react`). It was
previously built by calling `api.qrserver.com` with the VPA in the URL, which
*would* have been third-party sharing. That call is gone and
`https://api.qrserver.com` has been removed from the CSP — if anyone
reintroduces it, this answer must change.

**STRYT processes no payments and holds no money** (Terms §13). There is no
payment processor to declare.

---

## 4. Photos and videos

| Data type | Collected | Shared | Optional? | Purposes |
|---|---|---|---|---|
| Photos | **Yes** | **Yes** (posts/stories/listings are visible to other users) | Optional | App functionality |

**Why:** `CAMERA` permission (`AndroidManifest.xml:69`); avatars, posts, stories,
request photos, business/catalogue/portfolio images in the public `uploads`
bucket.

---

## 5. Messages

| Data type | Collected | Shared | Optional? | Purposes |
|---|---|---|---|---|
| Other in-app messages | **Yes** | **Yes** (delivered to the recipient) | Optional | App functionality |

Direct messages between users. Not shared with third parties.

---

## 6. App activity

| Data type | Collected | Shared | Optional? | Purposes |
|---|---|---|---|---|
| App interactions | **Yes** | No | Required | Analytics; App functionality |
| Other user-generated content | **Yes** | **Yes** (public by design) | Optional | App functionality |
| In-app search history | **Yes** | No | **Optional** | App functionality |

**Why:** inside the app, *App interactions* are the business/provider view counters
(`bump_business_metric`, `bump_provider_views`). *User-generated content* is reviews, ratings, vouches,
requests and stories.

**In-app search history — this was "No" and was wrong.** `src/screens/Search.tsx` lets a signed-in user save
a search, and `discoveryService.saveSearch` stores the query text with the coordinates it was made at
(`saved_searches`). Optional (only when the user saves one), deletable, never shared.

**Vercel Analytics / Speed Insights do not run inside the Android app.** They load their script from
`/_vercel/insights/script.js`, relative to the page. In the app the page is served from `https://localhost`
(Capacitor, `androidScheme: 'https'`) out of the local bundle, which has no such file, so the request 404s and
nothing is collected. They run on the **website** (stryt.in, hosted on Vercel) only. Checked 2026-09-18: the
built `dist/` has no `_vercel` directory.

---

## 7. App info and performance

| Data type | Collected | Shared | Optional? | Purposes |
|---|---|---|---|---|
| Crash logs | **Yes** | No | Required | Analytics |
| Diagnostics | **Yes** | No | Required | Analytics |

**Crash logs:** the app's own `client_errors` table (`src/lib/monitoring.ts`), and **Sentry** when a
`VITE_SENTRY_DSN` is set at build time (`src/lib/sentry.ts` — without one it never loads). Sentry is a
service provider acting for STRYT, so this is not "sharing".

**Diagnostics:** the app version and user agent attached to each crash report. (Vercel Speed Insights runs on
the website only — see §6.)

**Worth saying in the handling notes:** before any report leaves the device, `src/lib/scrubPii.ts` removes
phone numbers, emails, Aadhaar/PAN, UPI handles, coordinates, tokens and OTPs — for both sinks. 26 tests
assert the values are absent from the output.

---

## 8. Device or other IDs

| Data type | Collected | Shared | Optional? | Purposes |
|---|---|---|---|---|
| Device or other IDs | **Yes** | No | Required for notifications | App functionality |

**Why:** FCM registration tokens and web-push endpoints in `push_subscriptions`
(`src/lib/pushNotifications.ts:114`). Used only to deliver notifications the user
opted into. **Not** used for advertising or cross-app tracking.

---

## 9. Identity documents (KYC)

Play has no dedicated "government ID" row — declare under **Personal info →
Other info**, and describe it in the free-text handling notes:

> Businesses and service providers who choose to get verified may upload
> identity or business-registration documents. These are stored in a **private**
> storage bucket (`verification-docs`, not publicly readable), are visible only
> to STRYT reviewers, are never shown to other users, and are deleted when the
> profile is deleted.

**Was that last sentence true?** Not until 18 September 2026. Both deletion functions cleaned only the public
`uploads` bucket, and every document in `verification-docs` outlived its account (ledger P15-001). Fixed in
`purge-deleted-accounts` and `admin-delete-profile`, but production gets the fix only when those functions are
deployed — so the sentence becomes true at that deploy, not before.

**"Visible only to STRYT reviewers" was checked on 2026-09-18:** the bucket is private on production and
staging, no storage policy lets any client role read it, and reviewers see a document only through a
short-lived signed URL minted by the `verification-review` function.

Collected **Yes** · Shared **No** · **Optional** · Purpose: **Fraud prevention,
security, and compliance** · Also tick **Account management**.

---

## 10. Third parties the app actually contacts

Sourced from the CSP `connect-src` in `vercel.json` — that list is the app's real
egress allowlist, so it is the correct place to audit this from.

| Host | What it receives | Declare as sharing? |
|---|---|---|
| `*.supabase.co` | Everything — this is STRYT's own backend (processor) | No — service provider |
| Firebase / Google Identity | Google sign-in; FCM push delivery | No — service provider |
| `api.mapbox.com`, `*.tiles.mapbox.com` | Map tiles; geocoding queries (coordinates / typed place text) | No — but disclose in handling notes |
| `tiles.openfreemap.org`, `*.tile.openstreetmap.org` | Map tile requests | No |
| `nominatim.openstreetmap.org`, `overpass-api.de` | Fallback reverse-geocoding coordinates | No |
| `api.open-meteo.com` | Coarse coordinates for the weather in the ambient header | No |
| `fonts.googleapis.com`, `fonts.gstatic.com` | Nothing user-specific — static CSS/font-file requests only, cached by the service worker | No |
| Vercel Analytics / Speed Insights | Aggregate page + performance events — **website only**, does not run in the app (§6) | No — analytics processor |
| Sentry (`*.ingest.sentry.io`) | Crash reports, scrubbed of personal data first — only when `VITE_SENTRY_DSN` is set | No — service provider |

None of these receive an advertising identifier, and STRYT ships **no ad SDK** —
answer **"No"** to the ads question in App content.

---

## 11. Answers that must stay "No"

Say no, and mean it — these are the ones that get apps pulled:

- **Health and fitness**, **Contacts**, **Calendar**, **SMS/Call logs**,
  **Audio files**, **Music files**, **Installed apps**, **Web browsing history**
- Any **"Data is shared for advertising or marketing"** purpose
- Any **"Data is sold to third parties"**

> Microphone and speech-recognition strings exist in `ios/App/App/Info.plist:64-67`
> for voice input, but there is **no `RECORD_AUDIO` permission in the Android
> manifest** — Android voice input runs through the browser Speech API. Do not
> declare audio collection for the Play listing.

---

## What changed on 18 September

| Section | Change | Why |
|---|---|---|
| §0 | Added a blocking precondition to the deletion answer | `purge-deleted-accounts` has never been deployed to production |
| §1 | Manifest line numbers; note on the background-location decision | Lines moved; the decision is still open |
| §2 | More sources for *Address* | Delivery and business addresses were missing from the justification |
| **§6** | **In-app search history: No → Yes (optional)** | Saved searches store query text and coordinates — an under-declaration |
| §6, §7 | Vercel scoped to the website | Its script cannot load inside the app |
| §7 | Sentry, and the PII scrubber | Both added in P14 |
| §9 | The deletion sentence was false until the P15-001 fix | Documents outlived accounts |
| §10 | Sentry row; Vercel marked website-only | As above |

**Unchanged, and correct:** treating Supabase, Firebase, Mapbox, the map tile hosts, Nominatim, Overpass,
Open-Meteo and Vercel as service providers rather than "sharing". Play's definition of sharing excludes
transfers to a service provider processing data on your behalf. An earlier comparison
(`../DATA_SAFETY_DIFF.md`, 18 Sept) wrongly called three of those answers mistakes, and has been corrected.
Whether a free public service such as Nominatim counts as *your* service provider is a question for the lawyer
review; if in doubt, over-declaring is the safer error.
