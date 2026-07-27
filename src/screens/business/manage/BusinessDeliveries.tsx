import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { AppBar, EmptyState, SafeImg } from "@/components/common";
import { ListSkeleton, ErrorView } from "@/components/states";
import { useQueryWithRealtime } from "@/hooks/useApi";
import { deliveryService } from "@/services";
import type { BusinessDeliveryItem } from "@/services/engagement/deliveryService";
import { businessService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { Package, MapPin, Phone, CheckCircle, Navigation } from "@/components/Icons";
import { makePinIcon } from "@/lib/leafletIcon";
import "@/lib/leafletIcon";
import { openRoute } from "@/lib/routeLink";
import ManageNav from "./ManageNav";

const ACTIVE_STATUSES = ["ASSIGNED", "EN_ROUTE", "ARRIVED"] as const;

const STATUS_PILL: Record<string, { label: string; bg: string; fg: string }> = {
  ASSIGNED: { label: "Assigned", bg: "var(--ink-100)", fg: "var(--ink-600)" },
  EN_ROUTE: { label: "On the way", bg: "var(--delivery-50)", fg: "var(--delivery-600)" },
  ARRIVED: { label: "Arrived", bg: "var(--brand-50)", fg: "var(--brand-700)" },
  DELIVERED: { label: "Delivered", bg: "var(--green-100)", fg: "var(--green-600)" },
  CANCELLED: { label: "Cancelled", bg: "var(--red-50)", fg: "var(--red-600)" },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_PILL[status] ?? STATUS_PILL.ASSIGNED;
  return (
    <span className="tiny semi" style={{ background: s.bg, color: s.fg, padding: "3px 10px", borderRadius: 999, flexShrink: 0 }}>
      {s.label}
    </span>
  );
}

/**
 * Live delivery tracking for the business owner/manager.
 *
 * The Deliveries tab in BusinessAppointments is for *assigning* work; this is
 * for watching it happen — where each agent currently is, which stop they're
 * on, and how far through their run they are. Filterable per agent (who's out
 * right now) and per order.
 */
export default function BusinessDeliveries() {
  const { id = "" } = useParams();
  const [agentFilter, setAgentFilter] = useState<string | "ALL">("ALL");
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const { data: business } = useQuery(() => businessService.get(id), [id], `business:${id}`);
  // Realtime on the stop rows; the batch's moving position is picked up by the
  // same refetch, since a position push updates delivery_batches which the
  // agent also touches per stop.
  const { data, loading, error, refetch } = useQueryWithRealtime<BusinessDeliveryItem[]>(
    () => deliveryService.businessDeliveries(id),
    "appointment_deliveries",
    [id],
    `business_id=eq.${id}`,
  );

  const all = useMemo(() => data ?? [], [data]);
  const active = useMemo(
    () => all.filter((d) => (ACTIVE_STATUSES as readonly string[]).includes(d.status)),
    [all],
  );
  const done = useMemo(
    () => all.filter((d) => !(ACTIVE_STATUSES as readonly string[]).includes(d.status)).slice(0, 25),
    [all],
  );

  // Agents currently carrying at least one active stop.
  const agents = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; avatar: string | null; count: number }>();
    for (const d of active) {
      if (!d.agentUserId) continue;
      const prev = seen.get(d.agentUserId);
      if (prev) prev.count += 1;
      else seen.set(d.agentUserId, { id: d.agentUserId, name: d.agentName, avatar: d.agentAvatar, count: 1 });
    }
    return Array.from(seen.values());
  }, [active]);

  const visible = agentFilter === "ALL" ? active : active.filter((d) => d.agentUserId === agentFilter);

  // Map: the agent's live position (from the batch) plus every visible stop,
  // joined in route order so the owner sees the path being followed.
  const agentPoints = useMemo(() => {
    const byBatch = new Map<string, { lat: number; lng: number; name: string }>();
    for (const d of visible) {
      if (d.batchId && d.batchLat != null && d.batchLng != null && !byBatch.has(d.batchId)) {
        byBatch.set(d.batchId, { lat: d.batchLat, lng: d.batchLng, name: d.agentName });
      }
    }
    return Array.from(byBatch.values());
  }, [visible]);

  const stopPoints = useMemo(
    () =>
      visible
        .filter((d) => d.deliveryLat != null && d.deliveryLng != null)
        .sort((a, b) => (a.stopOrder ?? 999) - (b.stopOrder ?? 999)),
    [visible],
  );

  const mapCenter: [number, number] | null =
    agentPoints[0]
      ? [agentPoints[0].lat, agentPoints[0].lng]
      : stopPoints[0]
        ? [stopPoints[0].deliveryLat!, stopPoints[0].deliveryLng!]
        : business?.lat && business?.lng
          ? [business.lat, business.lng]
          : null;

  const routeLine: [number, number][] = [
    ...agentPoints.map((a) => [a.lat, a.lng] as [number, number]),
    ...stopPoints.map((s) => [s.deliveryLat!, s.deliveryLng!] as [number, number]),
  ];

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Deliveries" />
        <ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} />
      </div>
    );
  }

  return (
    <div className="screen with-nav">
      <AppBar title="Live deliveries" subtitle={active.length > 0 ? `${active.length} in progress` : "Nothing out right now"} />

      <div className="screen-scroll">
        {loading ? (
          <div className="page-pad" style={{ paddingTop: 12 }}><ListSkeleton count={3} /></div>
        ) : error ? (
          <ErrorView error={error} onRetry={refetch} />
        ) : (
          <>
            {mapCenter && visible.length > 0 && (
              <div className="page-pad" style={{ paddingTop: 12, paddingBottom: 0 }}>
                <div style={{ height: 240, borderRadius: 16, overflow: "hidden", border: "1px solid var(--line)" }}>
                  <MapContainer center={mapCenter} zoom={13} style={{ width: "100%", height: "100%" }} zoomControl={false} attributionControl={false}>
                    <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
                    {business?.lat && business?.lng && (
                      <Marker position={[business.lat, business.lng]} icon={makePinIcon("var(--orange-500)")} />
                    )}
                    {agentPoints.map((a, i) => (
                      <Marker key={`agent-${i}`} position={[a.lat, a.lng]} icon={makePinIcon("var(--delivery-600)")} />
                    ))}
                    {stopPoints.map((s) => (
                      <Marker
                        key={s.id}
                        position={[s.deliveryLat!, s.deliveryLng!]}
                        icon={makePinIcon(s.id === focusedId ? "var(--brand-600)" : "var(--ink-400)")}
                      />
                    ))}
                    {routeLine.length > 1 && (
                      <Polyline positions={routeLine} pathOptions={{ color: "var(--delivery-600)", weight: 3, dashArray: "6 8" }} />
                    )}
                  </MapContainer>
                </div>
                {agentPoints.length === 0 && (
                  <div className="tiny muted" style={{ marginTop: 6 }}>
                    No live position yet — agents appear on the map once they start a run.
                  </div>
                )}
              </div>
            )}

            {/* Per-agent filter */}
            {agents.length > 0 && (
              <div className="hscroll" style={{ paddingTop: 12, paddingBottom: 4 }}>
                <button className={`chip ${agentFilter === "ALL" ? "active" : ""}`} onClick={() => setAgentFilter("ALL")}>
                  All agents ({active.length})
                </button>
                {agents.map((a) => (
                  <button key={a.id} className={`chip ${agentFilter === a.id ? "active" : ""}`} onClick={() => setAgentFilter(a.id)}>
                    {a.name} ({a.count})
                  </button>
                ))}
              </div>
            )}

            <div className="page-pad col gap-10" style={{ paddingTop: 12, paddingBottom: 24 }}>
              {visible.length === 0 ? (
                <EmptyState
                  emoji="🛵"
                  title="No deliveries in progress"
                  text="Assign a delivery from the Bookings → Deliveries tab and track it here."
                />
              ) : (
                visible.map((d) => (
                  <DeliveryRow
                    key={d.id}
                    d={d}
                    focused={focusedId === d.id}
                    onFocus={() => setFocusedId(focusedId === d.id ? null : d.id)}
                  />
                ))
              )}

              {done.length > 0 && (
                <>
                  <div className="tiny bold muted" style={{ textTransform: "uppercase", letterSpacing: 0.8, fontSize: 9, marginTop: 8 }}>
                    Recently finished
                  </div>
                  {done.map((d) => (
                    <div key={d.id} className="card row gap-10 center-v" style={{ padding: 11, opacity: 0.72 }}>
                      <CheckCircle size={16} color={d.status === "DELIVERED" ? "var(--green-500)" : "var(--ink-400)"} />
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="semi small ellipsis">{d.customerName}</div>
                        <div className="tiny muted ellipsis">
                          {d.agentName}
                          {d.deliveredAt ? ` · ${new Date(d.deliveredAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
                        </div>
                      </div>
                      <StatusPill status={d.status} />
                    </div>
                  ))}
                </>
              )}
            </div>
          </>
        )}
      </div>

      <ManageNav bizId={id} />
    </div>
  );
}

function DeliveryRow({ d, focused, onFocus }: { d: BusinessDeliveryItem; focused: boolean; onFocus: () => void }) {
  const routable = d.deliveryLat != null && d.deliveryLng != null;
  return (
    <div className="card col gap-9" style={{ padding: 12, border: focused ? "1.5px solid var(--delivery-600)" : undefined }}>
      <button type="button" onClick={onFocus} className="row gap-10 center-v" style={{ width: "100%", textAlign: "left" }}>
        <SafeImg src={d.agentAvatar ?? undefined} variant="avatar" style={{ width: 34, height: 34, flexShrink: 0 }} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="semi small ellipsis">{d.agentName}</div>
          <div className="tiny muted ellipsis">
            → {d.customerName}
            {d.stopOrder != null ? ` · stop ${d.stopOrder}` : ""}
          </div>
        </div>
        <StatusPill status={d.status} />
      </button>

      <div className="row gap-8 center-v" style={{ padding: "7px 9px", background: "var(--ink-50)", borderRadius: 9 }}>
        <MapPin size={13} color="var(--ink-500)" />
        <div className="tiny grow ellipsis muted">{d.deliveryAddressLine || "No address on file"}</div>
      </div>

      {(d.deliveryEtaText || d.handoffVerified) && (
        <div className="row gap-10 center-v tiny muted">
          {d.deliveryEtaText && <span>ETA promised: <b style={{ color: "var(--ink-700)" }}>{d.deliveryEtaText}</b></span>}
          {d.handoffVerified && <span style={{ color: "var(--green-600)" }}>· Handoff verified ✓</span>}
        </div>
      )}

      <div className="row gap-8">
        {d.agentPhone && (
          <a className="btn btn-outline btn-sm grow row gap-6 center" href={`tel:${d.agentPhone}`}>
            <Phone size={13} /> Call agent
          </a>
        )}
        {routable && (
          <button
            className="btn btn-outline btn-sm grow row gap-6 center"
            onClick={() => openRoute([{ lat: d.deliveryLat!, lng: d.deliveryLng! }])}
          >
            <Navigation size={13} /> Drop-off
          </button>
        )}
      </div>
    </div>
  );
}
