import { useNavigate } from "react-router-dom";
import { useNeighborhoodToday } from "./useNeighborhoodToday";
import type { TodaySignal } from "./types";

interface Props {
  lat?: number;
  lng?: number;
  radiusM?: number;
  areaName?: string;
}

export function NeighborhoodTodayCard({ lat, lng, radiusM = 3000, areaName }: Props) {
  const { signals, loading, error } = useNeighborhoodToday(lat, lng, radiusM);
  const nav = useNavigate();

  // Never block Home render
  if (error) return null;

  if (loading) return <SkeletonCard />;

  return (
    <div
      className="card"
      style={{
        padding: "12px 14px",
        margin: "0",
        borderRadius: 16,
        border: "1px solid var(--line)",
        background: "#fff",
      }}
    >
      {/* Header */}
      <div className="row between" style={{ marginBottom: signals.length > 0 ? 10 : 0 }}>
        <span className="semi small">
          {areaName ? `${areaName} today` : "Your neighbourhood today"}
        </span>
        <span
          className="tiny"
          style={{
            color: "#16a34a",
            background: "#dcfce7",
            borderRadius: 20,
            padding: "1px 8px",
            fontWeight: 600,
          }}
        >
          ● live
        </span>
      </div>

      {signals.length === 0 ? (
        <p className="tiny muted" style={{ lineHeight: 1.5 }}>
          It's quiet around you right now. Be the first to post something 👋
        </p>
      ) : (
        <div className="col" style={{ gap: 7 }}>
          {signals.map((s) => (
            <SignalRow key={s.key} signal={s} onNavigate={(path) => nav(path)} />
          ))}
        </div>
      )}
    </div>
  );
}

function SignalRow({ signal, onNavigate }: { signal: TodaySignal; onNavigate: (path: string) => void }) {
  const isUrgent = signal.tone === "urgent";
  const clickable = !!signal.deepLink;

  return (
    <button
      disabled={!clickable}
      onClick={() => signal.deepLink && onNavigate(signal.deepLink)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        textAlign: "left",
        padding: 0,
        background: "none",
        border: "none",
        cursor: clickable ? "pointer" : "default",
        opacity: 1,
      }}
    >
      <span style={{ fontSize: 15, flexShrink: 0 }} aria-hidden>{signal.icon}</span>
      <span
        className="small"
        style={{
          color: isUrgent ? "#dc2626" : "var(--ink-700)",
          fontWeight: isUrgent ? 600 : 400,
          lineHeight: 1.4,
        }}
      >
        {signal.text}
      </span>
      {clickable && (
        <span className="tiny" style={{ color: "var(--ink-400)", marginLeft: "auto", flexShrink: 0 }}>→</span>
      )}
    </button>
  );
}

function SkeletonCard() {
  return (
    <div
      className="card"
      style={{ padding: "12px 14px", borderRadius: 16, border: "1px solid var(--line)" }}
    >
      <div className="row between" style={{ marginBottom: 12 }}>
        <div className="skel" style={{ width: 140, height: 14, borderRadius: 6 }} />
        <div className="skel" style={{ width: 36, height: 14, borderRadius: 10 }} />
      </div>
      <div className="col" style={{ gap: 8 }}>
        {[0.75, 0.6, 0.5].map((w, i) => (
          <div key={i} className="skel" style={{ width: `${w * 100}%`, height: 12, borderRadius: 5 }} />
        ))}
      </div>
    </div>
  );
}
