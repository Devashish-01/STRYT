import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import type { AppointmentRecord, AppointmentStatus, PaymentMethod } from "@/types";

const STORAGE_KEY = "stryt_appointments";

// Mock/demo targets have owners that don't exist in the users table, so a DB
// insert would fail the FK. Those (and signed-out guests) fall back to local.
function isMockTarget(id: string): boolean {
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
  };
}

/** Resolve the owning user of the target so the owner can see the booking. */
async function resolveTargetOwner(targetType: "PROVIDER" | "BUSINESS", targetId: string): Promise<string | null> {
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
    if (uid) {
      try {
        const sb = getSupabase();
        const { data, error } = await sb
          .from("appointments")
          .select("*")
          .eq("customer_user_id", uid)
          .order("scheduled_for", { ascending: false });
        if (error) throw error;
        return (data ?? []).map(rowToRecord);
      } catch {
        // fall through to local cache
      }
    }
    const list = getLocalAppointments();
    return list.filter((a) => a.customerId === customerId || !a.customerId);
  },

  async listForTarget(targetId: string): Promise<AppointmentRecord[]> {
    if (!isMockTarget(targetId)) {
      try {
        const sb = getSupabase();
        const { data, error } = await sb
          .from("appointments")
          .select("*")
          .eq("target_id", targetId)
          .order("scheduled_for", { ascending: false });
        if (error) throw error;
        return (data ?? []).map(rowToRecord);
      } catch {
        // fall through to local cache
      }
    }
    const list = getLocalAppointments();
    return list.filter((a) => a.targetId === targetId);
  },

  /**
   * Customer claims they have paid.
   * - UPI → PENDING_CONFIRM (business must verify in their bank app and confirm).
   * - Cash → PAID immediately (physical handover; no digital verification needed).
   */
  async claimPayment(
    id: string,
    method: PaymentMethod,
    amount?: number | null,
    reference?: string | null,
  ): Promise<AppointmentRecord | undefined> {
    const newStatus = method === "CASH" ? "PAID" : "PENDING_CONFIRM";
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

  async updateStatus(id: string, status: AppointmentStatus, responseNote?: string): Promise<AppointmentRecord | undefined> {
    // Try the shared table first; fall back to local for guest/mock rows.
    try {
      const sb = getSupabase();
      const patch: Record<string, unknown> = { status };
      if (responseNote !== undefined) patch.response_note = responseNote;
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
      };
      saveLocalAppointments(list);
      return list[idx];
    }
    return undefined;
  },
};
