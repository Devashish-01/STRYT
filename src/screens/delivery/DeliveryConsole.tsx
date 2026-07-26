import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useQuery } from "@/hooks/useApi";
import { deliveryService, type DeliveryItem, type DeliveryLiveStatus, type DeliveryBatchStatus } from "@/services/engagement/deliveryService";
import { useApp } from "@/store";
import { haptics } from "@/lib/haptics";
import { nativeGeolocation } from "@/lib/nativeGeolocation";
import { backgroundLocation } from "@/lib/backgroundLocation";
import { haversineKm } from "@/lib/geocode";
import { makePinIcon } from "@/lib/leafletIcon";
import "@/lib/leafletIcon";
import RoleSwitcher from "@/components/RoleSwitcher";
import { EmptyState } from "@/components/common";
import { ListSkeleton } from "@/components/states";
import { Package, MapPin, Clock, CheckCircle, Navigation } from "@/components/Icons";
import BackgroundLocationDisclosure from "@/features/live-share/BackgroundLocationDisclosure";

/** Best-effort current position; resolves null if unavailable/denied. */
function getGPS(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((res) =>
    nativeGeolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => res(null),
      { timeout: 5000 },
    ),
  );
}

// Same OS-level "always allow background location" consent live-share already
// asks for — reused so a user who already accepted it there isn't asked twice.
const DISCLOSURE_KEY = "stryt_bg_location_disclosure_v1";

type Tab = "ACTIVE" | "ASSIGNED" | "HISTORY";

const STEPS: { key: string; label: string }[] = [
  { key: "ASSIGNED", label: "Assigned" },
  { key: "EN_ROUTE", label: "On the way" },
  { key: "ARRIVED", label: "Arrived" },
  { key: "DELIVERED", label: "Delivered" },
];
const STEP_INDEX: Record<string, number> = { ASSIGNED: 0, EN_ROUTE: 1, ARRIVED: 2, DELIVERED: 3 };

function whenLabel(d: DeliveryItem): string {
  if (d.dateLabel || d.timeLabel) return [d.dateLabel, d.timeLabel].filter(Boolean).join(" · ");
  if (d.scheduledFor) return new Date(d.scheduledFor).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return "Anytime";
}

function openNativeDirections(lat: number, lng: number) {
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, "_blank", "noopener");
}

interface BatchGroup {
  batchId: string;
  status: DeliveryBatchStatus;
  items: DeliveryItem[]; // sorted by stopOrder
  lat: number | null;
  lng: number | null;
}

function groupBatches(items: DeliveryItem[]): BatchGroup[] {
  const map = new Map<string, DeliveryItem[]>();
  for (const d of items) {
    if (!d.batchId) continue;
    if (!map.has(d.batchId)) map.set(d.batchId, []);
    map.get(d.batchId)!.push(d);
  }
  return Array.from(map.entries()).map(([batchId, list]) => ({
    batchId,
    status: (list[0].batchStatus ?? "ACCEPTED") as DeliveryBatchStatus,
    items: [...list].sort((a, b) => (a.stopOrder ?? 999) - (b.stopOrder ?? 999)),
    lat: list[0].batchLat,
    lng: list[0].batchLng,
  }));
}

/** Greedy nearest-neighbor route ordering from the agent's current fix through every
 *  stop — free, instant, no API key. Stops missing a captured address/coords (booked
 *  before delivery addresses existed) sort last rather than breaking the ordering. */
function computeNearestNeighborOrder(start: { lat: number; lng: number }, stops: DeliveryItem[]): DeliveryItem[] {
  const withCoords = stops.filter((s) => s.deliveryLat != null && s.deliveryLng != null);
  const withoutCoords = stops.filter((s) => s.deliveryLat == null || s.deliveryLng == null);
  const remaining = [...withCoords];
  const ordered: DeliveryItem[] = [];
  let current = start;
  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const dist = haversineKm(current.lat, current.lng, remaining[i].deliveryLat!, remaining[i].deliveryLng!);
      if (dist < bestDist) { bestDist = dist; bestIdx = i; }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    ordered.push(next);
    current = { lat: next.deliveryLat!, lng: next.deliveryLng! };
  }
  return [...ordered, ...withoutCoords];
}

