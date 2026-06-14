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
import { userService } from "@/services/userService";
import { ensureProfile } from "@/services/authService";
import { notificationService } from "@/services/notificationService";
import { registerPush } from "@/lib/pushNotifications";
import { socialService } from "@/services/socialService";
import { walletService } from "@/services/walletService";
import { config } from "@/config";
import { getSupabase, currentUserId } from "@/lib/supabaseClient";

interface BookmarkKey {
  type: BookmarkTarget;
  id: string;
}

interface FollowKey {
  type: "BUSINESS" | "PROVIDER";
  id: string;
}

export type ContextType = "customer" | "business" | "provider";
export interface ActiveContext {
  type: ContextType;
  id: string | null; // business/provider id, null for customer
  name: string;
}

interface ListItem {
  type: BookmarkTarget;
  id: string;
}
interface UserList {
  id: string;
  name: string;
  emoji: string;
  shared: boolean;
  items: ListItem[];
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
  toggleFollow: (type: "BUSINESS" | "PROVIDER", id: string, name?: string) => void;
  isFollowing: (type: "BUSINESS" | "PROVIDER", id: string) => boolean;

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

  // chat unread count
  chatUnread: number;
  setChatUnread: (n: number) => void;

  // toast
  toast: string | null;
  showToast: (msg: string) => void;

