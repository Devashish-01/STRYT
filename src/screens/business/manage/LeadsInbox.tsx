import { useState } from "react";
import { useParams } from "react-router-dom";
import { AppBar, EmptyState } from "@/components/common";
import { businessService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { Phone, Navigation, MessageCircle, Tag, CalendarCheck, HelpCircle, Check } from "lucide-react";
import { useApp } from "@/store";
import type { Lead } from "@/types";
import ManageNav from "./ManageNav";

const meta: Record<string, { icon: any; color: string }> = {
  CALL: { icon: Phone, color: "#16a34a" },
  DIRECTIONS: { icon: Navigation, color: "#f26a00" },
  STORY_REPLY: { icon: MessageCircle, color: "#ec4899" },
  OFFER_CLIP: { icon: Tag, color: "#6b21cc" },
  RESERVATION: { icon: CalendarCheck, color: "#0ea5e9" },
  QUESTION: { icon: HelpCircle, color: "#6366f1" },
};

export default function LeadsInbox() {
  const { id = "b1" } = useParams();
  const { data, loading, error, refetch } = useQuery<Lead[]>(() => businessService.leads(id) as any, [id]);
  const { showToast } = useApp();
  const [handled, setHandled] = useState<string[]>([]);
  const [filter, setFilter] = useState<"all" | "new">("all");

  const list = (data ?? []).filter((l) => (filter === "new" ? !l.handled && !handled.includes(l.id) : true));

  return (
    <div className="screen with-nav">
      <AppBar title="Leads inbox" subtitle="Who reached out via Naya" />
      <div className="hscroll" style={{ paddingTop: 12 }}>
        <button className={`chip ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>All</button>
        <button className={`chip ${filter === "new" ? "active" : ""}`} onClick={() => setFilter("new")}>New only</button>
      </div>
      <div className="screen-scroll">
        {loading && <ListSkeleton count={4} />}
        {error && <ErrorView error={error} onRetry={refetch} />}
        {data && (
          <div className="page-pad col gap-10">
            {list.length === 0 && <EmptyState emoji="📥" title="No leads here" text="Calls, directions and questions show up here." />}
            {list.map((l) => {
              const M = meta[l.kind];
              const Icon = M.icon;
              const done = l.handled || handled.includes(l.id);
              return (
                <div key={l.id} className="card row gap-12" style={{ padding: 12, opacity: done ? 0.6 : 1 }}>
                  <div style={{ position: "relative" }}>
                    <img src={l.avatar} className="avatar" style={{ width: 42, height: 42 }} />
                    <span style={{ position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: "50%", background: M.color, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}><Icon size={9} color="#fff" /></span>
                  </div>
                  <div className="grow">
                    <div className="semi small">{l.name}</div>
                    <div className="tiny muted">{l.text}</div>
                    <div className="tiny" style={{ color: "var(--ink-400)" }}>{l.time}</div>
                  </div>
                  {!done && (
                    <button className="icon-btn" style={{ width: 34, height: 34, color: "#16a34a" }} onClick={async () => { setHandled((h) => [...h, l.id]); await businessService.markLeadHandled(l.id); showToast("Marked handled"); }}><Check size={16} /></button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div style={{ height: 16 }} />
      </div>
      <ManageNav bizId={id} />
    </div>
  );
}
