# STRYT — Deployment Guide

> Complete reference for how STRYT is built, deployed, and updated.
> Covers web (Vercel), Android APK (GitHub Actions), OTA (self-hosted Capgo),
> database (Supabase), and payment model notes.
>
> Compiled 2026-07-17. Grounded in actual config files — every claim is verified.

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
│ git push → auto  │ git push → auto  │ npm run ota:publish       │
│                  │                  │ (manual, you run it)      │
├──────────────────┼──────────────────┼───────────────────────────┤
│ Instant          │ ~5 min build     │ Background download on    │
│ on push          │ then auto-upload │ user's device             │
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

## 4. Path 3 — OTA (Over-The-Air) Updates (Manual)

### What is OTA?

OTA lets you push new JS/CSS/HTML to users who **already have the APK installed** — without them needing to re-download the APK. This uses `@capgo/capacitor-updater` in self-hosted mode (no third-party service — updates live in your own Supabase Storage).

### What happens when you run `npm run ota:publish`?

```
npm run ota:publish
        ↓
Step 1: npm run build         (creates dist/)
        ↓
Step 2: node scripts/publish-ota-update.mjs
   a) Reads version from package.json (e.g. "0.1.1")
   b) Zips entire dist/ folder → bundle-0.1.1.zip
   c) Calculates SHA256 checksum of the zip
   d) Uploads bundle-0.1.1.zip to Supabase Storage (app-updates bucket)
   e) Writes latest.json to same bucket:
      {
        "version": "0.1.1",
        "url": "https://...supabase.co/storage/.../bundle-0.1.1.zip",
        "checksum": "abc123..."
      }
        ↓
DONE on your side — takes ~1-2 minutes
```

### What happens on the user's device AFTER you publish?

```
User opens their installed STRYT app (or brings it to foreground)
        ↓
App checks latest.json via Supabase edge function: /functions/v1/app-update
        ↓
Plugin sees version "0.1.1" > current installed version
→ starts download silently in the background
        ↓
User uses the app normally — download is invisible, no interruption
        ↓
Download + checksum verification completes
        ↓
"Update available" button appears on profile screen
        ↓
User taps it → app reloads with new code instantly (WebView hot-swap)
```

### Does the download start INSTANTLY when you publish?

**YES** — the moment you publish, the `latest.json` file is updated in Supabase Storage. The next time any user opens the app (or brings it from background to foreground), their device checks this file and begins downloading immediately. There is no delay on STRYT's side. The only wait is the user opening the app.

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

## 5. Automating OTA — How to Do It

Currently OTA is manual. It can be added to the GitHub Actions workflow so it fires automatically on every push to `main` alongside the APK build.

### Step 1 — Add SUPABASE_SERVICE_ROLE_KEY to GitHub Secrets

Go to: GitHub repo → Settings → Secrets and variables → Actions → New secret

| Secret | Where to find it |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API → service_role key |

### Step 2 — Add these steps to `.github/workflows/android-release.yml`

Add them **after** the "Upload APK to Supabase Storage" step:

```yaml
- name: Bump OTA patch version
  run: |
    node -e "
      const fs = require('fs');
      const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));
      const [maj, min, patch] = pkg.version.split('.').map(Number);
      pkg.version = maj + '.' + min + '.' + (patch + 1);
      fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
      console.log('OTA version bumped to', pkg.version);
    "

- name: Publish OTA bundle to Supabase
  env:
    SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
  run: node scripts/publish-ota-update.mjs
```

### Result after automation

```
git push origin main
        ↓
GitHub Actions runs all steps:
  ✅ Builds Vite web bundle
  ✅ Syncs to Android, compiles signed APK
  ✅ Uploads APK to Supabase Storage
  ✅ Publishes GitHub Release (android-latest)
  ✅ Auto-bumps version: 0.1.0 → 0.1.1       ← NEW
  ✅ Publishes OTA bundle to Supabase         ← NEW
        ↓
Every existing installed app picks up the update on next open.
Every new download gets the updated APK.
Web users at stryt.in see it instantly.
```

Zero manual steps for any deployment type.

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

# Publish OTA update manually
npm run ota:publish
```

---

## 9. Quick Reference

| Action | Command / Trigger | Automated? |
|---|---|---|
| Update web app at stryt.in | `git push` to main | ✅ Auto (Vercel) |
| Build new Android APK | `git push` to main | ✅ Auto (GitHub Actions) |
| Push update to existing installed users | `npm run ota:publish` | ❌ Manual — can be automated (see §5) |
| Apply new DB migrations | `npx supabase db push` | ❌ Manual |
| Regenerate TypeScript DB types | `npx supabase gen types typescript ...` | ❌ Manual |
