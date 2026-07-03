# STRYT → Android App via Capacitor — Planning Guide


> Status: **planning only** — nothing below has been installed or run. This is the
> roadmap for a future implementation pass. Written against the codebase as of
> 2026-07-04 (Vite 5 + React 18 + React Router 6 + Supabase, `BrowserRouter`,
> no existing PWA manifest/install prompt, one push-notification service worker
> at `public/sw.js`).

## Why Capacitor fits this app specifically

Capacitor wraps a built web app (`dist/`) in a native WebView shell and exposes
native APIs (camera, geolocation, push, etc.) back to the same JS/React code via
plugins. STRYT is already built as a 480px "phone shell" SPA with no
server-rendering, no server-only routes, and no reliance on cookies/sessions
that assume a real browser (auth is Supabase JS + localStorage) — that's exactly
the shape of app Capacitor is designed for. No rewrite, no separate native
codebase: same `src/`, same components, same Supabase calls.

The work is almost entirely in three buckets:
1. **Wrapping/config** — one-time setup, low risk.
2. **Bridging web APIs that behave differently (or not at all) in a native
   WebView** — geolocation, push, camera, OAuth redirect, hardware back button.
   This is the real work, and it's enumerated file-by-file below.
3. **Store packaging** — icons, splash, signing, Play Console listing.

---

## Phase 0 — Prerequisites

- [ ] Android Studio installed (bundles the Android SDK, platform tools, an emulator image).
- [ ] JDK 17 (Android Gradle Plugin 8.x requires it).
- [ ] A Google Play Console developer account ($25 one-time) — needed later for signing/release, not for local builds.
- [ ] A Firebase project — needed for push notifications (see Phase 4.3). Can be created any time before that phase.
- [ ] Confirm `npm run build` currently succeeds clean (`tsc -b && vite build`) — Capacitor packages whatever `dist/` contains, so this must already be green.

---

## Phase 1 — Install & initialize Capacitor

```bash
npm install @capacitor/core @capacitor/cli
npx cap init
```

