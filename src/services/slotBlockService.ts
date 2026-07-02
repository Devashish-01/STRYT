import { getSupabase } from "@/lib/supabaseClient";
import { toCamel } from "@/lib/caseMap";
import type { BlockedSlot } from "@/types";
import { isMockTarget, resolveTargetOwner } from "./appointmentService";

const STORAGE_KEY = "stryt_blocked_slots";

function getLocal(): BlockedSlot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocal(list: BlockedSlot[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

export const slotBlockService = {
  async list(targetId: string): Promise<BlockedSlot[]> {
    if (!isMockTarget(targetId)) {
      try {
        const sb = getSupabase();
        const { data, error } = await sb.from("blocked_slots").select("*").eq("target_id", targetId);
        if (error) throw error;
        return toCamel<BlockedSlot[]>(data ?? []);
      } catch {
        // fall through to local cache
      }
    }
    return getLocal().filter((b) => b.targetId === targetId);
  },

  /** Block a specific time on a specific day, or the whole day (timeLabel = null). */
  async blockDate(
    targetId: string,
    targetType: "PROVIDER" | "BUSINESS",
    date: string,
    timeLabel: string | null,
    reason?: string,
  ): Promise<BlockedSlot> {
    return insertBlock({ targetId, targetType, date, weekday: null, timeLabel, reason: reason ?? null, recurring: false });
  },

  /** Block a time every week on the given weekday (0=Sun..6=Sat), e.g. a daily lunch break. */
  async blockRecurring(
    targetId: string,
    targetType: "PROVIDER" | "BUSINESS",
    weekday: number,
    timeLabel: string | null,
    reason?: string,
  ): Promise<BlockedSlot> {
    return insertBlock({ targetId, targetType, date: null, weekday, timeLabel, reason: reason ?? null, recurring: true });
  },

  async unblock(id: string, targetId: string): Promise<void> {
    if (!isMockTarget(targetId)) {
      try {
        const sb = getSupabase();
        const { error } = await sb.from("blocked_slots").delete().eq("id", id);
        if (error) throw error;
        return;
      } catch {
        // fall through to local cache
      }
    }
    saveLocal(getLocal().filter((b) => b.id !== id));
  },
};

async function insertBlock(payload: {
  targetId: string;
  targetType: "PROVIDER" | "BUSINESS";
  date: string | null;
  weekday: number | null;
  timeLabel: string | null;
  reason: string | null;
  recurring: boolean;
}): Promise<BlockedSlot> {
  if (!isMockTarget(payload.targetId)) {
    try {
      const ownerId = await resolveTargetOwner(payload.targetType, payload.targetId);
      if (!ownerId) throw new Error("Couldn't resolve owner for this listing.");
      const sb = getSupabase();
      const { data, error } = await sb
        .from("blocked_slots")
        .insert({
          target_type: payload.targetType,
          target_id: payload.targetId,
          target_owner_user_id: ownerId,
          date: payload.date,
          weekday: payload.weekday,
          time_label: payload.timeLabel,
          reason: payload.reason,
          recurring: payload.recurring,
        })
        .select()
        .maybeSingle();
      if (error) throw error;
      return toCamel<BlockedSlot>(data);
    } catch (err: any) {
      throw new Error(err?.message || "Couldn't block this slot. Try again.");
    }
  }

  const record: BlockedSlot = {
    id: "blk_" + Math.random().toString(36).slice(2) + Date.now().toString(36),
    targetId: payload.targetId,
    targetType: payload.targetType,
    date: payload.date,
    weekday: payload.weekday,
    timeLabel: payload.timeLabel,
    reason: payload.reason,
    recurring: payload.recurring,
    createdAtISO: new Date().toISOString(),
  };
  const list = getLocal();
  list.push(record);
  saveLocal(list);
  return record;
}
