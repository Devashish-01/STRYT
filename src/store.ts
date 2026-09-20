import { createContext, useContext } from "react";
import type { BookmarkTarget, Role, CurrentUser } from "@/types";
import type { BookmarkKey, FollowKey, UserList } from "@/store/sliceTypes";

export type ContextType = "customer" | "business" | "provider" | "delivery";
export interface ActiveContext {
  type: ContextType;
  id: string | null; // business/provider id, null for customer
  name: string;
}

export interface AppState {
  // current user (hydrated from userService after auth)
  user: CurrentUser;
  refreshUser: (options?: { throwOnError?: boolean }) => Promise<void>;

  // location
  area: string;
  city: string;
  setArea: (area: string) => void;

  // role
  activeRole: Role;
  roles: Role[];
  setActiveRole: (r: Role) => void;
  /**
   * Grant a role and persist it. **Awaitable, and callers must await it** —
   * this used to fire `void userService.update(...)` and return immediately,
   * so an onboarding flow that called `addRole(...)` then `await refreshUser()`
   * raced its own write: refreshUser read `roles` back from the database before
   * the update landed and reset it to `['customer']`, silently stripping the
   * role the user had just earned (BUSINESS_ONBOARDING #19, PROVIDER #6).
   */
  addRole: (r: Role) => Promise<void>;

  // active context (which "hat" you're wearing)
  activeContext: ActiveContext;
  setContext: (ctx: ActiveContext) => void;
  /**
   * Businesses this user OWNS. This is an authority signal — it decides who
   * counts as the owner in BusinessAccessGuard, who may run business-password
   * recovery, and whose business appears on their own profile. Never put a
   * delegated grant in here; use `manageableBusinessIds` for "can open".
   */
  ownedBusinessIds: string[];
  /** Businesses reachable via an ACTIVE grant (team member or FULL delegate), never owned. */
  delegatedBusinessIds: string[];
  /** owned ∪ delegated — "which business consoles can this user open at all". */
  manageableBusinessIds: string[];
  ownedProviderId: string | null;
  // true once refreshUser()'s owned-entities read has actually succeeded at
  // least once (not flipped in a finally, unlike profileReady) — lets
  // BusinessAccessGuard/ProviderAccessGuard trust an empty ownedBusinessIds
  // as "really empty" instead of "still loading".
  ownedEntitiesLoaded: boolean;

  // profile-switch password gate — switching INTO business/provider (never
  // back to customer) is held here until the password sheet confirms or
  // cancels it. Business and Provider each have their own independent
  // password, set by the owner from their profile (Settings).
  /** Does auth.uid() (as an owner) have a business password set? Drives Settings' display + gates the owner's own switch-in for every business they own. */
  businessPasswordIsSet: boolean;
  /** Same, for the provider password (providers have no delegation, so this alone gates provider switch-in). */
  providerPasswordIsSet: boolean;
  /** Does auth.uid() have a backup recovery question for business password reset? */
  businessRecoveryIsSet: boolean;
  /** Same for provider password. */
  providerRecoveryIsSet: boolean;
  /** Per-business-id "does opening this business require a password" — covers owned businesses (mirrors businessPasswordIsSet) AND delegated ones (the OWNER's password, looked up server-side). Missing/unknown ids default to not-required (fail-open, matching today's optional/opt-in model). */
  businessPasswordRequired: Record<string, boolean>;
  pendingContextSwitch: { ctx: ActiveContext; dest: string } | null;
  /** Returns true if the caller should navigate immediately (no password needed);
   *  false means the switch is pending password verification via PinGateSheet. */
  attemptSwitchContext: (ctx: ActiveContext, dest: string) => boolean;
  /** PinGateSheet: commits the pending switch's context and returns its dest
   *  to navigate to, or null if there was nothing pending. */
  confirmPendingSwitch: () => string | null;
  cancelPendingSwitch: () => void;
  /** Re-fetches business/provider password + recovery status (self + delegated map) — call after set/clear/reset. */
  refreshEntityPasswordStatus: () => Promise<void>;

