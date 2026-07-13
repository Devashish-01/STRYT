import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import { throwIfError } from "@/lib/supabasePage";
import { functionUrl } from "@/config";

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

  async purchasePlan(entityType: "BUSINESS" | "PROVIDER", entityId: string, planId: string): Promise<{ orderId: string; amount: number; keyId: string }> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw new Error("Not authenticated");
    const plan = [...PRO_PLANS, ...LEAD_PACKS].find((p) => p.id === planId);
    if (!plan) throw new Error("Unknown plan");
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch(functionUrl("create-razorpay-order"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
      body: JSON.stringify({ agreementId: `pro_${entityId}`, amount: plan.price, payerUserId: uid }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.message);

    // Store pending pro payment
    await sb.from("pro_payments").insert({
      entity_type: entityType,
      entity_id: entityId,
      user_id: uid,
      plan: planId,
      amount: plan.price,
      razorpay_order_id: json.orderId,
      status: "PENDING",
    });
    return { orderId: json.orderId, amount: json.amount, keyId: json.keyId };
  },

  async activatePlan(entityType: "BUSINESS" | "PROVIDER", entityId: string, planId: string, orderId: string): Promise<void> {
    const sb = getSupabase();
    await sb.from("pro_payments").update({ status: "PAID" }).eq("razorpay_order_id", orderId);

    const plan = PRO_PLANS.find((p) => p.id === planId);
    const leadPack = LEAD_PACKS.find((p) => p.id === planId);

    if (plan) {
      const months = planId === "BASIC" ? 3 : planId === "PRO" ? 6 : 12;
      const validUntil = new Date();
      validUntil.setMonth(validUntil.getMonth() + months);
      if (entityType === "BUSINESS") {
        await sb.from("businesses").update({ pro_until: validUntil.toISOString() }).eq("id", entityId);
      }
    } else if (leadPack) {
      const table = entityType === "BUSINESS" ? "businesses" : "providers";
      const idCol = entityType === "BUSINESS" ? "id" : "id";
      const { data: current } = await sb.from(table).select("lead_credits").eq(idCol, entityId).maybeSingle();
      const newCredits = ((current as any)?.lead_credits ?? 0) + leadPack.credits;
      await sb.from(table).update({ lead_credits: newCredits }).eq(idCol, entityId);
    }
  },
};
