import { useParams } from "react-router-dom";
import { useState } from "react";
import { AppBar, EmptyState } from "@/components/common";
import { businessService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { useApp } from "@/store";
import { Check, X, CalendarClock } from "lucide-react";
import type { ReservationReq } from "@/types";

export default function Reservations() {
  const { id = "b1" } = useParams();
  const { data, loading, error, refetch } = useQuery(() => businessService.reservations(id), [id]);
  const { showToast } = useApp();
  const [overrides, setOverrides] = useState<Record<string, ReservationReq["status"]>>({});

  async function set(rId: string, status: "ACCEPTED" | "DECLINED") {
    await businessService.setReservation(rId, status);
    setOverrides((o) => ({ ...o, [rId]: status }));
    showToast(status === "ACCEPTED" ? "Reservation accepted ✓" : "Reservation declined");
  }

  const typeLabel: Record<string, string> = { TABLE: "🍽️ Table", PREORDER: "📦 Pre-order", APPOINTMENT: "📅 Appointment" };

  return (
    <div className="screen">
      <AppBar title="Reservations & pre-orders" />
      <div className="screen-scroll">
        {loading && <ListSkeleton count={3} />}
        {error && <ErrorView error={error} onRetry={refetch} />}
        {data && (
          <div className="page-pad col gap-12">
            {data.length === 0 && <EmptyState emoji="📅" title="No requests" text="Reservation and pre-order requests appear here." />}
            {data.map((r) => {
              const status = overrides[r.id] ?? r.status;
              return (
                <div key={r.id} className="card" style={{ padding: 14 }}>
                  <div className="row gap-12">
                    <img src={r.customerAvatar} className="avatar" style={{ width: 44, height: 44 }} />
                    <div className="grow">
                      <div className="row between"><span className="semi small">{r.customerName}</span><span className="badge badge-gray">{typeLabel[r.type]}</span></div>
                      <div className="small">{r.detail}</div>
                      <div className="tiny muted row gap-4" style={{ marginTop: 2 }}><CalendarClock size={12} /> {r.when}</div>
                    </div>
                  </div>
                  {status === "PENDING" ? (
                    <div className="row gap-8" style={{ marginTop: 12 }}>
                      <button className="btn btn-outline grow btn-sm" onClick={() => set(r.id, "DECLINED")}><X size={15} /> Decline</button>
                      <button className="btn btn-green grow btn-sm" onClick={() => set(r.id, "ACCEPTED")}><Check size={15} /> Accept</button>
                    </div>
                  ) : (
                    <div style={{ marginTop: 10 }}>
                      <span className={`badge ${status === "ACCEPTED" ? "badge-green" : "badge-gray"}`}>{status === "ACCEPTED" ? "Accepted" : "Declined"}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
