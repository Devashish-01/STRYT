// STRYT — ai-assist edge function
// Actions:
//   suggest_price { categoryId, area } -> { suggestion, avg, low, high, count, reason }
//
// Price suggestions are pure SQL aggregation over historical proposals; no AI key needed.
//
// Auto-injected secrets:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

async function suggestPrice(categoryId?: string, _area?: string) {
  if (!categoryId) return null;
  const { data, error } = await admin
    .from("proposals")
    .select("price, request:requests!request_id(category_id)")
    .limit(500);
  if (error || !data) return null;
  const prices = (data as Array<{ price: number; request: { category_id: string } | null }>)
    .filter((r) => r.request?.category_id === categoryId && typeof r.price === "number" && r.price > 0)
    .map((r) => r.price)
    .sort((a, b) => a - b);
  if (prices.length === 0) {
    return { suggestion: null, avg: 0, low: 0, high: 0, count: 0, reason: "Not enough history yet." };
  }
  const sum = prices.reduce((a, b) => a + b, 0);
  const avg = Math.round(sum / prices.length);
  const low = prices[Math.floor(prices.length * 0.25)];
  const high = prices[Math.floor(prices.length * 0.75)];
  return {
    suggestion: avg,
    avg,
    low,
    high,
    count: prices.length,
    reason: `Based on ${prices.length} similar quotes nearby.`,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { action, payload } = await req.json();
    if (action === "suggest_price") return json(await suggestPrice(payload?.categoryId, payload?.area));
    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
