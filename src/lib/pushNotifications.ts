import { getSupabase } from "@/lib/supabaseClient";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function registerPush(userId: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
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
        console.log("FCM action performed:", action);
        const data = action.notification.data;
        if (data && data.url) {
          window.location.href = data.url;
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
