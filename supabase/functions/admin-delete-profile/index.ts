import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

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

    // Verify admin roles in public.users
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
    const isSuperAdmin = roles.includes("super_admin");

    if (!isAdmin) {
      return new Response(JSON.stringify({ ok: false, message: "Forbidden: Admin privileges required" }), { status: 403, headers: CORS });
    }

    const { targetType, targetId, reason, confirmation } = await req.json();

    if (!targetType || !targetId || !reason || !confirmation) {
      return new Response(JSON.stringify({ ok: false, message: "Missing required parameters (targetType, targetId, reason, confirmation)" }), { status: 400, headers: CORS });
    }

    // Deletion targets: CUSTOMER (meaning entire user account), BUSINESS, PROVIDER
    if (targetType === "CUSTOMER") {
      if (!isSuperAdmin) {
        return new Response(JSON.stringify({ ok: false, message: "Forbidden: Only SUPER_ADMIN can delete complete user accounts" }), { status: 403, headers: CORS });
      }

      // Fetch user profile and confirm existence
      const { data: targetUser } = await sb.from("users").select("name").eq("id", targetId).maybeSingle();
      if (!targetUser) {
        return new Response(JSON.stringify({ ok: false, message: "User not found" }), { status: 404, headers: CORS });
      }

      // Validate confirmation matches
      const expectedConf = `DELETE ${targetUser.name}`;
      if (confirmation !== expectedConf) {
        return new Response(JSON.stringify({ ok: false, message: `Invalid confirmation text. Must match exactly: "${expectedConf}"` }), { status: 400, headers: CORS });
      }

      // Verify active agreements & disputes for the user
      const { count: activeAgreements } = await sb.from("agreements")
        .select("*", { count: "exact", head: true })
        .or(`requester_user_id.eq.${targetId},responder_user_id.eq.${targetId}`)
        .not("status", "in", '("COMPLETED","CANCELLED","DISPUTED")');

      if (activeAgreements && activeAgreements > 0) {
        return new Response(JSON.stringify({ ok: false, message: "Cannot delete user: active agreements exist" }), { status: 400, headers: CORS });
      }

      // Check held escrow payments
      const { count: heldPayments } = await sb.from("payments")
        .select("*", { count: "exact", head: true })
        .eq("escrow_status", "HELD")
        .or(`payer_user_id.eq.${targetId},agreement_id.in.(select id from agreements where requester_user_id = '${targetId}' or responder_user_id = '${targetId}')`);

      if (heldPayments && heldPayments > 0) {
        return new Response(JSON.stringify({ ok: false, message: "Cannot delete user: held escrow payments exist" }), { status: 400, headers: CORS });
      }

      // 1. Delete associated business profiles owned by this user
      const { data: ownedBusinesses } = await sb.from("businesses").select("id").eq("owner_user_id", targetId);
      for (const biz of ownedBusinesses || []) {
        await sb.from("catalog_items").delete().eq("business_id", biz.id);
        await sb.from("offers").delete().eq("business_id", biz.id);
        await sb.from("stories").delete().eq("owner_id", biz.id).eq("owner_type", "business");
        await sb.from("businesses").delete().eq("id", biz.id);
      }

      // 2. Delete associated provider profiles owned by this user
      const { data: ownedProviders } = await sb.from("providers").select("id").eq("user_id", targetId);
      for (const prov of ownedProviders || []) {
        await sb.from("portfolio_items").delete().eq("provider_id", prov.id);
        await sb.from("provider_packages").delete().eq("provider_id", prov.id);
        await sb.from("stories").delete().eq("owner_id", prov.id).eq("owner_type", "provider");
        
        // Remove provider KYC docs
        const { data: kycFiles } = await sb.storage.from("uploads").list(`kyc-docs/${prov.id}`);
        if (kycFiles && kycFiles.length > 0) {
          await sb.storage.from("uploads").remove(kycFiles.map(f => `kyc-docs/${prov.id}/${f.name}`));
        }
        await sb.from("providers").delete().eq("id", prov.id);
      }

      // 3. Delete user files from Storage
      const kinds = ["avatar", "story", "request-photo", "business-photo", "kyc-business", "catalog", "kyc-provider", "provider-photo", "portfolio"];
      for (const kind of kinds) {
        const { data: files } = await sb.storage.from("uploads").list(`${targetId}/${kind}`);
        if (files && files.length > 0) {
          await sb.storage.from("uploads").remove(files.map(f => `${targetId}/${kind}/${f.name}`));
        }
      }

      // 4. Anonymize user record
      await sb.from("users").update({
        name: "Deleted User",
        avatar: "",
        phone: "0000000000",
        customer_enabled: false,
        customer_deleted_at: new Date().toISOString(),
      }).eq("id", targetId);

      // 5. Update deletion requests status
      await sb.from("profile_deletion_requests").update({ status: "COMPLETED" }).eq("user_id", targetId).eq("target_type", "CUSTOMER");

      // 6. Delete from Supabase Auth
      const { error: authDeleteErr } = await sb.auth.admin.deleteUser(targetId);
      if (authDeleteErr) {
        console.warn("Could not delete auth identity (might be external provider or missing record):", authDeleteErr.message);
      }

      // 7. Write Audit Log
      await sb.from("admin_action_logs").insert({
        admin_user_id: adminUser.id,
        action: "DELETE_ACCOUNT",
        target_type: "CUSTOMER",
        target_id: targetId,
        reason: reason,
      });

    } else if (targetType === "BUSINESS") {
      const { data: biz } = await sb.from("businesses").select("name, owner_user_id").eq("id", targetId).maybeSingle();
      if (!biz) {
        return new Response(JSON.stringify({ ok: false, message: "Business not found" }), { status: 404, headers: CORS });
      }

      const expectedConf = `DELETE ${biz.name}`;
      if (confirmation !== expectedConf) {
        return new Response(JSON.stringify({ ok: false, message: `Invalid confirmation text. Must match exactly: "${expectedConf}"` }), { status: 400, headers: CORS });
      }

      const ownerId = biz.owner_user_id;

      // Check active agreements & disputes
      const { count: activeAgreements } = await sb.from("agreements")
        .select("*", { count: "exact", head: true })
        .or(`requester_user_id.eq.${ownerId},responder_user_id.eq.${ownerId}`)
        .not("status", "in", '("COMPLETED","CANCELLED","DISPUTED")');

      if (activeAgreements && activeAgreements > 0) {
        return new Response(JSON.stringify({ ok: false, message: "Cannot delete business: active agreements exist" }), { status: 400, headers: CORS });
      }

      // Check held escrow payments
      const { count: heldPayments } = await sb.from("payments")
        .select("*", { count: "exact", head: true })
        .eq("escrow_status", "HELD")
        .or(`payer_user_id.eq.${ownerId},agreement_id.in.(select id from agreements where requester_user_id = '${ownerId}' or responder_user_id = '${ownerId}')`);

      if (heldPayments && heldPayments > 0) {
        return new Response(JSON.stringify({ ok: false, message: "Cannot delete business: held escrow payments exist" }), { status: 400, headers: CORS });
      }

      // Delete storage files
      const kinds = ["business-photo", "kyc-business", "catalog"];
      for (const kind of kinds) {
        const { data: files } = await sb.storage.from("uploads").list(`${ownerId}/${kind}`);
        if (files && files.length > 0) {
          await sb.storage.from("uploads").remove(files.map(f => `${ownerId}/${kind}/${f.name}`));
        }
      }

      // Purge catalog/offers/stories
      await sb.from("catalog_items").delete().eq("business_id", targetId);
      await sb.from("offers").delete().eq("business_id", targetId);
      await sb.from("stories").delete().eq("owner_id", targetId).eq("owner_type", "business");

      // Try deletion or soft-delete fallback
      const { error: delError } = await sb.from("businesses").delete().eq("id", targetId);
      if (delError) {
        await sb.from("businesses").update({
          owner_enabled: false,
          deleted_at: new Date().toISOString(),
          status: "SUSPENDED",
          name: "Deleted Business",
          description: "This business was deleted",
          avatar: "",
          photos: [],
          phone: "0000000000",
        }).eq("id", targetId);
      }

      await sb.from("profile_deletion_requests").update({ status: "COMPLETED" }).eq("target_id", targetId);

      await sb.from("admin_action_logs").insert({
        admin_user_id: adminUser.id,
        action: "DELETE_PROFILE",
        target_type: "BUSINESS",
        target_id: targetId,
        reason: reason,
      });

    } else if (targetType === "PROVIDER") {
      const { data: prov } = await sb.from("providers").select("display_name, user_id").eq("id", targetId).maybeSingle();
      if (!prov) {
        return new Response(JSON.stringify({ ok: false, message: "Provider not found" }), { status: 404, headers: CORS });
      }

      const expectedConf = `DELETE ${prov.display_name}`;
      if (confirmation !== expectedConf) {
        return new Response(JSON.stringify({ ok: false, message: `Invalid confirmation text. Must match exactly: "${expectedConf}"` }), { status: 400, headers: CORS });
      }

      const ownerId = prov.user_id;

      // Check active agreements & disputes
      const { count: activeAgreements } = await sb.from("agreements")
        .select("*", { count: "exact", head: true })
        .or(`requester_user_id.eq.${ownerId},responder_user_id.eq.${ownerId}`)
        .not("status", "in", '("COMPLETED","CANCELLED","DISPUTED")');

      if (activeAgreements && activeAgreements > 0) {
        return new Response(JSON.stringify({ ok: false, message: "Cannot delete provider: active agreements exist" }), { status: 400, headers: CORS });
      }

      // Check held escrow payments
      const { count: heldPayments } = await sb.from("payments")
        .select("*", { count: "exact", head: true })
        .eq("escrow_status", "HELD")
        .or(`payer_user_id.eq.${ownerId},agreement_id.in.(select id from agreements where requester_user_id = '${ownerId}' or responder_user_id = '${ownerId}')`);

      if (heldPayments && heldPayments > 0) {
        return new Response(JSON.stringify({ ok: false, message: "Cannot delete provider: held escrow payments exist" }), { status: 400, headers: CORS });
      }

      // Delete storage files
      const kinds = ["kyc-provider", "provider-photo", "portfolio"];
      for (const kind of kinds) {
        const { data: files } = await sb.storage.from("uploads").list(`${ownerId}/${kind}`);
        if (files && files.length > 0) {
          await sb.storage.from("uploads").remove(files.map(f => `${ownerId}/${kind}/${f.name}`));
        }
      }
      const { data: kycFiles } = await sb.storage.from("uploads").list(`kyc-docs/${targetId}`);
      if (kycFiles && kycFiles.length > 0) {
        await sb.storage.from("uploads").remove(kycFiles.map(f => `kyc-docs/${targetId}/${f.name}`));
      }

      // Purge portfolio/packages/stories
      await sb.from("portfolio_items").delete().eq("provider_id", targetId);
      await sb.from("provider_packages").delete().eq("provider_id", targetId);
      await sb.from("stories").delete().eq("owner_id", targetId).eq("owner_type", "provider");

      // Try deletion or soft-delete fallback
      const { error: delError } = await sb.from("providers").delete().eq("id", targetId);
      if (delError) {
        await sb.from("providers").update({
          owner_enabled: false,
          deleted_at: new Date().toISOString(),
          status: "SUSPENDED",
          display_name: "Deleted Provider",
          avatar: "",
          phone: "0000000000",
        }).eq("id", targetId);
      }

      await sb.from("profile_deletion_requests").update({ status: "COMPLETED" }).eq("target_id", targetId);

      await sb.from("admin_action_logs").insert({
        admin_user_id: adminUser.id,
        action: "DELETE_PROFILE",
        target_type: "PROVIDER",
        target_id: targetId,
        reason: reason,
      });

    } else {
      return new Response(JSON.stringify({ ok: false, message: "Invalid targetType" }), { status: 400, headers: CORS });
    }

    return new Response(JSON.stringify({ ok: true }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, message: String(e) }), { status: 500, headers: CORS });
  }
});
