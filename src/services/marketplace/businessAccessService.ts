import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import { aliasName } from "@/lib/publicName";

export interface BusinessLoginConfig {
  loginId: string;
  requireApproval: boolean;
  sessionHours: number;
  isEnabled: boolean;
}

export type AccessStatus = "PENDING" | "ACTIVE" | "EXPIRED" | "REVOKED" | "DENIED";

export interface AccessSession {
  id: string;
  businessId: string;
  businessName?: string;
  granteeName: string;
  granteeAvatar?: string;
  status: AccessStatus;
  requestedAt: string;
  expiresAt: string | null;
}

export interface LoginResult {
  status: AccessStatus;
  businessId: string;
  sessionId: string;
  businessName: string;
}

export const businessAccessService = {
  /** Owner: read the (non-secret) login config for a business. */
  async getConfig(businessId: string): Promise<BusinessLoginConfig | null> {
    const sb = getSupabase();
    const { data } = await sb
      .from("business_login_credentials")
      .select("login_id, require_approval, session_hours, is_enabled")
      .eq("business_id", businessId)
      .maybeSingle();
    if (!data) return null;
    return {
      loginId: (data as any).login_id,
      requireApproval: (data as any).require_approval,
      sessionHours: (data as any).session_hours,
      isEnabled: (data as any).is_enabled,
    };
  },

  /** Owner: a guaranteed-unique, shareable login id suggestion for a business. */
  async suggestLogin(businessId: string): Promise<string> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("suggest_business_login", { p_business_id: businessId });
    if (error) return "";
    return (data as string) ?? "";
  },

  /** Owner: create/update the login id, password, approval + session settings. */
  async setLogin(businessId: string, cfg: { loginId: string; password: string; requireApproval: boolean; sessionHours: number; enabled: boolean }) {
    const sb = getSupabase();
    const { error } = await sb.rpc("set_business_login", {
      p_business_id: businessId,
      p_login_id: cfg.loginId,
      p_password: cfg.password,
      p_require_approval: cfg.requireApproval,
      p_session_hours: cfg.sessionHours,
      p_enabled: cfg.enabled,
    });
    if (error) {
      if (error.code === "23505" || /duplicate|unique/i.test(error.message ?? "")) {
        throw new Error("That login id is already taken — pick another.");
      }
      throw new Error(error.message || "Couldn't save the login.");
    }
    return { ok: true };
  },

  /** A logged-in user attempts to log into a business by id + password. */
  async login(loginId: string, password: string): Promise<LoginResult> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("business_login_attempt", { p_login_id: loginId, p_password: password });
    if (error) throw new Error(error.message || "Login failed.");
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("Login failed.");
    return {
      status: row.status,
      businessId: row.business_id,
      sessionId: row.session_id,
      businessName: row.business_name ?? "Business",
    };
  },

  /** Owner: grant a customer access by their mobile number or email. */
  async grantByIdentifier(businessId: string, identifier: string): Promise<{ ok: true; name: string }> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("grant_business_access", { p_business_id: businessId, p_identifier: identifier });
    if (error) throw new Error(error.message || "Couldn't grant access.");
    const row = Array.isArray(data) ? data[0] : data;
    return { ok: true, name: (row?.grantee_name as string) ?? "User" };
  },

  /** Owner: sessions (requests + active grants) for a business. */
  async ownerSessions(businessId: string): Promise<AccessSession[]> {
    const sb = getSupabase();
    const { data } = await sb
      .from("business_access_sessions")
      .select("id, business_id, status, requested_at, expires_at, grantee:users!grantee_user_id(alias, avatar)")
      .eq("business_id", businessId)
      .order("requested_at", { ascending: false });
    return (data ?? []).map((r: any) => ({
      id: r.id,
      businessId: r.business_id,
      granteeName: aliasName({ alias: r.grantee?.alias }, "A user"),
      granteeAvatar: r.grantee?.avatar ?? undefined,
      status: r.status,
      requestedAt: r.requested_at,
      expiresAt: r.expires_at ?? null,
    }));
  },

  /** The current user's own access sessions (businesses they can manage). */
  async mySessions(): Promise<AccessSession[]> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return [];
    const { data } = await sb
      .from("business_access_sessions")
      .select("id, business_id, status, requested_at, expires_at, businesses!business_id(name)")
      .eq("grantee_user_id", uid)
      .order("requested_at", { ascending: false });
    return (data ?? []).map((r: any) => ({
      id: r.id,
      businessId: r.business_id,
      businessName: r.businesses?.name ?? "Business",
      granteeName: "You",
      status: r.status,
      requestedAt: r.requested_at,
      expiresAt: r.expires_at ?? null,
    }));
  },

  /** Details for the live owner popup when a new request lands. */
  async sessionForPrompt(sessionId: string): Promise<AccessSession | null> {
    const sb = getSupabase();
    const { data } = await sb
      .from("business_access_sessions")
      .select("id, business_id, status, requested_at, expires_at, grantee:users!grantee_user_id(alias, avatar), businesses!business_id(name)")
      .eq("id", sessionId)
      .maybeSingle();
    if (!data) return null;
    const r = data as any;
    return {
      id: r.id,
      businessId: r.business_id,
      businessName: r.businesses?.name ?? "your business",
      granteeName: aliasName({ alias: r.grantee?.alias }, "A user"),
      granteeAvatar: r.grantee?.avatar ?? undefined,
      status: r.status,
      requestedAt: r.requested_at,
      expiresAt: r.expires_at ?? null,
    };
  },

  async decide(sessionId: string, approve: boolean) {
    const sb = getSupabase();
    const { error } = await sb.rpc("decide_business_session", { p_session_id: sessionId, p_approve: approve });
    if (error) throw new Error(error.message || "Couldn't update the request.");
    return { ok: true };
  },

  async revoke(sessionId: string) {
    const sb = getSupabase();
    const { error } = await sb.rpc("revoke_business_session", { p_session_id: sessionId });
    if (error) throw new Error(error.message || "Couldn't revoke the session.");
    return { ok: true };
  },

  /** Does the current user still have access (owner OR active session) to this business? */
  async checkAccess(businessId: string): Promise<boolean> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("my_business_access_status", { p_business_id: businessId });
    if (error) return false; // fail closed — treat an unreachable check as no access
    return !!data;
  },

  /** Best-effort expiry sweep. */
  async sweep() {
    try { await getSupabase().rpc("close_expired_business_sessions"); } catch { /* ignore */ }
  },
};
