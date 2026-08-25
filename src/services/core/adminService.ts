import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import { throwIfError } from "@/lib/supabasePage";
import { notificationService } from "@/services/engagement/notificationService";
import { functionUrl } from "@/config";

export type VerificationTargetType = "BUSINESS" | "PROVIDER";
export type VerificationDecision = "APPROVE" | "REJECT" | "SUSPEND";

export interface VerificationQueueItem {
  targetType: VerificationTargetType;
  targetId: string;
  name: string;
  ownerName: string;
  documentCount: number;
  submittedAt: string;
}

/** Calls the verification-review Edge Function — the only path that can move
 *  a verification decision to APPROVED/REJECTED (a DB trigger blocks anyone
 *  else, so this can't be spoofed by a direct table write). */
async function callVerificationReview<T = any>(payload: Record<string, unknown>): Promise<T> {
  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error("Authentication required");

  const res = await fetch(functionUrl("verification-review"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json.message || "Verification review request failed");
  }
  return json;
}

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

/** A business whose owner has requested a location change awaiting admin sign-off. */
export interface PendingLocationChange {
  id: string;
  name: string;
  coverImage: string;
  /** Current (live) coordinates — what discovery uses right now. */
  lat: number | null;
  lng: number | null;
  /** Requested (staged) coordinates — go live only on approve. */
  pendingLat: number | null;
  pendingLng: number | null;
  ownerUserId: string | null;
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
      pendingPlaceRes,
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
      // places (20260824_places_to_visit.sql) became a 4th admin queue type
      // but this pending-review rollup was never updated — a place sitting
      // in the Queue tab showed "Pending review: 0" on the Overview tab.
      sb.from("places").select("*", { count: "exact", head: true }).eq("status", "PENDING"),
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
    throwIfError(pendingPlaceRes.error);

    const newToday = (bizNewRes.count ?? 0) + (provNewRes.count ?? 0) + (reqNewRes.count ?? 0);
    const pendingReview = (pendingBizRes.count ?? 0) + (pendingProvRes.count ?? 0) + (pendingCatRes.count ?? 0) + (pendingPlaceRes.count ?? 0);

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

  async resolveAgreementDispute(agreementId: string, resolution: "COMPLETED" | "CANCELLED") {
    const sb = getSupabase();
    const { error } = await sb.rpc("admin_resolve_agreement_dispute", {
      p_id: agreementId,
      p_resolution: resolution,
    });
    throwIfError(error);
  },

