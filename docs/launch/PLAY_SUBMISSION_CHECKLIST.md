# Play Store submission checklist

**App:** STRYT · `in.stryt.app` · v1.0.4 · targetSdk 36 / minSdk 24
**Written:** 4 August 2026
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

### 🔴 P0 — the `service_role` key in git history is STILL LIVE

**Verified 4 August 2026, not assumed.** The `service_role` JWT hardcoded in
`scripts/upload-apk.mjs` before commit `efd5031` was recovered from git history
and used to query `/rest/v1/users` — it returned **HTTP 200**. It was never
rotated.

That key bypasses RLS completely: read, modify or delete every row in the
database, and read the private `verification-docs` bucket (customer KYC
documents). Anyone who has cloned this repo, or ever had read access to it, holds
it. **This outranks every Play item on this page.**

Rotate before the listing goes public:

- [ ] Supabase Dashboard → **Settings → API → JWT Settings → Generate new JWT
      secret**. This invalidates the leaked `service_role` key *and* the legacy
      `anon` JWT at once.
- [ ] Update the **`SUPABASE_SERVICE_ROLE_KEY`** GitHub Actions secret — used by
      `android-release.yml`, `ota-release.yml`, `purge-deleted-accounts.yml`.
      Nothing else picks it up automatically.
- [ ] Set the **`VITE_SUPABASE_ANON_KEY`** GitHub Actions secret to the
      **publishable** key (`sb_publishable_…`) if it still holds the legacy anon
      JWT, or CI builds break on the next run.
- [ ] Redeploy once and confirm push, OTA publish and account purge still work.

**Blast radius is small, which is why this is worth doing today:** the shipped
client already uses the publishable key (`sb_publishable_…` is what's in
`dist/assets/index-*.js`, not the legacy anon JWT), and every edge function reads
the **auto-injected** `SUPABASE_SERVICE_ROLE_KEY`, which Supabase refreshes on
rotation. The only manual updates are the GitHub secrets above.

### Also before public launch

- [ ] **Finish the keystore password rotation** — the local half is **done and
      verified** (old `stryt123` rejected, certificate SHA-1 unchanged, a signed
      AAB built with the new password). Three GitHub secrets still need updating:
      `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
      `ANDROID_KEY_PASSWORD`. Full runbook:
      [`KEYSTORE_ROTATION.md`](KEYSTORE_ROTATION.md).
- [ ] **Enable leaked-password protection** in Supabase Auth settings
      (advisor finding; dashboard-only).

### Done

- [x] **26 `SECURITY DEFINER` functions no longer callable by `anon`.**
      Migrations `20260881` + `20260882` applied. Live-verified: the advisor
      count fell 31 → 5 (`get_tracking`, `resolve_admin_email`, and three
      PostGIS `st_estimatedextent` overloads), and an anonymous POST to
      `cancel_expired_agreements` now returns **401** while `get_tracking`
      still returns 200.

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

---

## Deliberately not doing

| Item | Why |
|---|---|
| `minifyEnabled true` | Needs ProGuard keep rules validated against every Capacitor plugin plus a full device regression. No Play benefit; wrong week |
| Move `postgis` / `pg_net` out of `public` | Supabase-managed extensions; relocating breaks dependent objects for a lint warning |
| `spatial_ref_sys` RLS "ERROR" | PostGIS's own reference table, no user data, not alterable without superuser. Confirmed false positive |
