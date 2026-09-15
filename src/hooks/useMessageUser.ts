import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { chatService } from "@/services";
import { useApp } from "@/store";
import type { ChatSubject } from "@/types";

/** Opens (creating if needed) the 1:1 thread with a user. `/chat/:id` takes a conversation id — navigating there with
 *  a user id opens an empty thread that can't send (E2E-041). */
export function useMessageUser() {
  const nav = useNavigate();
  const { showToast } = useApp();
  return useCallback(
    async (userId: string, subject?: ChatSubject) => {
      try {
        const conv = await chatService.getOrCreate(userId, subject);
        nav(`/chat/${conv.id}`);
      } catch (e: any) {
        showToast(e?.message || "Couldn't open chat. Try again.");
      }
    },
    [nav, showToast],
  );
}
