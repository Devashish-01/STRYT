# Executive Audit & Status Report: Play Store Submission Checklist

**App Target:** STRYT (`in.stryt.app`)  
**Version:** `v1.0.4` (Target SDK: 36 | Min SDK: 24)  
**Source Document:** [PLAY_SUBMISSION_CHECKLIST.md](file:///d:/zetax/name/STRYT/docs/launch/PLAY_SUBMISSION_CHECKLIST.md)  
**Report Date:** August 6, 2026  

---

## 📌 Executive Summary

This report provides a structured synthesis of the launch readiness for the **STRYT** Android application. The codebase is technically sound, signed, and policy-compliant at the code level. However, a **critical P0 security vulnerability** (live `service_role` key in git history) and **mandatory Play Console policy paperwork** gate public publication.

---

## 📑 1. Core App Specifications & Declarations

| Requirement / Declaration | Status | Basis & Implementation Details |
|---|---|---|
| **App Identity** | Verified | Package ID: `in.stryt.app` · Target SDK: `36` · Min SDK: `24` |
| **Developer Program Policies** | **YES** | Attestation complete. Code meets policy rules. |
| **Play App Signing ToS** | **YES** | CI emits signed AAB (`bundleRelease`). Key injected via CI env. |
| **US Export Laws** | **YES** | Standard HTTPS/TLS only. Mass-market exemption applies. |

---

## 💻 2. Code-Level Implementation Checklist (Completed ✅)

All technical code requirements for Google Play compliance have been implemented and verified in the repository:

- ✅ **Battery Optimization:** `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` prompted **only** when delivery drivers go on duty (`src/lib/batteryOptimization.ts` → `DeliveryConsole.tsx:170`), avoiding Play rejection.
- ✅ **Prominent Location Disclosure:** Prominent pre-permission disclosure implemented for background location in `useLiveShare.tsx:142` and `DeliveryConsole.tsx:494`.
- ✅ **Account Deletion:** Public account deletion webpage available without login (`legal/account-deletion.md` → `https://stryt.in/legal/account-deletion`).
- ✅ **Privacy & Security:** On-device QR generation (no merchant UPI IDs sent to external servers); CSP enforced in `vercel.json`; `allowBackup=false` set.
- ✅ **Manifest Configuration:** `foregroundServiceType="location"` declared via `@capgo/background-geolocation` manifest merge.

---

## 📋 3. Play Console Administrative & Policy Tasks (Action Required 🔴)

The following forms and metadata must be completed in the Google Play Console:

1. **Background Location Declaration:** Submit justification form + demo video covering live location sharing and delivery runs (`docs/launch/play-console/BACKGROUND_LOCATION_DECLARATION.md`).
2. **Data Safety Section:** Complete code-derived data safety answers (`docs/launch/play-console/DATA_SAFETY.md`).
3. **App Access Credentials:** Submit Google test accounts with **2FA turned OFF** and real-device pre-sign-in completed (`docs/launch/play-console/APP_ACCESS.md`).
4. **Mandatory Store URLs:**
   - **Privacy Policy:** `https://stryt.in/legal/privacy-policy` *(Verified HTTP 200)*
   - **Account Deletion:** `https://stryt.in/legal/account-deletion`
5. **Questionnaires & Declarations:**
   - Content Rating Questionnaire (IARC)
   - Target Audience (Declare 18+, not directed to children)
   - Ads (Declare **NO** ads)
   - Financial Features (Declare **NONE**)
6. **Store Listing Assets:** Name, Short & Full Descriptions, 512×512 icon (`public/icon-512.png`), 1024×500 feature graphic, and phone screenshots.

---

## 🔒 4. Security Audit Findings & Mandatory Actions

### 🔴 P0 Critical Blocker — `service_role` Key Rotation (IMMEDIATE ACTION)
* **Finding:** A `service_role` JWT committed in early git history (`scripts/upload-apk.mjs` @ `efd5031`) was tested and confirmed **active (HTTP 200)**.
* **Risk:** Bypasses Supabase RLS completely, granting full read/write/delete access to all database tables and private customer KYC documents (`verification-docs`).
* **Required Action:**
  1. Go to **Supabase Dashboard → Settings → API → JWT Settings → Generate new JWT secret**. (Invalidates leaked key).
  2. Update `SUPABASE_SERVICE_ROLE_KEY` in GitHub Actions secrets.
  3. Update `VITE_SUPABASE_ANON_KEY` in GitHub Actions secrets to `sb_publishable_...`.
  4. Redeploy CI pipeline once to confirm push, OTA, and account deletion jobs work.

### 🟡 Pre-Launch Security & Fixes
- **Keystore Password Rotation:** Update GitHub secrets (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`). Follow [KEYSTORE_ROTATION.md](file:///d:/zetax/name/STRYT/docs/launch/KEYSTORE_ROTATION.md).
- **Leaked-Password Protection:** Enable in Supabase Auth settings dashboard.
- ✅ **Completed:** 26 `SECURITY DEFINER` functions restricted from anonymous execution.

---

## 📱 5. Physical Device Testing Pass (Pre-Upload Gate)

Before uploading to production, execute the manual physical device test suite:

- [ ] Fresh user sign-up & onboarding flow.
- [ ] End-to-end appointment booking.
- [ ] Delivery run workflow (Accept → En route → Arrived → Handoff → "Can't deliver" → Off duty).
- [ ] My People live-location share toggle & persistent FGS notification check.
- [ ] 10-minute app backgrounding test to confirm location updates persist.
- [ ] Scan on-device generated profile & payment QR codes.
- [ ] Delete test business & test signed-out tracking link (`/track/:token`).

---

## ⚙️ 6. Deliberately Deferred Items

| Item | Reason for Deferral |
|---|---|
| `minifyEnabled true` | Requires ProGuard keep rules validation against all Capacitor plugins; deferred to avoid runtime regressions. |
| Move `postgis` / `pg_net` out of `public` | Supabase managed extensions; moving breaks dependent objects. |
| `spatial_ref_sys` RLS Warning | PostGIS system reference table (no user data); confirmed false positive. |
