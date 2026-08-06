# Play Store submission checklist

**App:** STRYT · `in.stryt.app` · v1.0.4 · targetSdk 36 / minSdk 24
**Written:** 4 August 2026 · **Updated:** 5 August 2026
**Supersedes:** `docs/plans/app-plans/PLAY_STORE_CHECKLIST.md`, which is stale —
it still warns about hardcoded keystore passwords in `build.gradle` (now read
from env/CI) and a `0.x` version (now 1.0.4).

Verified against the shipping code and the live database, not from memory.

---

## The three Declarations you're looking at

| Declaration | Tick? | Basis |
|---|---|---|
| Developer Program Policies | **Yes** | Attestation. Nothing in the binary violates policy — but review still has to pass, which is what the rest of this file is about |
| Play App Signing ToS | **Yes** | CI emits a signed AAB (`bundleRelease`); upload key is env/CI-injected and has never been committed |
| US export laws | **Yes** | TLS/HTTPS and platform crypto only, no custom cryptography. Mass-market exemption. iOS already declares `ITSAppUsesNonExemptEncryption = false` |

---

## Code — done

| Item | Where |
|---|---|
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` prompted **only** on delivery on-duty, never at launch | `src/lib/batteryOptimization.ts` → `DeliveryConsole.tsx:170` |
| Prominent background-location disclosure before the system dialog, in **both** entry points | `useLiveShare.tsx:142`, `DeliveryConsole.tsx:494` |
| Public account-deletion page, reachable without signing in | `legal/account-deletion.md` → `https://stryt.in/legal/account-deletion` |
| **`purge-deleted-accounts` deployed for the first time** — the scheduled workflow had been calling a function that did not exist (`POST \| 404` in the logs), so the 30-day purge had **never run**. Deleted accounts sat in the grace period indefinitely, contradicting the deletion promise Play is being shown | `supabase/functions/purge-deleted-accounts/` |
| Payment QRs generated on-device — merchant UPI IDs no longer sent to `api.qrserver.com` | `src/components/ShareCard.tsx` (`qrcode.react`) |
| CSP enforced (not Report-Only), dead hosts removed | `vercel.json` |
| targetSdk 36 · monotonic `versionCode` from CI · `allowBackup=false` | `variables.gradle`, `build.gradle` |
| `foregroundServiceType="location"` present via manifest merge | `@capgo/background-geolocation` |
| No unguarded `console.log` leaking payloads | `src/` |

---

## Console — you must do these

Each links to the fill-in doc where one exists.

- [ ] **App content → Sensitive permissions → Background location** —
      [`play-console/BACKGROUND_LOCATION_DECLARATION.md`](play-console/BACKGROUND_LOCATION_DECLARATION.md).
      Needs a **demo video** covering **both** the live share and the delivery
      run. Human-reviewed, so budget extra turnaround.
- [ ] **App content → Data safety** —
      [`play-console/DATA_SAFETY.md`](play-console/DATA_SAFETY.md). Complete,
      code-derived answers.
- [ ] **App content → App access** —
      [`play-console/APP_ACCESS.md`](play-console/APP_ACCESS.md). **Read the
      warning at the top**: Google is the only sign-in method, so the review
      accounts need 2FA off and a prior real-device sign-in.
- [ ] **Privacy policy URL** → `https://stryt.in/legal/privacy-policy` *(verified
      live, HTTP 200)*
- [ ] **Account deletion URL** → `https://stryt.in/legal/account-deletion`
      *(ships in this release — confirm 200 after deploy)*
- [ ] **Content rating** questionnaire
- [ ] **Target audience** — not children
- [ ] **Ads** — declare **none**. No ad SDK ships
- [ ] **Financial features** — declare **none**. STRYT holds no money and
      processes no payments (Terms §13)
- [ ] Store listing: name, short + full description, phone screenshots,
      512×512 icon (`public/icon-512.png`), 1024×500 feature graphic
- [ ] Upload the AAB to **Internal testing** first, then promote

---

## Security

### ✅ P0 CLOSED — leaked `service_role` key is dead (6 August 2026)

The `service_role` JWT hardcoded in `scripts/upload-apk.mjs` before commit
`efd5031` was recoverable from git history in one command, and this repo
(`github.com/Devashish-01/STRYT`) is **public** — the key sat readable on the
open internet from **10 July to 6 August**. It bypassed RLS completely.

**Both surfaces now reject it:**

