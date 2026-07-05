import { useCallback, useRef, useState } from "react";

export function useToast() {
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    // Light haptic tick on every toast — feedback feels physical on device.
    // VIBRATE permission is already in the manifest; silently no-ops on web.
    try { navigator.vibrate?.(12); } catch { /* unsupported */ }
    if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2200);
  }, []);

  return { toast, showToast };
}
