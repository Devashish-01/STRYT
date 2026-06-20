import { MessageCircle, Copy, Link2, Send, Share2 } from "lucide-react";
import { useApp } from "@/store";
import { copyText } from "@/lib/clipboard";

interface Props {
  title: string;
  subtitle: string;
  image: string;
  meta?: string;
  /** Shareable URL. Defaults to the current page (which is the listing being shared). */
  url?: string;
  onClose: () => void;
}

export default function ShareCard({ title, subtitle, image, meta, url, onClose }: Props) {
  const { showToast } = useApp();

  const shareUrl = url ?? (typeof window !== "undefined" ? window.location.href : "");
  const shareText = `${title} — ${subtitle}${meta ? ` (${meta})` : ""}`;

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
        await navigator.share({ title, text: shareText, url: shareUrl });
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
    { label: "More", icon: Send, color: "#f26a00", onClick: shareMore },
  ];

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="row gap-8" style={{ marginBottom: 14 }}>
          <Share2 size={20} color="var(--brand-700)" />
          <h3 className="bold" style={{ fontSize: 18 }}>Share with neighbors</h3>
        </div>

        {/* Branded preview card */}
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
            <img src={image} alt="" style={{ width: "100%", height: 150, objectFit: "cover" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(76,29,149,0.9), transparent 60%)" }} />
          </div>
          <div style={{ padding: 16, paddingTop: 8 }}>
            <div className="row gap-6" style={{ marginBottom: 6 }}>
              <svg width="18" height="18" viewBox="0 0 64 64"><path d="M18 46V18l28 28V18" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
              <span className="tiny semi" style={{ opacity: 0.85, letterSpacing: 1 }}>FOUND ON NAYA</span>
            </div>
            <div className="bold" style={{ fontSize: 19 }}>{title}</div>
            <div className="small" style={{ opacity: 0.9 }}>{subtitle}</div>
            {meta && <div className="tiny" style={{ opacity: 0.75, marginTop: 6 }}>{meta}</div>}
            <div className="tiny semi" style={{ marginTop: 10, opacity: 0.9 }}>📍 Tap to open in STRYT →</div>
          </div>
        </div>

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
