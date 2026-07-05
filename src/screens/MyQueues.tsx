import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, EmptyState, SafeImg } from "@/components/common";
import { ListSkeleton, ErrorView } from "@/components/states";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { businessService } from "@/services";
import { useApp } from "@/store";
import { ArrowUpDown, Clock, Users, X } from "@/components/Icons";
import type { MyQueueEntry } from "@/types";

const ACTIVE: MyQueueEntry["status"][] = ["WAITING", "CALLED"];

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function MyQueues() {
  const nav = useNavigate();
  const { showToast } = useApp();
  const { data, loading, error, refetch } = useQueryWithRealtime(() => businessService.myQueues(), "queue_tokens", []);
  const [tab, setTab] = useState<"ACTIVE" | "HISTORY">("ACTIVE");
  const [sortByName, setSortByName] = useState(false);
  const [leaving, setLeaving] = useState<string | null>(null);

  const all = data ?? [];
  const active = all.filter((q) => ACTIVE.includes(q.status));
  const history = all.filter((q) => !ACTIVE.includes(q.status));
  let list = tab === "ACTIVE" ? [...active] : [...history];
  if (tab === "ACTIVE" && sortByName) list.sort((a, b) => a.businessName.localeCompare(b.businessName));

  async function leave(tokenId: string) {
    setLeaving(tokenId);
    try {
      await businessService.leaveQueueToken(tokenId);
      showToast("Left the queue");
      refetch();
    } catch {
      showToast("Couldn't leave queue. Try again.");
    } finally {
      setLeaving(null);
    }
  }

  return (
    <div className="screen">
      <AppBar title="My Queues" subtitle={active.length > 0 ? `${active.length} active` : undefined} />

      <div className="hscroll" style={{ paddingTop: 12, paddingBottom: 6 }}>
        <button className={`chip ${tab === "ACTIVE" ? "active" : ""}`} onClick={() => setTab("ACTIVE")}>
          ⏳ Active{active.length > 0 ? ` (${active.length})` : ""}
        </button>
        <button className={`chip ${tab === "HISTORY" ? "active" : ""}`} onClick={() => setTab("HISTORY")}>
          🕘 History
        </button>
      </div>

      <div className="screen-scroll">
        {loading && <ListSkeleton count={3} />}
        {error && <ErrorView error={error} onRetry={refetch} />}
        {!loading && !error && (
          <div className="page-pad col gap-12" style={{ paddingTop: 8 }}>
            {tab === "ACTIVE" && active.length > 0 && (
              <button
                className="row gap-6 center-v tiny semi"
                style={{ alignSelf: "flex-end", color: "var(--brand-700)" }}
                onClick={() => setSortByName((v) => !v)}
              >
                <ArrowUpDown size={13} /> Sort: {sortByName ? "Shop name" : "Wait time"}
              </button>
            )}

            {list.length === 0 ? (
              <EmptyState
                emoji="👥"
                title={tab === "ACTIVE" ? "No active queues" : "No queue history yet"}
                text={tab === "ACTIVE" ? "Join a shop's live queue and it'll show up here." : "Served and left queues appear here."}
              />
            ) : (
              list.map((q) => (
                <div key={q.tokenId} className="card row gap-12 center-v" style={{ padding: 14 }}>
                  <SafeImg
                    src={q.businessImage}
                    className="thumb"
                    style={{ width: 52, height: 52, borderRadius: 12, objectFit: "cover", flexShrink: 0, cursor: "pointer" }}
                    onClick={() => nav(`/business/${q.businessId}`)}
                  />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="bold small ellipsis">{q.businessName}</div>
                    <div className="tiny muted row gap-4 center-v" style={{ marginTop: 2 }}>
                      <Users size={11} /> {q.partySize} · <Clock size={11} /> {timeAgo(q.joinedAtISO)}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      {q.status === "WAITING" && (
                        <span className="badge badge-purple">You're #{q.position} · {q.peopleAhead} ahead</span>
                      )}
                      {q.status === "CALLED" && <span className="badge badge-green">🔔 Called — your turn!</span>}
                      {q.status === "SERVED" && <span className="badge badge-gray">✓ Served</span>}
                      {q.status === "LEFT" && <span className="badge badge-gray">Left queue</span>}
                    </div>
                  </div>
                  {ACTIVE.includes(q.status) && (
                    <button
                      className="icon-btn"
                      style={{ width: 34, height: 34, color: "var(--red-600)", flexShrink: 0 }}
                      disabled={leaving === q.tokenId}
                      onClick={() => leave(q.tokenId)}
                      aria-label="Leave queue"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}
        <div style={{ height: 16 }} />
      </div>
    </div>
  );
}
