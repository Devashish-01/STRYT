import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { AppBar } from "@/components/common";
import { Users, Play, Check, RefreshCw } from "lucide-react";
import { useApp } from "@/store";
import { businessService } from "@/services";

interface Token { id: string; name: string; partySize: string; }

export default function QueueManager() {
  const { id: businessId = "" } = useParams<{ id: string }>();
  const { showToast } = useApp();
  const [live, setLive] = useState(false);
  const [avgTime, setAvgTime] = useState(8);
  const [inputValue, setInputValue] = useState("8");
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const avgTimeRef = useRef(avgTime);
  avgTimeRef.current = avgTime;
  const isInputFocused = useRef(false);

  const load = useCallback(async () => {
    if (!businessId) return;
    try {
      const state = await businessService.queueOwnerState(businessId);
      setLive(state.isOpen);
      setAvgTime(state.avgServiceMin);
      if (!isInputFocused.current) {
        setInputValue(state.avgServiceMin.toString());
      }
      setTokens(state.tokens);
    } catch {
      // silent — queue settings row may not exist yet (first open)
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  // Poll every 15 s so the owner sees new arrivals without a manual refresh
  useEffect(() => {
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, [load]);

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
    if (tokens.length === 0) return;
    const first = tokens[0];
    try {
      await businessService.callNextToken(businessId);
      showToast(`Called ${first.name}`);
      setTokens((t) => t.slice(1));
    } catch {
      showToast("Couldn't call next — try again");
    }
  }

  async function serveToken(token: Token) {
    try {
      await businessService.serveToken(token.id);
      showToast(`Served ${token.name}`);
      setTokens((t) => t.filter((x) => x.id !== token.id));
    } catch {
      showToast("Couldn't mark as served — try again");
    }
  }

  if (loading) {
    return (
      <div className="screen">
        <AppBar title="Live queue" />
        <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 30 }}>
          <div className="card" style={{ padding: 40, textAlign: "center" }}>
            <span className="muted small">Loading…</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <AppBar title="Live queue" right={
        <button className="icon-btn" onClick={load} title="Refresh">
          <RefreshCw size={17} />
        </button>
      } />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 30 }}>
        <button
          className="card row between"
          style={{ padding: 14, border: live ? "2px solid var(--green-500)" : "1px solid var(--line)" }}
          onClick={toggleLive}
        >
          <div>
            <div className="semi small">Queue is {live ? "ON" : "OFF"}</div>
            <div className="tiny muted">Customers can join from your page</div>
          </div>
          <span style={{ width: 44, height: 26, borderRadius: 999, background: live ? "var(--green-500)" : "var(--ink-200)", position: "relative" }}>
            <span style={{ position: "absolute", top: 3, left: live ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
          </span>
        </button>

        {live && (
          <>
            <div className="card" style={{ padding: 16 }}>
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
                      if (!isNaN(parsed) && parsed >= 1) {
                        setAvgTime(parsed);
                      }
                    }}
                    onFocus={() => {
                      isInputFocused.current = true;
                    }}
                    onBlur={() => {
                      isInputFocused.current = false;
                      let val = parseInt(inputValue, 10);
                      if (isNaN(val) || val < 1) {
                        val = 8;
                      }
                      setInputValue(val.toString());
                      setAvgTime(val);
                      saveAvgTime(val);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    style={{
                      width: 72,
                      textAlign: "right",
                      border: "1.5px solid var(--line)",
                      borderRadius: "8px",
                      padding: "6px 8px",
                      fontSize: "14px",
                      fontWeight: "700",
                      background: "var(--bg)",
                      color: "var(--brand-700)",
                      outline: "none"
                    }}
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
            </div>

            <div className="card col center" style={{ padding: 16, gap: 4, background: "var(--brand-50)", border: "none" }}>
              <Users size={26} color="#cc4415" />
              <span className="bold" style={{ fontSize: 26 }}>{tokens.length}</span>
              <span className="tiny muted">in queue • ~{tokens.length * avgTime} min total</span>
            </div>

            <button className="btn btn-primary btn-block" disabled={tokens.length === 0} onClick={callNext}>
              <Play size={17} /> Call next
            </button>

            <div className="col gap-8">
              {tokens.map((t, i) => (
                <div key={t.id} className="card row gap-12" style={{ padding: 12 }}>
                  <span className="bold" style={{ width: 24, textAlign: "center", color: i === 0 ? "var(--brand-700)" : "var(--ink-400)" }}>{i + 1}</span>
                  <div className="grow">
                    <div className="semi small">{t.name}</div>
                    <div className="tiny muted">{t.partySize}</div>
                  </div>
                  <button
                    className="icon-btn"
                    style={{ width: 34, height: 34, color: "#16a34a" }}
                    title="Mark served"
                    onClick={() => serveToken(t)}
                  >
                    <Check size={16} />
                  </button>
                </div>
              ))}
              {tokens.length === 0 && (
                <p className="muted small center" style={{ padding: 20 }}>Queue is empty 🎉</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
