import { useState } from "react";
import { X, Copy, CheckCircle2, Banknote, QrCode, AlertCircle } from "@/components/Icons";
import { QRCodeSVG } from "qrcode.react";
import { businessService } from "@/services";
import { useApp } from "@/store";
import { copyText } from "@/lib/clipboard";
import type { PaymentMethod } from "@/types";

// UPI deep-link per app. Android uses the universal `upi://` scheme (opens system
// chooser). iOS doesn't honour `upi://` reliably — each app registers its own URL
// scheme, so we show individual buttons there.
const UPI_APPS = [
  { name: "GPay", icon: "G", scheme: (s: string) => s.replace("upi://", "tez://upi/"), color: "#4285f4" },
  { name: "PhonePe", icon: "P", scheme: (s: string) => s.replace("upi://", "phonepe://"), color: "#5f259f" },
  { name: "Paytm", icon: "₱", scheme: (s: string) => s.replace("upi://", "paytmmp://"), color: "#00baf2" },
  { name: "BHIM", icon: "B", scheme: (s: string) => s.replace("upi://", "bhim://"), color: "#e87722" },
];

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

interface QueuePaymentSheetProps {
  tokenId: string;
  businessName: string;
  businessUpiId?: string | null;
  onPaid: () => void;
  onClose: () => void;
}

