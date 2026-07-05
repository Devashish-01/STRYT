import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

// Web-only Firebase Auth init (NO Firestore — Supabase remains the data + session
// backend). Used solely to drive Google sign-in through Firebase's popup, whose
// redirect handler (<project>.firebaseapp.com/__/auth/handler) is pre-authorized
// on Firebase's own OAuth client — so it never hits redirect_uri_mismatch, and
// the consent screen shows Firebase, not the raw supabase.co callback.
const cfg = {
  apiKey: (import.meta as any).env?.VITE_FIREBASE_API_KEY,
  authDomain: (import.meta as any).env?.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: (import.meta as any).env?.VITE_FIREBASE_PROJECT_ID,
  storageBucket: (import.meta as any).env?.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: (import.meta as any).env?.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: (import.meta as any).env?.VITE_FIREBASE_APP_ID,
};

// appId is NOT required for Auth (only analytics/messaging use it) and
// VITE_FIREBASE_APP_ID currently holds the ANDROID app's id — there's no Web
// app registered in this Firebase project. Don't gate on it; apiKey +
// authDomain + projectId are all Auth's signInWithPopup actually needs.
export const hasFirebaseWebConfig = Boolean(cfg.apiKey && cfg.authDomain && cfg.projectId);

let _auth: Auth | null = null;
export function getFirebaseAuth(): Auth {
  const app = getApps().length ? getApp() : initializeApp(cfg);
  if (!_auth) _auth = getAuth(app);
  return _auth;
}
