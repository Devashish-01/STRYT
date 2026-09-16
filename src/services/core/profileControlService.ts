import { getSupabase } from "@/lib/supabaseClient";
import { throwIfError } from "@/lib/supabasePage";
import { functionUrl } from "@/config";
import { ACCOUNT_DELETION_GRACE_DAYS } from "@/lib/accountDeletion";
import { notificationService } from "@/services/engagement/notificationService";

export type ProfileTarget = "CUSTOMER" | "BUSINESS" | "PROVIDER";

/** What was visible when a deletion was scheduled, so cancelling restores exactly that (DEL-5). */
export interface PrevVisibility {
  customerEnabled: boolean;
  businesses: Record<string, boolean>;
  providers: Record<string, boolean>;
}

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

      const { count: heldPayments } = await sb
        .from("payments")
        .select("*", { count: "exact", head: true })
        .eq("escrow_status", "HELD")
        .eq("payer_user_id", uid);
      if (heldPayments && heldPayments > 0) {
        throw new Error("You have payments still marked as held. Resolve them in your deals before deleting your account.");
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

    // What was visible before the grace period starts, so cancelling restores exactly this and doesn't expose a
    // profile or storefront that was deliberately hidden (DEL-5, column added by 20260981).
    let prevVisibility: PrevVisibility | null = null;
    if (targetType === "CUSTOMER") {
      const uid = session.user.id;
      const [{ data: me }, { data: bizRows }, { data: provRows }] = await Promise.all([
        sb.from("users").select("customer_enabled").eq("id", uid).maybeSingle(),
        sb.from("businesses").select("id, owner_enabled").eq("owner_user_id", uid),
        sb.from("providers").select("id, owner_enabled").eq("user_id", uid),
      ]);
      prevVisibility = {
        customerEnabled: (me as any)?.customer_enabled !== false,
        businesses: Object.fromEntries(((bizRows ?? []) as any[]).map((b) => [b.id, b.owner_enabled !== false])),
        providers: Object.fromEntries(((provRows ?? []) as any[]).map((p) => [p.id, p.owner_enabled !== false])),
      };
    }

    const { error } = await sb.from("profile_deletion_requests").insert({
      user_id: session.user.id,
      target_type: targetType,
      target_id: targetId,
      reason: reason.trim() || "User requested account deletion",
      status: "PENDING",
      prev_visibility: prevVisibility,
    } as any);
    throwIfError(error);

    if (targetType === "CUSTOMER") {
      const { error: userErr } = await sb
        .from("users")
        .update({ customer_enabled: false })
        .eq("id", session.user.id);
      if (userErr) console.warn("Failed to soft-disable user profile:", userErr.message);

      // DEL-1: Auto-pause discoverability on active businesses & providers during 30-day grace period
      const { error: bizErr } = await sb
        .from("businesses")
        .update({ owner_enabled: false })
        .eq("owner_user_id", session.user.id);
      if (bizErr) console.warn("Failed to pause owned businesses on deletion request:", bizErr.message);

      const { error: provErr } = await sb
        .from("providers")
        .update({ owner_enabled: false })
        .eq("user_id", session.user.id);
      if (provErr) console.warn("Failed to pause provider profile on deletion request:", provErr.message);
    }
  },

  /** Cancel a scheduled CUSTOMER deletion during the grace period. */
  async cancelDeletion(): Promise<void> {
    const sb = getSupabase();
    const { data: { session } } = await sb.auth.getSession();
    if (!session || !session.user) throw new Error("Authentication required");

    const { data: pending } = await sb
      .from("profile_deletion_requests")
      .select("id, prev_visibility")
      .eq("user_id", session.user.id)
      .eq("target_type", "CUSTOMER")
      .eq("status", "PENDING")
      .maybeSingle();

    const { error } = await sb
      .from("profile_deletion_requests")
      .delete()
      .eq("user_id", session.user.id)
      .eq("target_type", "CUSTOMER")
      .eq("status", "PENDING");
    throwIfError(error);

    // Restore what was visible when the deletion was scheduled (DEL-5). Requests written before 20260981 carry no
    // snapshot, and fall back to the old behaviour of switching everything back on.
    const prev = ((pending as any)?.prev_visibility ?? null) as PrevVisibility | null;

    const { error: userErr } = await sb
      .from("users")
      .update({ customer_enabled: prev ? prev.customerEnabled : true })
      .eq("id", session.user.id);
    throwIfError(userErr);

    // DEL-1: Re-enable discoverability on owned businesses & providers when deletion is cancelled
    if (prev) {
      for (const [id, wasEnabled] of Object.entries(prev.businesses ?? {})) {
        await sb.from("businesses").update({ owner_enabled: wasEnabled }).eq("id", id).eq("owner_user_id", session.user.id);
      }
      for (const [id, wasEnabled] of Object.entries(prev.providers ?? {})) {
        await sb.from("providers").update({ owner_enabled: wasEnabled }).eq("id", id).eq("user_id", session.user.id);
      }
    } else {
      await sb
        .from("businesses")
        .update({ owner_enabled: true })
        .eq("owner_user_id", session.user.id);

      await sb
        .from("providers")
        .update({ owner_enabled: true })
        .eq("user_id", session.user.id);
    }
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
    const { data, error } = await sb
      .from("profile_deletion_requests")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", requestId)
      .select("user_id")
      .maybeSingle();

    throwIfError(error);

    if (data?.user_id && status === "REJECTED") {
      try {
        await notificationService.send(
          data.user_id,
          "Deletion request declined",
          "STRYT admin didn't approve your account deletion request.",
          "/settings",
          "SYSTEM"
        );
      } catch (err) {
        console.warn("Failed to send deletion-request notification:", err);
      }
    }
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

  /** Everything this account holds, for the "Download my data" export (DEL-3: the export used to carry only the
   *  profile, saved places, bookings and requests — not messages, reviews, deals, payments or emergency contacts,
   *  which data-portability requires). Every read goes through RLS as this user, so a table that returns nothing
   *  simply contributes an empty list. */
  async exportBundle(): Promise<Record<string, unknown>> {
    const sb = getSupabase();
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.user) throw new Error("Authentication required");
    const uid = session.user.id;

    const sets: { key: string; table: string; match: string; select?: string }[] = [
      { key: "appointments", table: "appointments", match: `customer_user_id.eq.${uid}` },
      { key: "queueVisits", table: "queue_tokens", match: `customer_user_id.eq.${uid}` },
      { key: "requests", table: "requests", match: `requester_user_id.eq.${uid}` },
      { key: "proposals", table: "proposals", match: `responder_user_id.eq.${uid}` },
      { key: "agreements", table: "agreements", match: `requester_user_id.eq.${uid},responder_user_id.eq.${uid}` },
      { key: "messages", table: "messages", match: `sender_id.eq.${uid}` },
      { key: "reviewsWritten", table: "ratings", match: `rater_user_id.eq.${uid}` },
      { key: "communityPosts", table: "community_posts", match: `author_user_id.eq.${uid}` },
      { key: "communityComments", table: "post_comments", match: `author_user_id.eq.${uid}` },
      { key: "emergencyContacts", table: "emergency_contacts", match: `user_id.eq.${uid}` },
      { key: "payments", table: "payments", match: `payer_user_id.eq.${uid}` },
      { key: "customPayments", table: "custom_payments", match: `payer_user_id.eq.${uid}` },
      { key: "reportsFiled", table: "reports", match: `reporter_user_id.eq.${uid}` },
      { key: "bugReports", table: "bug_reports", match: `user_id.eq.${uid}` },
    ];

    const results = await Promise.all(
      sets.map(async (s) => {
        const { data } = await sb.from(s.table as any).select(s.select ?? "*").or(s.match).limit(2000);
        return [s.key, data ?? []] as const;
      }),
    );
    return Object.fromEntries(results);
  },
};
