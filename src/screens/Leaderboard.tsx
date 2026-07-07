import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, SafeImg } from "@/components/common";
import { Trophy, Crown } from "@/components/Icons";
import { socialService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";

type Tab = "providers" | "neighbors";

export default function Leaderboard() {
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("providers");
  const { data, loading, error, refetch } = useQuery(() => socialService.leaderboard(), []);

  const leaderboard = data ?? [];
  const list = leaderboard.filter((l) => (tab === "providers" ? l.isProvider : !l.isProvider)).sort((a, b) => a.rank - b.rank);
  const podiumColors = ["var(--amber-500)", "var(--ink-400)", "var(--amber-700)"];

  return (
    <div className="screen">
      <AppBar title="Local heroes" subtitle="This month in your area" />
      <div className="row" style={{ borderBottom: "1px solid var(--line)", background: "#fff" }}>
        {([["providers", "🏆 Top Providers"], ["neighbors", "🤝 Top Neighbors"]] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className="semi"
            style={{ flex: 1, padding: "12px 0", fontSize: 13.5, color: tab === t ? "var(--brand-700)" : "var(--ink-500)", borderBottom: tab === t ? "2.5px solid var(--brand-700)" : "2.5px solid transparent" }}>
            {label}
          </button>
        ))}
      </div>

      <div className="screen-scroll">
        {loading ? (
          <ListSkeleton count={5} />
        ) : error ? (
          <ErrorView error={error} onRetry={refetch} />
        ) : (
          <>
            {/* Podium */}
            <div className="row gap-10 page-pad" style={{ alignItems: "flex-end", justifyContent: "center", paddingTop: 24, paddingBottom: 8 }}>
              {[1, 0, 2].map((order) => {
                const e = list[order];
                if (!e) return null;
                const heights = [96, 120, 80];
                const isFirst = order === 0;
                return (
                  <div key={order} className="col center" style={{ gap: 8, flex: 1 }}>
                    <div style={{ position: "relative" }}>
                      {isFirst && <Crown size={22} color="var(--amber-500)" style={{ position: "absolute", top: -20, left: "50%", transform: "translateX(-50%)" }} />}
                      <SafeImg src={e.avatar} variant="avatar" className="avatar" style={{ width: isFirst ? 64 : 52, height: isFirst ? 64 : 52, border: `3px solid ${podiumColors[order]}` }} />
                    </div>
                    <span className="semi tiny ellipsis" style={{ maxWidth: 90, textAlign: "center" }}>{e.name.split(" ")[0]}</span>
                    <div style={{ width: "100%", height: heights[order], background: `linear-gradient(to top, ${podiumColors[order]}, ${podiumColors[order]}99)`, borderRadius: "12px 12px 0 0", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 8, color: "#fff", fontWeight: 800, fontSize: 22 }}>
                      {e.rank}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="page-pad col gap-10">
              {list.map((e) => (
                <div key={e.rank + e.name} className="card row gap-12" style={{ padding: 12 }} onClick={() => nav(e.isProvider ? `/provider/${e.targetId}` : `/u/${e.targetId}`)}>
                  <span className="bold" style={{ width: 24, textAlign: "center", color: e.rank <= 3 ? podiumColors[e.rank - 1] : "var(--ink-400)" }}>{e.rank}</span>
                  <SafeImg src={e.avatar} variant="avatar" className="avatar" style={{ width: 44, height: 44 }} />
                  <div className="grow">
                    <div className="semi small">{e.name}</div>
                    <div className="tiny muted">{e.metric}</div>
                  </div>
                  <span className="badge badge-amber"><Trophy size={11} /> {e.value}</span>
                </div>
              ))}
            </div>
            <div style={{ height: 24 }} />
          </>
        )}
      </div>
    </div>
  );
}
