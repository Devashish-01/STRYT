// STRYT — verification-review Edge Function
//
// The ONLY path by which a business/provider's verification_status can move
// to APPROVED/REJECTED, or is_verified can flip true — enforced independently
// at the DB layer too (see supabase/migrations/20260815_manual_verification.sql's
// enforce_manual_verification_decision trigger, which rejects the write from
// any non-service_role caller). Manual review only: no auto-approval, no
// third-party KYC — a human admin looks at the documents and decides.
//
// Actions (single POST function, modeled on admin-delete-profile):
//   { action: 'list' }
//     -> pending queue: businesses + providers with verification_status='UNDER_REVIEW'
//   { action: 'view', targetType, targetId }
//     -> short-lived signed URLs for that entity's submitted documents
//   { action: 'decide', targetType, targetId, decision: 'APPROVE'|'REJECT'|'SUSPEND', reason? }
//     -> writes the decision, stamps reviewer + timestamp, audit-logs it.
//        DB triggers then sync is_verified and notify the owner.
//
// Auto-injected secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// CORS allowlist — reflects only known app origins, never "*" (Security
// Audit M-3). Inlined (not a shared import) so this function deploys
// standalone via the Supabase dashboard.
const ALLOWED_ORIGINS = new Set([
  "https://stryt.in",
  "https://www.stryt.in",
  "https://localhost", // Capacitor Android/iOS WebView (androidScheme: 'https')
  "http://localhost:5173", // Vite dev
  "http://localhost:4173", // Vite preview
]);

function corsHeaders(req: Request, extraHeaders = "authorization, x-client-info, apikey, content-type"): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://stryt.in";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": extraHeaders,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
}

const TABLE: Record<string, string> = { BUSINESS: "businesses", PROVIDER: "providers" };
const OWNER_COL: Record<string, string> = { BUSINESS: "owner_user_id", PROVIDER: "user_id" };
const NAME_COL: Record<string, string> = { BUSINESS: "name", PROVIDER: "display_name" };

