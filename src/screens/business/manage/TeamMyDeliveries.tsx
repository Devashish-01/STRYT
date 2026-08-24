import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppBar } from "@/components/common";
import { ChevronRight, Package } from "@/components/Icons";
import { useQuery } from "@/hooks/useApi";
import { deliveryService } from "@/services";
import { ErrorView, RowSkeleton } from "@/components/states";
import ManageNav from "./ManageNav";

const STATUS_LABEL: Record<string, string> = {
  ASSIGNED: "Assigned",
  EN_ROUTE: "On the way",
  ARRIVED: "Arrived",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

/**
 * Scoped team member view for deliveries assigned to them at this business.
 * Deep-links into the global /delivery console for live navigation.
 */
export default function TeamMyDeliveries() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { data: deliveries, loading, error } = useQuery(() => deliveryService.myDeliveries(), [id], `delivery:my-deliveries`);

  const mine = useMemo(
    () => (deliveries ?? []).filter((d) => d.businessId === id),
    [deliveries, id],
  );

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="My deliveries" />
        <ErrorView error={{ code: "BAD_REQUEST", message: "Missing business ID." } as any} />
      </div>
    );
  }

  return (
    <div className="screen with-nav">
      <AppBar title="My deliveries" subtitle="Assigned to you at this business" />
      <div className="screen-scroll page-pad col gap-12">
        <button className="btn btn-primary btn-block row center gap-8" onClick={() => nav("/delivery")}>
          <Package size={18} /> Open delivery console
        </button>

        {loading && !deliveries && (
          <div className="col gap-10">
            <RowSkeleton />
            <RowSkeleton />
          </div>
        )}

        {error && <ErrorView error={error as any} />}

        {!loading && mine.length === 0 && (
          <div className="card center col gap-8" style={{ padding: 24, textAlign: "center" }}>
            <Package size={32} color="var(--delivery-600)" />
            <div className="semi">No active deliveries</div>
            <div className="small muted">When the owner assigns you a delivery, it will show up here and in the delivery console.</div>
          </div>
        )}

        {mine.length > 0 && (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {mine.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className="row gap-10 center-v"
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  textAlign: "left",
                  borderTop: index ? "1px solid var(--line)" : "none",
                }}
                onClick={() => nav("/delivery")}
              >
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="semi small">{item.customerName}</div>
                  <div className="tiny muted">{item.deliveryAddressLine || item.customerArea || "Delivery"}</div>
                  <div className="tiny" style={{ color: "var(--delivery-600)", marginTop: 4 }}>
                    {STATUS_LABEL[item.status] ?? item.status}
                  </div>
                </div>
                <ChevronRight size={16} color="var(--ink-300)" />
              </button>
            ))}
          </div>
        )}
      </div>
      <ManageNav bizId={id} />
    </div>
  );
}
