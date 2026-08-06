/**
 * purge-deleted-accounts
 *
 * Completes self-serve account deletion after the 30-day grace period.
 *
 * Auth modes (verify_jwt = false — see isServiceCaller() below for why):
 *  1. User session JWT — purges the caller's own account if their PENDING
 *                 CUSTOMER deletion request is past the 30-day grace period.
 *                 Verified directly via sb.auth.getUser(), independent of the
 *                 gateway setting.
 *  2. The project's secret API key — purges every expired PENDING CUSTOMER
 *                 request (the daily cron / scheduled function).
 *
 * Play / App Store User Data policy: deletion must complete without an
 * administrator approving the request. Admins may still force-delete early
 * via admin-delete-profile.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * The project's secret API key, for the RLS-bypassing admin client.
 *
 * Reads the new `SUPABASE_SECRET_KEYS` map the platform injects (our key is
 * named "default") instead of the legacy `SUPABASE_SERVICE_ROLE_KEY`. The
 * legacy service_role JWT is being retired because its value leaked in this
 * repo's git history, and it will be disabled in Settings -> API Keys.
 *
 * Falls back to the legacy variable so this deploys safely BEFORE the legacy
 * key is switched off, and keeps working if it is ever re-enabled.
 */
function secretKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (keys?.default) return keys.default as string;
  } catch { /* malformed or absent -- fall through to the legacy key */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}


const GRACE_MS = 30 * 24 * 60 * 60 * 1000;

const ALLOWED_ORIGINS = new Set([
  "https://stryt.in",
  "https://www.stryt.in",
  "https://localhost",
  "http://localhost:5173",
  "http://localhost:4173",
]);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://stryt.in";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}

/**
 * True when the request is the daily cron calling with the project's secret
 * API key — checked by exact string comparison, never by decoding a JWT
 * claim. `verify_jwt` is false for this function (secret keys aren't JWTs),
 * so nothing upstream has verified anything by the time this runs: trusting a
 * self-decoded `role` claim the way the old JWT-based check did would let
 * anyone who can craft a token body claim service_role and purge every
 * expired account. A secret is either the right secret or it isn't — no
 * decoding involved. Checks `apikey` first (where Supabase's own docs say
 * secret keys belong) and Authorization: Bearer as a fallback, so the caller
 * doesn't have to get the header exactly right.
 */
function isServiceCaller(req: Request): boolean {
  const expected = secretKey();
  if (!expected) return false;
  const apikey = req.headers.get("apikey") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  return apikey === expected || bearer === expected;
}

async function releaseHeldPaymentsForDeletion(sb: SupabaseClient, userId: string): Promise<void> {
  // After the grace period the user explicitly chose deletion — unblock purge by
  // marking any stale HELD rows as refunded rather than leaving the account stuck.
  await sb
    .from("payments")
    .update({ escrow_status: "REFUNDED" })
    .eq("escrow_status", "HELD")
    .eq("payer_user_id", userId);
}

async function canPurgeUser(sb: SupabaseClient, userId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const { count: activeAgreements } = await sb
    .from("agreements")
    .select("*", { count: "exact", head: true })
    .or(`requester_user_id.eq.${userId},responder_user_id.eq.${userId}`)
    .not("status", "in", '("COMPLETED","CANCELLED","DISPUTED")');

  if (activeAgreements && activeAgreements > 0) {
    return { ok: false, message: "Cannot delete account: active agreements still exist. Resolve them first." };
  }

  const { count: heldPayments } = await sb
    .from("payments")
    .select("*", { count: "exact", head: true })
    .eq("escrow_status", "HELD")
    .eq("payer_user_id", userId);

  if (heldPayments && heldPayments > 0) {
    return { ok: false, message: "Cannot delete account: held payment records still exist." };
  }

  return { ok: true };
}

async function purgeCustomerAccount(
  sb: SupabaseClient,
  targetId: string,
  reason: string,
  actorUserId: string | null,
): Promise<void> {
  const { data: ownedBusinesses } = await sb.from("businesses").select("id").eq("owner_user_id", targetId);
  for (const biz of ownedBusinesses || []) {
    await sb.from("catalog_items").delete().eq("business_id", biz.id);
    await sb.from("offers").delete().eq("business_id", biz.id);
    await sb.from("stories").delete().eq("owner_id", biz.id).eq("owner_type", "business");
    await sb.from("businesses").delete().eq("id", biz.id);
  }

  const { data: ownedProviders } = await sb.from("providers").select("id").eq("user_id", targetId);
  for (const prov of ownedProviders || []) {
    await sb.from("portfolio_items").delete().eq("provider_id", prov.id);
    await sb.from("provider_packages").delete().eq("provider_id", prov.id);
    await sb.from("stories").delete().eq("owner_id", prov.id).eq("owner_type", "provider");

    const { data: kycFiles } = await sb.storage.from("uploads").list(`kyc-docs/${prov.id}`);
    if (kycFiles && kycFiles.length > 0) {
      await sb.storage.from("uploads").remove(kycFiles.map((f) => `kyc-docs/${prov.id}/${f.name}`));
    }
    await sb.from("providers").delete().eq("id", prov.id);
  }

  const kinds = [
    "avatar", "story", "request-photo", "business-photo", "kyc-business",
    "catalog", "kyc-provider", "provider-photo", "portfolio",
  ];
  for (const kind of kinds) {
    const { data: files } = await sb.storage.from("uploads").list(`${targetId}/${kind}`);
    if (files && files.length > 0) {
      await sb.storage.from("uploads").remove(files.map((f) => `${targetId}/${kind}/${f.name}`));
    }
  }

  await sb.from("users").update({
    name: "Deleted User",
    avatar: "",
    phone: "0000000000",
    email: null,
    customer_enabled: false,
    customer_deleted_at: new Date().toISOString(),
  }).eq("id", targetId);

  await sb
    .from("profile_deletion_requests")
    .update({ status: "COMPLETED", updated_at: new Date().toISOString() })
    .eq("user_id", targetId)
    .eq("target_type", "CUSTOMER")
    .in("status", ["PENDING", "APPROVED", "REVIEWING"]);

  const { error: authDeleteErr } = await sb.auth.admin.deleteUser(targetId);
  if (authDeleteErr) {
    console.warn("Could not delete auth identity:", authDeleteErr.message);
  }

  // admin_user_id is NOT NULL — for cron use a stable system actor id.
  await sb.from("admin_action_logs").insert({
    admin_user_id: actorUserId || "system:purge-deleted-accounts",
    action: "SELF_SERVE_DELETE_ACCOUNT",
    target_type: "CUSTOMER",
    target_id: targetId,
    reason,
  });
}

