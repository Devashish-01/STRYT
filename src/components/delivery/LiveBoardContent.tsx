import { trackingUrl } from "@/lib/trackingLink";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { RASTER_TILES } from "@/lib/mapTiles";
import { EmptyState, SafeImg } from "@/components/common";
import { ListSkeleton, ErrorView } from "@/components/states";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { businessService, deliveryService } from "@/services";
import type { BusinessDeliveryItem, CancelReason } from "@/services/engagement/deliveryService";
import { useApp } from "@/store";
import CantDeliverSheet from "@/components/delivery/CantDeliverSheet";
import DeliveryAssignControl from "@/components/delivery/DeliveryAssignControl";
import { MapLocateButton } from "@/components/MapLocateButton";
import { recognizeLocation, requestPreciseLocation } from "@/lib/mapLocate";
import {
  Package,
  MapPin,
  Phone,
  CheckCircle,
  Navigation,
  XCircle,
  Share2,
  Plus,
  Minus,
} from "@/components/Icons";
import { makePinIcon } from "@/lib/leafletIcon";
import "@/lib/leafletIcon";
import { openRoute } from "@/lib/routeLink";
import DeliveryStatusPill from "@/components/delivery/DeliveryStatusPill";
import { errorMessage } from "@/lib/errorMessage";
import { useI18n } from "@/lib/i18n";
import { cancelReasonKey, deliveryHealth } from "@/lib/deliveryHealth";

const ACTIVE_STATUSES = ["ASSIGNED", "EN_ROUTE", "ARRIVED"] as const;

// Keep leaflet marker helper referenced so default icon CSS stays bundled.
void makePinIcon;

