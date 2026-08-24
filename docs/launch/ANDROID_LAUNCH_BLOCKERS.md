# Android Launch Blockers — audit 2026-08-02

> **Point-in-time snapshot.** `docs/launch/PLAY_SUBMISSION_CHECKLIST.md` is the
> living doc. As of 25 August 2026, items 4/5/6 in "Should fix, not blocking"
> below are resolved: `has_business_scope`/`claim_first_admin` anon grants
> revoked (migrations `20260881`/`20260882`), console.log leaks wrapped in
> `import.meta.env.DEV`, version is `1.0.13`. `minifyEnabled` is still `false`
> — deliberate, not forgotten.

**App:** STRYT `in.stryt.app` · v0.1.23 (at time of this audit) · targetSdk 36 / minSdk 24
**Audited:** build config, manifest, permissions, signing, secret hygiene,
live Supabase security posture, release pipeline, code hygiene.

## Verdict

**No code-level blocker found.** The build is sound, signing is configured,
secrets are clean, the release pipeline emits a proper AAB, and the database has
no real RLS hole. What stands between you and a live listing is **Play Console
policy paperwork** and **device testing** — not code.

Ranked by what will actually stop you.

---

## BLOCKER 0 — Nominatim rate limiting (found in production, 2026-08-03) — **FIXED**

Live symptom: `HTTP 429 Too Many Requests` from
`nominatim.openstreetmap.org/reverse`.

OSM's public Nominatim allows **~1 request/second** per app and explicitly
forbids using it as an application's primary geocoder or for autocomplete. The
app was far outside that:

- One `reverseGeocode()` could fire **7 Nominatim requests** — two in *parallel*
  via `Promise.all`, up to four more only 200 ms apart, then a coarse pass.
- `nearbyAreas()` called `reverseGeocode()` **four times**, so a single open of
  the location picker could mean **~28 requests in seconds**.
- **No caching at all** — panning back over the same place re-fetched everything.
- Search-as-you-type (`forwardGeocode`) pointed straight at Nominatim from
  Explore, the map SearchBar and onboarding.
- The `User-Agent` header meant to satisfy their ToS **never left the browser**:
  `User-Agent` is a forbidden header name in fetch, so it was silently dropped
  and every request arrived unidentified.

Left alone this ends in an IP ban, and location naming breaks for everyone.

**Fixed:**

| Change | Effect |
|--------|--------|
| **Mapbox is now the primary geocoder** (token already shipped for the map; 100k req/month free, built for app use) | Common case: **7 Nominatim requests → 0** |
| 30-day cache, in-memory + localStorage, keyed on coords rounded to ~11 m | Repeat lookups and GPS jitter cost nothing |
| Single serial queue with a hard 1.1 s minimum gap on every Nominatim call | Cannot exceed the policy even in the fallback path |
| `Promise.all` pair made sequential; Overpass moved ahead of the 4-point sweep | Fallback cascade is far cheaper |
| Forward/autocomplete goes to Mapbox | The exact usage Nominatim's terms call out |
| Dead `User-Agent` header removed, with a comment saying why | No longer looks like compliance when it isn't |

Nominatim is kept only as a fallback for a missing token or a Mapbox failure.
The township-name cascade (the "Amanora Park Town vs Gopalpatti" case) is
preserved — it just runs behind Mapbox now.

**Verify on device:** area names still resolve on the map, in onboarding and in
the location picker; no 429 in the console after repeated panning.

---

## BLOCKER 1 — `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` (highest rejection risk)

**RESOLVED BY DEFERRAL for v1.0.** `AndroidManifest.xml:76` is now commented
out, and `DELIVERY_AGENT_ENABLED` (`src/lib/features.ts`) is `false` — the
permission's only call site (`promptBatteryExemptionForDuty`, reached only
from delivery's on-duty toggle) is unreachable in this build. There is
nothing to justify to a reviewer this round because the app never requests
it.

