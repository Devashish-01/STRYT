import { useState } from "react";
import { useParams } from "react-router-dom";
import { AppBar, SafeImg, inr } from "@/components/common";
import { appointmentService, businessService } from "@/services";
import { ownerVisibleCustomerName } from "@/services/engagement/appointmentService";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { Skeleton } from "@/components/states";
import { PaymentStatusCard } from "@/components/PaymentStatusCard";
import type { AppointmentRecord, QueueOwnerToken } from "@/types";
import ManageNav from "./ManageNav";
import { useApp } from "@/store";

/**
 * The business console's single payments home — appointment claims and queue
 * claims side by side, with confirm/reject and a request-payment nudge for
 * outstanding balances. Replaces the old "Payments" dashboard tile that
 * landed on BusinessHub (a generic link-hub, not an actions screen); mirrors
 * ProviderMoney.tsx's already-correct pattern for the provider console.
 */
export default function BusinessPayments() {
  const { id = "" } = useParams();
  const { showToast } = useApp();
  const { data: b } = useQuery(() => businessService.get(id), [id], `business:${id}`);

  const { data: aptsData, refetch: refetchApts } = useQueryWithRealtime<AppointmentRecord[]>(
    () => appointmentService.listForTarget(id),
    "appointments",
    [id],
    `target_id=eq.${id}`
  );
  const { data: queueData, loading: queueLoading, refetch: refetchQueue } = useQueryWithRealtime(
    () => businessService.queueOwnerState(id),
    "queue_tokens",
    [id],
    `business_id=eq.${id}`,
    `queue:${id}`
  );

  const [processingApt, setProcessingApt] = useState<string | null>(null);
  const [processingQueue, setProcessingQueue] = useState<string | null>(null);
  const [nudging, setNudging] = useState<string | null>(null);

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Payments" />
      </div>
    );
  }

  const appointments = aptsData ?? [];
  const queueTokens: QueueOwnerToken[] = [
    ...(queueData?.waiting ?? []),
    ...(queueData?.called ?? []),
    ...(queueData?.served ?? []),
  ];

  const aptClaims = appointments.filter((a) => a.paymentStatus === "PENDING_CONFIRM");
  const queueClaims = queueTokens.filter((t) => t.paymentStatus === "PENDING_CONFIRM");

  const aptOutstanding = appointments.filter(
    (a) => (a.status === "ACCEPTED" || a.status === "COMPLETED") &&
      (a.paymentStatus ?? "UNPAID") === "UNPAID" && (a.packagePrice ?? 0) > 0
  );
  // Queue outstanding only makes sense once served — mirrors QueueManager's
  // own nudge-eligible set (WAITING/CALLED haven't been charged anything yet).
  const queueOutstanding = (queueData?.served ?? []).filter(
    (t) => (t.paymentStatus ?? "UNPAID") === "UNPAID" || t.paymentStatus === "REJECTED"
  );

  const aptRecentlyPaid = appointments
    .filter((a) => a.paymentStatus === "PAID")
    .sort((a, c) => new Date(c.scheduledForISO).getTime() - new Date(a.scheduledForISO).getTime())
    .slice(0, 15);
  const queueRecentlyPaid = (queueData?.served ?? []).filter((t) => t.paymentStatus === "PAID");

  async function handleApt(apt: AppointmentRecord, action: "CONFIRM" | "REJECT") {
    setProcessingApt(apt.id);
    try {
      if (action === "CONFIRM") {
        await appointmentService.confirmPayment(apt.id);
        showToast("Payment confirmed ✓");
      } else {
        await appointmentService.rejectPaymentClaim(apt.id);
        showToast("Payment claim rejected — customer notified.");
      }
      refetchApts();
    } catch (e: any) {
      showToast(e?.message || "Couldn't update payment status. Try again.");
    } finally {
      setProcessingApt(null);
    }
  }

  async function handleQueue(token: QueueOwnerToken, action: "CONFIRM" | "REJECT") {
    setProcessingQueue(token.id);
    try {
      if (action === "CONFIRM") {
        await businessService.confirmQueuePayment(token.id);
        showToast(`✓ Payment confirmed — ${token.name}`);
      } else {
        await businessService.rejectQueuePaymentClaim(token.id);
        showToast(`Payment claim rejected — ${token.name}`);
      }
      refetchQueue();
    } catch (e: any) {
      showToast(e?.message || "Couldn't update — try again");
    } finally {
      setProcessingQueue(null);
    }
  }

  async function handleNudgeApt(apt: AppointmentRecord) {
    setNudging(apt.id);
    try {
      await appointmentService.nudgePayment(apt.id);
      showToast("Payment request nudge sent 🔔");
    } catch (e: any) {
      showToast(e?.message || "Couldn't send payment nudge.");
    } finally {
      setNudging(null);
    }
  }

  async function handleNudgeQueue(token: QueueOwnerToken) {
    setNudging(token.id);
    try {
      await businessService.nudgeQueuePayment(token.id);
      showToast(`🔔 Payment request sent — ${token.name}`);
    } catch (e: any) {
      showToast(e?.message || "Couldn't send payment nudge.");
    } finally {
      setNudging(null);
    }
  }

  const claimsCount = aptClaims.length + queueClaims.length;
  const outstandingCount = aptOutstanding.length + queueOutstanding.length;

  return (
    <div className="screen with-nav">
      <AppBar title="Payments" subtitle={b?.name ? `For ${b.name}` : "Booking & queue payments"} />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 24 }}>

        {queueLoading && !queueData && <Skeleton h={80} mb={0} />}

        {claimsCount === 0 && outstandingCount === 0 && aptRecentlyPaid.length === 0 && queueRecentlyPaid.length === 0 && (
          <div className="card col center" style={{ padding: 28, gap: 6 }}>
            <span style={{ fontSize: 28 }}>💳</span>
            <span className="tiny muted">Payment claims and history will show up here.</span>
          </div>
        )}

        {claimsCount > 0 && (
          <div>
            <div className="small semi muted" style={{ marginBottom: 8 }}>To confirm ({claimsCount})</div>
            <div className="col gap-10">
              {aptClaims.map((apt) => (
                <div key={apt.id} className="card col gap-10" style={{ padding: 14 }}>
                  <div className="row gap-10 center-v">
                    <SafeImg src={apt.customerAvatar} variant="avatar" style={{ width: 38, height: 38 }} />
                    <div className="grow">
                      <div className="bold small">{ownerVisibleCustomerName(apt)}</div>
                      <div className="tiny muted">{apt.dateLabel} at {apt.timeLabel}{apt.packageName ? ` · ${apt.packageName}` : ""}</div>
                    </div>
                  </div>
                  <PaymentStatusCard
                    paymentStatus={apt.paymentStatus}
                    paymentMethod={apt.paymentMethod}
                    paymentAmount={apt.paymentAmount}
                    paymentReference={apt.paymentReference}
                    claimantName={apt.customerName}
                    viewerIsPayer={false}
                    busy={processingApt === apt.id}
                    onConfirm={() => handleApt(apt, "CONFIRM")}
                    onReject={() => handleApt(apt, "REJECT")}
                  />
                </div>
              ))}
              {queueClaims.map((t) => (
                <div key={t.id} className="card col gap-10" style={{ padding: 14 }}>
                  <div className="row gap-10 center-v">
                    <span className="badge badge-gray" style={{ fontSize: 9, padding: "1px 6px" }}>Queue</span>
                    <div className="grow">
                      <div className="bold small">{t.name}</div>
                      <div className="tiny muted">{t.partySize}</div>
                    </div>
                  </div>
                  <PaymentStatusCard
                    paymentStatus={t.paymentStatus}
                    paymentMethod={t.paymentMethod}
                    paymentAmount={t.paymentAmount}
                    paymentReference={t.paymentReference}
                    claimantName={t.name}
                    viewerIsPayer={false}
                    busy={processingQueue === t.id}
                    onConfirm={() => handleQueue(t, "CONFIRM")}
                    onReject={() => handleQueue(t, "REJECT")}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {outstandingCount > 0 && (
          <div>
            <div className="small semi muted" style={{ marginBottom: 8 }}>Outstanding ({outstandingCount})</div>
            <div className="col gap-8">
              {aptOutstanding.map((apt) => (
                <div key={apt.id} className="card row between center-v" style={{ padding: 12 }}>
                  <div className="row gap-10 center-v">
                    <SafeImg src={apt.customerAvatar} variant="avatar" style={{ width: 34, height: 34 }} />
                    <div>
                      <div className="semi small">{ownerVisibleCustomerName(apt)}</div>
                      <div className="tiny muted">{apt.dateLabel}{apt.packageName ? ` · ${apt.packageName}` : ""}</div>
                    </div>
                  </div>
                  <div className="row gap-8 center-v">
                    <span className="badge badge-amber" style={{ fontSize: 11 }}>{inr(apt.packagePrice ?? 0)}</span>
                    <button className="btn btn-outline btn-sm" style={{ fontSize: 11, padding: "4px 8px", color: "var(--amber-700)", borderColor: "var(--amber-200)" }} disabled={nudging === apt.id} onClick={() => handleNudgeApt(apt)}>
                      🔔 {nudging === apt.id ? "…" : "Nudge"}
                    </button>
                  </div>
                </div>
              ))}
              {queueOutstanding.map((t) => (
                <div key={t.id} className="card row between center-v" style={{ padding: 12 }}>
                  <div>
                    <div className="row gap-6 center-v">
                      <span className="badge badge-gray" style={{ fontSize: 9, padding: "1px 6px" }}>Queue</span>
                      <div className="semi small">{t.name}</div>
                    </div>
                    <div className="tiny muted" style={{ marginTop: 2 }}>{t.partySize}</div>
                  </div>
                  <div className="row gap-8 center-v">
                    {t.paymentAmount != null && <span className="badge badge-amber" style={{ fontSize: 11 }}>{inr(t.paymentAmount)}</span>}
                    <button className="btn btn-outline btn-sm" style={{ fontSize: 11, padding: "4px 8px", color: "var(--amber-700)", borderColor: "var(--amber-200)" }} disabled={nudging === t.id} onClick={() => handleNudgeQueue(t)}>
                      🔔 {nudging === t.id ? "…" : "Nudge"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(aptRecentlyPaid.length > 0 || queueRecentlyPaid.length > 0) && (
          <div>
            <div className="small semi muted" style={{ marginBottom: 8 }}>Recently paid</div>
            <div className="card" style={{ overflow: "hidden", padding: 0 }}>
              {aptRecentlyPaid.map((apt, i) => (
                <div key={apt.id} className="row between center-v" style={{ padding: "12px 14px", borderTop: i > 0 ? "1px solid var(--line)" : "none" }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="semi small">{ownerVisibleCustomerName(apt)}</div>
                    <div className="tiny muted ellipsis">{apt.dateLabel}{apt.packageName ? ` · ${apt.packageName}` : ""}</div>
                  </div>
                  <span className="semi small">{inr(apt.paymentAmount ?? apt.packagePrice ?? 0)}</span>
                </div>
              ))}
              {queueRecentlyPaid.map((t, i) => (
                <div key={t.id} className="row between center-v" style={{ padding: "12px 14px", borderTop: (aptRecentlyPaid.length + i) > 0 ? "1px solid var(--line)" : "none" }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="row gap-6 center-v">
                      <span className="badge badge-gray" style={{ fontSize: 9, padding: "1px 6px" }}>Queue</span>
                      <div className="semi small">{t.name}</div>
                    </div>
                  </div>
                  <span className="semi small">{t.paymentAmount != null ? inr(t.paymentAmount) : "—"}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <ManageNav bizId={id} />
    </div>
  );
}
