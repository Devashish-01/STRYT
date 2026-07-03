import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import { throwIfError } from "@/lib/supabasePage";
import { notificationService } from "@/services/engagement/notificationService";

function relDate(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 30) return `${Math.floor(d / 7)} week${Math.floor(d / 7) > 1 ? "s" : ""} ago`;
  return `${Math.floor(d / 30)} month${Math.floor(d / 30) > 1 ? "s" : ""} ago`;
}

export interface AdminReport {
  id: string;
  targetType: string;
  targetName: string;
  reason: string;
  reporter: string;
  status: "OPEN" | "REVIEWING" | "ACTION_TAKEN" | "DISMISSED";
  time: string;
}

export interface AdminBugReport {
  id: string;
  description: string;
  reporterRole: "CUSTOMER" | "BUSINESS" | "PROVIDER";
  reporterName: string;
  status: "OPEN" | "REVIEWING" | "RESOLVED" | "DISMISSED";
  time: string;
}

export interface CategoryProposal {
  id: string;
  name: string;
  proposedBy: string;
  parent: string;
  time: string;
}

export interface AdminOverview {
  businesses: number;
  providers: number;
  openRequests: number;
  completedAgreements: number;
  newToday: number;
  pendingReview: number;
  pushDelivery: string | number;
  dau: string | number;
  mau: string | number;
}

