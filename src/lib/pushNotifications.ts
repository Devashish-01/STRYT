import { getSupabase } from "@/lib/supabaseClient";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function registerPush(userId: string): Promise<void> {
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
