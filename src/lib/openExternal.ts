/**
 * Opens a URL outside the app — maps, WhatsApp, a calendar.
 *
 * Every such link must carry `noopener,noreferrer`. Without `noopener` the page that opens can reach back through
 * `window.opener` and navigate the tab it came from, so a link to a maps URL becomes a way to replace STRYT with a
 * look-alike sign-in page (reverse tabnabbing). Four call sites were missing it before P12; routing them all through
 * one function is what stops the fifth from being written.
 *
 * Not for `tel:` — dialling deliberately uses `window.open(href, "_self")` so the dialler replaces the current view
 * rather than opening a window that never closes on Android.
 */
export function openExternal(url: string): Window | null {
  return window.open(url, "_blank", "noopener,noreferrer");
}