serve(async (req) => {
  const CORS = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // Cron/service calls are identified by holding the project's own secret
    // key (checked in isServiceCaller — exact match, no decoding). Everyone
    // else must present a real session token for the self-serve path below,
    // which sb.auth.getUser() verifies for real.
    const isCronCaller = isServiceCaller(req);

    const authHeader = req.headers.get("Authorization");
    if (!isCronCaller && !authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ ok: false, message: "Missing authorization header" }), {
        status: 401,
        headers: CORS,
      });
    }
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      secretKey(),
    );

    if (req.method === "POST") {
      // Body is optional; drain so proxies don't hang.
      await req.json().catch(() => ({}));
    }
    const now = Date.now();

    if (isCronCaller) {
      const cutoff = new Date(now - GRACE_MS).toISOString();
      const { data: expired, error } = await sb
        .from("profile_deletion_requests")
        .select("id, user_id, reason, created_at")
        .eq("target_type", "CUSTOMER")
        .eq("status", "PENDING")
        .lte("created_at", cutoff);

      if (error) throw error;

      const results: { userId: string; status: string; message?: string }[] = [];
      for (const row of expired || []) {
        const gate = await canPurgeUser(sb, row.user_id);
        if (!gate.ok) {
          await releaseHeldPaymentsForDeletion(sb, row.user_id);
          const retry = await canPurgeUser(sb, row.user_id);
          if (!retry.ok) {
            results.push({ userId: row.user_id, status: "skipped", message: retry.message });
            continue;
          }
        }
        try {
          await purgeCustomerAccount(
            sb,
            row.user_id,
            row.reason || "Auto-purge after 30-day grace period",
            null,
          );
          results.push({ userId: row.user_id, status: "purged" });
        } catch (e) {
          results.push({
            userId: row.user_id,
            status: "error",
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }

      return new Response(JSON.stringify({ ok: true, mode: "cron", purged: results.filter((r) => r.status === "purged").length, results }), {
        headers: CORS,
      });
    }

    // Authenticated user — self-serve purge of own account after grace.
    const { data: { user }, error: authError } = await sb.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ ok: false, message: "Invalid or expired token" }), {
        status: 401,
        headers: CORS,
      });
    }

    const { data: delReq, error: delErr } = await sb
      .from("profile_deletion_requests")
      .select("id, reason, created_at, status")
      .eq("user_id", user.id)
      .eq("target_type", "CUSTOMER")
      .eq("status", "PENDING")
      .maybeSingle();

    if (delErr) throw delErr;
    if (!delReq) {
      return new Response(JSON.stringify({ ok: false, message: "No scheduled account deletion found." }), {
        status: 400,
        headers: CORS,
      });
    }

    const eligibleAt = new Date(delReq.created_at).getTime() + GRACE_MS;
    if (now < eligibleAt) {
      return new Response(JSON.stringify({
        ok: false,
        message: "Grace period still active. You can keep your account, or wait until the scheduled purge date.",
        eligibleAt: new Date(eligibleAt).toISOString(),
      }), { status: 400, headers: CORS });
    }

    const gate = await canPurgeUser(sb, user.id);
    if (!gate.ok) {
      await releaseHeldPaymentsForDeletion(sb, user.id);
      const retry = await canPurgeUser(sb, user.id);
      if (!retry.ok) {
        return new Response(JSON.stringify({ ok: false, message: retry.message }), {
          status: 400,
          headers: CORS,
        });
      }
    }

    await purgeCustomerAccount(
      sb,
      user.id,
      delReq.reason || "Self-serve deletion after grace period",
      user.id,
    );

    return new Response(JSON.stringify({ ok: true, mode: "self", purged: 1 }), { headers: CORS });
  } catch (err) {
    console.error("purge-deleted-accounts error:", err);
    return new Response(JSON.stringify({
      ok: false,
      message: err instanceof Error ? err.message : "Purge failed",
    }), { status: 500, headers: CORS });
  }
});
