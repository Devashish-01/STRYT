import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { AppBar, inr, EmptyState, SafeImg } from "@/components/common";
import { CheckCircle2, Circle, Wallet, Calendar, ShieldCheck, Info, AlertTriangle, MapPin, Clock, ExternalLink, Share2, XCircle, QrCode } from "@/components/Icons";
import { requestService } from "@/services";
import DealUpiSheet from "@/components/DealUpiSheet";
import { PaymentStatusCard } from "@/components/PaymentStatusCard";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { Skeleton } from "@/components/states";
import { useApp } from "@/store";
import type { Agreement, AgreementStatus, Proposal, RequestPost, JobLiveStatus } from "@/types";
import { nativeGeolocation } from "@/lib/nativeGeolocation";
import { useI18n } from "@/lib/i18n";

// ── Helpers ──────────────────────────────────────────────────────────────────

function elapsedSince(iso: string | undefined): string {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

// ── Step progress bar ────────────────────────────────────────────────────────

const STEPS: { labelKey: string; statuses: AgreementStatus[] }[] = [
  { labelKey: "confirmed",   statuses: ["PENDING"] },
  { labelKey: "deposit",     statuses: ["DEPOSIT_PAID", "ACTIVE"] },
  { labelKey: "in_progress", statuses: ["IN_PROGRESS"] },
  { labelKey: "review",      statuses: ["REVIEW"] },
  { labelKey: "done",        statuses: ["COMPLETED"] },
];

function stepIndex(status: AgreementStatus): number {
  if (status === "DISPUTED" || status === "CANCELLED") return -1;
  for (let i = 0; i < STEPS.length; i++) {
    if ((STEPS[i].statuses as string[]).includes(status)) return i;
  }
  return 0;
}

function ProgressBar({ status }: { status: AgreementStatus }) {
  const active = stepIndex(status);
  const { t } = useI18n();
  if (active === -1) return null;
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", position: "relative" }}>
        <div style={{
          position: "absolute", top: 10, left: "10%", right: "10%", height: 3,
          background: "var(--ink-100)", borderRadius: 2, zIndex: 0,
        }} />
        <div style={{
          position: "absolute", top: 10, left: "10%", height: 3, borderRadius: 2,
          background: "var(--brand-600)", zIndex: 1,
          width: `${(active / (STEPS.length - 1)) * 80}%`,
          transition: "width 0.4s ease",
        }} />
        {STEPS.map((s, i) => {
          const done = i <= active;
          const current = i === active;
          return (
            <div key={s.labelKey} className="col center" style={{ zIndex: 2, width: "16%" }}>
              <div style={{
                width: 22, height: 22, borderRadius: "50%",
                background: current ? "var(--brand-600)" : done ? "var(--brand-600)" : "#fff",
                border: current ? "2.5px solid var(--brand-100)" : done ? "none" : "2.5px solid var(--ink-200)",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.4s ease",
              }}>
                {done && !current && <CheckCircle2 size={12} color="#fff" />}
              </div>
              <span className="tiny bold" style={{
                marginTop: 6,
                color: current ? "var(--brand-700)" : done ? "var(--ink-700)" : "var(--ink-400)",
                textAlign: "center",
                fontSize: 9,
                textTransform: "uppercase",
                letterSpacing: 0.3,
              }}>
                {t(s.labelKey)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Process guide ────────────────────────────────────────────────────────────

const GUIDE: { status: AgreementStatus[]; requesterAction: string; responderAction: string }[] = [
  { status: ["PENDING"],       requesterAction: "guide_confirm",       responderAction: "guide_confirm" },
  { status: ["ACTIVE"],        requesterAction: "guide_pay",           responderAction: "guide_wait_payment" },
  { status: ["DEPOSIT_PAID"],  requesterAction: "guide_wait_start",    responderAction: "guide_tap_start" },
  { status: ["IN_PROGRESS"],   requesterAction: "guide_wait_finish",   responderAction: "guide_tap_review" },
  { status: ["REVIEW"],        requesterAction: "guide_approve_dispute", responderAction: "guide_await_approval" },
  { status: ["COMPLETED"],     requesterAction: "guide_rate",           responderAction: "guide_job_complete" },
];

function ProcessGuide({ status, isRequester }: { status: AgreementStatus; isRequester: boolean }) {
  const { t } = useI18n();
  if (status === "CANCELLED" || status === "DISPUTED") return null;
  const step = GUIDE.find((g) => (g.status as string[]).includes(status));
  if (!step) return null;
  const myActionKey    = isRequester ? step.requesterAction : step.responderAction;
  const otherActionKey = isRequester ? step.responderAction : step.requesterAction;
  return (
    <div className="card" style={{ background: "var(--brand-50)", border: "1px solid var(--brand-200)" }}>
      <div className="semi small" style={{ color: "var(--brand-700)", marginBottom: 10 }}>{t("what_happens_next")}</div>
      <div className="row gap-10" style={{ marginBottom: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--brand-600)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 13, color: "#fff", fontWeight: 700 }}>{t("you")}</span>
        </div>
        <span className="small semi">{t(myActionKey)}</span>
      </div>
      <div className="row gap-10">
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--ink-200)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: "var(--ink-600)", fontWeight: 600 }}>{t("them")}</span>
        </div>
        <span className="small muted">{t(otherActionKey)}</span>
      </div>
    </div>
  );
}

const LIVE_STEPS: { key: JobLiveStatus; labelKey: string; emoji: string }[] = [
  { key: "LEAVING",    labelKey: "leaving_now", emoji: "🚶" },
  { key: "ON_THE_WAY", labelKey: "on_the_way",  emoji: "🛵" },
  { key: "ARRIVED",    labelKey: "arrived",     emoji: "📍" },
  { key: "WORKING",    labelKey: "working",     emoji: "🔧" },
];

// ── Main screen ──────────────────────────────────────────────────────────────

export default function AgreementScreen() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { t } = useI18n();
  const { state } = useLocation() as { state?: { request?: RequestPost; proposal?: Proposal } };
  const { user, showToast } = useApp();

  const isNew = id === "new" && !!state?.request && !!state?.proposal;
  const { data: fetched, loading, refetch } = useQueryWithRealtime(
    () => (isNew ? Promise.resolve(undefined) : requestService.getAgreement(id)),
    "agreements",
    [id, isNew],
    isNew ? undefined : `id=eq.${id}`
  );
  // Money state must be visible: HELD = safely escrowed, RELEASED = paid out.
  const { data: payment } = useQuery(
    () => (isNew ? Promise.resolve(null) : requestService.paymentForAgreement(id)),
    [id, isNew]
  );

  let agreement: Agreement | undefined;
  if (isNew && state?.request && state?.proposal) {
    agreement = {
      id: "ag-new",
      requestId: state.request.id,
      requestTitle: state.request.title,
      proposalId: state.proposal.id,
      requesterUserId: state.request.requesterUserId,
      responderUserId: state.proposal.responderUserId,
      requesterName: state.request.requesterName,
      requesterAvatar: state.request.requesterAvatar,
      responderName: state.proposal.responderName,
      responderAvatar: state.proposal.responderAvatar,
      agreedPrice: state.proposal.price,
      terms: `${state.request.title}. ${state.proposal.message} ETA: ${state.proposal.eta}.`,
      scheduledFor: state.request.deadline,
      requesterConfirmed: false,
      responderConfirmed: false,
      paymentMode: "OFFLINE",
      status: "PENDING",
    };
  } else {
    agreement = fetched;
  }

  const [confirmedLocally, setConfirmedLocally] = useState(false);
  const [disputeMode, setDisputeMode] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  const liveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!agreement || agreement.status !== "PENDING" || !agreement.createdAt) return;
    const expiresAt = new Date(agreement.createdAt).getTime() + 10 * 60 * 1000;
    
    const updateTime = () => {
      const diff = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setTimeLeft(diff);
      if (diff === 0) {
        // Expiry reached, reload data which runs lazy cancellation
        refetch();
      }
    };
    
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, [agreement?.status, agreement?.createdAt, refetch]);

  function formatTimeLeft(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  if (loading && !isNew) {
    return (
      <div className="screen">
        <AppBar title="Agreement" />
        <div className="page-pad col gap-14" style={{ marginTop: 12 }}>
          <Skeleton h={120} mb={0} />
          <Skeleton h={80} mb={0} />
          <Skeleton h={100} mb={0} />
        </div>
      </div>
    );
  }

  if (!agreement) {
    return (
      <div className="screen">
        <AppBar title="Agreement" />
        <EmptyState emoji="🤝" title="Agreement not found" text="This agreement may have been cancelled." />
      </div>
    );
  }

  const isRequester = user.id === agreement.requesterUserId;
  const myConfirmedDB  = isRequester ? agreement.requesterConfirmed : agreement.responderConfirmed;
  const myConfirmed    = confirmedLocally || myConfirmedDB;
  const otherConfirmed = isRequester ? agreement.responderConfirmed : agreement.requesterConfirmed;
  const otherName      = isRequester ? agreement.responderName : agreement.requesterName;

  const status = agreement.status;

  async function run(action: () => Promise<unknown>, successMsg?: string) {
    setBusy(true);
    try {
      await action();
      if (successMsg) showToast(successMsg);
      if (!isNew) refetch();
    } catch {
      showToast("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function getGPS(): Promise<{ lat: number; lng: number } | null> {
    return new Promise((res) =>
      nativeGeolocation.getCurrentPosition(
        (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => res(null),
        { timeout: 5000 }
      )
    );
  }

  async function handleLiveStep(key: JobLiveStatus) {
    const coords = await getGPS();
    await requestService.updateLiveStatus(agreement!.id, key, coords?.lat, coords?.lng);
    refetch();
    if (liveIntervalRef.current) clearInterval(liveIntervalRef.current);
    if (key === "ON_THE_WAY") {
      liveIntervalRef.current = setInterval(async () => {
        const c = await getGPS();
        if (c) await requestService.updateLiveStatus(agreement!.id, "ON_THE_WAY", c.lat, c.lng);
      }, 30000);
    }
  }

  // ── Bottom action area ────────────────────────────────────────────────────

  function ActionArea() {
    if (status === "COMPLETED") {
      return (
        <div className="col center" style={{ padding: 16, gap: 6, background: "var(--green-100)", borderTop: "1px solid var(--green-500)" }}>
          <CheckCircle2 size={28} color="var(--green-500)" />
          <span className="semi" style={{ color: "var(--green-600)" }}>{t("job_complete")}</span>
        </div>
      );
    }

    if (status === "CANCELLED") {
      return (
        <div className="col center" style={{ padding: 16, gap: 12, background: "var(--red-50)", borderTop: "1px solid var(--red-100)", textAlign: "center" }}>
          <XCircle size={28} color="var(--red-600)" />
          <div>
            <span className="semi" style={{ color: "var(--red-600)" }}>{t("agreement_cancelled")}</span>
            <p className="tiny muted" style={{ marginTop: 4, maxWidth: 320, lineHeight: 1.4 }}>
              {t("agreement_cancelled_long_desc")}
            </p>
          </div>
          <button
            className="btn btn-outline btn-sm btn-block"
            onClick={() => nav(`/request/${agreement!.requestId}`)}
          >
            {t("view_quotes_again")}
          </button>
        </div>
      );
    }

    if (status === "DISPUTED") {
      return (
        <div className="col center" style={{ padding: 16, gap: 6, background: "var(--orange-50)", borderTop: "1px solid var(--orange-100)" }}>
          <AlertTriangle size={26} color="var(--orange-500)" />
          <span className="semi" style={{ color: "var(--orange-500)" }}>{t("under_dispute_desc")}</span>
        </div>
      );
    }

    if (status === "PENDING") {
      if (myConfirmed) {
        return (
          <div style={{ padding: 12, borderTop: "1px solid var(--line)", background: "#fff" }}>
            <button className="btn btn-outline btn-block" disabled>
              {t("waiting_other_confirm").replace("{name}", otherName)}
            </button>
          </div>
        );
      }
      return (
        <div style={{ padding: 12, borderTop: "1px solid var(--line)", background: "#fff" }}>
          <button
            className="btn btn-primary btn-block"
            disabled={busy}
            onClick={() => run(async () => {
              await requestService.confirmAgreement(agreement!.id);
              setConfirmedLocally(true);
              showToast("You confirmed the agreement ✓");
            })}
          >
            {t("confirm_proceed")}
          </button>
        </div>
      );
    }

    // ACTIVE = confirmed by both, payment not yet settled. Work cannot start
    // yet for either side — payment must clear first (cash: instant; UPI:
    // responder must confirm receipt), matching the intended order: approve
    // → pay → (UPI) provider/business approves the payment → THEN work starts.
    if (status === "ACTIVE") {
      const pStatus = agreement!.paymentStatus ?? "UNPAID";

      if (!isRequester) {
        // Responder: the confirm/reject buttons for a pending UPI claim live
        // in the card above (main scroll area) — the bottom bar just reflects
        // where things stand so there's no "start work" escape hatch here.
        return (
          <div style={{ padding: 12, borderTop: "1px solid var(--line)", background: "#fff" }}>
            <button className="btn btn-outline btn-block" disabled>
              {pStatus === "PENDING_CONFIRM"
                ? t("review_payment_claim")
                : t("waiting_other_pay").replace("{name}", otherName)}
            </button>
          </div>
        );
      }

      // Requester already claimed via UPI — nothing to do but wait; the
      // responder must confirm or reject before this can move forward.
      if (pStatus === "PENDING_CONFIRM") {
        return (
          <div style={{ padding: 12, borderTop: "1px solid var(--line)", background: "#fff" }}>
            <button className="btn btn-outline btn-block" disabled>
              <Clock size={16} /> {t("waiting_other_confirm_payment").replace("{name}", otherName)}
            </button>
          </div>
        );
      }

      return (
        <div className="col gap-8" style={{ padding: 12, borderTop: "1px solid var(--line)", background: "#fff" }}>
          {pStatus === "REJECTED" && (
            <p className="tiny" style={{ color: "var(--red-600)", textAlign: "center", margin: 0 }}>
              {t("payment_claim_rejected").replace("{name}", otherName)}
            </p>
          )}
          {/* Pay the responder over UPI (QR from their saved UPI ID), then
              claim it — the responder must confirm they actually received it
              before the deal advances. Cash is confirmed instantly (physical
              handover needs no remote verification), same as appointments. */}
          <button
            className="btn btn-outline btn-block"
            onClick={() => setPayOpen(true)}
          >
            <QrCode size={16} /> {t("pay_via_upi_amount").replace("{amount}", String(agreement!.agreedPrice))}
          </button>
          <div className="row gap-8">
            <button
              className="btn btn-primary grow"
              disabled={busy}
              onClick={() => run(
                () => requestService.claimAgreementPayment(agreement!.id, "UPI", agreement!.agreedPrice),
                "Payment claim sent — waiting for confirmation"
              )}
            >
              <Wallet size={16} /> {t("paid_via_upi")}
            </button>
            <button
              className="btn btn-green grow"
              disabled={busy}
              onClick={() => run(
                () => requestService.claimAgreementPayment(agreement!.id, "CASH", agreement!.agreedPrice),
                "Cash payment confirmed ✓"
              )}
            >
              {t("paid_in_cash")}
            </button>
          </div>
          <p className="tiny muted" style={{ textAlign: "center" }}>
            {t("upi_cash_confirmation_note").replace("{name}", otherName)}
          </p>
        </div>
      );
    }

    // DEPOSIT_PAID = payment settled (cash confirmed instantly, or UPI
    // confirmed by the responder) — only now can work actually start.
    if (status === "DEPOSIT_PAID") {
      if (!isRequester) {
        return (
          <div style={{ padding: 12, borderTop: "1px solid var(--line)", background: "#fff" }}>
            <button
              className="btn btn-green btn-block"
              disabled={busy}
              onClick={() => run(() => requestService.startWork(agreement!.id), "Work started ✓")}
            >
              {t("mark_work_started")}
            </button>
          </div>
        );
      }
      return (
        <div style={{ padding: 12, borderTop: "1px solid var(--line)", background: "#fff" }}>
          <button className="btn btn-outline btn-block" disabled>
            {t("waiting_other_start").replace("{name}", otherName)}
          </button>
        </div>
      );
    }

    if (status === "IN_PROGRESS") {
      if (!isRequester) {
        return (
          <div style={{ padding: 12, borderTop: "1px solid var(--line)", background: "#fff" }}>
            <button
              className="btn btn-green btn-block"
              disabled={busy}
              onClick={() => run(() => requestService.submitForReview(agreement!.id), "Sent for review ✓")}
            >
              {t("submit_for_review")}
            </button>
          </div>
        );
      }
      return (
        <div style={{ padding: 12, borderTop: "1px solid var(--line)", background: "#fff" }}>
          <button className="btn btn-outline btn-block" disabled>
            {t("waiting_other_finish").replace("{name}", otherName)}
          </button>
        </div>
      );
    }

    if (status === "REVIEW") {
      if (isRequester) {
        if (disputeMode) {
          return (
            <div className="col gap-8" style={{ padding: 12, borderTop: "1px solid var(--line)", background: "#fff" }}>
              <textarea
                className="input"
                placeholder={t("describe_issue")}
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                style={{ minHeight: 64, fontSize: 14 }}
              />
              <div className="row gap-8">
                <button className="btn btn-outline grow" onClick={() => setDisputeMode(false)}>
                  {t("cancel")}
                </button>
                <button
                  className="btn grow"
                  style={{ background: "var(--orange-500)", color: "#fff" }}
                  disabled={busy || !disputeReason.trim()}
                  onClick={() => run(
                    () => requestService.dispute(agreement!.id, disputeReason.trim()),
                    "Dispute raised — we'll review shortly"
                  )}
                >
                  {t("submit_dispute")}
                </button>
              </div>
            </div>
          );
        }
        return (
          <div className="col gap-8" style={{ padding: 12, borderTop: "1px solid var(--line)", background: "#fff" }}>
            <button
              className="btn btn-green btn-block"
              disabled={busy}
              onClick={() => run(async () => {
                await requestService.completeAgreement(agreement!.id);
                nav(`/rate/${agreement!.id}`);
              })}
            >
              <CheckCircle2 size={18} /> {t("approve_complete")}
            </button>
            <button
              className="btn btn-outline btn-block"
              style={{ color: "var(--orange-500)", borderColor: "var(--orange-100)" }}
              onClick={() => setDisputeMode(true)}
            >
              <AlertTriangle size={16} /> {t("raise_dispute")}
            </button>
          </div>
        );
      }
      return (
        <div style={{ padding: 12, borderTop: "1px solid var(--line)", background: "#fff" }}>
          <button className="btn btn-outline btn-block" disabled>
            {t("waiting_other_approve").replace("{name}", otherName)}
          </button>
        </div>
      );
    }

    return null;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const actionAreaHeight = status === "CANCELLED" ? 150 : (status === "REVIEW" && isRequester ? 140 : 72);

  return (
    <div className="screen">
      <AppBar title={t("agreement")} subtitle={agreement.requestTitle} />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: actionAreaHeight + 16 }}>

        {/* Progress bar */}
        <ProgressBar status={status} />

        {/* Expiry Warning Banner */}
        {status === "PENDING" && timeLeft !== null && (
          <div className="card row gap-10" style={{ padding: 12, background: "var(--amber-50)", border: "1px solid var(--amber-100)" }}>
            <Clock size={20} color="var(--amber-700)" style={{ flexShrink: 0 }} />
            <div className="grow">
              <div className="tiny semi" style={{ color: "var(--amber-700)" }}>
                {t("confirmation_window")}: {formatTimeLeft(timeLeft)}
              </div>
              <div className="tiny muted">
                {t("confirmation_window_desc")}
              </div>
            </div>
          </div>
        )}

        {/* Timer row */}
        {agreement.createdAt && (
          <div className="row gap-8 tiny muted" style={{ paddingLeft: 2 }}>
            <Clock size={13} style={{ flexShrink: 0 }} />
            <span>Active for <span className="semi">{elapsedSince(agreement.createdAt)}</span></span>
          </div>
        )}

        {/* Parties & price */}
        <div className="card">
          <button
            className="row gap-12"
            style={{ width: "100%", textAlign: "left" }}
            onClick={() => nav(`/u/${isRequester ? agreement.responderUserId : agreement.requesterUserId}`)}
          >
            <SafeImg src={agreement.responderAvatar} variant="avatar" className="avatar" style={{ width: 50, height: 50 }} />
            <div className="grow">
              <div className="semi">{isRequester ? agreement.responderName : agreement.requesterName}</div>
              <span className="tiny muted">{isRequester ? t("responder") : t("requester")}</span>
            </div>
            <div className="col" style={{ alignItems: "flex-end", gap: 4 }}>
              <div className="col" style={{ alignItems: "flex-end" }}>
                <span className="tiny muted">{t("agreed_price")}</span>
                <span className="bold" style={{ fontSize: 20, color: "var(--green-500)" }}>{inr(agreement.agreedPrice)}</span>
              </div>
              <span className="row gap-4 tiny" style={{ color: "var(--brand-600)" }}>
                {t("view_profile")} <ExternalLink size={11} />
              </span>
            </div>
          </button>
        </div>

        {/* Provider: live status strip */}
        {!isRequester && status === "IN_PROGRESS" && (
          <div className="card">
            <div className="tiny semi muted" style={{ marginBottom: 10 }}>{t("my_status")}</div>
            <div className="row gap-8" style={{ flexWrap: "wrap" }}>
              {LIVE_STEPS.map((s) => {
                const isActive = agreement.liveStatus === s.key;
                return (
                  <button key={s.key} onClick={() => void handleLiveStep(s.key)}
                    style={{ flex: "1 1 40%", padding: "8px 10px", borderRadius: 10, border: isActive ? "none" : "1px solid var(--line)", background: isActive ? "var(--brand-600)" : "#fff", color: isActive ? "#fff" : "var(--ink-700)", fontWeight: isActive ? 700 : 400, fontSize: 13, cursor: "pointer" }}>
                    {s.emoji} {t(s.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Requester: see provider's live status */}
        {isRequester && agreement.liveStatus && agreement.liveStatus !== "CONFIRMED" && (
          <div className="card row gap-10" style={{ padding: 12, background: "var(--green-100)", border: "1px solid var(--green-500)" }}>
            <span style={{ fontSize: 20 }}>{LIVE_STEPS.find((s) => s.key === agreement.liveStatus)?.emoji ?? ""}</span>
            <div className="grow">
              <div className="tiny semi" style={{ color: "var(--green-600)" }}>
                {t(LIVE_STEPS.find((s) => s.key === agreement.liveStatus)?.labelKey ?? "") || agreement.liveStatus}
              </div>
              <div className="tiny muted">{t("provider_on_move")}</div>
            </div>
          </div>
        )}

        {/* Requester: share tracking link */}
        {isRequester && (agreement.liveStatus === "ON_THE_WAY" || agreement.liveStatus === "ARRIVED") && (
          <button className="btn btn-outline btn-block btn-sm row center gap-8"
            onClick={async () => {
              let token = agreement.trackingToken;
              if (!token) token = await requestService.generateTrackingToken(agreement!.id);
              const link = `${window.location.origin}/track/${token}`;
              try { await navigator.clipboard.writeText(link); } catch { /* ignore */ }
              showToast("Tracking link copied — share via WhatsApp");
            }}>
            <Share2 size={15} /> {t("share_live_location")}
          </button>
        )}

        {/* Process guide */}
        <ProcessGuide status={status} isRequester={isRequester} />

        {/* Terms */}
        <div className="card">
          <div className="semi small" style={{ marginBottom: 8 }}>{t("terms_and_scope")}</div>
          <p className="small" style={{ lineHeight: 1.55, color: "var(--ink-700)" }}>{agreement.terms}</p>
          {(agreement.requestArea || (isNew && state?.request?.area)) && (
            <>
              <div className="divider" />
              <div className="row gap-10 small">
                <MapPin size={16} color="var(--blue-500)" style={{ flexShrink: 0 }} />
                <div>
                  <span className="tiny muted">{t("location")}</span>
                  <div className="semi small">{agreement.requestArea || state?.request?.area}</div>
                </div>
              </div>
            </>
          )}
          {agreement.scheduledFor && (
            <>
              <div className="divider" />
              <div className="row gap-10 small">
                <Calendar size={16} color="var(--brand-700)" />
                <span className="semi">{agreement.scheduledFor}</span>
              </div>
            </>
          )}
          <div className="divider" />
          <div className="row gap-10 small">
            <Wallet size={16} color="var(--orange-500)" />
            <span>{t("payment")}: <span className="semi">{agreement.paymentMode === "ONLINE" ? t("online_upi") : t("offline_cash")}</span></span>
          </div>
          {payment?.escrowStatus && (
            <>
              <div className="divider" />
              <div className="row gap-10 small">
                <span
                  className={`badge ${payment.escrowStatus === "HELD" ? "badge-amber" : payment.escrowStatus === "RELEASED" ? "badge-green" : "badge-gray"}`}
                >
                  {payment.escrowStatus === "HELD" ? t("payment_held_escrow") : payment.escrowStatus === "RELEASED" ? t("payment_released") : payment.escrowStatus}
                </span>
                <span className="tiny muted">
                  {payment.escrowStatus === "HELD"
                    ? `${inr(payment.amount)} ${t("escrow_held_desc")}`
                    : payment.escrowStatus === "RELEASED"
                    ? `${inr(payment.amount)} ${t("escrow_released_desc")}`
                    : ""}
                </span>
              </div>
            </>
          )}
        </div>

        {agreement.paymentMode !== "ONLINE" && (
          <div className="card row gap-10" style={{ padding: 12, background: "var(--orange-50)", border: "1px dashed var(--orange-100)" }}>
            <Info size={20} color="var(--orange-500)" style={{ flexShrink: 0 }} />
            <span className="tiny" style={{ color: "var(--orange-500)", lineHeight: 1.4 }}>
              {t("pay_in_person_note")}
            </span>
          </div>
        )}

        {/* Deal payment — the real, working claim→confirm cycle over UPI
            deeplink (see PaymentStatusCard / the UPI sheets). */}
        <PaymentStatusCard
          paymentStatus={agreement.paymentStatus}
          paymentMethod={agreement.paymentMethod}
          paymentAmount={agreement.paymentAmount}
          paymentReference={agreement.paymentReference}
          claimantName={agreement.requesterName}
          viewerIsPayer={isRequester}
          busy={busy}
          onConfirm={() => run(() => requestService.confirmAgreementPayment(agreement!.id), "Payment confirmed ✓")}
          onReject={() => run(() => requestService.rejectAgreementPaymentClaim(agreement!.id), "Payment claim rejected — requester notified")}
        />

        {/* Confirmations (shown only while PENDING) */}
        {status === "PENDING" && (
          <div className="card">
            <div className="semi small" style={{ marginBottom: 10 }}>{t("confirmations")}</div>
            <ConfirmRow label={`${t("you_role")} (${isRequester ? t("requester") : t("responder")})`} done={myConfirmed} />
            <ConfirmRow label={otherName} done={otherConfirmed} last />
          </div>
        )}

        <div className="row gap-8 tiny muted">
          <ShieldCheck size={16} color="var(--green-500)" style={{ flexShrink: 0 }} />
          <span>{t("exact_location_share_note")}</span>
        </div>

      </div>

      {/* Bottom action bar */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}>
        <ActionArea />
      </div>

      {payOpen && agreement && (
        <DealUpiSheet
          payeeUserId={agreement.responderUserId}
          payeeName={agreement.responderName}
          amount={agreement.agreedPrice}
          onClose={() => setPayOpen(false)}
        />
      )}
    </div>
  );
}

function ConfirmRow({ label, done, last }: { label: string; done: boolean; last?: boolean }) {
  return (
    <div className="row gap-10" style={{ padding: "8px 0", borderBottom: last ? "none" : "1px solid var(--line)" }}>
      {done ? <CheckCircle2 size={20} color="var(--green-500)" /> : <Circle size={20} color="var(--ink-300)" />}
      <span className="small semi grow">{label}</span>
      <span className="tiny semi" style={{ color: done ? "var(--green-500)" : "var(--ink-400)" }}>
        {done ? "Confirmed" : "Pending"}
      </span>
    </div>
  );
}
