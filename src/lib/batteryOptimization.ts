import { Capacitor, registerPlugin } from "@capacitor/core";

interface BatteryOptimizationPlugin {
  isIgnoringBatteryOptimizations(): Promise<{ ignoring: boolean }>;
  openBatterySettings(): Promise<void>;
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

/**
 * Opens Android's battery-optimisation settings. It does not use the "ask to ignore battery optimisations" dialog, because that needs
 * the REQUEST_IGNORE_BATTERY_OPTIMIZATIONS permission, which Play restricts to a short allowlist delivery tracking is not on.
 */
export async function openBatterySettings(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;
  try {
    await BatteryOptimization.openBatterySettings();
  } catch { /* best-effort — an older install without the native method, or a hidden settings screen */ }
}

/** Per-agent, so a shared/handed-over device still asks the next rider once. */
const dutyPromptKey = (userId: string) => `battery_prompt_duty_${userId}`;

/**
 * Suggest the battery exemption — but ONLY to a delivery agent going on duty.
 *
 * This replaces a prompt that fired for every Android user on first push registration, with a permission Play restricts to a
 * narrow allowlist. It now shows only to a rider, and only points them at the system settings page (no restricted permission).
 *
 * Tied to duty rather than to app launch because that is the only moment the
 * request is actually true: an accepted run has to keep reporting location, and
 * OEM battery managers are what stop it.
 *
 * Fails silent and never blocks going on duty — the exemption is an
 * optimisation, not a prerequisite.
 */
export async function promptBatteryExemptionForDuty(userId: string): Promise<void> {
  if (!userId) return;
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;
  try {
    if (localStorage.getItem(dutyPromptKey(userId)) === "true") return;
    if (await isIgnoringBatteryOptimizations()) return;
    localStorage.setItem(dutyPromptKey(userId), "true");
    window.dispatchEvent(new CustomEvent("battery-optimization-prompt"));
  } catch { /* storage blocked / plugin missing — skip the nudge entirely */ }
}
