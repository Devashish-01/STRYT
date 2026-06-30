import { getSupabase } from "@/lib/supabaseClient";
import { throwIfError } from "@/lib/supabasePage";

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

    const res = await fetch(`${(import.meta as any).env.VITE_SUPABASE_URL}/functions/v1/profile-control`, {
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
   * Submits a deletion request to the review queue for admins.
   */
  async requestDeletion(targetType: ProfileTarget, targetId: string | null, reason: string): Promise<void> {
    const sb = getSupabase();
    const { data: { session } } = await sb.auth.getSession();
    if (!session || !session.user) throw new Error("Authentication required");

    const { error } = await sb.from("profile_deletion_requests").insert({
      user_id: session.user.id,
      target_type: targetType,
      target_id: targetId,
      reason,
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

    const res = await fetch(`${(import.meta as any).env.VITE_SUPABASE_URL}/functions/v1/admin-delete-profile`, {
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
