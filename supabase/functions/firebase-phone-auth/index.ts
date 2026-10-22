/**
 * firebase-phone-auth
 *
 * Bridges Firebase Phone Authentication into a genuine Supabase session.
 *
 * Flow:
 *  1. Client verifies the SMS OTP with Firebase Auth (web or native Capacitor) and gets a Firebase ID token.
 *  2. Client posts the token here.
 *  3. We verify the token against Google's keys, then check it is a *phone* token, freshly issued, for an
 *     Indian mobile number (lib.ts).
 *  4. The verified number resolves to a Supabase user through auth.users.phone — the only verified source.
 *     public.users.phone is client-writable contact info and is NEVER consulted (plan gap G1).
 *  5. We mint a real Supabase session and return it.
 *
 * Protection: per-IP and per-phone rate limits (bridge_rate_check), and a per-user lease so two first-time
 * sign-ins for one number cannot race each other while the account's password is being set (try_lease_phone_login).
 * Required migration: 20260998_phone_auth_bridge.sql.
 * Required secret: FIREBASE_PROJECT_ID (no default — a missing value fails closed).
 *
 * Auth mode: verify_jwt = false (the caller is not yet authenticated).
 * Contract with shipped clients: POST {idToken} -> {ok, session, user} | {ok:false, message}. Extra fields
 * (code, retry_after) are additive.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v5.2.3/index.ts";
import { checkFirebaseClaims, clientIp, derivedPassword, hashKey, LIMITS } from "./lib.ts";

/** Secret API key for the RLS-bypassing admin client. */
function secretKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (keys?.default) return keys.default as string;
  } catch { /* ignore */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

/**
 * Publishable key for the anon-role client that performs the password grant. The legacy JWT anon key is being
 * retired (and is already disabled on production), so prefer the new JSON secret that mirrors SUPABASE_SECRET_KEYS.
 */
function publishableKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
    if (keys?.default) return keys.default as string;
  } catch { /* ignore */ }
  return Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("PHONE_AUTH_PUBLISHABLE_KEY") || "";
}

let bootLogged = false;

const ALLOWED_ORIGINS = new Set([
  "https://stryt.in",
  "https://www.stryt.in",
  "https://localhost",
  "capacitor://localhost",
  "http://localhost:5173",
  "http://localhost:4173",
]);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://stryt.in";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
}

const GOOGLE_JWKS_URL = new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
const jwks = jose.createRemoteJWKSet(GOOGLE_JWKS_URL);

/** One structured line per request. Never contains a raw phone number, IP or token. */
function logOutcome(outcome: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event: "phone_bridge", outcome, ...extra }));
}

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly extra: Record<string, unknown> = {}) {
    super(message);
  }
}

