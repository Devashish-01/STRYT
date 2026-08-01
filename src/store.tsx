import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { BookmarkTarget, Role, CurrentUser } from "@/types";
import { tokenStore } from "@/lib/auth";

// Blank placeholder user shown before auth hydrates. No hardcoded identity —
// the real profile is loaded from Supabase once signed in.
const seedUser: CurrentUser = {
  id: "",
  name: "",
  phone: "",
  avatar: "",
  roles: ["customer"],
  area: "",
  city: "",
  lat: 0,
  lng: 0,
  ratingAvg: 0,
  ratingCount: 0,
  language: "en",
  notificationRadiusKm: 5,
};
import { userService } from "@/services/core/userService";
import { nativeGeolocation } from "@/lib/nativeGeolocation";
import { reverseGeocode } from "@/lib/geocode";
import { authService } from "@/services/core/authService";
import { entityPasswordService } from "@/services/core/entityPasswordService";
import { chatService } from "@/services/engagement/chatService";
import { registerPush } from "@/lib/pushNotifications";
import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import type { BookmarkKey, FollowKey, UserList } from "@/store/sliceTypes";
import { useToast } from "@/store/useToast";
import { useAuthSession } from "@/store/useAuthSession";
import { useGuestLocation } from "@/store/useGuestLocation";
import { setGuestMode, GUEST_RADIUS_KM } from "@/lib/guestMode";
import { useSocialSlice } from "@/store/useSocialSlice";
import { useCommerceSlice } from "@/store/useCommerceSlice";
import { useNotificationBadges } from "@/store/useNotificationBadges";

export type ContextType = "customer" | "business" | "provider" | "delivery";
export interface ActiveContext {
  type: ContextType;
  id: string | null; // business/provider id, null for customer
  name: string;
}

interface AppState {
  // current user (hydrated from userService after auth)
  user: CurrentUser;
  refreshUser: () => Promise<void>;

  // location
  area: string;
  city: string;
  setArea: (area: string) => void;

  // role
  activeRole: Role;
  roles: Role[];
  setActiveRole: (r: Role) => void;
  addRole: (r: Role) => void;

  // active context (which "hat" you're wearing)
  activeContext: ActiveContext;
  setContext: (ctx: ActiveContext) => void;
  ownedBusinessIds: string[];
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
  votePoll: (postId: string, optionId: string) => void;

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
  isInAnyList: (type: BookmarkTarget, id: string) => boolean;

  // true once the first post-login refreshUser() attempt has settled (success
  // or failure) — the route guard waits on this so screens never mount against
  // the blank seed user and briefly show placeholder identity data.
  profileReady: boolean;

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

  // data saver mode
  dataSaver: boolean;
  setDataSaver: (v: boolean) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser>(seedUser);
  const [area, setArea] = useState("");
  const [dataSaver, setDataSaverState] = useState<boolean>(() => {
    return localStorage.getItem("dataSaver") === "true";
  });

  const setDataSaver = useCallback((v: boolean) => {
    setDataSaverState(v);
    localStorage.setItem("dataSaver", String(v));
  }, []);
  const [activeRole, setActiveRole] = useState<Role>(() => {
    const cached = localStorage.getItem("activeRole");
    return (cached as Role) || "customer";
  });
  const [roles, setRoles] = useState<Role[]>(seedUser.roles);

  const { isAuthed, setIsAuthed, authReady } = useAuthSession();
  const { toast, showToast } = useToast();

  const {
    bookmarks, setBookmarks, toggleBookmark, isBookmarked,
    follows, setFollows, toggleFollow, isFollowing,
    viewedStories, markStoryViewed,
    meToos, setMeToos, toggleMeToo,
    likes, toggleLike,
    votes, votePoll,
    endorsed, setEndorsed, toggleEndorse,
    vouched, setVouched, toggleVouch,
    notifySubs, toggleNotify,
  } = useSocialSlice(showToast);

  const {
    savedCoupons, setSavedCoupons, toggleCoupon,
    extraStamps, addStamp,
    queuesJoined, joinQueue,
    lists, setLists, createList, addToList, isInAnyList,
  } = useCommerceSlice(showToast);

  const { chatUnread, setChatUnread } = useNotificationBadges(isAuthed);
  const [profileReady, setProfileReady] = useState(false);

