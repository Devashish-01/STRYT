import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, inr, EmptyState } from "@/components/common";
import { Plus, Pause, Play, RefreshCw } from "lucide-react";
import { subscriptionService, type Subscription } from "@/services/engagement/subscriptionService";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import { ListSkeleton } from "@/components/states";

const FREQ_LABEL: Record<string, string> = { DAILY: "Daily", WEEKLY: "Weekly", MONTHLY: "Monthly" };
const FREQ_COLOR: Record<string, string> = { DAILY: "#6d28d9", WEEKLY: "#0ea5e9", MONTHLY: "var(--orange-500)" };

export default function SubscriptionManager() {
  const nav = useNavigate();
  const { showToast } = useApp();
  const { data, loading, refetch } = useQuery(() => subscriptionService.list(), []);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(sub: Subscription) {
    setBusy(sub.id);
    try {
      if (sub.status === "ACTIVE") {
        await subscriptionService.pause(sub.id);
        showToast("Subscription paused");
      } else {
        await subscriptionService.resume(sub.id);
        showToast("Subscription resumed ✓");
      }
      refetch();
    } catch {
      showToast("Couldn't update. Try again.");
    } finally { setBusy(null); }
  }

  return (
    <div className="screen">
      <AppBar title="Subscriptions" subtitle="Recurring services" />
      <div className="screen-scroll page-pad col gap-12" style={{ paddingTop: 14 }}>
        <button className="btn btn-primary btn-block row center gap-8" onClick={() => nav("/subscriptions/new")}>
          <Plus size={16} /> Add recurring service
        </button>

        {loading && <ListSkeleton count={3} />}
        {!loading && (data ?? []).length === 0 && (
          <EmptyState emoji="🔄" title="No subscriptions yet"
            text="Track your maid, milk, tiffin, newspaper and other recurring services here." />
        )}

        {(data ?? []).map((sub) => (
          <div key={sub.id} className="card" style={{ padding: 14 }}>
            <div className="row between" style={{ marginBottom: 6 }}>
              <div>
                <div className="semi small">{sub.title}</div>
                <div className="tiny muted">{sub.providerName}</div>
              </div>
              <div className="col" style={{ alignItems: "flex-end", gap: 4 }}>
                <span className="bold" style={{ color: "var(--green-500)" }}>{inr(sub.pricePerPeriod)}</span>
                <span style={{ background: FREQ_COLOR[sub.frequency] + "18", color: FREQ_COLOR[sub.frequency], fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 12 }}>
                  {FREQ_LABEL[sub.frequency]}
                </span>
              </div>
            </div>

            <div className="row gap-8" style={{ marginTop: 10 }}>
              <button className="btn btn-outline grow btn-sm row center gap-6"
                onClick={() => nav(`/subscriptions/${sub.id}`)}>
                <RefreshCw size={13} /> Attendance
              </button>
              <button className="btn btn-outline grow btn-sm row center gap-6" disabled={busy === sub.id}
                onClick={() => toggle(sub)}>
                {sub.status === "ACTIVE"
                  ? <><Pause size={13} /> Pause</>
                  : <><Play size={13} /> Resume</>}
              </button>
            </div>

            {sub.status === "PAUSED" && (
              <div className="tiny" style={{ marginTop: 8, color: "var(--orange-500)", textAlign: "center" }}>⏸ Paused</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