`cap init` will ask for:
- **App name**: `STRYT` (matches `index.html`'s `<title>` and `appName` in `src/config.ts`)
- **App ID**: reverse-domain, e.g. `app.stryt.mobile` or `in.stryt.app` — this becomes the Android package name and **cannot be changed later** without a new Play Store listing. Pick deliberately.
- **Web asset directory**: `dist` (matches the existing `vite build` output — confirmed in `vite.config.ts`, no `outDir` override so it defaults to `dist`).

This generates `capacitor.config.ts` at the repo root. Key fields to set:

```ts
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'in.stryt.app',
  appName: 'STRYT',
  webDir: 'dist',
  server: {
    // Only for local dev — lets the native shell load from the Vite dev
    // server (localhost:5173) instead of the bundled dist/, so changes
    // hot-reload on-device without a full `cap sync` each time. Remove or
    // comment out for production builds.
    // url: 'http://192.168.x.x:5173',
    // cleartext: true,
  },
  android: {
    // Splash background should match index.html's theme-color (#7c3aed)
    backgroundColor: '#7c3aed',
  },
};

export default config;
```

```bash
npm install @capacitor/android
npx cap add android
```

This creates an `android/` folder — a real, separately-versioned Android Studio
project. It gets regenerated content on `cap sync` but committed files inside
it (manifest edits, gradle config, icons) persist and should be checked into
git.

---

## Phase 2 — The build/sync loop

Every time `src/` changes and you want to test on Android:

```bash
npm run build       # tsc -b && vite build → dist/
npx cap sync android  # copies dist/ into android/, updates native plugin registrations
npx cap open android  # opens Android Studio; run ▶ from there, or:
npx cap run android    # builds + installs + launches on a connected device/emulator directly
```

Worth adding to `package.json`:
```json
"cap:sync": "npm run build && npx cap sync android",
"cap:run": "npm run build && npx cap run android"
```

---

## Phase 3 — Things that need zero changes

Confirmed low-risk, should work as-is inside the Capacitor WebView:
- All Supabase calls (`@supabase/supabase-js`) — plain HTTPS/WebSocket, no browser-only API involved.
- Leaflet maps (`MapView.tsx`, `LocationPicker.tsx`, `LocationMapPicker.tsx`) — OSM/Mapbox tiles are just HTTP image requests.
- React Router's `BrowserRouter` — Capacitor serves `index.html` at a stable origin (`https://localhost` on Android by default), so client-side route changes behave like a normal SPA. (Hardware back button is a separate concern — see 4.1.)
- All Supabase Edge Function calls via `functionUrl()` (`src/config.ts`) — plain `fetch()`, unaffected by the native wrapper.
- Realtime subscriptions (`useQueryWithRealtime`) — WebSocket, works the same.
- Phone/OTP auth (`PhoneEntry.tsx`'s primary flow) — no redirect involved, just Supabase RPC calls.

---

## Phase 4 — Things that DO need work, in priority order

### 4.1 Hardware/gesture back button (do this first — breaks the app immediately without it)

Android's back gesture/button, by default in a Capacitor app with no listener,
**closes the app** instead of navigating back through React Router history.
Every screen in this app that calls `nav(-1)` (dozens of them — `AppBar` back
arrows, sheet close buttons) currently relies on the user tapping an in-app
back arrow; the OS-level back gesture needs to be wired to the same history
stack.

```bash
npm install @capacitor/app
```

Add near the root of `App.tsx` (inside the component that already has access
to a `useNavigate()`-capable context, or a new small hook):

```ts
import { App as CapApp } from '@capacitor/app';
import { useNavigate } from 'react-router-dom';

useEffect(() => {
  const sub = CapApp.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else CapApp.exitApp(); // only exit when there's truly nothing to go back to
  });
  return () => { sub.remove(); };
}, []);
```

Test carefully against the app's existing sheet/overlay components (bottom
sheets like `LocationPickerSheet.tsx`, `ReportSheet.tsx`, `ShareCard.tsx`) —
right now closing those calls an `onClose` prop, not a route change, so the
hardware back button won't close them by default. Decide per-sheet whether
back-button-to-close is expected (likely yes, matches platform convention) —
may need each sheet to also listen for the back event while open, or a
simpler app-wide "top overlay" registry.

### 4.2 Geolocation

Currently `navigator.geolocation.getCurrentPosition()` is called directly in
10 places: `LocationPickerSheet.tsx`, `LocationPermission.tsx`,
`LocationMapPicker.tsx`, `UserOnboard.tsx`, `MapView.tsx` (×2 — `RecenterButton`
and the initial center), `ProfileEdit.tsx`, `AgreementScreen.tsx` (×2),
`AskCompose.tsx`, `StoryCompose.tsx`, plus the shared `useGeolocation.ts` hook
used by `LocationPicker.tsx` (business/provider onboarding).

The raw Web Geolocation API *does* work inside a Capacitor WebView, but Android
permission prompts and background/foreground behavior are more reliable through
the dedicated plugin:

```bash
npm install @capacitor/geolocation
```

```ts
import { Geolocation } from '@capacitor/geolocation';
const pos = await Geolocation.getCurrentPosition();
// pos.coords.latitude / pos.coords.longitude — same shape as the Web API
```

**Recommended approach**: don't rewrite all 10 call sites individually. Add a
tiny platform-aware wrapper (e.g. `src/lib/nativeGeolocation.ts`) that calls
`Capacitor.isNativePlatform()` and delegates to `@capacitor/geolocation` on
native / the existing `navigator.geolocation` on web, matching the existing
`(lat, lng) => void` callback shape already used everywhere. Swap the import
in each of the 10 files. This keeps the web build's behavior byte-identical
and only changes behavior inside the native wrapper.

Also add to `android/app/src/main/AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

### 4.3 Push notifications — the biggest lift

Current implementation (`src/lib/pushNotifications.ts` + `public/sw.js`) uses
**Web Push** (VAPID keys, `PushManager.subscribe()`, browser service worker).
This does not work in a native Android app — native Android push goes through
**Firebase Cloud Messaging (FCM)**, a completely different subscription model
(device tokens, not `PushSubscription` objects with p256dh/auth keys).

Plan:
1. Create a Firebase project, add an Android app to it (package name = the
   `appId` from Phase 1), download `google-services.json` into
   `android/app/`.
2. `npm install @capacitor/push-notifications`
3. Request permission + get an FCM token natively:
   ```ts
   import { PushNotifications } from '@capacitor/push-notifications';
   await PushNotifications.requestPermissions();
   await PushNotifications.register();
   PushNotifications.addListener('registration', (token) => {
     // token.value is the FCM device token — save it, see step 4
   });
   ```
4. **Schema change**: the existing `push_subscriptions` table (referenced in
   `pushNotifications.ts`, columns `user_id`/`endpoint`/`p256dh`/`auth`) is
   shaped for Web Push. Add a parallel path — either a new `fcm_tokens` table
   (`user_id`, `token`, `platform`) or widen `push_subscriptions` with a
   `platform: 'web' | 'android'` discriminator and nullable web-only columns.
5. **Edge Function change**: `supabase/functions/send-push/` currently sends
   via the Web Push protocol. It needs a branch that, for Android tokens,
   calls the FCM HTTP v1 API instead (needs a Firebase service account key
   stored as a Supabase secret, separate from the VAPID key already in use).
6. Keep the web push path working unchanged for anyone using the app in a
   browser — this is additive, not a replacement.
7. Deep-link handling on tap: `public/sw.js`'s `notificationclick` handler
   (focuses/opens a window and postMessages a route) has no native
   equivalent — wire `PushNotifications.addListener('pushNotificationActionPerformed', ...)`
   to call the same React Router navigation the app already uses for deep
   links elsewhere (`returnTo` pattern in `src/lib/returnTo.ts` is a good
   reference for how in-app deep-link navigation is already structured).

### 4.4 Google Sign-In (OAuth redirect)

`src/services/authService.ts`'s `signInWithGoogle()` calls
`sb.auth.signInWithOAuth({ redirectTo: window.location.origin + oauthReturnPath() })`
— this assumes a real browser origin the OAuth provider can redirect back to.
Inside a Capacitor app there is no meaningful "origin" for Google to redirect
to after consent.

Two viable approaches:
- **Simplest**: use `@capacitor/browser`'s in-app browser (`Browser.open()`)
  to run the OAuth flow, register a **custom URL scheme** (e.g.
  `in.stryt.app://auth-callback`) in `AndroidManifest.xml` as an intent
  filter, set that as the `redirectTo` on native, and listen for
  `App.addListener('appUrlOpen', ...)` to capture the returned code/token and
  hand it to `sb.auth.exchangeCodeForSession()` (or equivalent based on the
  Supabase JS version in use — check `@supabase/supabase-js` ^2.108.2's PKCE
  flow support, already likely enabled given `detectSessionInUrl` is
  referenced in project history).
- **Lower-effort alternative**: de-emphasize/hide the Google sign-in button on
  the native build and lean on the phone/OTP flow (`PhoneEntry.tsx`'s primary
  path), which needs no redirect at all and already works unchanged (4.0
  above). Given phone auth is already the app's primary flow (SMS OTP is more
  natural for the target market than Google on mobile anyway), this is a
  legitimate scope-reduction for v1 of the Android app — ship phone auth only,
  add native Google Sign-In (`@capacitor-community/firebase-authentication` or
  similar) in a follow-up.

