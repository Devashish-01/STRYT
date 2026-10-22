import { useSyncExternalStore } from "react";

/**
 * Where delivery location sharing stands, readable from any screen.
 *
 * It used to live inside the rider console: leaving that screen stopped tracking, declining the location prompt failed
 * silently, and nothing told the rider (or the owner) that the position had gone stale. The runner
 * (DeliveryTrackingRunner) owns the watcher now; this store only publishes what it is doing.
 *
 *   idle      no delivery needs tracking
 *   starting  asking permission / starting the watcher
 *   on        fixes are arriving and being sent
 *   declined  the rider refused (or the system denied) location — the owner sees nothing
 *   lost      tracking should be running but no fix has arrived for a while (GPS off, no signal, OS killed it)
 *   offline   fixes arrive but the server can't be reached
 */
export type TrackingStatus = "idle" | "starting" | "on" | "declined" | "lost" | "offline";

export interface TrackingState {
  status: TrackingStatus;
  lastFixAt: number | null;
  /** True while the rider console is open, so the runner knows to load deliveries even before one is active. */
  consoleOpen: boolean;
}

let state: TrackingState = { status: "idle", lastFixAt: null, consoleOpen: false };
let lastFix: { lat: number; lng: number; at: number } | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function getTrackingState(): TrackingState {
  return state;
}

export function setTrackingState(patch: Partial<TrackingState>): void {
  const next = { ...state, ...patch };
  if (next.status === state.status && next.lastFixAt === state.lastFixAt && next.consoleOpen === state.consoleOpen) return;
  state = next; // a new object each change, so useSyncExternalStore sees it
  emit();
}

export function subscribeTracking(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function useTrackingState(): TrackingState {
  return useSyncExternalStore(subscribeTracking, getTrackingState, getTrackingState);
}

/** The most recent position the watcher produced, if it is recent enough to use instead of waiting for a new GPS read. */
export function recordFix(f: { lat: number; lng: number }): void {
  lastFix = { lat: f.lat, lng: f.lng, at: Date.now() };
}

export function lastKnownFix(maxAgeMs = 60_000): { lat: number; lng: number } | null {
  if (!lastFix || Date.now() - lastFix.at > maxAgeMs) return null;
  return { lat: lastFix.lat, lng: lastFix.lng };
}

/** Set by the runner so a banner anywhere can ask it to try again (re-prompt for location). */
export const trackingControl: { retry: () => void } = { retry: () => {} };

/** Test helper. */
export function resetTrackingForTests(): void {
  state = { status: "idle", lastFixAt: null, consoleOpen: false };
  lastFix = null;
  listeners.clear();
}
