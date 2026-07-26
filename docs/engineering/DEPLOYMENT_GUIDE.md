# STRYT — Deployment Guide

> Complete reference for how STRYT is built, deployed, and updated.
> Covers web (Vercel), Android APK (GitHub Actions), OTA (self-hosted Capgo),
> database (Supabase), and payment model notes.
>
> Compiled 2026-07-17, corrected 2026-07-26 — §4/§5 were written when OTA was
> still a manual step; `.github/workflows/ota-release.yml` has since automated
> it, and the "Update available" button described below never actually
> existed. Grounded in actual config files — every claim is verified.

---

## 1. Overview — Three Deployment Paths

STRYT has three separate things to deploy, and they are **independent of each other**:

```
┌─────────────────────────────────────────────────────────────────┐
│                      STRYT DEPLOYMENT MAP                       │
├──────────────────┬──────────────────┬───────────────────────────┤
│   WEB APP        │   ANDROID APK    │   OTA UPDATE              │
│   (Vercel)       │   (GitHub CI)    │   (Supabase Storage)      │
├──────────────────┼──────────────────┼───────────────────────────┤
│ git push → auto  │ git push → auto  │ git push → auto           │
│                  │                  │ (or `npm run ota:publish` │
│                  │                  │  manually, one-off)       │
├──────────────────┼──────────────────┼───────────────────────────┤
│ Instant          │ ~5 min build     │ Downloads on next app     │
│ on push          │ then auto-upload │ open; APPLIES on next     │
│                  │                  │ background→reopen cycle   │
└──────────────────┴──────────────────┴───────────────────────────┘
```

---

## 2. Path 1 — Web App on Vercel (Auto)

**Trigger:** Every `git push` to `main`

**What happens:**
```
git push origin main
        ↓
Vercel detects push automatically
        ↓
Runs: npm run build (tsc + vite build)
        ↓
Deploys compiled dist/ to Vercel CDN
        ↓
https://stryt.in is updated instantly
```

**Config files:**
- `vercel.json` — rewrites, security headers, /stryt.apk redirect
- `vite.config.ts` — build configuration

**Key vercel.json rules:**
- All routes rewrite to `/index.html` (React Router SPA support)
- `/stryt.apk` redirects to the APK in Supabase Storage
- Security headers set: `X-Frame-Options: DENY`, `Permissions-Policy`, CSP

**Zero manual steps required.** Push code → web users see the update.

---

## 3. Path 2 — Android APK via GitHub Actions (Auto)

**Trigger:** Every `git push` to `main` OR manual trigger from GitHub Actions tab

**Workflow file:** `.github/workflows/android-release.yml`

**What happens step by step:**

```
git push origin main
        ↓
GitHub Actions runner (ubuntu-latest) spins up
        ↓
1. npm ci                          (install dependencies)
2. Write .env from GitHub Secrets  (Supabase, Firebase, Mapbox keys)
3. npm run build                   (Vite web bundle → dist/)
4. npx cap sync android            (copy dist/ into Android project)
5. ./gradlew assembleRelease       (compile signed APK)
   — Signs with keystore from ANDROID_KEYSTORE_BASE64 secret
        ↓
6. node scripts/upload-apk.mjs    (upload stryt.apk to Supabase Storage)
7. GitHub Release created          (tag: android-latest, file: stryt.apk)
        ↓
https://stryt.in/stryt.apk now serves the new APK
```

**Build time:** ~5 minutes end-to-end.

**GitHub Secrets required** (set in repo Settings → Secrets):

| Secret | What it is |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `VITE_FIREBASE_API_KEY` | Firebase API key |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |
| `VITE_MAPBOX_TOKEN` | Mapbox map token |
| `ANDROID_KEYSTORE_BASE64` | Release keystore (base64 encoded) |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias |
| `ANDROID_KEY_PASSWORD` | Key password |

**Who gets this update?**
- New users downloading the APK get the new version
- **Existing installed users do NOT** — they need an OTA update (see Path 3)

---

## 4. Path 3 — OTA (Over-The-Air) Updates (Automatic)

### What is OTA?

OTA lets you push new JS/CSS/HTML to users who **already have the APK installed** — without them needing to re-download the APK. This uses `@capgo/capacitor-updater` in self-hosted mode (no third-party service — updates live in your own Supabase Storage).

### What happens on every push to `main`?

`.github/workflows/ota-release.yml` runs automatically:

