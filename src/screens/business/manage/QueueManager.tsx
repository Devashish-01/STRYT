import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { AppBar } from "@/components/common";
import { Skeleton } from "@/components/states";
import LivePulseDot from "@/components/LivePulseDot";
import Toggle from "@/components/Toggle";
import { haptics } from "@/lib/haptics";
import { Users, Play, Check, RefreshCw, Bell, Clock, X, AlertCircle, MapPin, CheckCircle } from "@/components/Icons";
import { useApp } from "@/store";
import { businessService } from "@/services";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { parsePartySize, weightedWaitMin } from "@/lib/queueMath";
import type { QueueOwnerToken as Token } from "@/types";
import ManageNav from "./ManageNav";

// "12m ago" style label for how long a token has been waiting.
function waitedLabel(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just joined";
  if (m < 60) return `waiting ${m}m`;
  const h = Math.floor(m / 60);
  return `waiting ${h}h ${m % 60}m`;
}

// "served 12m ago" style label — served tokens are joined-at timestamps too
// (queue_tokens has no separate served_at column).
function servedAgoLabel(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

// "arrived 3m ago" style label — distinct from waitedLabel so a called
// customer who's physically here reads differently from one still en route.
function arrivedAgoLabel(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "arrived just now";
  if (m < 60) return `arrived ${m}m ago`;
  const h = Math.floor(m / 60);
  return `arrived ${h}h ${m % 60}m ago`;
}

// Clock time `min` minutes from now, e.g. "≈ 4:35 PM".
function etaClock(min: number): string {
  const d = new Date(Date.now() + min * 60000);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function QueueManager() {
  const { id: businessId = "" } = useParams<{ id: string }>();
  const { showToast } = useApp();
  const [live, setLive] = useState(false);
  const [avgTime, setAvgTime] = useState(8);
  const [inputValue, setInputValue] = useState("8");
  const [waiting, setWaiting] = useState<Token[]>([]);
  const [called, setCalled] = useState<Token[]>([]);
  const [served, setServed] = useState<Token[]>([]);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [nudging, setNudging] = useState<string | null>(null);
  const [calling, setCalling] = useState(false);
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"LIVE" | "HISTORY">("LIVE");
  const isInputFocused = useRef(false);

  const { data, loading, refetch } = useQueryWithRealtime(
    () => businessService.queueOwnerState(businessId),
    "queue_tokens",
    [businessId],
    `business_id=eq.${businessId}`,
    `queue:${businessId}`
  );

  // Full past-queue history for the History tab (SERVED/LEFT/EXPIRED, newest
  // first). Separate from the live board so switching tabs is instant.
  const { data: historyData, loading: historyLoading, refetch: refetchHistory } = useQuery(
    () => businessService.queueHistory(businessId),
    [businessId]
  );

  useEffect(() => {
    if (data) {
      setLive(data.isOpen);
      setAvgTime(data.avgServiceMin);
      if (!isInputFocused.current) setInputValue(data.avgServiceMin.toString());
      setWaiting(data.waiting);
      setCalled(data.called);
      setServed(data.served);
    }
  }, [data]);

  async function confirmPayment(token: Token) {
    setVerifying(token.id);
    try {
      await businessService.confirmQueuePayment(token.id);
      showToast(`✓ Payment confirmed — ${token.name}`);
      refetch();
    } catch (e: any) {
      showToast(e?.message || "Couldn't confirm — try again");
    } finally {
      setVerifying(null);
    }
  }

  async function rejectPayment(token: Token) {
    setVerifying(token.id);
    try {
      await businessService.rejectQueuePaymentClaim(token.id);
      showToast(`Payment claim rejected — ${token.name}`);
      refetch();
    } catch (e: any) {
      showToast(e?.message || "Couldn't reject — try again");
    } finally {
      setVerifying(null);
    }
  }

  async function nudgePayment(token: Token) {
    setNudging(token.id);
    try {
      await businessService.nudgeQueuePayment(token.id);
      showToast(`🔔 Payment request sent — ${token.name}`);
    } catch (e: any) {
      showToast(e?.message || "Couldn't send payment nudge.");
    } finally {
      setNudging(null);
    }
  }

  async function toggleLive() {
    const next = !live;
    setLive(next);
    try {
      await businessService.setQueueSettings(businessId, { isOpen: next });
      showToast(next ? "Queue is now open" : "Queue closed");
    } catch {
      setLive(!next);
      showToast("Couldn't update queue — try again");
    }
  }

  async function saveAvgTime(val: number) {
    setAvgTime(val);
    try {
      await businessService.setQueueSettings(businessId, { avgServiceMin: val });
    } catch {
      showToast("Couldn't save avg time");
    }
  }

  async function callNext() {
    if (waiting.length === 0 || calling) return;
    const first = waiting[0];
    setCalling(true);
    haptics.medium();
    // Optimistic: move to "now serving" immediately.
    setWaiting((t) => t.slice(1));
    setCalled((c) => [...c, first]);
    try {
      await businessService.callNextToken(businessId);
      haptics.success();
      showToast(`🔔 Called ${first.name}`);
    } catch (e: any) {
      setWaiting((t) => [first, ...t]);
      setCalled((c) => c.filter((x) => x.id !== first.id));
      showToast(e?.message || "Couldn't call next — try again");
    } finally {
      setCalling(false);
    }
  }

  async function markArrived(token: Token) {
    const now = new Date().toISOString();
    setCalled((c) => c.map((x) => (x.id === token.id ? { ...x, arrivedAt: now } : x)));
    try {
      await businessService.markArrived(token.id);
    } catch (e: any) {
      setCalled((c) => c.map((x) => (x.id === token.id ? { ...x, arrivedAt: null } : x)));
      showToast(e?.message || "Couldn't mark arrived — try again");
    }
  }

  // Plays the .queue-row-exit shrink/fade before the row actually leaves
  // local state, instead of an instant flat removal. Safe to use anywhere
  // that doesn't need to roll a removal back (serve/remove already resync
  // via refetch() on failure rather than restoring the row in place).
  function animateOut(tokenId: string, thenRemove: () => void) {
    setExitingIds((s) => new Set(s).add(tokenId));
    setTimeout(() => {
      thenRemove();
      setExitingIds((s) => {
        const next = new Set(s);
        next.delete(tokenId);
        return next;
      });
    }, 280);
  }

  async function serveToken(token: Token, from: "waiting" | "called") {
    animateOut(token.id, () => {
      if (from === "waiting") setWaiting((t) => t.filter((x) => x.id !== token.id));
      else setCalled((c) => c.filter((x) => x.id !== token.id));
    });
    try {
      await businessService.serveToken(token.id);
      showToast(`✓ Served ${token.name}`);
    } catch (e: any) {
      showToast(e?.message || "Couldn't mark as served — try again");
      refetch();
    }
  }

  async function removeToken(token: Token) {
    animateOut(token.id, () => setCalled((c) => c.filter((x) => x.id !== token.id)));
    try {
      await businessService.leaveQueueToken(token.id);
      showToast(`Removed ${token.name}`);
    } catch (e: any) {
      showToast(e?.message || "Couldn't remove — try again");
      refetch();
    }
  }

  if (loading) {
    return (
      <div className="screen">
        <AppBar title="Live queue" />
        <div className="screen-scroll page-pad col gap-14" style={{ paddingBottom: 30 }}>
          <Skeleton h={64} r={16} mb={0} />
          <Skeleton h={90} r={16} mb={0} />
          <Skeleton h={90} r={16} mb={0} />
          <Skeleton h={90} r={16} mb={0} />
        </div>
      </div>
    );
  }

  const totalWait = waiting.length * avgTime;
  const historyRows = historyData ?? [];

  function paymentRow(t: Token) {
    if (t.paymentStatus === "PAID") {
      return (
        <span className="badge badge-green" style={{ fontSize: 9, padding: "2px 7px" }}>
          ₹ {t.paymentMethod === "UPI" ? "UPI paid" : "Cash paid"}{t.paymentAmount ? ` · ₹${t.paymentAmount}` : ""}
        </span>
      );
    }
    if (t.paymentStatus === "PENDING_CONFIRM") {
      return (
        <div className="row gap-6 center-v" style={{ marginTop: 6, padding: "6px 8px", borderRadius: 8, background: "var(--amber-50)", border: "1px solid var(--amber-100)" }}>
          <AlertCircle size={13} color="var(--amber-700)" style={{ flexShrink: 0 }} />
          <span className="tiny semi" style={{ color: "var(--amber-700)", flex: 1 }}>
            Claims {t.paymentMethod ?? ""} payment{t.paymentAmount ? ` · ₹${t.paymentAmount}` : ""}
          </span>
          <button className="btn btn-sm" style={{ fontSize: 10, padding: "3px 8px", background: "var(--green-500)", color: "#fff", borderRadius: 6 }} disabled={verifying === t.id} onClick={() => confirmPayment(t)}>
            Confirm
          </button>
          <button className="btn btn-sm" style={{ fontSize: 10, padding: "3px 8px", background: "var(--red-600)", color: "#fff", borderRadius: 6 }} disabled={verifying === t.id} onClick={() => rejectPayment(t)}>
            Reject
          </button>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="screen with-nav">
      <AppBar title="Live queue" right={
        <button className="icon-btn" onClick={() => { refetch(); refetchHistory(); }} title="Refresh">
          <RefreshCw size={17} />
        </button>
      } />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 30 }}>
        {/* Live board vs. past queue history */}
        <div className="hscroll" style={{ paddingBottom: 2 }}>
          <button className={`chip ${view === "LIVE" ? "active" : ""}`} onClick={() => setView("LIVE")}>Live board</button>
          <button className={`chip ${view === "HISTORY" ? "active" : ""}`} onClick={() => setView("HISTORY")}>History</button>
        </div>

        {view === "LIVE" && (
          <>
        <button
          className="card row between"
          style={{ padding: 14, border: live ? "2px solid var(--green-500)" : "1px solid var(--line)" }}
          onClick={toggleLive}
        >
          <div>
            <div className="row gap-6" style={{ alignItems: "center" }}>
              <span className="semi small">Queue is {live ? "ON" : "OFF"}</span>
              {live && <LivePulseDot />}
            </div>
            <div className="tiny muted">Customers can join from your page</div>
          </div>
          <Toggle on={live} />
        </button>

        {live && (
          <>
            <div className="card">
              <div className="row between small semi" style={{ alignItems: "center" }}>
                <span>Avg service time</span>
                <div className="row gap-4" style={{ alignItems: "center" }}>
                  <input
                    type="number"
                    min={1}
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value);
                      const parsed = parseInt(e.target.value, 10);
                      if (!isNaN(parsed) && parsed >= 1) setAvgTime(parsed);
                    }}
                    onFocus={() => { isInputFocused.current = true; }}
                    onBlur={() => {
                      isInputFocused.current = false;
                      let val = parseInt(inputValue, 10);
                      if (isNaN(val) || val < 1) val = 8;
                      setInputValue(val.toString());
                      setAvgTime(val);
                      saveAvgTime(val);
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    style={{ width: 72, textAlign: "right", border: "1.5px solid var(--line)", borderRadius: "8px", padding: "6px 8px", fontSize: "14px", fontWeight: "700", background: "var(--bg)", color: "var(--brand-700)", outline: "none" }}
                  />
                  <span className="muted" style={{ fontSize: "14px" }}>min</span>
                </div>
              </div>
              <input
                type="range"
                min={2}
                max={Math.max(120, avgTime)}
                value={avgTime}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setInputValue(val.toString());
                  saveAvgTime(val);
                }}
                style={{ width: "100%", accentColor: "var(--brand-500)", marginTop: 12 }}
              />
              <div className="tiny muted" style={{ marginTop: 4 }}>Drives every customer's live wait estimate.</div>
            </div>

            {/* Summary strip */}
            <div className="row gap-10">
              <div className="card grow col center" style={{ padding: 14, gap: 2, background: "var(--brand-50)", border: "none" }}>
                <Users size={22} color="var(--brand-700)" />
                <span className="bold" style={{ fontSize: 22 }}>{waiting.length}</span>
                <span className="tiny muted">waiting</span>
              </div>
              <div className="card grow col center" style={{ padding: 14, gap: 2, background: "var(--ink-50)", border: "none" }}>
                <Clock size={22} color="var(--ink-600)" />
                <span className="bold" style={{ fontSize: 22 }}>~{totalWait}</span>
                <span className="tiny muted">min to clear</span>
              </div>
            </div>

            {/* Now serving (CALLED) */}
            {called.length > 0 && (
              <div className="col gap-8">
                <span className="tiny bold muted" style={{ textTransform: "uppercase", letterSpacing: 0.8 }}>Now serving</span>
                {called.map((t) => {
                  const arrived = !!t.arrivedAt;
                  return (
                  <div key={t.id} className={`card col gap-6${exitingIds.has(t.id) ? " queue-row-exit" : " queue-row-enter"}`} style={{ padding: 12, border: arrived ? "2px solid var(--green-500)" : "2px solid var(--brand-500)", background: arrived ? "var(--green-100)" : "var(--brand-50)" }}>
                    <div className="row gap-12">
                      <span style={{ width: 34, height: 34, borderRadius: "50%", background: arrived ? "var(--green-500)" : "var(--brand-500)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {arrived ? <CheckCircle size={16} /> : <Bell size={16} />}
                      </span>
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="row gap-6 center-v">
                          <div className="semi small">{t.name}</div>
                          {t.paymentStatus === "PAID" && paymentRow(t)}
                        </div>
                        <div className="tiny muted row gap-4 center-v"><Users size={11} /> {t.partySize} · {arrived ? arrivedAgoLabel(t.arrivedAt as string) : "called"}</div>
                      </div>
                      {arrived ? (
                        <button className="btn btn-green btn-sm" style={{ padding: "6px 12px" }} onClick={() => serveToken(t, "called")}>
                          <Check size={15} /> Done
                        </button>
                      ) : (
                        <button className="btn btn-primary btn-sm" style={{ padding: "6px 12px" }} onClick={() => markArrived(t)}>
                          <MapPin size={15} /> Arrived
                        </button>
                      )}
                      <button className="icon-btn" style={{ width: 32, height: 32, color: "var(--red-600)" }} title="Remove (no-show)" onClick={() => removeToken(t)}>
                        <X size={15} />
                      </button>
                    </div>
                    {t.paymentStatus === "PENDING_CONFIRM" && paymentRow(t)}
                  </div>
                  );
                })}
              </div>
            )}

            <button className="btn btn-primary btn-block" disabled={waiting.length === 0 || calling} onClick={callNext}>
              {calling ? <RefreshCw size={17} className="spin" /> : <Play size={17} />} {calling ? "Calling…" : `Call next ${waiting.length > 0 ? `— ${waiting[0].name}` : ""}`}
            </button>

            {/* Waiting line */}
            <div className="col gap-8">
              {waiting.length > 0 && (
                <span className="tiny bold muted" style={{ textTransform: "uppercase", letterSpacing: 0.8 }}>Up next</span>
              )}
              {waiting.map((t, i) => (
                <div key={t.id} className={`card row gap-12${exitingIds.has(t.id) ? " queue-row-exit" : " queue-row-enter"}`} style={{ padding: 12 }}>
                  <span className="bold" style={{ width: 24, textAlign: "center", color: i === 0 ? "var(--brand-700)" : "var(--ink-400)" }}>{i + 1}</span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="semi small">{t.name}</div>
                    <div className="tiny muted row gap-4 center-v"><Users size={11} /> {t.partySize} · {waitedLabel(t.joinedAtISO)}</div>
                    {(() => {
                      // Weighted by the party sizes of the groups ahead — matches the
                      // customer's My Queues ETA exactly. Deliberately a size/weight
                      // step up from the "waited so far" line above — the ETA is the
                      // actionable number, elapsed time is just context.
                      const eta = weightedWaitMin(waiting.slice(0, i).map((w) => parsePartySize(w.partySize)), avgTime);
                      return (
                        <div className="small semi" style={{ color: "var(--brand-700)", marginTop: 3 }}>
                          ~{eta} min · turn {etaClock(eta)}
                        </div>
                      );
                    })()}
                  </div>
                  <button
                    className="icon-btn"
                    style={{ width: 34, height: 34, color: "var(--green-500)" }}
                    title="Mark served"
                    onClick={() => serveToken(t, "waiting")}
                  >
                    <Check size={16} />
                  </button>
                </div>
              ))}
              {waiting.length === 0 && called.length === 0 && (
                <p className="muted small center" style={{ padding: 20 }}>Queue is empty 🎉</p>
              )}
            </div>

            {/* Recently served — payment verification has nowhere else to
                surface once a token leaves the waiting/called board. */}
            {served.length > 0 && (
              <div className="col gap-8">
                <span className="tiny bold muted" style={{ textTransform: "uppercase", letterSpacing: 0.8 }}>Recently served</span>
                {served.map((t) => (
                  <div key={t.id} className="card col gap-6" style={{ padding: 12 }}>
                    <div className="row gap-12 center-v">
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="semi small">{t.name}</div>
                        <div className="tiny muted row gap-4 center-v"><Users size={11} /> {t.partySize} · served {servedAgoLabel(t.joinedAtISO)}</div>
                      </div>
                      {t.paymentStatus === "PAID" && paymentRow(t)}
                      {(!t.paymentStatus || t.paymentStatus === "UNPAID" || t.paymentStatus === "REJECTED") && (
                        <button className="btn btn-outline btn-sm" style={{ fontSize: 10, padding: "3px 8px", color: "var(--amber-700)", borderColor: "var(--amber-200)" }} disabled={nudging === t.id} onClick={() => nudgePayment(t)}>
                          🔔 {nudging === t.id ? "Sending…" : "Request payment"}
                        </button>
                      )}
                    </div>
                    {t.paymentStatus === "PENDING_CONFIRM" && paymentRow(t)}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
          </>
        )}

        {view === "HISTORY" && (
          <div className="col gap-8">
            <span className="tiny bold muted" style={{ textTransform: "uppercase", letterSpacing: 0.8 }}>Past queue</span>
            {historyLoading && (
              <div className="col gap-8">
                <Skeleton h={56} r={14} mb={0} />
                <Skeleton h={56} r={14} mb={0} />
              </div>
            )}
            {!historyLoading && historyRows.length === 0 && (
              <p className="muted small center" style={{ padding: 20 }}>No past queue entries yet.</p>
            )}
            {historyRows.map((t) => (
              <div key={t.id} className="card col gap-6" style={{ padding: 12 }}>
                <div className="row gap-12 center-v">
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="semi small">{t.name}</div>
                    <div className="tiny muted row gap-4 center-v"><Users size={11} /> {t.partySize} · {servedAgoLabel(t.joinedAtISO)}</div>
                  </div>
                  <span
                    className={`badge ${t.status === "SERVED" ? "badge-green" : "badge-gray"}`}
                    style={{ fontSize: 9, padding: "2px 7px", flexShrink: 0 }}
                  >
                    {t.status === "SERVED" ? "Served" : t.status === "LEFT" ? "Left" : "Closed"}
                  </span>
                </div>
                {t.paymentStatus === "PAID" && (
                  <span className="badge badge-green" style={{ fontSize: 9, padding: "2px 7px", alignSelf: "flex-start" }}>
                    ₹ {t.paymentMethod === "UPI" ? "UPI paid" : "Paid"}{t.paymentAmount ? ` · ₹${t.paymentAmount}` : ""}
                  </span>
                )}
                {t.paymentStatus === "PENDING_CONFIRM" && (
                  <span className="badge badge-amber" style={{ fontSize: 9, padding: "2px 7px", alignSelf: "flex-start" }}>
                    Payment pending{t.paymentAmount ? ` · ₹${t.paymentAmount}` : ""}
                  </span>
                )}
                {t.paymentStatus === "REJECTED" && (
                  <span className="badge badge-red" style={{ fontSize: 9, padding: "2px 7px", alignSelf: "flex-start" }}>
                    Payment declined
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <ManageNav bizId={businessId} waitingCount={waiting.length} />
    </div>
  );
}
