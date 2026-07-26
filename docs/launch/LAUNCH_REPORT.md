# STRYT Launch Report — Done vs. Your To-Do

**Scope:** Google Play Store + website (`stryt.in`) + Android app (APK download)  
**App:** STRYT `in.stryt.app` · v`0.1.15`  
**Last updated:** 26 July 2026

---

## Summary

Code-level launch blockers have been addressed in the repo. **You still need to complete legal publication, secrets/env setup, Play Console submission, and QA** before a public launch.

| Area | Code status | Your action needed |
|------|-------------|-------------------|
| Android crash on sign-in | Fixed | Optional: Firebase for push later |
| Product bugs (likes, chat badge) | Fixed | QA on device |
| Account deletion automation | Workflow added | Add GitHub secret + deploy function |
| Legal / policies | Not in code | Fill operator details + publish |
| Play Store listing | Not in code | Manual Console steps |
| Production secrets | Documented | Vercel + Supabase + GitHub |

---

## Part 1 — What was done (in code)

### A. UI / UX fixes

| Change | Why |
|--------|-----|
| **Map radius strip no longer overlaps bottom nav** | Distance selector (`500m`, `1km`, etc.) was sitting on top of Home/Map/Create/Profile tabs |
| Added `--map-radius-strip-bottom` CSS variable | Positions map overlays above the 66px nav bar |
| Improved radius strip scrolling & opacity | Stops map colors bleeding through; fixes right-edge clipping |

**Files:** `src/index.css`, `src/screens/MapView/RadiusStrip.tsx`, `MapView/index.tsx`, `MapControllers.tsx`, `LocationPinDrop.tsx`

---

### B. Android stability (critical)

| Change | Why |
|--------|-----|
| Set `FCM_READY = false` | Without `google-services.json`, push registration crashed the app on every sign-in |

**File:** `src/lib/pushNotifications.ts`

> When Firebase is ready: add `android/app/google-services.json`, rebuild, then set `FCM_READY = true`.

---

### C. Store / compliance hygiene

| Change | Why |
|--------|-----|
| Removed fake stats (“10K+ Locals”, “4.9★ Rating”) | Play Store policy risk for misleading claims |
| Replaced with neutral feature labels on Splash | “Local discovery”, “Trusted providers”, etc. |
| **First-admin claim button → dev builds only** | Prevents privilege escalation on production |
| Removed hardcoded keystore passwords from Gradle | Security — CI already injects signing via secrets |
| Gitignored `client_secret_*.json` | Stops OAuth secrets being committed again |
| Added `.env.example` | Documents all required production variables |
| Fixed `.gitignore` so `.env.example` can be committed | Was blocked by `.env*` rule |

**Files:** `src/screens/auth/PhoneEntry.tsx`, `src/screens/Splash.tsx`, `src/screens/admin/AdminPanel.tsx`, `android/app/build.gradle`, `.gitignore`, `.env.example`

---

### D. Product bug fixes

| Bug | Fix |
|-----|-----|
| **Community like reverts** | Optimistic like state only clears when server state matches |
| **Chat unread badge wrong scope** | Customer nav badge only updates for personal inbox chats, not business/provider inboxes |

**Files:** `src/components/cards.tsx`, `src/screens/CommunityPostDetail.tsx`, `src/services/engagement/chatService.ts`, `src/screens/chat/ChatThread.tsx`

*(Conversation list unread logic was already correct in code.)*

---

### E. Account deletion (Play / website policy)

| Change | Why |
|--------|-----|
| Block deletion upfront if **HELD** payments exist | Clear error before user schedules deletion |
| Auto-refund HELD payments after 30-day grace on purge | Stops accounts being stuck forever |
| **Daily GitHub Actions cron** to run `purge-deleted-accounts` | Users who never reopen app still get purged |
| Updated migration note | Points to the new workflow |
| Removed dead `sync-bug-report` edge call | Was 404ing silently |
| Removed stale `sos-alert` from Supabase config | Function was deleted |

**Files:** `src/services/core/profileControlService.ts`, `supabase/functions/purge-deleted-accounts/index.ts`, `.github/workflows/purge-deleted-accounts.yml`, `src/services/core/supportService.ts`, `supabase/config.toml`, `supabase/migrations/20260725_self_serve_account_deletion.sql`

---

### F. CI / build

| Change | Why |
|--------|-----|
| Added `VITE_VAPID_PUBLIC_KEY` to Android release workflow | Web push works in production APK builds |

**File:** `.github/workflows/android-release.yml`

---

## Part 2 — What you must do

### Priority 1 — Before any public users (P0)

#### 1. Legal documents

- [ ] Fill `legal/operator.yaml`:
  - `operator_legal_name`
  - `registered_address`
  - `grievance_officer_name`
  - `grievance_officer_phone`
- [ ] Run: `node scripts/apply-legal-operator.mjs`
- [ ] Get legal counsel review
- [ ] Bump `LEGAL_VERSION` in `src/lib/legal.ts` to match publication date
- [ ] Redeploy website so `https://stryt.in/legal/*` is live

#### 2. GitHub secrets

Add in **GitHub → Repo → Settings → Secrets and variables → Actions**:

| Secret | Purpose |
|--------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | Daily account purge cron |
| `VITE_VAPID_PUBLIC_KEY` | Web push in Android CI builds (if missing) |

*(You likely already have `VITE_SUPABASE_URL`, Firebase keys, Android keystore secrets.)*

#### 3. Deploy updated edge function

```bash
supabase functions deploy purge-deleted-accounts
```

#### 4. Vercel production environment

