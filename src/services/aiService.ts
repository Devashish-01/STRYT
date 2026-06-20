import { getSupabase } from "@/lib/supabaseClient";

async function call(action: string, payload: Record<string, unknown>) {
  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  const res = await fetch(
    `${(import.meta as any).env?.VITE_SUPABASE_URL}/functions/v1/ai-assist`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ action, payload }),
    }
  );
  if (!res.ok) throw new Error("AI service unavailable");
  return res.json();
}

export const aiService = {
  async suggestPrice(categoryId: string, area: string): Promise<{
    suggestion: number | null;
    avg: number;
    low: number;
    high: number;
    count: number;
    reason: string;
  } | null> {
    try {
      return await call("suggest_price", { categoryId, area });
    } catch {
      return null;
    }
  },
};
