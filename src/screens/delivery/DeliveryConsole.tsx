import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { deliveryService, type DeliveryItem, type DeliveryLiveStatus, type DeliveryBatchStatus } from "@/services/engagement/deliveryService";
import { useApp } from "@/store";
import { haptics } from "@/lib/haptics";
import { nativeGeolocation } from "@/lib/nativeGeolocation";
import { backgroundLocation } from "@/lib/backgroundLocation";
import { haversineKm } from "@/lib/geocode";
import { makePinIcon } from "@/lib/leafletIcon";
import "@/lib/leafletIcon";
import RoleSwitcher from "@/components/RoleSwitcher";
import Toggle from "@/components/Toggle";
import { EmptyState, PullToRefreshIndicator } from "@/components/common";
import { ListSkeleton, ErrorView } from "@/components/states";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { Package, MapPin, Clock, CheckCircle, Navigation } from "@/components/Icons";
import { routableStops, openRoute, exceedsRouteCap, MAX_ROUTE_WAYPOINTS } from "@/lib/routeLink";
import BackgroundLocationDisclosure from "@/features/live-share/BackgroundLocationDisclosure";
import DeliveryStatusPill from "@/components/delivery/DeliveryStatusPill";
import DeliveryStepper from "@/components/delivery/DeliveryStepper";
import HandoffCodeInput from "@/components/delivery/HandoffCodeInput";

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

function whenLabel(d: DeliveryItem): string {
  if (d.dateLabel || d.timeLabel) return [d.dateLabel, d.timeLabel].filter(Boolean).join(" · ");
  if (d.scheduledFor) return new Date(d.scheduledFor).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return "Anytime";
}

function openNativeDirections(lat: number, lng: number) {
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, "_blank", "noopener");
}

