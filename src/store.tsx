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
import { authService } from "@/services/core/authService";
import { notificationService } from "@/services/engagement/notificationService";
import { chatService } from "@/services/engagement/chatService";
import { registerPush } from "@/lib/pushNotifications";
import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import type { BookmarkKey, FollowKey, UserList } from "@/store/sliceTypes";
import { useToast } from "@/store/useToast";
import { useAuthSession } from "@/store/useAuthSession";
import { useSocialSlice } from "@/store/useSocialSlice";
import { useCommerceSlice } from "@/store/useCommerceSlice";
import { useNotificationBadges } from "@/store/useNotificationBadges";

export type ContextType = "customer" | "business" | "provider";
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

  // notifications read state
  unreadCount: number;
  markAllRead: () => void;
  decrementUnread: () => void;

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
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser>(seedUser);
  const [area, setArea] = useState("");
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

  const { unread, setUnread, markAllRead, decrementUnread, chatUnread, setChatUnread } = useNotificationBadges(isAuthed);
  const [profileReady, setProfileReady] = useState(false);

  // owned entities — hydrated from userService.owned() once authed.
  const [ownedBusinessIds, setOwnedBusinessIds] = useState<string[]>([]);
  const [ownedProviderId, setOwnedProviderId] = useState<string | null>(null);
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
    const [bmRes, fwRes, lstRes, liRes, unreadCount, vcRes, enRes, cpRes, mtRes, chatUnreadCount] = await Promise.all([
      sb.from("bookmarks").select("target_type,target_id").eq("user_id", uid),
      sb.from("follows").select("target_type,target_id").eq("follower_user_id", uid),
      sb.from("user_lists").select("id,name,emoji,shared").eq("user_id", uid).order("created_at"),
      sb.from("user_list_items").select("list_id,target_type,target_id"),
      notificationService.getUnreadCount(),
      sb.from("vouches").select("provider_id").eq("from_user_id", uid),
      sb.from("endorsements").select("provider_id,skill").eq("from_user_id", uid),
      sb.from("user_saved_coupons").select("offer_id").eq("user_id", uid),
      sb.from("request_me_toos").select("request_id").eq("user_id", uid),
      chatService.totalUnread(),
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
          shared: l.shared,
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
    setUnread(unreadCount);
    setChatUnread(chatUnreadCount);
  }, []);

  // Pull the real user + owned entities whenever we become authenticated.
  const refreshUser = useCallback(async () => {
    if (!tokenStore.isAuthed) return;
    try {
      const [me, owned] = await Promise.all([userService.me(), userService.owned()]);
      setUser(me);
      if (me.notificationRadiusKm) {
        localStorage.setItem("settings_radius", String(me.notificationRadiusKm));
      }
      setArea(me.area);
      setRoles(me.roles);
      setOwnedBusinessIds(owned.businessIds);
      setOwnedProviderId(owned.providerId);
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
    if (sessionStorage.getItem("loc_synced") === "1") return;
    sessionStorage.setItem("loc_synced", "1");
    try {
      const perm = await (navigator as any).permissions?.query?.({ name: "geolocation" });
      if (perm && perm.state !== "granted") return;
    } catch { /* Permissions API unavailable (native webview) — proceed */ }
    const { nativeGeolocation } = await import("@/lib/nativeGeolocation");
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
          const { reverseGeocode } = await import("@/lib/geocode");
          const areaName = await reverseGeocode(latitude, longitude).catch(() => null);
          await userService.autoSyncLocation(latitude, longitude, areaName ?? undefined);
          setUser((u) => ({ ...u, lat: latitude, lng: longitude, area: areaName ?? u.area }));
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

  const value = useMemo<AppState>(
    () => ({
      user,
      refreshUser,
      area,
      city: user.city,
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
      unreadCount: unread,
      markAllRead,
      decrementUnread,
      profileReady,
      chatUnread,
      setChatUnread,
      toast,
      showToast,
      isAuthed,
      authReady,
      signIn: () => setIsAuthed(true),
      signOut: () => {
        tokenStore.clear();
        setIsAuthed(false);
        setProfileReady(false);
        setUser(seedUser);
        setRoles(seedUser.roles);
        setOwnedBusinessIds([]);
        setOwnedProviderId(null);
        setActiveContext({ type: "customer", id: null, name: seedUser.name });
        localStorage.removeItem("locationPromptShown");
        localStorage.removeItem("activeContext");
        localStorage.removeItem("activeRole");
        void authService.logout().catch((err) => console.error("Error signing out:", err));
      },
    }),
    [
      user, refreshUser,
      area, activeRole, roles, activeContext, ownedBusinessIds, ownedProviderId,
      bookmarks, follows, viewedStories, meToos, likes, votes,
      savedCoupons, extraStamps, endorsed, vouched, notifySubs, queuesJoined, lists,
      unread, chatUnread, toast, isAuthed, authReady, profileReady,
      toggleBookmark, isBookmarked, toggleFollow, isFollowing, markStoryViewed, toggleMeToo,
      toggleLike, votePoll, toggleCoupon, addStamp, toggleEndorse, toggleVouch, toggleNotify,
      joinQueue, createList, addToList, isInAnyList, showToast,
      setPersistedActiveRole, setPersistedContext, markAllRead, decrementUnread, setChatUnread, setIsAuthed,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
