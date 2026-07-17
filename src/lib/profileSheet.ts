/**
 * profileSheet.ts — module-level singleton so any component can trigger the
 * global UserProfileSheet without prop-drilling or adding to the app store.
 *
 * Usage:
 *   import { openProfile } from "@/lib/profileSheet";
 *   openProfile(userId, { name: "Rahul", avatar: "https://..." });
 */

export type ProfileType = "USER" | "BUSINESS" | "PROVIDER";

export interface ProfileSheetHint {
  /** Display name already known at the call site — shows immediately, no flicker */
  name?: string;
  /** Avatar URL already known at the call site */
  avatar?: string;
}

export interface ProfileSheetPayload {
  id: string;
  type: ProfileType;
  hint?: ProfileSheetHint;
}

type Listener = (payload: ProfileSheetPayload | null) => void;

let _listener: Listener | null = null;

/** Call from anywhere to open the mini profile sheet. */
export function openProfile(id: string, type: ProfileType = "USER", hint?: ProfileSheetHint) {
  _listener?.({ id, type, hint });
}

/** Internal — used only by UserProfileSheet to subscribe. */
export function _subscribeProfileSheet(l: Listener) {
  _listener = l;
  return () => {
    if (_listener === l) _listener = null;
  };
}