Original analysis, for when delivery ships in v1.1 — Google restricts this
permission to a **narrow allowlist** of app types, and this is one of the
most common causes of a Play review failure for delivery/tracking apps. Your
use (keeping a delivery agent's location alive on a run) is arguable but
**not automatically permitted**. Options at that point:

1. Remove it and accept OEM battery-killing (the delivery FGS may be killed on
   Xiaomi/Oppo/Vivo).
2. Keep it and justify it in the Console under the exemption you're claiming.
3. Keep it but only *prompt* for it for users who actually take a delivery run
   — which is the honest framing and easiest to defend, and what the app
   already does (see `batteryOptimization.ts`) — so option 3 is already the
   default for whenever this returns.

---

## BLOCKER 2 — Background location declaration

`ACCESS_BACKGROUND_LOCATION` (`AndroidManifest.xml:66`)

Requires, in the Play Console:
- a written justification,
- a **demo video** showing the in-app prominent disclosure and the feature,
- the disclosure appearing *before* the permission prompt.

You already have `docs/launch/play-console/BACKGROUND_LOCATION_DECLARATION.md`
drafted and `BackgroundLocationDisclosure.tsx` in the app, so this is prepared —
but it is a **hard gate**: the submission cannot pass without it, and review
takes longer because a human watches the video.

Note the feature this serves is My People live-sharing for v1.0 (⏸ delivery
runs deferred to v1.1 — see BLOCKER 1). The first-run explainer added this
session strengthens the "prominent disclosure" case, since the user now sees
what's shared and who receives it before it starts.

---

## BLOCKER 3 — Nothing has been tested on a device

Every change from this session — delivery cancel flow, live-share explainer,
soft-delete, map pins, nav affordances, the responsive fixes — is verified only
by typecheck, lint, 127 unit tests and a clean build. **Not one has been run on
an actual Android device.**

For a first public release that is the real risk, well ahead of any lint finding.
Minimum device pass before upload:

- sign up fresh (the new `'New user'` seeding path)
- book an appointment end to end
- toggle My People sharing on and off, confirm the FGS notification appears
- delete a test business
- background the app for 10 minutes with a share active, confirm location still posts
- confirm `/delivery` and the business "Deliveries" tab are actually gone
  (⏸ delivery run pass itself deferred to v1.1 — see BLOCKER 1)

---

## Should fix, not blocking

| # | Item | Where | Why |
|---|------|-------|-----|
| 1 | **CSP is `Report-Only`** | `vercel.json` | It has never enforced anything. Switch to `Content-Security-Policy` once you've confirmed the report queue is clean. Web only — not a Play gate. |
| 2 | **Logs leak payload data** | `pushNotifications.ts:64`, `ProviderDashboard.tsx:219` | One logs the full FCM notification, one logs `{aptId, action, paymentStatus}`. Both run in production. Wrap in `import.meta.env.DEV`. |
| 3 | **`minifyEnabled false`** | `android/app/build.gradle:45` | No shrinking or obfuscation — bigger APK and readable code. Enabling needs ProGuard rules tested against Capacitor plugins, so it's a deliberate later step, not a rush job. |
| 4 | **`has_business_scope` / `has_business_full_access` granted to `anon`** | `20260870` | Needed by RLS evaluation, but `anon` is broader than required. An anonymous caller can probe "does user X hold scope Y on business Z" — information disclosure, not a breach. Narrow to `authenticated`. |
| 5 | **`claim_first_admin` is anon-executable** | live DB | Currently safe: 1 admin exists, so it always raises, and `auth.uid()` is null for anon so the UPDATE matches nothing anyway. But if that admin row ever lost its role, the next signed-in caller could claim admin. Worth a belt-and-braces `auth.uid() is not null` check. |
| 6 | **Version is `0.1.23`** | `package.json` | Cosmetic, but a public launch on a `0.x` version reads as beta. Consider `1.0.0`. |

---

## Checked and genuinely fine

Recording these so nobody re-audits them:

| Area | Status |
|------|--------|
| targetSdk 36 / minSdk 24 | Compliant (Play requires 35+ since Aug 2025) |
| Release signing | Configured; passwords from env/CI, never hardcoded |
| Keystore in git | **Not tracked** — verified via `git ls-files`, and absent from history |
| `.env` in git | Not tracked; only `.env.example` |
| AAB for Play | `bundleRelease` in CI, uploaded as `stryt.aab` |
| Monotonic `versionCode` | From `github.run_number` — Play won't reject a reused code |
| Foreground-service type | `foregroundServiceType="location"` supplied by `@capgo/background-geolocation` via manifest merge. **No `MissingForegroundServiceTypeException` risk** despite the app manifest not declaring it directly |
| `allowBackup` | `false` — correct for an app holding auth state |
| Legal docs | Full set present: privacy, terms, refund/cancellation, grievance redressal, community guidelines, data retention |
| RLS "ERROR" from advisors | `spatial_ref_sys` only — PostGIS's own reference table, no user data, not alterable without superuser. **False positive, ignore.** |
| Unguarded `console.log` | 3 total (2 listed above as fixable) |
| TODO/FIXME markers | 0 in `src/` |

---

## Known incomplete, your call whether they gate launch

From the trackers — none are crashes, all are product gaps:

| ID | Item |
|----|------|
| Feedback #9 | Admin-review data display — unreproducible; needs one real submission to debug |
| Feedback #17 | Two global responsive defects fixed; per-screen enumeration still needs devices |
| Feedback #12 | Believed already correct; needs 30s of your confirmation |
| TMA-007 | No audit trail on team-access grants/revokes |
| DLV-009 | "Orders awaiting a driver" isn't a queryable state, only an absence — moot for v1.0, delivery is deferred (see BLOCKER 1) |

---

## Not assessed

- **iOS.** An `ios/` folder exists; nothing in this audit covers it.
- **Play Console state** — whether the listing, data-safety form, content rating
  and privacy-policy URL are actually filled in. I can only see the repo.
- **Whether the legal docs are publicly hosted.** They exist as markdown in
  `legal/`; Play needs a reachable public URL.
- **Runtime behaviour of anything.** See Blocker 3.
