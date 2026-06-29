import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import type { AppointmentRecord, AppointmentStatus } from "@/types";

const STORAGE_KEY = "stryt_appointments";

function getLocalAppointments(): AppointmentRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalAppointments(list: AppointmentRecord[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

export const appointmentService = {
  async create(payload: Omit<AppointmentRecord, "id" | "createdAtISO" | "status">): Promise<AppointmentRecord> {
    const record: AppointmentRecord = {
      ...payload,
      id: "apt_" + Math.random().toString(36).slice(2) + Date.now().toString(36),
      status: "PENDING",
      createdAtISO: new Date().toISOString(),
    };

    // Save to local storage
    const list = getLocalAppointments();
    list.unshift(record);
    saveLocalAppointments(list);

    // Sync lead into Supabase leads table gracefully
    try {
      const uid = await currentUserId();
      if (uid) {
        const sb = getSupabase();
        const noteText = `📅 Scheduled for ${payload.dateLabel} at ${payload.timeLabel}${payload.notes ? `: ${payload.notes}` : ""}`;
        if (payload.targetType === "BUSINESS") {
          await sb.from("leads").insert({
            business_id: payload.targetId,
            from_user_id: uid,
            kind: "RESERVATION",
            note: noteText,
          });
        } else {
          await sb.from("leads").insert({
            provider_id: payload.targetId,
            from_user_id: uid,
            kind: "RESERVATION",
            note: noteText,
          });
        }
      }
    } catch (err) {
      console.warn("appointmentService create DB sync:", err);
    }

    return record;
  },

  async listForCustomer(customerId: string): Promise<AppointmentRecord[]> {
    const list = getLocalAppointments();
    return list.filter((a) => a.customerId === customerId || !a.customerId);
  },

  async listForTarget(targetId: string): Promise<AppointmentRecord[]> {
    const list = getLocalAppointments();
    return list.filter((a) => a.targetId === targetId);
  },

  async updateStatus(id: string, status: AppointmentStatus, responseNote?: string): Promise<AppointmentRecord | undefined> {
    const list = getLocalAppointments();
    const idx = list.findIndex((a) => a.id === id);
    if (idx !== -1) {
      list[idx] = {
        ...list[idx],
        status,
        responseNote: responseNote !== undefined ? responseNote : list[idx].responseNote,
      };
      saveLocalAppointments(list);
      return list[idx];
    }
    return undefined;
  },
};
