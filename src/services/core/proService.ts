import { getSupabase } from "@/lib/supabaseClient";

export const PRO_PLANS = [
  { id: "BASIC",   label: "Basic",   price: 499,  duration: "3 months",  features: ["25 catalog items", "Priority support", "Basic analytics"] },
  { id: "PRO",     label: "Pro",     price: 999,  duration: "6 months",  features: ["Unlimited catalog", "Priority leads", "Advanced analytics", "Banner placement"] },
  { id: "PREMIUM", label: "Premium", price: 1999, duration: "12 months", features: ["Everything in Pro", "Dedicated account manager", "Custom promotions", "API access"] },
];

export const LEAD_PACKS = [
  { id: "LEAD_PACK_10", label: "10 Lead Credits", price: 199, credits: 10 },
  { id: "LEAD_PACK_50", label: "50 Lead Credits", price: 799, credits: 50 },
];

export const proService = {
  async getBusinessProStatus(businessId: string): Promise<{ isPro: boolean; proUntil: string | null; leadCredits: number }> {
    const sb = getSupabase();
    const { data } = await sb.from("businesses").select("pro_until, lead_credits").eq("id", businessId).maybeSingle();
    const proUntil = (data as any)?.pro_until ?? null;
    const isPro = proUntil ? new Date(proUntil) > new Date() : false;
    return { isPro, proUntil, leadCredits: (data as any)?.lead_credits ?? 0 };
  },

  async getProviderLeadCredits(providerId: string): Promise<number> {
    const sb = getSupabase();
    const { data } = await sb.from("providers").select("lead_credits").eq("id", providerId).maybeSingle();
    return (data as any)?.lead_credits ?? 0;
  },

  // NOTE: paid Pro/Lead-pack upgrades are not wired to a payment provider.
  // The old Razorpay flow was removed (payments are UPI-deeplink only); the
  // upgrade screen is unrouted until a UPI-based purchase flow is built.
};
