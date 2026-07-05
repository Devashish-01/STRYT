import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { AppBar, inr, EmptyState, SafeImg } from "@/components/common";
import { CheckCircle2, Circle, Wallet, Calendar, ShieldCheck, Info, AlertTriangle, MapPin, Clock, ExternalLink, ShieldAlert, Share2, XCircle, QrCode } from "@/components/Icons";
import { requestService } from "@/services";
import DealUpiSheet from "@/components/DealUpiSheet";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { Skeleton } from "@/components/states";
import { useApp } from "@/store";
import type { Agreement, AgreementStatus, Proposal, RequestPost, JobLiveStatus } from "@/types";
import { nativeGeolocation } from "@/lib/nativeGeolocation";

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

const STEPS: { label: string; statuses: AgreementStatus[] }[] = [
  { label: "Confirmed",   statuses: ["PENDING"] },
  { label: "Deposit",     statuses: ["DEPOSIT_PAID", "ACTIVE"] },
  { label: "In Progress", statuses: ["IN_PROGRESS"] },
  { label: "Review",      statuses: ["REVIEW"] },
  { label: "Done",        statuses: ["COMPLETED"] },
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
          const done = i < active;
          const current = i === active;
          return (
            <div key={s.label} className="col center" style={{ gap: 6, zIndex: 2, flex: 1 }}>
              <div style={{
                width: 22, height: 22, borderRadius: "50%",
                background: done ? "var(--brand-600)" : current ? "#fff" : "var(--ink-100)",
                border: current ? "2.5px solid var(--brand-600)" : done ? "none" : "2px solid var(--ink-200)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {done && <CheckCircle2 size={14} color="#fff" strokeWidth={3} />}
                {current && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--brand-600)" }} />}
              </div>
              <span style={{ fontSize: 10, color: current ? "var(--brand-700)" : done ? "var(--ink-600)" : "var(--ink-400)", fontWeight: current || done ? 600 : 400, textAlign: "center", lineHeight: 1.2 }}>
                {s.label}
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
  { status: ["PENDING"],                requesterAction: "Confirm the agreement",      responderAction: "Confirm the agreement" },
  { status: ["ACTIVE", "DEPOSIT_PAID"], requesterAction: "Wait for provider to start", responderAction: 'Tap "Mark work started"' },
  { status: ["IN_PROGRESS"],            requesterAction: "Wait for work to finish",    responderAction: 'Tap "Submit for review"' },
  { status: ["REVIEW"],                 requesterAction: "Approve or raise a dispute", responderAction: "Await requester approval" },
  { status: ["COMPLETED"],              requesterAction: "Rate the provider",          responderAction: "Job complete!" },
];

function ProcessGuide({ status, isRequester }: { status: AgreementStatus; isRequester: boolean }) {
  if (status === "CANCELLED" || status === "DISPUTED") return null;
  const step = GUIDE.find((g) => (g.status as string[]).includes(status));
  if (!step) return null;
  const myAction    = isRequester ? step.requesterAction : step.responderAction;
  const otherAction = isRequester ? step.responderAction : step.requesterAction;
  return (
    <div className="card" style={{ background: "var(--brand-50)", border: "1px solid var(--brand-200)" }}>
      <div className="semi small" style={{ color: "var(--brand-700)", marginBottom: 10 }}>What happens next</div>
      <div className="row gap-10" style={{ marginBottom: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--brand-600)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 13, color: "#fff", fontWeight: 700 }}>You</span>
        </div>
        <span className="small semi">{myAction}</span>
      </div>
      <div className="row gap-10">
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--ink-200)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: "var(--ink-600)", fontWeight: 600 }}>Them</span>
        </div>
        <span className="small muted">{otherAction}</span>
      </div>
    </div>
  );
}

const LIVE_STEPS: { key: JobLiveStatus; label: string; emoji: string }[] = [
  { key: "LEAVING",    label: "Leaving now", emoji: "🚶" },
  { key: "ON_THE_WAY", label: "On the way",  emoji: "🛵" },
  { key: "ARRIVED",    label: "Arrived",     emoji: "📍" },
  { key: "WORKING",    label: "Working",     emoji: "🔧" },
];