  // bookmarks
  bookmarks: BookmarkKey[];
  toggleBookmark: (type: BookmarkTarget, id: string) => void;
  isBookmarked: (type: BookmarkTarget, id: string) => boolean;

  // follows
  follows: FollowKey[];
  toggleFollow: (type: "BUSINESS" | "PROVIDER" | "USER", id: string, name?: string) => void;
  isFollowing: (type: "BUSINESS" | "PROVIDER" | "USER", id: string) => boolean;

  // stories viewed
  viewedStories: string[];
  markStoryViewed: (id: string) => void;

  // me too
  meToos: string[];
  toggleMeToo: (requestId: string) => void;

  // community likes & votes
  likes: string[];
  toggleLike: (postId: string) => void;
  votes: Record<string, string>; // postId -> optionId
  /** null retracts the caller's vote. */
  votePoll: (postId: string, optionId: string | null) => void;

  // coupons saved
  savedCoupons: string[];
  toggleCoupon: (id: string) => void;

  // loyalty stamps (override seed)
  extraStamps: Record<string, number>;
  addStamp: (cardId: string) => void;

  // endorsements / vouches
  endorsed: string[]; // `${providerId}:${skill}`
  toggleEndorse: (providerId: string, skill: string) => void;
  vouched: string[]; // providerId
  toggleVouch: (providerId: string) => void;

  // notify subscriptions
  notifySubs: string[];
  toggleNotify: (key: string) => void;

  // queue tokens joined
  queuesJoined: string[];
  joinQueue: (businessId: string) => void;

  // custom lists
  lists: UserList[];
  createList: (name: string, emoji: string) => Promise<string>;
  addToList: (listId: string, type: BookmarkTarget, id: string) => void;
  deleteList: (listId: string) => Promise<void>;
  removeFromList: (listId: string, type: BookmarkTarget, id: string) => Promise<void>;
  isInAnyList: (type: BookmarkTarget, id: string) => boolean;

  // true once the first post-login refreshUser() attempt has settled (success
  // or failure) — the route guard waits on this so screens never mount against
  // the blank seed user and briefly show placeholder identity data.
  profileReady: boolean;
  profileLoadError: boolean;
  offerNotificationPermission: () => Promise<void>;

  // chat unread count
  chatUnread: number;
  setChatUnread: (n: number) => void;

  // toast
  toast: string | null;
  showToast: (msg: string) => void;

  // auth
  isAuthed: boolean;
  authReady: boolean;
  signIn: () => void;
  signOut: () => void;

  // guest mode — a signed-out visitor browsing before they commit. See
  // GUEST_MODE_PLAN.md. `isGuest` is derived (authReady && !isAuthed), never
  // stored, so it can't get stuck on for someone who has since signed in.
  isGuest: boolean;
  /** Live browser fix for guests, session-only — never written to `users`. */
  guestLocation: { lat: number; lng: number } | null;
  guestLocationStatus: "idle" | "asking" | "granted" | "denied";
  requestGuestLocation: () => void;
  /** Set a guest's location by hand (session-only, never persisted). */
  setGuestLocation: (loc: { lat: number; lng: number }) => void;

  // data saver mode
  dataSaver: boolean;
  setDataSaver: (v: boolean) => void;

  // Notification-permission disclosure — shown once before the OS prompt,
  // instead of the previous cold PushNotifications.requestPermissions() call
  // right after sign-in (flow-completeness audit, workflow 22).
  notifExplainerPending: boolean;
  confirmNotifExplainer: () => void;
  dismissNotifExplainer: () => void;
}

/** The store itself. Exported so store/AppProvider.tsx can fill it — nothing else should read it
 *  directly; use useApp(). */
export const AppContext = createContext<AppState | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
