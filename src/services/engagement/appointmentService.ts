import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import { aliasName } from "@/lib/publicName";
import type { AppointmentRecord, AppointmentStatus, PaymentMethod, CancelledBy } from "@/types";

const STORAGE_KEY = "stryt_appointments";

const TERMINAL_APPOINTMENT: AppointmentStatus[] = ["COMPLETED", "CANCELLED", "REJECTED", "NO_SHOW"];

/**
 * The customer name an OWNER (business/provider) should see for a booking:
 * the real name during the active relationship, reverting to the customer's
 * public alias once the visit is finished — per the privacy model.
 */
export function ownerVisibleCustomerName(apt: AppointmentRecord): string {
  if (TERMINAL_APPOINTMENT.includes(apt.status)) {
    return aliasName({ alias: apt.customerAlias, name: apt.customerName }, "Customer");
  }
  return apt.customerName;
}

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

// Server-authoritative housekeeping: the DB does the PENDING→CANCELLED and
// ACCEPTED→COMPLETED transitions atomically (sweep_my_appointments RPC), so
// they no longer depend on a client firing an unmonitored write. Throttled so
// the first list read per window pays one round-trip and the rest are free —
// the ≤2-min staleness this allows is invisible to users.
let lastAptSweepAt = 0;
async function sweepRemoteAppointments(): Promise<void> {
  if (Date.now() - lastAptSweepAt < 120_000) return;
  lastAptSweepAt = Date.now();
  try {
    await getSupabase().rpc("sweep_my_appointments");
  } catch {
    lastAptSweepAt = 0; // let the next read retry
  }
}

