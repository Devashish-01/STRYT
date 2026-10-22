import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { deliveryService, type DeliveryItem } from "@/services/engagement/deliveryService";
import { backgroundLocation } from "@/lib/backgroundLocation";
import { DELIVERY_AGENT_ENABLED } from "@/lib/features";
import BackgroundLocationDisclosure from "@/features/live-share/BackgroundLocationDisclosure";
import { recordFix, setTrackingState, trackingControl, useTrackingState } from "./trackingStore";
import { riderQueue } from "./riderQueue";

/** No fix for this long while tracking should be running = "lost", shown to the rider (and, via position_at, to the owner). */
const LOST_AFTER_MS = 90_000;
const FAILURES_BEFORE_OFFLINE = 3;
/** While taps are waiting to be sent, try again this often (and the moment the connection or the app comes back). */
const QUEUE_RETRY_MS = 20_000;

/**
 * App-level owner of a rider's location sharing for deliveries.
 *
 * Why it is not in the rider console: leaving that screen (to chat with the customer, say) unmounted it and stopped
 * tracking in the middle of a delivery. It also swallowed a declined permission prompt with no word to the rider. Here the
 * watcher lives as long as the app does, tracking starts and stops only when a delivery needs it (the transition, never a
 * restart), and its state is published through trackingStore for banners to show.
 *
 * backgroundLocation is one watcher shared with My People live share; this subscribes as the "delivery" owner, so a rider who
 * is also live-sharing keeps both, and ending a delivery never stops the share (nor the reverse).
 */
export default function DeliveryTrackingRunner() {
  const { isAuthed, user } = useApp();
  const { consoleOpen } = useTrackingState();
  const enabled = DELIVERY_AGENT_ENABLED && isAuthed && !!user.id;

  // A cheap count decides whether to load the full list outside the console; the console opening also turns it on.
  const { data: activeCount } = useQuery(
    async () => (enabled ? deliveryService.countMyActiveDeliveries() : 0),
    [user.id, enabled],
    `delivery:active-count:${user.id}`,
  );

  if (!enabled) return null;
  if ((activeCount ?? 0) === 0 && !consoleOpen) return null;
  return <Tracker userId={user.id} />;
}

