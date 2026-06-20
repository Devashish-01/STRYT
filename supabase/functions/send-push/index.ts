// STRYT — send-push edge function
// Contract (from notificationService): { userId, title, body, deepLink }
// Loads the recipient's Web Push subscriptions and delivers a push to each.
//
// Degrades gracefully: if VAPID keys are unset, it no-ops with 200 so the
// caller's fire-and-forget never errors (the in-DB notification still stands).
//
// Required secrets (set with `supabase secrets set ...`):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY   (npx web-push generate-vapid-keys)
//   VAPID_SUBJECT                         (e.g. "mailto:team@stryt.app")
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

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // No VAPID configured → nothing to send; succeed quietly.
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return json({ ok: true, sent: 0, skipped: "no_vapid" });

  try {
    const { userId, title, body, deepLink } = await req.json();
    if (!userId) return json({ error: "userId required" }, 400);

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", userId);

    if (!subs || subs.length === 0) return json({ ok: true, sent: 0 });

    const notification = JSON.stringify({ title, body, url: deepLink || "/" });
    let sent = 0;

    await Promise.all(
      subs.map(async (s: { endpoint: string; p256dh: string; auth: string }) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            notification,
          );
          sent++;
        } catch (err: unknown) {
          // 404/410 → subscription is dead; prune it.
          const code = (err as { statusCode?: number })?.statusCode;
          if (code === 404 || code === 410) {
            await admin.from("push_subscriptions").delete()
              .eq("user_id", userId).eq("endpoint", s.endpoint);
          }
        }
      }),
    );

    return json({ ok: true, sent });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
