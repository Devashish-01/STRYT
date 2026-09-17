import { createContext, useContext } from "react";

/**
 * App-wide live-location share state. Owns the single ACTIVE session and the
 * background (or foreground-fallback) watcher that keeps it fresh.
 */
interface LiveShareCtx {
  activeShareId: string | null;
  busy: boolean;
  start: () => Promise<string | null>;
  stop: () => Promise<void>;
}
/** Exported so LiveShareProvider.tsx can fill it. Everything else uses useLiveShare(). */
export const LiveShareContext = createContext<LiveShareCtx | null>(null);

export function useLiveShare(): LiveShareCtx {
  const ctx = useContext(LiveShareContext);
  if (!ctx) throw new Error("useLiveShare must be used within LiveShareProvider");
  return ctx;
}