**Recommendation: pick the second option for the first Android release.** It's
a one-line conditional (`Capacitor.isNativePlatform()`) hiding the Google
button in `PhoneEntry.tsx`, versus a genuinely fiddly OAuth-redirect
integration. Revisit once the app is live and you have real usage data on
whether Android users actually want Google sign-in.

### 4.5 QR Scanner (`src/components/QrScannerSheet.tsx`)

Uses `html5-qrcode`, which calls `getUserMedia()` under the hood — this
generally works inside Android WebViews (Chrome-based), but test it
specifically once the Android shell exists: WebView camera permission prompts
and `getUserMedia` support vary more than on desktop Chrome. If it's
unreliable, fall back to a native plugin
(`@capacitor-community/barcode-scanner` or `@capacitor/camera` + a decode
library) — but don't pre-emptively replace it; test the existing
implementation first since it may just work.

Add to `AndroidManifest.xml` regardless (needed either way):
```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
```

### 4.6 Status bar & safe areas

`index.html` already sets `theme-color` (`#7c3aed`) and
`viewport-fit=cover` — good groundwork. Add `@capacitor/status-bar` to
control the native status bar color/style to match (Android's status bar
isn't automatically themed by `theme-color` the way some browsers do it):

```bash
npm install @capacitor/status-bar
```
```ts
import { StatusBar, Style } from '@capacitor/status-bar';
await StatusBar.setBackgroundColor({ color: '#7c3aed' });
await StatusBar.setStyle({ style: Style.Dark }); // light icons on the purple bar
```

### 4.7 Splash screen

```bash
npm install @capacitor/splash-screen
```
Generate Android splash assets (adaptive icon + splash image at the required
densities — `mdpi` through `xxxhdpi`) from the existing brand mark used in
`Splash.tsx`'s inline SVG pin logo. `@capacitor/assets` (a separate CLI tool)
can generate the full Android icon/splash set from one source PNG/SVG:
```bash
npm install -D @capacitor/assets
npx capacitor-assets generate --android
```

### 4.8 Keyboard behavior

Long forms (`ProfileEdit.tsx`, `UserOnboard.tsx`, `BusinessOnboard.tsx`,
`AskCompose.tsx`, chat input) should be checked against the on-screen keyboard
covering inputs. `@capacitor/keyboard` can resize the webview or adjust
scroll behavior on focus:
```bash
npm install @capacitor/keyboard
```

---

## Phase 5 — Environment & secrets

- `.env`'s `VITE_*` variables get baked into the JS bundle at `vite build`
  time exactly as they do for the web build — no Capacitor-specific change
  needed, but **confirm the Android build uses the correct production values**
  (Supabase URL/anon key, Mapbox token) rather than local dev values, same
  discipline as the existing Vercel web deploy.
- The Firebase `google-services.json` (Phase 4.3) contains a public
  client config, not a secret — safe to commit, matches how Firebase projects
  are normally structured. The FCM server-side sending key (used by the
  `send-push` Edge Function) is the actual secret — store it as a Supabase
  Edge Function secret, never in the repo or the Android bundle.

---

## Phase 6 — Permissions summary (`android/app/src/main/AndroidManifest.xml`)

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.VIBRATE" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" /> <!-- Android 13+ -->
```
(`INTERNET` is included by default in a Capacitor-generated manifest — listed
here for completeness.)

---

## Phase 7 — Signing & Play Store release

1. **Generate a release keystore** (once, store it somewhere durable and
   backed up — losing it means losing the ability to update the app under
   the same listing):
   ```bash
   keytool -genkey -v -keystore stryt-release.keystore -alias stryt -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Configure signing in `android/app/build.gradle` (`signingConfigs` block) —
   reference the keystore via environment variables or a local
   `keystore.properties` file that's **gitignored** (never commit the
   keystore or its password).
