import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FileText } from "lucide-react";
import { requestService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { RequestCard } from "@/components/cards";
import { EmptyState } from "@/components/common";
import { useApp } from "@/store";

type Tab = "nearby" | "mine";

export default function Requests() {
  const nav = useNavigate();
  const { area, user } = useApp();
  const [tab, setTab] = useState<Tab>("nearby");
  const [cat, setCat] = useState<string | null>(null);
  const [special, setSpecial] = useState<"all" | "urgent" | "group" | "recurring">("all");

  const { data: feedPage, loading: feedLoading, error: feedError, refetch } = useQuery(() => requestService.feed({ lat: user.lat || 0, lng: user.lng || 0 }), [user.lat, user.lng]);
  const { data: mineList, loading: mineLoading } = useQuery(() => requestService.mine(user.lat || 0, user.lng || 0), [user.lat, user.lng]);

  const feed = feedPage?.data ?? [];
  const mine = mineList ?? [];

  const cats = Array.from(new Set(feed.map((r) => r.categoryName)));
  let nearby = feed.filter((r) => (cat ? r.categoryName === cat : true));
  if (special === "urgent") nearby = nearby.filter((r) => r.isUrgent);
  if (special === "group") nearby = nearby.filter((r) => r.isGroupBuy);
  if (special === "recurring") nearby = nearby.filter((r) => r.isRecurring);
  const list = tab === "nearby" ? nearby : mine;
  const loading = tab === "nearby" ? feedLoading : mineLoading;

  return (
    <div className="screen with-nav">
      <header className="appbar" style={{ flexDirection: "column", alignItems: "stretch", gap: 12, paddingBottom: 0 }}>
        <div className="row between">
          <div className="col" style={{ gap: 0 }}>
            <span className="bold" style={{ fontSize: 20 }}>Request Feed</span>
            <span className="tiny muted">Open needs near {area}</span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => nav("/ask")}>
            <Plus size={16} /> Ask
          </button>
        </div>

        <div className="row" style={{ borderBottom: "1px solid var(--line)" }}>
          {([["nearby", "Nearby"], ["mine", "My requests"]] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="semi"
              style={{
                flex: 1,
                padding: "12px 0",
                fontSize: 14,
                color: tab === t ? "var(--brand-700)" : "var(--ink-500)",
                borderBottom: tab === t ? "2.5px solid var(--brand-700)" : "2.5px solid transparent",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="screen-scroll">
        {tab === "nearby" && (
          <>
            <div className="hscroll" style={{ paddingTop: 12, paddingBottom: 0 }}>
              {([["all", "All"], ["urgent", "🔥 Urgent"], ["group", "👥 Group buys"], ["recurring", "🔁 Recurring"]] as const).map(([s, label]) => (
                <button key={s} className={`chip ${special === s ? "active" : ""}`} onClick={() => setSpecial(s)}>{label}</button>
              ))}
            </div>
            <div className="hscroll" style={{ paddingTop: 8 }}>
              <button className={`chip ${!cat ? "active" : ""}`} onClick={() => setCat(null)}>All categories</button>
              {cats.map((c) => (
                <button key={c} className={`chip ${cat === c ? "active" : ""}`} onClick={() => setCat(cat === c ? null : c)}>
                  {c}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="col gap-12 page-pad">
          {loading ? (
            <ListSkeleton count={3} />
          ) : feedError && tab === "nearby" ? (
            <ErrorView error={feedError} onRetry={refetch} />
          ) : list.length === 0 ? (
            <EmptyState
              emoji="📭"
              title={tab === "mine" ? "No requests yet" : "All quiet nearby"}
              text={tab === "mine" ? "Post your first request and watch the offers roll in." : "No open requests in this filter. Check back soon."}
              action={
                <button className="btn btn-primary btn-sm" onClick={() => nav("/ask")}>
                  <FileText size={16} /> Post a request
                </button>
              }
            />
          ) : (
            list.map((r) => <RequestCard key={r.id} r={r} />)
          )}
        </div>
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
