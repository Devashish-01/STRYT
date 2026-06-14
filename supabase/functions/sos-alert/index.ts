import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
        status: 405,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const {
      agreementId,
      triggeredByUserId,
      providerUserId,
      lat,
      lng,
      emergencyContact,
      emergencyContactName,
    } = await req.json();

    if (!agreementId) {
      return new Response(JSON.stringify({ ok: false, error: "Missing agreementId" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Resolve user IDs from agreement if not provided or empty
    let finalTriggeredBy = triggeredByUserId || null;
    let finalProvider = providerUserId || null;

    if (!finalTriggeredBy || !finalProvider) {
      const { data: ag, error: agError } = await sb
        .from("agreements")
        .select("requester_user_id, responder_user_id")
        .eq("id", agreementId)
        .maybeSingle();

      if (agError) {
        console.error("Error fetching agreement details:", agError);
      } else if (ag) {
        if (!finalTriggeredBy) finalTriggeredBy = ag.requester_user_id;
        if (!finalProvider) finalProvider = ag.responder_user_id;
      }
    }

    // Insert SOS alert row
    const { data: alert, error: insertError } = await sb.from("sos_alerts").insert({
      agreement_id: agreementId,
      triggered_by_user_id: finalTriggeredBy,
      provider_user_id: finalProvider,
      lat: lat ? Number(lat) : null,
      lng: lng ? Number(lng) : null,
      emergency_contact: emergencyContact || null,
      emergency_contact_name: emergencyContactName || null,
    }).select("id").maybeSingle();

    if (insertError) {
      console.error("Database insert error:", insertError);
      return new Response(JSON.stringify({ ok: false, error: `Database insert failed: ${insertError.message}` }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Send SMS via MSG91
    let smsSent = false;
    if (emergencyContact) {
      try {
        // Sanitize the phone number: remove all non-digit characters
        const digits = emergencyContact.replace(/\D/g, "");
        // MSG91 expects the number in international format without leading + or 0s.
        // For India, a 10-digit number should be prefixed with '91'.
        // If it already has 12 digits and starts with '91', use it as-is.
        let formattedMobile = digits;
        if (digits.length === 10) {
          formattedMobile = "91" + digits;
        } else if (digits.length === 12 && digits.startsWith("91")) {
          formattedMobile = digits;
        } else {
          // If it's a different length (e.g. international format already resolved, or fallback),
          // strip any leading zeroes.
          formattedMobile = digits.replace(/^0+/, "");
        }

        const msg91AuthKey = Deno.env.get("MSG91_AUTH_KEY");
        const msg91TemplateId = Deno.env.get("MSG91_SOS_TEMPLATE_ID");

        if (msg91AuthKey && msg91TemplateId) {
          const smsRes = await fetch("https://api.msg91.com/api/v5/flow/", {
            method: "POST",
            headers: {
              "authkey": msg91AuthKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              template_id: msg91TemplateId,
              short_url: "0",
              recipients: [{
                mobiles: formattedMobile,
                name: emergencyContactName || "Your contact",
                link: lat && lng ? `https://maps.google.com/?q=${lat},${lng}` : "",
              }],
            }),
          });
          if (smsRes.ok) {
            smsSent = true;
          } else {
            const errorText = await smsRes.text();
            console.error("MSG91 API error response:", errorText);
          }
        } else {
          console.warn("MSG91 credentials missing. Skipping SMS sending.");
        }
      } catch (smsError) {
        console.error("MSG91 request failed:", smsError);
      }
    }

    if (alert?.id && smsSent) {
      const { error: updateError } = await sb
        .from("sos_alerts")
        .update({ sms_sent: true })
        .eq("id", alert.id);
      if (updateError) {
        console.error("Failed to update sms_sent status in DB:", updateError);
      }
    }

    return new Response(JSON.stringify({ ok: true, smsSent }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Unexpected edge function error:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
