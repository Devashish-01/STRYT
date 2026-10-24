import { useEffect, useState } from "react";
import { Zap } from "@/components/Icons";
import { openBatterySettings } from "@/lib/batteryOptimization";
import { useI18n } from "@/lib/i18n";

/**
 * Mounted once in App.tsx. Suggests the OEM battery-optimisation exemption by opening the system's battery settings.
 *
 * This is ONLY shown to a delivery agent going on duty — see
 * `promptBatteryExemptionForDuty()` in lib/batteryOptimization.ts.
 *
 * It used to fire for every Android user on first push registration, with copy about notification reliability, through the
 * restricted `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` permission (alarms/timers, VoIP, task automation, companion devices only).
 * Now there is no such permission: the button opens the settings list, which needs none.
 *
 * The comparable Indian apps (Zomato, Swiggy, Blinkit) dodge this entirely by
 * shipping a SEPARATE delivery-partner app, so only riders ever see rider-grade
 * permission requests. STRYT is one app carrying every role, so it has to draw
 * that line itself — which is what the duty gate does.
 *
 * The copy is the same justification given to Play review: an accepted run needs to keep reporting location until it's finished.
 */
export default function BatteryOptimizationSheet() {
  const { t } = useI18n();
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
          <h3 className="bold h2">{t("bat_title")}</h3>
        </div>
        <p className="small muted" style={{ marginBottom: 14 }}>{t("bat_body_why")}</p>
        <p className="small muted" style={{ marginBottom: 14 }}>{t("bat_body_how")}</p>
        <button
          className="btn btn-primary btn-block"
          onClick={async () => {
            await openBatterySettings();
            close();
          }}
        >
          {t("bat_open_settings")}
        </button>
        <button
          className="btn btn-block"
          style={{ marginTop: 8, background: "transparent" }}
          onClick={close}
        >
          {t("bat_not_now")}
        </button>
      </div>
    </div>
  );
}
