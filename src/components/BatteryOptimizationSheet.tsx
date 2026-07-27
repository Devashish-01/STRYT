import { useEffect, useState } from "react";
import { Zap } from "@/components/Icons";
import { requestIgnoreBatteryOptimizations } from "@/lib/batteryOptimization";

/**
 * Mounted once in App.tsx. Fired by pushNotifications.ts (registerPush's
 * "registration" listener) the first time a native Android token registers
 * while the OS still has this app under battery optimization — asks the user
 * to whitelist STRYT so background/locked-screen notifications actually get
 * a heads-up alert + sound instead of being silently throttled by the OEM.
 */
export default function BatteryOptimizationSheet() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onPrompt = () => setOpen(true);
    window.addEventListener("battery-optimization-prompt", onPrompt);
    return () => window.removeEventListener("battery-optimization-prompt", onPrompt);
  }, []);

  if (!open) return null;
  const close = () => setOpen(false);

  return (
    <div className="overlay" onClick={close}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="row gap-8" style={{ marginBottom: 4 }}>
          <Zap size={20} color="var(--brand-600)" />
          <h3 className="bold h2">Keep notifications reliable</h3>
        </div>
        <p className="small muted" style={{ marginBottom: 14 }}>
          Some phones aggressively restrict background apps, which can delay or
          block notifications when STRYT isn't open. Letting STRYT skip battery
          optimization keeps bookings, messages, and alerts arriving instantly —
          even while the app is closed or your phone is locked.
        </p>
        <button
          className="btn btn-primary btn-block"
          onClick={async () => {
            await requestIgnoreBatteryOptimizations();
            close();
          }}
        >
          Allow
        </button>
        <button
          className="btn btn-block"
          style={{ marginTop: 8, background: "transparent" }}
          onClick={close}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
