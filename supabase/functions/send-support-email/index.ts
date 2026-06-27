import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import nodemailer from "npm:nodemailer@6.9.10";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  
  try {
    if (!SMTP_PASS) {
      return new Response(
        JSON.stringify({ ok: false, message: "Email credentials not configured on server yet. Please add SMTP_PASS." }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const { category, email, subject, message } = await req.json();

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
<div style="font-family: Arial, sans-serif; background-color: #f3e8ff; padding: 20px; color: #1a0a2e; min-height: 100%;">
  <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(109, 40, 217, 0.08); border: 1px solid #ede9fe; margin: 0 auto;">
    <!-- HEADER -->
    <tr>
      <td bgcolor="#7c3aed" style="padding: 24px; text-align: center; background: linear-gradient(135deg, #8b47f5, #7c3aed);">
        <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: bold; letter-spacing: 0.5px;">STRYT App Support</h1>
      </td>
    </tr>
    <!-- CONTENT -->
    <tr>
      <td style="padding: 24px;">
        <!-- INFO TABLE -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #faf8ff; border: 1px solid #e8dff5; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
          <tr>
            <td style="padding: 6px 0; font-size: 13px; font-weight: bold; color: #6b4188; width: 120px;">Category:</td>
            <td style="padding: 6px 0; font-size: 14px; font-weight: bold; color: #1a0a2e;">
              <span style="background-color: ${category === 'COMPLAINT' ? '#fee2e2' : '#ffe9d6'}; color: ${category === 'COMPLAINT' ? '#dc2626' : '#e07800'}; padding: 3px 10px; border-radius: 999px; font-size: 11px; text-transform: uppercase;">${category}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-size: 13px; font-weight: bold; color: #6b4188; border-top: 1px solid #f4f0fb;">User Reply-To:</td>
            <td style="padding: 6px 0; font-size: 14px; font-weight: bold; color: #7c3aed; border-top: 1px solid #f4f0fb;">
              <a href="mailto:${email}" style="color: #7c3aed; text-decoration: none;">${email}</a>
            </td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-size: 13px; font-weight: bold; color: #6b4188; border-top: 1px solid #f4f0fb;">Subject:</td>
            <td style="padding: 6px 0; font-size: 14px; font-weight: bold; color: #1a0a2e; border-top: 1px solid #f4f0fb;">${subject}</td>
          </tr>
        </table>

        <!-- MESSAGE -->
        <h3 style="color: #472367; font-size: 15px; font-weight: bold; margin: 0 0 10px 0;">Customer Message:</h3>
        <div style="background-color: #faf8ff; border-left: 4px solid #7c3aed; padding: 16px; font-size: 15px; line-height: 1.6; color: #2d1548; white-space: pre-wrap; border-radius: 0 8px 8px 0;">${message}</div>
      </td>
    </tr>
    <!-- FOOTER -->
    <tr>
      <td bgcolor="#faf8ff" style="padding: 16px; text-align: center; font-size: 11px; color: #b89fc7; border-top: 1px solid #f4f0fb;">
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
