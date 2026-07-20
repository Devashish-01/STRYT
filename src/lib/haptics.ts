import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { Capacitor } from "@capacitor/core";

// Thin, named-intent wrapper around @capacitor/haptics — the one place any
// future haptic need in the app hooks into, not specific to any one feature.
// Capacitor plugins already no-op safely when there's no native bridge (web/
// desktop), but every call is additionally wrapped in try/catch: haptic
// feedback is always a nice-to-have, never something that should be able to
// throw and break the action it's attached to.
async function fire(fn: () => Promise<void>) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await fn();
  } catch {
    // Haptics are decorative — a plugin/permission failure should never
    // surface to the user or interrupt whatever action triggered it.
  }
}

export const haptics = {
  /** Smallest tick — hover-like acknowledgement, e.g. a stepper +/- tap. */
  light: () => fire(() => Haptics.impact({ style: ImpactStyle.Light })),
  /** A deliberate action landed — e.g. tapping "Call next". */
  medium: () => fire(() => Haptics.impact({ style: ImpactStyle.Medium })),
  /** Something good just happened — e.g. your queue turn arrived. */
  success: () => fire(() => Haptics.notification({ type: NotificationType.Success })),
  /** Something needs attention — e.g. a payment claim was rejected. */
  warning: () => fire(() => Haptics.notification({ type: NotificationType.Warning })),
  /** A discrete choice was made — e.g. moving a stepper value or switching a tab. */
  selection: () => fire(() => Haptics.selectionStart().then(() => Haptics.selectionChanged()).then(() => Haptics.selectionEnd())),
};