Set all vars from `.env.example`, especially:

- [ ] `VITE_SUPABASE_URL`
- [ ] `VITE_SUPABASE_ANON_KEY`
- [ ] `VITE_FIREBASE_*` (all 6)
- [ ] `VITE_VAPID_PUBLIC_KEY`

#### 5. Supabase edge secrets

In **Supabase Dashboard → Edge Functions → Secrets**:

- [ ] `SMTP_PASS` — support ticket emails
- [ ] `VAPID_PRIVATE_KEY` — browser push
- [ ] `FIREBASE_SERVICE_ACCOUNT` — Android push (when ready)

#### 6. Security rotation (exposed in git history)

- [ ] Rotate Android keystore passwords (old `stryt123` was in repo)
- [ ] Revoke/rotate `android/app/client_secret_*.json` in Google Cloud Console
- [ ] Rotate Supabase service role key if it was ever committed

#### 7. Bootstrap admin (before launch)

- [ ] Create your admin account via SQL / service role
- [ ] Do **not** rely on the in-app claim button (production builds hide it)

---

### Priority 2 — Google Play Store (manual)

- [ ] Create app in Play Console: `in.stryt.app`
- [ ] Enable Play App Signing
- [ ] Download latest **AAB** from GitHub Actions artifact (`stryt-playstore-aab`)
- [ ] Upload to **Internal testing** track first
- [ ] Complete **store listing**:
  - App name, short + full description
  - Phone screenshots
  - Icon 512×512 (`public/icon-512.png`)
  - **Feature graphic 1024×500** (still needed — derive from `public/og-image.png`)
- [ ] **Data safety form** (location, personal info, messages, device IDs)
- [ ] **Background location declaration** — see `docs/launch/play-console/BACKGROUND_LOCATION_DECLARATION.md`
- [ ] Content rating questionnaire
- [ ] Target audience: not children
- [ ] Ads: none
- [ ] Privacy policy URL: `https://stryt.in/legal/privacy-policy`
- [ ] QA on Internal track → promote to Production

---

### Priority 3 — Website + APK launch

- [ ] Deploy latest build to Vercel (`stryt.in`)
- [ ] Verify Google OAuth redirect includes `stryt.in`
- [ ] Test APK download from Splash / Login / Settings
- [ ] Confirm latest CI-built APK installs and signs in without crash
- [ ] Smoke test: sign up → onboard → map → chat → delete account flow

---

### Priority 4 — Push notifications (optional for v1)

Push is **disabled** (`FCM_READY = false`) so the app won’t crash. To enable later:

- [ ] Create Firebase project
- [ ] Add `android/app/google-services.json`
- [ ] Rebuild APK/AAB (`npx cap sync android` + Gradle)
- [ ] Set `FCM_READY = true` in `src/lib/pushNotifications.ts`
- [ ] Configure `FIREBASE_SERVICE_ACCOUNT` in Supabase

---

### Priority 5 — QA checklist

- [ ] Real Android phone: sign-in, map, radius selector, My People background location
- [ ] Website on Chrome Android
- [ ] Community: like/unlike a post
- [ ] Chat: open thread, confirm unread badge clears
- [ ] Settings → schedule account deletion → cancel → complete after grace (staging)
- [ ] Run automated tests: `npm run audit`

---

## Suggested launch timeline

```
Week 1
├── Publish legal pack
├── Set GitHub + Vercel + Supabase secrets
├── Deploy purge edge function
└── Rotate exposed credentials

Week 2
├── Website soft launch (stryt.in + APK download)
├── Play Console Internal testing upload
└── Device QA

Week 3+
├── Play Store Production
└── Firebase push (optional)
```

---

## Files changed

| Category | Files |
|----------|-------|
| **UI** | `src/index.css`, `src/screens/MapView/RadiusStrip.tsx`, `src/screens/MapView/index.tsx`, `src/screens/MapView/MapControllers.tsx`, `src/screens/MapView/LocationPinDrop.tsx` |
| **Stability** | `src/lib/pushNotifications.ts` |
| **Compliance** | `src/screens/auth/PhoneEntry.tsx`, `src/screens/Splash.tsx`, `src/screens/admin/AdminPanel.tsx`, `.env.example`, `.gitignore` |
| **Bugs** | `src/components/cards.tsx`, `src/screens/CommunityPostDetail.tsx`, `src/services/engagement/chatService.ts`, `src/screens/chat/ChatThread.tsx` |
| **Deletion** | `src/services/core/profileControlService.ts`, `supabase/functions/purge-deleted-accounts/index.ts`, `supabase/migrations/20260725_self_serve_account_deletion.sql` |
| **Infra** | `android/app/build.gradle`, `.github/workflows/android-release.yml`, `.github/workflows/purge-deleted-accounts.yml`, `supabase/config.toml`, `src/services/core/supportService.ts` |

---

## Related docs in repo

| File | Purpose |
|------|---------|
| `legal/operator.yaml` | Fill before launch |
| `legal/README.md` | Legal publish workflow |
| `docs/launch/play-console/BACKGROUND_LOCATION_DECLARATION.md` | Play Console copy |
| `docs/plans/app-plans/PLAY_STORE_CHECKLIST.md` | Full Play Store checklist |
| `docs/README.md` | Documentation index |
| `.env.example` | Required environment variables |

---

## Bottom line

**Done in code:** crash fix, UI overlap fix, product bugs, deletion automation wiring, security hygiene, env documentation.

**Still on you:** legal publication, secrets/env, Play Console, credential rotation, admin bootstrap, and real-device QA.