```
storage  -> 403  {"error":"Unauthorized","message":"signature verification failed"}
data-api -> 401  {"message":"Legacy API keys are disabled",
                  "hint":"...disabled on 2026-08-06T21:46:58Z..."}
```

App paths re-verified on the publishable key immediately after: public
`/track` RPC 200, admin login resolve 200, public storage object 200, OTA
`app-update` 200, and `cancel_expired_agreements` still correctly 401.

**Assume the key may have been used** during the 27-day public window. Review
Supabase logs for unfamiliar API traffic — absence of evidence here is not
evidence of absence.

**Disabling the legacy `service_role` API key was necessary but NOT sufficient.**
Measured 5 August after it was disabled:

| Surface | Leaked key | |
|---|---|---|
| Data API (PostgREST) | **401** | ✅ closed |
| Storage | **200, full service_role** — lists every bucket including private `verification-docs` | ❌ still open |

Why: the API-key list is enforced at the gateway for the Data API. **Storage
verifies the JWT signature itself** against the legacy HS256 secret, which is
still live as **"PREVIOUS KEY"** on Settings → JWT Keys. A disabled API key whose
signing secret is still trusted is still a working Storage credential.

Confirmed with a control: a garbage token gets `403 Invalid Compact JWS`, the
leaked token authenticates. Not a propagation delay — stable across repeated
calls.

Completed, in this order:

- [x] Disable legacy **`service_role`** API key
- [x] Set GitHub secret `VITE_SUPABASE_ANON_KEY` to the publishable key
      (`android-release.yml:44`, `ota-release.yml:66` bake it into builds)
- [x] Disable legacy **`anon`** API key. Verified safe first: the released APK
      was unpacked and contains the publishable key and *zero* legacy HS256
      JWTs, so no installed app depended on it — no OTA push was needed.
- [x] **Revoke "PREVIOUS KEY"** (legacy HS256) on Settings → JWT Keys. This is
      the step that actually closed Storage; Supabase blocks it until both
      legacy API keys are disabled, which is why it was last.
- [x] Re-ran **both** checks. Data API alone would have given a false all-clear.
- [ ] Send yourself a test notification and confirm it arrives — the one path
      that could not be verified from here.

> **Method note.** An earlier draft of this file said to regenerate the JWT
> secret. That is *not* what was done, and doing it now would be wrong — the
> legacy `anon` key is still in use, and Supabase requires the `anon` and
> `service_role` API keys to be disabled *before* the legacy JWT secret is
> revoked. The migration to publishable/secret keys below achieves the same
> result with no downtime and is reversible.

#### Cut-over already completed

| Step | State |
|---|---|
| `sb_secret_…` secret key created (named `default`) | ✅ |
| GitHub Actions `SUPABASE_SERVICE_ROLE_KEY` → secret key | ✅ |
| DB vault `service_role_key` → secret key | ✅ verified `sb_secret_` prefix in `vault.decrypted_secrets` |
| All 8 edge functions read `SUPABASE_SECRET_KEYS['default']` | ✅ deployed from disk via CLI, all ACTIVE |
| `send-push` accepts the key on the `apikey` header | ✅ v30 |
| `send-push` `verify_jwt = false` (secret keys are not JWTs, so the gateway cannot vet one) | ✅ recorded in `supabase/config.toml` |
| Push trigger sends `apikey` only, no `Authorization` | ✅ migration `20260883` |

Each function keeps a fallback to the legacy variable, so they work either side
of the switch. That fallback is what makes flipping it safe — and what makes it
easy to forget, so do not treat "everything still works" as evidence the key is
off. Re-run the check below.

**Verify it actually took effect — check BOTH surfaces:**

```bash
OLD=$(git show efd5031^:scripts/upload-apk.mjs | grep -oE 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+' | head -1)
H="-H apikey:$OLD -H Authorization:Bearer\ $OLD"

# Data API — closed once the service_role API key is disabled
curl -s -o /dev/null -w "data-api: %{http_code}\n" \
  "https://gnswxlfmcwyhmzlfipql.supabase.co/rest/v1/users?select=id&limit=1" \
  -H "apikey: $OLD" -H "Authorization: Bearer $OLD"

# Storage — only closes when the legacy JWT secret is REVOKED
curl -s -o /dev/null -w "storage:  %{http_code}\n" \
  "https://gnswxlfmcwyhmzlfipql.supabase.co/storage/v1/bucket" \
  -H "apikey: $OLD" -H "Authorization: Bearer $OLD"
```