export const adminService = {
  async overview(): Promise<AdminOverview> {
    const sb = getSupabase();
    const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    const [
      bizRes,
      provRes,
      reqRes,
      agreeRes,
      bizNewRes,
      provNewRes,
      reqNewRes,
      pendingBizRes,
      pendingProvRes,
      pendingCatRes,
    ] = await Promise.all([
      sb.from("businesses").select("*", { count: "exact", head: true }),
      sb.from("providers").select("*", { count: "exact", head: true }),
      sb.from("requests").select("*", { count: "exact", head: true }).eq("status", "OPEN"),
      sb.from("agreements").select("*", { count: "exact", head: true }).eq("status", "COMPLETED"),
      sb.from("businesses").select("*", { count: "exact", head: true }).gte("created_at", oneDayAgo),
      sb.from("providers").select("*", { count: "exact", head: true }).gte("created_at", oneDayAgo),
      sb.from("requests").select("*", { count: "exact", head: true }).gte("created_at", oneDayAgo),
      sb.from("businesses").select("*", { count: "exact", head: true }).eq("status", "PENDING"),
      sb.from("providers").select("*", { count: "exact", head: true }).eq("status", "PENDING"),
      sb.from("categories").select("*", { count: "exact", head: true }).eq("status", "PENDING"),
    ]);

    throwIfError(bizRes.error);
    throwIfError(provRes.error);
    throwIfError(reqRes.error);
    throwIfError(agreeRes.error);
    throwIfError(bizNewRes.error);
    throwIfError(provNewRes.error);
    throwIfError(reqNewRes.error);
    throwIfError(pendingBizRes.error);
    throwIfError(pendingProvRes.error);
    throwIfError(pendingCatRes.error);

    const newToday = (bizNewRes.count ?? 0) + (provNewRes.count ?? 0) + (reqNewRes.count ?? 0);
    const pendingReview = (pendingBizRes.count ?? 0) + (pendingProvRes.count ?? 0) + (pendingCatRes.count ?? 0);

    return {
      businesses: bizRes.count ?? 0,
      providers: provRes.count ?? 0,
      openRequests: reqRes.count ?? 0,
      completedAgreements: agreeRes.count ?? 0,
      newToday,
      pendingReview,
      // No analytics pipeline yet — these show "Not tracked yet" instead of misleading 0s.
      pushDelivery: "Not tracked yet",
      dau: "Not tracked yet",
      mau: "Not tracked yet",
    };
  },

  async queue(type: "business" | "provider" | "category") {
    const sb = getSupabase();

    if (type === "business") {
      const { data, error } = await sb.from("businesses").select("id, name, sub_category, cover_image").eq("status", "PENDING");
      throwIfError(error);
      return (data ?? []).map((b: any) => ({
        id: b.id,
        name: b.name,
        sub: b.sub_category || "",
        image: b.cover_image || "",
        kind: "business" as const,
      }));
    }

    if (type === "provider") {
      const { data, error } = await sb.from("providers").select("id, display_name, category_name, avatar").eq("status", "PENDING");
      throwIfError(error);
      return (data ?? []).map((p: any) => ({
        id: p.id,
        name: p.display_name,
        sub: p.category_name || "",
        image: p.avatar || "",
        kind: "provider" as const,
      }));
    }

    // type === "category"
    const { data, error } = await sb
      .from("categories")
      .select("id, name, parent_id, parent:categories!parent_id(name)")
      .eq("status", "PENDING");
    throwIfError(error);
    return (data ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      sub: c.parent ? `under ${c.parent.name}` : "proposed root",
      image: "",
      kind: "category" as const,
    }));
  },

  async reports() {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("reports")
      .select("*, reporter:users!reporter_user_id(name)")
      .in("status", ["OPEN", "REVIEWING"])
      .order("created_at", { ascending: false });
    throwIfError(error);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      targetType: r.target_type,
      targetName: r.target_name,
      reason: r.reason,
      reporter: r.reporter?.name || "Anonymous",
      status: r.status as AdminReport["status"],
      time: relDate(r.created_at),
    }));
  },

  async resolveReport(id: string, status: string) {
    const sb = getSupabase();
    const { error } = await sb.from("reports").update({ status }).eq("id", id);
    throwIfError(error);
    return { ok: true };
  },

  async bugReports(): Promise<AdminBugReport[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("bug_reports")
      .select("*, reporter:users!user_id(name)")
      .order("created_at", { ascending: false });
    throwIfError(error);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      description: r.description,
      reporterRole: (r.reporter_role ?? "CUSTOMER") as AdminBugReport["reporterRole"],
      reporterName: r.reporter?.name || "Anonymous",
      status: (r.status ?? "OPEN") as AdminBugReport["status"],
      time: relDate(r.created_at),
    }));
  },

  async resolveBugReport(id: string, status: AdminBugReport["status"]) {
    const sb = getSupabase();
    const { error } = await sb.from("bug_reports").update({ status }).eq("id", id);
    throwIfError(error);
    return { ok: true };
  },

  // ── Admin ID/password login ──────────────────────────────────
  // One-time bootstrap: the currently signed-in user claims the admin role.
  // Server-side guarded (claim_first_admin) — only succeeds while zero
  // admins exist anywhere, so it can't be replayed to mint extra admins.
  async claimFirstAdmin(loginId: string) {
    const sb = getSupabase();
    const { error } = await sb.rpc("claim_first_admin", { p_login_id: loginId.trim().toLowerCase() });
    throwIfError(error);
    return { ok: true };
  },

  /** Change the admin login ID (own account only — enforced server-side). */
  async setAdminLoginId(newId: string) {
    const sb = getSupabase();
    const { error } = await sb.rpc("set_admin_login_id", { p_new_id: newId.trim().toLowerCase() });
    throwIfError(error);
    return { ok: true };
  },

  /** Change the admin's password. Standard Supabase Auth call — the password
   *  is hashed/stored by Supabase itself, never touches our own tables. */
  async changeAdminPassword(newPassword: string) {
    const sb = getSupabase();
    const { error } = await sb.auth.updateUser({ password: newPassword });
    throwIfError(error);
    return { ok: true };
  },

  async approve(type: string, id: string) {
    const sb = getSupabase();
    let table = "";
    let ownerId: string | undefined;
    let entityLat: number | null = null;
    let entityLng: number | null = null;
    let broadcastKm = 5;
    let categoryLabel = "";
    let entityName = "";

    if (type === "business") {
      table = "businesses";
      const { data } = await sb
        .from("businesses")
        .select("owner_user_id, lat, lng, broadcast_radius, category_name, name")
        .eq("id", id)
        .maybeSingle();
      ownerId = data?.owner_user_id;
      entityLat = data?.lat ?? null;
      entityLng = data?.lng ?? null;
      broadcastKm = data?.broadcast_radius ?? 5;
      categoryLabel = data?.category_name ?? "Business";
      entityName = data?.name ?? "A new business";
    } else if (type === "provider") {
      table = "providers";
      const { data } = await sb
        .from("providers")
        .select("user_id, lat, lng, service_radius_km, category_name, display_name")
        .eq("id", id)
        .maybeSingle();
      ownerId = data?.user_id;
      entityLat = data?.lat ?? null;
      entityLng = data?.lng ?? null;
      broadcastKm = data?.service_radius_km ?? 5;
      categoryLabel = data?.category_name ?? "Provider";
      entityName = data?.display_name ?? "A new provider";
    } else if (type === "category") {
      table = "categories";
    } else {
      throw new Error(`Unknown type ${type}`);
    }

    const { error } = await sb.from(table).update({ status: "ACTIVE" }).eq("id", id);
    throwIfError(error);

    // Notify the owner that their listing is live.
    if (ownerId) {
      try {
        await notificationService.send(
          ownerId,
          type === "business" ? "Business Approved ✓" : "Provider Profile Approved ✓",
          type === "business" ? "Your shop is now live!" : "Your provider profile is now live!",
          type === "business" ? `/business/${id}/manage` : `/provider/${id}/manage`,
          "SYSTEM"
        );
      } catch (err) {
        console.warn("Failed to send approval notification:", err);
      }
    }

    // Notify nearby users about the new listing (fire-and-forget, never blocks approval).
    if (entityLat && entityLng && type !== "category") {
      try {
        // lat/lng aren't selectable/filterable via a plain query anymore
        // (ISS-009) — get_nearby_user_ids() is a SECURITY DEFINER RPC that
        // does the same bounding-box lookup server-side.
        const { data: nearbyIds } = await sb.rpc("get_nearby_user_ids", {
          p_lat: entityLat, p_lng: entityLng, p_radius_km: broadcastKm,
        });

        const userIds = ((nearbyIds ?? []) as string[]).filter((uid) => uid !== (ownerId ?? "")).slice(0, 200);
        if (userIds.length > 0) {
          await notificationService.sendBulk(
            userIds,
            `New ${categoryLabel} near you`,
            `${entityName} is now open in your area`,
            type === "business" ? `/business/${id}` : `/provider/${id}`,
            type === "business" ? "NEW_BUSINESS" : "NEW_PROVIDER"
          );
        }
      } catch (err) {
        console.warn("Failed to send nearby notification:", err);
      }
    }

    return { ok: true };
  },

  async reject(type: string, id: string, reason: string) {
    const sb = getSupabase();
    let table = "";
    let ownerId: string | undefined;

    if (type === "business") {
      table = "businesses";
      const { data } = await sb.from("businesses").select("owner_user_id").eq("id", id).maybeSingle();
      ownerId = data?.owner_user_id;
    } else if (type === "provider") {
      table = "providers";
      const { data } = await sb.from("providers").select("user_id").eq("id", id).maybeSingle();
      ownerId = data?.user_id;
    } else if (type === "category") {
      table = "categories";
    } else {
      throw new Error(`Unknown type ${type}`);
    }

    const { error } = await sb.from(table).update({ status: "REJECTED", rejection_reason: reason }).eq("id", id);
    throwIfError(error);

    if (ownerId) {
      try {
        await notificationService.send(
          ownerId,
          type === "business" ? "Listing Needs Updates" : "Profile Needs Updates",
          reason ? `Reason: ${reason}` : "Please review and update your listing.",
          type === "business" ? `/business/${id}/manage` : `/provider/${id}/manage`,
          "SYSTEM"
        );
      } catch (err) {
        console.warn("Failed to send rejection notification:", err);
      }
    }

    return { ok: true };
  },

  async submitReport(report: { targetType: string; targetId: string; targetName: string; reason: string; details?: string }) {
    const sb = getSupabase();
    const uid = await currentUserId();
    const { error } = await sb.from("reports").insert({
      target_type: report.targetType,
      target_id: report.targetId,
      target_name: report.targetName,
      reason: report.reason,
      details: report.details || "",
      reporter_user_id: uid,
    });
    throwIfError(error);
    return { ok: true };
  },
};
