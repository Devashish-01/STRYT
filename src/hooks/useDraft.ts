import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearDraft,
  emptyDraft,
  loadDraft,
  saveDraft,
  type CommunityDraft,
  type DraftIdentity,
  type DraftStorage,
} from "@/lib/communityDraft";

/** `localStorage` is unavailable in a few real situations (Safari private mode,
 *  cookies disabled, SSR/prerender) and merely *touching* it throws in some of
 *  them — so every access goes through this guard rather than assuming a
 *  browser. Drafts are a convenience; losing them must never break composing. */
function getStorage(): DraftStorage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

const AUTOSAVE_DEBOUNCE_MS = 600;
const SAVED_HINT_MS = 2200;

interface UseDraftResult {
  draft: CommunityDraft;
  /** Patch one or more draft fields; autosave follows on its own. */
  patch: (p: Partial<CommunityDraft>) => void;
  /** Replace the whole draft (used by "start over"). */
  reset: () => void;
  /** Forget the stored draft — call on successful post and on explicit discard. */
  discard: () => void;
  /** True for a moment after a save landed, for the "Draft saved" hint. */
  justSaved: boolean;
  /** True when a draft was restored from a previous session. */
  restored: boolean;
  /** Dismiss the "restored" banner without discarding the draft. */
  acknowledgeRestore: () => void;
}

/**
 * Identity-scoped, debounced draft autosave for the community composer.
 *
 * The identity argument matters: the composer can be open as yourself or as any
 * business/provider you manage, and that identity resolves asynchronously
 * (see CommunityCompose's sellerCtx). Passing `null` while it resolves keeps
 * the hook inert instead of briefly reading/writing the wrong identity's draft.
 */
export function useDraft(identity: DraftIdentity | null): UseDraftResult {
  const [draft, setDraft] = useState<CommunityDraft>(() => emptyDraft());
  const [justSaved, setJustSaved] = useState(false);
  const [restored, setRestored] = useState(false);
  // Which identity the in-memory draft actually belongs to. Guards against
  // autosaving the personal draft under a business key the moment the seller
  // identity resolves a beat after mount.
  const loadedKey = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const identityKey = identity ? `${identity.type}:${identity.id}` : null;
  // Latest draft/identity for the unmount-flush effect below, so that effect's
  // empty-deps closure doesn't read a stale value from whichever render it was
  // created on.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const identityRef = useRef(identity);
  identityRef.current = identity;

  // Restore once per identity.
  useEffect(() => {
    if (!identity || !identityKey) return;
    if (loadedKey.current === identityKey) return;
    loadedKey.current = identityKey;
    const stored = loadDraft(identity, getStorage());
    if (stored) {
      setDraft(stored);
      setRestored(true);
    } else {
      setDraft(emptyDraft());
      setRestored(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityKey]);

  // Debounced autosave. Skipped until the draft has been loaded for this
  // identity, so a restore never immediately re-saves what it just read.
  useEffect(() => {
    if (!identity || !identityKey || loadedKey.current !== identityKey) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const saved = saveDraft(identity, draft, getStorage());
      if (saved) {
        setJustSaved(true);
        if (hintTimer.current) clearTimeout(hintTimer.current);
        hintTimer.current = setTimeout(() => setJustSaved(false), SAVED_HINT_MS);
      }
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, identityKey]);

  // A separate, mount-scoped effect: its cleanup only runs on true unmount
  // (never on every keystroke, the way the debounce effect's cleanup above
  // does), so it's the right place to FLUSH a still-pending autosave instead of
  // just cancelling it — otherwise navigating away (e.g. "Save draft") inside
  // the debounce window silently drops the last edit.
  useEffect(() => () => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    const id = identityRef.current;
    if (id && loadedKey.current === `${id.type}:${id.id}`) {
      saveDraft(id, draftRef.current, getStorage());
    }
  }, []);

  useEffect(() => () => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
  }, []);

  const patch = useCallback((p: Partial<CommunityDraft>) => {
    setDraft((prev) => ({ ...prev, ...p }));
    setRestored(false);
  }, []);

  const reset = useCallback(() => {
    setDraft(emptyDraft());
    setRestored(false);
  }, []);

  const discard = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null; // nothing left to flush on unmount after an explicit discard
    if (identity) clearDraft(identity, getStorage());
    setDraft(emptyDraft());
    setRestored(false);
    setJustSaved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityKey]);

  const acknowledgeRestore = useCallback(() => setRestored(false), []);

  return { draft, patch, reset, discard, justSaved, restored, acknowledgeRestore };
}
