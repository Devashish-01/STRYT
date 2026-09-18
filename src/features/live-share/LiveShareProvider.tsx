import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { emergencyService } from "@/services";
import { backgroundLocation } from "@/lib/backgroundLocation";
import { nativeGeolocation } from "@/lib/nativeGeolocation";
import { useApp } from "@/store";
import BackgroundLocationDisclosure from "./BackgroundLocationDisclosure";
import { LiveShareContext } from "./useLiveShare";
import { assumedExpiry, shareToResume, watchShare, type ShareWatch } from "./shareSession";

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
  const watch = useRef<ShareWatch | null>(null);
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

  // Collects until stopped or until the share expires — see shareSession.ts for why expiry is enforced here.
  const beginWatch = useCallback((expiresAt: string) => {
    if (watch.current) return;
    watch.current = watchShare(expiresAt, {
      onExpired: () => {
        watch.current = null;
        setActiveShareId(null);
        showToast("Your live share ended automatically. Start it again to keep sharing.");
      },
      onForegroundOnly: () => showToast("Live share is on — keep STRYT open for continuous updates."),
    });
  }, [showToast]);

  const endWatch = useCallback(() => {
    if (watch.current) watch.current.stop();
    else void backgroundLocation.stop();
    watch.current = null;
  }, []);

  useEffect(() => {
    if (!isAuthed) {
      setActiveShareId(null);
      endWatch();
      return;
    }
    let alive = true;
    void shareToResume().then((share) => {
      if (!alive || !share) return;
      setActiveShareId(share.id);
      beginWatch(share.expiresAt);
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
        // start_live_share may resume a running share, which keeps its original expiry — read it back.
        const share = await emergencyService.myActiveShare().catch(() => null);
        setActiveShareId(id);
        beginWatch(share?.id === id ? share.expiresAt : assumedExpiry());
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