serve(async (req) => {
  const CORS = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, message: "Missing authorization header" }), { status: 401, headers: CORS });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: adminUser }, error: authError } = await sb.auth.getUser(token);
    if (authError || !adminUser) {
      return new Response(JSON.stringify({ ok: false, message: "Invalid or expired token" }), { status: 401, headers: CORS });
    }

    // Verify admin roles in public.users — same gate as admin-delete-profile.
    const { data: dbAdmin, error: adminFetchErr } = await sb
      .from("users")
      .select("roles")
      .eq("id", adminUser.id)
      .maybeSingle();

    if (adminFetchErr || !dbAdmin) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized: Admin profile not found" }), { status: 403, headers: CORS });
    }

    const roles = dbAdmin.roles || [];
    const isAdmin = roles.includes("admin") || roles.includes("super_admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ ok: false, message: "Forbidden: Admin privileges required" }), { status: 403, headers: CORS });
    }

    const body = await req.json();
    const { action } = body;

    // ── list: the pending review queue ──────────────────────────────────
    if (action === "list") {
      const [bizRes, provRes] = await Promise.all([
        sb.from("businesses")
          .select("id, name, owner_user_id, verification_documents, verification_document_url, created_at")
          .eq("verification_status", "UNDER_REVIEW")
          .order("created_at", { ascending: true }),
        sb.from("providers")
          .select("id, display_name, user_id, verification_documents, verification_document_url, created_at")
          .eq("verification_status", "UNDER_REVIEW")
          .order("created_at", { ascending: true }),
      ]);
      if (bizRes.error) throw bizRes.error;
      if (provRes.error) throw provRes.error;

      const ownerIds = [
        ...(bizRes.data ?? []).map((b: any) => b.owner_user_id),
        ...(provRes.data ?? []).map((p: any) => p.user_id),
      ].filter(Boolean);

      const { data: owners } = ownerIds.length
        ? await sb.from("users").select("id, name").in("id", ownerIds)
        : { data: [] as { id: string; name: string }[] };
      const ownerName = (id: string) => owners?.find((o) => o.id === id)?.name ?? "Unknown";
      const docCount = (row: any) => (row.verification_documents?.length ?? 0) || (row.verification_document_url ? 1 : 0);

      const items = [
        ...(bizRes.data ?? []).map((b: any) => ({
          targetType: "BUSINESS", targetId: b.id, name: b.name,
          ownerName: ownerName(b.owner_user_id), documentCount: docCount(b), submittedAt: b.created_at,
        })),
        ...(provRes.data ?? []).map((p: any) => ({
          targetType: "PROVIDER", targetId: p.id, name: p.display_name,
          ownerName: ownerName(p.user_id), documentCount: docCount(p), submittedAt: p.created_at,
        })),
      ];

      return new Response(JSON.stringify({ ok: true, items }), { headers: CORS });
    }

    // ── view: signed URLs for one entity's documents ────────────────────
    if (action === "view") {
      const { targetType, targetId } = body;
      const table = TABLE[targetType];
      if (!table) {
        return new Response(JSON.stringify({ ok: false, message: "Invalid targetType" }), { status: 400, headers: CORS });
      }

      const { data: row, error } = await sb
        .from(table)
        .select("verification_documents, verification_document_url")
        .eq("id", targetId)
        .maybeSingle();
      if (error || !row) {
        return new Response(JSON.stringify({ ok: false, message: "Not found" }), { status: 404, headers: CORS });
      }

      const paths: string[] = row.verification_documents?.length
        ? row.verification_documents
        : (row.verification_document_url ? [row.verification_document_url] : []);

      const urls = (await Promise.all(
        paths.map(async (p) => {
          const { data, error: signErr } = await sb.storage.from("verification-docs").createSignedUrl(p, 300);
          if (signErr) return null;
          return data?.signedUrl ?? null;
        })
      )).filter((u): u is string => !!u);

      return new Response(JSON.stringify({ ok: true, urls }), { headers: CORS });
    }

    // ── decide: the actual review decision ──────────────────────────────
    if (action === "decide") {
      const { targetType, targetId, decision, reason } = body;
      const table = TABLE[targetType];
      if (!table) {
        return new Response(JSON.stringify({ ok: false, message: "Invalid targetType" }), { status: 400, headers: CORS });
      }
      if (!["APPROVE", "REJECT", "SUSPEND"].includes(decision)) {
        return new Response(JSON.stringify({ ok: false, message: "Invalid decision" }), { status: 400, headers: CORS });
      }
      if ((decision === "REJECT" || decision === "SUSPEND") && !reason?.trim()) {
        return new Response(JSON.stringify({ ok: false, message: "A reason is required" }), { status: 400, headers: CORS });
      }

      const { data: entity, error: fetchErr } = await sb
        .from(table)
        .select(`id, ${OWNER_COL[targetType]}, ${NAME_COL[targetType]}`)
        .eq("id", targetId)
        .maybeSingle();
      if (fetchErr || !entity) {
        return new Response(JSON.stringify({ ok: false, message: "Not found" }), { status: 404, headers: CORS });
      }

      const patch: Record<string, unknown> = {
        verification_reviewed_at: new Date().toISOString(),
        verification_reviewed_by: adminUser.id,
      };
      let logAction = "";

      if (decision === "APPROVE") {
        patch.verification_status = "APPROVED";
        patch.verification_reason = null;
        logAction = "VERIFY_APPROVE";
      } else if (decision === "REJECT") {
        patch.verification_status = "REJECTED";
        patch.verification_reason = reason.trim();
        logAction = "VERIFY_REJECT";
      } else {
        // SUSPEND — forged/fraudulent documents or false info: suspend the
        // whole listing (not just the verification badge) and close out the
        // review as rejected so it drops out of the pending queue.
        patch.status = "SUSPENDED";
        patch.verification_status = "REJECTED";
        patch.verification_reason = reason.trim();
        logAction = "VERIFY_SUSPEND";
      }

      const { error: updateErr } = await sb.from(table).update(patch).eq("id", targetId);
      if (updateErr) throw updateErr;

      await sb.from("admin_action_logs").insert({
        admin_user_id: adminUser.id,
        action: logAction,
        target_type: targetType,
        target_id: targetId,
        reason: reason?.trim() || "Approved",
      });

      return new Response(JSON.stringify({ ok: true }), { headers: CORS });
    }

    return new Response(JSON.stringify({ ok: false, message: "Unknown action" }), { status: 400, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, message: String(e) }), { status: 500, headers: CORS });
  }
});
