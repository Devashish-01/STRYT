import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import { throwIfError } from "@/lib/supabasePage";
import { toCamel } from "@/lib/caseMap";

export interface Society {
  id: string;
  name: string;
  address: string;
  city: string;
  pincode: string;
  lat?: number;
  lng?: number;
  unitCount: number;
  joinCode: string;
  adminUserId: string;
  verified: boolean;
  createdAt: string;
}

export interface SocietyMember {
  id: string;
  societyId: string;
  userId: string;
  unitNumber: string;
  role: "ADMIN" | "SECRETARY" | "RESIDENT";
  approved: boolean;
  joinedAt: string;
  userName?: string;
  userAvatar?: string;
}

export interface GatePass {
  id: string;
  societyId: string;
  providerUserId: string;
  issuedByUserId: string;
  purpose: string;
  validFrom: string;
  validUntil: string;
  status: "ACTIVE" | "USED" | "EXPIRED" | "REVOKED";
  createdAt: string;
  providerName?: string;
  providerAvatar?: string;
}

export const societyService = {
  async create(data: { name: string; address: string; city: string; pincode: string; unitCount: number }): Promise<Society> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw new Error("Not authenticated");
    const { data: row, error } = await sb.from("societies").insert({
      name: data.name,
      address: data.address,
      city: data.city,
      pincode: data.pincode,
      unit_count: data.unitCount,
      admin_user_id: uid,
    }).select().maybeSingle();
    throwIfError(error);
    // Auto-add creator as admin member
    await sb.from("society_members").insert({
      society_id: (row as any).id,
      user_id: uid,
      unit_number: "Admin",
      role: "ADMIN",
      approved: true,
    });
    await sb.from("users").update({ society_id: (row as any).id, unit_number: "Admin" }).eq("id", uid);
    return toCamel<Society>(row);
  },

  async joinByCode(code: string, unitNumber: string): Promise<void> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw new Error("Not authenticated");
    const { data: soc, error } = await sb.from("societies").select("id").eq("join_code", code.toUpperCase()).maybeSingle();
    throwIfError(error);
    if (!soc) throw new Error("Invalid society code");
    const { error: e2 } = await sb.from("society_members").insert({
      society_id: (soc as any).id,
      user_id: uid,
      unit_number: unitNumber,
      role: "RESIDENT",
      approved: false,
    });
    throwIfError(e2);
    await sb.from("users").update({ society_id: (soc as any).id, unit_number: unitNumber }).eq("id", uid);
  },

  async getMySociety(): Promise<{ society: Society; member: SocietyMember } | null> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return null;
    const { data: me } = await sb.from("users").select("society_id").eq("id", uid).maybeSingle();
    if (!(me as any)?.society_id) return null;
    const [{ data: soc }, { data: mem }] = await Promise.all([
      sb.from("societies").select("*").eq("id", (me as any).society_id).maybeSingle(),
      sb.from("society_members").select("*").eq("society_id", (me as any).society_id).eq("user_id", uid).maybeSingle(),
    ]);
    if (!soc) return null;
    return { society: toCamel<Society>(soc), member: toCamel<SocietyMember>(mem ?? {}) };
  },

  async getMembers(societyId: string): Promise<SocietyMember[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("society_members")
      .select("*, user:users!user_id(name, avatar)")
      .eq("society_id", societyId)
      .eq("approved", true)
      .order("role")
      .order("joined_at");
    throwIfError(error);
    return (data ?? []).map((r: any) => ({
      ...toCamel<SocietyMember>(r),
      userName: r.user?.name ?? "",
      userAvatar: r.user?.avatar ?? "",
    }));
  },

  async getPendingMembers(societyId: string): Promise<SocietyMember[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("society_members")
      .select("*, user:users!user_id(name, avatar)")
      .eq("society_id", societyId)
      .eq("approved", false)
      .order("joined_at");
    throwIfError(error);
    return (data ?? []).map((r: any) => ({
      ...toCamel<SocietyMember>(r),
      userName: r.user?.name ?? "",
      userAvatar: r.user?.avatar ?? "",
    }));
  },

  async approveMember(memberId: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.from("society_members").update({ approved: true }).eq("id", memberId);
    throwIfError(error);
  },

  async rejectMember(memberId: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.from("society_members").delete().eq("id", memberId);
    throwIfError(error);
  },

  async issueGatePass(data: { societyId: string; providerUserId: string; purpose: string; validHours?: number }): Promise<GatePass> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw new Error("Not authenticated");
    const validUntil = new Date(Date.now() + (data.validHours ?? 8) * 3600 * 1000).toISOString();
    const { data: row, error } = await sb.from("gate_passes").insert({
      society_id: data.societyId,
      provider_user_id: data.providerUserId,
      issued_by_user_id: uid,
      purpose: data.purpose,
      valid_until: validUntil,
    }).select("*, provider:users!provider_user_id(name, avatar)").maybeSingle();
    throwIfError(error);
    return {
      ...toCamel<GatePass>(row),
      providerName: (row as any).provider?.name ?? "",
      providerAvatar: (row as any).provider?.avatar ?? "",
    };
  },

  async getGatePasses(societyId: string): Promise<GatePass[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("gate_passes")
      .select("*, provider:users!provider_user_id(name, avatar)")
      .eq("society_id", societyId)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: false });
    throwIfError(error);
    return (data ?? []).map((r: any) => ({
      ...toCamel<GatePass>(r),
      providerName: r.provider?.name ?? "",
      providerAvatar: r.provider?.avatar ?? "",
    }));
  },

  async searchByName(query: string): Promise<Society[]> {
    const sb = getSupabase();
    const { data, error } = await sb.from("societies").select("*").ilike("name", `%${query}%`).limit(10);
    throwIfError(error);
    return (data ?? []).map((r: any) => toCamel<Society>(r));
  },
};
