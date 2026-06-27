import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  
  try {
    const SMTP_USER = Deno.env.get("SMTP_USER") || "stryt.assistance@gmail.com";
    const SMTP_PASS = Deno.env.get("SMTP_PASS");

    if (!SMTP_PASS) {
      return new Response(
        JSON.stringify({ ok: false, message: "Email credentials not configured on server yet. Please add SMTP_PASS." }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const { category, email, subject, message } = await req.json();

    const client = new SmtpClient();
    await client.connectTLS({
      hostname: "smtp.gmail.com",
      port: 465,
      username: SMTP_USER,
      password: SMTP_PASS,
    });

    await client.send({
      from: SMTP_USER,
      to: "zetax.business@gmail.com",
      subject: `[STRYT SUPPORT - ${category}] ${subject}`,
      content: `You have received a new support ticket / complaint from the STRYT app:

User Reply-To: ${email}
Category: ${category}
Subject: ${subject}

Message:
----------------------------------------
${message}
----------------------------------------
`,
    });

    await client.close();

    return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, message: String(e) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
