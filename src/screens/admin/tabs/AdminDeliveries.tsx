import { useQuery } from "@/hooks/useApi";
import { deliveryService } from "@/services";
import { ErrorView, Skeleton } from "@/components/states";
import { EmptyState } from "@/components/common";
import { inr } from "@/lib/format";
import { Stat, Sep } from "./adminPrimitives";

/**
 * Support's view of deliveries: how many are out, how many failed this week, money outstanding, and the specific deliveries
 * a person should look at (a rider who hasn't set off, a location that went dark, someone waiting at a door). The list is
 * computed on the server by admin_delivery_overview(), which refuses anyone who isn't an admin.
 */
export function AdminDeliveries() {
  const { data, loading, error, refetch } = useQuery(() => deliveryService.adminOverview(), [], "admin:deliveries");

  if (loading) return <div className="page-pad"><Skeleton h={160} /></div>;
  if (error) return <ErrorView error={error} onRetry={refetch} />;
  const d = data!;

  return (
    <div className="page-pad col gap-14">
      <div className="card col" style={{ padding: 14, gap: 12 }}>
        <div className="row">
          <Stat label="Out now" value={String(d.active)} />
          <Sep />
          <Stat label="Waiting for a rider" value={String(d.awaitingRider)} />
          <Sep />
          <Stat label="Delivered (7d)" value={String(d.delivered7d)} />
          <Sep />
          <Stat label="Failed (7d)" value={String(d.failed7d)} />
        </div>
        <div className="row" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
          <Stat label="Unpaid after delivery" value={inr(d.cashOutstanding)} />
          <Sep />
          <Stat label="Cash with riders" value={inr(d.cashUnsettled)} />
        </div>
      </div>

      <div className="col gap-8">
        <div className="row between center-v">
          <span className="semi">Needs attention</span>
          <button className="tiny semi" style={{ color: "var(--brand-700)" }} onClick={() => refetch()}>Refresh</button>
        </div>
        {d.attention.length === 0 ? (
          <EmptyState emoji="✅" title="Nothing stuck" text="No delivery is waiting on a rider, off the map or held at a door." />
        ) : (
          d.attention.map((a) => (
            <div key={a.deliveryId} className="card col gap-4" style={{ padding: 12 }}>
              <div className="row between center-v">
                <span className="semi small">{a.businessName}</span>
                <span className="badge badge-amber" style={{ fontSize: 10 }}>{a.status}</span>
              </div>
              <div className="small" style={{ color: "var(--red-700)" }}>{a.issue}</div>
              <div className="tiny muted">
                Order {a.appointmentId.slice(0, 12)}…
                {a.since ? ` · since ${new Date(a.since).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
