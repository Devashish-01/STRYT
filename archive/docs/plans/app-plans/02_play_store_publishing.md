# Task 2 — Play Store Publishing (code + files)

## Goal
Everything code/file-side needed to ship on Google Play, plus a checklist for
the manual Play Console steps.

## Current state (verified)
- Capacitor Android project at `android/`. CI (`android-release.yml`) builds a
  **signed APK** and uploads to Supabase Storage + a GitHub Release.
- App id: `in.stryt.app` (Capacitor config). Signing via GH secrets
  `ANDROID_KEYSTORE_*`.
- No **AAB** (Android App Bundle) build — Play requires `.aab` for new apps.
- Version managed by `package.json` version bump (OTA workflow).

## Code / file work (implement)
- [ ] Add a **`bundleRelease`** step producing `app-release.aab`, signed with the
      same keystore, and upload it as a CI artifact + attach to the GH Release.
- [ ] Ensure `android/app/build.gradle` has correct `applicationId`,
      `versionCode` (monotonic int) and `versionName`; derive `versionCode` from
      CI run number or package version so each upload increments.
- [ ] Confirm release `minifyEnabled` / `shrinkResources` + `proguard-rules.pro`
      keep Capacitor + plugins (add keep rules if needed).
- [ ] Adaptive launcher icons + Play store 512 icon + feature graphic references
      (generate from brand mark; place under `android/app/src/main/res/`).
- [ ] Audit `AndroidManifest.xml` permissions — remove anything unused
      (location, notifications, camera) and ensure each maps to a Play
      data-safety declaration.
- [ ] `network_security_config` review (no cleartext except required).

## Manual (Play Console) — documented, cannot automate here
- Create app, set package `in.stryt.app`.
- Data safety form (location, personal info, auth).
- Privacy policy URL (`https://stryt.in/legal/...` already exists).
- Content rating questionnaire, target audience, ads declaration.
- Upload signed `.aab`, create Internal testing track → Production.
- Play App Signing: upload key vs app signing key (document the keystore).

## Risk
Medium (build config). AAB build added alongside APK, not replacing it, so the
existing download path keeps working.
