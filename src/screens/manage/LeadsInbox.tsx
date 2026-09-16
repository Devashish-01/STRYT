import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppBar, EmptyState, SafeImg } from "@/components/common";
import { businessService, providerService } from "@/services";
import { useQueryWithRealtime } from "@/hooks/useApi";
import { useMessageUser } from "@/hooks/useMessageUser";
import { ErrorView, ListSkeleton } from "@/components/states";
import { CalendarCheck, Check, HelpCircle, MessageCircle, Navigation, Phone, Tag } from "@/components/Icons";
import { useApp } from "@/store";
import { openProfile } from "@/lib/profileSheet";
import type { Lead } from "@/types";
import ManageNav from "@/screens/business/manage/ManageNav";
import ProviderManageNav from "@/screens/provider/manage/ProviderManageNav";

const meta: Record<string, { icon: any; color: string }> = {
  CALL: { icon: Phone, color: "var(--green-500)" },
  DIRECTIONS: { icon: Navigation, color: "var(--orange-500)" },
  STORY_REPLY: { icon: MessageCircle, color: "var(--pink-500)" },
  OFFER_CLIP: { icon: Tag, color: "var(--brand-700)" },
  RESERVATION: { icon: CalendarCheck, color: "var(--blue-500)" },
  QUESTION: { icon: HelpCircle, color: "var(--blue-500)" },
  MESSAGE: { icon: MessageCircle, color: "var(--brand-600)" },
};

interface LeadsInboxProps {
  entityType: "BUSINESS" | "PROVIDER";
}

/** Reachouts inbox, shared by the business and provider consoles — used to be
 *  business-only (src/screens/business/manage/LeadsInbox.tsx); the provider
 *  side's own service.leads()/markLeadHandled() were fully built and working
 *  but had no UI consumer anywhere. Genericized rather than duplicated since
 *  the original had no business-specific assumptions baked in beyond which
 *  service/nav to use. */
export default function LeadsInbox({ entityType }: LeadsInboxProps) {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { showToast } = useApp();
  const messageUser = useMessageUser();
  const [handled, setHandled] = useState<string[]>([]);
  const isBusiness = entityType === "BUSINESS";
  const service = isBusiness ? businessService : providerService;
  const filterKey = isBusiness ? "business_id" : "provider_id";
  const { data, loading, error, refetch } = useQueryWithRealtime<Lead[]>(
    () => service.leads(id) as Promise<Lead[]>,
    "leads",
    [id, entityType],
    `${filterKey}=eq.${id}`
  );

  function openLead(lead: Lead) {
    if (lead.kind === "QUESTION" && isBusiness) {
      nav(`/business/${id}/manage/qna`);
    } else if (lead.kind === "MESSAGE") {
      if (lead.fromUserId) void messageUser(lead.fromUserId);
      else nav("/chats");
    } else if (lead.kind === "CALL") {
      if (lead.phone) {
        window.location.href = `tel:${lead.phone}`;
      } else if (lead.fromUserId) {
        openProfile(lead.fromUserId, "USER", { name: lead.name, avatar: lead.avatar });
      }
    }
  }

  if (!id) return <div className="screen"><AppBar title="Inbox" /><ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} /></div>;
  const leads = data ?? [];

  async function markHandled(lead: Lead) {
    setHandled((current) => [...current, lead.id]);
    try {
      await service.markLeadHandled(lead.id);
      showToast("Marked handled");
    } catch (e: any) {
      setHandled((current) => current.filter((item) => item !== lead.id));
      showToast(e?.message || "Couldn't update reachout");
    }
  }

  /** LEAD-5: handled was a one-way tap with no undo, so one mis-tap hid a customer who still needed calling back. */
  async function unmarkHandled(lead: Lead) {
    setHandled((current) => current.filter((item) => item !== lead.id));
    try {
      await service.markLeadHandled(lead.id, false);
      showToast("Back in the list");
      refetch();
    } catch (e: any) {
      setHandled((current) => [...current, lead.id]);
      showToast(e?.message || "Couldn't update reachout");
    }
  }

  return (
    <div className="screen with-nav">
      <AppBar
        title={isBusiness ? "Customer reachouts" : "Reachouts"}
        subtitle={isBusiness ? "Calls, directions, questions and replies" : "Calls and messages from customers"}
      />
      <div className="screen-scroll">
        {loading && <ListSkeleton count={4} />}
        {error && <ErrorView error={error} onRetry={refetch} />}
        {!loading && !error && (
          <div className="page-pad col gap-10">
            {leads.length === 0 && (
              <EmptyState
                emoji="📥"
                title="No reachouts"
                text={isBusiness ? "Calls, directions and customer questions appear here." : "Calls and messages from customers appear here."}
              />
            )}
            {leads.map((lead) => {
              const style = meta[lead.kind] || meta.CALL;
              const Icon = style.icon;
              const done = lead.handled || handled.includes(lead.id);
              const hasDestination = lead.kind === "MESSAGE" || (lead.kind === "QUESTION" && isBusiness) || (lead.kind === "CALL" && Boolean(lead.phone || lead.fromUserId));
              return (
                <div
                  key={lead.id}
                  className="card row gap-12 center-v"
                  style={{ padding: 12, opacity: done ? .6 : 1, cursor: hasDestination ? "pointer" : "default" }}
                  onClick={hasDestination ? () => openLead(lead) : undefined}
                >
                  <div style={{ position: "relative" }}><SafeImg src={lead.avatar} variant="avatar" className="avatar" style={{ width: 42, height: 42 }} /><span style={{ position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: "50%", background: style.color, display: "grid", placeItems: "center", border: "2px solid var(--white)" }}><Icon size={9} color="var(--white)" /></span></div>
                  <div className="grow"><div className="semi small">{lead.name}</div><div className="tiny muted">{lead.text}</div><div className="tiny" style={{ color: "var(--ink-400)" }}>{lead.time}</div></div>
                  {done ? (
                    <button className="tiny semi" style={{ color: "var(--ink-500)", background: "none", border: "none", minHeight: 44, padding: "0 8px" }} onClick={(e) => { e.stopPropagation(); unmarkHandled(lead); }}>
                      Undo
                    </button>
                  ) : (
                    // 44px: this sits inside a card that is itself tappable, so a small target meant opening the lead
                    // when you meant to tick it off (LEAD-7).
                    <button className="icon-btn" aria-label="Mark handled" style={{ width: 44, height: 44, color: "var(--green-500)" }} onClick={(e) => { e.stopPropagation(); markHandled(lead); }}><Check size={16} /></button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {isBusiness ? <ManageNav bizId={id} /> : <ProviderManageNav pid={id} />}
    </div>
  );
}