serve(async (req) => {
  const CORS = corsHeaders(req);
  const reply = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers: CORS });

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply(405, { ok: false, code: "method_not_allowed", message: "Method not allowed" });

  const started = Date.now();
  let phoneHash: string | undefined;
  let leasedUserId: string | null = null;
  let sbAdmin: ReturnType<typeof createClient> | null = null;

  try {
    // Trimmed and unquoted: a pasted secret often arrives with a trailing space/newline or wrapping quotes, which silently
    // breaks the issuer comparison below ("unexpected iss claim value") while still counting as "set".
    const firebaseProjectId = Deno.env.get("FIREBASE_PROJECT_ID")?.trim().replace(/^["']|["']$/g, "").trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const adminKey = secretKey();
    const anonKey = publishableKey();
    if (!bootLogged) {
      bootLogged = true;
      // Booleans only, once per isolate: shows in the function logs which credentials this runtime actually has.
      console.log(JSON.stringify({
        event: "phone_bridge_boot",
        has_project_id: Boolean(firebaseProjectId),
        has_supabase_url: Boolean(supabaseUrl),
        has_secret_key: Boolean(adminKey),
        has_publishable_key: Boolean(anonKey),
      }));
    }
    if (!firebaseProjectId || !supabaseUrl || !adminKey || !anonKey) {
      // Fail closed. Guessing a project id would accept tokens meant for a different Firebase project.
      console.error("[firebase-phone-auth] missing FIREBASE_PROJECT_ID / SUPABASE_URL / secret key / anon key");
      throw new HttpError(500, "server_config", "Sign-in is temporarily unavailable.");
    }

    sbAdmin = createClient(supabaseUrl, adminKey, { auth: { persistSession: false, autoRefreshToken: false } });

    // 1. Per-IP ceiling, before any crypto or database work on the token.
    const ipHash = await hashKey(clientIp(req.headers));
    const { data: ipOk, error: ipErr } = await sbAdmin.rpc("bridge_rate_check", {
      p_bucket: "ip", p_key_hash: ipHash, p_limit: LIMITS.ip.limit, p_window: LIMITS.ip.window,
    });
    if (ipErr) throw new Error(`rate check failed: ${ipErr.message}`);
    if (ipOk !== true) throw new HttpError(429, "rate_limited", "Too many attempts. Please wait a few minutes and try again.", { retry_after: 600 });

    // 2. Parse + cryptographically verify the Firebase ID token.
    const body = await req.json().catch(() => ({}));
    const idToken = typeof body?.idToken === "string" ? body.idToken.trim() : "";
    if (!idToken) throw new HttpError(400, "missing_token", "Missing Firebase ID token");

    let payload: jose.JWTPayload;
    try {
      const verified = await jose.jwtVerify(idToken, jwks, {
        issuer: `https://securetoken.google.com/${firebaseProjectId}`,
        audience: firebaseProjectId,
      });
      payload = verified.payload;
    } catch (jwtErr) {
      console.error("[firebase-phone-auth] token verification failed:", (jwtErr as Error)?.message);
      throw new HttpError(401, "invalid_token", "Invalid or expired verification. Request a new code.");
    }

    // 3. Phone provider, freshness, +91 mobile.
    const claims = checkFirebaseClaims(payload as Parameters<typeof checkFirebaseClaims>[0], Math.floor(Date.now() / 1000));
    if (!claims.ok) throw new HttpError(claims.status, claims.code, claims.message);
    const { phone, firebaseUid } = claims;
    phoneHash = await hashKey(phone);

    // 4. Per-phone ceiling.
    const { data: phoneOk, error: phoneErr } = await sbAdmin.rpc("bridge_rate_check", {
      p_bucket: "phone", p_key_hash: phoneHash, p_limit: LIMITS.phone.limit, p_window: LIMITS.phone.window,
    });
    if (phoneErr) throw new Error(`rate check failed: ${phoneErr.message}`);
    if (phoneOk !== true) throw new HttpError(429, "rate_limited", "Too many attempts for this number. Please wait a few minutes and try again.", { retry_after: 600 });

    // 5. Resolve the user by the VERIFIED phone (auth.users), never by public.users.phone.
    const lookup = async (): Promise<string | null> => {
      const { data, error } = await sbAdmin!.rpc("auth_user_id_by_phone", { p_phone: phone });
      if (error) throw new Error(`phone lookup failed: ${error.message}`);
      return typeof data === "string" && data ? data : null;
    };

    let userId = await lookup();
    let isNewUser = false;
    if (!userId) {
      const { data: created, error: createError } = await sbAdmin.auth.admin.createUser({
        phone,
        phone_confirm: true,
        user_metadata: { firebase_uid: firebaseUid },
      });
      if (created?.user?.id) {
        userId = created.user.id;
        isNewUser = true;
      } else if (createError && ((createError as { code?: string }).code === "phone_exists" || /already|exists/i.test(createError.message))) {
        // Lost a race with a concurrent first login for the same number: the winner created it.
        userId = await lookup();
      } else if (createError) {
        throw createError;
      }
    }
    if (!userId) throw new Error("Unable to resolve or create a user for the verified phone number");

    // 6. One mint at a time per user (setting the account's password for the first time is not safe to interleave).
    const { data: leased, error: leaseErr } = await sbAdmin.rpc("try_lease_phone_login", { p_user_id: userId, p_seconds: 15 });
    if (leaseErr) throw new Error(`lease failed: ${leaseErr.message}`);
    if (leased !== true) throw new HttpError(409, "in_progress", "A sign-in for this number is already in progress. Try again in a moment.");
    leasedUserId = userId;

    // Belt and braces: the auth.users trigger normally creates this row. Never overwrite an existing profile.
    await sbAdmin.from("users").upsert(
      { id: userId, phone, name: "New user", roles: ["customer"] },
      { onConflict: "id", ignoreDuplicates: true },
    );

    // 7. Mint a Supabase session with the account's fixed, derived password (see derivedPassword in lib.ts). Changing a
    //    password revokes every session, so it is set ONLY when the sign-in below says it isn't set yet (a brand-new
    //    account, or the signing key was rotated) — never per login, and never rotated afterwards.
    const password = await derivedPassword(adminKey, userId);
    const sbAnon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    let signIn = await sbAnon.auth.signInWithPassword({ phone, password });
    if (signIn.error && (signIn.error as { code?: string }).code === "invalid_credentials") {
      const { error: setErr } = await sbAdmin.auth.admin.updateUserById(userId, { password, phone_confirm: true });
      if (setErr) throw setErr;
      signIn = await sbAnon.auth.signInWithPassword({ phone, password });
    }

    if (signIn.error || !signIn.data?.session) {
      throw new Error(signIn.error?.message || "Failed to mint Supabase session");
    }
    if (signIn.data.session.user?.id !== userId) {
      throw new Error("Minted session belongs to a different user than the one resolved");
    }

    logOutcome("ok", { phone_hash: phoneHash, new_user: isNewUser, ms: Date.now() - started });
    return reply(200, { ok: true, session: signIn.data.session, user: signIn.data.user });
  } catch (err) {
    if (err instanceof HttpError) {
      logOutcome(err.code, { phone_hash: phoneHash, status: err.status, ms: Date.now() - started });
      return reply(err.status, { ok: false, code: err.code, message: err.message, ...err.extra });
    }
    // Unexpected: log the detail, tell the client nothing internal.
    console.error("[firebase-phone-auth] unhandled error:", err);
    logOutcome("internal_error", { phone_hash: phoneHash, ms: Date.now() - started });
    return reply(500, { ok: false, code: "internal", message: "Couldn't sign you in. Please try again." });
  } finally {
    if (leasedUserId && sbAdmin) {
      const { error } = await sbAdmin.rpc("release_phone_login", { p_user_id: leasedUserId });
      if (error) console.error("[firebase-phone-auth] lease release failed:", error.message);
    }
  }
});
