import { getSupabase } from "@/lib/supabaseClient";
import { throwIfError } from "@/lib/supabasePage";
import type { CustomPayment, PaymentMethod } from "@/types";

// Maps the RPC's bare exception codes (custom_payment_confirm/reject in
// 20260824_custom_payments.sql) to copy a merchant can actually act on —
// same pattern appointmentService.createWalkIn already uses for its own
// RPC's SLOT_FULL/PARTY_SIZE_TOO_LARGE codes. Without this, a race (two
// people confirming the same claim) surfaced the literal string
// "INVALID_TRANSITION" in the toast.
function friendlyCustomPaymentError(err: any): Error {
  const msg: string = err?.message || "";
  if (/PAYMENT_NOT_FOUND/i.test(msg)) return new Error("That claim no longer exists.");
  if (/NOT_TARGET_MANAGER/i.test(msg)) return new Error("You don't have permission to act on this claim.");
  if (/INVALID_TRANSITION/i.test(msg)) return new Error("Already handled — someone beat you to it.");
  return new Error(msg || "Couldn't update this claim. Try again.");
}

function rowToRecord(r: any): CustomPayment {
  return {
    id: r.id,
    targetType: r.target_type,
    targetId: r.target_id,
    targetOwnerUserId: r.target_owner_user_id,
    targetName: r.target_name ?? null,
    payerUserId: r.payer_user_id,
    payerName: r.payer_name ?? null,
    payerAvatar: r.payer_avatar ?? null,
    amount: Number(r.amount),
    method: r.method,
    status: r.status,
    reference: r.reference ?? null,
    note: r.note ?? null,
    createdAtISO: r.created_at,
    confirmedAtISO: r.confirmed_at ?? null,
  };
}

// "Pay any amount" — a customer paying a business/provider a self-chosen sum
// with no appointment/queue/deal attached. All writes go through the three
// RPCs (custom_payment_create/confirm/reject); the table has no insert/update
// RLS policy at all, so a raw client mutation can never bypass them.
export const customPaymentService = {
  async create(
    targetType: "BUSINESS" | "PROVIDER",
    targetId: string,
    amount: number,
    method: PaymentMethod,
    note?: string | null,
    reference?: string | null
  ): Promise<CustomPayment> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("custom_payment_create", {
      p_target_type: targetType,
      p_target_id: targetId,
      p_amount: amount,
      p_method: method,
      p_note: note ?? undefined,
      p_reference: reference ?? undefined,
    });
    throwIfError(error);
    return rowToRecord(data);
  },

  async confirm(id: string): Promise<CustomPayment> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("custom_payment_confirm", { p_id: id });
    if (error) throw friendlyCustomPaymentError(error);
    return rowToRecord(data);
  },

  async reject(id: string): Promise<CustomPayment> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("custom_payment_reject", { p_id: id });
    if (error) throw friendlyCustomPaymentError(error);
    return rowToRecord(data);
  },

  async listForTarget(targetType: "BUSINESS" | "PROVIDER", targetId: string): Promise<CustomPayment[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("custom_payments")
      .select("*")
      .eq("target_type", targetType)
      .eq("target_id", targetId)
      .order("created_at", { ascending: false });
    throwIfError(error);
    return (data ?? []).map(rowToRecord);
  },
};
