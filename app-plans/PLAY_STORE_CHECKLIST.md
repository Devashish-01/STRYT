# Play Store Launch Checklist (Task 2)

## Done in code (this batch)
- `android/app/build.gradle`: `versionCode` / `versionName` are now injectable
  via `-PstrytVersionCode` / `-PstrytVersionName` (defaults 1 / "1.0").
- `android-release.yml`: on every push to `main` CI now also
  - resolves a **monotonic** `versionCode` from the GitHub Actions run number
    and `versionName` from `package.json`,
  - builds a **signed AAB** (`bundleRelease`) in addition to the APK,
  - uploads `stryt.aab` as a build artifact (`stryt-playstore-aab`) and attaches
    it to the `android-latest` GitHub Release.

## Manual — Play Console (cannot be automated here)
1. **Create app** in Play Console → package `in.stryt.app`.
2. **Play App Signing**: opt in (recommended). Upload the *upload key* (your
   `stryt-release.keystore`). Play holds the real app-signing key.
3. Download the AAB (`stryt.aab`) from the latest CI run's artifacts or the
   GitHub Release → upload to an **Internal testing** track first.
4. **Store listing**: app name (STRYT), short + full description, screenshots
   (phone + optional tablet), the **512×512 icon** (`public/icon-512.png`
   regenerated this batch) and a **1024×500 feature graphic** (design asset
   needed — derive from `public/og-image.png`).
5. **Data safety** form: declare location (approximate/precise), personal info
   (name, email, phone), and that data is used for account/app functionality.
6. **Privacy policy URL**: `https://stryt.in/legal/privacy` (exists in-app).
7. **Content rating** questionnaire; **target audience** (not children);
   **ads** declaration (no ads → declare none).
8. Review `AndroidManifest.xml` permissions vs data-safety answers; remove any
   unused permission.
9. Promote Internal → Closed/Production once tested.

## SECURITY — must address before public launch
- `android/app/build.gradle` `signingConfigs.release` contains **hardcoded
  passwords** (`stryt123`) committed to git. CI overrides these with
  `-Pandroid.injected.signing.*` from secrets, but the weak password is exposed
  in history. **Action:** rotate the keystore/passwords, move them to Gradle
  properties / env (`RELEASE_STORE_PASSWORD`, etc.), and rely on Play App
  Signing so the exposed upload key is not the final signing key.
- The Supabase `service_role` key was previously committed in
  `scripts/upload-apk.mjs` (now env-based) — rotate it in the dashboard.

## Notes
- `minifyEnabled=false` for release (safe: no ProGuard stripping of Capacitor
  plugins). If enabling later, add keep rules for Capacitor + JS bridge.
- The APK path (direct download from Supabase Storage) is unchanged and keeps
  working for non-Play distribution.
