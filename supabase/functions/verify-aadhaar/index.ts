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

    const body = await req.json();
    const { step, providerId } = body;
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const headers = { "Authorization": `Bearer ${SUREPASS_TOKEN}`, "Content-Type": "application/json" };

    if (step === "otp") {
      const r = await fetch("https://kyc-api.surepass.io/api/v1/aadhaar-v2/generate-otp", {
        method: "POST", headers,
        body: JSON.stringify({ id_number: body.aadhaarNumber }),
      });
      const j = await r.json();
      if (j.status_code !== 200) return new Response(JSON.stringify({ ok: false, message: "Couldn't send OTP. Check Aadhaar number." }), { headers: { ...CORS, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ ok: true, clientId: j.data.client_id }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    if (step === "verify") {
      const r = await fetch("https://kyc-api.surepass.io/api/v1/aadhaar-v2/submit-otp", {
        method: "POST", headers,
        body: JSON.stringify({ client_id: body.clientId, otp: body.otp }),
      });
      const j = await r.json();
      if (j.status_code !== 200) return new Response(JSON.stringify({ ok: false, message: "Invalid OTP" }), { headers: { ...CORS, "Content-Type": "application/json" } });

      const fullName = j.data.full_name;
      await sb.from("provider_verifications").upsert({
        provider_id: providerId, type: "AADHAAR", status: "VERIFIED",
        verified_name: fullName, verified_dob: j.data.dob, api_response: j,
      }, { onConflict: "provider_id,type" });

      await sb.from("providers").update({ verification_tier: "AADHAAR_VERIFIED" }).eq("id", providerId);

      return new Response(JSON.stringify({ ok: true, name: fullName }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: false, message: "Unknown step" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, message: String(e) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
