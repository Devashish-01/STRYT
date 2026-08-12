import { useNavigate, useParams } from "react-router-dom";
import { AppBar, inr } from "@/components/common";
import { appointmentService, businessService } from "@/services";
import { useQueryWithRealtime } from "@/hooks/useApi";
import { useApp } from "@/store";
import { ErrorView } from "@/components/states";
import { SettingsSection, SettingsRow } from "@/components/settings";
import {
  HelpCircle, Inbox, LogOut, Megaphone, MessageSquareText,
  Package, Search, Star, Users, Wallet,
} from "@/components/Icons";
import { DELIVERY_AGENT_ENABLED } from "@/lib/features";
import type { QueueOwnerToken } from "@/types";
import { deriveMoneySummary } from "@/utils/paymentSummary";
import ManageNav from "./ManageNav";
import { useBusinessAccess } from "@/components/BusinessAccessGuard";
import type { ReactNode } from "react";

interface HubLink {
  icon: ReactNode;
  title: string;
  text: string;
  onClick: () => void;
  badge?: number;
}

function links(items: HubLink[]) {
  return items.map((link) => (
    <SettingsRow
      key={link.title}
      icon={link.icon}
      label={link.title}
      hint={link.text}
      badge={!!link.badge && <span className="badge badge-amber">{link.badge}</span>}
      onClick={link.onClick}
    />
  ));
}