3. Build a release **AAB** (Android App Bundle — Play Store's required format,
   not a raw APK):
   ```bash
   cd android && ./gradlew bundleRelease
   ```
4. **Play Console listing requirements** — worth starting early, these have
   review lead time:
   - Privacy policy URL (this app collects phone numbers, precise location,
     photos, emergency contacts — the Data Safety form will need to disclose
     all of these categories accurately; cross-reference `ISS-009` in
     `ISSUES.md` — the column-level PII exposure gap should be resolved
     *before* this app is in wide release, not just before this checklist
     item).
   - App icon (512×512), feature graphic (1024×500), at least 2 phone
     screenshots.
   - Content rating questionnaire.
   - Target API level — Play Console enforces a minimum target SDK that
     shifts yearly; whatever Capacitor's current Android template targets at
     implementation time should already satisfy this, just don't let the
     `android/` project sit unbuilt for a year before shipping.
5. Internal testing track first (instant, no review) → closed testing (a
   handful of real users, catches the Phase 4 items above in practice) →
   production rollout, staged percentage if desired.

---

## Suggested implementation order

1. Phase 0–2 (setup, confirm it boots and shows the Splash screen on an emulator).
2. **4.1 back button** — do this before anything else feels "real"; without it every screen transition is broken from a native-app-feel perspective.
3. **4.4 Google sign-in scope decision** — resolve this early since it changes what phone-auth-only testers can even do; recommend disabling it for v1 per the note above.
4. **4.2 geolocation** — high-value given this session's location-picker work; test the raw Web API in the WebView first, only add the plugin wrapper if it's flaky.
5. 4.5–4.8 (QR scanner test, status bar, splash, keyboard) — polish, can be done in parallel, low interdependency.
6. **4.3 push notifications** — biggest lift, do last among the functional items since the app is fully usable without it (existing web push keeps working for browser users regardless).
7. Phase 5–7 (secrets check, signing, store listing) — once the above is stable on a real device, not just the emulator.

## Open questions to resolve before starting implementation

- Final Android **app ID** (package name) — pick before `cap init`, expensive to change later.
- Is Google Sign-In actually needed for Android v1, or is phone-only acceptable for launch (see 4.4)?
- Who owns the Firebase project this gets tied to (Phase 4.3) — needs a Google account with Play Console access eventually for App Links verification too, worth using the same account.
- Confirm `ISS-009` (column-level PII exposure — see `ISSUES.md`) is resolved before Play Store submission, since the Data Safety form is a legal declaration, not a formality.
