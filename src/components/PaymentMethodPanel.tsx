import { useState } from "react";
import { Copy, CheckCircle2, Banknote, QrCode, AlertCircle } from "@/components/Icons";
import { QRCodeSVG } from "qrcode.react";
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

interface PaymentMethodPanelProps {
  businessUpiId?: string | null;
  businessName: string;
  /** Amount to encode in the UPI intent — null omits the `am` param (freeform pay). */
  amount: number | null;
  /** Short label used in the UPI transaction note (`tn` param), e.g. "Appointment". */
  txnNote: string;
  cashTitle?: string;
  cashBody?: string;
  claiming: boolean;
  onSubmit: (method: PaymentMethod, reference: string | null) => void;
}

/** Method-selector + UPI (QR/copy/deep-link/reference) + Cash claim flow,
 *  shared by PaymentSheet, QueuePaymentSheet, and WalkInPaySheet — the same
 *  ~130 lines used to be duplicated three times over. Amount display/editing
 *  stays with the caller (it differs: fixed package price vs freeform entry
 *  vs cart total), this panel only needs the resolved number for the intent. */
export function PaymentMethodPanel({
  businessUpiId, businessName, amount, txnNote,
  cashTitle = "Pay in cash", cashBody = "Hand over the cash, then tap below. The business confirms they received it before it counts as paid.",
  claiming, onSubmit,
}: PaymentMethodPanelProps) {
  const { showToast } = useApp();
  const hasUpi = !!businessUpiId;
  const [method, setMethod] = useState<PaymentMethod>(hasUpi ? "UPI" : "CASH");
  const [reference, setReference] = useState("");

  const upiBase = hasUpi
    ? `upi://pay?pa=${encodeURIComponent(businessUpiId!)}&pn=${encodeURIComponent(businessName)}${amount ? `&am=${amount.toFixed(2)}` : ""}&cu=INR&tn=${encodeURIComponent(txnNote)}`
    : "";

  return (
    <>
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
            onClick={() => onSubmit("UPI", reference.trim() || null)}
          >
            <CheckCircle2 size={18} style={{ display: "inline", marginRight: 8 }} />{claiming ? "Submitting…" : "I have paid"}
          </button>
        </div>
      )}

      {method === "CASH" && (
        <div className="col gap-14">
          <div className="card col center" style={{ padding: 24, gap: 10, background: "var(--green-100)", border: "none" }}>
            <Banknote size={40} color="var(--green-500)" />
            <div className="semi" style={{ fontSize: 16 }}>{cashTitle}</div>
            <div className="tiny muted center" style={{ maxWidth: 220, lineHeight: 1.6 }}>{cashBody}</div>
          </div>
          <button
            className="btn btn-block"
            style={{ background: "var(--green-500)", color: "#fff", fontWeight: 700, height: 48, fontSize: 15 }}
            disabled={claiming}
            onClick={() => onSubmit("CASH", null)}
          >
            <CheckCircle2 size={18} style={{ display: "inline", marginRight: 8 }} />{claiming ? "Sending…" : "I've paid in cash"}
          </button>
        </div>
      )}
    </>
  );
}
