# Android Build and Deploy Steps

This document outlines the commands and steps executed to build the STRYT web assets, sync them with the Capacitor Android project, compile the debug APK, and commit the changes to version control.

## Step 1: Build Web Assets

Run the Vite build command to generate production-ready web assets in the `dist` directory:

```bash
npm run build
```

## Step 2: Sync Capacitor Android Project

Sync the compiled web assets and configuration from the `dist` directory into the native Android project:

```bash
npx cap sync android
```

## Step 3: Compile the Android Debug APK

Navigate to the `android` folder and use the Gradle wrapper script to compile the debug APK:

```powershell
# Run from stryt/android directory
.\gradlew.bat assembleDebug
```

## Step 4: Upload the APK to Supabase Storage

Run the upload script to securely upload the newly compiled APK to Supabase Storage:

```bash
# Run from stryt directory
node scripts/upload-apk.mjs
```

## Step 5: Stage and Commit the Code Changes

Stage the modified files, newly added scripts, migrations, and then commit them:

```bash
git add src/ scripts/ supabase/migrations/ package.json package-lock.json vite.config.ts public/sw.js supabase/functions/send-push/index.ts
git commit -m "build: compile android debug apk and upload to supabase storage"
```
