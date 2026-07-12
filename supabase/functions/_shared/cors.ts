// Shared CORS allowlist for STRYT Edge Functions. Reflects only known app
// origins — never "*". Extracted from the pattern first used in
// verification-review/index.ts (Security Audit M-3).
//
// A wildcard is lower-risk here than the classic case (auth is a Bearer
// token, not a cookie — no Access-Control-Allow-Credentials, so a malicious
// site can't silently ride a victim's session) but it still lets any origin
// invoke a function with a stolen/phished token. Allowlisting closes that.
const ALLOWED_ORIGINS = new Set([
  "https://stryt.in",
  "https://www.stryt.in",
  "https://localhost", // Capacitor Android/iOS WebView (androidScheme: 'https')
  "http://localhost:5173", // Vite dev
  "http://localhost:4173", // Vite preview
]);

export function corsHeaders(req: Request, extraHeaders = "authorization, x-client-info, apikey, content-type"): Record<string, string> {
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
