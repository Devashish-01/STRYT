import { useState } from "react";
import { useParams } from "react-router-dom";
import { AppBar, EmptyState, SafeImg } from "@/components/common";
import { businessService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { ErrorView, ListSkeleton } from "@/components/states";
import { CalendarCheck, Check, HelpCircle, MessageCircle, Navigation, Phone, Tag } from "@/components/Icons";
import { useApp } from "@/store";
import type { Lead } from "@/types";
import ManageNav from "./ManageNav";

const meta: Record<string, { icon: any; color: string }> = {
  CALL: { icon: Phone, color: "var(--green-500)" },
  DIRECTIONS: { icon: Navigation, color: "var(--orange-500)" },
  STORY_REPLY: { icon: MessageCircle, color: "var(--pink-500)" },
  OFFER_CLIP: { icon: Tag, color: "var(--brand-700)" },
  RESERVATION: { icon: CalendarCheck, color: "var(--blue-500)" },
  QUESTION: { icon: HelpCircle, color: "var(--blue-500)" },
};

export default function LeadsInbox() {
  const { id = "" } = useParams();
  const { showToast } = useApp();
  const [handled, setHandled] = useState<string[]>([]);
  const { data, loading, error, refetch } = useQuery<Lead[]>(() => businessService.leads(id) as Promise<Lead[]>, [id]);

  if (!id) return <div className="screen"><AppBar title="Inbox" /><ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} /></div>;
  const leads = data ?? [];

  async function markHandled(lead: Lead) {
    setHandled((current) => [...current, lead.id]);
    try {
      await businessService.markLeadHandled(lead.id);
      showToast("Marked handled");
    } catch {
      setHandled((current) => current.filter((item) => item !== lead.id));
      showToast("Couldn't update reachout");
    }
  }

  return (
    <div className="screen with-nav">
      <AppBar title="Customer inbox" subtitle="Calls, directions, questions and replies" />
      <div className="screen-scroll">
        {loading && <ListSkeleton count={4} />}
        {error && <ErrorView error={error} onRetry={refetch} />}
        {!loading && !error && (
          <div className="page-pad col gap-10">
            {leads.length === 0 && <EmptyState emoji="📥" title="No reachouts" text="Calls, directions and customer questions appear here." />}
            {leads.map((lead) => {
              const style = meta[lead.kind] || meta.CALL;
              const Icon = style.icon;
              const done = lead.handled || handled.includes(lead.id);
              return (
                <div key={lead.id} className="card row gap-12 center-v" style={{ padding: 12, opacity: done ? .6 : 1 }}>
                  <div style={{ position: "relative" }}><SafeImg src={lead.avatar} variant="avatar" className="avatar" style={{ width: 42, height: 42 }} /><span style={{ position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: "50%", background: style.color, display: "grid", placeItems: "center", border: "2px solid #fff" }}><Icon size={9} color="#fff" /></span></div>
                  <div className="grow"><div className="semi small">{lead.name}</div><div className="tiny muted">{lead.text}</div><div className="tiny" style={{ color: "var(--ink-400)" }}>{lead.time}</div></div>
                  {!done && <button className="icon-btn" aria-label="Mark handled" style={{ width: 34, height: 34, color: "var(--green-500)" }} onClick={() => markHandled(lead)}><Check size={16} /></button>}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <ManageNav bizId={id} />
    </div>
  );
}