**Both 401 = done.** Storage returning 200 means the key can still read *and
delete* the 141 objects in `uploads` (avatars, stories, listing photos), even
though the Data API is closed. `verification-docs` is currently empty, so no KYC
documents are exposed — that is luck, not protection, and it changes the moment
someone submits a verification.

#### After it's off

- [ ] Delete authorization **shape 3** in `supabase/functions/send-push/index.ts`
      — it accepts an *unverified* `service_role` JWT claim, which is only
      tolerable while the legacy key still exists. With `verify_jwt = false` the
      gateway no longer checks the signature.
- [ ] Check Supabase logs for API traffic you don't recognise. A 25-day public
      exposure window means "possibly already used", not "probably fine".
- [ ] Consider making the repo **private**. It exposes the full schema,
      migrations and RLS policy logic. Do this *as well as* the rotation, never
      instead of it — the key is already published and repo visibility cannot
      retract it.

### Also before public launch

- [ ] **Delete two orphaned edge functions** — `create-razorpay-order` and
      `verify-razorpay-payment` are deployed but have **no source in this repo**,
      nothing in `src/` calls them (only `screens/future-enhancement/`), and both
      use the legacy service_role key with `Access-Control-Allow-Origin: *`.
      Dead code holding full database access.
- [ ] **Verify the keystore rotation in CI** — the local half is done and the
      three GitHub secrets are updated. Re-run the Android release workflow and
      confirm it logs `Keystore size: 2734 bytes` and produces a signed AAB.
      Then delete `~/stryt-release.keystore.bak`, which still opens with the
      leaked `stryt123`. Runbook: [`KEYSTORE_ROTATION.md`](KEYSTORE_ROTATION.md).
- [ ] **Enable leaked-password protection** in Supabase Auth settings
      (advisor finding; dashboard-only).

### Done

- [x] **26 `SECURITY DEFINER` functions no longer callable by `anon`.**
      Migrations `20260881` + `20260882` applied. Live-verified: the advisor
      count fell 31 → 5 (`get_tracking`, `resolve_admin_email`, and three
      PostGIS `st_estimatedextent` overloads), and an anonymous POST to
      `cancel_expired_agreements` now returns **401** while `get_tracking`
      still returns 200.
      Note `20260881` alone was a no-op: revoking from `anon` leaves the
      inherited PUBLIC grant intact. `20260882` is the one that closed it.
- [x] **Keystore password rotated.** `stryt123` rejected, certificate SHA-1
      unchanged (so the Firebase fingerprint still matches and Google Sign-In is
      unaffected), signed AAB built with the new password.

---

## Device pass — the largest untested risk

Nothing below has been run on physical hardware. For a first public release this
outranks every lint finding.

- [ ] Fresh sign-up through onboarding
- [ ] Book an appointment end to end
- [ ] Delivery run: accept → en route → arrived → handoff, then **"Can't
      deliver"**, then go off duty
- [ ] My People share on/off; confirm the foreground-service notification
- [ ] Background the app 10 minutes with a run active; confirm location still posts
- [ ] Share sheet → QR tab: **profile and payment QRs both scan** (these are
      newly generated on-device), and "Download QR" produces a scannable PNG
- [ ] Delete a test business
- [ ] `/track/:token` opens **signed out** (the one anon RPC left in place)
- [ ] **Push notification arrives after the legacy key is disabled** — the whole
      trigger → `send-push` path was re-plumbed onto the secret key. This is the
      single most likely thing to break, and it fails silently: the trigger
      swallows errors so a notification insert never rolls back
- [ ] **Account deletion completes** — request deletion on a throwaway account,
      then invoke `purge-deleted-accounts` and confirm the row is anonymised.
      This path has never executed in production
- [ ] Map tab opens promptly from a cold start on a real device — the ~320 KB
      gzipped maplibre chunk is now prefetched on idle, but the parse cost only
      shows up on real hardware

---

## Deliberately not doing

| Item | Why |
|---|---|
| `minifyEnabled true` | Needs ProGuard keep rules validated against every Capacitor plugin plus a full device regression. No Play benefit; wrong week |
| Move `postgis` / `pg_net` out of `public` | Supabase-managed extensions; relocating breaks dependent objects for a lint warning |
| `spatial_ref_sys` RLS "ERROR" | PostGIS's own reference table, no user data, not alterable without superuser. Confirmed false positive |
