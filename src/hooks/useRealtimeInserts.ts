import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase, hasSupabaseEnv } from "@/lib/supabaseClient";

/**
 * Collects the ids of rows INSERTed into a table since the last reset, without
 * refetching anything.
 *
 * This is deliberately not `useQueryWithRealtime`. That hook refetches on every
 * change, which is right for a detail screen but wrong for a feed: re-ordering
 * the list under someone mid-read is the most disorienting thing a feed can do,
 * and on a busy street it would happen constantly. Here the arrival is only
 * *noted*, so the screen can offer a "N new posts" pill and let the reader
 * decide when to jump.
 *
 * Ids rather than a count: the same insert can be delivered twice on reconnect,
 * and some of the "new" rows may be posts the viewer has already loaded (their
 * own, for instance). The caller de-duplicates against what's on screen.
 */
export function useRealtimeInserts(
  tableName: string,
  opts: { filter?: string; enabled?: boolean } = {}
): { newIds: string[]; reset: () => void } {
  const { filter, enabled = true } = opts;
  const [newIds, setNewIds] = useState<string[]>([]);
  // Mirrors newIds so the subscription callback can de-dupe without needing to
  // re-subscribe every time the list changes.
  const seen = useRef<Set<string>>(new Set());

  const reset = useCallback(() => {
    seen.current = new Set();
    setNewIds([]);
  }, []);

  useEffect(() => {
    if (!hasSupabaseEnv || !enabled) return;

    let active = true;
    const sb = getSupabase();
    const uniqueId = Math.random().toString(36).slice(2, 9);
    let channelName = `rt-ins:${tableName}:${uniqueId}`;
    if (filter) channelName += `:${filter}`;

    const channel = sb
      .channel(channelName)
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: tableName, ...(filter ? { filter } : {}) },
        (payload: any) => {
          if (!active) return;
          const id = payload?.new?.id;
          if (typeof id !== "string" || seen.current.has(id)) return;
          seen.current.add(id);
          setNewIds((prev) => [...prev, id]);
        }
      )
      .subscribe((status) => {
        // Same reasoning as useQueryWithRealtime: a silent channel failure looks
        // identical to "nothing is happening", so surface the non-OK states
        // (usually the table isn't in the supabase_realtime publication).
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(`[realtime] "${tableName}" INSERT subscription ${status} — check the supabase_realtime publication for this table.`);
        }
      });

    return () => {
      active = false;
      sb.removeChannel(channel);
    };
  }, [tableName, filter, enabled]);

  return { newIds, reset };
}