function Tracker({ userId }: { userId: string }) {
  const { t, tf } = useI18n();
  const { showToast } = useApp();
  const { data } = useQueryWithRealtime<DeliveryItem[]>(
    () => deliveryService.myDeliveries(),
    "appointment_deliveries",
    [userId],
    `agent_user_id=eq.${userId}`,
    "my-deliveries",
  );
  const items = useMemo(() => data ?? [], [data]);

  // Every active run and every solo delivery that is on the move — one agent has one position, fanned out to all of them.
  const batchIds = useMemo(() => {
    const ids = new Set<string>();
    for (const d of items) {
      if (d.batchId && (d.batchStatus === "ACCEPTED" || d.batchStatus === "IN_PROGRESS")) ids.add(d.batchId);
    }
    return Array.from(ids);
  }, [items]);
  const soloIds = useMemo(
    () => items.filter((d) => !d.batchId && (d.status === "EN_ROUTE" || d.status === "ARRIVED")).map((d) => d.id),
    [items],
  );

  const targetsRef = useRef({ batchIds, soloIds });
  targetsRef.current = { batchIds, soloIds };
  const needsTracking = batchIds.length > 0 || soloIds.length > 0;

  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const trackingRef = useRef(false);
  const failuresRef = useRef(0);
  const lastFixRef = useRef<number | null>(null);

  const ensureDisclosure = useCallback(async (): Promise<boolean> => {
    if (!(await backgroundLocation.needsBackgroundDisclosure())) return true;
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setDisclosureOpen(true);
    });
  }, []);

  const begin = useCallback(async () => {
    if (trackingRef.current) return;
    trackingRef.current = true;
    setTrackingState({ status: "starting" });
    const allowed = await ensureDisclosure();
    if (!allowed) {
      trackingRef.current = false;
      setTrackingState({ status: "declined" });
      return;
    }
    failuresRef.current = 0;
    try {
      await backgroundLocation.start(
        (f) => {
          recordFix(f);
          lastFixRef.current = Date.now();
          const targets = targetsRef.current;
          let failed = false;
          const settle = (p: Promise<unknown>) => p.catch(() => { failed = true; });
          const sends: Promise<unknown>[] = [];
          for (const batchId of targets.batchIds) sends.push(settle(deliveryService.updateBatchPosition(batchId, f.lat, f.lng, f.accuracy, f.heading)));
          for (const soloId of targets.soloIds) sends.push(settle(deliveryService.updatePosition(soloId, f.lat, f.lng, f.accuracy, f.heading)));
          void Promise.all(sends).then(() => {
            failuresRef.current = failed ? failuresRef.current + 1 : 0;
            setTrackingState({
              status: failuresRef.current >= FAILURES_BEFORE_OFFLINE ? "offline" : "on",
              lastFixAt: lastFixRef.current,
            });
          });
        },
        { title: t("dlv_track_notice_title"), message: t("dlv_track_notice_msg") },
        "delivery",
      );
      // Started; "on" is only claimed once a fix actually arrives (the watchdog below calls it "lost" otherwise).
      lastFixRef.current = Date.now();
    } catch {
      trackingRef.current = false;
      setTrackingState({ status: "declined" });
    }
  }, [ensureDisclosure, t]);

  const end = useCallback(() => {
    if (!trackingRef.current) return;
    trackingRef.current = false;
    void backgroundLocation.stop("delivery");
    setTrackingState({ status: "idle", lastFixAt: null });
  }, []);

  // Start/stop only on the transition into/out of "needs tracking"; a changing set of targets never restarts the watcher.
  useEffect(() => {
    if (needsTracking) void begin();
    else end();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsTracking]);

  // Watchdog: tracking that should be on but has produced nothing for a while is "lost", not "on".
  useEffect(() => {
    if (!needsTracking) return;
    const id = setInterval(() => {
      if (!trackingRef.current) return;
      const last = lastFixRef.current;
      if (last != null && Date.now() - last > LOST_AFTER_MS) setTrackingState({ status: "lost" });
    }, 15_000);
    return () => clearInterval(id);
  }, [needsTracking]);

  // The banner's "turn on" button: ask again from scratch.
  useEffect(() => {
    trackingControl.retry = () => {
      if (trackingRef.current) { void backgroundLocation.stop("delivery"); trackingRef.current = false; }
      setTrackingState({ status: "idle" });
      if (targetsRef.current.batchIds.length > 0 || targetsRef.current.soloIds.length > 0) void begin();
    };
    return () => { trackingControl.retry = () => {}; };
  }, [begin]);

  // Replay taps the rider made with no signal. Lives here, not in the console, so they still go if the rider has left that screen.
  useEffect(() => {
    const q = riderQueue(userId);
    let stopped = false;
    const replay = async () => {
      if (q.list().length === 0) return;
      const r = await q.flush();
      if (stopped) return;
      if (r.sent + r.already > 0) showToast(tf("dlv_queue_sent_toast", { n: r.sent + r.already }));
      if (r.failed.length > 0) showToast(t("dlv_queue_failed_toast"));
    };
    const onVisible = () => { if (document.visibilityState === "visible") void replay(); };
    window.addEventListener("online", replay);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => void replay(), QUEUE_RETRY_MS);
    void replay();
    return () => {
      stopped = true;
      window.removeEventListener("online", replay);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [userId, showToast, t, tf]);

  // Leaving the app entirely (sign-out, unmount) stops the watcher; navigating between screens does not.
  useEffect(() => () => {
    if (trackingRef.current) void backgroundLocation.stop("delivery");
    trackingRef.current = false;
    setTrackingState({ status: "idle", lastFixAt: null });
  }, []);

  if (!disclosureOpen) return null;
  return (
    <BackgroundLocationDisclosure
      onAccept={() => { setDisclosureOpen(false); resolver.current?.(true); resolver.current = null; }}
      onDecline={() => { setDisclosureOpen(false); resolver.current?.(false); resolver.current = null; }}
      body={t("dlv_track_disclosure_body")}
      noticeBody={t("dlv_track_disclosure_notice")}
    />
  );
}
