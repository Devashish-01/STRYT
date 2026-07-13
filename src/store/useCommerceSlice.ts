import { useCallback, useState } from "react";
import type { BookmarkTarget } from "@/types";
import { walletService } from "@/services/engagement/walletService";
import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import type { UserList } from "./sliceTypes";

export function useCommerceSlice(showToast: (msg: string) => void) {
  const [savedCoupons, setSavedCoupons] = useState<string[]>([]);
  const [extraStamps, setExtraStamps] = useState<Record<string, number>>({});
  const [queuesJoined, setQueuesJoined] = useState<string[]>([]);
  const [lists, setLists] = useState<UserList[]>([]);

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

  return {
    savedCoupons, setSavedCoupons, toggleCoupon,
    extraStamps, addStamp,
    queuesJoined, joinQueue,
    lists, setLists, createList, addToList, isInAnyList,
  };
}
