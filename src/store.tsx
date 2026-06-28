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
import { authService } from "@/services/authService";
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
  // False until the first Supabase session check resolves. The route guard waits
  // on this so an OAuth / magic-link redirect (which carries ?code= / #access_token
  // and is exchanged for a session asynchronously) is never bounced back to the
  // login screen mid-callback. In mock mode there's no async auth, so it's ready
  // immediately.
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let sb: ReturnType<typeof getSupabase>;
    try {
      sb = getSupabase();
    } catch (e) {
      // Missing/invalid Supabase env (e.g. unset on the host). Don't hang the app
      // on the loading splash forever — fall through to the login screen.
      console.error("Supabase init failed:", e);
      setAuthReady(true);
      return;
    }
    // Safety net: if getSession() stalls (flaky network), never trap the user on
    // the splash — mark auth ready after a few seconds so routing can proceed.
    const readyTimer = setTimeout(() => setAuthReady(true), 6000);
    // Resolve the initial session on mount. With detectSessionInUrl enabled, a
    // Google/email redirect lands here and getSession() awaits the code→session
    // exchange before resolving — so by the time this runs we have a definitive
    // answer. The live session is the source of truth; tokenStore is only a cache.
    void sb.auth.getSession()
      .then(({ data }) => {
        if (data.session) {
          tokenStore.set(data.session.access_token, data.session.refresh_token);
          setIsAuthed(true);
        } else {
          tokenStore.clear();
          setIsAuthed(false);
        }
      })
      .catch((e) => {
        console.error("getSession failed:", e);
      })
      .finally(() => {
        clearTimeout(readyTimer);
        setAuthReady(true);
      });
    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      if (session) {
        tokenStore.set(session.access_token, session.refresh_token);
        setIsAuthed(true);
      } else if (event === "SIGNED_OUT") {
        tokenStore.clear();
        setIsAuthed(false);
      }
      setAuthReady(true);
    });
    return () => {
      clearTimeout(readyTimer);
      subscription.unsubscribe();
    };
  }, []);

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
      const exists = bookmarks.some((b) => b.type === type && b.id === id);
      // Optimistic update first…
      setBookmarks((prev) =>
        exists ? prev.filter((b) => !(b.type === type && b.id === id)) : [...prev, { type, id }]
      );
      showToast(exists ? "Removed from saved" : "Saved");
      // …then persist, and REVERT if the write fails so the UI never lies.
      void (async () => {
        const uid = await currentUserId();
        if (!uid) return;
        const sb = getSupabase();
        const { error } = exists
          ? await sb.from("bookmarks").delete().eq("user_id", uid).eq("target_type", type).eq("target_id", id)
          : await sb.from("bookmarks").upsert({ user_id: uid, target_type: type, target_id: id }, { onConflict: "user_id,target_type,target_id" });
        if (error) {
          setBookmarks((prev) =>
            exists ? [...prev, { type, id }] : prev.filter((b) => !(b.type === type && b.id === id))
          );
          showToast("Couldn't save — try again");
        }
      })();
    },
    [bookmarks, showToast]
  );

  const isBookmarked = useCallback(
    (type: BookmarkTarget, id: string) => bookmarks.some((b) => b.type === type && b.id === id),
    [bookmarks]
  );

  const toggleFollow = useCallback(
    (type: "BUSINESS" | "PROVIDER", id: string, name?: string) => {
      const exists = follows.some((f) => f.type === type && f.id === id);
      setFollows((prev) =>
        exists ? prev.filter((f) => !(f.type === type && f.id === id)) : [...prev, { type, id }]
      );
      showToast(exists ? "Unfollowed" : name ? `Following ${name}` : "Following");
      void (async () => {
        const uid = await currentUserId();
        if (!uid) return;
        const sb = getSupabase();
        const { error } = exists
          ? await sb.from("follows").delete().eq("follower_user_id", uid).eq("target_type", type).eq("target_id", id)
          : await sb.from("follows").upsert({ follower_user_id: uid, target_type: type, target_id: id }, { onConflict: "follower_user_id,target_type,target_id" });
        if (error) {
          setFollows((prev) =>
            exists ? [...prev, { type, id }] : prev.filter((f) => !(f.type === type && f.id === id))
          );
          showToast("Couldn't update — try again");
        }
      })();
    },
    [follows, showToast]
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
      const saved = savedCoupons.includes(id);
      setSavedCoupons((p) => (saved ? p.filter((x) => x !== id) : [...p, id]));
      if (!saved) showToast("Coupon saved to wallet");
      void (async () => {
        try {
          if (saved) await walletService.unsaveCoupon(id);
          else await walletService.saveCoupon(id);
        } catch {
          setSavedCoupons((p) => (saved ? [...p, id] : p.filter((x) => x !== id)));
          showToast("Couldn't update wallet — try again");
        }
      })();
    },
    [savedCoupons, showToast]
  );

  const addStamp = useCallback(
    (cardId: string) => {
      setExtraStamps((p) => ({ ...p, [cardId]: (p[cardId] ?? 0) + 1 }));
      showToast("Stamp added 🎉");
      void (async () => {
        try {
          await walletService.addStamp(cardId);
        } catch {
          setExtraStamps((p) => ({ ...p, [cardId]: Math.max(0, (p[cardId] ?? 1) - 1) }));
          showToast("Couldn't add stamp — try again");
        }
      })();
    },
    [showToast]
  );

  const toggleEndorse = useCallback((providerId: string, skill: string) => {
    const key = `${providerId}:${skill}`;
    const exists = endorsed.includes(key);
    setEndorsed((p) => (exists ? p.filter((x) => x !== key) : [...p, key]));
    void (async () => {
      try {
        if (exists) await socialService.removeEndorsement(providerId, skill);
        else await socialService.addEndorsement(providerId, skill);
      } catch {
        setEndorsed((p) => (exists ? [...p, key] : p.filter((x) => x !== key)));
        showToast("Couldn't update — try again");
      }
    })();
  }, [endorsed, showToast]);

  const toggleVouch = useCallback(
    (providerId: string) => {
      const exists = vouched.includes(providerId);
      setVouched((p) => (exists ? p.filter((x) => x !== providerId) : [...p, providerId]));
      showToast(exists ? "Vouch removed" : "You vouched for this provider 🤝");
      void (async () => {
        try {
          if (exists) await socialService.removeVouch(providerId);
          else await socialService.addVouch(providerId);
        } catch {
          setVouched((p) => (exists ? [...p, providerId] : p.filter((x) => x !== providerId)));
          showToast("Couldn't update — try again");
        }
      })();
    },
    [vouched, showToast]
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
      const already = lists.find((l) => l.id === listId)?.items.some((it) => it.type === type && it.id === id);
      if (already) { showToast("Already in list"); return; }
      setLists((p) =>
        p.map((l) => (l.id === listId ? { ...l, items: [...l.items, { type, id }] } : l))
      );
      showToast("Added to list");
      void (async () => {
        const { error } = await getSupabase()
          .from("user_list_items")
          .upsert({ list_id: listId, target_type: type, target_id: id }, { onConflict: "list_id,target_type,target_id" });
        if (error) {
          setLists((p) =>
            p.map((l) => (l.id === listId ? { ...l, items: l.items.filter((it) => !(it.type === type && it.id === id)) } : l))
          );
          showToast("Couldn't add to list — try again");
        }
      })();
    },
    [lists, showToast]
  );

  const isInAnyList = useCallback(
    (type: BookmarkTarget, id: string) => lists.some((l) => l.items.some((it) => it.type === type && it.id === id)),
    [lists]
  );

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
      authReady,
      signIn: () => setIsAuthed(true),
      signOut: () => {
        tokenStore.clear();
        setIsAuthed(false);
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
      unread, chatUnread, toast, isAuthed, authReady,
      toggleBookmark, isBookmarked, toggleFollow, isFollowing, markStoryViewed, toggleMeToo,
      toggleLike, votePoll, toggleCoupon, addStamp, toggleEndorse, toggleVouch, toggleNotify,
      joinQueue, createList, addToList, isInAnyList, showToast,
      setPersistedActiveRole, setPersistedContext
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
