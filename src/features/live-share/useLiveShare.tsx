import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { emergencyService } from "@/services";
import { backgroundLocation } from "@/lib/backgroundLocation";
import { nativeGeolocation } from "@/lib/nativeGeolocation";
import { useApp } from "@/store";

/**
 * App-wide live-location share state. Owns the single ACTIVE session the user
 * may have running and the background-location watcher that keeps it fresh.
 * Consumed by the Home/account start buttons, the persistent active-share
 * banner, and restored automatically when the app reloads mid-share.
 */
interface LiveShareCtx {
  activeShareId: string | null;
  busy: boolean;
  start: () => Promise<string | null>;
  stop: () => Promise<void>;
}
const Ctx = createContext<LiveShareCtx | null>(null);

function firstFix(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((res) =>
    nativeGeolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => res(null),
      { timeout: 12000 }
    )
  );
}

export function LiveShareProvider({ children }: { children: ReactNode }) {
  const { isAuthed } = useApp();
  const [activeShareId, setActiveShareId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const watching = useRef(false);

  const beginWatch = useCallback(() => {
    if (watching.current) return;
    watching.current = true;
    void backgroundLocation.start((f) => {
      void emergencyService.updateShare(f.lat, f.lng, f.accuracy, f.heading);
    });
  }, []);

  const endWatch = useCallback(() => {
    watching.current = false;
    void backgroundLocation.stop();
  }, []);

  // Restore an in-flight share when the app (re)loads or auth changes.
  useEffect(() => {
    if (!isAuthed) {
      setActiveShareId(null);
      endWatch();
      return;
    }
    let alive = true;
    void emergencyService.myActiveShareId().then((id) => {
      if (!alive || !id) return;
      setActiveShareId(id);
      beginWatch();
    });
    return () => { alive = false; };
  }, [isAuthed, beginWatch, endWatch]);

  const start = useCallback(async (): Promise<string | null> => {
    setBusy(true);
    try {
      const fix = await firstFix();
      const id = await emergencyService.startShare(fix?.lat ?? 0, fix?.lng ?? 0);
      if (id) {
        setActiveShareId(id);
        beginWatch();
      }
      return id;
    } finally {
      setBusy(false);
    }
  }, [beginWatch]);

  const stop = useCallback(async (): Promise<void> => {
    setBusy(true);
    try {
      endWatch();
      await emergencyService.stopShare();
      setActiveShareId(null);
    } finally {
      setBusy(false);
    }
  }, [endWatch]);

  return <Ctx.Provider value={{ activeShareId, busy, start, stop }}>{children}</Ctx.Provider>;
}

export function useLiveShare(): LiveShareCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLiveShare must be used within LiveShareProvider");
  return ctx;
}