  // ── Guest mode ────────────────────────────────────────────────────────────
  // A visitor who has finished the auth check and turned out to be signed out.
  // Gated on authReady so we never flash "guest" during the boot round-trip and
  // ask for their location before we even know if they have a session.
  const isGuest = authReady && !isAuthed;
  const { guestLocation, guestLocationStatus, requestGuestLocation } = useGuestLocation(isGuest);

  // Services are plain modules and can't read this context — push the flag to
  // them so their radius resolvers can clamp guests to 1 km. Must run during
  // render (not an effect) so the very first feed fetch on a guest's initial
  // paint is already clamped, rather than firing wide once and correcting after.
  setGuestMode(isGuest);

  // The user object screens actually consume. For a guest this is the blank
  // seedUser with the live browser fix patched in — which is what makes every
  // existing `user.lat`/`user.lng` nearby query work for guests with no screen
  // changes at all. `id` stays "" so the existing
  // `user.id ? …fetch : Promise.resolve([])` guards keep short-circuiting the
  // personal data fetches a guest has no business making.
  const viewUser = useMemo<CurrentUser>(() => {
    if (!isGuest || !guestLocation) return user;
    return {
      ...user,
      lat: guestLocation.lat,
      lng: guestLocation.lng,
      notificationRadiusKm: GUEST_RADIUS_KM,
    };
  }, [isGuest, guestLocation, user]);

