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
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (auto-injected)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY");
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { userId, title, body, deepLink, type } = await req.json();
    if (!userId) return json({ error: "userId required" }, 400);

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
                        android: {
                          priority: "HIGH",
                          notification: {
                            sound: "default",
                            channel_id: "stryt_default",
                            default_sound: true,
                            notification_priority: "PRIORITY_HIGH",
                          },
                        },
                        apns: {
                          payload: { aps: { sound: "default" } },
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

    return json({ ok: true, webSent, fcmSent });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
