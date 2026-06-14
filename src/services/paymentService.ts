import { getSupabase } from "@/lib/supabaseClient";

export const paymentService = {
  async createOrder(agreementId: string, amount: number, payerUserId: string): Promise<{
    orderId: string; amount: number; currency: string; keyId: string;
  }> {
    const sb = getSupabase();
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch(`${(import.meta as any).env?.VITE_SUPABASE_URL}/functions/v1/create-razorpay-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
      body: JSON.stringify({ agreementId, amount, payerUserId }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.message || "Could not create payment order");
    return { orderId: json.orderId, amount: json.amount, currency: json.currency, keyId: json.keyId };
  },

  async verifyPayment(razorpayOrderId: string, razorpayPaymentId: string, razorpaySignature: string, agreementId: string): Promise<void> {
    const sb = getSupabase();
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch(`${(import.meta as any).env?.VITE_SUPABASE_URL}/functions/v1/verify-razorpay-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
      body: JSON.stringify({ razorpayOrderId, razorpayPaymentId, razorpaySignature, agreementId }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.message || "Payment verification failed");
  },
};
