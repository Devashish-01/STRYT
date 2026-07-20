import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AppBar, SafeImg, inr } from "@/components/common";
import { providerService, appointmentService, uploadService } from "@/services";
import { ownerVisibleCustomerName } from "@/services/engagement/appointmentService";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { Skeleton } from "@/components/states";
import type { AppointmentRecord } from "@/types";
import { PaymentStatusCard } from "@/components/PaymentStatusCard";
import ProviderManageNav from "./ProviderManageNav";
import { Wallet, Briefcase, Star, QrCode, Image as ImageIcon, X, Calendar } from "@/components/Icons";
import { useApp } from "@/store";

const WEEK_MS = 7 * 86400 * 1000;

// The provider's money home — what you earned, what's owed, confirm payment
// claims, and set up how you get paid (UPI/QR/timing, relocated from Settings).
export default function ProviderMoney() {
  const { id = "" } = useParams();
  const { showToast } = useApp();

  const { data: p } = useQuery(() => providerService.get(id), [id], `provider:${id}`);
  const { data: analytics, loading: analyticsLoading } = useQueryWithRealtime(
    () => providerService.analytics(id),
    "settlements",
    [id]
  );
  const { data: ledger } = useQueryWithRealtime(
    () => providerService.earningsLedger(id),
    "settlements",
    [id]
  );
  const { data: aptsData, refetch: refetchApts } = useQueryWithRealtime<AppointmentRecord[]>(
    () => appointmentService.listForTarget(id),
    "appointments",
    [id],
    `target_id=eq.${id}`
  );

  // Payment-setup form state (seeded from the provider record).
  const [upiId, setUpiId] = useState("");
  const [savingUpi, setSavingUpi] = useState(false);
  const [customQrUrl, setCustomQrUrl] = useState("");
  const [uploadingQr, setUploadingQr] = useState(false);
  const [paymentTiming, setPaymentTiming] = useState<"AT_BOOKING" | "AT_APPOINTMENT">("AT_APPOINTMENT");
  const [savingTiming, setSavingTiming] = useState(false);
  const [depositPercent, setDepositPercent] = useState("0");
  const [savingDeposit, setSavingDeposit] = useState(false);
  const [processingPayment, setProcessingPayment] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setCustomQrUrl(localStorage.getItem("stryt_upi_qr_" + id) || "");
  }, [id]);
  useEffect(() => {
    if (!p) return;
    setUpiId(p.upiId ?? "");
    setPaymentTiming(p.paymentTiming === "AT_BOOKING" ? "AT_BOOKING" : "AT_APPOINTMENT");
    setDepositPercent(String((p as any).depositPercent ?? 0));
  }, [p]);

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Money" />
      </div>
    );
  }

  const appointments = aptsData ?? [];
  const claimsToConfirm = appointments.filter((a) => a.paymentStatus === "PENDING_CONFIRM");
  const awaitingPayment = appointments.filter(
    (a) => (a.status === "ACCEPTED" || a.status === "COMPLETED") &&
      (a.paymentStatus ?? "UNPAID") === "UNPAID" &&
      (a.packagePrice ?? 0) > 0
  );
  const thisWeek = (ledger ?? [])
    .filter((e) => e.createdAtISO && Date.now() - new Date(e.createdAtISO).getTime() <= WEEK_MS)
    .reduce((sum, e) => sum + e.amount + e.tip, 0);

  async function handlePaymentAction(apt: AppointmentRecord, action: "CONFIRM" | "REJECT") {
    setProcessingPayment(apt.id);
    try {
      if (action === "CONFIRM") {
        await appointmentService.confirmPayment(apt.id);
        showToast("Payment confirmed ✓");
      } else {
        await appointmentService.rejectPaymentClaim(apt.id);
        showToast("Payment claim rejected — customer can resubmit.");
      }
      refetchApts();
    } catch (e: any) {
      console.error("Payment action failed:", e);
      const errorMsg = e?.message || "Couldn't update payment status. Try again.";
      showToast(errorMsg);
    } finally {
      setProcessingPayment(null);
    }
  }

  async function saveUpi() {
    setSavingUpi(true);
    try {
      await providerService.update(id, { upiId: upiId.trim() || null } as any);
      showToast("UPI ID saved");
    } catch {
      showToast("Couldn't save UPI ID");
    } finally {
      setSavingUpi(false);
    }
  }

  async function handleQrUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingQr(true);
    try {
      const url = await uploadService.upload(file, "verification");
      localStorage.setItem("stryt_upi_qr_" + id, url);
      setCustomQrUrl(url);
      showToast("Custom QR code uploaded!");
    } catch {
      showToast("Failed to upload QR code.");
    } finally {
      setUploadingQr(false);
      e.target.value = "";
    }
  }

  function clearCustomQr() {
    localStorage.removeItem("stryt_upi_qr_" + id);
    setCustomQrUrl("");
    showToast("Reverted to generated UPI QR");
  }

  async function savePaymentTiming(v: "AT_BOOKING" | "AT_APPOINTMENT") {
    const prev = paymentTiming;
    setPaymentTiming(v);
    setSavingTiming(true);
    try {
      await providerService.update(id, { paymentTiming: v } as any);
    } catch {
      setPaymentTiming(prev);
      showToast("Couldn't save — try again");
    } finally {
      setSavingTiming(false);
    }
  }

  async function saveDepositPercent() {
    const n = Math.max(0, Math.min(100, Math.round(Number(depositPercent) || 0)));
    setDepositPercent(String(n));
    setSavingDeposit(true);
    try {
      await providerService.update(id, { depositPercent: n } as any);
      showToast("Deposit saved");
    } catch {
      showToast("Couldn't save — try again");
    } finally {
      setSavingDeposit(false);
    }
  }

  return (
    <div className="screen with-nav">
      <AppBar title="Money" subtitle="Earnings & payments" />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 24 }}>

        {/* Earnings summary */}
        {analyticsLoading ? (
          <Skeleton h={92} mb={0} />
        ) : (
          <div className="card row" style={{ padding: 16, justifyContent: "space-around" }}>
            <div className="col center" style={{ gap: 4 }}>
              <Wallet size={20} color="var(--orange-500)" />
              <span className="bold h2" style={{ color: "var(--ink-900)" }}>{inr(analytics?.earnings ?? 0)}</span>
              <span className="tiny muted">Earned (offline)</span>
            </div>
            <div style={{ width: 1, height: 36, background: "var(--line)" }} />
            <div className="col center" style={{ gap: 4 }}>
              <Calendar size={20} color="var(--green-500)" />
              <span className="bold h2" style={{ color: "var(--ink-900)" }}>{inr(thisWeek)}</span>
              <span className="tiny muted">This week</span>
            </div>
            <div style={{ width: 1, height: 36, background: "var(--line)" }} />
            <div className="col center" style={{ gap: 4 }}>
              <Briefcase size={20} color="var(--brand-600)" />
              <span className="bold h2" style={{ color: "var(--ink-900)" }}>{analytics?.jobsDone ?? 0}</span>
              <span className="tiny muted">Jobs done</span>
            </div>
          </div>
        )}

        {/* Payment claims awaiting your confirmation */}
        {claimsToConfirm.length > 0 && (
          <div>
            <div className="small semi muted" style={{ marginBottom: 8 }}>Confirm payments ({claimsToConfirm.length})</div>
            <div className="col gap-10">
              {claimsToConfirm.map((apt) => (
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
                    busy={processingPayment === apt.id}
                    onConfirm={() => handlePaymentAction(apt, "CONFIRM")}
                    onReject={() => handlePaymentAction(apt, "REJECT")}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Unpaid / awaiting */}
        {awaitingPayment.length > 0 && (
          <div>
            <div className="small semi muted" style={{ marginBottom: 8 }}>Awaiting payment ({awaitingPayment.length})</div>
            <div className="col gap-8">
              {awaitingPayment.map((apt) => (
                <div key={apt.id} className="card row between center-v" style={{ padding: 12 }}>
                  <div className="row gap-10 center-v">
                    <SafeImg src={apt.customerAvatar} variant="avatar" style={{ width: 34, height: 34 }} />
                    <div>
                      <div className="semi small">{ownerVisibleCustomerName(apt)}</div>
                      <div className="tiny muted">{apt.dateLabel}{apt.packageName ? ` · ${apt.packageName}` : ""}</div>
                    </div>
                  </div>
                  <span className="badge badge-amber" style={{ fontSize: 11 }}>{inr(apt.packagePrice ?? 0)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payment setup (relocated from Settings) */}
        <div>
          <div className="small semi muted row gap-6" style={{ marginBottom: 8 }}><QrCode size={14} /> How you get paid</div>
          <div className="card col gap-12" style={{ padding: 14 }}>
            {/* UPI ID */}
            <div>
              <div className="tiny semi" style={{ marginBottom: 4 }}>UPI ID (VPA)</div>
              <div className="tiny muted" style={{ marginBottom: 8, lineHeight: 1.5 }}>Customers pay you via UPI. Enter your handle (e.g. yourname@okaxis) — a QR is generated automatically.</div>
              <div className="row gap-8">
                <input className="input grow" placeholder="e.g. yourname@okaxis" value={upiId} onChange={(e) => setUpiId(e.target.value)} style={{ fontSize: 14 }} />
                <button className="btn btn-outline btn-sm" disabled={savingUpi} onClick={saveUpi}>{savingUpi ? "…" : "Save"}</button>
              </div>
            </div>

            <div className="divider" style={{ margin: "2px 0" }} />

            {/* Custom QR upload */}
            <div>
              <div className="tiny semi" style={{ marginBottom: 4 }}>Custom Payment QR (optional)</div>
              <div className="tiny muted" style={{ marginBottom: 10, lineHeight: 1.5 }}>Upload your own QR image (bank app screenshot, GPay/PhonePe QR, etc.). This overrides the auto-generated UPI QR on your share card.</div>
              {customQrUrl ? (
                <div className="col gap-8" style={{ alignItems: "center" }}>
                  <img src={customQrUrl} alt="Custom Payment QR" style={{ width: 140, height: 140, objectFit: "contain", borderRadius: 8, border: "1px solid var(--line)", background: "#fff", padding: 6 }} />
                  <div className="row gap-8">
                    <label className="btn btn-outline btn-sm row gap-6" style={{ cursor: "pointer" }}>
                      <ImageIcon size={13} /> Change
                      <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleQrUpload} />
                    </label>
                    <button className="btn btn-outline btn-sm row gap-6" onClick={clearCustomQr}><X size={13} /> Remove</button>
                  </div>
                </div>
              ) : (
                <label className="btn btn-outline btn-sm row gap-6" style={{ cursor: "pointer", alignSelf: "flex-start" }}>
                  {uploadingQr ? "Uploading…" : <><ImageIcon size={13} /> Upload QR Image</>}
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleQrUpload} disabled={uploadingQr} />
                </label>
              )}
            </div>

            <div className="divider" style={{ margin: "2px 0" }} />

            {/* Appointment payment timing */}
            <div>
              <div className="tiny semi" style={{ marginBottom: 4 }}>When to collect appointment payment</div>
              <div className="tiny muted" style={{ marginBottom: 10, lineHeight: 1.5 }}>
                "At booking" requires the customer to pay before you can accept their appointment. "At appointment" (default) lets you accept first — payment happens around the service, whenever suits you.
              </div>
              <div className="row gap-8">
                {(["AT_APPOINTMENT", "AT_BOOKING"] as const).map((t) => (
                  <button
                    key={t}
                    className="grow"
                    disabled={savingTiming}
                    style={{
                      padding: "10px 0",
                      borderRadius: 12,
                      border: paymentTiming === t ? "2px solid var(--green-500)" : "1.5px solid var(--ink-200)",
                      background: paymentTiming === t ? "var(--green-100)" : "#fff",
                      fontWeight: 700,
                      fontSize: 13,
                      color: paymentTiming === t ? "var(--green-600)" : "var(--ink-500)",
                    }}
                    onClick={() => savePaymentTiming(t)}
                  >
                    {t === "AT_BOOKING" ? "At booking" : "At appointment"}
                  </button>
                ))}
              </div>

              {/* Deposit % — only meaningful when payment is collected upfront. */}
              {paymentTiming === "AT_BOOKING" && (
                <div style={{ marginTop: 12 }}>
                  <div className="tiny semi" style={{ marginBottom: 4 }}>Upfront deposit (%)</div>
                  <div className="tiny muted" style={{ marginBottom: 8, lineHeight: 1.5 }}>
                    Upfront deposit (%) — rest collected at the appointment. 0 = full amount up front.
                  </div>
                  <div className="row gap-8">
                    <input
                      className="input grow"
                      inputMode="numeric"
                      placeholder="0"
                      value={depositPercent}
                      onChange={(e) => setDepositPercent(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                      style={{ fontSize: 14 }}
                    />
                    <button className="btn btn-outline btn-sm" disabled={savingDeposit} onClick={saveDepositPercent}>
                      {savingDeposit ? "…" : "Save"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Earnings ledger */}
        <div>
          <div className="small semi muted row gap-6" style={{ marginBottom: 8 }}><Star size={14} /> Earnings history</div>
          {(ledger ?? []).length === 0 ? (
            <div className="card col center" style={{ padding: 24, gap: 6 }}>
              <span style={{ fontSize: 28 }}>🧾</span>
              <span className="tiny muted">Recorded settlements will appear here.</span>
            </div>
          ) : (
            <div className="card" style={{ overflow: "hidden", padding: 0 }}>
              {(ledger ?? []).map((e, i) => (
                <div key={e.id} className="row between center-v" style={{ padding: "12px 14px", borderTop: i > 0 ? "1px solid var(--line)" : "none" }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="semi small">{inr(e.amount + e.tip)}{e.tip > 0 && <span className="tiny muted" style={{ marginLeft: 6 }}>incl. {inr(e.tip)} tip</span>}</div>
                    <div className="tiny muted ellipsis">{e.note || e.mode} · {e.date}</div>
                  </div>
                  <span className="badge badge-gray" style={{ fontSize: 10 }}>{e.mode}</span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
      <ProviderManageNav pid={id} />
    </div>
  );
}
