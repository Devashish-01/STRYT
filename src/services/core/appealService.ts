import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import { throwIfError } from "@/lib/supabasePage";

export type AppealEntityType = "BUSINESS" | "PROVIDER";
export type AppealStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface AccountAppeal {
  id: string;
  entityType: AppealEntityType;
  entityId: string;
  ownerUserId: string;
  reason: string;
  status: AppealStatus;
  adminNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

function rowToAppeal(r: any): AccountAppeal {
  return {
    id: r.id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    ownerUserId: r.owner_user_id,
    reason: r.reason,
    status: r.status,
    adminNote: r.admin_note ?? null,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at ?? null,
  };
}

export const appealService = {
  /** Submit a review request for a suspended business/provider (owner-facing). */
  async submit(entityType: AppealEntityType, entityId: string, reason: string): Promise<void> {
    const uid = await currentUserId();
    if (!uid) throw new Error("Sign in to raise a review request");
    const sb = getSupabase();
    const { error } = await sb.from("account_appeals").insert({
      entity_type: entityType,
      entity_id: entityId,
      owner_user_id: uid,
      reason: reason.trim(),
    });
    throwIfError(error);
  },

  /** The signed-in owner's own appeals for one entity, most recent first. */
  async mine(entityType: AppealEntityType, entityId: string): Promise<AccountAppeal[]> {
    const uid = await currentUserId();
    if (!uid) return [];
    const sb = getSupabase();
    const { data, error } = await sb
      .from("account_appeals")
      .select("*")
      .eq("owner_user_id", uid)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false });
    throwIfError(error);
    return (data ?? []).map(rowToAppeal);
  },

  /** All pending appeals (admin console). */
  async pending(): Promise<AccountAppeal[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("account_appeals")
      .select("*")
      .eq("status", "PENDING")
      .order("created_at", { ascending: false });
    throwIfError(error);
    return (data ?? []).map(rowToAppeal);
  },

  /** Admin resolves an appeal — approving reactivates the entity and notifies the owner. */
  async resolve(appeal: AccountAppeal, approve: boolean, adminNote: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb
      .from("account_appeals")
      .update({
        status: approve ? "APPROVED" : "REJECTED",
        admin_note: adminNote.trim() || null,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", appeal.id);
    throwIfError(error);

    if (approve) {
      const table = appeal.entityType === "BUSINESS" ? "businesses" : "providers";
      const { error: reactivateError } = await sb.from(table).update({ status: "ACTIVE" }).eq("id", appeal.entityId);
      throwIfError(reactivateError);
    }
  },
};