function FleetMapController({
  center,
  focusedCoords,
  userAdjustedRef,
  onMapReady,
}: {
  center: [number, number] | null;
  focusedCoords?: [number, number] | null;
  userAdjustedRef: React.MutableRefObject<boolean>;
  onMapReady: (map: L.Map) => void;
}) {
  const map = useMap();
  const centered = useRef(false);
  const programmaticRef = useRef(false);
  const focusKey = focusedCoords ? `${focusedCoords[0]},${focusedCoords[1]}` : "";

  useEffect(() => {
    onMapReady(map);
    const markUser = () => {
      if (!programmaticRef.current) userAdjustedRef.current = true;
    };
    const clearProgrammatic = () => {
      programmaticRef.current = false;
    };
    map.on("dragstart", markUser);
    map.on("zoomstart", markUser);
    map.on("moveend", clearProgrammatic);
    return () => {
      map.off("dragstart", markUser);
      map.off("zoomstart", markUser);
      map.off("moveend", clearProgrammatic);
    };
  }, [map, onMapReady, userAdjustedRef]);

  useEffect(() => {
    if (focusedCoords) {
      programmaticRef.current = true;
      map.flyTo(focusedCoords, 15, { duration: 0.8 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, map]);

  useEffect(() => {
    if (!centered.current && !userAdjustedRef.current && center) {
      programmaticRef.current = true;
      map.panTo(center);
      centered.current = true;
    }
  }, [center, map, userAdjustedRef]);

  return null;
}

export function LiveBoardContent({
  businessId,
  onGoDispatch,
  showFinished = true,
  onActiveCountChange,
}: {
  businessId: string;
  onGoDispatch?: () => void;
  showFinished?: boolean;
  onActiveCountChange?: (count: number) => void;
}) {
  const nav = useNavigate();
  const { showToast } = useApp();
  const { t, tf } = useI18n();
  const [agentFilter, setAgentFilter] = useState<string | "ALL">("ALL");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<BusinessDeliveryItem | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const fleetMapRef = useRef<L.Map | null>(null);
  const userAdjustedRef = useRef(false);

  async function cancelDelivery(reason: CancelReason, note: string) {
    const target = cancelTarget;
    if (!target || cancelBusy) return;
    setCancelBusy(true);
    try {
      await deliveryService.cancelDelivery(target.id, reason, note);
      setCancelTarget(null);
      showToast(`Delivery cancelled — ${target.agentName} has been notified`);
      refetch();
    } catch (e) {
      showToast(errorMessage(e, "Couldn't cancel — try again"));
    } finally {
      setCancelBusy(false);
    }
  }

  const { data: business } = useQuery(() => businessService.get(businessId), [businessId], `business:${businessId}`);
  const { data, loading, error, refetch } = useQueryWithRealtime<BusinessDeliveryItem[]>(
    () => deliveryService.businessDeliveries(businessId),
    "appointment_deliveries",
    [businessId],
    `business_id=eq.${businessId}`,
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

  useEffect(() => {
    onActiveCountChange?.(active.length);
  }, [active.length, onActiveCountChange]);

  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      refetch();
    };
    const interval = setInterval(tick, 12000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", tick);
    };
  }, [refetch]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

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
  const focusedDelivery = useMemo(() => all.find((d) => d.id === focusedId) ?? null, [all, focusedId]);

  const agentPoints = useMemo(() => {
    const byAgent = new Map<string, { lat: number; lng: number; name: string }>();
    for (const d of visible) {
      if (d.agentUserId && d.agentLat != null && d.agentLng != null && !byAgent.has(d.agentUserId)) {
        byAgent.set(d.agentUserId, { lat: d.agentLat, lng: d.agentLng, name: d.agentName });
      }
    }
    return Array.from(byAgent.values());
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

  const routeLine: [number, number][] = useMemo(() => {
    if (agentFilter === "ALL" || agentPoints.length === 0) return [];
    const agent = agentPoints[0];
    return [
      [agent.lat, agent.lng],
      ...stopPoints.map((s) => [s.deliveryLat!, s.deliveryLng!] as [number, number]),
    ];
  }, [agentFilter, agentPoints, stopPoints]);

  const storeMarkerIcon = useMemo(() => {
    const sName = business?.name || "Store";
    return L.divIcon({
      html: `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;">
          <div style="display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:12px;background:#ffffff;border:2.5px solid var(--brand-600);box-shadow:0 4px 14px rgba(0,0,0,0.24);font-size:19px;">
            🏬
          </div>
          <div style="margin-top:3px;white-space:nowrap;background:rgba(15,23,42,0.88);color:#ffffff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,0.25);pointer-events:none;">
            ${sName}
          </div>
        </div>
      `,
      className: "",
      iconSize: [38, 58],
      iconAnchor: [19, 19],
    });
  }, [business?.name]);

  const getRiderIcon = (name: string) =>
    L.divIcon({
      html: `
        <div style="position:relative;width:56px;height:56px;display:flex;align-items:center;justify-content:center;pointer-events:none;">
          <div style="position:absolute;width:48px;height:48px;border-radius:50%;background:rgba(234, 88, 12, 0.25);animation:dlv-radar-pulse 2s cubic-bezier(0,0,0.2,1) infinite;"></div>
          <div style="position:relative;z-index:3;width:38px;height:38px;border-radius:50%;background:#ea580c;border:3px solid #ffffff;box-shadow:0 4px 14px rgba(0,0,0,0.32);display:flex;align-items:center;justify-content:center;">
            <span style="font-size:19px;line-height:1;">🛵</span>
          </div>
          <div style="position:absolute;top:-20px;white-space:nowrap;background:rgba(15,23,42,0.88);color:#ffffff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,0.25);z-index:4;">
            ${name}
          </div>
        </div>
      `,
      className: "",
      iconSize: [56, 56],
      iconAnchor: [28, 28],
    });

  const getStopIcon = (label: string, isFocused: boolean) =>
    L.divIcon({
      html: `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;">
          <div style="display:flex;align-items:center;justify-content:center;width:${isFocused ? 36 : 30}px;height:${isFocused ? 36 : 30}px;border-radius:50%;background:${isFocused ? "var(--red-500)" : "#64748b"};border:2.5px solid #ffffff;box-shadow:0 3px 12px rgba(0,0,0,0.26);font-size:${isFocused ? 16 : 13}px;color:#ffffff;">
            🏠
          </div>
          ${isFocused ? `
            <div style="margin-top:2px;white-space:nowrap;background:var(--red-600);color:#ffffff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:5px;box-shadow:0 2px 6px rgba(0,0,0,0.2);pointer-events:none;">
              ${label}
            </div>
          ` : ""}
        </div>
      `,
      className: "",
      iconSize: [36, 54],
      iconAnchor: [18, 18],
    });

  const fitFleet = async () => {
    userAdjustedRef.current = false;
    const map = fleetMapRef.current;
    if (!map) return;
    const bounds = L.latLngBounds([]);
    if (business?.lat && business?.lng) bounds.extend([business.lat, business.lng]);
    for (const a of agentPoints) bounds.extend([a.lat, a.lng]);
    for (const s of stopPoints) bounds.extend([s.deliveryLat!, s.deliveryLng!]);
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 });
      return;
    }
    const { fix } = await recognizeLocation();
    if (fix) map.flyTo([fix.lat, fix.lng], 15, { duration: 0.5 });
  };

  const locatePrecise = async () => {
    userAdjustedRef.current = false;
    showToast(t("map_precise_asking"));
    const { fix, state, openedSettings } = await requestPreciseLocation();
    if (fix && fleetMapRef.current) {
      fleetMapRef.current.flyTo([fix.lat, fix.lng], 15, { duration: 0.5 });
      if (fix.precision === "precise" && typeof fix.accuracy === "number") {
        showToast(tf("map_precise_updated", { m: Math.max(1, Math.round(fix.accuracy)) }));
      }
    } else if (!openedSettings && state !== "precise") {
      showToast(t("map_precise_enable_hint"));
    }
  };

  if (loading) {
    return <div className="page-pad" style={{ paddingTop: 12 }}><ListSkeleton count={3} /></div>;
  }
  if (error) {
    return <ErrorView error={error} onRetry={refetch} />;
  }

  return (
    <>
      {mapCenter && visible.length > 0 && (
        <div className="page-pad" style={{ paddingTop: 12, paddingBottom: 0 }}>
          <div style={{ position: "relative", height: 280, borderRadius: 20, overflow: "hidden", border: "1px solid var(--line)", boxShadow: "0 6px 20px rgba(0,0,0,0.08)" }}>
            <style>{`
              .delivery-map-tiles {
                filter: saturate(1.12) contrast(1.02);
              }
              @keyframes dlv-radar-pulse {
                0% { transform: scale(0.85); opacity: 0.9; }
                100% { transform: scale(2.0); opacity: 0; }
              }
            `}</style>
            {/* Floating Fleet Radar Status Pill */}
            <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 1000, pointerEvents: "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20, background: "rgba(255,255,255,0.94)", boxShadow: "0 4px 12px rgba(0,0,0,0.15)", border: "1px solid var(--line)", backdropFilter: "blur(6px)", whiteSpace: "nowrap" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green-500)", display: "inline-block", animation: "dlv-radar-pulse 2s infinite" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-900)" }}>
                  {agentPoints.length > 0 ? `${agentPoints.length} Rider(s) Active · ${active.length} In Transit` : "Waiting for rider location…"}
                </span>
              </div>
            </div>

            <MapContainer center={mapCenter} zoom={13} style={{ width: "100%", height: "100%" }} zoomControl={false} attributionControl={false}>
              <TileLayer {...RASTER_TILES} className="delivery-map-tiles" />
              <FleetMapController
                center={mapCenter}
                focusedCoords={
                  focusedDelivery?.deliveryLat != null && focusedDelivery?.deliveryLng != null
                    ? [focusedDelivery.deliveryLat, focusedDelivery.deliveryLng]
                    : null
                }
                userAdjustedRef={userAdjustedRef}
                onMapReady={(m) => { fleetMapRef.current = m; }}
              />
              {business?.lat && business?.lng && (
                <Marker position={[business.lat, business.lng]} icon={storeMarkerIcon} zIndexOffset={900} />
              )}
              {agentPoints.map((a, i) => (
                <Marker key={`agent-${i}`} position={[a.lat, a.lng]} icon={getRiderIcon(a.name)} zIndexOffset={1200} />
              ))}
              {stopPoints.map((s) => (
                <Marker
                  key={s.id}
                  position={[s.deliveryLat!, s.deliveryLng!]}
                  icon={getStopIcon(s.customerName || "Customer", s.id === focusedId)}
                  zIndexOffset={s.id === focusedId ? 1100 : 800}
                  eventHandlers={{
                    click: () => setFocusedId(focusedId === s.id ? null : s.id),
                  }}
                />
              ))}
              {routeLine.length > 1 && (
                <>
                  <Polyline positions={routeLine} pathOptions={{ color: "#0f172a", weight: 7, opacity: 0.2 }} />
                  <Polyline positions={routeLine} pathOptions={{ color: "#ea580c", weight: 4, opacity: 0.95 }} />
                </>
              )}
            </MapContainer>

            {/* Map Controls: 1-tap recenter/locate + 2-tap precise + zoom */}
            <div style={{ position: "absolute", right: 8, bottom: 8, zIndex: 1000, display: "flex", flexDirection: "column", gap: 5 }}>
              <MapLocateButton compact icon="target" onSingleTap={fitFleet} onDoubleTap={locatePrecise} />
              <div style={{ display: "flex", flexDirection: "column", borderRadius: 8, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.14)", border: "1px solid var(--line)", background: "var(--surface)" }}>
                <button
                  type="button"
                  onClick={() => { userAdjustedRef.current = true; fleetMapRef.current?.zoomIn(); }}
                  style={{ width: 32, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface)", color: "var(--ink-700)", border: "none", borderBottom: "1px solid var(--line)", cursor: "pointer" }}
                  aria-label="Zoom in"
                >
                  <Plus size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => { userAdjustedRef.current = true; fleetMapRef.current?.zoomOut(); }}
                  style={{ width: 32, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface)", color: "var(--ink-700)", border: "none", cursor: "pointer" }}
                  aria-label="Zoom out"
                >
                  <Minus size={13} />
                </button>
              </div>
            </div>
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
          <button type="button" className={`chip ${agentFilter === "ALL" ? "active" : ""}`} onClick={() => setAgentFilter("ALL")}>
            All agents ({active.length})
          </button>
          {agents.map((a) => (
            <button key={a.id} type="button" className={`chip ${agentFilter === a.id ? "active" : ""}`} onClick={() => setAgentFilter(a.id)}>
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
            text="Assign a delivery from Dispatch and track it live here."
            action={
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => (onGoDispatch ? onGoDispatch() : nav(`/business/${businessId}/manage/appointments?tab=deliveries&view=dispatch`))}
              >
                {t("dlv_go_dispatch")}
              </button>
            }
          />
        ) : (
          visible.map((d) => (
            <LiveDeliveryRow
              key={d.id}
              d={d}
              now={now}
              focused={focusedId === d.id}
              businessId={businessId}
              onFocus={() => setFocusedId(focusedId === d.id ? null : d.id)}
              onCancel={setCancelTarget}
              onReassigned={refetch}
            />
          ))
        )}

        {showFinished && done.length > 0 && (
          <>
            <div className="tiny bold muted" style={{ textTransform: "uppercase", letterSpacing: 0.8, fontSize: 9, marginTop: 8 }}>
              Recently finished
            </div>
            {done.map((d) => (
              <div key={d.id} className="card row gap-10 center-v" style={{ padding: 11, opacity: 0.72 }}>
                {d.status === "CANCELLED" ? (
                  <XCircle size={16} color="var(--red-500)" />
                ) : (
                  <CheckCircle size={16} color={d.status === "DELIVERED" ? "var(--green-500)" : "var(--ink-400)"} />
                )}
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="semi small ellipsis">{d.customerName}</div>
                  <div className="tiny muted ellipsis">
                    {d.agentName}
                    {d.deliveredAt ? ` · ${new Date(d.deliveredAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
                  </div>
                  {d.status === "CANCELLED" && cancelReasonKey(d.cancelReason) && (
                    <div className="tiny" style={{ color: "var(--red-600)", marginTop: 2 }}>
                      {t(cancelReasonKey(d.cancelReason)!)}
                      {d.cancelNote ? ` — ${d.cancelNote}` : ""}
                    </div>
                  )}
                </div>
                <DeliveryStatusPill status={d.status} />
              </div>
            ))}
          </>
        )}
      </div>

      {cancelTarget && (
        <CantDeliverSheet
          variant="business"
          orderLabel={`Delivery by ${cancelTarget.agentName}`}
          customerName={cancelTarget.customerName}
          busy={cancelBusy}
          onConfirm={cancelDelivery}
          onClose={() => setCancelTarget(null)}
        />
      )}
    </>
  );
}

function LiveDeliveryRow({
  d,
  now,
  focused,
  businessId,
  onFocus,
  onCancel,
  onReassigned,
}: {
  d: BusinessDeliveryItem;
  now: number;
  focused: boolean;
  businessId: string;
  onFocus: () => void;
  onCancel: (d: BusinessDeliveryItem) => void;
  onReassigned: () => void;
}) {
  const { showToast } = useApp();
  const { tf } = useI18n();
  const health = deliveryHealth(d, now);
  const [sharing, setSharing] = useState(false);
  const routable = d.deliveryLat != null && d.deliveryLng != null;
  const live = (ACTIVE_STATUSES as readonly string[]).includes(d.status);

  async function handleShare() {
    if (sharing) return;
    setSharing(true);
    try {
      const token = await deliveryService.createTrackingToken(d.appointmentId);
      const url = trackingUrl(token);
      if (navigator.share) {
        try {
          await navigator.share({ title: `Order tracking for ${d.customerName}`, url });
          return;
        } catch {
          /* fallback to clipboard */
        }
      }
      await navigator.clipboard.writeText(url);
      showToast("Tracking link copied to clipboard");
    } catch (e) {
      showToast(errorMessage(e, "Could not generate tracking link"));
    } finally {
      setSharing(false);
    }
  }

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
        <DeliveryStatusPill status={d.status} />
      </button>

      <div className="row gap-8 center-v" style={{ padding: "7px 9px", background: "var(--ink-50)", borderRadius: 9 }}>
        <MapPin size={13} color="var(--ink-500)" />
        <div className="tiny grow ellipsis muted">{d.deliveryAddressLine || "No address on file"}</div>
      </div>

      {health.key && (
        <div
          className="tiny semi"
          style={{
            padding: "6px 9px",
            borderRadius: 8,
            color: health.tone === "bad" ? "var(--red-700)" : "var(--amber-800)",
            background: health.tone === "bad" ? "var(--red-50)" : "var(--amber-50)",
          }}
        >
          {tf(health.key, { n: health.minutes })}
        </div>
      )}

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
            type="button"
            className="btn btn-outline btn-sm grow row gap-6 center"
            onClick={() => openRoute([{ lat: d.deliveryLat!, lng: d.deliveryLng! }])}
          >
            <Navigation size={13} /> Drop-off
          </button>
        )}
      </div>

      {focused && live && (
        <>
          <DeliveryAssignControl appointmentId={d.appointmentId} businessId={businessId} onChanged={onReassigned} />
          <div className="row gap-8 center-v">
            <button
              type="button"
              className="btn btn-outline btn-sm grow row gap-6 center"
              onClick={handleShare}
              disabled={sharing}
            >
              <Share2 size={13} /> Share tracking link
            </button>
            <button
              type="button"
              className="tiny"
              style={{ minHeight: 32, color: "var(--red-600)", padding: "0 8px" }}
              onClick={() => onCancel(d)}
            >
              Cancel delivery
            </button>
          </div>
        </>
      )}
    </div>
  );
}
