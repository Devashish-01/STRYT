import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import { throwIfError } from "@/lib/supabasePage";
import { toCamel, toSnake } from "@/lib/caseMap";

export interface Subscription {
  id: string;
  requesterUserId: string;
  providerUserId: string;
  providerName: string;
  providerAvatar: string;
  title: string;
  description: string;
  frequency: "DAILY" | "WEEKLY" | "MONTHLY";
  pricePerPeriod: number;
  status: "ACTIVE" | "PAUSED" | "CANCELLED";
  startDate: string;
  nextDue?: string;
  createdAt: string;
}

export interface SubscriptionLog {
  id: string;
  subscriptionId: string;
  logDate: string;
  status: "PRESENT" | "ABSENT" | "SKIPPED";
  note?: string;
}

function toSub(row: any): Subscription {
  return toCamel<Subscription>(row);
}

export const subscriptionService = {
  async list(): Promise<Subscription[]> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return [];
    const { data, error } = await sb
      .from("subscriptions")
      .select("*")
      .or(`requester_user_id.eq.${uid},provider_user_id.eq.${uid}`)
      .neq("status", "CANCELLED")
      .order("created_at", { ascending: false });
    throwIfError(error);
    return (data ?? []).map(toSub);
  },

  async get(id: string): Promise<Subscription | undefined> {
    const sb = getSupabase();
    const { data, error } = await sb.from("subscriptions").select("*").eq("id", id).maybeSingle();
    throwIfError(error);
    return data ? toSub(data) : undefined;
  },

  async create(data: Omit<Subscription, "id" | "requesterUserId" | "createdAt" | "status">): Promise<Subscription> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw new Error("Not authenticated");
    const { data: row, error } = await sb.from("subscriptions").insert({
      ...toSnake(data as any),
      requester_user_id: uid,
      status: "ACTIVE",
      start_date: new Date().toISOString().split("T")[0],
      next_due: new Date().toISOString().split("T")[0],
    }).select().maybeSingle();
    throwIfError(error);
    return toSub(row);
  },

  async pause(id: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.from("subscriptions").update({ status: "PAUSED" }).eq("id", id);
    throwIfError(error);
  },

  async resume(id: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.from("subscriptions").update({ status: "ACTIVE" }).eq("id", id);
    throwIfError(error);
  },

  async cancel(id: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.from("subscriptions").update({ status: "CANCELLED" }).eq("id", id);
    throwIfError(error);
  },

  async getLogs(subscriptionId: string, year: number, month: number): Promise<SubscriptionLog[]> {
    const sb = getSupabase();
    const from = `${year}-${String(month).padStart(2, "0")}-01`;
    const to = `${year}-${String(month).padStart(2, "0")}-31`;
    const { data, error } = await sb
      .from("subscription_logs")
      .select("*")
      .eq("subscription_id", subscriptionId)
      .gte("log_date", from)
      .lte("log_date", to)
      .order("log_date");
    throwIfError(error);
    return (data ?? []).map((r: any) => toCamel<SubscriptionLog>(r));
  },

  async markDay(subscriptionId: string, date: string, status: SubscriptionLog["status"], note?: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.from("subscription_logs").upsert({
      subscription_id: subscriptionId,
      log_date: date,
      status,
      note: note ?? null,
    }, { onConflict: "subscription_id,log_date" });
    throwIfError(error);
  },

  async monthSummary(subscriptionId: string, year: number, month: number): Promise<{ present: number; absent: number; skipped: number; total: number; amount: number }> {
    const logs = await this.getLogs(subscriptionId, year, month);
    const sub = await this.get(subscriptionId);
    const present = logs.filter((l) => l.status === "PRESENT").length;
    const absent = logs.filter((l) => l.status === "ABSENT").length;
    const skipped = logs.filter((l) => l.status === "SKIPPED").length;
    const daysInMonth = new Date(year, month, 0).getDate();
    return {
      present,
      absent,
      skipped,
      total: daysInMonth,
      amount: present * (sub?.pricePerPeriod ?? 0),
    };
  },
};
