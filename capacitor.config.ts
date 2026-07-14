import type { CapacitorConfig } from '@capacitor/cli';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The OTA updater compares bundle versions against the "current" version. If we
// don't tell it, it falls back to the native versionName ("1.0" in build.gradle)
// — which is HIGHER than our package.json scheme (0.1.x), so every OTA bundle
// would look like a downgrade and never apply. Anchor the current version to
// package.json so OTA bundles (0.1.1, 0.1.2, …) correctly read as newer.
let appVersion = '0.1.0';
try {
  appVersion = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).version || appVersion;
} catch { /* keep default */ }

const config: CapacitorConfig = {
  appId: 'in.stryt.app',
  appName: 'STRYT',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#8b47f5',
    // Smoother scrolling / fewer paint glitches in the web view.
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      // We hide it from JS once React mounts (initNativeApp), so don't let the
      // native splash linger or flash white underneath.
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: '#8b47f5',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    Keyboard: {
      resize: 'native' as any,
    },
    FirebaseAuthentication: {
      // We use Supabase as the actual session/auth backend, not Firebase Auth —
      // this makes signInWithGoogle() do ONLY the native Credential Manager
      // picker + return a Google ID token, without also creating a parallel
      // Firebase Auth session. See src/lib/nativeAuth.ts.
      skipNativeAuth: true,
      providers: ['google.com'],
    },
    CapacitorUpdater: {
      // Self-hosted OTA updates for JS/CSS/HTML changes — no new APK/Play Store
      // release needed for pure web-bundle fixes. Manifest + zip live in the
      // public "app-updates" Supabase Storage bucket, published by
      // scripts/publish-ota-update.mjs (never written to from client code).
      //
      // "onlyDownload": the plugin checks + downloads the new bundle in the
      // background and emits `updateAvailable`, but NEVER applies it on its own.
      // The user applies it explicitly via the "Update available" button on the
      // profile screens (useAppUpdate() -> CapacitorUpdater.set). This gives the
      // user control instead of the app silently reloading under them.
      autoUpdate: 'onlyDownload',
      // The plugin POSTs the update check (a static Storage file rejects POST
      // with 400), so updateUrl points at an edge function that returns the
      // manifest { version, url, checksum }. The zip it references is a public
      // Storage object the plugin fetches over GET, which Storage does allow.
      updateUrl: 'https://gnswxlfmcwyhmzlfipql.supabase.co/functions/v1/app-update',
      version: appVersion,
    },
  },
};

export default config;
