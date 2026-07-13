import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AppProvider } from "./store";
import { I18nProvider } from "./lib/i18n";
import ErrorBoundary from "./components/ErrorBoundary";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { IconContext } from "@phosphor-icons/react";
import { Capacitor } from "@capacitor/core";
import { initNativeApp } from "./lib/nativeApp";
import { registerSW } from "virtual:pwa-register";
import "leaflet/dist/leaflet.css";
import "./index.css";

// Native wrapper setup (back button, status bar, splash). No-ops on web.
void initNativeApp();

// PWA service worker — WEB ONLY. registerType is "autoUpdate", so vite-plugin-pwa
// posts SKIP_WAITING to the new SW and reloads the page as soon as a fresh build
// is detected — otherwise the old cached shell stays in control until every tab
// is closed, which is why a new deploy used to show the old screen for 2-3 opens.
//
// NEVER register a SW inside the Capacitor WebView: it caches the APK's bundled
// assets, and because that Cache Storage survives APK updates, the old shell
// keeps being served after an update — the exact same stale-screen bug, but with
// no auto-reload path to escape it. The native app updates via a new APK, not a
// SW. initNativeApp() actively tears down any leftover SW from older builds.
if (!Capacitor.isNativePlatform() && "serviceWorker" in navigator) {
  registerSW({ immediate: true });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <I18nProvider>
          <AppProvider>
            <IconContext.Provider value={{ weight: "regular", size: "1em" }}>
              <App />
              <Analytics />
              <SpeedInsights />
            </IconContext.Provider>
          </AppProvider>
        </I18nProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
