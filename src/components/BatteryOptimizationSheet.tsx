import { useEffect, useState } from "react";
import { Zap } from "@/components/Icons";
import { requestIgnoreBatteryOptimizations } from "@/lib/batteryOptimization";

/**
 * Mounted once in App.tsx. Asks for the OEM battery-optimization exemption.
 *
 * This is ONLY shown to a delivery agent going on duty — see
 * `promptBatteryExemptionForDuty()` in lib/batteryOptimization.ts.
 *
 * It used to fire for every Android user on first push registration, with copy
 * about notification reliability. That was the app's biggest Play-review risk:
 * `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` is restricted to a narrow allowlist
 * (alarms/timers, VoIP, task automation, companion devices) and "so that
 * notifications arrive" is explicitly not on it.
 *
 * The comparable Indian apps (Zomato, Swiggy, Blinkit) dodge this entirely by
 * shipping a SEPARATE delivery-partner app, so only riders ever see rider-grade
 * permission requests. STRYT is one app carrying every role, so it has to draw
 * that line itself — which is what the duty gate does.
 *
 * The copy below is deliberately the same justification given to Play review:
 * an accepted run needs to keep reporting location until it's finished.
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
          <Zap size={20} color="var(--delivery-600)" />
          <h3 className="bold h2">Keep your run tracking</h3>
        </div>
        <p className="small muted" style={{ marginBottom: 14 }}>
          While you're on a delivery, the shop and the customer follow your
          progress from your location. Many phones (Xiaomi, Samsung, Oppo, Vivo,
          OnePlus) stop background location to save battery, which freezes your
          position mid-run and makes you look stuck.
        </p>
        <p className="small muted" style={{ marginBottom: 14 }}>
          Letting STRYT skip battery optimisation keeps that working until you
          finish. It only ever runs while you have an accepted delivery.
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