```
git push → main
        ↓
Step 1: npm run build                              (creates dist/, using the
                                                      NEXT patch version)
        ↓
Step 2: node scripts/publish-ota-update.mjs
   a) Reads version from package.json (e.g. "0.1.18")
   b) Zips entire dist/ folder → bundle-0.1.18.zip
   c) Calculates SHA256 checksum of the zip
   d) Uploads bundle-0.1.18.zip to Supabase Storage (app-updates bucket) —
      this object is never overwritten again, so it stays available for rollback
   e) Writes latest.json to same bucket (this one IS overwritten each publish):
      {
        "version": "0.1.18",
        "url": "https://...supabase.co/storage/.../bundle-0.1.18.zip",
        "checksum": "abc123..."
      }
        ↓
Step 3: ONLY if step 2 succeeded — commit + push the version bump to package.json.
        (If the build or publish fails, main's version is left untouched —
        it used to bump-then-build, which could leave a version number with
        no bundle actually published behind it.)
```

You can also run this manually for a one-off publish without a full commit: `npm run ota:publish` (same script, no version-bump/commit step — bumps nothing, just builds and publishes whatever version is currently in `package.json`).

**Rollback:** `bundle-<version>.zip` objects are kept, never deleted — only `latest.json`'s pointer moves. To roll back to a previously-published version without rebuilding: `SUPABASE_SERVICE_ROLE_KEY=... npm run ota:rollback -- 0.1.15` (repoints `latest.json` at that version's already-uploaded bundle). This does not downgrade devices already running something newer — it only affects what NEW update-checks are offered.

### What happens on the user's device AFTER you publish?

```
User opens their installed STRYT app (or brings it to foreground)
        ↓
Plugin POSTs an update check to /functions/v1/app-update
        ↓
Edge function returns the latest.json manifest — UNLESS a MIN_NATIVE_VERSION
floor is set for this release and the device's native build is older, in
which case it returns "no update available" instead (so a device that lacks
a plugin/permission this bundle assumes is never offered it)
        ↓
Plugin sees the returned version > current bundle version
→ downloads it silently in the background, verifies the checksum
        ↓
Update is now STAGED, not yet applied — nothing visible changes yet
        ↓
The NEXT time the app is sent to the background and reopened (autoUpdate:
'atBackground'), the staged bundle is swapped in
```

**There is no in-app "Update available" UI at all** — no button, no banner, no toast. It's fully silent by design (the Swiggy/Zepto-style pattern the original config comment describes). `src/lib/nativeApp.ts` does log each stage (`[ota] updateAvailable`, `downloadComplete`, `appReloaded`, etc.) to the console if you need to confirm it's actually happening on a connected/debuggable device.

### How to actually test this (read this before assuming it's broken)

Publishing and then just **staying in the foreground of the app will never show anything change**, no matter how long you wait — the apply step only fires on background→reopen. Correct test procedure:

1. Publish (push to `main`, or `npm run ota:publish`) and confirm the workflow went green.
2. Open the installed app.
3. Press the home button — **actually background it**, don't just stay in-app.
4. Wait a few seconds.
5. Reopen the app. The new bundle should now be active.

