import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.10";
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

const SMTP_USER = Deno.env.get("SMTP_USER") || "stryt.assistance@gmail.com";
const SMTP_PASS = Deno.env.get("SMTP_PASS");

// Initialize transporter globally once per container instance
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

// Must match the <select> options in src/screens/Support.tsx exactly.
const ALLOWED_CATEGORIES = new Set(["COMPLAINT", "INQUIRY", "ACCOUNT", "BUSINESS", "SUGGESTION"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SUBJECT = 200;
const MAX_MESSAGE = 5000;

// category/email/subject/message all land inside an HTML email body below —
// escape so a crafted ticket can't inject markup/links into what support
// staff open (Security Audit M-5).
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

serve(async (req) => {
  const CORS = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // In-handler auth — this is a real mailer with a live SMTP credential,
    // not a public endpoint. supportService.ts already sends the session
    // Bearer token; this just stops anyone bypassing the app and calling
    // the function directly to relay arbitrary mail.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, message: "Missing authorization header" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user }, error: authError } = await sb.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ ok: false, message: "Invalid or expired token" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    if (!SMTP_PASS) {
      return new Response(
        JSON.stringify({ ok: false, message: "Email credentials not configured on server yet. Please add SMTP_PASS." }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const category = typeof body.category === "string" ? body.category : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!ALLOWED_CATEGORIES.has(category)) {
      return new Response(JSON.stringify({ ok: false, message: "Invalid category" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    if (!EMAIL_RE.test(email)) {
      return new Response(JSON.stringify({ ok: false, message: "Invalid email address" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    if (!subject || subject.length > MAX_SUBJECT) {
      return new Response(JSON.stringify({ ok: false, message: `Subject must be 1-${MAX_SUBJECT} characters` }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    if (!message || message.length > MAX_MESSAGE) {
      return new Response(JSON.stringify({ ok: false, message: `Message must be 1-${MAX_MESSAGE} characters` }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const safeCategory = escapeHtml(category);
    const safeEmail = escapeHtml(email);
    const safeSubject = escapeHtml(subject);
    const safeMessage = escapeHtml(message);

    await transporter.sendMail({
      from: SMTP_USER,
      to: "stryt.assistance@gmail.com",
      subject: `[STRYT SUPPORT - ${category}] ${subject}`,
      text: `You have received a new support ticket / complaint from the STRYT app:

User Reply-To: ${email}
Category: ${category}
Subject: ${subject}

Message:
----------------------------------------
${message}
----------------------------------------
`,
      html: `
<div style="font-family: Arial, sans-serif; background-color: #dbe4e6; padding: 20px; color: #1a1530; min-height: 100%;">
  <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(30, 47, 52, 0.08); border: 1px solid #e2eaec; margin: 0 auto;">
    <!-- HEADER -->
    <tr>
      <td bgcolor="#263c42" style="padding: 24px; text-align: center; background: linear-gradient(135deg, #2e484f, #263c42);">
        <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: bold; letter-spacing: 0.5px;">STRYT App Support</h1>
      </td>
    </tr>
    <!-- CONTENT -->
    <tr>
      <td style="padding: 24px;">
        <!-- INFO TABLE -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f0f4f5; border: 1px solid #e8e1f0; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
          <tr>
            <td style="padding: 6px 0; font-size: 13px; font-weight: bold; color: #655583; width: 120px;">Category:</td>
            <td style="padding: 6px 0; font-size: 14px; font-weight: bold; color: #1a1530;">
              <span style="background-color: ${category === 'COMPLAINT' ? '#fee2e2' : '#ffe9d6'}; color: ${category === 'COMPLAINT' ? '#dc2626' : '#e07800'}; padding: 3px 10px; border-radius: 999px; font-size: 11px; text-transform: uppercase;">${safeCategory}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-size: 13px; font-weight: bold; color: #655583; border-top: 1px solid #f5f1fa;">User Reply-To:</td>
            <td style="padding: 6px 0; font-size: 14px; font-weight: bold; color: #2e484f; border-top: 1px solid #f5f1fa;">
              <a href="mailto:${safeEmail}" style="color: #2e484f; text-decoration: none;">${safeEmail}</a>
            </td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-size: 13px; font-weight: bold; color: #655583; border-top: 1px solid #f5f1fa;">Subject:</td>
            <td style="padding: 6px 0; font-size: 14px; font-weight: bold; color: #1a1530; border-top: 1px solid #f5f1fa;">${safeSubject}</td>
          </tr>
        </table>

        <!-- MESSAGE -->
        <h3 style="color: #453a68; font-size: 15px; font-weight: bold; margin: 0 0 10px 0;">Customer Message:</h3>
        <div style="background-color: #f0f4f5; border-left: 4px solid #2e484f; padding: 16px; font-size: 15px; line-height: 1.6; color: #2c2447; white-space: pre-wrap; border-radius: 0 8px 8px 0;">${safeMessage}</div>
      </td>
    </tr>
    <!-- FOOTER -->
    <tr>
      <td bgcolor="#f0f4f5" style="padding: 16px; text-align: center; font-size: 11px; color: #b0a3c4; border-top: 1px solid #f5f1fa;">
        This is an automated support ticket generated from the STRYT app.
      </td>
    </tr>
  </table>
</div>
      `,
    });

    return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, message: String(e) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
