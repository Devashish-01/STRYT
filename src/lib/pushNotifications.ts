import { getSupabase } from "@/lib/supabaseClient";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { isIgnoringBatteryOptimizations } from "@/lib/batteryOptimization";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// Native Android push requires android/app/google-services.json (gitignored;
// read at Gradle build time) and a native rebuild after toggling this flag.
// store.tsx calls registerPush right after sign-in — without Firebase init,
// PushNotifications.register() can crash the process on the native side.
const FCM_READY = true;

export async function registerPush(userId: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    if (!FCM_READY) return; // see FCM_READY comment above — prevents a native crash
    try {
      let permStatus = await PushNotifications.checkPermissions();
      if (permStatus.receive === "prompt") {
        permStatus = await PushNotifications.requestPermissions();
      }
      if (permStatus.receive !== "granted") return;

      // Order matters: clear stale listeners, attach the new ones, and only
      // THEN register. register() is what triggers the "registration" event
      // that carries the FCM token — previously register() ran first and
      // removeAllListeners() ran after it, so a fast callback could fire
      // before (or be wiped by) the listener meant to persist the token.
      await PushNotifications.removeAllListeners();

      PushNotifications.addListener("registration", async (token) => {
        const sb = getSupabase();
        await sb.from("fcm_tokens").upsert(
          {
            user_id: userId,
            token: token.value,
            platform: Capacitor.getPlatform() === "ios" ? "ios" : "android",
          },
          { onConflict: "user_id,token" }
        );

        // NOTE: the battery-optimization prompt used to fire here, for every
        // Android user, justified as "keeps notifications reliable". It has
        // been moved to the delivery duty toggle
        // (promptBatteryExemptionForDuty in lib/batteryOptimization.ts).
        //
        // Play restricts REQUEST_IGNORE_BATTERY_OPTIMIZATIONS to a narrow
        // allowlist that does NOT include notification delivery, so asking
        // every customer here was the app's largest review risk — and it
        // wasn't buying customers much either: a high-priority FCM message
        // already wakes the device from Doze. Riders are the ones who really
        // need it, because a killed foreground service freezes their live
        // position mid-run.
      });

      PushNotifications.addListener("registrationError", (error) => {
        console.warn("FCM registration error:", error);
      });

      PushNotifications.addListener("pushNotificationReceived", (notification) => {
        // DEV only: the payload carries the notification title/body and deep
        // link, which can name a customer or a booking. Not something to write
        // to a production device log.
        if (import.meta.env.DEV) console.log("FCM notification received:", notification);
      });

      PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        // Tapping one notification only dismisses that one; anything else this
        // app queued stays in the tray. The user is now looking at the app, so
        // clear the rest rather than leave a stale pile behind them.
        void PushNotifications.removeAllDeliveredNotifications().catch(() => { /* best-effort */ });
        const data = action.notification.data;
        if (data && data.url) {
          // SPA navigation via App.tsx listener — window.location.href here
          // forced a full reload (splash, lost state) on every notification tap.
          window.dispatchEvent(new CustomEvent("push-nav", { detail: data.url }));
        }
      });

      // Attach listeners BEFORE register() — see the ordering comment above.
      await PushNotifications.register();
    } catch (e) {
      console.warn("Native push registration failed:", e);
    }
    return;
  }

  // Browser Web Push path
  const vapidKey = (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!vapidKey || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
  // vite.config.ts's VitePWA devOptions.enabled is deliberately false (SW
  // caching fought hot-reload during development), so /sw.js isn't a real
  // servable file under `vite dev` — it 404s through to index.html, and
  // registering it always fails with a MIME-type SecurityError. That's
  // expected noise, not a bug; skip the attempt entirely in dev instead of
  // logging a scary error for something that only ever works in a built app.
  if (import.meta.env.DEV) return;

  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    const existing = await reg.pushManager.getSubscription();
    const permission = existing
      ? "granted"
      : await Notification.requestPermission();
    if (permission !== "granted") return;

    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
    });

    const json = sub.toJSON();
    const sb = getSupabase();
    await sb.from("push_subscriptions").upsert({
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: (json.keys as Record<string, string>)?.p256dh ?? "",
      auth: (json.keys as Record<string, string>)?.auth ?? "",
    }, { onConflict: "user_id,endpoint" });
  } catch (e) {
    console.warn("Push registration failed:", e);
  }
}

/**
 * Clear this app's delivered OS notifications. Called when the app comes to
 * the foreground: once the user is in the app the tray copies are stale — the
 * in-app Notifications screen is the live source of truth. Nothing cleared the
 * tray before, so it accumulated indefinitely.
 */
export async function clearDeliveredNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await PushNotifications.removeAllDeliveredNotifications();
  } catch { /* best-effort — never block app resume */ }
}

export async function unregisterPush(userId: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const sb = getSupabase();
      await sb.from("fcm_tokens").delete().eq("user_id", userId);
    } catch (e) {
      console.warn("Native token removal failed:", e);
    }
    return;
  }

  try {
    const sb = getSupabase();
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await sb.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
    }
  } catch { /* ignore */ }
}