// ── Main screen ──────────────────────────────────────────────────────────────

export default function AgreementScreen() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { state } = useLocation() as { state?: { request?: RequestPost; proposal?: Proposal } };
  const { user, showToast } = useApp();

  const isNew = id === "new" && !!state?.request && !!state?.proposal;
  const { data: fetched, loading, refetch } = useQueryWithRealtime(
    () => (isNew ? Promise.resolve(undefined) : requestService.getAgreement(id)),
    "agreements",
    [id, isNew],
    isNew ? undefined : `id=eq.${id}`
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

  const [sosCountdown, setSosCountdown] = useState<number | null>(null);
  const [sosTriggered, setSosTriggered] = useState(false);
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

  function startSOS() {
    setSosCountdown(5);
    const t = setInterval(() => {
      setSosCountdown((n) => {
        if (n === null || n <= 1) { clearInterval(t); if (n === 1) void fireSOS(); return null; }
        return n - 1;
      });
    }, 1000);
  }

  function cancelSOS() { setSosCountdown(null); }

  async function fireSOS() {
    setSosTriggered(true);
    const pos = await new Promise<GeolocationPosition>((res, rej) =>
      nativeGeolocation.getCurrentPosition(res, rej, { timeout: 5000 })
    ).catch(() => null);
    try {
      await requestService.sosAlert(agreement!.id, pos?.coords.latitude ?? 0, pos?.coords.longitude ?? 0);
      showToast("SOS sent — emergency contact and STRYT team alerted");
    } catch {
      showToast("SOS recorded. Call your contact directly if SMS failed.");
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
        <div className="col center" style={{ padding: 16, gap: 6, background: "#e8f7ee", borderTop: "1px solid #bbf7d0" }}>
          <CheckCircle2 size={28} color="var(--green-500)" />
          <span className="semi" style={{ color: "#15803d" }}>Job complete</span>
        </div>
      );
    }

    if (status === "CANCELLED") {
      return (
        <div className="col center" style={{ padding: 16, gap: 12, background: "#fef2f2", borderTop: "1px solid #fee2e2", textAlign: "center" }}>
          <XCircle size={28} color="var(--red-600)" />
          <div>
            <span className="semi" style={{ color: "#991b1b" }}>Agreement Cancelled</span>
            <p className="tiny muted" style={{ marginTop: 4, maxWidth: 320, lineHeight: 1.4 }}>
              This work order has been cancelled. Since the 10-minute confirmation window has passed, you can accept a quote again.
            </p>
          </div>
          <button
            className="btn btn-outline btn-sm btn-block"
            onClick={() => nav(`/request/${agreement!.requestId}`)}
          >
            View Quotes Again
          </button>
        </div>
      );
    }

    if (status === "DISPUTED") {
      return (
        <div className="col center" style={{ padding: 16, gap: 6, background: "#fff7ed", borderTop: "1px solid #fdba74" }}>
          <AlertTriangle size={26} color="var(--orange-500)" />
          <span className="semi" style={{ color: "#c2410c" }}>Under dispute — our team will review</span>
        </div>
      );
    }

    if (status === "PENDING") {
      if (myConfirmed) {
        return (
          <div style={{ padding: 12, borderTop: "1px solid var(--line)", background: "#fff" }}>
            <button className="btn btn-outline btn-block" disabled>
              Waiting for {otherName} to confirm…
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
            Confirm & proceed
          </button>
        </div>
      );
    }

    if (status === "DEPOSIT_PAID" || status === "ACTIVE") {
      if (!isRequester) {
        return (
          <div style={{ padding: 12, borderTop: "1px solid var(--line)", background: "#fff" }}>
            <button
              className="btn btn-green btn-block"
              disabled={busy}
              onClick={() => run(() => requestService.startWork(agreement!.id), "Work started ✓")}
            >
              Mark work started
            </button>
          </div>
        );
      }
      if (status === "ACTIVE") {
        return (
          <div className="col gap-8" style={{ padding: 12, borderTop: "1px solid var(--line)", background: "#fff" }}>
            {/* Pay the responder over UPI (QR from their saved UPI ID), then
                confirm settlement. Cash-in-person also supported via the same
                confirm button. */}
            <button
              className="btn btn-outline btn-block"
              onClick={() => setPayOpen(true)}
            >
              <QrCode size={16} /> Pay ₹{agreement!.agreedPrice} via UPI
            </button>
            <button
              className="btn btn-primary btn-block"
              disabled={busy}
              onClick={() => run(() => requestService.markDepositPaid(agreement!.id), "Marked as paid ✓")}
            >
              <Wallet size={16} /> Mark paid (cash / UPI)
            </button>
            <p className="tiny muted" style={{ textAlign: "center" }}>
              Pay via UPI above or in person, then mark the deal paid so both sides have a record.
            </p>
          </div>
        );
      }
      return (
        <div style={{ padding: 12, borderTop: "1px solid var(--line)", background: "#fff" }}>
          <button className="btn btn-outline btn-block" disabled>
            Waiting for {otherName} to start work…
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
              Submit for review
            </button>
          </div>
        );
      }
      return (
        <div style={{ padding: 12, borderTop: "1px solid var(--line)", background: "#fff" }}>
          <button className="btn btn-outline btn-block" disabled>
            Waiting for {otherName} to finish work…
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
                placeholder="Describe the issue…"
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                style={{ minHeight: 64, fontSize: 14 }}
              />
              <div className="row gap-8">
                <button className="btn btn-outline grow" onClick={() => setDisputeMode(false)}>
                  Cancel
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
                  Submit dispute
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
              <CheckCircle2 size={18} /> Approve & complete
            </button>
            <button
              className="btn btn-outline btn-block"
              style={{ color: "var(--orange-500)", borderColor: "#fdba74" }}
              onClick={() => setDisputeMode(true)}
            >
              <AlertTriangle size={16} /> Raise dispute
            </button>
          </div>
        );
      }
      return (
        <div style={{ padding: 12, borderTop: "1px solid var(--line)", background: "#fff" }}>
          <button className="btn btn-outline btn-block" disabled>
            Waiting for {otherName} to approve…
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
      <AppBar title="Agreement" subtitle={agreement.requestTitle} />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: actionAreaHeight + 16 }}>

        {/* Progress bar */}
        <ProgressBar status={status} />

        {/* Expiry Warning Banner */}
        {status === "PENDING" && timeLeft !== null && (
          <div className="card row gap-10" style={{ padding: 12, background: "#fffbeb", border: "1px solid #fef3c7" }}>
            <Clock size={20} color="#d97706" style={{ flexShrink: 0 }} />
            <div className="grow">
              <div className="tiny semi" style={{ color: "#b45309" }}>
                Confirmation Window: {formatTimeLeft(timeLeft)}
              </div>
              <div className="tiny muted">
                Both parties must confirm within 10 minutes, or this quote acceptance will expire.
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
              <span className="tiny muted">{isRequester ? "Provider / responder" : "Requester"}</span>
            </div>
            <div className="col" style={{ alignItems: "flex-end", gap: 4 }}>
              <div className="col" style={{ alignItems: "flex-end" }}>
                <span className="tiny muted">Agreed price</span>
                <span className="bold" style={{ fontSize: 20, color: "var(--green-500)" }}>{inr(agreement.agreedPrice)}</span>
              </div>
              <span className="row gap-4 tiny" style={{ color: "var(--brand-600)" }}>
                View profile <ExternalLink size={11} />
              </span>
            </div>
          </button>
        </div>

        {/* Provider: live status strip */}
        {!isRequester && status === "IN_PROGRESS" && (
          <div className="card">
            <div className="tiny semi muted" style={{ marginBottom: 10 }}>My status</div>
            <div className="row gap-8" style={{ flexWrap: "wrap" }}>
              {LIVE_STEPS.map((s) => {
                const isActive = agreement.liveStatus === s.key;
                return (
                  <button key={s.key} onClick={() => void handleLiveStep(s.key)}
                    style={{ flex: "1 1 40%", padding: "8px 10px", borderRadius: 10, border: isActive ? "none" : "1px solid var(--line)", background: isActive ? "var(--brand-600)" : "#fff", color: isActive ? "#fff" : "var(--ink-700)", fontWeight: isActive ? 700 : 400, fontSize: 13, cursor: "pointer" }}>
                    {s.emoji} {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Requester: see provider's live status */}
        {isRequester && agreement.liveStatus && agreement.liveStatus !== "CONFIRMED" && (
          <div className="card row gap-10" style={{ padding: 12, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
            <span style={{ fontSize: 20 }}>{LIVE_STEPS.find((s) => s.key === agreement.liveStatus)?.emoji ?? ""}</span>
            <div className="grow">
              <div className="tiny semi" style={{ color: "#15803d" }}>{LIVE_STEPS.find((s) => s.key === agreement.liveStatus)?.label ?? agreement.liveStatus}</div>
              <div className="tiny muted">Provider is on the move</div>
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
            <Share2 size={15} /> Share live location with family
          </button>
        )}

        {/* Process guide */}
        <ProcessGuide status={status} isRequester={isRequester} />

        {/* Terms */}
        <div className="card">
          <div className="semi small" style={{ marginBottom: 8 }}>Terms & scope</div>
          <p className="small" style={{ lineHeight: 1.55, color: "var(--ink-700)" }}>{agreement.terms}</p>
          {(agreement.requestArea || (isNew && state?.request?.area)) && (
            <>
              <div className="divider" />
              <div className="row gap-10 small">
                <MapPin size={16} color="#3b82f6" style={{ flexShrink: 0 }} />
                <div>
                  <span className="tiny muted">Location</span>
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
            <span>Payment: <span className="semi">{agreement.paymentMode === "ONLINE" ? "Online (Razorpay)" : "Offline (in person)"}</span></span>
          </div>
        </div>

        {agreement.paymentMode !== "ONLINE" && (
          <div className="card row gap-10" style={{ padding: 12, background: "#fff7ed", border: "1px dashed #fdba74" }}>
            <Info size={20} color="var(--orange-500)" style={{ flexShrink: 0 }} />
            <span className="tiny" style={{ color: "#c2410c", lineHeight: 1.4 }}>
              Pay in person / via Razorpay when prompted. <span className="semi">STRYT secures online payments.</span>
            </span>
          </div>
        )}

        {/* Confirmations (shown only while PENDING) */}
        {status === "PENDING" && (
          <div className="card">
            <div className="semi small" style={{ marginBottom: 10 }}>Confirmations</div>
            <ConfirmRow label={`You (${isRequester ? "requester" : "responder"})`} done={myConfirmed} />
            <ConfirmRow label={otherName} done={otherConfirmed} last />
          </div>
        )}

        <div className="row gap-8 tiny muted">
          <ShieldCheck size={16} color="var(--green-500)" style={{ flexShrink: 0 }} />
          <span>Your exact location is shared only after both sides confirm.</span>
        </div>

        {status === "IN_PROGRESS" && !sosTriggered && (
          <div className="card" style={{ border: "1px solid #fecaca", background: "#fff5f5" }}>
            <div className="tiny semi" style={{ color: "#991b1b", marginBottom: 10 }}>Safety</div>
            {sosCountdown !== null ? (
              <div className="col center" style={{ gap: 10 }}>
                <div className="bold" style={{ fontSize: 32, color: "var(--red-600)" }}>{sosCountdown}</div>
                <div className="tiny muted">SOS fires in {sosCountdown}s</div>
                <button className="btn btn-outline btn-block btn-sm" onClick={cancelSOS}>Cancel</button>
              </div>
            ) : (
              <div className="row gap-10">
                <div className="grow tiny muted" style={{ lineHeight: 1.4 }}>Sends your location to your emergency contact immediately.</div>
                <button className="btn btn-sm" style={{ background: "var(--red-600)", color: "#fff", flexShrink: 0 }} onClick={startSOS}>SOS</button>
              </div>
            )}
          </div>
        )}
        {sosTriggered && (
          <div className="card row gap-10" style={{ padding: 12, background: "#fee2e2", border: "1px solid #fca5a5" }}>
            <ShieldAlert size={20} color="var(--red-600)" style={{ flexShrink: 0 }} />
            <span className="tiny semi" style={{ color: "#991b1b" }}>SOS sent — your emergency contact and STRYT have been alerted.</span>
          </div>
        )}
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
