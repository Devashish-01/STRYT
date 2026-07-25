import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { emergencyService } from "@/services";
import { backgroundLocation } from "@/lib/backgroundLocation";
import { nativeGeolocation } from "@/lib/nativeGeolocation";
import { useApp } from "@/store";
import BackgroundLocationDisclosure from "./BackgroundLocationDisclosure";

const DISCLOSURE_KEY = "stryt_bg_location_disclosure_v1";

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
const Ctx = createContext<LiveShareCtx | null>(null);

function firstFix(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((res) =>
    nativeGeolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => res(null),
      { timeout: 12000 },
    ),
  );
}

function disclosureAlreadyAccepted(): boolean {
  try {
    return localStorage.getItem(DISCLOSURE_KEY) === "1";
  } catch {
    return false;
  }
}

export function LiveShareProvider({ children }: { children: ReactNode }) {
  const { isAuthed, showToast } = useApp();
  const [activeShareId, setActiveShareId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const watching = useRef(false);
  const disclosureResolver = useRef<((accepted: boolean) => void) | null>(null);

  const ensureBackgroundDisclosure = useCallback((): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) return Promise.resolve(true);
    if (disclosureAlreadyAccepted()) return Promise.resolve(true);
    return new Promise((resolve) => {
      disclosureResolver.current = resolve;
      setDisclosureOpen(true);
    });
  }, []);

  const beginWatch = useCallback(() => {
    if (watching.current) return;
    watching.current = true;
    void backgroundLocation.start((f) => {
      void emergencyService.updateShare(f.lat, f.lng, f.accuracy, f.heading);
    }).then((mode) => {
      if (mode === "foreground") {
        showToast("Live share is on — keep STRYT open for continuous updates.");
      }
    });
  }, [showToast]);

  const endWatch = useCallback(() => {
    watching.current = false;
    void backgroundLocation.stop();
  }, []);

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
    return () => {
      alive = false;
    };
  }, [isAuthed, beginWatch, endWatch]);

  const start = useCallback(async (): Promise<string | null> => {
    setBusy(true);
    try {
      const allowed = await ensureBackgroundDisclosure();
      if (!allowed) return null;

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
  }, [beginWatch, ensureBackgroundDisclosure]);

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

  function acceptDisclosure() {
    try {
      localStorage.setItem(DISCLOSURE_KEY, "1");
    } catch {
      /* ignore */
    }
    setDisclosureOpen(false);
    disclosureResolver.current?.(true);
    disclosureResolver.current = null;
  }

  function declineDisclosure() {
    setDisclosureOpen(false);
    disclosureResolver.current?.(false);
    disclosureResolver.current = null;
  }

  return (
    <Ctx.Provider value={{ activeShareId, busy, start, stop }}>
      {children}
      {disclosureOpen && (
        <BackgroundLocationDisclosure onAccept={acceptDisclosure} onDecline={declineDisclosure} />
      )}
    </Ctx.Provider>
  );
}

export function useLiveShare(): LiveShareCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLiveShare must be used within LiveShareProvider");
  return ctx;
}
