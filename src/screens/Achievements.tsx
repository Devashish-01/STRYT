import { AppBar, SafeImg } from "@/components/common";
import { ListSkeleton } from "@/components/states";
import { socialService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";

export default function Achievements() {
  const { user } = useApp();
  const { data, loading } = useQuery(() => socialService.achievements(), []);
  const achievements = data ?? [];
  const unlocked = achievements.filter((a) => a.unlocked).length;

  return (
    <div className="screen">
      <AppBar title="Achievements" subtitle={`${unlocked} of ${achievements.length} unlocked`} />
      <div className="screen-scroll">
        {/* Hero */}
        <div className="page-pad">
          <div className="card col center" style={{ padding: 20, gap: 6, background: "linear-gradient(135deg, var(--brand-500), var(--brand-700))", color: "#fff", border: "none" }}>
            <SafeImg src={user.avatar} variant="avatar" className="avatar" style={{ width: 60, height: 60, border: "3px solid rgba(255,255,255,0.3)" }} />
            <div className="bold" style={{ fontSize: 17, marginTop: 4 }}>{user.name}</div>
            <div className="row gap-6">
              <span className="badge" style={{ background: "rgba(255,255,255,0.2)", color: "#fff" }}>🔥 5-week streak</span>
              <span className="badge" style={{ background: "rgba(255,255,255,0.2)", color: "#fff" }}>🏘️ Level 4</span>
            </div>
          </div>
        </div>

        {loading ? (
          <ListSkeleton count={4} />
        ) : (
        <div className="page-pad" style={{ paddingTop: 4 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {achievements.map((a) => (
              <div key={a.id} className="card col" style={{ padding: 14, gap: 6, alignItems: "center", textAlign: "center", opacity: a.unlocked ? 1 : 0.75 }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, background: a.unlocked ? "var(--brand-50)" : "var(--ink-100)", filter: a.unlocked ? "none" : "grayscale(1)" }}>
                  {a.emoji}
                </div>
                <div className="semi small">{a.title}</div>
                <div className="tiny muted" style={{ lineHeight: 1.3 }}>{a.desc}</div>
                {a.unlocked ? (
                  <span className="badge badge-green">Unlocked</span>
                ) : (
                  <div style={{ width: "100%" }}>
                    <div style={{ height: 6, borderRadius: 6, background: "var(--ink-100)", overflow: "hidden" }}>
                      <div style={{ width: `${(a.progress ?? 0) * 100}%`, height: "100%", background: "var(--brand-500)" }} />
                    </div>
                    <span className="tiny muted">{Math.round((a.progress ?? 0) * 100)}%</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        )}
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
