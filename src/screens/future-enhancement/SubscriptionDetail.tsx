import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppBar, inr, EmptyState } from "@/components/common";
import { ChevronLeft, ChevronRight, CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { subscriptionService, type SubscriptionLog } from "@/services/engagement/subscriptionService";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import { Skeleton } from "@/components/states";

export default function SubscriptionDetail() {
  const { id = "" } = useParams();
  const { showToast } = useApp();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const { data: sub, loading: subLoading } = useQuery(() => subscriptionService.get(id), [id]);
  const { data: logs, loading: logsLoading, refetch } = useQuery(
    () => subscriptionService.getLogs(id, year, month),
    [id, year, month]
  );
  const { data: summary } = useQuery(
    () => subscriptionService.monthSummary(id, year, month),
    [id, year, month]
  );

  const [marking, setMarking] = useState<string | null>(null);

  async function mark(dateStr: string, status: SubscriptionLog["status"]) {
    setMarking(dateStr);
    try {
      await subscriptionService.markDay(id, dateStr, status);
      refetch();
    } catch { showToast("Couldn't save. Try again."); }
    finally { setMarking(null); }
  }

  function prevMonth() {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    const now = new Date();
    if (year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1)) return;
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  }

  const monthName = new Date(year, month - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay();
  const logMap: Record<string, SubscriptionLog["status"]> = {};
  (logs ?? []).forEach((l) => { logMap[l.logDate] = l.status; });

  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1;

  if (subLoading) return <div className="screen"><AppBar title="Subscription" /><div className="page-pad"><Skeleton h={120} /></div></div>;
  if (!sub) return <div className="screen"><AppBar title="Subscription" /><EmptyState emoji="🔄" title="Not found" text="" /></div>;

  return (
    <div className="screen">
      <AppBar title={sub.title} subtitle={sub.providerName} />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingTop: 14 }}>

        {/* Monthly summary */}
        {summary && (
          <div className="row gap-0" style={{ background: "#fff", borderRadius: 14, overflow: "hidden", border: "1px solid var(--line)" }}>
            <SumCard label="Present" value={summary.present} color="var(--green-500)" />
            <div style={{ width: 1, background: "var(--line)" }} />
            <SumCard label="Absent" value={summary.absent} color="var(--red-600)" />
            <div style={{ width: 1, background: "var(--line)" }} />
            <SumCard label="Skipped" value={summary.skipped} color="var(--orange-500)" />
            <div style={{ width: 1, background: "var(--line)" }} />
            <SumCard label="Amount" value={`₹${summary.amount}`} color="var(--brand-700)" />
          </div>
        )}

        {/* Month nav */}
        <div className="row between center">
          <button onClick={prevMonth} className="btn btn-outline btn-sm"><ChevronLeft size={16} /></button>
          <span className="semi small">{monthName}</span>
          <button onClick={nextMonth} className="btn btn-outline btn-sm" disabled={isCurrentMonth}><ChevronRight size={16} /></button>
        </div>

        {/* Calendar */}
        <div>
          <div className="row" style={{ marginBottom: 8 }}>
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--ink-400)" }}>{d}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
            {Array(firstDay).fill(null).map((_, i) => <div key={`blank-${i}`} />)}
            {Array(daysInMonth).fill(null).map((_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const status = logMap[dateStr];
              const isFuture = new Date(dateStr) > today;
              const isToday = dateStr === today.toISOString().split("T")[0];

              return (
                <DayCell key={day} day={day} status={status} isFuture={isFuture} isToday={isToday}
                  isMarking={marking === dateStr}
                  onMark={(s) => !isFuture && mark(dateStr, s)} />
              );
            })}
          </div>
        </div>

        <div className="row gap-14" style={{ justifyContent: "center" }}>
          <Legend icon={<CheckCircle2 size={14} color="var(--green-500)" />} label="Present" />
          <Legend icon={<XCircle size={14} color="var(--red-600)" />} label="Absent" />
          <Legend icon={<MinusCircle size={14} color="var(--orange-500)" />} label="Skipped" />
        </div>
      </div>
    </div>
  );
}

function DayCell({ day, status, isFuture, isToday, isMarking, onMark }: {
  day: number; status?: string; isFuture: boolean; isToday: boolean;
  isMarking: boolean; onMark: (s: SubscriptionLog["status"]) => void;
}) {
  const [open, setOpen] = useState(false);

  const bg = status === "PRESENT" ? "#dcfce7" : status === "ABSENT" ? "#fee2e2" : status === "SKIPPED" ? "#fff7ed" : "#f9fafb";
  const color = status === "PRESENT" ? "var(--green-500)" : status === "ABSENT" ? "var(--red-600)" : status === "SKIPPED" ? "var(--orange-500)" : "var(--ink-600)";

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => !isFuture && setOpen((o) => !o)}
        style={{ width: "100%", aspectRatio: "1", borderRadius: 8, background: bg, color, fontWeight: isToday ? 800 : 500, fontSize: 13, border: isToday ? "2px solid var(--brand-600)" : "none", opacity: isFuture ? 0.3 : 1, cursor: isFuture ? "default" : "pointer" }}
        disabled={isMarking}
      >
        {day}
      </button>
      {open && !isFuture && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: "50%", transform: "translateX(-50%)", zIndex: 10, background: "#fff", border: "1px solid var(--line)", borderRadius: 10, padding: 6, display: "flex", gap: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.12)" }}>
          <button style={{ width: 28, height: 28, borderRadius: 8, background: "#dcfce7", fontSize: 14 }} onClick={() => { onMark("PRESENT"); setOpen(false); }}>✓</button>
          <button style={{ width: 28, height: 28, borderRadius: 8, background: "#fee2e2", fontSize: 14 }} onClick={() => { onMark("ABSENT"); setOpen(false); }}>✗</button>
          <button style={{ width: 28, height: 28, borderRadius: 8, background: "#fff7ed", fontSize: 14 }} onClick={() => { onMark("SKIPPED"); setOpen(false); }}>–</button>
        </div>
      )}
    </div>
  );
}

function SumCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="grow col center" style={{ padding: "12px 0", gap: 3 }}>
      <span className="bold" style={{ color, fontSize: 18 }}>{value}</span>
      <span className="tiny muted">{label}</span>
    </div>
  );
}
function Legend({ icon, label }: { icon: React.ReactNode; label: string }) {
  return <div className="row gap-4 tiny muted">{icon} {label}</div>;
}
