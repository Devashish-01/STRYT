import { useEffect, useState } from "react";
import { X, Copy, QrCode, AlertCircle, Loader } from "@/components/Icons";
import { QRCodeSVG } from "qrcode.react";
import { getSupabase } from "@/lib/supabaseClient";
import { useApp } from "@/store";
import { copyText } from "@/lib/clipboard";

// The responder's UPI VPA lives on whichever entity they operate as: a provider
// row (user_id) or a business row (owner_user_id). Look up either.
async function fetchUpiForUser(userId: string): Promise<string | null> {
  const sb = getSupabase();
  const [prov, biz] = await Promise.all([
    sb.from("providers").select("upi_id").eq("user_id", userId).not("upi_id", "is", null).limit(1),
    sb.from("businesses").select("upi_id").eq("owner_user_id", userId).not("upi_id", "is", null).limit(1),
  ]);
  return (prov.data?.[0] as any)?.upi_id ?? (biz.data?.[0] as any)?.upi_id ?? null;
}

interface Props {
  payeeUserId: string;
  payeeName: string;
  amount: number;
  onClose: () => void;
}

// Deal-flow payment: the requester pays the responder the agreed price over UPI.
// Same QR/deep-link pattern as the appointment PaymentSheet, driven by the
// responder's saved UPI ID.
export default function DealUpiSheet({ payeeUserId, payeeName, amount, onClose }: Props) {
  const { showToast } = useApp();
  const [upiId, setUpiId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    fetchUpiForUser(payeeUserId).then((v) => { if (active) setUpiId(v); });
    return () => { active = false; };
  }, [payeeUserId]);

  const upiLink = upiId
    ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}${amount ? `&am=${amount.toFixed(2)}` : ""}&cu=INR&tn=${encodeURIComponent("STRYT deal")}`
    : "";

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", animation: "fadeIn .2s" }}
      onClick={onClose}
    >
      <div
        style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: "20px 20px calc(20px + var(--safe-area-bottom))", maxHeight: "92vh", overflowY: "auto", animation: "slideUp .25s ease-out" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row between center-v" style={{ marginBottom: 16 }}>
          <div>
            <div className="bold" style={{ fontSize: 18 }}>Pay {payeeName}</div>
            <div className="tiny muted" style={{ marginTop: 2 }}>Agreed amount ₹{amount}</div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        {upiId === undefined && (
          <div className="col center" style={{ padding: 30, gap: 10 }}>
            <Loader size={22} className="spin" color="var(--brand-600)" />
            <span className="small muted">Loading payment details…</span>
          </div>
        )}

        {upiId === null && (
          <div className="card row gap-10 center-v" style={{ padding: 14, background: "var(--orange-50)", border: "1px solid var(--orange-100)" }}>
            <AlertCircle size={18} color="var(--orange-500)" style={{ flexShrink: 0 }} />
            <div className="tiny" style={{ color: "var(--orange-500)", lineHeight: 1.5 }}>
              {payeeName} hasn't set up UPI yet. Settle in person, then mark the deal paid.
            </div>
          </div>
        )}

        {upiId && (
          <div className="col gap-14">
            <div className="card row gap-10 center-v" style={{ padding: 12, background: "var(--green-100)", border: "1px solid var(--green-500)" }}>
              <QrCode size={16} color="var(--green-600)" style={{ flexShrink: 0 }} />
              <div className="tiny" style={{ color: "var(--green-600)", lineHeight: 1.5 }}>
                Scan or open your UPI app. After paying, tap <strong>"I've paid via UPI"</strong> back on the deal.
              </div>
            </div>

            <div className="col center gap-8">
              <div style={{ padding: 12, background: "#fff", borderRadius: 16, boxShadow: "var(--shadow-sm)", border: "1px solid var(--ink-100)" }}>
                <QRCodeSVG value={upiLink} size={180} />
              </div>
            </div>

            <div className="card row gap-10" style={{ padding: 12 }}>
              <div className="grow">
                <div className="tiny muted">UPI ID</div>
                <div className="semi small" style={{ marginTop: 2 }}>{upiId}</div>
              </div>
              <button
                className="icon-btn"
                style={{ width: 36, height: 36 }}
                onClick={async () => { const ok = await copyText(upiId); showToast(ok ? "UPI ID copied" : "Couldn't copy"); }}
              ><Copy size={15} /></button>
            </div>

            <a
              href={upiLink}
              className="btn btn-primary btn-block"
              style={{ textDecoration: "none", textAlign: "center", fontSize: 15, fontWeight: 700 }}
            >
              Open in UPI app →
            </a>
          </div>
        )}

        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}
