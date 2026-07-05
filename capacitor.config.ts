import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'in.stryt.app',
  appName: 'STRYT',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#7c3aed',
    // Smoother scrolling / fewer paint glitches in the web view.
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      // We hide it from JS once React mounts (initNativeApp), so don't let the
      // native splash linger or flash white underneath.
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: '#7c3aed',
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
  },
};

export default config;
