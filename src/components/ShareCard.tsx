import { useState } from "react";
import { MessageCircle, Copy, Link2, Send, Share2, QrCode } from "@/components/Icons";
import { useApp } from "@/store";
import { copyText } from "@/lib/clipboard";
import { PLACEHOLDER_AVATAR } from "@/lib/placeholders";

export interface ShareOption {
  role: string;
  label: string;
  url: string;
  title: string;
  subtitle: string;
  image: string;
  meta?: string;
}

interface Props {
  title: string;
  subtitle: string;
  image: string;
  meta?: string;
  /** Shareable URL. Defaults to the current page (which is the listing being shared). */
  url?: string;
  options?: ShareOption[];
  onClose: () => void;
  /** UPI VPA e.g. shop@okaxis — used to generate a payment QR in the QR Code tab */
  upiId?: string;
  /** URL of a custom uploaded payment QR image; takes priority over upiId-generated QR */
  paymentQrUrl?: string;
}

export default function ShareCard({ title, subtitle, image, meta, url, options, onClose, upiId, paymentQrUrl }: Props) {
  const { showToast } = useApp();
  const [viewMode, setViewMode] = useState<"card" | "qr">("card");
  const [qrMode, setQrMode] = useState<"profile" | "payment">("profile");
  const [activeOpt, setActiveOpt] = useState<ShareOption | null>(options && options.length > 0 ? options[0] : null);
  const hasPaymentQr = !!(paymentQrUrl || upiId);

  const currentTitle = activeOpt ? activeOpt.title : title;
  const currentSubtitle = activeOpt ? activeOpt.subtitle : subtitle;
  const currentImage = activeOpt ? activeOpt.image : image;
  const currentMeta = activeOpt ? activeOpt.meta : meta;
  const shareUrl = activeOpt ? activeOpt.url : (url ?? (typeof window !== "undefined" ? window.location.href : ""));
  const shareText = `${currentTitle} — ${currentSubtitle}${currentMeta ? ` (${currentMeta})` : ""}`;

  async function copyLink() {
    const ok = await copyText(shareUrl);
    showToast(ok ? "Link copied" : "Couldn't copy link");
    onClose();
  }

  async function copyCard() {
    const ok = await copyText(`${shareText}\n${shareUrl}`);
    showToast(ok ? "Details copied" : "Couldn't copy");
    onClose();
  }

  function shareWhatsApp() {
    const text = encodeURIComponent(`${shareText}\n${shareUrl}`);
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
    onClose();
  }

  async function shareMore() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: currentTitle, text: shareText, url: shareUrl });
      } catch {
        /* user dismissed — no-op */
      }
      onClose();
    } else {
      await copyLink();
    }
  }

  const channels = [
    { label: "WhatsApp", icon: MessageCircle, color: "#25D366", onClick: shareWhatsApp },
    { label: "Copy link", icon: Link2, color: "var(--brand-700)", onClick: copyLink },
    { label: "Copy card", icon: Copy, color: "#0ea5e9", onClick: copyCard },
    { label: "More", icon: Send, color: "var(--orange-500)", onClick: shareMore },
  ];

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="row gap-8" style={{ marginBottom: 14 }}>
          <Share2 size={20} color="var(--brand-700)" />
          <h3 className="bold h2">Share with neighbors</h3>
        </div>

        {/* Option selectors for role profiles */}
        {options && options.length > 1 && (
          <div className="row gap-8" style={{ marginBottom: 14, overflowX: "auto", paddingBottom: 4, width: "100%" }}>
            {options.map((opt) => (
              <button
                key={opt.role}
                onClick={() => setActiveOpt(opt)}
                className="chip"
                style={{
                  background: activeOpt?.role === opt.role ? "var(--brand-700)" : "#fff",
                  color: activeOpt?.role === opt.role ? "#fff" : "var(--ink-700)",
                  borderColor: activeOpt?.role === opt.role ? "var(--brand-700)" : "var(--ink-200)",
                  fontSize: 12,
                  padding: "5px 12px",
                  borderRadius: 20,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {/* View Mode Toggle: Card vs QR Code */}
        <div className="row center" style={{ marginBottom: 14 }}>
          <div style={{
            background: "var(--ink-100)", borderRadius: 20, padding: 3, display: "flex", gap: 2
          }}>
            <button
              onClick={() => setViewMode("card")}
              style={{
                border: "none", background: viewMode === "card" ? "#fff" : "transparent",
                color: viewMode === "card" ? "var(--ink-900)" : "var(--ink-500)",
                fontWeight: 600, padding: "6px 16px", borderRadius: 18, fontSize: 13, cursor: "pointer",
                boxShadow: viewMode === "card" ? "var(--shadow-sm)" : "none",
                transition: "all 0.2s"
              }}
            >
              Details
            </button>
            <button
              onClick={() => setViewMode("qr")}
              style={{
                border: "none", background: viewMode === "qr" ? "#fff" : "transparent",
                color: viewMode === "qr" ? "var(--ink-900)" : "var(--ink-500)",
                fontWeight: 600, padding: "6px 16px", borderRadius: 18, fontSize: 13, cursor: "pointer",
                boxShadow: viewMode === "qr" ? "var(--shadow-sm)" : "none",
                transition: "all 0.2s"
              }}
            >
              QR Code
            </button>
          </div>
        </div>

        {/* Preview Container */}
        {viewMode === "qr" ? (
          <div
            style={{
              borderRadius: 20,
              padding: "24px 16px",
              background: qrMode === "payment" ? "linear-gradient(160deg, #16a34a, #064e3b)" : "linear-gradient(160deg, var(--brand-500), var(--brand-800))",
              color: "#fff",
              boxShadow: "var(--shadow-md)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center"
            }}
          >
            {/* Payment / Profile toggle inside QR panel */}
            {hasPaymentQr && (
              <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 20, padding: 3, display: "flex", gap: 2, marginBottom: 16 }}>
                <button
                  onClick={() => setQrMode("profile")}
                  style={{ border: "none", background: qrMode === "profile" ? "rgba(255,255,255,0.9)" : "transparent", color: qrMode === "profile" ? "#1e1e2e" : "rgba(255,255,255,0.8)", fontWeight: 600, padding: "5px 14px", borderRadius: 18, fontSize: 12, cursor: "pointer", transition: "all 0.2s" }}
                >
                  Profile
                </button>
                <button
                  onClick={() => setQrMode("payment")}
                  style={{ border: "none", background: qrMode === "payment" ? "rgba(255,255,255,0.9)" : "transparent", color: qrMode === "payment" ? "#1e1e2e" : "rgba(255,255,255,0.8)", fontWeight: 600, padding: "5px 14px", borderRadius: 18, fontSize: 12, cursor: "pointer", transition: "all 0.2s" }}
                >
                  <span className="row gap-4"><QrCode size={12} /> Payment</span>
                </button>
              </div>
            )}

            {qrMode === "payment" && hasPaymentQr ? (
              <>
                <div style={{ background: "#fff", borderRadius: 16, padding: 12, boxShadow: "var(--shadow)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                  {paymentQrUrl ? (
                    <img src={paymentQrUrl} alt="Payment QR" style={{ width: 160, height: 160, objectFit: "contain", display: "block" }} />
                  ) : (
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(`upi://pay?pa=${upiId}&pn=${encodeURIComponent(currentTitle)}`)}`}
                      alt="UPI QR"
                      style={{ width: 160, height: 160, display: "block" }}
                    />
                  )}
                </div>
                <div className="bold" style={{ fontSize: 18 }}>{currentTitle}</div>
                <div className="small" style={{ opacity: 0.9, marginTop: 2 }}>{upiId}</div>
                <div className="tiny semi" style={{ marginTop: 14, opacity: 0.85, letterSpacing: 0.5 }}>SCAN TO PAY</div>
              </>
            ) : (
              <>
                <div style={{ background: "#fff", borderRadius: 16, padding: 12, boxShadow: "var(--shadow)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(shareUrl)}`}
                    alt="QR Code"
                    style={{ width: 160, height: 160, display: "block" }}
                  />
                </div>
                <div className="bold" style={{ fontSize: 18 }}>{currentTitle}</div>
                <div className="small" style={{ opacity: 0.9, marginTop: 2 }}>{currentSubtitle}</div>
                {currentMeta && <div className="tiny" style={{ opacity: 0.8, marginTop: 4 }}>{currentMeta}</div>}
                <div className="tiny semi" style={{ marginTop: 14, opacity: 0.85, letterSpacing: 0.5 }}>SCAN TO OPEN IN STRYT</div>
              </>
            )}
          </div>
        ) : (
          /* Branded preview card */
          <div
            style={{
              borderRadius: 20,
              overflow: "hidden",
              background: "linear-gradient(160deg, var(--brand-500), var(--brand-800))",
              color: "#fff",
              boxShadow: "var(--shadow-md)",
            }}
          >
            <div style={{ position: "relative" }}>
              <img src={currentImage || PLACEHOLDER_AVATAR} alt="" style={{ width: "100%", height: 150, objectFit: "cover" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(76,29,149,0.9), transparent 60%)" }} />
            </div>
            <div style={{ padding: 16, paddingTop: 8 }}>
              <div className="row gap-6" style={{ marginBottom: 6 }}>
                <svg width="18" height="18" viewBox="0 0 64 64"><path d="M18 46V18l28 28V18" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
                <span className="tiny semi" style={{ opacity: 0.85, letterSpacing: 1 }}>FOUND ON STRYT</span>
              </div>
              <div className="bold" style={{ fontSize: 19 }}>{currentTitle}</div>
              <div className="small" style={{ opacity: 0.9 }}>{currentSubtitle}</div>
              {currentMeta && <div className="tiny" style={{ opacity: 0.75, marginTop: 6 }}>{currentMeta}</div>}
              <div className="tiny semi" style={{ marginTop: 10, opacity: 0.9 }}>📍 Tap to open in STRYT →</div>
            </div>
          </div>
        )}

        {/* Channels */}
        <div className="row" style={{ marginTop: 18, justifyContent: "space-around" }}>
          {channels.map((c) => {
            const Icon = c.icon;
            return (
              <button key={c.label} className="col center" style={{ gap: 7 }} onClick={c.onClick}>
                <div style={{ width: 54, height: 54, borderRadius: "50%", background: `${c.color}1a`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={24} color={c.color} />
                </div>
                <span className="tiny semi">{c.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