  // auth
  isAuthed: boolean;
  signIn: () => void;
  signOut: () => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser>(seedUser);
  const [area, setArea] = useState("");
  const [activeRole, setActiveRole] = useState<Role>("customer");
  const [roles, setRoles] = useState<Role[]>(seedUser.roles);
  const [bookmarks, setBookmarks] = useState<BookmarkKey[]>([]);
  const [follows, setFollows] = useState<FollowKey[]>([]);
  const [viewedStories, setViewedStories] = useState<string[]>([]);
  const [meToos, setMeToos] = useState<string[]>([]);
  const [likes, setLikes] = useState<string[]>([]);
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [savedCoupons, setSavedCoupons] = useState<string[]>([]);
  const [extraStamps, setExtraStamps] = useState<Record<string, number>>({});
  const [endorsed, setEndorsed] = useState<string[]>([]);
  const [vouched, setVouched] = useState<string[]>([]);
  const [notifySubs, setNotifySubs] = useState<string[]>([]);
  const [queuesJoined, setQueuesJoined] = useState<string[]>([]);
  const [lists, setLists] = useState<UserList[]>([]);
  const [unread, setUnread] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isAuthed, setIsAuthed] = useState(tokenStore.isAuthed);

  useEffect(() => {
    if (config.useMocks) return;
    const sb = getSupabase();
    const { data: { subscription } } = sb.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        tokenStore.set(session.access_token, session.refresh_token);
        // For Google OAuth and email magic-link, verifyOtp() is never called,
        // so we must ensure the public.users row exists here before refreshUser()
        // runs — otherwise every RLS-protected write fails with a missing FK.
        if (event === "SIGNED_IN") {
          await ensureProfile(
            session.user.id,
            session.user.phone,
            session.user.email,
            session.user.user_metadata?.full_name ?? null,
          );
        }
        setIsAuthed(true);
      } else if (event === "SIGNED_OUT") {
        tokenStore.clear();
        setIsAuthed(false);
      }
    });
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // owned entities — hydrated from userService.owned() once authed.
  const [ownedBusinessIds, setOwnedBusinessIds] = useState<string[]>([]);
  const [ownedProviderId, setOwnedProviderId] = useState<string | null>(null);
  const [activeContext, setActiveContext] = useState<ActiveContext>({ type: "customer", id: null, name: seedUser.name });

  // ── R8: hydrate bookmarks / follows / lists / unread from Supabase ──────
  const hydratePersonalData = useCallback(async () => {
    if (config.useMocks) return;
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return;

    // run all fetches in parallel
    const [bmRes, fwRes, lstRes, liRes, unreadCount, vcRes, enRes, cpRes, mtRes] = await Promise.all([
      sb.from("bookmarks").select("target_type,target_id").eq("user_id", uid),
      sb.from("follows").select("target_type,target_id").eq("follower_user_id", uid),
      sb.from("user_lists").select("id,name,emoji,shared").eq("user_id", uid).order("created_at"),
      sb.from("user_list_items").select("list_id,target_type,target_id"),
      notificationService.getUnreadCount(),
      sb.from("vouches").select("provider_id").eq("from_user_id", uid),
      sb.from("endorsements").select("provider_id,skill").eq("from_user_id", uid),
      sb.from("user_saved_coupons").select("offer_id").eq("user_id", uid),
      sb.from("request_me_toos").select("request_id").eq("user_id", uid),
    ]);

    if (bmRes.data) {
      setBookmarks(bmRes.data.map((r) => ({ type: r.target_type as BookmarkTarget, id: r.target_id })));
    }
    if (fwRes.data) {
      setFollows(fwRes.data.map((r) => ({ type: r.target_type as "BUSINESS" | "PROVIDER", id: r.target_id })));
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
  }, []);

  // Pull the real user + owned entities whenever we become authenticated.
  const refreshUser = useCallback(async () => {
    if (!tokenStore.isAuthed) return;
    try {
      const [me, owned] = await Promise.all([userService.me(), userService.owned()]);
      setUser(me);
      setArea(me.area);
      setRoles(me.roles);
      setOwnedBusinessIds(owned.businessIds);
      setOwnedProviderId(owned.providerId);
      setActiveContext((ctx) => (ctx.type === "customer" ? { type: "customer", id: null, name: me.name } : ctx));
    } catch {
      // leave seed values; a 401 will be handled by the auth layer.
    }
  }, []);

  useEffect(() => {
    if (isAuthed) {
      void refreshUser().then(() => {
        currentUserId().then((uid) => { if (uid) void registerPush(uid); });
      });
      void hydratePersonalData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const toggleBookmark = useCallback(
    (type: BookmarkTarget, id: string) => {
      setBookmarks((prev) => {
        const exists = prev.some((b) => b.type === type && b.id === id);
        if (exists) {
          showToast("Removed from saved");
          if (!config.useMocks) {
            void currentUserId().then((uid) => {
              if (uid) getSupabase().from("bookmarks").delete().eq("user_id", uid).eq("target_type", type).eq("target_id", id);
            });
          }
          return prev.filter((b) => !(b.type === type && b.id === id));
        }
        showToast("Saved");
        if (!config.useMocks) {
          void currentUserId().then((uid) => {
            if (uid) getSupabase().from("bookmarks").upsert({ user_id: uid, target_type: type, target_id: id }, { onConflict: "user_id,target_type,target_id" });
          });
        }
        return [...prev, { type, id }];
      });
    },
    [showToast]
  );

  const isBookmarked = useCallback(
    (type: BookmarkTarget, id: string) => bookmarks.some((b) => b.type === type && b.id === id),
    [bookmarks]
  );

  const toggleFollow = useCallback(
    (type: "BUSINESS" | "PROVIDER", id: string, name?: string) => {
      setFollows((prev) => {
        const exists = prev.some((f) => f.type === type && f.id === id);
        if (exists) {
          showToast("Unfollowed");
          if (!config.useMocks) {
            void currentUserId().then((uid) => {
              if (uid) getSupabase().from("follows").delete().eq("follower_user_id", uid).eq("target_type", type).eq("target_id", id);
            });
          }
          return prev.filter((f) => !(f.type === type && f.id === id));
        }
        showToast(name ? `Following ${name}` : "Following");
        if (!config.useMocks) {
          void currentUserId().then((uid) => {
            if (uid) getSupabase().from("follows").upsert({ follower_user_id: uid, target_type: type, target_id: id }, { onConflict: "follower_user_id,target_type,target_id" });
          });
        }
        return [...prev, { type, id }];
      });
    },
    [showToast]
  );
  const isFollowing = useCallback(
    (type: "BUSINESS" | "PROVIDER", id: string) => follows.some((f) => f.type === type && f.id === id),
    [follows]
  );

  const markStoryViewed = useCallback((id: string) => {
    setViewedStories((p) => (p.includes(id) ? p : [...p, id]));
  }, []);

  const toggleMeToo = useCallback(
    (requestId: string) => {
      setMeToos((p) => {
        if (p.includes(requestId)) return p.filter((x) => x !== requestId);
        showToast("Added — you'll be notified of offers too");
        return [...p, requestId];
      });
    },
    [showToast]
  );

  const toggleLike = useCallback((postId: string) => {
    setLikes((p) => (p.includes(postId) ? p.filter((x) => x !== postId) : [...p, postId]));
  }, []);

  const votePoll = useCallback(
    (postId: string, optionId: string) => {
      setVotes((p) => ({ ...p, [postId]: optionId }));
      showToast("Vote counted");
    },
    [showToast]
  );

  const toggleCoupon = useCallback(
    (id: string) => {
      setSavedCoupons((p) => {
        if (p.includes(id)) {
          if (!config.useMocks) void walletService.unsaveCoupon(id);
          return p.filter((x) => x !== id);
        }
        showToast("Coupon saved to wallet");
        if (!config.useMocks) void walletService.saveCoupon(id);
        return [...p, id];
      });
    },
    [showToast]
  );

  const addStamp = useCallback(
    (cardId: string) => {
      setExtraStamps((p) => ({ ...p, [cardId]: (p[cardId] ?? 0) + 1 }));
      showToast("Stamp added 🎉");
      if (!config.useMocks) void walletService.addStamp(cardId);
    },
    [showToast]
  );

  const toggleEndorse = useCallback((providerId: string, skill: string) => {
    const key = `${providerId}:${skill}`;
    setEndorsed((p) => {
      const exists = p.includes(key);
      if (!config.useMocks) {
        if (exists) void socialService.removeEndorsement(providerId, skill);
        else void socialService.addEndorsement(providerId, skill);
      }
      return exists ? p.filter((x) => x !== key) : [...p, key];
    });
  }, []);

  const toggleVouch = useCallback(
    (providerId: string) => {
      setVouched((p) => {
        const exists = p.includes(providerId);
        if (exists) {
          showToast("Vouch removed");
          if (!config.useMocks) void socialService.removeVouch(providerId);
          return p.filter((x) => x !== providerId);
        }
        showToast("You vouched for this provider 🤝");
        if (!config.useMocks) void socialService.addVouch(providerId);
        return [...p, providerId];
      });
    },
    [showToast]
  );

  const toggleNotify = useCallback(
    (key: string) => {
      setNotifySubs((p) => {
        if (p.includes(key)) {
          showToast("Alert removed");
          return p.filter((x) => x !== key);
        }
        showToast("We'll notify you 🔔");
        return [...p, key];
      });
    },
    [showToast]
  );

  const joinQueue = useCallback(
    (businessId: string) => {
      setQueuesJoined((p) => (p.includes(businessId) ? p : [...p, businessId]));
      showToast("You're in the queue — we'll ping you");
    },
    [showToast]
  );

  const createList = useCallback(
    async (name: string, emoji: string): Promise<string> => {
      if (config.useMocks) {
        const localId = "sl" + Math.random().toString(36).slice(2, 7);
        setLists((p) => [...p, { id: localId, name, emoji, shared: false, items: [] }]);
        showToast(`Created "${name}"`);
        return localId;
      }
      // Insert the list and WAIT for the real id before returning, so a follow-up
      // addToList() writes user_list_items against an id that actually exists
      // (otherwise the FK insert silently fails and the item is lost on refresh).
      const uid = await currentUserId();
      let realId = "sl" + Math.random().toString(36).slice(2, 7);
      if (uid) {
        const { data } = await getSupabase()
          .from("user_lists")
          .insert({ user_id: uid, name, emoji })
          .select("id")
          .single();
        if (data?.id) realId = data.id;
      }
      setLists((p) => [...p, { id: realId, name, emoji, shared: false, items: [] }]);
      showToast(`Created "${name}"`);
      return realId;
    },
    [showToast]
  );

  const addToList = useCallback(
    (listId: string, type: BookmarkTarget, id: string) => {
      setLists((p) =>
        p.map((l) =>
          l.id === listId
            ? l.items.some((it) => it.type === type && it.id === id)
              ? l
              : { ...l, items: [...l.items, { type, id }] }
            : l
        )
      );
      if (!config.useMocks) {
        void getSupabase()
          .from("user_list_items")
          .upsert({ list_id: listId, target_type: type, target_id: id }, { onConflict: "list_id,target_type,target_id" });
      }
      showToast("Added to list");
    },
    [showToast]
  );

  const isInAnyList = useCallback(
    (type: BookmarkTarget, id: string) => lists.some((l) => l.items.some((it) => it.type === type && it.id === id)),
    [lists]
  );

  const value = useMemo<AppState>(
    () => ({
      user,
      refreshUser,
      area,
      city: user.city,
      setArea,
      activeRole,
      roles,
      setActiveRole,
      addRole: (r: Role) => {
        setRoles((prev) => {
          if (prev.includes(r)) return prev;
          const next = [...prev, r];
          // Persist to DB so refreshUser() doesn't overwrite back to ['customer'].
          if (!config.useMocks) void userService.update({ roles: next });
          return next;
        });
        setActiveRole(r);
      },
      activeContext,
      setContext: setActiveContext,
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
      markAllRead: () => {
        setUnread(0);
        void notificationService.markAllRead();
      },
      decrementUnread: () => setUnread((n) => Math.max(0, n - 1)),
      chatUnread,
      setChatUnread,
      toast,
      showToast,
      isAuthed,
      signIn: () => setIsAuthed(true),
      signOut: () => {
        tokenStore.clear();
        setIsAuthed(false);
        setUser(seedUser);
        setRoles(seedUser.roles);
        setOwnedBusinessIds([]);
        setOwnedProviderId(null);
        setActiveContext({ type: "customer", id: null, name: seedUser.name });
      },
    }),
    [
      user, refreshUser,
      area, activeRole, roles, activeContext, ownedBusinessIds, ownedProviderId,
      bookmarks, follows, viewedStories, meToos, likes, votes,
      savedCoupons, extraStamps, endorsed, vouched, notifySubs, queuesJoined, lists,
      unread, chatUnread, toast, isAuthed,
      toggleBookmark, isBookmarked, toggleFollow, isFollowing, markStoryViewed, toggleMeToo,
      toggleLike, votePoll, toggleCoupon, addStamp, toggleEndorse, toggleVouch, toggleNotify,
      joinQueue, createList, addToList, isInAnyList, showToast,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