/** Stops → the {lat,lng} shape buildRouteUrl expects, in the given order. */
function toRoutePoints(items: DeliveryItem[]) {
  return routableStops(items).map((d) => ({ lat: d.deliveryLat!, lng: d.deliveryLng! }));
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
  const { user, showToast } = useApp();
  const { data, loading, error, refetch } = useQueryWithRealtime<DeliveryItem[]>(
    () => deliveryService.myDeliveries(),
    "appointment_deliveries",
    [user.id],
    `agent_user_id=eq.${user.id}`,
    "my-deliveries",
  );
  const { data: dutyData, refetch: refetchDuty } = useQuery(() => deliveryService.myDutyStatus(), [], "delivery-duty");
  const [dutyBusy, setDutyBusy] = useState(false);
  const onDuty = dutyData !== false;

  const [busyId, setBusyId] = useState<string | null>(null);
  const [decidingBatch, setDecidingBatch] = useState<string | null>(null);
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const disclosureResolver = useRef<((accepted: boolean) => void) | null>(null);

  const { containerRef, pullDistance, refreshing, threshold } = usePullToRefresh<HTMLDivElement>(refetch);

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

  async function toggleDuty() {
    const next = !onDuty;
    setDutyBusy(true);
    try {
      await deliveryService.setDuty(next);
      haptics.selection();
      void refetchDuty();
    } catch (e: any) {
      showToast(e?.message || "Couldn't update duty status");
    } finally {
      setDutyBusy(false);
    }
  }

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

  // One background-capable GPS watcher, shared by whichever job(s) currently
  // need live tracking — a batch run AND/OR a solo delivery that's EN_ROUTE.
  // backgroundLocation is a process-wide singleton (one native watcher at a
  // time), so this only starts/stops on the *transition* into/out of "needs
  // tracking" — never restarted just because which job it's attributed to
  // changes mid-flight (e.g. a batch finishes while a solo delivery
  // continues). Each fix is routed to whichever job(s) are active via a ref,
  // read fresh on every fix rather than captured in a stale closure.
  const runningBatch = activeBatches[0] ?? null;
  const soloEnRoute = soloActive.find((d) => d.status === "EN_ROUTE") ?? null;
  const trackingTargetsRef = useRef<{ batchId: string | null; soloId: string | null }>({ batchId: null, soloId: null });
  trackingTargetsRef.current = { batchId: runningBatch?.batchId ?? null, soloId: soloEnRoute?.id ?? null };
  const isTrackingRef = useRef(false);

  useEffect(() => {
    const needsTracking = !!runningBatch || !!soloEnRoute;
    if (needsTracking === isTrackingRef.current) return;

    if (!needsTracking) {
      isTrackingRef.current = false;
      void backgroundLocation.stop();
      return;
    }

    isTrackingRef.current = true;
    void (async () => {
      const allowed = await ensureDisclosure();
      if (!allowed) { isTrackingRef.current = false; return; }
      void backgroundLocation.start((f) => {
        const targets = trackingTargetsRef.current;
        if (targets.batchId) {
          void deliveryService.updateBatchPosition(targets.batchId, f.lat, f.lng, f.accuracy, f.heading).catch(() => { /* transient */ });
        }
        if (targets.soloId) {
          void deliveryService.updateStatus(targets.soloId, "ON_THE_WAY", f.lat, f.lng).catch(() => { /* transient */ });
        }
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!runningBatch, !!soloEnRoute]);

  useEffect(() => () => { void backgroundLocation.stop(); }, []);

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

  // Only the single primary job gets the persistent bottom action bar (the
  // same "which job is being GPS-tracked" priority as above) — an edge-case
  // second simultaneous active job (rare: no auto-dispatch ever creates this,
  // but nothing prevents an owner from assigning one while another is mid-run)
  // keeps its action button inline in its own card instead of a second bar.
  const primaryBatchId = runningBatch?.batchId ?? null;
  const primarySoloId = !primaryBatchId ? (soloActive[0]?.id ?? null) : null;

  const hasVisibleActionBar =
    tab === "ACTIVE" &&
    ((!!runningBatch && runningBatch.items.some((d) => d.status !== "DELIVERED" && d.status !== "CANCELLED")) ||
      !!primarySoloId);

  return (
    <div className="screen screen-boxed">
      {/* Header — identity + one-tap switch back to Personal */}
      <div className="row between center-v" style={{ padding: "calc(14px + var(--safe-area-top)) 16px 14px", borderBottom: "1px solid var(--line)", background: "var(--surface)" }}>
        <div className="row gap-10 center-v">
          <span style={{ width: 34, height: 34, borderRadius: 10, background: "var(--delivery-600)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Package size={18} />
          </span>
          <div>
            <div className="h3">Delivery</div>
            <div className="tiny muted">Your assigned deliveries</div>
          </div>
        </div>
        <RoleSwitcher enableLongPress />
      </div>

      {/* Duty — glanceable, always visible, not buried in a menu. */}
      <button
        type="button"
        className="row between center-v"
        style={{ width: "100%", padding: "10px 16px", borderBottom: "1px solid var(--line)", background: onDuty ? "var(--surface)" : "var(--ink-50)" }}
        onClick={toggleDuty}
        disabled={dutyBusy}
      >
        <span className="small semi">{onDuty ? "On duty" : "Off duty"}</span>
        <Toggle on={onDuty} />
      </button>

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

      <div ref={containerRef} className="screen-scroll page-pad col gap-12" style={{ paddingTop: 12, paddingBottom: hasVisibleActionBar ? 140 : 30 }}>
        <PullToRefreshIndicator pullDistance={pullDistance} refreshing={refreshing} threshold={threshold} />
        {error ? (
          <ErrorView error={error} onRetry={refetch} />
        ) : loading ? (
          <ListSkeleton count={3} />
        ) : tab === "ACTIVE" ? (
          activeBatches.length === 0 && soloActive.length === 0 ? (
            <EmptyState emoji="🛵" title="No active delivery" text="When you accept a run or start a delivery it shows here with live controls." />
          ) : (
            <>
              {activeBatches.map((b) => (
                <RunCard key={b.batchId} batch={b} busyId={busyId} onAdvance={advance} onVerify={verifyHandoff} showActionBar={b.batchId === primaryBatchId} />
              ))}
              {soloActive.map((d) => (
                <DeliveryCard key={d.id} d={d} busy={busyId === d.id} onAdvance={advance} onVerify={verifyHandoff} showActionBar={d.id === primarySoloId} />
              ))}
            </>
          )
        ) : tab === "ASSIGNED" ? (
          soloAssigned.length === 0 ? (
            onDuty ? (
              <EmptyState emoji="🛵" title="Nothing assigned yet" text="New deliveries a business assigns to you will appear here." />
            ) : (
              <EmptyState
                emoji="🛵"
                title="You're off duty"
                text="Go on duty to receive new deliveries."
                action={<button className="btn btn-delivery btn-sm" disabled={dutyBusy} onClick={toggleDuty}>Go on duty</button>}
              />
            )
          ) : (
            soloAssigned.map((d) => (
              <DeliveryCard key={d.id} d={d} busy={busyId === d.id} onAdvance={advance} onVerify={verifyHandoff} showActionBar={false} />
            ))
          )
        ) : historyBatches.length === 0 && soloHistory.length === 0 ? (
          <EmptyState emoji="📦" title="No past deliveries" text="Completed and cancelled deliveries will be listed here." />
        ) : (
          <>
            {historyBatches.map((b) => <RunHistoryCard key={b.batchId} batch={b} />)}
            {soloHistory.map((d) => (
              <DeliveryCard key={d.id} d={d} busy={busyId === d.id} onAdvance={advance} onVerify={verifyHandoff} showActionBar={false} />
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
  // Lightweight two-tap decline — no heavy modal, but a mis-tap can no longer
  // instantly and irreversibly decline a whole run. Auto-disarms after 5s.
  const [armed, setArmed] = useState(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (armTimer.current) clearTimeout(armTimer.current); }, []);

  function handleDeclineTap() {
    if (!armed) {
      setArmed(true);
      haptics.warning();
      armTimer.current = setTimeout(() => setArmed(false), 5000);
      return;
    }
    if (armTimer.current) clearTimeout(armTimer.current);
    onDecline();
  }
  function cancelArm() {
    setArmed(false);
    if (armTimer.current) clearTimeout(armTimer.current);
  }

  return (
    <div className="col" style={{ minHeight: "100dvh", padding: "calc(24px + var(--safe-area-top)) 20px 24px", justifyContent: "center", gap: 22 }}>
      <div className="col center" style={{ gap: 10 }}>
        <span style={{ width: 64, height: 64, borderRadius: 20, background: "var(--delivery-50)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Package size={32} color="var(--delivery-600)" />
        </span>
        <div className="h1" style={{ textAlign: "center" }}>New delivery run</div>
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
          className="btn btn-delivery btn-block"
          style={{ height: 52, fontSize: 16, fontWeight: 700 }}
          disabled={busy || armed}
          onClick={onAccept}
        >
          {busy ? "…" : `Accept all ${batch.items.length}`}
        </button>
        <button
          className="btn btn-outline btn-block"
          style={armed ? { borderColor: "var(--red-500)", color: "var(--red-600)" } : undefined}
          disabled={busy}
          onClick={handleDeclineTap}
        >
          {busy ? "…" : armed ? `Tap again to decline · ${batch.items.length} stops` : "Decline"}
        </button>
        {armed && (
          <button className="tiny muted" style={{ alignSelf: "center" }} onClick={cancelArm}>Never mind</button>
        )}
      </div>
    </div>
  );
}

/** The Navigate-icon + primary status action, shared by RunCard/DeliveryCard —
 *  rendered either inline in the card or inside the fixed bottom bar. */
function ActionControls({
  current, busy, onNavigate, onAdvance, onVerify, primaryLabel,
}: {
  current: DeliveryItem;
  busy: boolean;
  onNavigate: (() => void) | null;
  onAdvance: (d: DeliveryItem, next: DeliveryLiveStatus, msg: string) => void;
  onVerify: (d: DeliveryItem, code: string) => Promise<boolean>;
  primaryLabel: string;
}) {
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  if (current.status === "ARRIVED" && !current.handoffVerified) {
    return (
      <div className="col gap-8">
        <div className="tiny muted">Ask the customer for their handoff code to confirm you reached the right person.</div>
        <HandoffCodeInput value={code} onChange={setCode} disabled={verifying} />
        <button
          className="btn btn-primary btn-block"
          disabled={verifying || code.length < 6}
          onClick={async () => { setVerifying(true); const ok = await onVerify(current, code); setVerifying(false); if (ok) setCode(""); }}
        >
          {verifying ? "…" : "Confirm handoff"}
        </button>
      </div>
    );
  }

  return (
    <div className="row gap-8">
      {onNavigate && (
        <button className="btn btn-outline row gap-6 center" style={{ flex: "0 0 auto", width: 48, padding: 0 }} aria-label="Navigate" onClick={onNavigate}>
          <Navigation size={16} />
        </button>
      )}
      {current.status === "ASSIGNED" && (
        <button className="btn btn-primary grow" disabled={busy} onClick={() => onAdvance(current, "ON_THE_WAY", "On the way")}>
          {busy ? "…" : primaryLabel}
        </button>
      )}
      {current.status === "EN_ROUTE" && (
        <button className="btn btn-primary grow" disabled={busy} onClick={() => onAdvance(current, "ARRIVED", "Marked arrived")}>
          {busy ? "…" : "I've arrived"}
        </button>
      )}
      {current.status === "ARRIVED" && current.handoffVerified && (
        <button className="btn btn-primary grow" disabled={busy} onClick={() => onAdvance(current, "DONE", "Delivered ✓")}>
          {busy ? "…" : "Mark delivered"}
        </button>
      )}
    </div>
  );
}

/** Multi-stop active run: live map + the current stop expanded + a collapsed queue. */
function RunCard({ batch, busyId, onAdvance, onVerify, showActionBar }: {
  batch: BatchGroup;
  busyId: string | null;
  onAdvance: (d: DeliveryItem, next: DeliveryLiveStatus, msg: string) => void;
  onVerify: (d: DeliveryItem, code: string) => Promise<boolean>;
  showActionBar: boolean;
}) {
  // Selective routing: when non-empty, "Route selected" builds a link through
  // only these stops instead of the whole remaining run.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const current = batch.items.find((d) => d.status !== "DELIVERED" && d.status !== "CANCELLED") ?? null;
  const remaining = batch.items.filter((d) => d.id !== current?.id && d.status !== "DELIVERED" && d.status !== "CANCELLED");

  // Everything still to be delivered, in route order — current stop first.
  const pending = current ? [current, ...remaining] : remaining;
  const routablePending = routableStops(pending);
  const selectedStops = pending.filter((d) => selected.has(d.id));
  const routableSelected = routableStops(selectedStops);

  function toggleSelected(id: string) {
    haptics.selection();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!current) {
    return (
      <div className="card col center queue-row-enter" style={{ padding: 24, gap: 8 }}>
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

  const canNavigate = current.deliveryLat != null && current.deliveryLng != null;
  const controls = (
    <ActionControls
      current={current}
      busy={busyId === current.id}
      onNavigate={canNavigate ? () => openNativeDirections(current.deliveryLat!, current.deliveryLng!) : null}
      onAdvance={onAdvance}
      onVerify={onVerify}
      primaryLabel="Start this stop"
    />
  );

  return (
    <div className="col gap-12 queue-row-enter">
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
          <DeliveryStatusPill status={current.status} />
        </div>

        <div className="row gap-8 center-v" style={{ padding: "8px 10px", background: "var(--ink-50)", borderRadius: 10 }}>
          <MapPin size={14} color="var(--ink-500)" />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="small semi ellipsis">{current.customerName}</div>
            <div className="tiny muted ellipsis">{current.deliveryAddressLine || current.customerArea || "No address on file"}</div>
          </div>
        </div>

        <DeliveryStepper status={current.status} showLabel={false} />

        <div className="col gap-6">
          {/* One tap for the whole remaining run — the agent shouldn't have to
              reopen maps after every drop. Order is the accepted route order.
              (The per-stop Navigate button lives in the bottom action bar.) */}
          {routablePending.length > 1 && (
            <button
              className="btn btn-delivery btn-sm btn-block row gap-6 center"
              onClick={() => openRoute(toRoutePoints(pending))}
            >
              <Navigation size={14} /> Best route · all {routablePending.length} stops
            </button>
          )}

          {routableSelected.length > 0 && (
            <button
              className="btn btn-outline btn-sm btn-block row gap-6 center"
              style={{ borderColor: "var(--delivery-600)", color: "var(--delivery-600)" }}
              onClick={() => openRoute(toRoutePoints(selectedStops))}
            >
              <Navigation size={14} /> Route {routableSelected.length} selected
            </button>
          )}

          {exceedsRouteCap(routablePending.length) && (
            <div className="tiny muted">
              Maps supports {MAX_ROUTE_WAYPOINTS + 1} stops per route — the first{" "}
              {MAX_ROUTE_WAYPOINTS + 1} are included. Re-tap after those to route the rest.
            </div>
          )}
        </div>

        {!showActionBar && controls}
      </div>

      {remaining.length > 0 && (
        <div className="col gap-6">
          <div className="row between center-v">
            <div className="tiny semi muted">Next up ({remaining.length})</div>
            {selected.size > 0 && (
              <button className="tiny semi" style={{ color: "var(--delivery-600)" }} onClick={() => setSelected(new Set())}>
                Clear selection
              </button>
            )}
          </div>
          <div className="tiny muted">Tap stops to route only those.</div>
          {remaining.map((d) => {
            const isSel = selected.has(d.id);
            const routable = d.deliveryLat != null && d.deliveryLng != null;
            return (
              <button
                key={d.id}
                type="button"
                disabled={!routable}
                onClick={() => toggleSelected(d.id)}
                className="row gap-8 center-v"
                style={{
                  width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 10,
                  background: isSel ? "var(--delivery-50)" : "var(--ink-50)",
                  border: isSel ? "1.5px solid var(--delivery-600)" : "1.5px solid transparent",
                  opacity: routable ? 1 : 0.55,
                }}
              >
                <span style={{ width: 20, height: 20, borderRadius: "50%", background: isSel ? "var(--delivery-600)" : "var(--ink-200)", color: isSel ? "#fff" : "var(--ink-600)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                  {d.stopOrder ?? "?"}
                </span>
                <div className="grow tiny ellipsis" style={{ color: isSel ? "var(--delivery-600)" : "var(--ink-500)" }}>
                  {d.deliveryAddressLine || d.customerArea || "Address on file"}
                  {!routable && " · no map location"}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showActionBar && <div className="delivery-action-bar">{controls}</div>}
    </div>
  );
}

function RunHistoryCard({ batch }: { batch: BatchGroup }) {
  const delivered = batch.items.filter((d) => d.status === "DELIVERED").length;
  return (
    <div className="card col gap-6 queue-row-enter" style={{ padding: 14 }}>
      <div className="row between center-v">
        <span className="semi small">Delivery run · {batch.items.length} {batch.items.length === 1 ? "stop" : "stops"}</span>
        <span className={`badge ${batch.status === "COMPLETED" ? "badge-green" : "badge-red"}`}>
          {batch.status === "COMPLETED" ? "Completed" : "Cancelled"}
        </span>
      </div>
      <div className="tiny muted">{delivered} of {batch.items.length} delivered</div>
    </div>
  );
}

function DeliveryCard({ d, busy, onAdvance, onVerify, showActionBar }: {
  d: DeliveryItem;
  busy: boolean;
  onAdvance: (d: DeliveryItem, next: DeliveryLiveStatus, msg: string) => void;
  onVerify: (d: DeliveryItem, code: string) => Promise<boolean>;
  showActionBar: boolean;
}) {
  const terminal = d.status === "DELIVERED" || d.status === "CANCELLED";
  const canNavigate = d.deliveryLat != null && d.deliveryLng != null;
  const controls = !terminal && (
    <ActionControls
      current={d}
      busy={busy}
      onNavigate={canNavigate ? () => openNativeDirections(d.deliveryLat!, d.deliveryLng!) : null}
      onAdvance={onAdvance}
      onVerify={onVerify}
      primaryLabel="Start delivery"
    />
  );

  return (
    <div className="card col gap-10 queue-row-enter" style={{ padding: 14 }}>
      <div className="row between center-v">
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="semi">{d.businessName}</div>
          <div className="tiny muted row gap-6 center-v" style={{ marginTop: 2 }}>
            <Clock size={12} /> {whenLabel(d)}
          </div>
        </div>
        <DeliveryStatusPill status={d.status} />
      </div>

      <div className="row gap-8 center-v" style={{ padding: "8px 10px", background: "var(--ink-50)", borderRadius: 10 }}>
        <MapPin size={14} color="var(--ink-500)" />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="small semi ellipsis">{d.customerName}</div>
          {(d.deliveryAddressLine || d.customerArea) && <div className="tiny muted ellipsis">{d.deliveryAddressLine || d.customerArea}</div>}
        </div>
      </div>

      {!terminal && <DeliveryStepper status={d.status} showLabel={false} />}

      {controls && !showActionBar && controls}

      {d.status === "DELIVERED" && (
        <div className="row gap-6 center-v tiny" style={{ color: "var(--green-600)" }}>
          <CheckCircle size={14} /> Delivered{d.deliveredAt ? ` · ${new Date(d.deliveredAt).toLocaleDateString([], { day: "numeric", month: "short" })}` : ""}
        </div>
      )}
      {d.status === "CANCELLED" && <div className="tiny muted">Cancelled</div>}

      {controls && showActionBar && <div className="delivery-action-bar">{controls}</div>}
    </div>
  );
}
