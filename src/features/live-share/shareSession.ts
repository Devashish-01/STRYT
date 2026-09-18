import { emergencyService } from "@/services";
import { backgroundLocation } from "@/lib/backgroundLocation";

/**
 * The lifecycle of one My People live share on this device, kept out of React so it can be tested.
 *
 * A share ends by itself at `live_shares.expires_at` (8 hours after it starts). The server only records that
 * lazily — `start_live_share` ends expired sessions the next time someone starts one — and `update_live_share`
 * does not check it. So the app has to: before this, the phone kept collecting location in the background,
 * under a notification saying it was being shared, while the contacts' cards already showed the share as
 * ended. And every launch resumed an expired share, restarting background collection the user had not asked
 * for (P15-003). Background location is declared to Google Play as user-initiated and stoppable; both broke
 * that.
 */

/** setTimeout's ceiling (~24.8 days). An expiry further out than this is bad data, not a real share. */
const MAX_TIMER_MS = 2 ** 31 - 1;

/** Mirrors the `live_shares.expires_at` column default. Used only if the real value cannot be read. */
const DEFAULT_SHARE_MS = 8 * 3600_000;

/**
 * Milliseconds until a share ends. 0 when it already has, or when the time is missing or unreadable: not
 * knowing when a share ends is a reason not to resume collecting location, never a reason to run forever.
 */
export function msUntilExpiry(expiresAt: string | null | undefined, now: number = Date.now()): number {
  if (!expiresAt) return 0;
  const end = Date.parse(expiresAt);
  if (Number.isNaN(end)) return 0;
  return Math.max(0, end - now);
}

/** The expiry to assume for a share that was just started, when reading it back failed. */
export function assumedExpiry(now: number = Date.now()): string {
  return new Date(now + DEFAULT_SHARE_MS).toISOString();
}

/**
 * The share this account left running, if it should be resumed on launch. An expired one is ended on the
 * server instead — which also flips the contacts' chat cards to ended — and not resumed.
 */
export async function shareToResume(): Promise<{ id: string; expiresAt: string } | null> {
  const share = await emergencyService.myActiveShare();
  if (!share) return null;
  if (msUntilExpiry(share.expiresAt) > 0) return share;
  await emergencyService.stopShare().catch(() => {
    /* still ACTIVE on the server; the next launch tries again, and nothing is collected meanwhile */
  });
  return null;
}

export interface ShareWatch {
  /** Stop collecting location. Idempotent. Does not end the share on the server — the caller does that. */
  stop(): void;
}

/**
 * Collect location for a share until stop() or its expiry, whichever comes first. On expiry: stop collecting,
 * end the share on the server, then call onExpired. Returns null, and collects nothing, if it has already
 * expired.
 *
 * Expiry is checked on every fix as well as by a timer: a backgrounded WebView may not run timers for hours,
 * but the background-location plugin does wake it for each fix.
 */
export function watchShare(
  expiresAt: string | null,
  handlers: { onExpired: () => void; onForegroundOnly?: () => void },
): ShareWatch | null {
  const remaining = msUntilExpiry(expiresAt);
  if (remaining <= 0) return null;
  const endsAt = Date.now() + remaining;
  let active = true;

  function stop() {
    if (!active) return;
    active = false;
    clearTimeout(timer);
    void backgroundLocation.stop();
  }

  function expire() {
    if (!active) return;
    stop();
    void emergencyService.stopShare().catch(() => {
      /* shareToResume() ends it on the next launch */
    });
    handlers.onExpired();
  }

  const timer = setTimeout(expire, Math.min(remaining, MAX_TIMER_MS));

  void backgroundLocation
    .start((f) => {
      if (!active) return;
      if (Date.now() >= endsAt) {
        expire();
        return;
      }
      if (f.lat === 0 && f.lng === 0) return;
      void emergencyService.updateShare(f.lat, f.lng, f.accuracy, f.heading).catch(() => {
        /* one missed update; the next fix retries */
      });
    })
    .then((mode) => {
      if (mode === "foreground" && active) handlers.onForegroundOnly?.();
    });

  return { stop };
}
