import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Autosave for a multi-step form, so leaving the app mid-way doesn't throw the
 * answers away.
 *
 * Onboarding is where this actually bites: the business flow holds sixteen
 * fields across four steps and the provider flow nine, all in component state.
 * Someone switching to WhatsApp to ask a partner for the shop's pincode — or an
 * OS reclaiming the tab, or a stray reload — came back to an empty step 1
 * (BUSINESS_ONBOARDING #3, PROVIDER_ONBOARDING #12).
 *
 * `localStorage`, not `sessionStorage`: the failure this exists for is the app
 * being backgrounded and killed, which is exactly the case sessionStorage does
 * not survive. The draft is namespaced per user by the caller's `key`, for the
 * same reason `ob_beat` had to be (CUSTOMER_ONBOARDING #3) — a shared phone
 * must not hand one person's half-written listing to the next.
 *
 * ## What is deliberately NOT saved
 *
 * Anything holding a `File` — chosen photos — because a File can't be
 * serialised and a blob URL doesn't survive a reload. Callers pass only
 * serialisable fields in `snapshot`, and the restore banner says photos need
 * re-picking rather than silently returning a form that looks complete but
 * would submit without them.
 */

export interface UseFormDraftResult {
  /** True when a stored draft was found and applied on mount. */
  restored: boolean;
  /** Acknowledge the restore banner without discarding anything. */
  acknowledge: () => void;
  /** Throw the draft away — both stored and the banner. Autosave then resumes
   *  from whatever the form holds next, so callers that mean "start over" must
   *  also reset their own state. */
  discard: () => void;
  /** Remove the stored draft without touching the banner — for a successful
   *  submit, where the form is about to unmount anyway. */
  clear: () => void;
}

function storage(): Storage | null {
  try {
    // Private-mode Safari throws on access rather than on write.
    const s = window.localStorage;
    const probe = "__draft_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function useFormDraft<T extends object>({
  key,
  snapshot,
  onRestore,
  isEmpty,
  debounceMs = 600,
}: {
  /** Storage key, already namespaced per user. Null disables the hook entirely
   *  — used while the identity is still resolving, so a draft can never be
   *  written under the wrong key. */
  key: string | null;
  /** The current serialisable form state. */
  snapshot: T;
  /** Applied once, on mount, when a stored draft is found. */
  onRestore: (saved: T) => void;
  /** "Nothing worth saving yet." Without it, merely opening the form would
   *  write an empty draft and every later visit would claim to have restored
   *  something. */
  isEmpty: (value: T) => boolean;
  debounceMs?: number;
}): UseFormDraftResult {
  const [restored, setRestored] = useState(false);
  const loadedKey = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read by the unmount flush, whose empty deps would otherwise close over the
  // very first render's values.
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const keyRef = useRef(key);
  keyRef.current = key;
  const isEmptyRef = useRef(isEmpty);
  isEmptyRef.current = isEmpty;
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  const write = useCallback((k: string, value: T) => {
    const s = storage();
    if (!s) return;
    try {
      if (isEmptyRef.current(value)) s.removeItem(k);
      else s.setItem(k, JSON.stringify(value));
    } catch {
      // A full quota is not worth interrupting the form over.
    }
  }, []);

  // Restore once per key.
  useEffect(() => {
    if (!key || loadedKey.current === key) return;
    loadedKey.current = key;
    const s = storage();
    if (!s) return;
    try {
      const raw = s.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as T;
      if (parsed && typeof parsed === "object" && !isEmptyRef.current(parsed)) {
        onRestoreRef.current(parsed);
        setRestored(true);
      }
    } catch {
      // A draft written by an older shape of the form is not worth crashing
      // over; drop it and start clean.
      try { s.removeItem(key); } catch { /* ignore */ }
    }
  }, [key]);

  // Debounced autosave. Skipped until the restore pass for this key has run, so
  // the empty initial state can't overwrite a stored draft before it loads.
  useEffect(() => {
    if (!key || loadedKey.current !== key) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => write(key, snapshot), debounceMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [key, snapshot, debounceMs, write]);

  // Flush on unmount — the debounce window is exactly when a backgrounded tab
  // gets killed, which is the case this hook exists for.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    const k = keyRef.current;
    if (k) write(k, snapshotRef.current);
  }, [write]);

  const acknowledge = useCallback(() => setRestored(false), []);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    const k = keyRef.current;
    if (!k) return;
    const s = storage();
    try { s?.removeItem(k); } catch { /* ignore */ }
  }, []);

  const discard = useCallback(() => {
    clear();
    setRestored(false);
  }, [clear]);

  return { restored, acknowledge, discard, clear };
}