  // owned entities — hydrated from userService.owned() once authed.
  const [ownedBusinessIds, setOwnedBusinessIds] = useState<string[]>([]);
  const [ownedProviderId, setOwnedProviderId] = useState<string | null>(null);
  const [ownedEntitiesLoaded, setOwnedEntitiesLoaded] = useState(false);
  const [businessPasswordIsSet, setBusinessPasswordIsSet] = useState(false);
  const [providerPasswordIsSet, setProviderPasswordIsSet] = useState(false);
  const [businessRecoveryIsSet, setBusinessRecoveryIsSet] = useState(false);
  const [providerRecoveryIsSet, setProviderRecoveryIsSet] = useState(false);
  const [delegatedBusinessPasswordMap, setDelegatedBusinessPasswordMap] = useState<Record<string, boolean>>({});
  const [pendingContextSwitch, setPendingContextSwitch] = useState<{ ctx: ActiveContext; dest: string } | null>(null);
  const [activeContext, setActiveContext] = useState<ActiveContext>(() => {
    const cached = localStorage.getItem("activeContext");
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        // ignore
      }
    }
    return { type: "customer", id: null, name: seedUser.name };
  });

  // ── R8: hydrate bookmarks / follows / lists / unread from Supabase ──────
  const hydratePersonalData = useCallback(async () => {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return;

    // run all fetches in parallel
    const [bmRes, fwRes, lstRes, liRes, vcRes, enRes, cpRes, mtRes, chatUnreadCount] = await Promise.all([
      sb.from("bookmarks").select("target_type,target_id").eq("user_id", uid),
      sb.from("follows").select("target_type,target_id").eq("follower_user_id", uid),
      sb.from("user_lists").select("id,name,emoji,shared").eq("user_id", uid).order("created_at"),
      sb.from("user_list_items").select("list_id,target_type,target_id"),
      sb.from("vouches").select("provider_id").eq("from_user_id", uid),
      sb.from("endorsements").select("provider_id,skill").eq("from_user_id", uid),
      sb.from("user_saved_coupons").select("offer_id").eq("user_id", uid),
      sb.from("request_me_toos").select("request_id").eq("user_id", uid),
      chatService.totalUnread({ scope: "CUSTOMER" }),
    ]);

    if (bmRes.data) {
      setBookmarks(bmRes.data.map((r) => ({ type: r.target_type as BookmarkTarget, id: r.target_id })));
    }
    if (fwRes.data) {
      const loaded = fwRes.data.map((r) => ({
        type: (r.target_type as string).toUpperCase() as "BUSINESS" | "PROVIDER" | "USER",
        id: r.target_id,
      }));
      setFollows(loaded);
      try {
        localStorage.setItem("stryt_follows", JSON.stringify(loaded));
      } catch {}
    }
    if (lstRes.data && liRes.data) {
      setLists(
        lstRes.data.map((l) => ({
          id: l.id,
          name: l.name,
          emoji: l.emoji,
          shared: l.shared ?? false,
          items: liRes.data
            .filter((it) => it.list_id === l.id)
            .map((it) => ({ type: it.target_type as BookmarkTarget, id: it.target_id })),
        }))
      );
    }
    if (vcRes.data) {
      setVouched(vcRes.data.map((r) => r.provider_id));
    }
    if (enRes.data) {
      setEndorsed(enRes.data.map((r) => `${r.provider_id}:${r.skill}`));
    }
    if (cpRes.data) {
      setSavedCoupons(cpRes.data.map((r) => r.offer_id));
    }
    if (mtRes.data) {
      setMeToos(mtRes.data.map((r) => r.request_id));
    }
    setChatUnread(chatUnreadCount);
    // Every dep below is a useState setter — React guarantees these are
    // referentially stable for the life of the component, so listing them
    // satisfies exhaustive-deps with zero behavior change (they can never
    // actually cause this callback to be recreated).
  }, [setBookmarks, setChatUnread, setEndorsed, setFollows, setLists, setMeToos, setSavedCoupons, setVouched]);

  // Pull the real user + owned entities whenever we become authenticated.
  const refreshUser = useCallback(async () => {
    if (!tokenStore.isAuthed) return;
    try {
      const [me, owned] = await Promise.all([userService.me(), userService.owned()]);
      setUser(me);
      if (me.notificationRadiusKm) {
        localStorage.setItem("settings_radius", String(me.notificationRadiusKm));
      }
      // Seed the timezone from the device once. send-push needs it to evaluate
      // quiet hours; without it that setting can't mean anything. Best-effort
      // and fire-and-forget — a failure here must never block sign-in.
      try {
        const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (deviceTz && deviceTz !== me.timezone) {
          void userService.update({ timezone: deviceTz }).catch(() => {});
        }
      } catch { /* Intl unavailable — quiet hours falls back server-side */ }
      setArea(me.area);
      setRoles(me.roles);
      setOwnedBusinessIds(owned.businessIds);
      setOwnedProviderId(owned.providerId);
      setOwnedEntitiesLoaded(true);
      setActiveContext((ctx) => {
        if (ctx.type === "customer") {
          const next: ActiveContext = { type: "customer", id: null, name: me.name };
          localStorage.setItem("activeContext", JSON.stringify(next));
          return next;
        }
        return ctx;
      });
    } catch {
      // leave seed values; a 401 will be handled by the auth layer.
    }
  }, []);

  // Keep the profile location fresh: once per app open, if geolocation
  // permission is already granted (never prompt uninvited), silently re-read
  // GPS and — when the user has moved meaningfully (>250 m) or has no location
  // yet — sync users + any provider profile (people move; shop premises don't).
  const autoRefreshLocation = useCallback(async () => {
    const uid = await currentUserId();
    if (!uid) return;
    // Per-user, not per-tab — a previous account on this device must not
    // block auto-GPS for the next person who signs in.
    const syncKey = `loc_synced_${uid}`;
    if (sessionStorage.getItem(syncKey) === "1") return;
    sessionStorage.setItem(syncKey, "1");
    try {
      const perm = await (navigator as any).permissions?.query?.({ name: "geolocation" });
      if (perm && perm.state !== "granted") return;
    } catch { /* Permissions API unavailable (native webview) — proceed */ }
    nativeGeolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const prev = userLocRef.current;
        const moved = !prev.lat || !prev.lng
          ? Infinity
          : 6371 * 2 * Math.asin(Math.sqrt(
              Math.sin(((latitude - prev.lat) * Math.PI) / 360) ** 2 +
              Math.cos((prev.lat * Math.PI) / 180) * Math.cos((latitude * Math.PI) / 180) *
              Math.sin(((longitude - prev.lng) * Math.PI) / 360) ** 2
            ));
        if (moved < 0.25) return;
        try {
          const areaName = await reverseGeocode(latitude, longitude).catch(() => null);
          // Only touch the label when geocoding succeeds — never wipe a good
          // saved name (e.g. "Amanora Park Town") just because a lookup failed
          // or timed out on a slow network.
          await userService.autoSyncLocation(latitude, longitude, areaName ?? undefined);
          setUser((u) => ({
            ...u,
            lat: latitude,
            lng: longitude,
            ...(areaName ? { area: areaName } : {}),
          }));
          if (areaName) setArea(areaName);
        } catch { /* silent — freshness sync is best-effort */ }
      },
      () => { /* denied/unavailable — keep stored location */ },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);
  const userLocRef = useRef({ lat: 0, lng: 0 });
  useEffect(() => { userLocRef.current = { lat: user.lat, lng: user.lng }; }, [user.lat, user.lng]);

  useEffect(() => {
    if (isAuthed) {
      void refreshUser().finally(() => setProfileReady(true)).then(() => {
        currentUserId().then((uid) => { if (uid) void registerPush(uid); });
        void autoRefreshLocation();
      });
      void hydratePersonalData();
      void refreshEntityPasswordStatus();
    } else {
      // BUG FIX #2: Reset profileReady whenever we lose auth so a subsequent
      // re-auth cycle (e.g. Supabase auto-recovering after a transient network
      // drop) re-fetches the real profile instead of staying stuck on stale/seed
      // data with profileReady=true from a previous successful fetch.
      setProfileReady(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed]);

  const setPersistedActiveRole = useCallback((role: Role) => {
    setActiveRole(role);
    localStorage.setItem("activeRole", role);
  }, []);

  const setPersistedContext = useCallback((ctx: ActiveContext) => {
    setActiveContext(ctx);
    localStorage.setItem("activeContext", JSON.stringify(ctx));
  }, []);

  // Per-business "does opening this one require a password" — owned
  // businesses mirror the owner's own businessPasswordIsSet; delegated ones
  // come from the batched delegate lookup (that business's OWNER's password).
  // Kept as its own derivation (not baked in at fetch time) so it's never
  // stale relative to ownedBusinessIds, whichever hydrates first.
  const businessPasswordRequired = useMemo(() => {
    const map: Record<string, boolean> = { ...delegatedBusinessPasswordMap };
    for (const id of ownedBusinessIds) map[id] = businessPasswordIsSet;
    return map;
  }, [delegatedBusinessPasswordMap, ownedBusinessIds, businessPasswordIsSet]);

  // Single gate every "switch into business/provider" call site routes
  // through, instead of each one pairing setContext+nav by convention (the
  // drift risk that let context and URL disagree). Switching back to
  // customer is never gated — only entering a business/provider hat is.
  const attemptSwitchContext = useCallback((ctx: ActiveContext, dest: string): boolean => {
    // Customer and Delivery are the user's OWN identities (not operating-as a
    // business you don't own), so they're never password-gated — only
    // entering a business/provider console can be, and only when that
    // console's owner (not necessarily the switcher — see BusinessAccess'
    // delegated grants) has actually set one.
    const required =
      ctx.type === "business" ? (ctx.id ? businessPasswordRequired[ctx.id] ?? false : false)
      : ctx.type === "provider" ? providerPasswordIsSet
      : false;
    if (!required) {
      setPersistedContext(ctx);
      return true;
    }
    setPendingContextSwitch({ ctx, dest });
    return false;
  }, [businessPasswordRequired, providerPasswordIsSet, setPersistedContext]);

  const confirmPendingSwitch = useCallback((): string | null => {
    const pending = pendingContextSwitch;
    if (!pending) return null;
    setPersistedContext(pending.ctx);
    setPendingContextSwitch(null);
    return pending.dest;
  }, [pendingContextSwitch, setPersistedContext]);

  const cancelPendingSwitch = useCallback(() => {
    setPendingContextSwitch(null);
  }, []);

  const refreshEntityPasswordStatus = useCallback(async () => {
    const [biz, prov, bizRecovery, provRecovery, delegated] = await Promise.all([
      entityPasswordService.isSet("business").catch(() => false),
      entityPasswordService.isSet("provider").catch(() => false),
      entityPasswordService.isRecoverySet("business").catch(() => false),
      entityPasswordService.isRecoverySet("provider").catch(() => false),
      entityPasswordService.myDelegatedBusinessPasswordStatus().catch(() => ({})),
    ]);
    setBusinessPasswordIsSet(biz);
    setProviderPasswordIsSet(prov);
    setBusinessRecoveryIsSet(bizRecovery);
    setProviderRecoveryIsSet(provRecovery);
    setDelegatedBusinessPasswordMap(delegated);
  }, []);

  const value = useMemo<AppState>(
    () => ({
      // viewUser, not user — for a guest this carries the live browser fix so
      // every existing `user.lat`/`user.lng` query works unchanged. Identical to
      // `user` for everyone else.
      user: viewUser,
      refreshUser,
      area,
      city: viewUser.city,
      setArea,
      activeRole,
      roles,
      setActiveRole: setPersistedActiveRole,
      addRole: (r: Role) => {
        setRoles((prev) => {
          if (prev.includes(r)) return prev;
          const next = [...prev, r];
          // Persist to DB so refreshUser() doesn't overwrite back to ['customer'].
          void userService.update({ roles: next });
          return next;
        });
        setPersistedActiveRole(r);
      },
      activeContext,
      setContext: setPersistedContext,
      ownedBusinessIds,
      ownedProviderId,
      ownedEntitiesLoaded,
      businessPasswordIsSet,
      providerPasswordIsSet,
      businessRecoveryIsSet,
      providerRecoveryIsSet,
      businessPasswordRequired,
      pendingContextSwitch,
      attemptSwitchContext,
      confirmPendingSwitch,
      cancelPendingSwitch,
      refreshEntityPasswordStatus,
      bookmarks,
      toggleBookmark,
      isBookmarked,
      follows,
      toggleFollow,
      isFollowing,
      viewedStories,
      markStoryViewed,
      meToos,
      toggleMeToo,
      likes,
      toggleLike,
      votes,
      votePoll,
      savedCoupons,
      toggleCoupon,
      extraStamps,
      addStamp,
      endorsed,
      toggleEndorse,
      vouched,
      toggleVouch,
      notifySubs,
      toggleNotify,
      queuesJoined,
      joinQueue,
      lists,
      createList,
      addToList,
      isInAnyList,
      profileReady,
      chatUnread,
      setChatUnread,
      toast,
      showToast,
      isAuthed,
      authReady,
      isGuest,
      guestLocation,
      guestLocationStatus,
      requestGuestLocation,
      dataSaver,
      setDataSaver,
      signIn: () => setIsAuthed(true),
      signOut: () => {
        tokenStore.clear();
        setIsAuthed(false);
        setProfileReady(false);
        setUser(seedUser);
        setArea("");
        setRoles(seedUser.roles);
        setOwnedBusinessIds([]);
        setOwnedProviderId(null);
        setOwnedEntitiesLoaded(false);
        setBusinessPasswordIsSet(false);
        setProviderPasswordIsSet(false);
        setBusinessRecoveryIsSet(false);
        setProviderRecoveryIsSet(false);
        setDelegatedBusinessPasswordMap({});
        setPendingContextSwitch(null);
        setActiveContext({ type: "customer", id: null, name: seedUser.name });
        localStorage.removeItem("locationPromptShown");
        localStorage.removeItem("activeContext");
        localStorage.removeItem("activeRole");
        // Legacy global key + per-user keys — must clear both so re-login
        // on the same tab can run autoRefreshLocation again.
        for (const key of Object.keys(sessionStorage)) {
          if (key === "loc_synced" || key.startsWith("loc_synced_")) {
            sessionStorage.removeItem(key);
          }
        }
        void authService.logout().catch((err) => console.error("Error signing out:", err));
      },
    }),
    [
      viewUser, refreshUser,
      area, activeRole, roles, activeContext, ownedBusinessIds, ownedProviderId,
      ownedEntitiesLoaded, businessPasswordIsSet, providerPasswordIsSet,
      businessRecoveryIsSet, providerRecoveryIsSet, businessPasswordRequired, pendingContextSwitch,
      bookmarks, follows, viewedStories, meToos, likes, votes,
      savedCoupons, extraStamps, endorsed, vouched, notifySubs, queuesJoined, lists,
      chatUnread, toast, isAuthed, authReady, profileReady,
      isGuest, guestLocation, guestLocationStatus, requestGuestLocation,
      dataSaver, setDataSaver,
      toggleBookmark, isBookmarked, toggleFollow, isFollowing, markStoryViewed, toggleMeToo,
      toggleLike, votePoll, toggleCoupon, addStamp, toggleEndorse, toggleVouch, toggleNotify,
      joinQueue, createList, addToList, isInAnyList, showToast,
      setPersistedActiveRole, setPersistedContext, setChatUnread, setIsAuthed,
      attemptSwitchContext, confirmPendingSwitch, cancelPendingSwitch, refreshEntityPasswordStatus,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
