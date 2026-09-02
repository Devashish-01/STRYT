import { useCallback, useRef, useState } from "react";

export function useToast() {
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    // Light haptic tick on every toast — feedback feels physical on device.
    // VIBRATE permission is already in the manifest, and this was meant to
    // silently no-op on web — but Chrome doesn't silently drop an unprompted
    // vibrate() call, it logs a console [Intervention] warning that reads
    // like a real error. That only happens for a toast fired before any tap
    // (a background fetch failing on page load, say); userActivation lets
    // us skip the doomed attempt instead of triggering the warning. Absent
    // the API entirely (older browsers), fall through to the old behaviour.
    try {
      if (navigator.userActivation?.hasBeenActive ?? true) navigator.vibrate?.(12);
    } catch { /* unsupported */ }
    if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2200);
  }, []);

  return { toast, showToast };
}
