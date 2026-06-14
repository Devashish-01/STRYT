import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const SUREPASS_TOKEN = Deno.env.get("SUREPASS_TOKEN");
    if (!SUREPASS_TOKEN) {
      return new Response(
        JSON.stringify({ ok: false, message: "KYC verification is not configured yet. Add SUREPASS_TOKEN to enable." }),
        { headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const { providerId, panNumber } = await req.json();
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const sureRes = await fetch("https://kyc-api.surepass.io/api/v1/pan/pan", {
      method: "POST",
      headers: { "Authorization": `Bearer ${Deno.env.get("SUREPASS_TOKEN")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id_number: panNumber }),
    });
    const sureJson = await sureRes.json();

    if (sureJson.status_code !== 200 || sureJson.data?.status !== "VALID") {
      return new Response(JSON.stringify({ ok: false, message: "PAN not found or invalid" }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const fullName = sureJson.data.full_name;
    await sb.from("provider_verifications").upsert({
      provider_id: providerId, type: "PAN", status: "VERIFIED",
      verified_name: fullName, api_response: sureJson,
    }, { onConflict: "provider_id,type" });

    await sb.from("providers").update({ verification_tier: "PAN_VERIFIED" })
      .eq("id", providerId).in("verification_tier", ["NONE", "DOCS_SUBMITTED"]);

    return new Response(JSON.stringify({ ok: true, name: fullName }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, message: String(e) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
