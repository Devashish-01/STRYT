import { config } from "@/config";

/**
 * Public link to a delivery's progress page (/track/:token).
 *
 * Built from the configured public host, never window.location.origin: in the Capacitor app that origin is
 * "https://localhost" (the WebView's), so a link built from it is dead in every channel it is shared through —
 * the same trap ShareCard documents. `origin` is only a parameter so tests can pin it.
 */
export function trackingUrl(token: string, origin: string = config.apiUrl): string {
  return `${origin.replace(/\/+$/, "")}/track/${encodeURIComponent(token)}`;
}
