import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { RASTER_TILES } from "@/lib/mapTiles";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { deliveryService, type DeliveryItem, type DeliveryLiveStatus, type DeliveryBatchStatus, type CancelReason } from "@/services/engagement/deliveryService";
import { useApp } from "@/store";
import { haptics } from "@/lib/haptics";
import { promptBatteryExemptionForDuty } from "@/lib/batteryOptimization";
import { nativeGeolocation } from "@/lib/nativeGeolocation";
import { haversineKm } from "@/lib/geocode";
import { makePinIcon } from "@/lib/leafletIcon";
import "@/lib/leafletIcon";
import RoleSwitcher from "@/components/RoleSwitcher";
import Toggle from "@/components/Toggle";
import { EmptyState, PullToRefreshIndicator } from "@/components/common";
import { ListSkeleton, ErrorView } from "@/components/states";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { Package, MapPin, Clock, CheckCircle, Navigation, Phone } from "@/components/Icons";
import { routableStops, openRoute, exceedsRouteCap, MAX_ROUTE_WAYPOINTS } from "@/lib/routeLink";
import DeliveryStatusPill from "@/components/delivery/DeliveryStatusPill";
import HandoffCodeInput from "@/components/delivery/HandoffCodeInput";
import { useI18n } from "@/lib/i18n";
import RiderOrderInfo from "@/components/delivery/RiderOrderInfo";
import { RiderMission, RiderWhere } from "@/components/delivery/RiderMission";
import { Celebrate } from "@/components/Celebrate";
import { deliveredToday } from "@/lib/riderMission";
import { lastKnownFix, setTrackingState, trackingControl, useTrackingState } from "@/features/delivery-tracking/trackingStore";
import { useOnline } from "@/hooks/useOnline";
import { isNetworkError, withRetry } from "@/lib/retry";
import { useRiderQueue } from "@/features/delivery-tracking/riderQueue";
import LeaveAtDoorProof from "@/components/delivery/LeaveAtDoorProof";
import CantDeliverSheet from "@/components/delivery/CantDeliverSheet";
import { openExternal } from "@/lib/openExternal";
import { errorMessage } from "@/lib/errorMessage";

/**
 * Best-effort current position; resolves null if unavailable/denied. The location watcher's last fix is used when it is
 * recent, so a status tap is not held up by a fresh GPS read (up to 2.5 s before); otherwise one short attempt.
 */
function getGPS(): Promise<{ lat: number; lng: number } | null> {
  const known = lastKnownFix(45_000);
  if (known) return Promise.resolve(known);
  return new Promise((res) =>
    nativeGeolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => res(null),
      { timeout: 1500 },
    ),
  );
}

type Tab = "ACTIVE" | "ASSIGNED" | "HISTORY";

/** "1 stop" / "5 stops", from the translated templates. */
function stopsText(t: (k: string) => string, tf: (k: string, v: Record<string, string | number>) => string, n: number): string {
  return n === 1 ? t("dlv_c_stop_one") : tf("dlv_c_stops", { n });
}

/** Whether a rider has anything in flight, for banners that only matter then. */
function counts_hasWork(activeRuns: number, activeSolo: number): boolean {
  return activeRuns > 0 || activeSolo > 0;
}

function whenLabel(d: DeliveryItem, anytime: string): string {
  if (d.dateLabel || d.timeLabel) return [d.dateLabel, d.timeLabel].filter(Boolean).join(" · ");
  if (d.scheduledFor) return new Date(d.scheduledFor).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return anytime;
}

