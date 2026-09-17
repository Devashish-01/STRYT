import { useState } from "react";
import { EmptyState } from "@/components/common";
import { adminService, type PendingLocationChange } from "@/services/core/adminService";
import { useQuery } from "@/hooks/useApi";
import { ListSkeleton } from "@/components/states";
import { Check, X, Store, MapPin } from "@/components/Icons";
import MiniMap from "@/components/MiniMap";
import { useApp } from "@/store";

function fmtCoord(lat: number | null, lng: number | null): string {
  if (lat == null || lng == null) return "—";
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

// Business location change review. Owners can only *request* a move
// (businessService.requestLocationChange writes staging columns); the live
// location and the geom discovery reads never change until an admin approves
// here — approveLocationChange promotes the staged coords onto the live
// lat/lng (geom auto-syncs), rejectLocationChange discards them.
export function AdminLocationChanges() {
  const { showToast } = useApp();
  const { data, loading, refetch } = useQuery(() => adminService.pendingLocationChanges(), [], "admin:location-changes");
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [actingId, setActingId] = useState<string | null>(null);

  async function decide(item: PendingLocationChange, approve: boolean) {
    setActingId(item.id);
    try {
      if (approve) {
        await adminService.approveLocationChange(item.id);
        showToast("Location approved — now live ✓");
      } else {
        await adminService.rejectLocationChange(item.id, (reasonById[item.id] ?? "").trim() || undefined);
        showToast("Location change rejected");
      }
      refetch();
    } catch (e: any) {
      showToast(e?.message || "Couldn't update the location change.");
    } finally {
      setActingId(null);
    }
  }

  if (loading) return <div className="page-pad"><ListSkeleton count={3} /></div>;
  const items = data ?? [];

  return (
    <div className="page-pad col gap-12" style={{ paddingTop: 12 }}>
      {items.length === 0 && <EmptyState emoji="📍" title="No location changes" text="No businesses are waiting on a location review." />}
      {items.map((item) => {
        const busy = actingId === item.id;
        return (
          <div key={item.id} className="card">
            <div className="row gap-12" style={{ marginBottom: 10 }}>
              {item.coverImage
                ? <img src={item.coverImage} alt={item.name} className="thumb" style={{ width: 44, height: 44, borderRadius: 10 }} />
                : <div style={{ width: 44, height: 44, borderRadius: 10, background: "var(--brand-50)", display: "flex", alignItems: "center", justifyContent: "center" }}><Store size={18} color="var(--brand-600)" /></div>}
              <div className="grow">
                <div className="semi small">{item.name}</div>
                <div className="tiny muted row gap-4" style={{ alignItems: "center" }}><MapPin size={11} /> Location change requested</div>
              </div>
            </div>

            <div className="row gap-10" style={{ marginBottom: 10 }}>
              <div className="grow col gap-4">
                <span className="tiny semi muted">CURRENT</span>
                {item.lat != null && item.lng != null
                  ? <MiniMap lat={item.lat} lng={item.lng} pinColor="var(--ink-400)" height={120} />
                  : <div className="tiny muted" style={{ padding: "8px 0" }}>Not set</div>}
                <span className="tiny muted">{fmtCoord(item.lat, item.lng)}</span>
              </div>
              <div className="grow col gap-4">
                <span className="tiny semi" style={{ color: "var(--orange-500)" }}>REQUESTED</span>
                {item.pendingLat != null && item.pendingLng != null
                  ? <MiniMap lat={item.pendingLat} lng={item.pendingLng} pinColor="var(--orange-500)" height={120} />
                  : <div className="tiny muted" style={{ padding: "8px 0" }}>Not set</div>}
                <span className="tiny muted">{fmtCoord(item.pendingLat, item.pendingLng)}</span>
              </div>
            </div>

            <input
              className="input"
              placeholder="Reason (optional, shown to owner if rejected)"
              style={{ fontSize: 12.5, marginBottom: 8 }}
              value={reasonById[item.id] ?? ""}
              onChange={(e) => setReasonById((m) => ({ ...m, [item.id]: e.target.value }))}
            />
            <div className="row gap-8">
              <button className="btn btn-outline grow btn-sm" style={{ color: "var(--red-600)" }} disabled={busy} onClick={() => decide(item, false)}>
                <X size={14} /> Reject
              </button>
              <button className="btn btn-green grow btn-sm" disabled={busy} onClick={() => decide(item, true)}>
                <Check size={14} /> Approve
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