export default function BusinessHub() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { signOut } = useApp();
  // TMA-006 — this route has NO RequireScope wrapper; it sits directly under
  // BusinessAccessGuard and self-hides sections by scope instead. That means
  // anything added here is visible to EVERY grantee by default. Gate each new
  // section on hasScope()/isOwner explicitly, the way the existing ones are.
  const { isOwner, hasScope, hasActiveDeliveries } = useBusinessAccess();
  const base = `/business/${id}/manage`;
  const { data: appointments } = useQueryWithRealtime(() => appointmentService.listForTarget(id), "appointments", [id], `target_id=eq.${id}`);
  const { data: queue } = useQueryWithRealtime(() => businessService.queueOwnerState(id), "queue_tokens", [id], `business_id=eq.${id}`, `queue:${id}`);
  const { data: questions } = useQueryWithRealtime(() => businessService.qna(id), "business_qna", [id], `business_id=eq.${id}`);
  const { data: reviews } = useQueryWithRealtime(() => businessService.reviews(id), "ratings", [id], `ratee_id=eq.${id}`);

  if (!id) return <div className="screen"><AppBar title="Business" /><ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} /></div>;

  const queueTokens: QueueOwnerToken[] = [...(queue?.waiting ?? []), ...(queue?.called ?? []), ...(queue?.served ?? [])];
  const { paymentClaims, paidRecords, recordedAmount } = deriveMoneySummary(appointments ?? [], queueTokens);
  const unanswered = (questions ?? []).filter((item) => !item.answer).length;

  // A SCOPED team member only sees the sections their grant covers — `leads`
  // unlocks reachouts/messages/qna/find-requests; everything else here
  // (reviews, community, and the whole "Business profile" group: identity,
  // broadcast, team management, verification, settings) is owner/FULL-only,
  // mirroring the RLS/RequireScope boundaries exactly so the UI never offers
  // a link the server would reject.
  const communication: HubLink[] = [
    ...(hasScope("leads") ? [
      { icon: <Inbox size={19} color="var(--blue-500)" />, title: "Customer reachouts", text: "Calls, directions and lead activity", onClick: () => nav(`${base}/inbox`) },
      { icon: <MessageSquareText size={19} color="var(--brand-600)" />, title: "Messages", text: "Business-scoped customer chats", onClick: () => nav(`/chats?scope=BUSINESS&id=${id}`) },
      { icon: <HelpCircle size={19} color="var(--blue-500)" />, title: "Questions & answers", text: "Answer storefront questions", badge: unanswered, onClick: () => nav(`${base}/qna`) },
    ] : []),
    ...(isOwner ? [
      { icon: <Star size={19} color="var(--amber-500)" />, title: "Reviews", text: "Read and reply to customer feedback", badge: reviews?.length ?? 0, onClick: () => nav(`${base}/reviews`) },
    ] : []),
  ];
  const operations: HubLink[] = [
    ...(DELIVERY_AGENT_ENABLED && hasScope("appointments") ? [
      { icon: <Package size={19} color="var(--delivery-600)" />, title: "Live deliveries", text: "Track agents and orders in progress", onClick: () => nav(`${base}/deliveries`) },
    ] : []),
    ...(DELIVERY_AGENT_ENABLED && hasActiveDeliveries ? [
      { icon: <Package size={19} color="var(--delivery-600)" />, title: "My deliveries", text: "Runs assigned to you", onClick: () => nav(`${base}/my-deliveries`) },
    ] : []),
    // ManageNav only shows a Queue tab once a business has actually used
    // queues once (a queue_settings row exists) — this is the discovery path
    // for a business that hasn't yet, so the feature isn't hidden behind its
    // own precondition. Disappears the moment they've saved queue settings once.
    ...(isOwner && !queue?.hasEverUsedQueue ? [
      { icon: <Users size={19} color="var(--brand-600)" />, title: "Set up walk-in queue", text: "Let customers join a line without an appointment", onClick: () => nav(`${base}/queue`) },
    ] : []),
  ];
  const grow: HubLink[] = [
    ...(hasScope("leads") ? [
      { icon: <Search size={19} color="var(--orange-500)" />, title: "Find requests", text: "Win nearby customer work", onClick: () => nav(`${base}/requests`) },
    ] : []),
    ...(isOwner ? [
      { icon: <Megaphone size={19} color="var(--brand-600)" />, title: "My Community", text: "Post updates and manage your activity", onClick: () => nav(`${base}/community`) },
    ] : []),
  ];
  return (
    <div className="screen with-nav">
      <AppBar title="Business" subtitle="Money, customers, and growth" />
      <div className="screen-scroll">
        <div className="page-pad col gap-18">
          {isOwner && (
            <section>
              <div className="small semi muted" style={{ marginBottom: 8 }}>Money</div>
              <div className="card" style={{ padding: 16 }}>
                <div className="row gap-12 center-v"><span style={{ width: 42, height: 42, borderRadius: 12, background: "var(--green-100)", display: "grid", placeItems: "center" }}><Wallet size={21} color="var(--green-600)" /></span><div className="grow"><div className="bold">{recordedAmount > 0 ? inr(recordedAmount) : `${paidRecords.length} payments`} recorded</div><div className="tiny muted">{paymentClaims} waiting for confirmation</div></div></div>
                <button className="btn btn-primary btn-sm btn-block" style={{ marginTop: 12 }} onClick={() => nav(`${base}/payments`)}>Open payments</button>
                <p className="tiny muted" style={{ marginTop: 9 }}>Summary covers records currently available in Bookings and the recent queue.</p>
              </div>
            </section>
          )}
          {operations.length > 0 && <SettingsSection title="Operations">{links(operations)}</SettingsSection>}
          {communication.length > 0 && <SettingsSection title="Customer communication">{links(communication)}</SettingsSection>}
          {grow.length > 0 && <SettingsSection title="Grow">{links(grow)}</SettingsSection>}
          <button
            type="button"
            className="btn btn-block row center gap-8"
            style={{ color: "var(--red-600)", background: "var(--red-50)", border: "1px solid var(--red-100)" }}
            onClick={() => { signOut(); nav("/"); }}
          >
            <LogOut size={18} /> Log out
          </button>
        </div>
        <div style={{ height: 20 }} />
      </div>
      <ManageNav bizId={id} waitingCount={queue?.waiting.length ?? 0} />
    </div>
  );
}
