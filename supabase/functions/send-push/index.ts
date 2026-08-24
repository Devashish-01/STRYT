// STRYT — send-push edge function
// Contract (from notificationService): { userId, title, body, deepLink }
// Loads the recipient's Web Push and native FCM subscriptions and delivers a push.
//
// Degrades gracefully: if credentials are unset, it no-ops with 200.
//
// Required secrets (set with `supabase secrets set ...`):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY   (npx web-push generate-vapid-keys)
//   VAPID_SUBJECT                         (e.g. "mailto:team@stryt.app")
//   FIREBASE_SERVICE_ACCOUNT              (Full contents of Firebase Service Account JSON file)
//   SUPABASE_URL, SUPABASE_SECRET_KEYS       (auto-injected)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

/**
 * The project's secret API key, for the RLS-bypassing admin client.
 *
 * Reads the new `SUPABASE_SECRET_KEYS` map the platform injects (our key is
 * named "default") instead of the legacy `SUPABASE_SERVICE_ROLE_KEY`. The
 * legacy service_role JWT is being retired because its value leaked in this
 * repo's git history, and it will be disabled in Settings -> API Keys.
 *
 * Falls back to the legacy variable so this deploys safely BEFORE the legacy
 * key is switched off, and keeps working if it is ever re-enabled.
 */
function secretKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (keys?.default) return keys.default as string;
  } catch { /* malformed or absent -- fall through to the legacy key */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

// CORS allowlist — reflects only known app origins, never "*" (Security
// Audit M-3). Inlined (not a shared import) so this function deploys
// standalone via the Supabase dashboard.
const ALLOWED_ORIGINS = new Set([
  "https://stryt.in",
  "https://www.stryt.in",
  "https://localhost", // Capacitor Android/iOS WebView (androidScheme: 'https')
  "http://localhost:5173", // Vite dev
  "http://localhost:4173", // Vite preview
]);

function corsHeaders(req: Request, extraHeaders = "authorization, x-client-info, apikey, content-type"): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://stryt.in";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": extraHeaders,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
}

function json(body: unknown, status = 200, cors: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  secretKey(),
);

// VAPID public key is PUBLIC by design (it's shipped to browsers via
// VITE_VAPID_PUBLIC_KEY). Fall back to the known public key so web push works
// even if the VAPID_PUBLIC_KEY edge secret was never set — the private key
// (VAPID_PRIVATE_KEY) is the only sensitive half and must still be a secret.
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")
  ?? "BNA9V7sxLJVJNQfP7ueCA-_majXBa76gvlQp0RNLd2HEi2Z5dcTouf6mOAD9dTAXAojvMSi9IadhKGSpJ0oiHtE";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:team@stryt.app";

const FIREBASE_SA = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

// Custom base64 decoder to avoid standard library imports
function decodeBase64(b64: string): Uint8Array {
  const binString = atob(b64);
  const len = binString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binString.charCodeAt(i);
  }
  return bytes;
}

