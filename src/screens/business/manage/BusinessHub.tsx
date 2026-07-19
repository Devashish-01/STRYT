import { useNavigate, useParams } from "react-router-dom";
import { AppBar, inr } from "@/components/common";
import { appointmentService, businessService } from "@/services";
import { useQueryWithRealtime } from "@/hooks/useApi";
import { useApp } from "@/store";
import { ErrorView } from "@/components/states";
import {
  BadgeCheck, ChevronRight, Globe, HelpCircle, Inbox, LogOut, Megaphone, MessageSquareText,
  Search, Settings, Star, Store, User, Users, Wallet,
} from "@/components/Icons";
import type { QueueOwnerToken } from "@/types";
import { deriveMoneySummary } from "@/utils/paymentSummary";
import ManageNav from "./ManageNav";

interface HubLink {
  icon: React.ReactNode;
  title: string;
  text: string;
  onClick: () => void;
  badge?: number;
}

export default function BusinessHub() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { signOut } = useApp();
  const base = `/business/${id}/manage`;
  const { data: appointments } = useQueryWithRealtime(() => appointmentService.listForTarget(id), "appointments", [id], `target_id=eq.${id}`);
  const { data: queue } = useQueryWithRealtime(() => businessService.queueOwnerState(id), "queue_tokens", [id], `business_id=eq.${id}`);
  const { data: questions } = useQueryWithRealtime(() => businessService.qna(id), "business_qna", [id], `business_id=eq.${id}`);
  const { data: reviews } = useQueryWithRealtime(() => businessService.reviews(id), "ratings", [id], `ratee_id=eq.${id}`);

  if (!id) return <div className="screen"><AppBar title="Business" /><ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} /></div>;

  const queueTokens: QueueOwnerToken[] = [...(queue?.waiting ?? []), ...(queue?.called ?? []), ...(queue?.served ?? [])];
  const { paymentClaims, paidRecords, recordedAmount } = deriveMoneySummary(appointments ?? [], queueTokens);
  const unanswered = (questions ?? []).filter((item) => !item.answer).length;

  const communication: HubLink[] = [
    { icon: <Inbox size={19} color="var(--blue-500)" />, title: "Customer reachouts", text: "Calls, directions and lead activity", onClick: () => nav(`${base}/inbox`) },
    { icon: <MessageSquareText size={19} color="var(--brand-600)" />, title: "Messages", text: "Business-scoped customer chats", onClick: () => nav(`/chats?scope=BUSINESS&id=${id}`) },
    { icon: <HelpCircle size={19} color="var(--blue-500)" />, title: "Questions & answers", text: "Answer storefront questions", badge: unanswered, onClick: () => nav(`${base}/qna`) },
    { icon: <Star size={19} color="var(--amber-500)" />, title: "Reviews", text: "Read and reply to customer feedback", badge: reviews?.length ?? 0, onClick: () => nav(`${base}/reviews`) },
  ];
  const grow: HubLink[] = [
    { icon: <Search size={19} color="var(--orange-500)" />, title: "Find requests", text: "Win nearby customer work", onClick: () => nav(`${base}/requests`) },
    { icon: <Megaphone size={19} color="var(--brand-600)" />, title: "Community", text: "Post updates and manage your activity", onClick: () => nav(`${base}/community`) },
  ];
  const profile: HubLink[] = [
    { icon: <Store size={19} color="var(--orange-500)" />, title: "Business profile", text: "Identity, contact and location", onClick: () => nav(`${base}/profile`) },
    { icon: <Globe size={19} color="var(--blue-500)" />, title: "Broadcast radius", text: "Set how far your shop reaches nearby", onClick: () => nav(`${base}/broadcast`) },
    { icon: <Users size={19} color="var(--green-600)" />, title: "Delegated access", text: "Grant staff login to this business", onClick: () => nav("/account/business-access") },
    { icon: <BadgeCheck size={19} color="var(--green-600)" />, title: "Verification", text: "Documents and badge status", onClick: () => nav(`${base}/verify`) },
    { icon: <Settings size={19} color="var(--ink-600)" />, title: "Settings & privacy", text: "Business controls and account settings", onClick: () => nav(`${base}/settings`) },
  ];

  return (
    <div className="screen with-nav">
      <AppBar title="Business" subtitle="Money, customers, growth and profile" />
      <div className="screen-scroll">
        <div className="page-pad col gap-18">
          <section>
            <div className="small semi muted" style={{ marginBottom: 8 }}>Money</div>
            <div className="card" style={{ padding: 16 }}>
              <div className="row gap-12 center-v"><span style={{ width: 42, height: 42, borderRadius: 12, background: "var(--green-100)", display: "grid", placeItems: "center" }}><Wallet size={21} color="var(--green-600)" /></span><div className="grow"><div className="bold">{recordedAmount > 0 ? inr(recordedAmount) : `${paidRecords.length} payments`} recorded</div><div className="tiny muted">{paymentClaims} waiting for confirmation</div></div></div>
              <button className="btn btn-primary btn-sm btn-block" style={{ marginTop: 12 }} onClick={() => nav(`${base}/payments`)}>Open payments</button>
              <p className="tiny muted" style={{ marginTop: 9 }}>Summary covers records currently available in Bookings and the recent queue.</p>
            </div>
          </section>
          <HubSection title="Customer communication" links={communication} />
          <HubSection title="Grow" links={grow} />
          <HubSection title="Business profile" links={profile} />
          <button
            type="button"
            onClick={() => { signOut(); nav("/"); }}
            className="row center gap-8"
            style={{ marginTop: 4, padding: "13px", width: "100%", background: "var(--red-50)", border: "1px solid var(--red-500)", borderRadius: 12, color: "var(--red-600)", fontWeight: 700, cursor: "pointer" }}
          >
            <LogOut size={17} /> Log out
          </button>
        </div>
        <div style={{ height: 20 }} />
      </div>
      <ManageNav bizId={id} waitingCount={queue?.waiting.length ?? 0} />
    </div>
  );
}

function HubSection({ title, links }: { title: string; links: HubLink[] }) {
  return (
    <section>
      <div className="small semi muted" style={{ marginBottom: 8 }}>{title}</div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {links.map((link, index) => (
          <button key={link.title} className="row gap-12 center-v" style={{ width: "100%", padding: "14px 16px", textAlign: "left", borderTop: index ? "1px solid var(--line)" : "none" }} onClick={link.onClick}>
            <span style={{ width: 38, height: 38, borderRadius: 10, background: "var(--ink-50)", display: "grid", placeItems: "center" }}>{link.icon}</span>
            <div className="grow"><div className="semi small">{link.title}</div><div className="tiny muted">{link.text}</div></div>
            {!!link.badge && <span className="badge badge-amber">{link.badge}</span>}
            <ChevronRight size={17} color="var(--ink-300)" />
          </button>
        ))}
      </div>
    </section>
  );
}
