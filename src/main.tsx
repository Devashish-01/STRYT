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
import { initNativeApp } from "./lib/nativeApp";
import { initMonitoring } from "./lib/monitoring";
import ServiceWorkerUpdater from "./components/ServiceWorkerUpdater";
import "leaflet/dist/leaflet.css";
import "./index.css";

// Global error/crash monitoring — registers window error + unhandledrejection
// handlers and ships captured errors to the client_errors sink. Wired first so
// it's active before anything else can throw.
initMonitoring();

// Native wrapper setup (back button, status bar, splash). No-ops on web.
void initNativeApp();

// PWA service worker registration — WEB ONLY — now lives in
// <ServiceWorkerUpdater/> (rendered below, inside AppProvider) so the "new
// version available" moment can use the app's own branded toast instead of
// reloading with zero warning. See that component for the full rationale;
// the forced-reload guarantee itself (registerType:"autoUpdate") is unchanged.
//
// NEVER register a SW inside the Capacitor WebView: it caches the APK's bundled
// assets, and because that Cache Storage survives APK updates, the old shell
// keeps being served after an update — the exact same stale-screen bug, but with
// no auto-reload path to escape it. The native app updates via a new APK, not a
// SW. initNativeApp() actively tears down any leftover SW from older builds.

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <I18nProvider>
          <AppProvider>
            <IconContext.Provider value={{ weight: "regular", size: "1em" }}>
              <ServiceWorkerUpdater />
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