function openNativeDirections(lat: number, lng: number) {
  openExternal(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`);
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
  const { t, tf } = useI18n();
  const online = useOnline();
  const tracking = useTrackingState();
  // Taps made with no signal are kept and sent when it returns (the runner replays them even if this screen is closed).
  const queue = useRiderQueue(user.id);
  useEffect(() => {
    setTrackingState({ consoleOpen: true });
    return () => setTrackingState({ consoleOpen: false });
  }, []);
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
  // Read the blockers up front so the off-duty toggle can disable itself and
  // say WHY, instead of letting the agent tap it and eat a server exception.
  const { data: blockers, refetch: refetchBlockers } = useQuery(() => deliveryService.dutyBlockers(), [], "delivery-duty-blockers");
  const dutyBlocked = onDuty && (blockers?.count ?? 0) > 0;

  // The order can be cancelled while the rider is mid-delivery; the server then refuses every further step. Say so plainly
  // and refresh, so the card flips to "Cancelled" instead of leaving a dead button.
  function riderError(e: unknown, fallback: string): string {
    const msg = errorMessage(e, "");
    if (/ORDER_NOT_ACTIVE|INVALID_TRANSITION|cancelled or closed/i.test(msg)) {
      refetch();
      return /ORDER_NOT_ACTIVE|cancelled or closed/i.test(msg) ? t("dlv_err_order_cancelled") : fallback;
    }
    if (/ORDER_NOT_READY|hasn't marked this order packed/i.test(msg)) {
      refetch();
      return t("dlv_err_not_packed");
    }
    return errorMessage(e, fallback);
  }

  const [busyId, setBusyId] = useState<string | null>(null);
  // A delivery finished: confetti and a running count for the day — the one moment of the job worth marking.
  const [celebrating, setCelebrating] = useState(false);
  const [decidingBatch, setDecidingBatch] = useState<string | null>(null);
  // The stop the "Can't deliver" sheet is open for, and whether its request is
  // in flight — `cancelBusy` also locks the sheet shut so a half-sent cancel
  // can't be dismissed into an unknown state.
  const [cancelTarget, setCancelTarget] = useState<DeliveryItem | null>(null);
  // A whole run abandoned at once (accident, bike breakdown) — not one stop at a time.
  const [cancelRun, setCancelRun] = useState<BatchGroup | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  const { containerRef, pullDistance, refreshing, threshold } = usePullToRefresh<HTMLDivElement>(refetch);

  // New assignments, a shop marking an order packed, and a cancelled order all arrive as database changes the rider's phone is not
  // pushed (delivery rows aren't in the realtime feed), so the list refreshes itself while the screen is open and visible, and the
  // moment the rider comes back to the app. Without this a rider sat on a stale list until they pulled to refresh.
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible" && navigator.onLine) refetch(); };
    const timer = setInterval(tick, 15_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = useMemo(() => data ?? [], [data]);
  const soloItems = items.filter((d) => !d.batchId);
  const batches = useMemo(() => groupBatches(items), [items]);
  // ALL pending runs, not just the first. `find()` meant a second assigned run
  // was invisible until the first was resolved, and the fullscreen gate below
  // hid solo assigned work behind it too (DLV-004). One decision at a time is
  // right; silently dropping the rest is not.
  const pendingBatches = batches.filter((b) => b.status === "PENDING_ACCEPTANCE");
  const pendingBatch = pendingBatches[0] ?? null;
  const activeBatches = batches.filter((b) => b.status === "ACCEPTED" || b.status === "IN_PROGRESS");
  const historyBatches = batches.filter((b) => b.status === "COMPLETED" || b.status === "CANCELLED");
  // The run whose stop gets the persistent bottom action bar.
  const runningBatch = activeBatches[0] ?? null;

  // A rider who has the bag in hand is working, whether or not they have tapped Start yet: that order belongs under Active, not Assigned.
  const soloActive = soloItems.filter((d) => d.status === "EN_ROUTE" || d.status === "ARRIVED" || (d.status === "ASSIGNED" && !!d.pickedUpAt));
  const soloAssigned = soloItems.filter((d) => d.status === "ASSIGNED" && !d.pickedUpAt);
  const soloHistory = soloItems.filter((d) => d.status === "DELIVERED" || d.status === "CANCELLED");

  const [tab, setTab] = useState<Tab>("ACTIVE");

  async function toggleDuty() {
    const next = !onDuty;
    // Going off duty with live work is blocked server-side. We already know
    // that before the tap (see `blockers`), so the toggle is disabled rather
    // than tappable-then-rejected — but this stays as the backstop for the
    // race where the last job lands between render and tap.
    if (!next && dutyBlocked) return;
    setDutyBusy(true);
    try {
      await deliveryService.setDuty(next);
      haptics.selection();
      void refetchDuty();
      refetchBlockers();
      // Going ON duty is the only moment the battery exemption is genuinely
      // needed (and the only one defensible at Play review) — an accepted run
      // has to keep reporting location, and OEM battery managers are what stop
      // it. Never asked of customers. Best-effort; never blocks the toggle.
      if (next) void promptBatteryExemptionForDuty(user.id);
    } catch (e) {
      showToast(errorMessage(e, t("dlv_c_err_duty")));
    } finally {
      setDutyBusy(false);
    }
  }


  // The request never reached the server: remember it, hold that card, and say so plainly (the runner sends it on reconnect).
  function keepForLater(kind: "pickup" | "status" | "cash", deliveryId: string, args?: Record<string, unknown>) {
    queue.enqueue(kind, deliveryId, args);
    haptics.selection();
    showToast(t("dlv_queued_toast"));
  }

  async function sendQueuedNow() {
    const r = await queue.flush();
    if (r.sent + r.already > 0) { showToast(tf("dlv_queue_sent_toast", { n: r.sent + r.already })); refetch(); }
    if (r.failed.length > 0) { showToast(t("dlv_queue_failed_toast")); refetch(); }
  }

  async function advance(d: DeliveryItem, next: DeliveryLiveStatus, okMsg: string) {
    setBusyId(d.id);
    haptics.medium();
    let gpsAtTap: { lat: number; lng: number } | null = null;
    try {
      const c = await getGPS();
      gpsAtTap = c ? { lat: c.lat, lng: c.lng } : null;
      await withRetry(() => deliveryService.updateStatus(d.id, next, c?.lat, c?.lng));
      haptics.success();
      if (next === "DONE") {
        showToast(tf("dlv_c_toast_delivered_n", { n: deliveredToday(items) + 1 }));
        setCelebrating(true);
      } else {
        showToast(okMsg);
      }
      refetch();
      refetchBlockers();
    } catch (e) {
      if (isNetworkError(e)) keepForLater("status", d.id, { next, lat: gpsAtTap?.lat, lng: gpsAtTap?.lng });
      else showToast(riderError(e, t("dlv_c_err_update")));
    } finally {
      setBusyId(null);
    }
  }

  // The rider confirms they have the order from the shop; only then can the delivery start (enforced by the server).
  async function pickUp(d: DeliveryItem) {
    setBusyId(d.id);
    haptics.medium();
    try {
      await withRetry(() => deliveryService.markPickedUp(d.id));
      haptics.success();
      showToast(t("dlv_picked_up_toast"));
      refetch();
    } catch (e) {
      if (isNetworkError(e)) keepForLater("pickup", d.id);
      else showToast(riderError(e, t("dlv_c_err_update")));
    } finally {
      setBusyId(null);
    }
  }

  // Cash on delivery: the rider records the money taken at the door. The order is then PAID/CASH on the shop's side and
  // shows in the owner's "cash to collect from riders" until they take it from this rider.
  async function collectCash(d: DeliveryItem) {
    setBusyId(d.id);
    haptics.medium();
    try {
      const amount = await deliveryService.collectCash(d.id).catch((e) => {
        if (isNetworkError(e)) return null;
        throw e;
      });
      if (amount == null) { keepForLater("cash", d.id); return; }
      haptics.success();
      showToast(tf("dlv_cash_collected_toast", { n: Math.round(amount) }));
      // Money in hand and the handoff already confirmed: that was the last step.
      if (d.handoffVerified) await advance(d, "DONE", t("dlv_c_toast_delivered"));
      else refetch();
    } catch (e) {
      showToast(riderError(e, t("dlv_c_err_cash")));
    } finally {
      setBusyId(null);
    }
  }

  // A single (non-run) assignment can be turned down before it starts; the order goes back to the shop's dispatch list.
  async function declineSolo(d: DeliveryItem) {
    setBusyId(d.id);
    haptics.warning();
    try {
      await deliveryService.declineSolo(d.id);
      showToast(t("dlv_declined_single_toast"));
      refetch();
      refetchBlockers();
    } catch (e) {
      showToast(riderError(e, t("dlv_c_err_decline")));
    } finally {
      setBusyId(null);
    }
  }

  async function cancelDelivery(reason: CancelReason, note: string) {
    const target = cancelTarget;
    if (!target || cancelBusy) return;
    setCancelBusy(true);
    haptics.warning();
    try {
      await deliveryService.cancelDelivery(target.id, reason, note);
      haptics.success();
      setCancelTarget(null);
      // Name the business: the agent needs to know someone specific was told,
      // not just that "something was sent".
      showToast(tf("dlv_c_marked_undeliverable", { name: target.businessName }));
      refetch();
      // The whole point of this feature is unblocking duty. Re-read the
      // blockers immediately so the toggle enables in the same beat.
      refetchBlockers();
    } catch (e) {
      showToast(errorMessage(e, t("dlv_c_err_update")));
    } finally {
      setCancelBusy(false);
    }
  }

  async function abandonRun(reason: CancelReason, note: string) {
    const run = cancelRun;
    if (!run || cancelBusy) return;
    setCancelBusy(true);
    haptics.warning();
    try {
      const open = run.items.filter((d) => d.status !== "DELIVERED" && d.status !== "CANCELLED");
      for (const d of open) await deliveryService.cancelDelivery(d.id, reason, note);
      haptics.success();
      setCancelRun(null);
      showToast(tf("dlv_c_run_ended", { stops: stopsText(t, tf, open.length) }));
      refetch();
      refetchBlockers();
    } catch (e) {
      showToast(riderError(e, t("dlv_c_err_end_run")));
      refetch();
    } finally {
      setCancelBusy(false);
    }
  }

  async function verifyHandoff(d: DeliveryItem, code: string): Promise<boolean> {
    try {
      const ok = await withRetry(() => deliveryService.confirmHandoff(d.id, code.trim()));
      if (ok) {
        haptics.success();
        showToast(t("dlv_c_handoff_confirmed"));
        // The code is the proof of handoff: with nothing left to collect, finish the delivery now instead of making the rider
        // tap a second, redundant "Mark delivered" (R4). With money due they collect it first (see collectCash).
        const owes = d.amountDue > 0 && !d.cashCollectedAt;
        if (!owes) await advance({ ...d, status: "ARRIVED", handoffVerified: true }, "DONE", t("dlv_c_toast_delivered"));
        else refetch();
      }
      else { showToast(t("dlv_c_code_mismatch")); }
      return ok;
    } catch (e) {
      showToast(riderError(e, t("dlv_c_err_verify")));
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
      showToast(tf("dlv_c_run_accepted", { stops: stopsText(t, tf, batch.items.length) }));
      refetch();
    } catch (e) {
      showToast(errorMessage(e, t("dlv_c_err_accept")));
    } finally {
      setDecidingBatch(null);
    }
  }

  async function declineRun(batch: BatchGroup) {
    setDecidingBatch(batch.batchId);
    haptics.warning();
    try {
      await deliveryService.declineBatch(batch.batchId);
      showToast(t("dlv_c_run_declined"));
      refetch();
    } catch (e) {
      showToast(errorMessage(e, t("dlv_c_err_decline")));
    } finally {
      setDecidingBatch(null);
    }
  }

  // Gate NewRunGate only when the courier has NO active deliveries in flight.
  // If active deliveries exist, do not hijack the console so drop-offs remain workable.
  const hasActiveWork = activeBatches.length > 0 || soloActive.length > 0;
  if (pendingBatch && !hasActiveWork) {
    return (
      <div className="screen screen-boxed">
        <NewRunGate
          batch={pendingBatch}
          busy={decidingBatch === pendingBatch.batchId}
          queuePosition={1}
          queueTotal={pendingBatches.length}
          nextBatch={pendingBatches[1] ?? null}
          soloWaiting={soloAssigned.length}
          onAccept={() => acceptRun(pendingBatch)}
          onDecline={() => declineRun(pendingBatch)}
        />
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
      {celebrating && <Celebrate onDone={() => setCelebrating(false)} />}
      {/* Header — identity + one-tap switch back to Personal */}
      <div className="row between center-v" style={{ padding: "calc(14px + var(--safe-area-top)) 16px 14px", borderBottom: "1px solid var(--line)", background: "var(--surface)" }}>
        <div className="row gap-10 center-v">
          <span style={{ width: 34, height: 34, borderRadius: 10, background: "var(--delivery-600)", color: "var(--white)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Package size={18} />
          </span>
          <div>
            <div className="h3">{t("dlv_c_title")}</div>
            <div className="tiny muted">{t("dlv_c_subtitle")}</div>
          </div>
        </div>
        <RoleSwitcher enableLongPress />
      </div>

      {/* Non-blocking incoming batch banner while active work is underway */}
      {pendingBatch && hasActiveWork && (
        <div className="row between center-v" style={{ background: "var(--brand-50)", borderBottom: "1px solid var(--brand-200)", padding: "10px 16px" }}>
          <div className="col" style={{ minWidth: 0, paddingRight: 8 }}>
            <span className="semi small ellipsis" style={{ color: "var(--brand-700)" }}>{tf("dlv_c_new_run_waiting", { stops: stopsText(t, tf, pendingBatch.items.length) })}</span>
            <span className="tiny muted ellipsis">{pendingBatch.items[0]?.businessName || t("dlv_c_assigned_run")}</span>
          </div>
          <div className="row gap-6" style={{ flexShrink: 0 }}>
            <button className="btn btn-sm btn-outline" disabled={decidingBatch === pendingBatch.batchId} onClick={() => declineRun(pendingBatch)}>
              {t("dlv_c_decline")}
            </button>
            <button className="btn btn-sm btn-delivery" disabled={decidingBatch === pendingBatch.batchId} onClick={() => acceptRun(pendingBatch)}>
              {t("dlv_c_accept")}
            </button>
          </div>
        </div>
      )}

      {/* Honest state of the two things a rider can't see: the connection and the location sharing the shop relies on. */}
      {!online && (
        <div className="row gap-8 center-v small semi" style={{ padding: "8px 16px", background: "var(--amber-50)", color: "var(--amber-800)", borderBottom: "1px solid var(--amber-200)" }}>
          {t("dlv_offline_banner")}
        </div>
      )}
      {queue.pending.length > 0 && (
        <div className="row between center-v gap-8" style={{ padding: "9px 16px", background: "var(--amber-50)", borderBottom: "1px solid var(--amber-200)" }}>
          <span className="small semi" style={{ color: "var(--amber-800)", minWidth: 0 }}>{tf("dlv_queue_waiting", { n: queue.pending.length })}</span>
          {online && <button className="btn btn-sm btn-outline" style={{ flexShrink: 0 }} onClick={() => void sendQueuedNow()}>{t("dlv_queue_send_now")}</button>}
        </div>
      )}
      {(tracking.status === "declined" || tracking.status === "lost" || tracking.status === "offline") && counts_hasWork(activeBatches.length, soloActive.length) && (
        <div className="row between center-v gap-8" style={{ padding: "9px 16px", background: "var(--red-50)", borderBottom: "1px solid var(--red-100)" }}>
          <span className="small semi" style={{ color: "var(--red-700)", minWidth: 0 }}>
            {tracking.status === "declined" ? t("dlv_track_declined") : tracking.status === "lost" ? t("dlv_track_lost") : t("dlv_track_offline")}
          </span>
          {tracking.status !== "offline" && (
            <button className="btn btn-sm btn-outline" style={{ flexShrink: 0 }} onClick={() => trackingControl.retry()}>{t("dlv_track_retry")}</button>
          )}
        </div>
      )}

      {/* Duty — glanceable, always visible, not buried in a menu. When it's
          blocked, say so here and point at the job doing the blocking; never
          make someone hunt for a reason we already know. */}
      <button
        type="button"
        className="row between center-v"
        style={{ width: "100%", padding: "10px 16px", borderBottom: "1px solid var(--line)", background: onDuty ? "var(--surface)" : "var(--ink-50)", opacity: dutyBlocked ? 0.75 : 1 }}
        onClick={dutyBlocked ? () => setTab(activeBatches.length + soloActive.length > 0 ? "ACTIVE" : "ASSIGNED") : toggleDuty}
        aria-pressed={onDuty}
        disabled={dutyBusy}
        aria-label={dutyBlocked ? t("dlv_c_duty_blocked_aria") : undefined}
      >
        <span className="col" style={{ alignItems: "flex-start", gap: 1, minWidth: 0 }}>
          <span className="small semi">{onDuty ? t("dlv_c_on_duty") : t("dlv_c_off_duty")}</span>
          {dutyBlocked && (
            <span className="tiny muted ellipsis">
              {blockers!.count === 1 ? t("dlv_c_duty_blocked_one") : tf("dlv_c_duty_blocked_n", { n: blockers!.count })}
            </span>
          )}
        </span>
        {deliveredToday(items) > 0 && <span className="rm-today">{tf("dlv_c_today_count", { n: deliveredToday(items) })}</span>}
        <Toggle on={onDuty} />
      </button>

      {/* Tabs */}
      <div className="row" style={{ padding: "10px 12px 0", gap: 8 }}>
        {(["ACTIVE", "ASSIGNED", "HISTORY"] as Tab[]).map((tb) => (
          <button
            key={tb}
            className={`chip ${tab === tb ? "active" : ""}`}
            onClick={() => setTab(tb)}
          >
            {tb === "ACTIVE" ? t("dlv_c_tab_active") : tb === "ASSIGNED" ? t("dlv_c_tab_assigned") : t("dlv_c_tab_history")}
            {counts[tb] > 0 && <span className="tiny" style={{ marginLeft: 6, opacity: 0.75 }}>{counts[tb]}</span>}
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
            deliveredToday(items) > 0
              ? <EmptyState emoji="🎉" title={t("dlv_c_caught_up_title")} text={tf("dlv_c_caught_up_text", { n: deliveredToday(items) })} />
              : <EmptyState emoji="🛵" title={t("dlv_c_empty_active_title")} text={t("dlv_c_empty_active_text")} />
          ) : (
            <>
              {activeBatches.map((b) => (
                <RunCard key={b.batchId} batch={b} busyId={busyId} heldIds={queue.waiting} onAdvance={advance} onVerify={verifyHandoff} onCollect={collectCash} onPickUp={pickUp} onCantDeliver={setCancelTarget} onCancelRun={setCancelRun} showActionBar={b.batchId === primaryBatchId} />
              ))}
              {soloActive.map((d) => (
                <DeliveryCard key={d.id} d={d} busy={busyId === d.id || queue.waiting.has(d.id)} onAdvance={advance} onVerify={verifyHandoff} onCollect={collectCash} onPickUp={pickUp} onDeclineSolo={declineSolo} onCantDeliver={setCancelTarget} showActionBar={d.id === primarySoloId} />
              ))}
            </>
          )
        ) : tab === "ASSIGNED" ? (
          soloAssigned.length === 0 ? (
            onDuty ? (
              <EmptyState emoji="🛵" title={t("dlv_c_empty_assigned_title")} text={t("dlv_c_empty_assigned_text")} />
            ) : (
              <EmptyState
                emoji="🛵"
                title={t("dlv_c_off_duty_title")}
                text={t("dlv_c_off_duty_text")}
                action={<button className="btn btn-delivery btn-sm" disabled={dutyBusy} onClick={toggleDuty}>{t("dlv_c_go_on_duty")}</button>}
              />
            )
          ) : (
            soloAssigned.map((d) => (
              <DeliveryCard key={d.id} d={d} busy={busyId === d.id || queue.waiting.has(d.id)} onAdvance={advance} onVerify={verifyHandoff} onCollect={collectCash} onPickUp={pickUp} onDeclineSolo={declineSolo} onCantDeliver={setCancelTarget} showActionBar={false} />
            ))
          )
        ) : historyBatches.length === 0 && soloHistory.length === 0 ? (
          <EmptyState emoji="📦" title={t("dlv_c_empty_history_title")} text={t("dlv_c_empty_history_text")} />
        ) : (
          <>
            {historyBatches.map((b) => <RunHistoryCard key={b.batchId} batch={b} />)}
            {soloHistory.map((d) => (
              <DeliveryCard key={d.id} d={d} busy={busyId === d.id || queue.waiting.has(d.id)} onAdvance={advance} onVerify={verifyHandoff} onCollect={collectCash} onPickUp={pickUp} onDeclineSolo={declineSolo} onCantDeliver={setCancelTarget} showActionBar={false} />
            ))}
          </>
        )}
      </div>

      {cancelRun && (
        <CantDeliverSheet
          orderLabel={stopsText(t, tf, cancelRun.items.filter((d) => d.status !== "DELIVERED" && d.status !== "CANCELLED").length)}
          customerName={cancelRun.items[0]?.businessName ?? ""}
          busy={cancelBusy}
          onConfirm={abandonRun}
          onClose={() => setCancelRun(null)}
        />
      )}

      {cancelTarget && (
        <CantDeliverSheet
          orderLabel={cancelTarget.businessName}
          customerName={cancelTarget.customerName}
          busy={cancelBusy}
          onConfirm={cancelDelivery}
          onClose={() => setCancelTarget(null)}
        />
      )}

    </div>
  );
}

/** The accept-all-or-nothing moment — intercepts the whole console until decided. */
function NewRunGate({ batch, busy, queuePosition, queueTotal, nextBatch, soloWaiting, onAccept, onDecline }: {
  batch: BatchGroup;
  busy: boolean;
  /** 1-based position of this run in the pending queue. */
  queuePosition: number;
  queueTotal: number;
  /** The run that comes after this decision, if any — shown, not actionable. */
  nextBatch: BatchGroup | null;
  /** Solo deliveries waiting behind the gate; they need no acceptance. */
  soloWaiting: number;
  onAccept: () => void;
  onDecline: () => void;
}) {
  // Lightweight two-tap decline — no heavy modal, but a mis-tap can no longer
  // instantly and irreversibly decline a whole run. Auto-disarms after 5s.
  const { t, tf } = useI18n();
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
        {/* The count is the whole fix for DLV-004: the agent must know more
            work is waiting BEFORE they decide on this one. */}
        {queueTotal > 1 && (
          <span className="chip active tiny" style={{ pointerEvents: "none" }}>
            {tf("dlv_c_run_x_of_y", { x: queuePosition, y: queueTotal })}
          </span>
        )}
        <div className="h1" style={{ textAlign: "center" }}>{t("dlv_c_new_run")}</div>
        <div className="muted small" style={{ textAlign: "center" }}>
          {tf("dlv_c_accept_whole", { stops: stopsText(t, tf, batch.items.length) })}
        </div>
      </div>

      <div className="col gap-8" style={{ maxHeight: "40vh", overflowY: "auto" }}>
        {batch.items.map((d, i) => (
          <div key={d.id} className="row gap-10 center-v card card-condensed">
            <span style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--delivery-600)", color: "var(--white)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
              {i + 1}
            </span>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="semi small ellipsis">{d.deliveryAddressLine || d.customerArea || t("dlv_c_address_on_file")}</div>
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
          {busy ? "…" : tf("dlv_c_accept_all", { n: batch.items.length })}
        </button>
        <button
          className="btn btn-outline btn-block"
          style={armed ? { borderColor: "var(--red-500)", color: "var(--red-600)" } : undefined}
          disabled={busy}
          onClick={handleDeclineTap}
        >
          {busy ? "…" : armed ? tf("dlv_c_tap_again_decline", { stops: stopsText(t, tf, batch.items.length) }) : t("dlv_c_decline")}
        </button>
        {armed && (
          <button className="tiny muted" style={{ alignSelf: "center" }} onClick={cancelArm}>{t("dlv_c_never_mind")}</button>
        )}

        {/* Everything else waiting behind this decision — acknowledged so it
            isn't a surprise, deliberately inert so it doesn't compete with it. */}
        {(nextBatch || soloWaiting > 0) && (
          <div className="col gap-4" style={{ marginTop: 4, textAlign: "center" }}>
            {nextBatch && (
              <span className="tiny muted">
                {tf("dlv_c_next_up_run", { stops: stopsText(t, tf, nextBatch.items.length) })}
              </span>
            )}
            {soloWaiting > 0 && (
              <span className="tiny muted">
                {soloWaiting === 1 ? t("dlv_c_single_waiting_one") : tf("dlv_c_single_waiting_n", { n: soloWaiting })}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** The Navigate-icon + primary status action, shared by RunCard/DeliveryCard —
 *  rendered either inline in the card or inside the fixed bottom bar. */
function ActionControls({
  current, busy, onNavigate, showNav, onAdvance, onVerify, onCollect, onPickUp, primaryLabel,
}: {
  current: DeliveryItem;
  busy: boolean;
  onNavigate: (() => void) | null;
  /** The sticky bottom bar keeps a navigate shortcut; inside a card the where-to-go block above already has one. */
  showNav: boolean;
  onAdvance: (d: DeliveryItem, next: DeliveryLiveStatus, msg: string) => void;
  onVerify: (d: DeliveryItem, code: string) => Promise<boolean>;
  onCollect: (d: DeliveryItem) => Promise<void>;
  onPickUp: (d: DeliveryItem) => Promise<void>;
  primaryLabel: string;
}) {
  const { t, tf } = useI18n();
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  // Marking delivered with money still owed needs a second, deliberate tap; the shop is shown the amount as unpaid.
  const [unpaidArmed, setUnpaidArmed] = useState(false);
  useEffect(() => {
    if (!unpaidArmed) return;
    const timer = setTimeout(() => setUnpaidArmed(false), 5000);
    return () => clearTimeout(timer);
  }, [unpaidArmed]);

  if (current.status === "ARRIVED" && !current.handoffVerified) {
    return (
      <div className="col gap-8">
        <div className="tiny muted">{t("dlv_c_ask_code")}</div>
        {current.customerPhone && (
          <a className="btn btn-delivery btn-sm btn-block row gap-6 center" href={`tel:${current.customerPhone}`}>
            <Phone size={14} /> {t("dlv_call_customer")}
          </a>
        )}
        <HandoffCodeInput value={code} onChange={setCode} disabled={verifying} />
        <button
          className="btn btn-primary btn-block"
          disabled={verifying || code.length < 6}
          onClick={async () => { setVerifying(true); const ok = await onVerify(current, code); setVerifying(false); if (ok) setCode(""); }}
        >
          {verifying ? "…" : t("dlv_c_confirm_handoff")}
        </button>
        <div className="tiny muted" style={{ lineHeight: 1.45 }}>{t("dlv_cant_reach_hint")}</div>
        {/* Only renders when the shop allows it, nothing is owed, and the server says this rider can record it. */}
        <LeaveAtDoorProof delivery={current} onComplete={async (d) => { onAdvance({ ...d, handoffVerified: true }, "DONE", t("dlv_c_toast_delivered")); }} />
      </div>
    );
  }

  // Nothing leaves the shop unconfirmed: before the delivery can start, the rider confirms they have the order.
  if (current.status === "ASSIGNED" && !current.pickedUpAt) {
    const shopRoutable = current.businessLat != null && current.businessLng != null;
    // The shop signals "packed" before a courier collects (a shop owner delivering their own order packed it themselves).
    // `orderReadyAt === undefined` means the database predates the rule, so don't hold the rider back.
    const waitingForShop = current.orderReadyAt === null && !current.isOwnerDelivery;
    return (
      <div className="col gap-8">
        <div className="row gap-8">
          {showNav && shopRoutable && (
            <button className="btn btn-outline row gap-6 center" style={{ flex: "0 0 auto", width: 48, minHeight: 48, padding: 0 }} aria-label={t("dlv_navigate_to_shop")} onClick={() => openNativeDirections(current.businessLat!, current.businessLng!)}>
              <Navigation size={16} />
            </button>
          )}
          <button className="btn btn-primary grow" disabled={busy || waitingForShop} onClick={() => onPickUp(current)}>
            {busy ? "…" : waitingForShop ? t("dlv_wait_pack") : t("dlv_picked_up_btn")}
          </button>
        </div>
      </div>
    );
  }

  const owes = current.amountDue > 0 && !current.cashCollectedAt;
  if (current.status === "ARRIVED" && current.handoffVerified && owes) {
    return (
      <div className="col gap-8">
        <button className="btn btn-green btn-block" disabled={busy} onClick={() => onCollect(current)}>
          {busy ? "…" : tf("dlv_collect_cash", { n: Math.round(current.amountDue) })}
        </button>
        <button
          className="btn btn-outline btn-block"
          style={unpaidArmed ? { borderColor: "var(--red-500)", color: "var(--red-600)" } : undefined}
          disabled={busy}
          onClick={() => {
            if (!unpaidArmed) { haptics.warning(); setUnpaidArmed(true); return; }
            setUnpaidArmed(false);
            onAdvance(current, "DONE", t("dlv_c_toast_delivered"));
          }}
        >
          {unpaidArmed ? tf("dlv_confirm_unpaid_tap", { n: Math.round(current.amountDue) }) : t("dlv_confirm_unpaid")}
        </button>
      </div>
    );
  }

  return (
    <div className="row gap-8">
      {showNav && onNavigate && (
        <button className="btn btn-outline row gap-6 center" style={{ flex: "0 0 auto", width: 48, minHeight: 48, padding: 0 }} aria-label={t("dlv_c_navigate")} onClick={onNavigate}>
          <Navigation size={16} />
        </button>
      )}
      {current.status === "ASSIGNED" && (
        <button className="btn btn-primary grow" disabled={busy} onClick={() => onAdvance(current, "ON_THE_WAY", t("dlv_c_toast_on_way"))}>
          {busy ? "…" : primaryLabel}
        </button>
      )}
      {current.status === "EN_ROUTE" && (
        <button className="btn btn-primary grow" disabled={busy} onClick={() => onAdvance(current, "ARRIVED", t("dlv_c_toast_arrived"))}>
          {busy ? "…" : t("dlv_c_arrived_btn")}
        </button>
      )}
      {current.status === "ARRIVED" && current.handoffVerified && (
        <button className="btn btn-primary grow" disabled={busy} onClick={() => onAdvance(current, "DONE", t("dlv_c_toast_delivered"))}>
          {busy ? "…" : t("dlv_c_mark_delivered")}
        </button>
      )}
    </div>
  );
}

/** Multi-stop active run: live map + the current stop expanded + a collapsed queue. */
function RunCard({ batch, busyId, heldIds, onAdvance, onVerify, onCollect, onPickUp, onCantDeliver, onCancelRun, showActionBar }: {
  batch: BatchGroup;
  busyId: string | null;
  /** Stops with a tap still waiting to be sent — held like a busy one so it can't be tapped twice. */
  heldIds: Set<string>;
  onAdvance: (d: DeliveryItem, next: DeliveryLiveStatus, msg: string) => void;
  onVerify: (d: DeliveryItem, code: string) => Promise<boolean>;
  onCollect: (d: DeliveryItem) => Promise<void>;
  onPickUp: (d: DeliveryItem) => Promise<void>;
  onCantDeliver: (d: DeliveryItem) => void;
  onCancelRun: (batch: BatchGroup) => void;
  showActionBar: boolean;
}) {
  // Selective routing: when non-empty, "Route selected" builds a link through
  // only these stops instead of the whole remaining run.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { t, tf } = useI18n();

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
        <div className="semi">{t("dlv_c_all_delivered")}</div>
      </div>
    );
  }

  const routePoints: [number, number][] = [
    ...(batch.lat != null && batch.lng != null ? [[batch.lat, batch.lng] as [number, number]] : []),
    ...(current.deliveryLat != null && current.deliveryLng != null ? [[current.deliveryLat, current.deliveryLng] as [number, number]] : []),
    ...remaining.filter((d) => d.deliveryLat != null && d.deliveryLng != null).map((d) => [d.deliveryLat!, d.deliveryLng!] as [number, number]),
  ];

  const canNavigate = current.deliveryLat != null && current.deliveryLng != null;
  const codeEntry = current.status === "ARRIVED" && !current.handoffVerified;
  const controls = (
    <ActionControls
      current={current}
      busy={busyId === current.id || heldIds.has(current.id)}
      onNavigate={canNavigate ? () => openNativeDirections(current.deliveryLat!, current.deliveryLng!) : null}
      showNav={showActionBar}
      onAdvance={onAdvance}
      onVerify={onVerify} onCollect={onCollect} onPickUp={onPickUp}
      primaryLabel={t("dlv_c_start_stop")}
    />
  );

  return (
    <div className="col gap-12 queue-row-enter">
      {routePoints.length > 0 && (
        <div style={{ height: 220, borderRadius: 16, overflow: "hidden", border: "1px solid var(--line)" }}>
          <MapContainer center={routePoints[0]} zoom={14} style={{ width: "100%", height: "100%" }} zoomControl={false} attributionControl={false}>
            <TileLayer {...RASTER_TILES} />
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
        <RiderMission d={current} stopLabel={tf("dlv_c_stop_x_of_y", { x: current.stopOrder ?? 1, y: batch.items.length })} />

        <RiderWhere d={current} onNavigate={openNativeDirections} />

        <RiderOrderInfo d={current} hideContact />

        {/* Scoped to THIS stop, not the run — one bad address doesn't end a
            shift. If it's the last live stop, the server closes the run. */}
        <button
          type="button"
          className="tiny muted"
          style={{ alignSelf: "flex-start", minHeight: 32, color: "var(--ink-500)" }}
          onClick={() => onCantDeliver(current)}
        >
          {t("dlv_c_cant_deliver_stop")}
        </button>
        <button
          type="button"
          className="tiny muted"
          style={{ alignSelf: "flex-start", minHeight: 32, color: "var(--red-600)" }}
          onClick={() => onCancelRun(batch)}
        >
          {t("dlv_cant_continue_run")}
        </button>

        <div className="col gap-6">
          {/* One tap for the whole remaining run — the agent shouldn't have to
              reopen maps after every drop. Order is the accepted route order.
              (The per-stop Navigate button lives in the bottom action bar.) */}
          {routablePending.length > 1 && (
            <button
              className="btn btn-delivery btn-sm btn-block row gap-6 center"
              onClick={() => openRoute(toRoutePoints(pending))}
            >
              <Navigation size={14} /> {tf("dlv_c_best_route", { n: routablePending.length })}
            </button>
          )}

          {routableSelected.length > 0 && (
            <button
              className="btn btn-outline btn-sm btn-block row gap-6 center"
              style={{ borderColor: "var(--delivery-600)", color: "var(--delivery-600)" }}
              onClick={() => openRoute(toRoutePoints(selectedStops))}
            >
              <Navigation size={14} /> {tf("dlv_c_route_selected", { n: routableSelected.length })}
            </button>
          )}

          {exceedsRouteCap(routablePending.length) && (
            <div className="tiny muted">
              {tf("dlv_c_route_cap", { max: MAX_ROUTE_WAYPOINTS + 1 })}
            </div>
          )}
        </div>

        {(!showActionBar || codeEntry) && controls}
      </div>

      {remaining.length > 0 && (
        <div className="col gap-6">
          <div className="row between center-v">
            <div className="tiny semi muted">{tf("dlv_c_next_up", { n: remaining.length })}</div>
            {selected.size > 0 && (
              <button className="tiny semi" style={{ color: "var(--delivery-600)" }} onClick={() => setSelected(new Set())}>
                {t("dlv_c_clear_selection")}
              </button>
            )}
          </div>
          <div className="tiny muted">{t("dlv_c_tap_to_route")}</div>
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
                <span style={{ width: 20, height: 20, borderRadius: "50%", background: isSel ? "var(--delivery-600)" : "var(--ink-200)", color: isSel ? "var(--white)" : "var(--ink-600)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                  {d.stopOrder ?? "?"}
                </span>
                <div className="grow tiny ellipsis" style={{ color: isSel ? "var(--delivery-600)" : "var(--ink-500)" }}>
                  {d.deliveryAddressLine || d.customerArea || t("dlv_c_address_on_file")}
                  {!routable && ` · ${t("dlv_c_no_map_loc")}`}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showActionBar && !codeEntry && <div className="delivery-action-bar">{controls}</div>}
    </div>
  );
}

function RunHistoryCard({ batch }: { batch: BatchGroup }) {
  const { t, tf } = useI18n();
  const delivered = batch.items.filter((d) => d.status === "DELIVERED").length;
  return (
    <div className="card col gap-6 queue-row-enter" style={{ padding: 14 }}>
      <div className="row between center-v">
        <span className="semi small">{tf("dlv_c_run_title", { stops: stopsText(t, tf, batch.items.length) })}</span>
        <span className={`badge ${batch.status === "COMPLETED" ? "badge-green" : "badge-red"}`}>
          {batch.status === "COMPLETED" ? t("dlv_c_completed") : t("dlv_c_cancelled")}
        </span>
      </div>
      <div className="tiny muted">{tf("dlv_c_x_of_y_delivered", { x: delivered, y: batch.items.length })}</div>
    </div>
  );
}

function DeliveryCard({ d, busy, onAdvance, onVerify, onCollect, onPickUp, onDeclineSolo, onCantDeliver, showActionBar }: {
  d: DeliveryItem;
  busy: boolean;
  onAdvance: (d: DeliveryItem, next: DeliveryLiveStatus, msg: string) => void;
  onVerify: (d: DeliveryItem, code: string) => Promise<boolean>;
  onCollect: (d: DeliveryItem) => Promise<void>;
  onPickUp: (d: DeliveryItem) => Promise<void>;
  onDeclineSolo: (d: DeliveryItem) => Promise<void>;
  onCantDeliver: (d: DeliveryItem) => void;
  showActionBar: boolean;
}) {
  const { t, tf } = useI18n();
  // Two taps to decline, like declining a run: a mis-tap must not hand the order back.
  const [declineArmed, setDeclineArmed] = useState(false);
  useEffect(() => {
    if (!declineArmed) return;
    const timer = setTimeout(() => setDeclineArmed(false), 5000);
    return () => clearTimeout(timer);
  }, [declineArmed]);
  const terminal = d.status === "DELIVERED" || d.status === "CANCELLED";
  const codeEntry = d.status === "ARRIVED" && !d.handoffVerified;
  const canNavigate = d.deliveryLat != null && d.deliveryLng != null;
  const controls = !terminal && (
    <ActionControls
      current={d}
      busy={busy}
      onNavigate={canNavigate ? () => openNativeDirections(d.deliveryLat!, d.deliveryLng!) : null}
      showNav={showActionBar}
      onAdvance={onAdvance}
      onVerify={onVerify} onCollect={onCollect} onPickUp={onPickUp}
      primaryLabel={t("dlv_c_start_delivery")}
    />
  );

  return (
    <div className="card col gap-10 queue-row-enter" style={{ padding: 14 }}>
      {!terminal && <RiderMission d={d} />}

      {terminal ? (
        <div className="row between center-v">
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="semi">{d.businessName}</div>
            <div className="tiny muted row gap-6 center-v" style={{ marginTop: 2 }}>
              <Clock size={12} /> {whenLabel(d, t("dlv_c_anytime"))}
            </div>
          </div>
          <DeliveryStatusPill status={d.status} />
        </div>
      ) : (
        <div className="tiny muted row gap-6 center-v"><Clock size={12} /> {whenLabel(d, t("dlv_c_anytime"))}</div>
      )}

      {terminal ? (
        <div className="row gap-8 center-v" style={{ padding: "8px 10px", background: "var(--ink-50)", borderRadius: 10 }}>
          <MapPin size={14} color="var(--ink-500)" />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="small semi ellipsis">{d.customerName}</div>
            {(d.deliveryAddressLine || d.customerArea) && <div className="tiny muted ellipsis">{d.deliveryAddressLine || d.customerArea}</div>}
          </div>
        </div>
      ) : (
        <RiderWhere d={d} onNavigate={openNativeDirections} />
      )}

      {/* The rider should know before arriving that cash is due at the door. */}
      {!terminal && d.amountDue > 0 && !d.cashCollectedAt && (
        <div className="row gap-6 center-v small semi" style={{ color: "var(--amber-800)", background: "var(--amber-50)", border: "1px solid var(--amber-200)", borderRadius: 10, padding: "7px 10px" }}>
          💵 {tf("dlv_collect_cash", { n: Math.round(d.amountDue) })}
        </div>
      )}

      {!terminal && <RiderOrderInfo d={d} hideContact />}

      {controls && (!showActionBar || codeEntry) && controls}

      {d.status === "DELIVERED" && (
        <div className="row gap-6 center-v tiny" style={{ color: "var(--green-600)" }}>
          <CheckCircle size={14} /> {t("dlv_c_delivered")}{d.deliveredAt ? ` · ${new Date(d.deliveredAt).toLocaleDateString([], { day: "numeric", month: "short" })}` : ""}
        </div>
      )}
      {d.status === "CANCELLED" && <div className="tiny muted">{t("dlv_c_cancelled")}</div>}

      {/* Always reachable as real, thumb-sized buttons — but outlined and quiet, so they never compete with finishing the job. */}
      {!terminal && (
        <div className="rm-more">
          {d.status === "ASSIGNED" && !d.batchId && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={busy}
              style={declineArmed ? { borderColor: "var(--red-500)", color: "var(--red-600)" } : undefined}
              onClick={() => {
                if (!declineArmed) { haptics.warning(); setDeclineArmed(true); return; }
                setDeclineArmed(false);
                void onDeclineSolo(d);
              }}
            >
              {declineArmed ? t("dlv_decline_single_confirm") : t("dlv_decline_single")}
            </button>
          )}
          <button type="button" className="btn btn-outline btn-sm" onClick={() => onCantDeliver(d)}>{t("dlv_c_cant_deliver")}</button>
        </div>
      )}

      {controls && showActionBar && !codeEntry && <div className="delivery-action-bar">{controls}</div>}
    </div>
  );
}
