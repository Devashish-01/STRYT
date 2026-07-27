import { Capacitor, registerPlugin } from "@capacitor/core";

interface BatteryOptimizationPlugin {
  isIgnoringBatteryOptimizations(): Promise<{ ignoring: boolean }>;
  requestIgnoreBatteryOptimizations(): Promise<void>;
}

// Backed by android/app/src/main/java/in/stryt/app/BatteryOptimizationPlugin.java.
// iOS has no equivalent concept — the plugin is Android-only and every export
// here no-ops off-Android.
const BatteryOptimization = registerPlugin<BatteryOptimizationPlugin>("BatteryOptimization");

export async function isIgnoringBatteryOptimizations(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return true;
  try {
    const { ignoring } = await BatteryOptimization.isIgnoringBatteryOptimizations();
    return ignoring;
  } catch {
    return true; // fail open — never block on a plugin call we can't read
  }
}

export async function requestIgnoreBatteryOptimizations(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;
  try {
    await BatteryOptimization.requestIgnoreBatteryOptimizations();
  } catch { /* best-effort — the system dialog itself may be OEM-blocked */ }
}