If step 5 doesn't show the change, check (in order): the OTA workflow actually succeeded for that push; `app-update` isn't withholding it behind a `MIN_NATIVE_VERSION` floor you forgot was set; the installed app is a CI-built release (a manually/locally-built APK may have a stale `capacitor.config.ts` version baked in from whenever it was last `cap sync`'d, which can make every OTA bundle look like a downgrade).

### OTA Limitations — Critical

> **OTA can ONLY push changes to JS / CSS / HTML (the web bundle).**
>
> It CANNOT:
> - Add a new Capacitor plugin (e.g., adding camera plugin)
> - Change Android permissions in AndroidManifest.xml
> - Modify native Java/Kotlin Android code
> - Change anything in `capacitor.config.ts` that requires native rebuild
>
> For any of those, a full APK release via GitHub Actions is required.
> Devices on an older APK that lack a plugin you now call will crash.

### When to use OTA vs Full APK release

| Change type | Use |
|---|---|
| Bug fix in React component | `npm run ota:publish` |
| New screen / feature (pure web) | `npm run ota:publish` |
| UI redesign, CSS changes | `npm run ota:publish` |
| New Capacitor plugin added | Full APK via `git push` |
| New Android permission required | Full APK via `git push` |
| `capacitor.config.ts` changes | Full APK via `git push` |

---

## 5. OTA automation — already done

This section used to be a walkthrough for adding OTA automation. It's done — `.github/workflows/ota-release.yml` is a **separate** workflow from `android-release.yml` (not steps bolted onto the APK build as originally proposed here), triggered on every push to `main` that isn't purely android/docs/readme changes (see the workflow's `paths-ignore`). See §4 above for exactly what it does and how versioning/rollback work.

Two things worth knowing that aren't obvious from the workflow file alone:

- **The two release workflows are independent and uncoordinated.** A push touching both `src/` and something native-requiring fires both `android-release.yml` and `ota-release.yml` — nothing stops an OTA bundle from publishing code that assumes a plugin/permission the currently-installed native shell doesn't have. `scripts/publish-ota-update.mjs`'s own header warns about this; the `MIN_NATIVE_VERSION` floor on `app-update` (§4) is the mitigation, but it has to be set deliberately per release — it's not automatic.
- **`android-release.yml` requires a `GOOGLE_SERVICES_JSON_BASE64` secret** (base64 of `android/app/google-services.json`, decoded in a step before the Gradle build) — the native Android build cannot succeed without it, since `android/app/build.gradle` applies the `com.google.gms.google-services` plugin which hard-fails without that file present.

---

## 6. Database — Supabase Migrations (Manual)

Migrations are not automated — apply manually:

```bash
# Apply all pending migrations to remote Supabase project
npx supabase db push

# Regenerate TypeScript types after schema changes
npx supabase gen types typescript \
  --project-id gnswxlfmcwyhmzlfipql \
  > src/types/database.types.ts
```

Migration files live in `supabase/migrations/`.

> **Never skip migrations when pushing new code that uses new RPCs or columns.**
> The TypeScript build will pass (types may be stale) but the app will fail
> at runtime with "function does not exist" errors.

---

## 7. Payment Model — UPI Direct (No Platform Fee)

STRYT does **not process payments**. It is a coordination layer only.

### How it works

```
Customer taps "Pay" in STRYT
        ↓
STRYT opens UPI intent deeplink:
upi://pay?pa=business@ybl&pn=ShopName&am=100&cu=INR&tn=Booking+Payment
        ↓
Customer's UPI app (GPay / PhonePe / BHIM / Paytm) opens
Customer enters PIN → payment goes DIRECTLY bank-to-bank
STRYT never sees the money — zero cut, zero processing fee
        ↓
If business has a PhonePe Soundbox linked to their merchant UPI ID:
→ Soundbox announces payment regardless of which app customer used 🔊
        ↓
Customer taps "I've Paid" in STRYT
Status → PENDING_CONFIRM
        ↓
Business taps "Confirm" in STRYT console
Status → PAID ✓
```

### Why this model

| Fact | Detail |
|---|---|
| **Legally compliant** | UPI deeplinks are an official NPCI standard — used by Zomato, Swiggy, Amazon |
| **Zero platform fee** | ₹10 paid → ₹10 received. No gateway MDR cut |
| **No RBI license needed** | STRYT doesn't touch the money flow at any point |
| **Soundbox compatible** | Any payment to a merchant UPI ID rings the soundbox, any UPI app |
| **Safe for customer** | PIN and bank details never reach STRYT servers |

### Current gap — No auto-confirm timer

When a customer claims payment (`PENDING_CONFIRM`), there is currently no timeout fallback.

**What exists today:**

| Timer | What it does | Duration |
|---|---|---|
| ✅ Payment reminder notification | Nudges customer who never paid | After 24 hours |
| ✅ Auto-CANCEL agreement | Kills deal if no payment ever made | After 72 hours |
| ❌ Auto-confirm PENDING_CONFIRM | Not built yet | — |

**Planned migration** — add to `cancel_expired_agreements()`:

```sql
-- Auto-confirm stale payment claims the business ignored for 4+ hours
UPDATE public.appointments
SET payment_status = 'PAID'
WHERE payment_status = 'PENDING_CONFIRM'
  AND payment_claimed_at < now() - interval '4 hours';

UPDATE public.agreements
SET payment_status = 'PAID'
WHERE payment_status = 'PENDING_CONFIRM'
  AND payment_claimed_at < now() - interval '4 hours';
```

---

## 8. Local Development

```bash
# Install dependencies
npm install

# Start local dev server (hot reload at localhost:5173)
npm run dev

# Type-check without building
npm run lint

# Run unit tests
npm test

# Run full Playwright E2E audit
npm run audit

# Build production bundle only
npm run build

# Build + sync to Android (requires Android Studio + connected device or emulator)
npm run cap:sync

# Build + run directly on connected Android device
npm run cap:run

# Publish OTA update manually (auto-runs on push to main; this is for a one-off)
npm run ota:publish

# Roll back the OTA pointer to a previously-published version
SUPABASE_SERVICE_ROLE_KEY=... npm run ota:rollback -- 0.1.15
```

---

## 9. Quick Reference

| Action | Command / Trigger | Automated? |
|---|---|---|
| Update web app at stryt.in | `git push` to main | ✅ Auto (Vercel) |
| Build new Android APK | `git push` to main | ✅ Auto (GitHub Actions) |
| Push update to existing installed users | `git push` to main | ✅ Auto (`.github/workflows/ota-release.yml`) |
| Apply new DB migrations | `npx supabase db push` | ❌ Manual |
| Regenerate TypeScript DB types | `npx supabase gen types typescript ...` | ❌ Manual |
