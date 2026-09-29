# Hide the `*.firebaseapp.com` name on web Google sign-in

Web sign-in uses Firebase's popup, which runs on `VITE_FIREBASE_AUTH_DOMAIN`. Google shows that host on its
consent screen. `vercel.json` now proxies `/__/auth/*` and `/__/firebase/init.json` from the site to
`zetax-52843.firebaseapp.com`, so the popup can run on `stryt.in` itself. Android/iOS use the native account
picker and are unaffected.

## One-time setup (console, not code)

1. **Google Cloud Console → APIs & Services → Credentials** → the *Web client (auto created by Google Service)*
   OAuth client → add **Authorized redirect URI** `https://stryt.in/__/auth/handler`
   (and the same for any other web host, e.g. `https://www.stryt.in`).
2. **Firebase Console → Authentication → Settings → Authorized domains** → make sure `stryt.in` is listed.
3. **Vercel → Project → Environment Variables** → set `VITE_FIREBASE_AUTH_DOMAIN=stryt.in` (Production, and
   Preview if you want it there), then redeploy. Leave the Android/OTA workflow values as they are.
4. **Google Cloud → OAuth consent screen** → set App name to `STRYT` and upload the logo, so the screen is branded.

Rollback: set `VITE_FIREBASE_AUTH_DOMAIN` back to `zetax-52843.firebaseapp.com` and redeploy.
