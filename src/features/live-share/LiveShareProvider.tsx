import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { emergencyService } from "@/services";
import { backgroundLocation } from "@/lib/backgroundLocation";
import { nativeGeolocation } from "@/lib/nativeGeolocation";
import { useApp } from "@/store";
import BackgroundLocationDisclosure from "./BackgroundLocationDisclosure";
import { LiveShareContext } from "./useLiveShare";

function firstFix(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((res) =>
    nativeGeolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => res(null),
      { timeout: 12000 },
    ),
  );
}

export function LiveShareProvider({ children }: { children: ReactNode }) {
  const { isAuthed, showToast } = useApp();
  const [activeShareId, setActiveShareId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const watching = useRef(false);
  const disclosureResolver = useRef<((accepted: boolean) => void) | null>(null);

  // Shown whenever background location is not actually granted — immediately before the system dialog, as
  // Play requires — rather than once per install. See backgroundLocation.needsBackgroundDisclosure().
  const ensureBackgroundDisclosure = useCallback(async (): Promise<boolean> => {
    if (!(await backgroundLocation.needsBackgroundDisclosure())) return true;
    return new Promise<boolean>((resolve) => {
      disclosureResolver.current = resolve;
      setDisclosureOpen(true);
    });
  }, []);

  const beginWatch = useCallback(() => {
    if (watching.current) return;
    watching.current = true;
    void backgroundLocation.start((f) => {
      if (f.lat === 0 && f.lng === 0) return;
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
      const contacts = await emergencyService.listContacts();
      if (!contacts || contacts.length === 0) {
        showToast("Add at least one emergency contact before sharing your location");
        return null;
      }

      const allowed = await ensureBackgroundDisclosure();
      if (!allowed) return null;

      const fix = await firstFix();
      if (!fix || (fix.lat === 0 && fix.lng === 0)) {
        showToast("Couldn't acquire GPS fix. Please ensure location services are enabled.");
        return null;
      }

      const id = await emergencyService.startShare(fix.lat, fix.lng);
      if (id) {
        setActiveShareId(id);
        beginWatch();
      }
      return id;
    } finally {
      setBusy(false);
    }
  }, [beginWatch, ensureBackgroundDisclosure, showToast]);

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
    <LiveShareContext.Provider value={{ activeShareId, busy, start, stop }}>
      {children}
      {disclosureOpen && (
        <BackgroundLocationDisclosure onAccept={acceptDisclosure} onDecline={declineDisclosure} />
      )}
    </LiveShareContext.Provider>
  );
}
