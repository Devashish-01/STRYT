import { getSupabase } from "@/lib/supabaseClient";
import { throwIfError } from "@/lib/supabasePage";
import { toCamel } from "@/lib/caseMap";
import type { ProviderVerification, VerificationTier } from "@/types";
import { uploadService } from "./uploadService";
import { functionUrl } from "@/config";

export const kycService = {
  async getVerifications(providerId: string): Promise<ProviderVerification[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("provider_verifications")
      .select("*")
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false });
    throwIfError(error);
    return (data ?? []).map((r: any) => toCamel<ProviderVerification>(r));
  },

  async submitDoc(providerId: string, type: "PAN" | "AADHAAR", file: File): Promise<void> {
    const docUrl = await uploadService.upload(file, `kyc-docs/${providerId}`);
    const sb = getSupabase();
    const { error } = await sb.from("provider_verifications").insert({
      provider_id: providerId, type, doc_url: docUrl, status: "PENDING",
    });
    throwIfError(error);
    await sb.from("providers")
      .update({ verification_tier: "DOCS_SUBMITTED" })
      .eq("id", providerId)
      .eq("verification_tier", "NONE");
  },

  async adminGetPending(): Promise<any[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("provider_verifications")
      .select("*, provider:providers!provider_id(id, display_name, user_id)")
      .eq("status", "PENDING")
      .order("created_at", { ascending: true });
    throwIfError(error);
    return data ?? [];
  },

  async adminApprove(verificationId: string, providerId: string, newTier: VerificationTier): Promise<void> {
    const sb = getSupabase();
    const { error: e1 } = await sb.from("provider_verifications")
      .update({ status: "VERIFIED", reviewed_at: new Date().toISOString() }).eq("id", verificationId);
    throwIfError(e1);
    const { error: e2 } = await sb.from("providers")
      .update({ verification_tier: newTier }).eq("id", providerId);
    throwIfError(e2);
  },

  async adminReject(verificationId: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.from("provider_verifications")
      .update({ status: "REJECTED", reviewed_at: new Date().toISOString() }).eq("id", verificationId);
    throwIfError(error);
  },

  async verifyPAN(providerId: string, panNumber: string): Promise<{ name: string }> {
    const sb = getSupabase();
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch(functionUrl("verify-pan"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
      body: JSON.stringify({ providerId, panNumber }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.message || "PAN verification failed");
    return { name: json.name };
  },

  async aadhaarSendOtp(providerId: string, aadhaarNumber: string): Promise<{ clientId: string }> {
    const sb = getSupabase();
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch(functionUrl("verify-aadhaar"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
      body: JSON.stringify({ providerId, aadhaarNumber, step: "otp" }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.message || "Couldn't send OTP");
    return { clientId: json.clientId };
  },

  async aadhaarVerifyOtp(providerId: string, clientId: string, otp: string): Promise<{ name: string }> {
    const sb = getSupabase();
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch(functionUrl("verify-aadhaar"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
      body: JSON.stringify({ providerId, clientId, otp, step: "verify" }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.message || "Invalid OTP");
    return { name: json.name };
  },
};
