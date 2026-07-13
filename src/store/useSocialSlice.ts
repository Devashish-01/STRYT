import { useCallback, useState } from "react";
import type { BookmarkTarget } from "@/types";
import { socialService } from "@/services/engagement/socialService";
import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import type { BookmarkKey, FollowKey } from "./sliceTypes";

export function useSocialSlice(showToast: (msg: string) => void) {
  const [bookmarks, setBookmarks] = useState<BookmarkKey[]>([]);
  const [follows, setFollows] = useState<FollowKey[]>(() => {
    try {
      const s = localStorage.getItem("stryt_follows");
      return s ? JSON.parse(s) : [];
    } catch {
      return [];
    }
  });
  const [viewedStories, setViewedStories] = useState<string[]>([]);
  const [meToos, setMeToos] = useState<string[]>([]);
  const [likes, setLikes] = useState<string[]>([]);
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [endorsed, setEndorsed] = useState<string[]>([]);
  const [vouched, setVouched] = useState<string[]>([]);
  const [notifySubs, setNotifySubs] = useState<string[]>([]);

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
    (type: "BUSINESS" | "PROVIDER" | "USER", id: string, name?: string) => {
      const normType = type.toUpperCase() as "BUSINESS" | "PROVIDER" | "USER";
      const exists = follows.some((f) => f.type.toUpperCase() === normType && f.id === id);
      const updated = exists
        ? follows.filter((f) => !(f.type.toUpperCase() === normType && f.id === id))
        : [...follows, { type: normType, id }];
      setFollows(updated);
      try {
        localStorage.setItem("stryt_follows", JSON.stringify(updated));
      } catch {}
      showToast(exists ? "Unfollowed" : name ? `Following ${name}` : "Following");
      void (async () => {
        const uid = await currentUserId();
        if (!uid) return;
        const sb = getSupabase();
        try {
          // Delete both uppercase and lowercase DB entries to ensure clean state
          await sb.from("follows").delete().eq("follower_user_id", uid).in("target_type", [normType, normType.toLowerCase()]).eq("target_id", id);
          if (!exists) {
            const { error } = await sb.from("follows").insert({ follower_user_id: uid, target_type: normType, target_id: id });
            if (error) {
              try {
                await sb.from("follows").insert({ follower_user_id: uid, target_type: normType.toLowerCase(), target_id: id });
              } catch {}
            }
          }
        } catch (err) {
          console.warn("toggleFollow DB sync:", err);
        }
      })();
    },
    [follows, showToast]
  );
  const isFollowing = useCallback(
    (type: "BUSINESS" | "PROVIDER" | "USER", id: string) =>
      follows.some((f) => f.type.toUpperCase() === type.toUpperCase() && f.id === id),
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

  return {
    bookmarks, setBookmarks, toggleBookmark, isBookmarked,
    follows, setFollows, toggleFollow, isFollowing,
    viewedStories, markStoryViewed,
    meToos, setMeToos, toggleMeToo,
    likes, toggleLike,
    votes, votePoll,
    endorsed, setEndorsed, toggleEndorse,
    vouched, setVouched, toggleVouch,
    notifySubs, toggleNotify,
  };
}
