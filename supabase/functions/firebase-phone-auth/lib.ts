/**
 * Pure helpers for firebase-phone-auth. No Deno- or network-specific imports on purpose: this file is
 * unit-tested under vitest (tests/firebase-phone-auth.test.ts) and imported by index.ts at runtime.
 */

/** GoTrue (bcrypt) rejects passwords over 72 characters. */
export const MAX_PASSWORD_LEN = 72;

/**
 * The fixed password an account is signed in with, derived from a server-side key so it is never stored or shown: HMAC-SHA256
 * over the user id, hex-encoded behind a prefix (66 characters, under GoTrue's 72 limit).
 *
 * Why not a fresh random password per login (what this did before): GoTrue revokes EVERY session of a user when their
 * password changes, so the "dead rotation" after sign-in destroyed the session it had just minted (`session_not_found`), and
 * even setting the temporary password signed the person out of their other devices. A password that never changes needs no
 * rotation: the first login sets it, every later login just signs in with it. If the key it is derived from is ever rotated
 * the sign-in fails once, is detected, and the password is set again — the account heals itself.
 */
export async function derivedPassword(secret: string, userId: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`stryt-phone-bridge:v1:${userId}`)));
  return "p_" + Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Launch is India-only. Widen this deliberately, together with the Firebase SMS region policy. */
export const INDIAN_MOBILE = /^\+91[6-9]\d{9}$/;

/** Firebase's OTP is only meant to authorise a login for a few minutes after it was entered. */
export const MAX_TOKEN_AGE_SEC = 300;
/** Tolerated clock skew between Google's issuer and this runtime. */
const CLOCK_SKEW_SEC = 60;

export type ClaimsResult =
  | { ok: true; phone: string; firebaseUid: string }
  | { ok: false; status: number; code: string; message: string };

interface FirebaseClaims {
  sub?: string;
  user_id?: string;
  phone_number?: string;
  auth_time?: number;
  firebase?: { sign_in_provider?: string };
}

/**
 * Checks the claims jose does NOT: that this token came from a phone sign-in (not Google, anonymous or
 * email — any of those would otherwise be accepted), that the OTP was entered recently (a token captured
 * earlier cannot be replayed for the rest of its hour), and that the number is one we serve.
 * Signature, issuer, audience and expiry are verified by the caller via jose before this runs.
 */
export function checkFirebaseClaims(claims: FirebaseClaims, nowSec: number): ClaimsResult {
  if (claims.firebase?.sign_in_provider !== "phone") {
    return { ok: false, status: 401, code: "wrong_provider", message: "This sign-in token is not from phone verification." };
  }

  const authTime = claims.auth_time;
  if (typeof authTime !== "number" || !Number.isFinite(authTime)) {
    return { ok: false, status: 401, code: "no_auth_time", message: "Verification has expired. Request a new code." };
  }
  if (nowSec - authTime > MAX_TOKEN_AGE_SEC || authTime - nowSec > CLOCK_SKEW_SEC) {
    return { ok: false, status: 401, code: "stale_token", message: "Verification has expired. Request a new code." };
  }

  const phone = claims.phone_number;
  if (!phone) {
    return { ok: false, status: 400, code: "no_phone", message: "Verification did not include a phone number." };
  }
  if (!INDIAN_MOBILE.test(phone)) {
    return { ok: false, status: 400, code: "unsupported_number", message: "Only Indian mobile numbers (+91) are supported right now." };
  }

  const firebaseUid = claims.sub || claims.user_id;
  if (!firebaseUid) {
    return { ok: false, status: 401, code: "no_subject", message: "Invalid verification token." };
  }

  return { ok: true, phone, firebaseUid };
}

/** First hop of x-forwarded-for, else cf-connecting-ip, else a shared "unknown" bucket (fails safe: tighter). */
export function clientIp(headers: { get(name: string): string | null }): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0].trim();
    if (first) return first;
  }
  return headers.get("cf-connecting-ip")?.trim() || "unknown";
}

/** Short sha-256 prefix. Rate-limit keys and log lines carry this, never a raw IP or phone number. */
export async function hashKey(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Ceilings. Tight enough to stop SMS-pump follow-through, loose enough for a family on one Wi-Fi. */
export const LIMITS = {
  ip: { limit: 30, window: "10 minutes" },
  phone: { limit: 10, window: "10 minutes" },
} as const;
