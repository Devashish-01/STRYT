import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import { throwIfError } from "@/lib/supabasePage";

export interface LocationGrant {
  id: string;
  ownerUserId: string;
  requesterUserId: string;
  status: "PENDING" | "APPROVED" | "DENIED" | "REVOKED";
  requesterName?: string;
  requesterAvatar?: string;
  createdAt?: string;
  updatedAt?: string;
  /** APPROVED grants lapse 24h after being given unless renewed. */
  expiresAt?: string | null;
}

export const locationService = {
  // Ask an owner to reveal their exact location. Notifies them.
  async request(ownerUserId: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.rpc("request_location_share", { p_owner: ownerUserId });
    throwIfError(error);
  },

  // Owner approves/denies a specific requester. Approval grants 24h of access.
  async respond(requesterUserId: string, approve: boolean): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.rpc("respond_location_share", { p_requester: requesterUserId, p_approve: approve });
    throwIfError(error);
  },

  // Owner extends an already-approved grant by another 24h, without the
  // requester needing to ask again.
  async renew(requesterUserId: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.rpc("renew_location_share", { p_requester: requesterUserId });
    throwIfError(error);
  },

  // Owner revokes a previously granted / pending share.
  async revoke(requesterUserId: string): Promise<void> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return;
    const { error } = await sb
      .from("location_share_grants")
      .update({ status: "REVOKED", updated_at: new Date().toISOString() })
      .eq("owner_user_id", uid)
      .eq("requester_user_id", requesterUserId);
    throwIfError(error);
  },

  // Exact coords of a target, or null if not permitted (no approved grant).
  async getSharedLocation(targetId: string): Promise<{ lat: number; lng: number } | null> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("get_shared_location", { p_target: targetId }).maybeSingle();
    throwIfError(error);
    if (!data) return null;
    const row = data as { lat: number; lng: number };
    if (row.lat == null || row.lng == null) return null;
    return { lat: row.lat, lng: row.lng };
  },

  // Pending inbound requests for the signed-in owner (to approve/deny).
  // Non-critical read: yields [] on any error (incl. table not yet migrated)
  // so the Settings inbox degrades silently rather than error-toasting.
  async pendingForMe(): Promise<LocationGrant[]> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return [];
    const { data, error } = await sb
      .from("location_share_grants")
      .select("id, owner_user_id, requester_user_id, status, created_at, updated_at, requester:users!requester_user_id(name, avatar)")
      .eq("owner_user_id", uid)
      .eq("status", "PENDING")
      .order("created_at", { ascending: false });
    if (error) return [];
    return (data ?? []).map((r: any) => ({
      id: r.id,
      ownerUserId: r.owner_user_id,
      requesterUserId: r.requester_user_id,
      status: r.status,
      requesterName: r.requester?.name ?? "Someone",
      requesterAvatar: r.requester?.avatar ?? "",
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  },

  // Active shares currently approved by me.
  async sharedByMe(): Promise<LocationGrant[]> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return [];
    const { data, error } = await sb
      .from("location_share_grants")
      .select("id, owner_user_id, requester_user_id, status, created_at, updated_at, expires_at, requester:users!requester_user_id(name, avatar)")
      .eq("owner_user_id", uid)
      .eq("status", "APPROVED")
      .order("updated_at", { ascending: false });
    if (error) return [];
    return (data ?? []).map((r: any) => ({
      id: r.id,
      ownerUserId: r.owner_user_id,
      requesterUserId: r.requester_user_id,
      status: r.status,
      requesterName: r.requester?.name ?? "Someone",
      requesterAvatar: r.requester?.avatar ?? "",
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      expiresAt: r.expires_at,
    }));
  },

  // Inactive history of shares revoked or denied by me.
  async shareHistory(): Promise<LocationGrant[]> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return [];
    const { data, error } = await sb
      .from("location_share_grants")
      .select("id, owner_user_id, requester_user_id, status, created_at, updated_at, requester:users!requester_user_id(name, avatar)")
      .eq("owner_user_id", uid)
      .in("status", ["REVOKED", "DENIED"])
      .order("updated_at", { ascending: false })
      .limit(20);
    if (error) return [];
    return (data ?? []).map((r: any) => ({
      id: r.id,
      ownerUserId: r.owner_user_id,
      requesterUserId: r.requester_user_id,
      status: r.status,
      requesterName: r.requester?.name ?? "Someone",
      requesterAvatar: r.requester?.avatar ?? "",
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  },

  // The viewer's own outbound grant status toward a given owner.
  // Yields "NONE" on any error so the profile control degrades gracefully.
  async myStatusToward(ownerUserId: string): Promise<"NONE" | "PENDING" | "APPROVED" | "DENIED" | "REVOKED"> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return "NONE";
    const { data, error } = await sb
      .from("location_share_grants")
      .select("status")
      .eq("owner_user_id", ownerUserId)
      .eq("requester_user_id", uid)
      .maybeSingle();
    if (error) return "NONE";
    return (data?.status as any) ?? "NONE";
  },
};
