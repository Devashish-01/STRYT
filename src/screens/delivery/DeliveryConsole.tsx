import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@/hooks/useApi";
import { deliveryService, type DeliveryItem, type DeliveryLiveStatus } from "@/services/engagement/deliveryService";
import { useApp } from "@/store";
import { haptics } from "@/lib/haptics";
import { nativeGeolocation } from "@/lib/nativeGeolocation";

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
import RoleSwitcher from "@/components/RoleSwitcher";
import { EmptyState } from "@/components/common";
import { ListSkeleton } from "@/components/states";
import { Package, MapPin, Clock, CheckCircle } from "@/components/Icons";

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

export default function DeliveryConsole() {
  const { showToast } = useApp();
  const { data, loading, refetch } = useQuery(() => deliveryService.myDeliveries(), [], "my-deliveries");
  const [busyId, setBusyId] = useState<string | null>(null);

  const items = useMemo(() => data ?? [], [data]);
  const active = items.filter((d) => d.status === "EN_ROUTE" || d.status === "ARRIVED");
  const assigned = items.filter((d) => d.status === "ASSIGNED");
  const history = items.filter((d) => d.status === "DELIVERED" || d.status === "CANCELLED");

  const [tab, setTab] = useState<Tab>("ACTIVE");
  const effectiveTab: Tab = tab;

  // Live GPS push: while a delivery is EN_ROUTE, re-send the agent's position
  // every 30s so the customer's tracking map keeps moving (mirrors the agreement
  // flow). Stops automatically once nothing is en route.
  const enRoute = active.find((d) => d.status === "EN_ROUTE");
  const enRouteId = enRoute?.id ?? null;
  const pushTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!enRouteId) return;
    const tick = async () => {
      const c = await getGPS();
      if (c) { try { await deliveryService.updateStatus(enRouteId, "ON_THE_WAY", c.lat, c.lng); } catch { /* transient */ } }
    };
    void tick();
    pushTimer.current = setInterval(tick, 30000);
    return () => { if (pushTimer.current) clearInterval(pushTimer.current); };
  }, [enRouteId]);

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

  const counts = { ACTIVE: active.length, ASSIGNED: assigned.length, HISTORY: history.length };
  const list = effectiveTab === "ACTIVE" ? active : effectiveTab === "ASSIGNED" ? assigned : history;

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
            className={`chip ${effectiveTab === t ? "active" : ""}`}
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
        ) : list.length === 0 ? (
          <EmptyState
            emoji={effectiveTab === "HISTORY" ? "📦" : "🛵"}
            title={effectiveTab === "ACTIVE" ? "No active delivery" : effectiveTab === "ASSIGNED" ? "Nothing assigned yet" : "No past deliveries"}
            text={effectiveTab === "ACTIVE" ? "When you start a delivery it shows here with live controls." : effectiveTab === "ASSIGNED" ? "New deliveries a business assigns to you will appear here." : "Completed and cancelled deliveries will be listed here."}
          />
        ) : (
          list.map((d) => (
            <DeliveryCard key={d.id} d={d} busy={busyId === d.id} onAdvance={advance} onVerify={verifyHandoff} />
          ))
        )}
      </div>
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
          {d.customerArea && <div className="tiny muted ellipsis">{d.customerArea}</div>}
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
