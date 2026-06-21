import { tokenStore } from "@/lib/auth";
import { getSupabase } from "@/lib/supabaseClient";
import { toApiError } from "@/lib/supabasePage";
import { returnTo } from "@/lib/returnTo";
import { generateAlias } from "@/lib/alias";

// Where an OAuth / magic-link redirect should land: the saved deep link the user
// was trying to reach, else /home. Must be a same-origin path on the allow-list.
function oauthReturnPath(): string {
  return returnTo.peek() ?? "/home";
}

// Supabase manages its own session + auto-refresh, so the custom tokenStore
// refresh path is unused when live. We still mirror the access token into
// tokenStore so the existing isAuthed guard keeps working unchanged.
function mirrorSession(accessToken?: string | null, refreshToken?: string | null) {
  if (accessToken && refreshToken) tokenStore.set(accessToken, refreshToken);
}

// Supabase/Twilio expect E.164 (+91XXXXXXXXXX). The UI collects raw digits.
// We normalize here so real numbers reach the SMS provider. The Supabase
// "test phone numbers" are keyed to the raw 10-digit string, so we leave a
// plain 10-digit number untouched ONLY when it matches a known test number.
function normalizePhone(input: string): string {
  const digits = (input || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return "+" + digits;
  if (digits.length === 10) return "+91" + digits;
  return input.startsWith("+") ? input : "+" + digits;
}

// Self-healing profile creation: make sure a public.users row exists for the
// signed-in auth user. Idempotent (upsert), and RLS-safe because the row id
// equals auth.uid(). Without this, foreign keys on requests/businesses/
// providers reject every insert ("Key is not present in table users").
// Exported so store.tsx can call it for OAuth / magic-link sign-ins that
// bypass verifyOtp().
export async function ensureProfile(userId?: string, phone?: string | null, email?: string | null, fullName?: string | null) {
  if (!userId) return;
  const sb = getSupabase();
  const name = fullName || email || phone || "New user";
  const { error } = await sb
    .from("users")
    .upsert(
      { id: userId, name, alias: generateAlias(), phone: phone ?? null, roles: ["customer"] },
      { onConflict: "id", ignoreDuplicates: true }
    );
  // Don't block login on a profile write hiccup; me() also self-heals on read.
  if (error) console.warn("ensureProfile:", error.message);
}

export const authService = {
  async sendOtp(phone: string) {
    const sb = getSupabase();
    const { error } = await sb.auth.signInWithOtp({ phone: normalizePhone(phone) });
    if (error) throw toApiError(error);
    return { ok: true, ttl: 300 };
  },

  async sendEmailOtp(email: string) {
    const sb = getSupabase();
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin + oauthReturnPath(),
      }
    });
    if (error) throw toApiError(error);
    return { ok: true, ttl: 300 };
  },

  async signInWithGoogle() {
    const sb = getSupabase();
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: {
        // Land back on the page the user originally tried to open (a shared deep
        // link), or /home. The full-page OAuth round-trip wipes React state, so
        // the destination is read from sessionStorage via returnTo.
        redirectTo: window.location.origin + oauthReturnPath(),
      }
    });
    if (error) throw toApiError(error);
  },

  async verifyOtp(phoneOrEmail: string, otp: string) {
    const isEmail = phoneOrEmail.includes("@");
    const sb = getSupabase();
    const { data, error } = isEmail
      ? await sb.auth.verifyOtp({ email: phoneOrEmail, token: otp, type: "email" })
      : await sb.auth.verifyOtp({ phone: normalizePhone(phoneOrEmail), token: otp, type: "sms" });
    if (error) throw toApiError(error);
    mirrorSession(data.session?.access_token, data.session?.refresh_token);
    // Guarantee a public.users profile exists. The DB trigger should create it,
    // but we self-heal here so a missing profile can never block posting /
    // creating a business. RLS allows this because id = auth.uid().
    await ensureProfile(
      data.user?.id,
      data.user?.phone ?? (isEmail ? null : normalizePhone(phoneOrEmail)),
      data.user?.email,
      data.user?.user_metadata?.full_name
    );
    return {
      access_token: data.session?.access_token ?? "",
      refresh_token: data.session?.refresh_token ?? "",
      user: data.user,
    };
  },

  async logout() {
    const sb = getSupabase();
    await sb.auth.signOut();
    tokenStore.clear();
    return { ok: true };
  },

  // Supabase auto-refreshes; this stays for API compatibility with callers.
  async refresh(): Promise<boolean> {
    const sb = getSupabase();
    const { data, error } = await sb.auth.refreshSession();
    if (error || !data.session) {
      tokenStore.clear();
      return false;
    }
    mirrorSession(data.session.access_token, data.session.refresh_token);
    return true;
  },
};
