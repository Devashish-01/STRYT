// Manual OTA-update flow for the native app. With autoUpdate: "onlyDownload"
// the plugin downloads a new web bundle in the background and emits
// `updateAvailable`, but does NOT apply it — the user does, via the
// "Update available" button on the profile screens.
//
// The `updateAvailable` event can fire a few seconds after launch (once the
// foreground check + download completes), potentially BEFORE any profile screen
// mounts. So the listener is registered once at boot (initAppUpdates, called
// from initNativeApp) into a tiny module-level store; the useAppUpdate() hook
// just subscribes to it and never misses the event.

import { useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";

type PendingBundle = { id: string; version: string } | null;

let pending: PendingBundle = null;
let initialized = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Register the updateAvailable listener once, at native boot. No-op on web. */
export async function initAppUpdates(): Promise<void> {
  if (initialized || !Capacitor.isNativePlatform()) return;
  initialized = true;
  try {
    const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
    await CapacitorUpdater.addListener("updateAvailable", (state) => {
      pending = { id: state.bundle.id, version: state.bundle.version };
      emit();
    });
  } catch { /* updater plugin absent — ignore */ }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): PendingBundle {
  return pending;
}

/**
 * Apply the downloaded bundle. `set` swaps to it and reloads the WebView
 * immediately — this destroys the current JS context, so nothing after it runs.
 */
export async function applyPendingUpdate(): Promise<void> {
  if (!pending) return;
  const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
  await CapacitorUpdater.set({ id: pending.id });
}

/** Returns the pending bundle (or null) and re-renders when one arrives. */
export function useAppUpdate(): PendingBundle {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
