import { getSupabase } from "@/lib/supabaseClient";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// google-services.json is NOT present in android/app/ (Firebase project not
// set up yet). android/app/build.gradle only applies the google-services
// Gradle plugin when that file exists, so Firebase is never initialized in
// the compiled app. PushNotificationsPlugin.register() calls
// FirebaseMessaging.getInstance() with no exception handling — without
// Firebase init that throws IllegalStateException synchronously on the
// native side, UNCAUGHT, which crashes the whole app process (not a JS
// promise rejection, so no try/catch here can save it). This fires the
// instant a user signs in (store.tsx calls registerPush right after
// isAuthed flips true), and since the session persists, EVERY subsequent
// app open re-triggers it — a permanent crash loop.
// Flip this to true only after: (1) creating a Firebase project, (2) adding
// android/app/google-services.json, (3) a native rebuild (`npx cap sync
// android` + rebuild in Android Studio — google-services.json is read at
// Gradle build time, not by `cap sync` alone).
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

      await PushNotifications.register();

      // Listeners must be cleared to avoid duplicates on re-logins
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
      });

      PushNotifications.addListener("registrationError", (error) => {
        console.warn("FCM registration error:", error);
      });

      PushNotifications.addListener("pushNotificationReceived", (notification) => {
        console.log("FCM notification received:", notification);
      });

      PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        const data = action.notification.data;
        if (data && data.url) {
          // SPA navigation via App.tsx listener — window.location.href here
          // forced a full reload (splash, lost state) on every notification tap.
          window.dispatchEvent(new CustomEvent("push-nav", { detail: data.url }));
        }
      });
    } catch (e) {
      console.warn("Native push registration failed:", e);
    }
    return;
  }

  // Browser Web Push path
  const vapidKey = (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!vapidKey || !("serviceWorker" in navigator) || !("PushManager" in window)) return;

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