// Generate Google OAuth2 access token for FCM v1
async function getFcmAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
  const jwtHeader = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const jwtClaim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: sa.token_uri,
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = btoa(JSON.stringify(jwtHeader)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const encodedClaim = btoa(JSON.stringify(jwtClaim)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const signInput = `${encodedHeader}.${encodedClaim}`;

  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = sa.private_key
    .replace(pemHeader, "")
    .replace(pemFooter, "")
    .replace(/\s/g, "");
  
  const keyBuffer = decodeBase64(pemContents);
  
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signInput)
  );

  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const assertion = `${signInput}.${signature}`;

  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}`,
  });

  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Failed to get OAuth token: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

/**
 * Which notification types a user preference is allowed to suppress.
 *
 * This is deliberately an ALLOWLIST, not a denylist: a notification type not
 * named here is always delivered. Bookings, queue calls, agreements,
 * deliveries, chat and payments are transactional — the user is waiting on
 * them, and a discovery-preference switch must never be able to swallow one.
 * Adding a new marketing type means adding it here on purpose.
 */
const PREF_GATED_TYPES: Record<string, string> = {
  NEW_BUSINESS: "notif_new_business",
  NEW_PROVIDER: "notif_new_business",
  NEARBY_REQUEST: "notif_nearby_requests",
  QUOTE_BROADCAST: "notif_nearby_requests",
  OFFER: "notif_offers",
};

/** True when local time in `tz` is inside the 22:00–07:00 quiet window. */
function isQuietHour(tz: string | null | undefined): boolean {
  try {
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: tz || "Asia/Kolkata",
        hour: "2-digit",
        hour12: false,
      }).format(new Date()),
    );
    return hour >= 22 || hour < 7;
  } catch {
    // Unknown/invalid zone — treat as not-quiet rather than silencing wrongly.
    return false;
  }
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Internal-only: this function exists to be called exclusively by the
  // push_on_notification_insert DB trigger
  // (supabase/migrations/20260731_push_on_every_notification.sql).
  // Without this check, any signed-in user could push arbitrary
  // title/body/deepLink to ANY userId (push-phishing). verify_jwt is now
  // FALSE for this function — the new secret keys are not JWTs, so the
  // platform gate cannot vet them — which makes this in-handler check the
  // ONLY boundary. It must stay strict.
  //
  // Two accepted shapes now that the legacy service_role key/JWT secret are
  // both confirmed disabled (docs/launch/PLAY_SUBMISSION_CHECKLIST.md):
  //   1. `apikey: <secret key>`. Secret keys are not JWTs, so they are
  //      rejected on Authorization: Bearer and must travel on the apikey
  //      header.
  //   2. `Authorization: Bearer <secret key>` — exact match, fast path.
  // The legacy shape (an unverified `service_role` JWT claim, accepted only
  // because verify_jwt=false stops the gateway from checking its signature)
  // was removed once the key it trusted was confirmed dead on both surfaces.
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const apiKeyHeader = req.headers.get("apikey") ?? "";
  const serviceKey = secretKey();

  const authorized = !!serviceKey && (apiKeyHeader === serviceKey || bearer === serviceKey);
  if (!authorized) {
    return json({ error: "Forbidden: internal use only" }, 403, cors);
  }

  try {
    const { userId, title, body, deepLink, type } = await req.json();
    if (!userId) return json({ error: "userId required" }, 400, cors);

    // Load the recipient's push preferences once, up front. These columns were
    // added in 20260859 — before that the six toggles in the app's Settings
    // screen wrote to localStorage and nothing ever read them, so they changed
    // nothing about delivery.
    const { data: prefs } = await admin
      .from("users")
      .select("notif_new_business, notif_nearby_requests, notif_offers, notif_silent, notif_quiet_hours, timezone")
      .eq("id", userId)
      .maybeSingle();

    // Discovery types the user has opted out of stop here. Transactional types
    // aren't in PREF_GATED_TYPES at all, so they always fall through.
    const gateColumn = type ? PREF_GATED_TYPES[type as string] : undefined;
    if (gateColumn && prefs && (prefs as Record<string, unknown>)[gateColumn] === false) {
      return json({ ok: true, webSent: 0, fcmSent: 0, skipped: "user-preference" }, 200, cors);
    }

    // Silent/quiet-hours downgrade the ALERT only — the notification is still
    // delivered and still lands in the tray, it just doesn't make a sound.
    const silent = prefs?.notif_silent === true
      || (prefs?.notif_quiet_hours === true && isQuietHour(prefs?.timezone as string | null));

    let webSent = 0;
    let fcmSent = 0;

    // 1. Deliver Web Push if configured
    if (VAPID_PUBLIC && VAPID_PRIVATE) {
      const { data: subs } = await admin
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("user_id", userId);

      if (subs && subs.length > 0) {
        // `type` lets the service worker group/tag notifications so a burst
        // of the same kind coalesces instead of stacking dozens of banners.
        const notification = JSON.stringify({ title, body, url: deepLink || "/", type: type || "SYSTEM" });
        await Promise.all(
          subs.map(async (s: { endpoint: string; p256dh: string; auth: string }) => {
            try {
              await webpush.sendNotification(
                { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                notification,
              );
              webSent++;
            } catch (err: unknown) {
              const code = (err as { statusCode?: number })?.statusCode;
              if (code === 404 || code === 410) {
                await admin.from("push_subscriptions").delete()
                  .eq("user_id", userId).eq("endpoint", s.endpoint);
              }
            }
          })
        );
      }
    }

    // 2. Deliver Native FCM Push if configured
    if (FIREBASE_SA) {
      const { data: fcmTokens } = await admin
        .from("fcm_tokens")
        .select("token, platform")
        .eq("user_id", userId);

      if (fcmTokens && fcmTokens.length > 0) {
        try {
          const accessToken = await getFcmAccessToken(FIREBASE_SA);
          const sa = JSON.parse(FIREBASE_SA);
          const projectId = sa.project_id;

          await Promise.all(
            fcmTokens.map(async (t: { token: string; platform: string }) => {
              try {
                const res = await fetch(
                  `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "Authorization": `Bearer ${accessToken}`,
                    },
                    body: JSON.stringify({
                      message: {
                        token: t.token,
                        notification: { title, body },
                        // Android: give the notification a channel with sound +
                        // heads-up priority so it behaves like a real app's push
                        // (banner + sound), not a silent tray entry.
                        // `silent` (user's silent switch, or an active quiet
                        // hour) drops the sound and the heads-up banner but
                        // still delivers to the tray — it must never swallow
                        // the notification itself. The stryt_silent channel is
                        // created in MainActivity.java; on an older install that
                        // lacks it, FCM falls back to the manifest's declared
                        // default channel rather than dropping the message.
                        android: {
                          priority: silent ? "NORMAL" : "HIGH",
                          notification: {
                            ...(silent ? {} : { sound: "default", default_sound: true }),
                            channel_id: silent ? "stryt_silent" : "stryt_default",
                            notification_priority: silent ? "PRIORITY_LOW" : "PRIORITY_HIGH",
                          },
                        },
                        apns: {
                          payload: { aps: silent ? {} : { sound: "default" } },
                        },
                        data: { url: deepLink || "/", type: type || "SYSTEM" },
                      },
                    }),
                  }
                );

                if (res.ok) {
                  fcmSent++;
                } else {
                  const errorRes = await res.json();
                  const errorCode = errorRes?.error?.status;
                  // If token is invalid/unregistered, delete it
                  if (errorCode === "UNREGISTERED" || errorCode === "INVALID_ARGUMENT") {
                    await admin.from("fcm_tokens").delete().eq("user_id", userId).eq("token", t.token);
                  }
                }
              } catch (err) {
                console.error("FCM sending error:", err);
              }
            })
          );
        } catch (err) {
          console.error("FCM token authorization or delivery failed:", err);
        }
      }
    }

    return json({ ok: true, webSent, fcmSent }, 200, cors);
  } catch (e) {
    return json({ error: String(e) }, 500, cors);
  }
});