  async queue(type: "business" | "provider" | "category" | "place") {
    const sb = getSupabase();

    if (type === "business") {
      // Onboarding collects ~16 fields; this used to select four
      // (id, name, sub_category, cover_image), so an admin was asked to approve
      // a real business having seen a name, a category string and a photo. They
      // could not check the address was real, the phone worked, or that it was
      // even in the right city. Reported as "when submitted the review the data
      // is not showing correct" — the data wasn't wrong, it was absent.
      const { data, error } = await sb
        .from("businesses")
        .select("id, name, sub_category, category_name, cover_image, address_line1, city, pincode, phone, email, hours, opening_date, lat, lng, created_at")
        .eq("status", "PENDING")
        .order("created_at", { ascending: true }); // oldest first — fairest queue
      throwIfError(error);
      return (data ?? []).map((b: any) => ({
        id: b.id,
        name: b.name,
        sub: b.sub_category || b.category_name || "",
        image: b.cover_image || "",
        kind: "business" as const,
        details: {
          Category: b.category_name || null,
          Address: [b.address_line1, b.city, b.pincode].filter(Boolean).join(", ") || null,
          Phone: b.phone || null,
          Email: b.email || null,
          Hours: b.hours || null,
          "Opening date": b.opening_date || null,
          Location: b.lat != null && b.lng != null ? `${Number(b.lat).toFixed(5)}, ${Number(b.lng).toFixed(5)}` : null,
          Submitted: b.created_at ? new Date(b.created_at).toLocaleString() : null,
        } as Record<string, string | null>,
      }));
    }

    if (type === "provider") {
      // Same gap as businesses above — four fields is not enough to approve a
      // real person offering services.
      const { data, error } = await sb
        .from("providers")
        .select("id, display_name, category_name, avatar, bio, phone, area, city, starting_price, lat, lng, created_at")
        .eq("status", "PENDING")
        .order("created_at", { ascending: true });
      throwIfError(error);
      return (data ?? []).map((p: any) => ({
        id: p.id,
        name: p.display_name,
        sub: p.category_name || "",
        image: p.avatar || "",
        kind: "provider" as const,
        details: {
          Category: p.category_name || null,
          About: p.bio || null,
          Phone: p.phone || null,
          Area: [p.area, p.city].filter(Boolean).join(", ") || null,
          "Starting price": p.starting_price != null ? String(p.starting_price) : null,
          Location: p.lat != null && p.lng != null ? `${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}` : null,
          Submitted: p.created_at ? new Date(p.created_at).toLocaleString() : null,
        } as Record<string, string | null>,
      }));
    }

    if (type === "place") {
      const { data, error } = await sb
        .from("places")
        .select("id, name, category, description, address_line1, city, lat, lng, cover_image, created_at, submitted_by_user_id")
        .eq("status", "PENDING")
        .order("created_at", { ascending: true });
      throwIfError(error);
      return (data ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        sub: p.category,
        image: p.cover_image || "",
        kind: "place" as const,
        details: {
          Category: p.category || null,
          Description: p.description || null,
          Address: [p.address_line1, p.city].filter(Boolean).join(", ") || null,
          Location: p.lat != null && p.lng != null ? `${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}` : null,
          Submitted: p.created_at ? new Date(p.created_at).toLocaleString() : null,
        } as Record<string, string | null>,
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
      ownerId = data?.owner_user_id ?? undefined;
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
      ownerId = data?.user_id ?? undefined;
      entityLat = data?.lat ?? null;
      entityLng = data?.lng ?? null;
      broadcastKm = data?.service_radius_km ?? 5;
      categoryLabel = data?.category_name ?? "Provider";
      entityName = data?.display_name ?? "A new provider";
    } else if (type === "place") {
      table = "places";
      const { data } = await sb
        .from("places")
        .select("submitted_by_user_id, lat, lng, category, name")
        .eq("id", id)
        .maybeSingle();
      ownerId = data?.submitted_by_user_id ?? undefined;
      entityLat = data?.lat ?? null;
      entityLng = data?.lng ?? null;
      // Places have no owner-set broadcast radius column — fixed 10km.
      broadcastKm = 10;
      categoryLabel = data?.category ?? "Place";
      entityName = data?.name ?? "A new place";
    } else if (type === "category") {
      table = "categories";
    } else {
      throw new Error(`Unknown type ${type}`);
    }

    // `table` is a runtime-chosen table name; cast so the typed client accepts
    // the dynamic .from() (the update shape is valid on every branch's table).
    const { error } = await sb.from(table as "businesses").update({ status: "ACTIVE" }).eq("id", id);
    throwIfError(error);

    // Notify the owner/submitter that their listing is live.
    if (ownerId) {
      try {
        const title = type === "business" ? "Business Approved ✓" : type === "provider" ? "Provider Profile Approved ✓" : "Place Approved ✓";
        const body = type === "business" ? "Your shop is now live!" : type === "provider" ? "Your provider profile is now live!" : "Your suggested place is now live on the map!";
        const link = type === "business" ? `/business/${id}/manage` : type === "provider" ? `/provider/${id}/manage` : `/place/${id}`;
        await notificationService.send(ownerId, title, body, link, "SYSTEM");
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
            type === "place" ? `${entityName} was just added nearby` : `${entityName} is now open in your area`,
            type === "business" ? `/business/${id}` : type === "provider" ? `/provider/${id}` : `/place/${id}`,
            type === "business" ? "NEW_BUSINESS" : type === "provider" ? "NEW_PROVIDER" : "NEW_PLACE"
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
      ownerId = data?.owner_user_id ?? undefined;
    } else if (type === "provider") {
      table = "providers";
      const { data } = await sb.from("providers").select("user_id").eq("id", id).maybeSingle();
      ownerId = data?.user_id ?? undefined;
    } else if (type === "place") {
      table = "places";
      const { data } = await sb.from("places").select("submitted_by_user_id").eq("id", id).maybeSingle();
      ownerId = data?.submitted_by_user_id ?? undefined;
    } else if (type === "category") {
      table = "categories";
    } else {
      throw new Error(`Unknown type ${type}`);
    }

    const { error } = await sb.from(table as "businesses").update({ status: "REJECTED", rejection_reason: reason }).eq("id", id);
    throwIfError(error);

    if (ownerId) {
      try {
        const title = type === "business" ? "Listing Needs Updates" : type === "provider" ? "Profile Needs Updates" : "Place Suggestion Needs Updates";
        const link = type === "business" ? `/business/${id}/manage` : type === "provider" ? `/provider/${id}/manage` : "/map";
        await notificationService.send(
          ownerId,
          title,
          reason ? `Reason: ${reason}` : "Please review and update your submission.",
          link,
          "SYSTEM"
        );
      } catch (err) {
        console.warn("Failed to send rejection notification:", err);
      }
    }

    return { ok: true };
  },

  // ── Business location change review ────────────────────────────────────
  // Owners can only *request* a move (businessService.requestLocationChange,
  // which writes the pending_* staging columns); the live location and the
  // geom discovery reads never change until an admin approves it here. Casts
  // to `as any` are for the pending_* / location_review_status columns, which
  // are new and not yet in the generated database.types.ts.

  /** Businesses with a location change awaiting review (status 'PENDING'). */
  async pendingLocationChanges(): Promise<PendingLocationChange[]> {
    const sb = getSupabase();
    const { data, error } = await (sb.from("businesses") as any)
      .select("id, name, cover_image, lat, lng, pending_lat, pending_lng, owner_user_id")
      .eq("location_review_status", "PENDING")
      .order("pending_location_requested_at", { ascending: true });
    throwIfError(error);
    return ((data ?? []) as any[]).map((b) => ({
      id: b.id,
      name: b.name,
      coverImage: b.cover_image ?? "",
      lat: b.lat ?? null,
      lng: b.lng ?? null,
      pendingLat: b.pending_lat ?? null,
      pendingLng: b.pending_lng ?? null,
      ownerUserId: b.owner_user_id ?? null,
    }));
  },

  /** Approve: promote the staged coords onto the live lat/lng (geom re-syncs
   *  automatically via the businesses_geom trigger), clear staging, notify owner. */
  async approveLocationChange(id: string) {
    const sb = getSupabase();
    const { data: biz, error: readErr } = await (sb.from("businesses") as any)
      .select("owner_user_id, pending_lat, pending_lng")
      .eq("id", id)
      .maybeSingle();
    throwIfError(readErr);
    if (!biz || biz.pending_lat == null || biz.pending_lng == null) {
      throw new Error("No pending location to approve for this business.");
    }

    const { error } = await (sb.from("businesses") as any)
      .update({
        lat: biz.pending_lat,
        lng: biz.pending_lng,
        pending_lat: null,
        pending_lng: null,
        location_review_status: "NONE",
        pending_location_requested_at: null,
      })
      .eq("id", id);
    throwIfError(error);

    const ownerId = biz.owner_user_id as string | undefined;
    if (ownerId) {
      try {
        await notificationService.send(
          ownerId,
          "Location updated ✓",
          "Your business location change was approved and is now live.",
          `/business/${id}/manage`,
          "SYSTEM"
        );
      } catch (err) {
        console.warn("Failed to send location approval notification:", err);
      }
    }
    return { ok: true };
  },

  /** Reject: discard the staged coords and reset status. Live location is left
   *  exactly as it was; the owner is notified (with an optional reason). */
  async rejectLocationChange(id: string, reason?: string) {
    const sb = getSupabase();
    const { data: biz, error: readErr } = await sb
      .from("businesses")
      .select("owner_user_id")
      .eq("id", id)
      .maybeSingle();
    throwIfError(readErr);

    const { error } = await (sb.from("businesses") as any)
      .update({
        pending_lat: null,
        pending_lng: null,
        location_review_status: "NONE",
        pending_location_requested_at: null,
      })
      .eq("id", id);
    throwIfError(error);

    const ownerId = biz?.owner_user_id as string | undefined;
    if (ownerId) {
      try {
        await notificationService.send(
          ownerId,
          "Location change not approved",
          reason ? `Reason: ${reason}` : "Your business location change request was not approved.",
          `/business/${id}/manage`,
          "SYSTEM"
        );
      } catch (err) {
        console.warn("Failed to send location rejection notification:", err);
      }
    }
    return { ok: true };
  },

  // ── Manual verification review (server-side, badge-forgery-proof) ──────
  async verificationQueue(): Promise<VerificationQueueItem[]> {
    const { items } = await callVerificationReview<{ items: VerificationQueueItem[] }>({ action: "list" });
    return items;
  },

  async viewVerificationDocs(targetType: VerificationTargetType, targetId: string): Promise<string[]> {
    const { urls } = await callVerificationReview<{ urls: string[] }>({ action: "view", targetType, targetId });
    return urls;
  },

  async reviewVerification(targetType: VerificationTargetType, targetId: string, decision: VerificationDecision, reason?: string): Promise<void> {
    await callVerificationReview({ action: "decide", targetType, targetId, decision, reason });
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
