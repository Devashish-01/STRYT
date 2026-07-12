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
    const { data: { user }, error: authError } = await sb.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ ok: false, message: "Invalid or expired token" }), { status: 401, headers: CORS });
    }

    const uid = user.id;
    const { targetType, targetId, enabled } = await req.json();

    if (enabled === undefined) {
      return new Response(JSON.stringify({ ok: false, message: "Missing enabled value" }), { status: 400, headers: CORS });
    }

    if (targetType === "CUSTOMER") {
      const { error } = await sb
        .from("users")
        .update({ customer_enabled: enabled })
        .eq("id", uid);
      if (error) throw error;

    } else if (targetType === "BUSINESS") {
      if (!targetId) {
        return new Response(JSON.stringify({ ok: false, message: "Missing targetId" }), { status: 400, headers: CORS });
      }
      
      const { data: biz, error: fetchErr } = await sb
        .from("businesses")
        .select("owner_user_id")
        .eq("id", targetId)
        .maybeSingle();

      if (fetchErr) throw fetchErr;
      if (!biz) {
        return new Response(JSON.stringify({ ok: false, message: "Business not found" }), { status: 404, headers: CORS });
      }

      if (biz.owner_user_id !== uid) {
        return new Response(JSON.stringify({ ok: false, message: "Forbidden: You do not own this business" }), { status: 403, headers: CORS });
      }

      const { error } = await sb
        .from("businesses")
        .update({ 
          owner_enabled: enabled,
          disabled_at: enabled ? null : new Date().toISOString()
        })
        .eq("id", targetId);
      if (error) throw error;

    } else if (targetType === "PROVIDER") {
      if (!targetId) {
        return new Response(JSON.stringify({ ok: false, message: "Missing targetId" }), { status: 400, headers: CORS });
      }

      const { data: prov, error: fetchErr } = await sb
        .from("providers")
        .select("user_id")
        .eq("id", targetId)
        .maybeSingle();

      if (fetchErr) throw fetchErr;
      if (!prov) {
        return new Response(JSON.stringify({ ok: false, message: "Provider profile not found" }), { status: 404, headers: CORS });
      }

      if (prov.user_id !== uid) {
        return new Response(JSON.stringify({ ok: false, message: "Forbidden: You do not own this provider profile" }), { status: 403, headers: CORS });
      }

      const { error } = await sb
        .from("providers")
        .update({ 
          owner_enabled: enabled,
          disabled_at: enabled ? null : new Date().toISOString()
        })
        .eq("id", targetId);
      if (error) throw error;

    } else {
      return new Response(JSON.stringify({ ok: false, message: "Invalid targetType" }), { status: 400, headers: CORS });
    }

    return new Response(JSON.stringify({ ok: true }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, message: String(e) }), { status: 500, headers: CORS });
  }
});