// Local-only housekeeping for guest / mock-target records that never reached
// the DB (so the server sweep can't touch them). Pure client-side patch, no
// remote writes — those are the server's job now.
function localHousekeeping(list: AppointmentRecord[]): AppointmentRecord[] {
  const now = Date.now();
  return list.map((apt) => {
    const isPast = new Date(apt.scheduledForISO).getTime() <= now;
    if (!isPast) return apt;
    if (apt.status === "PENDING") {
      const patched = { ...apt, status: "CANCELLED" as const, responseNote: "business not responded", cancelledBy: "SYSTEM" as const };
      upsertLocal(patched);
      return patched;
    }
    if (apt.status === "ACCEPTED") {
      const patched = { ...apt, status: "COMPLETED" as const };
      upsertLocal(patched);
      return patched;
    }
    return apt;
  });
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
    customerAlias: r.customer?.alias ?? null,
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
    paymentStatus: (r.payment_status ?? "UNPAID") as AppointmentRecord["paymentStatus"],
    paymentAmount: r.payment_amount ?? null,
    paymentReference: r.payment_reference ?? null,
    cancelledBy: r.cancelled_by ?? null,
    isWalkIn: r.is_walk_in ?? false,
    rescheduledFrom: r.rescheduled_from ?? null,
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

async function patchPaymentStatus(
  id: string,
  action: "CONFIRM" | "REJECT",
): Promise<AppointmentRecord | undefined> {
  const uid = await currentUserId();
  if (uid) {
    try {
      const sb = getSupabase();
      const rpc = action === "CONFIRM" ? "appointment_confirm_payment" : "appointment_reject_payment";
      const { data, error } = await sb.rpc(rpc, { p_id: id });
      if (error) throw error;
      if (data) {
        const record = rowToRecord(data);
        upsertLocal(record);
        return record;
      }
    } catch (e: any) {
      throw new Error(e?.message || "Couldn't update the payment. Please try again.");
    }
  }

  const list = getLocalAppointments();
  const idx = list.findIndex((a) => a.id === id);
  if (idx !== -1) {
    list[idx] = { ...list[idx], paymentStatus: action === "CONFIRM" ? "PAID" : "REJECTED" };
    saveLocalAppointments(list);
    return list[idx];
  }
  return undefined;
}

export const appointmentService = {
  async create(payload: Omit<AppointmentRecord, "id" | "createdAtISO" | "status">): Promise<AppointmentRecord> {
    const uid = await currentUserId();
    const customerId = uid || payload.customerId || "guest";

    // Enforce a daily appointment limit (across all businesses/providers).
    // Skipped for reschedules: the atomic RPC cancels the original first, so
    // the original correctly no longer counts (the DB trigger is the real
    // guard either way — this client check is just early, friendly UX).
    if (!payload.rescheduledFrom) {
      const DAILY_APPOINTMENT_LIMIT = 5;
      const existing = await this.listForCustomer(customerId);
      const selectedDate = new Date(payload.scheduledForISO);
      const aptsTodayCount = existing.filter((apt) => {
        if (apt.status === "CANCELLED" || apt.status === "REJECTED") return false;
        const aptDate = new Date(apt.scheduledForISO);
        return (
          aptDate.getFullYear() === selectedDate.getFullYear() &&
          aptDate.getMonth() === selectedDate.getMonth() &&
          aptDate.getDate() === selectedDate.getDate()
        );
      }).length;

      if (aptsTodayCount >= DAILY_APPOINTMENT_LIMIT) {
        throw new Error(
          `You've reached the limit of ${DAILY_APPOINTMENT_LIMIT} appointments for this day. Please pick another date.`
        );
      }
    }

    // Real target + signed-in customer → persist to the shared appointments
    // table so the owner sees it and status changes propagate back.
    if (uid && !isMockTarget(payload.targetId)) {
      try {
        const sb = getSupabase();

        // Reschedule → atomic cancel-old + create-new in one transaction, so a
        // failure can't strand two live bookings and the original is excluded
        // from the daily-limit count.
        if (payload.rescheduledFrom) {
          const { data, error } = await sb.rpc("reschedule_appointment", {
            p_original_id: payload.rescheduledFrom,
            p_scheduled_for: payload.scheduledForISO,
            p_date_label: payload.dateLabel,
            p_time_label: payload.timeLabel,
            p_notes: payload.notes ?? undefined,
            p_photo_url: payload.photoUrl ?? undefined,
            p_package_id: payload.packageId ?? undefined,
            p_package_name: payload.packageName ?? undefined,
            p_package_price: payload.packagePrice ?? undefined,
          });
          if (error) throw error;
          const record = rowToRecord(data);
          upsertLocal(record);
          return record;
        }

        const { data, error } = await sb.rpc("appointment_create", {
          p_target_type: payload.targetType,
          p_target_id: payload.targetId,
          p_scheduled_for: payload.scheduledForISO,
          p_date_label: payload.dateLabel,
          p_time_label: payload.timeLabel,
          p_notes: payload.notes ?? undefined,
          p_photo_url: payload.photoUrl ?? undefined,
          p_package_id: payload.packageId ?? undefined,
          p_package_name: payload.packageName ?? undefined,
          p_package_price: payload.packagePrice ?? undefined,
        });
        if (error) throw error;
        const record = rowToRecord(data);
        upsertLocal(record); // keep a local cache for instant reads
        // Reserve one unit if the booked package is a FINITE catalog item.
        // The RPC no-ops for INFINITE items, provider packages, and cart
        // bundles, so it's always safe to call best-effort.
        if (payload.targetType === "BUSINESS" && payload.packageId) {
          try { await sb.rpc("reserve_catalog_item", { p_item_id: payload.packageId }); } catch { /* stock reserve is best-effort */ }
        }
        return record;
      } catch (err: any) {
        // The double-booking unique index (appointments_no_double_book) rejects
        // a slot that was taken between load and confirm — say so plainly.
        const msg: string = err?.message || "";
        if (err?.code === "23505" || /duplicate key|unique|no_double_book/i.test(msg)) {
          throw new Error("That slot was just taken. Please pick another time.");
        }
        // Surface the real reason instead of silently succeeding.
        throw new Error(msg || "Couldn't book the appointment. Please try again.");
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
        await sweepRemoteAppointments(); // DB does the stale-state transitions
        const sb = getSupabase();
        const { data, error } = await sb
          .from("appointments")
          .select("*")
          .eq("customer_user_id", uid)
          .order("scheduled_for", { ascending: false });
        if (error) throw error;
        // Rows are already swept server-side — no client-side DB writes here.
        return (data ?? []).map(rowToRecord);
      } catch {
        // Read-only fallback so the list still renders offline. Never writes,
        // so it can't mask a failed mutation or diverge the DB.
        return localHousekeeping(getLocalAppointments().filter((a) => a.customerId === customerId || !a.customerId));
      }
    }
    return localHousekeeping(getLocalAppointments().filter((a) => a.customerId === customerId || !a.customerId));
  },

  async listForTarget(targetId: string): Promise<AppointmentRecord[]> {
    if (!isMockTarget(targetId)) {
      try {
        await sweepRemoteAppointments(); // DB does the stale-state transitions
        const sb = getSupabase();
        const { data, error } = await sb
          .from("appointments")
          .select("*, customer:users!customer_user_id(alias)")
          .eq("target_id", targetId)
          .order("scheduled_for", { ascending: false });
        if (error) throw error;
        return (data ?? []).map(rowToRecord);
      } catch {
        return localHousekeeping(getLocalAppointments().filter((a) => a.targetId === targetId));
      }
    }
    return localHousekeeping(getLocalAppointments().filter((a) => a.targetId === targetId));
  },

  /**
   * Occupied slot timestamps for a target — via a privacy-safe SECURITY DEFINER
   * RPC (booked_slots) so the booking sheet can grey out taken slots WITHOUT
   * reading other customers' appointment rows (which appt_select RLS hides).
   * This closes the double-booking hole where a customer's slot grid, built
   * from only their own visible rows, showed already-taken slots as free.
   */
  async bookedSlots(targetId: string): Promise<string[]> {
    if (isMockTarget(targetId)) return [];
    try {
      const sb = getSupabase();
      const { data, error } = await sb.rpc("booked_slots", { p_target_id: targetId });
      if (error) throw error;
      return (data ?? []).map((r: any) => r.scheduled_for as string);
    } catch {
      return [];
    }
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
    const newStatus = "PENDING_CONFIRM" as const;

    const uid = await currentUserId();
    if (uid) {
      try {
        const sb = getSupabase();
        const { data, error } = await sb.rpc("appointment_claim_payment", {
          p_id: id,
          p_method: method,
          p_amount: amount ?? undefined,
          p_reference: reference ?? undefined,
        });
        if (error) throw error;
        if (data) {
          const record = rowToRecord(data);
          upsertLocal(record);
          return record;
        }
      } catch (e: any) {
        throw new Error(e?.message || "Couldn't record the payment. Please try again.");
      }
    }

    const list = getLocalAppointments();
    const idx = list.findIndex((a) => a.id === id);
    if (idx !== -1) {
      list[idx] = {
        ...list[idx],
        paymentMethod: method,
        paymentStatus: newStatus,
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
    return patchPaymentStatus(id, "CONFIRM");
  },

  /** Business rejects the customer's claim → REJECTED; customer can try again. */
  async rejectPaymentClaim(id: string): Promise<AppointmentRecord | undefined> {
    return patchPaymentStatus(id, "REJECT");
  },

  /** Owner records payment for an owner-created walk-in; never bypasses a customer's claim. */
  async recordWalkInPayment(
    id: string,
    method: PaymentMethod,
    amount?: number | null,
    reference?: string | null,
  ): Promise<AppointmentRecord | undefined> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("appointment_record_walk_in_payment", {
      p_id: id,
      p_method: method,
      p_amount: amount ?? undefined,
      p_reference: reference ?? undefined,
    });
    if (error) throw new Error(error.message || "Couldn't record the payment.");
    if (!data) return undefined;
    const record = rowToRecord(data);
    upsertLocal(record);
    return record;
  },

  async updateStatus(
    id: string,
    status: AppointmentStatus,
    responseNote?: string,
    cancelledBy?: CancelledBy,
  ): Promise<AppointmentRecord | undefined> {
    // Real DB row for a signed-in user → update the shared table and surface
    // any failure. Only genuinely local (guest/mock) rows fall back to storage.
    const uid = await currentUserId();
    if (uid) {
      try {
        const sb = getSupabase();
        const { data, error } = await sb.rpc("appointment_transition", {
          p_id: id,
          p_status: status,
          p_response_note: responseNote ?? undefined,
        });
        if (error) throw error;
        if (data) {
          const record = rowToRecord(data);
          upsertLocal(record);
          return record;
        }
      } catch (e: any) {
        throw new Error(e?.message || "Couldn't update the appointment. Please try again.");
      }
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
        const { data, error } = await sb.rpc("appointment_create_walk_in", {
          p_target_type: payload.targetType,
          p_target_id: payload.targetId,
          p_customer_name: payload.customerName,
          // No SQL default for this one (unlike the others below) — the RPC
          // itself already treats an empty string as "no phone given".
          p_customer_phone: payload.customerPhone ?? "",
          p_scheduled_for: payload.scheduledForISO,
          p_date_label: payload.dateLabel,
          p_time_label: payload.timeLabel,
          p_package_id: payload.packageId ?? undefined,
          p_package_name: payload.packageName ?? undefined,
          p_package_price: payload.packagePrice ?? undefined,
        });
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

  async nudgePayment(id: string) {
    const sb = getSupabase();
    const { data: apt, error } = await sb
      .from("appointments")
      .select("id, customer_user_id, target_name, date_label, time_label, package_price")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!apt) throw new Error("Appointment not found");
    if (!(apt as any).customer_user_id) throw new Error("No customer linked to this appointment");
    
    const shopName = (apt as any).target_name || "the shop";
    const amountStr = (apt as any).package_price ? ` ₹${(apt as any).package_price}` : "";
    const title = "Payment Requested 🔔";
    const body = `${shopName} requested payment${amountStr} for your booking on ${(apt as any).date_label} at ${(apt as any).time_label}.`;
    
    const { notificationService } = await import("@/services/engagement/notificationService");
    await notificationService.send(
      (apt as any).customer_user_id,
      title,
      body,
      `/appointments`,
      "SYSTEM"
    );
    return { ok: true };
  },
};