export default function DeliveryConsole() {
  const { showToast } = useApp();
  const { data, loading, refetch } = useQuery(() => deliveryService.myDeliveries(), [], "my-deliveries");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [decidingBatch, setDecidingBatch] = useState<string | null>(null);
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const disclosureResolver = useRef<((accepted: boolean) => void) | null>(null);
  const watchingBatchId = useRef<string | null>(null);

  const items = useMemo(() => data ?? [], [data]);
  const soloItems = items.filter((d) => !d.batchId);
  const batches = useMemo(() => groupBatches(items), [items]);
  const pendingBatch = batches.find((b) => b.status === "PENDING_ACCEPTANCE") ?? null;
  const activeBatches = batches.filter((b) => b.status === "ACCEPTED" || b.status === "IN_PROGRESS");
  const historyBatches = batches.filter((b) => b.status === "COMPLETED" || b.status === "CANCELLED");

  const soloActive = soloItems.filter((d) => d.status === "EN_ROUTE" || d.status === "ARRIVED");
  const soloAssigned = soloItems.filter((d) => d.status === "ASSIGNED");
  const soloHistory = soloItems.filter((d) => d.status === "DELIVERED" || d.status === "CANCELLED");

  const [tab, setTab] = useState<Tab>("ACTIVE");

  function ensureDisclosure(): Promise<boolean> {
    try {
      if (localStorage.getItem(DISCLOSURE_KEY) === "1") return Promise.resolve(true);
    } catch { /* ignore */ }
    return new Promise((resolve) => {
      disclosureResolver.current = resolve;
      setDisclosureOpen(true);
    });
  }
  function acceptDisclosure() {
    try { localStorage.setItem(DISCLOSURE_KEY, "1"); } catch { /* ignore */ }
    setDisclosureOpen(false);
    disclosureResolver.current?.(true);
    disclosureResolver.current = null;
  }
  function declineDisclosure() {
    setDisclosureOpen(false);
    disclosureResolver.current?.(false);
    disclosureResolver.current = null;
  }

  // Live GPS for an accepted multi-stop run: the proven background-capable watcher
  // (already used by live-share), not the old foreground-only 30s poll — a run can
  // take much longer than a single drop-off, so surviving a backgrounded app matters.
  const runningBatch = activeBatches[0] ?? null;
  useEffect(() => {
    if (!runningBatch) {
      if (watchingBatchId.current) {
        watchingBatchId.current = null;
        void backgroundLocation.stop();
      }
      return;
    }
    if (watchingBatchId.current === runningBatch.batchId) return;
    watchingBatchId.current = runningBatch.batchId;
    const bId = runningBatch.batchId;
    void (async () => {
      const allowed = await ensureDisclosure();
      if (!allowed || watchingBatchId.current !== bId) return;
      void backgroundLocation.start((f) => {
        void deliveryService.updateBatchPosition(bId, f.lat, f.lng, f.accuracy, f.heading).catch(() => { /* transient */ });
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningBatch?.batchId]);

  useEffect(() => () => { void backgroundLocation.stop(); }, []);

  // Legacy solo GPS push — unchanged 30s poll, only for non-batched deliveries.
  const soloEnRoute = soloActive.find((d) => d.status === "EN_ROUTE");
  const soloEnRouteId = soloEnRoute?.id ?? null;
  const pushTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!soloEnRouteId) return;
    const tick = async () => {
      const c = await getGPS();
      if (c) { try { await deliveryService.updateStatus(soloEnRouteId, "ON_THE_WAY", c.lat, c.lng); } catch { /* transient */ } }
    };
    void tick();
    pushTimer.current = setInterval(tick, 30000);
    return () => { if (pushTimer.current) clearInterval(pushTimer.current); };
  }, [soloEnRouteId]);

  async function advance(d: DeliveryItem, next: DeliveryLiveStatus, okMsg: string) {
    setBusyId(d.id);
    haptics.medium();
    try {
      const c = await getGPS();
      await deliveryService.updateStatus(d.id, next, c?.lat, c?.lng);
      haptics.success();
      showToast(okMsg);
      refetch();
    } catch (e: any) {
      showToast(e?.message || "Couldn't update — try again");
    } finally {
      setBusyId(null);
    }
  }

  async function verifyHandoff(d: DeliveryItem, code: string): Promise<boolean> {
    try {
      const ok = await deliveryService.confirmHandoff(d.id, code.trim());
      if (ok) { haptics.success(); showToast("Handoff confirmed"); refetch(); }
      else { showToast("Code doesn't match — check with the customer"); }
      return ok;
    } catch (e: any) {
      showToast(e?.message || "Couldn't verify — try again");
      return false;
    }
  }

  async function acceptRun(batch: BatchGroup) {
    setDecidingBatch(batch.batchId);
    haptics.medium();
    try {
      const gps = await getGPS();
      const order = gps ? computeNearestNeighborOrder(gps, batch.items) : batch.items;
      await deliveryService.acceptBatch(batch.batchId, order.map((i) => i.id));
      haptics.success();
      showToast(`Accepted — ${batch.items.length} stops`);
      refetch();
    } catch (e: any) {
      showToast(e?.message || "Couldn't accept — try again");
    } finally {
      setDecidingBatch(null);
    }
  }

  async function declineRun(batch: BatchGroup) {
    setDecidingBatch(batch.batchId);
    haptics.warning();
    try {
      await deliveryService.declineBatch(batch.batchId);
      showToast("Declined — the business has been notified");
      refetch();
    } catch (e: any) {
      showToast(e?.message || "Couldn't decline — try again");
    } finally {
      setDecidingBatch(null);
    }
  }

  // One primary action at a time: a pending run intercepts the whole console until
  // it's accepted or declined — nothing else competes with that decision.
  if (pendingBatch) {
    return (
      <div className="screen screen-boxed">
        <NewRunGate
          batch={pendingBatch}
          busy={decidingBatch === pendingBatch.batchId}
          onAccept={() => acceptRun(pendingBatch)}
          onDecline={() => declineRun(pendingBatch)}
        />
        {disclosureOpen && (
          <BackgroundLocationDisclosure
            onAccept={acceptDisclosure}
            onDecline={declineDisclosure}
            body="STRYT collects your precise location even when the app is closed or not in use so the business and customers on your delivery run can follow your progress until it's complete."
            noticeBody="Location is shared only for deliveries you've accepted. A persistent notification stays visible while sharing. Stop anytime by finishing or leaving the run."
          />
        )}
      </div>
    );
  }

  const counts = {
    ACTIVE: activeBatches.length + soloActive.length,
    ASSIGNED: soloAssigned.length,
    HISTORY: historyBatches.length + soloHistory.length,
  };

  return (
    <div className="screen screen-boxed">
      {/* Header — identity + one-tap switch back to Personal */}
      <div className="row between center-v" style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)", background: "var(--surface)" }}>
        <div className="row gap-10 center-v">
          <span style={{ width: 34, height: 34, borderRadius: 10, background: "var(--delivery-600)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Package size={18} />
          </span>
          <div>
            <div className="bold" style={{ fontSize: 16, lineHeight: 1.1 }}>Delivery</div>
            <div className="tiny muted">Your assigned deliveries</div>
          </div>
        </div>
        <RoleSwitcher enableLongPress />
      </div>

      {/* Tabs */}
      <div className="row" style={{ padding: "10px 12px 0", gap: 8 }}>
        {(["ACTIVE", "ASSIGNED", "HISTORY"] as Tab[]).map((t) => (
          <button
            key={t}
            className={`chip ${tab === t ? "active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "ACTIVE" ? "Active" : t === "ASSIGNED" ? "Assigned" : "History"}
            {counts[t] > 0 && <span className="tiny" style={{ marginLeft: 6, opacity: 0.75 }}>{counts[t]}</span>}
          </button>
        ))}
      </div>

      <div className="screen-scroll page-pad col gap-12" style={{ paddingTop: 12, paddingBottom: 30 }}>
        {loading ? (
          <ListSkeleton count={3} />
        ) : tab === "ACTIVE" ? (
          activeBatches.length === 0 && soloActive.length === 0 ? (
            <EmptyState emoji="🛵" title="No active delivery" text="When you accept a run or start a delivery it shows here with live controls." />
          ) : (
            <>
              {activeBatches.map((b) => (
                <RunCard key={b.batchId} batch={b} busyId={busyId} onAdvance={advance} onVerify={verifyHandoff} />
              ))}
              {soloActive.map((d) => (
                <DeliveryCard key={d.id} d={d} busy={busyId === d.id} onAdvance={advance} onVerify={verifyHandoff} />
              ))}
            </>
          )
        ) : tab === "ASSIGNED" ? (
          soloAssigned.length === 0 ? (
            <EmptyState emoji="🛵" title="Nothing assigned yet" text="New deliveries a business assigns to you will appear here." />
          ) : (
            soloAssigned.map((d) => (
              <DeliveryCard key={d.id} d={d} busy={busyId === d.id} onAdvance={advance} onVerify={verifyHandoff} />
            ))
          )
        ) : historyBatches.length === 0 && soloHistory.length === 0 ? (
          <EmptyState emoji="📦" title="No past deliveries" text="Completed and cancelled deliveries will be listed here." />
        ) : (
          <>
            {historyBatches.map((b) => <RunHistoryCard key={b.batchId} batch={b} />)}
            {soloHistory.map((d) => (
              <DeliveryCard key={d.id} d={d} busy={busyId === d.id} onAdvance={advance} onVerify={verifyHandoff} />
            ))}
          </>
        )}
      </div>

      {disclosureOpen && <BackgroundLocationDisclosure onAccept={acceptDisclosure} onDecline={declineDisclosure} />}
    </div>
  );
}

/** The accept-all-or-nothing moment — intercepts the whole console until decided. */
function NewRunGate({ batch, busy, onAccept, onDecline }: {
  batch: BatchGroup;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="col" style={{ minHeight: "100dvh", padding: "24px 20px", justifyContent: "center", gap: 22 }}>
      <div className="col center" style={{ gap: 10 }}>
        <span style={{ width: 64, height: 64, borderRadius: 20, background: "var(--delivery-50)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Package size={32} color="var(--delivery-600)" />
        </span>
        <div className="bold" style={{ fontSize: 20, textAlign: "center" }}>New delivery run</div>
        <div className="muted small" style={{ textAlign: "center" }}>
          {batch.items.length} {batch.items.length === 1 ? "stop" : "stops"} · accept the whole run, or decline it
        </div>
      </div>

      <div className="col gap-8" style={{ maxHeight: "40vh", overflowY: "auto" }}>
        {batch.items.map((d, i) => (
          <div key={d.id} className="row gap-10 center-v card card-condensed">
            <span style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--delivery-600)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
              {i + 1}
            </span>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="semi small ellipsis">{d.deliveryAddressLine || d.customerArea || "Address on file"}</div>
              <div className="tiny muted ellipsis">{d.businessName}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="col gap-10">
        <button
          className="btn btn-block"
          style={{ background: "var(--delivery-600)", color: "#fff", height: 52, fontSize: 16, fontWeight: 700 }}
          disabled={busy}
          onClick={onAccept}
        >
          {busy ? "…" : `Accept all ${batch.items.length}`}
        </button>
        <button className="btn btn-outline btn-block" disabled={busy} onClick={onDecline}>
          Decline
        </button>
      </div>
    </div>
  );
}

/** Multi-stop active run: live map + the current stop expanded + a collapsed queue. */
function RunCard({ batch, busyId, onAdvance, onVerify }: {
  batch: BatchGroup;
  busyId: string | null;
  onAdvance: (d: DeliveryItem, next: DeliveryLiveStatus, msg: string) => void;
  onVerify: (d: DeliveryItem, code: string) => Promise<boolean>;
}) {
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  const current = batch.items.find((d) => d.status !== "DELIVERED" && d.status !== "CANCELLED") ?? null;
  const remaining = batch.items.filter((d) => d.id !== current?.id && d.status !== "DELIVERED" && d.status !== "CANCELLED");

  if (!current) {
    return (
      <div className="card col center" style={{ padding: 24, gap: 8 }}>
        <CheckCircle size={28} color="var(--green-500)" />
        <div className="semi">All stops delivered</div>
      </div>
    );
  }

  const routePoints: [number, number][] = [
    ...(batch.lat != null && batch.lng != null ? [[batch.lat, batch.lng] as [number, number]] : []),
    ...(current.deliveryLat != null && current.deliveryLng != null ? [[current.deliveryLat, current.deliveryLng] as [number, number]] : []),
    ...remaining.filter((d) => d.deliveryLat != null && d.deliveryLng != null).map((d) => [d.deliveryLat!, d.deliveryLng!] as [number, number]),
  ];

  return (
    <div className="col gap-12">
      {routePoints.length > 0 && (
        <div style={{ height: 220, borderRadius: 16, overflow: "hidden", border: "1px solid var(--line)" }}>
          <MapContainer center={routePoints[0]} zoom={14} style={{ width: "100%", height: "100%" }} zoomControl={false} attributionControl={false}>
            <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
            {batch.lat != null && batch.lng != null && <Marker position={[batch.lat, batch.lng]} icon={makePinIcon("var(--delivery-600)")} />}
            {current.deliveryLat != null && current.deliveryLng != null && (
              <Marker position={[current.deliveryLat, current.deliveryLng]} icon={makePinIcon("var(--brand-600)")} />
            )}
            {remaining.filter((d) => d.deliveryLat != null && d.deliveryLng != null).map((d) => (
              <Marker key={d.id} position={[d.deliveryLat!, d.deliveryLng!]} icon={makePinIcon("var(--ink-400)")} />
            ))}
            {routePoints.length > 1 && <Polyline positions={routePoints} pathOptions={{ color: "var(--delivery-600)", weight: 3, dashArray: "6 8" }} />}
          </MapContainer>
        </div>
      )}

      <div className="card col gap-10" style={{ padding: 14, border: "1.5px solid var(--delivery-600)" }}>
        <div className="row between center-v">
          <span className="tiny semi" style={{ color: "var(--delivery-600)" }}>Stop {current.stopOrder ?? 1} of {batch.items.length}</span>
          <StatusPill status={current.status} />
        </div>

        <div className="row gap-8 center-v" style={{ padding: "8px 10px", background: "var(--ink-50)", borderRadius: 10 }}>
          <MapPin size={14} color="var(--ink-500)" />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="small semi ellipsis">{current.customerName}</div>
            <div className="tiny muted ellipsis">{current.deliveryAddressLine || current.customerArea || "No address on file"}</div>
          </div>
        </div>

        <Stepper status={current.status} />

        <button
          className="btn btn-outline btn-sm btn-block row gap-6 center"
          disabled={current.deliveryLat == null || current.deliveryLng == null}
          onClick={() => openNativeDirections(current.deliveryLat!, current.deliveryLng!)}
        >
          <Navigation size={14} /> Navigate to this stop
        </button>

        {current.status === "ASSIGNED" && (
          <button className="btn btn-primary btn-block" disabled={busyId === current.id} onClick={() => onAdvance(current, "ON_THE_WAY", "On the way")}>
            {busyId === current.id ? "…" : "Start this stop"}
          </button>
        )}
        {current.status === "EN_ROUTE" && (
          <button className="btn btn-primary btn-block" disabled={busyId === current.id} onClick={() => onAdvance(current, "ARRIVED", "Marked arrived")}>
            {busyId === current.id ? "…" : "I've arrived"}
          </button>
        )}
        {current.status === "ARRIVED" && !current.handoffVerified && (
          <div className="col gap-8">
            <div className="tiny muted">Ask the customer for their handoff code to confirm you reached the right person.</div>
            <div className="row gap-8">
              <input
                className="input grow"
                inputMode="numeric"
                placeholder="Handoff code"
                value={code}
                maxLength={6}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                style={{ letterSpacing: 2, textAlign: "center" }}
              />
              <button
                className="btn btn-primary btn-sm"
                disabled={verifying || code.trim().length < 4}
                onClick={async () => { setVerifying(true); const ok = await onVerify(current, code); setVerifying(false); if (ok) setCode(""); }}
              >
                {verifying ? "…" : "Confirm"}
              </button>
            </div>
          </div>
        )}
        {current.status === "ARRIVED" && current.handoffVerified && (
          <button className="btn btn-primary btn-block" disabled={busyId === current.id} onClick={() => onAdvance(current, "DONE", "Delivered ✓")}>
            {busyId === current.id ? "…" : "Mark delivered"}
          </button>
        )}
      </div>

      {remaining.length > 0 && (
        <div className="col gap-6">
          <div className="tiny semi muted">Next up ({remaining.length})</div>
          {remaining.map((d) => (
            <div key={d.id} className="row gap-8 center-v" style={{ padding: "8px 10px", background: "var(--ink-50)", borderRadius: 10 }}>
              <span style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--ink-200)", color: "var(--ink-600)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                {d.stopOrder ?? "?"}
              </span>
              <div className="grow tiny ellipsis muted">{d.deliveryAddressLine || d.customerArea || "Address on file"}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RunHistoryCard({ batch }: { batch: BatchGroup }) {
  const delivered = batch.items.filter((d) => d.status === "DELIVERED").length;
  return (
    <div className="card col gap-6" style={{ padding: 14 }}>
      <div className="row between center-v">
        <span className="semi small">Delivery run · {batch.items.length} {batch.items.length === 1 ? "stop" : "stops"}</span>
        <span
          className="tiny semi"
          style={{
            background: batch.status === "COMPLETED" ? "var(--green-100)" : "var(--red-50)",
            color: batch.status === "COMPLETED" ? "var(--green-600)" : "var(--red-600)",
            padding: "3px 10px", borderRadius: 999,
          }}
        >
          {batch.status === "COMPLETED" ? "Completed" : "Cancelled"}
        </span>
      </div>
      <div className="tiny muted">{delivered} of {batch.items.length} delivered</div>
    </div>
  );
}

function Stepper({ status }: { status: string }) {
  const idx = STEP_INDEX[status] ?? 0;
  const cancelled = status === "CANCELLED";
  return (
    <div className="row" style={{ gap: 4, alignItems: "center" }}>
      {STEPS.map((s, i) => {
        const done = !cancelled && i <= idx;
        return (
          <div key={s.key} className="row center-v" style={{ gap: 4, flex: i < STEPS.length - 1 ? 1 : "0 0 auto" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: done ? "var(--delivery-600)" : "var(--ink-200)", flexShrink: 0 }} />
            {i < STEPS.length - 1 && <span style={{ flex: 1, height: 2, background: !cancelled && i < idx ? "var(--delivery-600)" : "var(--ink-200)" }} />}
          </div>
        );
      })}
    </div>
  );
}

function DeliveryCard({ d, busy, onAdvance, onVerify }: {
  d: DeliveryItem;
  busy: boolean;
  onAdvance: (d: DeliveryItem, next: DeliveryLiveStatus, msg: string) => void;
  onVerify: (d: DeliveryItem, code: string) => Promise<boolean>;
}) {
  const terminal = d.status === "DELIVERED" || d.status === "CANCELLED";
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  return (
    <div className="card col gap-10" style={{ padding: 14 }}>
      <div className="row between center-v">
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="semi">{d.businessName}</div>
          <div className="tiny muted row gap-6 center-v" style={{ marginTop: 2 }}>
            <Clock size={12} /> {whenLabel(d)}
          </div>
        </div>
        <StatusPill status={d.status} />
      </div>

      <div className="row gap-8 center-v" style={{ padding: "8px 10px", background: "var(--ink-50)", borderRadius: 10 }}>
        <MapPin size={14} color="var(--ink-500)" />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="small semi ellipsis">{d.customerName}</div>
          {(d.deliveryAddressLine || d.customerArea) && <div className="tiny muted ellipsis">{d.deliveryAddressLine || d.customerArea}</div>}
        </div>
      </div>

      {!terminal && <Stepper status={d.status} />}

      {/* Primary action — one at a time, largest button */}
      {d.status === "ASSIGNED" && (
        <button className="btn btn-primary btn-block" disabled={busy} onClick={() => onAdvance(d, "ON_THE_WAY", "On the way")}>
          {busy ? "…" : "Start delivery"}
        </button>
      )}
      {d.status === "EN_ROUTE" && (
        <button className="btn btn-primary btn-block" disabled={busy} onClick={() => onAdvance(d, "ARRIVED", "Marked arrived")}>
          {busy ? "…" : "I've arrived"}
        </button>
      )}
      {d.status === "ARRIVED" && !d.handoffVerified && (
        <div className="col gap-8">
          <div className="tiny muted">Ask the customer for their handoff code to confirm you reached the right person.</div>
          <div className="row gap-8">
            <input
              className="input grow"
              inputMode="numeric"
              placeholder="Handoff code"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              style={{ letterSpacing: 2, textAlign: "center" }}
            />
            <button
              className="btn btn-primary btn-sm"
              disabled={verifying || code.trim().length < 4}
              onClick={async () => { setVerifying(true); const ok = await onVerify(d, code); setVerifying(false); if (ok) setCode(""); }}
            >
              {verifying ? "…" : "Confirm"}
            </button>
          </div>
        </div>
      )}
      {d.status === "ARRIVED" && d.handoffVerified && (
        <button className="btn btn-primary btn-block" disabled={busy} onClick={() => onAdvance(d, "DONE", "Delivered ✓")}>
          {busy ? "…" : "Mark delivered"}
        </button>
      )}
      {d.status === "DELIVERED" && (
        <div className="row gap-6 center-v tiny" style={{ color: "var(--green-600)" }}>
          <CheckCircle size={14} /> Delivered{d.deliveredAt ? ` · ${new Date(d.deliveredAt).toLocaleDateString([], { day: "numeric", month: "short" })}` : ""}
        </div>
      )}
      {d.status === "CANCELLED" && <div className="tiny muted">Cancelled</div>}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    ASSIGNED: { label: "Assigned", bg: "var(--ink-100)", fg: "var(--ink-600)" },
    EN_ROUTE: { label: "On the way", bg: "var(--delivery-50)", fg: "var(--delivery-600)" },
    ARRIVED: { label: "Arrived", bg: "var(--brand-50)", fg: "var(--brand-700)" },
    DELIVERED: { label: "Delivered", bg: "var(--green-100)", fg: "var(--green-600)" },
    CANCELLED: { label: "Cancelled", bg: "var(--red-50)", fg: "var(--red-600)" },
  };
  const s = map[status] ?? map.ASSIGNED;
  return <span className="tiny semi" style={{ background: s.bg, color: s.fg, padding: "3px 10px", borderRadius: 999, flexShrink: 0 }}>{s.label}</span>;
}
