import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { registerSW } from "virtual:pwa-register";
import { useApp } from "@/store";

// Was: main.tsx called registerSW({ immediate: true }) at module scope with no
// callbacks. Per registerType:"autoUpdate" in vite.config.ts, that silently
// reloads the page the instant a new deploy is detected — no visible cause,
// possibly mid-tap. That forced reload is deliberate and load-bearing (see the
// comment this replaced): without it, a stale cached shell used to stick
// around for 2-3 app opens until every tab was closed — so this still forces
// the same reload, just gives it a brief branded moment first instead of an
// unexplained flash. Needs to live in a component (not main.tsx's module
// scope) to reach useApp()'s showToast.
export default function ServiceWorkerUpdater() {
  const { showToast } = useApp();

  useEffect(() => {
    if (Capacitor.isNativePlatform() || !("serviceWorker" in navigator)) return;

    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        showToast("Updating STRYT to the latest version…");
        setTimeout(() => { void updateSW(true); }, 900);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
