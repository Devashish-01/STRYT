import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import type { AppointmentRecord, AppointmentStatus, PaymentMethod, CancelledBy } from "@/types";

const STORAGE_KEY = "stryt_appointments";

// Mock/demo targets have owners that don't exist in the users table, so a DB
// insert would fail the FK. Those (and signed-out guests) fall back to local.
export function isMockTarget(id: string): boolean {
  return id === "b1" || id === "p1" || id.startsWith("biz_mock_") || id.startsWith("prov_mock_");
}

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

function upsertLocal(record: AppointmentRecord) {
  const list = getLocalAppointments();
  const idx = list.findIndex((a) => a.id === record.id);
  if (idx === -1) list.unshift(record);
  else list[idx] = record;
  saveLocalAppointments(list);
}

// Self-healing pass applied to every list read:
//  - a PENDING booking whose slot has already passed with no owner response → auto-CANCELLED (SYSTEM)
//  - an ACCEPTED booking whose slot has already passed → auto-COMPLETED (owner never has to touch it)
async function runAppointmentHousekeeping(list: AppointmentRecord[]): Promise<AppointmentRecord[]> {
  const now = Date.now();
  const updatedList = [...list];
  const sb = getSupabase();

  for (let i = 0; i < updatedList.length; i++) {
    const apt = updatedList[i];
    const isPast = new Date(apt.scheduledForISO).getTime() <= now;
    if (!isPast) continue;

    if (apt.status === "PENDING") {
      const patched = {
        ...apt,
        status: "CANCELLED" as const,
        responseNote: "business not responded",
        cancelledBy: "SYSTEM" as const,
      };
      updatedList[i] = patched;
      upsertLocal(patched);
      if (!isMockTarget(apt.targetId)) {
        sb.from("appointments")
          .update({ status: "CANCELLED", response_note: "business not responded", cancelled_by: "SYSTEM" })
          .eq("id", apt.id)
          .then(({ error }) => { if (error) console.error("Failed to auto-cancel appointment in DB:", error); });
      }
    } else if (apt.status === "ACCEPTED") {
      const patched = { ...apt, status: "COMPLETED" as const };
      updatedList[i] = patched;
      upsertLocal(patched);
      if (!isMockTarget(apt.targetId)) {
        sb.from("appointments")
          .update({ status: "COMPLETED" })
          .eq("id", apt.id)
          .then(({ error }) => { if (error) console.error("Failed to auto-complete appointment in DB:", error); });
      }
    }
  }
  return updatedList;
}

/** Map a DB row (snake_case) to the AppointmentRecord shape used across the UI. */
function rowToRecord(r: any): AppointmentRecord {
  return {
    id: r.id,
    targetId: r.target_id,
    targetName: r.target_name ?? "",
    targetAvatar: r.target_avatar ?? undefined,
    targetType: r.target_type,
    customerId: r.customer_user_id,
    customerName: r.customer_name ?? "Customer",
    customerAvatar: r.customer_avatar ?? undefined,
    scheduledForISO: r.scheduled_for,
    dateLabel: r.date_label ?? "",
    timeLabel: r.time_label ?? "",
    notes: r.notes ?? undefined,
    photoUrl: r.photo_url ?? undefined,
    packageId: r.package_id ?? undefined,
    packageName: r.package_name ?? undefined,
    packagePrice: r.package_price ?? undefined,
    status: r.status,
    responseNote: r.response_note ?? undefined,
    createdAtISO: r.created_at,
    paymentMethod: r.payment_method ?? null,
    paymentStatus: (r.payment_status ?? "UNPAID") as "UNPAID" | "PAID",
    paymentAmount: r.payment_amount ?? null,
    paymentReference: r.payment_reference ?? null,
    cancelledBy: r.cancelled_by ?? null,
    isWalkIn: r.is_walk_in ?? false,
  };
}

/** Resolve the owning user of the target so the owner can see the booking. */
export async function resolveTargetOwner(targetType: "PROVIDER" | "BUSINESS", targetId: string): Promise<string | null> {
  const sb = getSupabase();
  if (targetType === "BUSINESS") {
    const { data } = await sb.from("businesses").select("owner_user_id").eq("id", targetId).maybeSingle();
    return (data as any)?.owner_user_id ?? null;
  }
  const { data } = await sb.from("providers").select("user_id").eq("id", targetId).maybeSingle();
  return (data as any)?.user_id ?? null;
}

async function patchPaymentStatus(id: string, status: "PAID" | "REJECTED"): Promise<AppointmentRecord | undefined> {
  try {
    const sb = getSupabase();
    const { data, error } = await sb.from("appointments").update({ payment_status: status }).eq("id", id).select().maybeSingle();
    if (error) throw error;
    if (data) {
      const record = rowToRecord(data);
      upsertLocal(record);
      return record;
    }
  } catch {
    // fall through to local update
  }
  const list = getLocalAppointments();
  const idx = list.findIndex((a) => a.id === id);
  if (idx !== -1) {
    list[idx] = { ...list[idx], paymentStatus: status };
    saveLocalAppointments(list);
    return list[idx];
  }
  return undefined;
}

