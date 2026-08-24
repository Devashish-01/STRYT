import { QRCodeSVG } from "qrcode.react";
import { X, CheckCircle2, Copy, Clock, XCircle } from "@/components/Icons";
import { inr } from "@/components/common";
import { copyText } from "@/lib/clipboard";
import { useApp } from "@/store";
import type { GroupBuyToken } from "@/types";

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  ISSUED: { label: "Ready to use", color: "var(--green-600)", bg: "var(--green-100)" },
  REDEEMED: { label: "Already used", color: "var(--ink-600)", bg: "var(--ink-100)" },
  EXPIRED: { label: "Expired", color: "var(--red-600)", bg: "var(--red-50)" },
};

/** The member's QR claim pass. The QR encodes ONLY the token code — never the
 *  holder's identity or price — because a QR gets photographed, forwarded and
 *  screenshotted, and the merchant looks the rest up server-side on scan. */
export default function GroupBuyClaimPassModal({ token, onClose }: { token: GroupBuyToken; onClose: () => void }) {
  const { showToast } = useApp();
  const meta = STATUS_META[token.status] ?? STATUS_META.ISSUED;
  const spent = token.status !== "ISSUED";

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1250, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, animation: "fadeIn .2s" }}
      onClick={onClose}
    >
      <div
        className="col"
        style={{ width: "100%", maxWidth: 360, background: "#fff", borderRadius: 24, padding: 20, animation: "slideUp .25s ease-out", maxHeight: "92vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row between center-v" style={{ marginBottom: 14 }}>
          <div className="bold" style={{ fontSize: 17 }}>Your claim pass</div>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="row gap-8 center-v" style={{ padding: "6px 10px", borderRadius: 999, background: meta.bg, alignSelf: "flex-start", marginBottom: 14 }}>
          {token.status === "ISSUED" ? <CheckCircle2 size={13} color={meta.color} />
            : token.status === "EXPIRED" ? <XCircle size={13} color={meta.color} />
            : <Clock size={13} color={meta.color} />}
          <span className="tiny semi" style={{ color: meta.color }}>{meta.label}</span>
        </div>

        <div className="col center gap-10" style={{ padding: 16, background: spent ? "var(--ink-50)" : "#fff", borderRadius: 16, border: "1px solid var(--ink-100)" }}>
          {/* Dimmed rather than hidden once spent: the member can still show it
              as proof of what they claimed, but it visibly reads as used. */}
          <div style={{ opacity: spent ? 0.25 : 1, transition: "opacity .2s" }}>
            <QRCodeSVG value={token.tokenCode} size={180} />
          </div>
          <div className="bold" style={{ fontSize: 18, letterSpacing: 1.5, fontFamily: "monospace" }}>{token.tokenCode}</div>

          {/* CENTRAL_DROP only: a society coordinator has no scanner, so the
              collection PIN is the thing they'll actually ask for. Shown
              bigger than the QR for that reason. */}
          {token.pickupPin && !spent && (
            <div className="col center gap-2" style={{ padding: "10px 18px", borderRadius: 12, background: "var(--amber-50)", border: "1px solid var(--amber-200)" }}>
              <span className="tiny semi" style={{ color: "var(--amber-800)" }}>Collection PIN</span>
              <span className="bold" style={{ fontSize: 26, letterSpacing: 6, fontFamily: "monospace", color: "var(--amber-800)" }}>{token.pickupPin}</span>
            </div>
          )}
          <button
            className="row gap-6 center-v tiny semi"
            style={{ background: "none", border: "none", color: "var(--brand-700)" }}
            onClick={async () => {
              const ok = await copyText(token.tokenCode);
              showToast(ok ? "Code copied" : "Couldn't copy");
            }}
          >
            <Copy size={12} /> Copy code
          </button>
        </div>

        <div className="col gap-8" style={{ marginTop: 16 }}>
          {token.itemLabel && (
            <div className="row between">
              <span className="tiny muted">Item</span>
              <span className="tiny semi" style={{ textAlign: "right", maxWidth: "65%" }}>{token.itemLabel}</span>
            </div>
          )}
          <div className="row between">
            <span className="tiny muted">Quantity</span>
            <span className="tiny semi">{token.quantity}</span>
          </div>
          {token.unitPrice != null && (
            <div className="row between">
              <span className="tiny muted">Agreed price</span>
              <span className="tiny semi">{inr(token.unitPrice)} each · {inr(token.unitPrice * token.quantity)} total</span>
            </div>
          )}
          {token.validUntilISO && (
            <div className="row between">
              <span className="tiny muted">Valid until</span>
              <span className="tiny semi">{new Date(token.validUntilISO).toLocaleDateString()}</span>
            </div>
          )}
          {token.redeemedAtISO && (
            <div className="row between">
              <span className="tiny muted">Used on</span>
              <span className="tiny semi">{new Date(token.redeemedAtISO).toLocaleString()}</span>
            </div>
          )}
        </div>

        {!spent && (
          <div className="card row gap-10" style={{ padding: 12, marginTop: 14, background: "var(--brand-50)", border: "1px solid var(--brand-200)" }}>
            <div className="tiny" style={{ color: "var(--brand-700)", lineHeight: 1.5 }}>
              Show this code to the provider when you collect. It works once — don't share a screenshot.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
