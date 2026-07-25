import { getSupabase } from "@/lib/supabaseClient";
import { throwIfError } from "@/lib/supabasePage";
import { functionUrl } from "@/config";
import { ACCOUNT_DELETION_GRACE_DAYS } from "@/lib/accountDeletion";

export type ProfileTarget = "CUSTOMER" | "BUSINESS" | "PROVIDER";

export interface DeletionRequest {
  id: string;
  userId: string;
  targetType: ProfileTarget;
  targetId: string | null;
  reason: string;
  status: "PENDING" | "REVIEWING" | "APPROVED" | "COMPLETED" | "REJECTED";
  createdAt: string;
  updatedAt: string;
  user?: {
    name: string;
  };
}

export const profileControlService = {
  /**
   * Toggles profile visibility (ON/OFF) via the profile-control Edge Function.
   */
  async setEnabled(targetType: ProfileTarget, targetId: string | null, enabled: boolean): Promise<void> {
    const sb = getSupabase();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error("Authentication required");

    const res = await fetch(functionUrl("profile-control"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ targetType, targetId, enabled }),
    });

    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json.message || "Failed to update profile visibility status");
    }
  },

  /**
   * Self-serve account deletion schedule (Play / App Store User Data policy).
   * Hides the profile immediately and permanently purges after
   * ACCOUNT_DELETION_GRACE_DAYS unless the user cancels. No admin approval.
   */
  async requestDeletion(targetType: ProfileTarget, targetId: string | null, reason: string): Promise<void> {
    const sb = getSupabase();
    const { data: { session } } = await sb.auth.getSession();
    if (!session || !session.user) throw new Error("Authentication required");

    if (targetType === "CUSTOMER") {
      const uid = session.user.id;

      const { count: activeAgreements } = await sb
        .from("agreements")
        .select("*", { count: "exact", head: true })
        .or(`requester_user_id.eq.${uid},responder_user_id.eq.${uid}`)
        .not("status", "in", '("COMPLETED","CANCELLED","DISPUTED")');
      if (activeAgreements && activeAgreements > 0) {
        throw new Error("You still have active deals. Finish or cancel them before deleting your account.");
      }

      const { data: existing } = await sb
        .from("profile_deletion_requests")
        .select("id")
        .eq("user_id", uid)
        .eq("target_type", "CUSTOMER")
        .eq("status", "PENDING")
        .maybeSingle();
      if (existing) {
        throw new Error("Account deletion is already scheduled. Open the deletion screen to cancel or wait for purge.");
      }
    }

    const { error } = await sb.from("profile_deletion_requests").insert({
      user_id: session.user.id,
      target_type: targetType,
      target_id: targetId,
      reason: reason.trim() || "User requested account deletion",
      status: "PENDING",
    });
    throwIfError(error);

    if (targetType === "CUSTOMER") {
      const { error: userErr } = await sb
        .from("users")
        .update({ customer_enabled: false })
        .eq("id", session.user.id);
      if (userErr) console.warn("Failed to soft-disable user profile:", userErr.message);
    }
  },

  /** Cancel a scheduled CUSTOMER deletion during the grace period. */
  async cancelDeletion(): Promise<void> {
    const sb = getSupabase();
    const { data: { session } } = await sb.auth.getSession();
    if (!session || !session.user) throw new Error("Authentication required");

    const { error } = await sb
      .from("profile_deletion_requests")
      .delete()
      .eq("user_id", session.user.id)
      .eq("target_type", "CUSTOMER")
      .eq("status", "PENDING");
    throwIfError(error);

    const { error: userErr } = await sb
      .from("users")
      .update({ customer_enabled: true })
      .eq("id", session.user.id);
    throwIfError(userErr);
  },

  /**
   * Completes permanent deletion after the grace period (self-serve).
   * Calls the purge-deleted-accounts Edge Function.
   */
  async completeScheduledDeletion(): Promise<void> {
    const sb = getSupabase();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error("Authentication required");

    const res = await fetch(functionUrl("purge-deleted-accounts"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({}),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      throw new Error(json.message || "Could not complete account deletion.");
    }
  },

  /** Grace period length shown in UI copy. */
  graceDays: ACCOUNT_DELETION_GRACE_DAYS,

  /**
   * Retrieves all deletion requests (Admin only).
   */
  async getDeletionRequests(): Promise<DeletionRequest[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("profile_deletion_requests")
      .select("*, user:users!user_id(name)")
      .order("created_at", { ascending: false });

    throwIfError(error);

    return (data || []).map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      targetType: r.target_type as ProfileTarget,
      targetId: r.target_id,
      reason: r.reason,
      status: r.status as DeletionRequest["status"],
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      user: r.user ? { name: r.user.name } : undefined,
    }));
  },

  /**
   * Updates a deletion request status (Admin only).
   */
  async updateRequestStatus(requestId: string, status: DeletionRequest["status"]): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb
      .from("profile_deletion_requests")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", requestId);

    throwIfError(error);
  },

  /**
   * Admin-only permanent deletion command via the admin-delete-profile Edge Function.
   */
  async adminDeleteProfile(
    targetType: ProfileTarget,
    targetId: string,
    reason: string,
    confirmation: string
  ): Promise<void> {
    const sb = getSupabase();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error("Authentication required");

    const res = await fetch(functionUrl("admin-delete-profile"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ targetType, targetId, reason, confirmation }),
    });

    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json.message || "Deletion failed or blocked by active disputes/contracts.");
    }
  },
};