export const appointmentService = {
  async create(payload: Omit<AppointmentRecord, "id" | "createdAtISO" | "status">): Promise<AppointmentRecord> {
    const uid = await currentUserId();
    const customerId = uid || payload.customerId || "guest";

    // Enforce one appointment per day rule
    const existing = await this.listForCustomer(customerId);
    const selectedDate = new Date(payload.scheduledForISO);
    const hasAptToday = existing.some((apt) => {
      if (apt.status === "CANCELLED" || apt.status === "REJECTED") return false;
      const aptDate = new Date(apt.scheduledForISO);
      return (
        aptDate.getFullYear() === selectedDate.getFullYear() &&
        aptDate.getMonth() === selectedDate.getMonth() &&
        aptDate.getDate() === selectedDate.getDate()
      );
    });

    if (hasAptToday) {
      throw new Error(
        "You already have an appointment scheduled for this day. Only one appointment is allowed per day."
      );
    }

    // Real target + signed-in customer → persist to the shared appointments
    // table so the owner sees it and status changes propagate back.
    if (uid && !isMockTarget(payload.targetId)) {
      try {
        const sb = getSupabase();
        const ownerId = await resolveTargetOwner(payload.targetType, payload.targetId);
        if (!ownerId) throw new Error("Couldn't find this listing's owner. Try again.");
        const { data, error } = await sb
          .from("appointments")
          .insert({
            target_type: payload.targetType,
            target_id: payload.targetId,
            target_owner_user_id: ownerId,
            target_name: payload.targetName,
            target_avatar: payload.targetAvatar ?? null,
            customer_user_id: uid,
            customer_name: payload.customerName,
            customer_avatar: payload.customerAvatar ?? null,
            scheduled_for: payload.scheduledForISO,
            date_label: payload.dateLabel,
            time_label: payload.timeLabel,
            notes: payload.notes ?? null,
            photo_url: payload.photoUrl ?? null,
            package_id: payload.packageId ?? null,
            package_name: payload.packageName ?? null,
            package_price: payload.packagePrice ?? null,
          })
          .select()
          .maybeSingle();
        if (error) throw error;
        const record = rowToRecord(data);
        upsertLocal(record); // keep a local cache for instant reads
        return record;
      } catch (err: any) {
        // Surface the real reason instead of silently succeeding.
        throw new Error(err?.message || "Couldn't book the appointment. Please try again.");
      }
    }

    // Guest or mock/demo target → local-only record.
    const record: AppointmentRecord = {
      ...payload,
      id: "apt_" + Math.random().toString(36).slice(2) + Date.now().toString(36),
      status: "PENDING",
      createdAtISO: new Date().toISOString(),
    };
    upsertLocal(record);
    return record;
  },

  async listForCustomer(customerId: string): Promise<AppointmentRecord[]> {
    const uid = await currentUserId();
    let rawList: AppointmentRecord[] = [];
    if (uid) {
      try {
        const sb = getSupabase();
        const { data, error } = await sb
          .from("appointments")
          .select("*")
          .eq("customer_user_id", uid)
          .order("scheduled_for", { ascending: false });
        if (error) throw error;
        rawList = (data ?? []).map(rowToRecord);
      } catch {
        rawList = getLocalAppointments().filter((a) => a.customerId === customerId || !a.customerId);
      }
    } else {
      rawList = getLocalAppointments().filter((a) => a.customerId === customerId || !a.customerId);
    }
    return runAppointmentHousekeeping(rawList);
  },

  async listForTarget(targetId: string): Promise<AppointmentRecord[]> {
    let rawList: AppointmentRecord[] = [];
    if (!isMockTarget(targetId)) {
      try {
        const sb = getSupabase();
        const { data, error } = await sb
          .from("appointments")
          .select("*")
          .eq("target_id", targetId)
          .order("scheduled_for", { ascending: false });
        if (error) throw error;
        rawList = (data ?? []).map(rowToRecord);
      } catch {
        rawList = getLocalAppointments().filter((a) => a.targetId === targetId);
      }
    } else {
      rawList = getLocalAppointments().filter((a) => a.targetId === targetId);
    }
    return runAppointmentHousekeeping(rawList);
  },

  /**
   * Customer claims they have paid — both CASH and UPI now require the
   * business/provider to verify and confirm before it counts. Cash used to
   * skip straight to PAID on the customer's say-so alone, with no chance for
   * the seller to dispute a claim they never actually received; that's the
   * same one-sided-claim bug already fixed for agreement/deal payments.
   */
  async claimPayment(
    id: string,
    method: PaymentMethod,
    amount?: number | null,
    reference?: string | null,
  ): Promise<AppointmentRecord | undefined> {
    const newStatus: "PENDING_CONFIRM" = "PENDING_CONFIRM";
    const patch: Record<string, unknown> = {
      payment_method: method,
      payment_status: newStatus,
    };
    if (amount != null) patch.payment_amount = amount;
    if (reference) patch.payment_reference = reference;

    try {
      const sb = getSupabase();
      const { data, error } = await sb.from("appointments").update(patch).eq("id", id).select().maybeSingle();
      if (error) throw error;
      if (data) {
        const record = rowToRecord(data);
        upsertLocal(record);
        return record;
      }
    } catch {
      // fall through to local update
    }

    const list = getLocalAppointments();
    const idx = list.findIndex((a) => a.id === id);
    if (idx !== -1) {
      list[idx] = {
        ...list[idx],
        paymentMethod: method,
        paymentStatus: newStatus as "PAID" | "PENDING_CONFIRM",
        paymentAmount: amount ?? list[idx].paymentAmount,
        paymentReference: reference ?? list[idx].paymentReference,
      };
      saveLocalAppointments(list);
      return list[idx];
    }
    return undefined;
  },

  /** Business confirms they received the payment → PAID. */
  async confirmPayment(id: string): Promise<AppointmentRecord | undefined> {
    return patchPaymentStatus(id, "PAID");
  },

  /** Business rejects the customer's claim → REJECTED; customer can try again. */
  async rejectPaymentClaim(id: string): Promise<AppointmentRecord | undefined> {
    return patchPaymentStatus(id, "REJECTED");
  },

  async updateStatus(
    id: string,
    status: AppointmentStatus,
    responseNote?: string,
    cancelledBy?: CancelledBy,
  ): Promise<AppointmentRecord | undefined> {
    // Try the shared table first; fall back to local for guest/mock rows.
    try {
      const sb = getSupabase();
      const patch: Record<string, unknown> = { status };
      if (responseNote !== undefined) patch.response_note = responseNote;
      if (status === "CANCELLED" && cancelledBy) patch.cancelled_by = cancelledBy;
      const { data, error } = await sb.from("appointments").update(patch).eq("id", id).select().maybeSingle();
      if (error) throw error;
      if (data) {
        const record = rowToRecord(data);
        upsertLocal(record);
        return record;
      }
    } catch {
      // fall through to local update
    }

    const list = getLocalAppointments();
    const idx = list.findIndex((a) => a.id === id);
    if (idx !== -1) {
      list[idx] = {
        ...list[idx],
        status,
        responseNote: responseNote !== undefined ? responseNote : list[idx].responseNote,
        cancelledBy: status === "CANCELLED" && cancelledBy ? cancelledBy : list[idx].cancelledBy,
      };
      saveLocalAppointments(list);
      return list[idx];
    }
    return undefined;
  },

  /**
   * Owner enters a booking manually from the timetable (walk-in / phone booking —
   * no customer account needed). Stamped with the owner's own user id as the
   * "customer" so RLS insert policy (`customer_user_id = auth.uid()`) is satisfied,
   * and `isWalkIn` distinguishes it in the UI.
   */
  async createWalkIn(payload: {
    targetId: string;
    targetType: "PROVIDER" | "BUSINESS";
    targetName: string;
    customerName: string;
    customerPhone?: string;
    scheduledForISO: string;
    dateLabel: string;
    timeLabel: string;
    packageId?: string;
    packageName?: string;
    packagePrice?: number;
  }): Promise<AppointmentRecord> {
    const uid = await currentUserId();
    if (!uid) throw new Error("Sign in required to add a walk-in booking.");

    const notes = payload.customerPhone ? `Walk-in • ${payload.customerPhone}` : "Walk-in";

    if (!isMockTarget(payload.targetId)) {
      try {
        const sb = getSupabase();
        const { data, error } = await sb
          .from("appointments")
          .insert({
            target_type: payload.targetType,
            target_id: payload.targetId,
            target_owner_user_id: uid,
            target_name: payload.targetName,
            customer_user_id: uid,
            customer_name: payload.customerName,
            scheduled_for: payload.scheduledForISO,
            date_label: payload.dateLabel,
            time_label: payload.timeLabel,
            notes,
            package_id: payload.packageId ?? null,
            package_name: payload.packageName ?? null,
            package_price: payload.packagePrice ?? null,
            status: "ACCEPTED",
            is_walk_in: true,
          })
          .select()
          .maybeSingle();
        if (error) throw error;
        const record = rowToRecord(data);
        upsertLocal(record);
        return record;
      } catch (err: any) {
        throw new Error(err?.message || "Couldn't add the walk-in booking. Please try again.");
      }
    }

    const record: AppointmentRecord = {
      id: "apt_" + Math.random().toString(36).slice(2) + Date.now().toString(36),
      targetId: payload.targetId,
      targetType: payload.targetType,
      targetName: payload.targetName,
      customerId: uid,
      customerName: payload.customerName,
      scheduledForISO: payload.scheduledForISO,
      dateLabel: payload.dateLabel,
      timeLabel: payload.timeLabel,
      notes,
      packageId: payload.packageId,
      packageName: payload.packageName,
      packagePrice: payload.packagePrice,
      status: "ACCEPTED",
      isWalkIn: true,
      createdAtISO: new Date().toISOString(),
    };
    upsertLocal(record);
    return record;
  },
};
