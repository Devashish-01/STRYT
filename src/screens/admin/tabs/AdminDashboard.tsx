import { adminService } from "@/services/core/adminService";
import { useQuery } from "@/hooks/useApi";
import { Skeleton } from "@/components/states";
import { Store, Briefcase, Flag, Users, TrendingUp } from "@/components/Icons";
import { Stat, Sep } from "./adminPrimitives";

export function AdminDashboard() {
  const { data, loading } = useQuery(() => adminService.overview(), [], "admin:overview");
  if (loading) return <div className="page-pad"><Skeleton h={120} /></div>;
  const d = data!;
  const cards = [
    { label: "Businesses", value: d.businesses, icon: Store, color: "var(--orange-500)" },
    { label: "Providers", value: d.providers, icon: Briefcase, color: "var(--green-500)" },
    { label: "Open requests", value: d.openRequests, icon: Users, color: "var(--brand-700)" },
    { label: "Pending review", value: d.pendingReview, icon: Flag, color: "var(--red-500)" },
  ];
  return (
    <div className="page-pad col gap-14">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="card col" style={{ padding: 14, gap: 6 }}>
              <Icon size={20} color={c.color} />
              <span className="bold" style={{ fontSize: 24 }}>{c.value}</span>
              <span className="tiny muted">{c.label}</span>
            </div>
          );
        })}
      </div>
      {/* "Not tracked yet" is a sentence, not a number: three of them side by side wrapped to two lines each. A dash
          fits the stat slot, and the service's own wording appears once underneath. */}
      <div className="card col" style={{ padding: 14, gap: 8 }}>
        <div className="row">
          <Stat label="DAU" value={typeof d.dau === "number" ? d.dau.toLocaleString() : "—"} />
          <Sep />
          <Stat label="MAU" value={typeof d.mau === "number" ? d.mau.toLocaleString() : "—"} />
          <Sep />
          <Stat label="Push delivery" value={typeof d.pushDelivery === "number" ? `${d.pushDelivery}%` : "—"} />
        </div>
        {[d.dau, d.mau, d.pushDelivery].find((v) => typeof v === "string") && (
          <div className="tiny muted" style={{ textAlign: "center" }}>
            {[d.dau, d.mau, d.pushDelivery].find((v) => typeof v === "string")}
          </div>
        )}
      </div>
      <div className="card row gap-10" style={{ padding: 14 }}>
        <TrendingUp size={18} color="var(--green-500)" />
        <span className="small semi grow">New today</span>
        <span className="bold">{d.newToday}</span>
      </div>
    </div>
  );
}