// Payment claim sheet for a live-queue token. Unlike appointments/agreements,
// a queue token has no catalog or proposal price at join time, so the amount
// is always entered freeform by the customer.
export function QueuePaymentSheet({ tokenId, businessName, businessUpiId, onPaid, onClose }: QueuePaymentSheetProps) {
  const { showToast } = useApp();

  const hasUpi = !!businessUpiId;
  const [method, setMethod] = useState<PaymentMethod>(hasUpi ? "UPI" : "CASH");
  const [amount, setAmount] = useState<string>("");
  const [reference, setReference] = useState("");
  const [claiming, setClaiming] = useState(false);

  const numAmount = parseFloat(amount) || null;
  const upiBase = hasUpi
    ? `upi://pay?pa=${encodeURIComponent(businessUpiId!)}&pn=${encodeURIComponent(businessName)}${numAmount ? `&am=${numAmount.toFixed(2)}` : ""}&cu=INR&tn=${encodeURIComponent("Queue service")}`
    : "";

  async function claim() {
    setClaiming(true);
    try {
      await businessService.claimQueuePayment(tokenId, method, numAmount, reference.trim() || null);
      showToast("Payment claim sent — waiting for business to confirm");
      onPaid();
      onClose();
    } catch (e: any) {
      showToast(e?.message ? `Couldn't record payment: ${e.message}` : "Couldn't record payment. Try again.");
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", animation: "fadeIn .2s" }}
      onClick={onClose}
    >
      <div
        style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: "20px 20px calc(20px + env(safe-area-inset-bottom, 0px))", maxHeight: "92vh", overflowY: "auto", animation: "slideUp .25s ease-out" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="row between center-v" style={{ marginBottom: 16 }}>
          <div>
            <div className="bold" style={{ fontSize: 18 }}>Pay for your visit</div>
            <div className="tiny muted" style={{ marginTop: 2 }}>{businessName}</div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Amount — always freeform, no catalog price on a queue token */}
        <div style={{ marginBottom: 16 }}>
          <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Amount (₹)</label>
          <input
            className="input"
            inputMode="decimal"
            placeholder="Enter amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          />
        </div>

        {/* Method selector */}
        {hasUpi && (
          <div className="row gap-10" style={{ marginBottom: 20 }}>
            {(["UPI", "CASH"] as PaymentMethod[]).map((m) => (
              <button
                key={m}
                className="grow"
                style={{
                  padding: "12px 0",
                  borderRadius: 14,
                  border: method === m ? `2px solid ${m === "UPI" ? "var(--brand-600)" : "var(--green-500)"}` : "1.5px solid var(--ink-200)",
                  background: method === m ? (m === "UPI" ? "var(--brand-50)" : "var(--green-100)") : "#fff",
                  fontWeight: 700,
                  color: method === m ? (m === "UPI" ? "var(--brand-700)" : "var(--green-600)") : "var(--ink-500)",
                  fontSize: 14,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
                onClick={() => setMethod(m)}
              >
                {m === "UPI" ? <QrCode size={15} /> : <Banknote size={15} />} {m}
              </button>
            ))}
          </div>
        )}

        {/* UPI flow */}
        {method === "UPI" && hasUpi && (
          <div className="col gap-14">
            <div className="card row gap-10 center-v" style={{ padding: 12, background: "var(--green-100)", border: "1px solid var(--green-500)" }}>
              <AlertCircle size={16} color="var(--green-600)" style={{ flexShrink: 0 }} />
              <div className="tiny" style={{ color: "var(--green-600)", lineHeight: 1.5 }}>
                After you pay, tap <strong>"I have paid"</strong>. The business will verify and confirm receipt. You'll see a ✓ once confirmed.
              </div>
            </div>

            <div className="col center gap-8">
              <div style={{ padding: 12, background: "#fff", borderRadius: 16, boxShadow: "var(--shadow-sm)", border: "1px solid var(--ink-100)" }}>
                <QRCodeSVG value={upiBase} size={180} />
              </div>
              <div className="tiny muted center" style={{ maxWidth: 200, lineHeight: 1.5 }}>Scan from another device to pay</div>
            </div>

            <div className="card row gap-10" style={{ padding: 12 }}>
              <div className="grow">
                <div className="tiny muted">UPI ID</div>
                <div className="semi small" style={{ marginTop: 2 }}>{businessUpiId}</div>
              </div>
              <button
                className="icon-btn"
                style={{ width: 36, height: 36 }}
                onClick={async () => { const ok = await copyText(businessUpiId!); showToast(ok ? "UPI ID copied" : "Couldn't copy"); }}
              ><Copy size={15} /></button>
            </div>

            {isIOS() ? (
              <div className="col gap-8">
                <div className="tiny semi muted" style={{ textAlign: "center" }}>Open in UPI app</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {UPI_APPS.map((app) => (
                    <a
                      key={app.name}
                      href={app.scheme(upiBase)}
                      className="btn row gap-8 center"
                      style={{ background: app.color, color: "#fff", fontWeight: 700, borderRadius: 12, textDecoration: "none", padding: "11px 0", fontSize: 13 }}
                    >
                      <span style={{ fontWeight: 900, fontSize: 15 }}>{app.icon}</span> {app.name}
                    </a>
                  ))}
                </div>
              </div>
            ) : (
              <a
                href={upiBase}
                className="btn btn-primary btn-block"
                style={{ textDecoration: "none", textAlign: "center", fontSize: 15, fontWeight: 700 }}
              >
                Open in UPI app →
              </a>
            )}

            <div>
              <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>UPI transaction ID (optional)</label>
              <input
                className="input"
                placeholder="e.g. 423187654321"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
              <div className="tiny muted" style={{ marginTop: 4 }}>Helps the business match your payment quickly.</div>
            </div>

            <button
              className="btn btn-green btn-block"
              style={{ height: 48, fontSize: 15, fontWeight: 700 }}
              disabled={claiming}
              onClick={claim}
            >
              <CheckCircle2 size={18} style={{ display: "inline", marginRight: 8 }} />{claiming ? "Submitting…" : "I have paid"}
            </button>
          </div>
        )}

        {/* Cash flow */}
        {method === "CASH" && (
          <div className="col gap-14">
            <div className="card col center" style={{ padding: 24, gap: 10, background: "var(--green-100)", border: "none" }}>
              <Banknote size={40} color="var(--green-500)" />
              <div className="semi" style={{ fontSize: 16 }}>Pay in cash</div>
              <div className="tiny muted center" style={{ maxWidth: 220, lineHeight: 1.6 }}>
                Hand over the cash, then tap below. The business confirms they received it before it counts as paid.
              </div>
            </div>
            <button
              className="btn btn-block"
              style={{ background: "var(--green-500)", color: "#fff", fontWeight: 700, height: 48, fontSize: 15 }}
              disabled={claiming}
              onClick={claim}
            >
              <CheckCircle2 size={18} style={{ display: "inline", marginRight: 8 }} />{claiming ? "Sending…" : "I've paid in cash"}
            </button>
          </div>
        )}

        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}
