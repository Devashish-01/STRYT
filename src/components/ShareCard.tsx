import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { MessageCircle, Link2, Send, Share2, QrCode, Download, Printer, X, Store, Camera, Sparkles, Megaphone, Users } from "@/components/Icons";
import AppMark from "@/components/AppMark";
import ShareToChatSheet from "@/components/ShareToChatSheet";
import { useApp } from "@/store";
import { copyText } from "@/lib/clipboard";
import { PLACEHOLDER_AVATAR } from "@/lib/placeholders";
import { useI18n } from "@/lib/i18n";
import { shareCapabilities, type ShareSubject } from "@/lib/share";

interface Props {
  /** What's being shared. Pass an array to render the role-switcher chips
   *  (Profile's "Personal / Shop / Provider") — each entry carries its OWN
   *  capabilities, so switching to a shop you manage reveals that shop's
   *  counter stand and payment QR while your personal profile shows neither.
   *  Previously the chips swapped the card's text but left every channel
   *  identical. */
  subjects: ShareSubject | ShareSubject[];
  onClose: () => void;
}

export default function ShareCard({ subjects, onClose }: Props) {
  const { showToast, isGuest } = useApp();
  const { t } = useI18n();
  const nav = useNavigate();
  const list = Array.isArray(subjects) ? subjects : [subjects];
  const [activeIdx, setActiveIdx] = useState(0);
  const [viewMode, setViewMode] = useState<"card" | "qr">("card");
  const [qrMode, setQrMode] = useState<"profile" | "payment">("profile");
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const subject = list[Math.min(activeIdx, list.length - 1)];
  const caps = shareCapabilities(subject);

  const currentTitle = subject.title;
  const currentSubtitle = subject.subtitle;
  const currentImage = subject.image ?? "";
  const currentMeta = subject.meta;
  const shareUrl = caps.url;
  const shareText = `${currentTitle} — ${currentSubtitle}${currentMeta ? ` (${currentMeta})` : ""}`;

  // A merchant's UPI id only exists on the two merchant kinds; reading it off
  // a narrowed subject keeps the union honest rather than widening the base.
  const upiId = subject.kind === "business" || subject.kind === "provider" ? subject.upiId ?? undefined : undefined;
  const paymentQrUrl = subject.kind === "business" || subject.kind === "provider" ? subject.paymentQrUrl ?? undefined : undefined;

  // Switching subject can invalidate the current view/tab — a shop you manage
  // offers QR + payment, your personal profile offers neither, so land back on
  // a view that still exists instead of rendering an empty panel.
  useEffect(() => {
    if (!caps.qr.enabled) setViewMode("card");
    if (!caps.paymentQr) setQrMode("profile");
  }, [caps.qr.enabled, caps.paymentQr]);

  // What the QR encodes. Payment mode carries the merchant's UPI VPA, so this
  // string must never leave the device — it used to be handed to a third-party
  // image service (api.qrserver.com), which meant every payment QR shipped a
  // merchant's payment identifier to goqr.me. Rendered locally instead: nothing
  // is transmitted, and the data: URL keeps the download canvas untainted.
  const showingPayment = qrMode === "payment" && caps.paymentQr;
  const qrPayload = (showingPayment && !paymentQrUrl)
    ? `upi://pay?pa=${upiId}&pn=${encodeURIComponent(currentTitle)}`
    : shareUrl;
  // A merchant-uploaded QR image wins over anything we generate.
  const uploadedQrUrl = showingPayment && paymentQrUrl ? paymentQrUrl : "";

  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [generatedQrUrl, setGeneratedQrUrl] = useState("");

  // The hidden <QRCodeCanvas> below is a child, so its own draw effect has
  // already run by the time this one fires — the canvas is painted and safe to
  // read. Re-runs whenever the encoded payload changes (profile ⇄ payment tab,
  // or a different subject).
  useEffect(() => {
    if (uploadedQrUrl || !caps.qr.enabled) return;
    try {
      setGeneratedQrUrl(qrCanvasRef.current?.toDataURL("image/png") ?? "");
    } catch {
      setGeneratedQrUrl(""); // canvas unavailable — the <img> just renders empty
    }
  }, [qrPayload, uploadedQrUrl, caps.qr.enabled]);

  const qrUrlToUse = uploadedQrUrl || generatedQrUrl;

  async function copyLink() {
    const ok = await copyText(shareUrl);
    showToast(ok ? t("link_copied") : t("couldnt_copy_link"));
    onClose();
  }

  /** Opens the composer pre-armed as a SHOUTOUT tagging this listing, rather
   *  than inventing a repost model — a shoutout with a tagged business IS the
   *  app's existing "tell the street about this place" post. */
  function recommendToNeighbours() {
    if (subject.kind !== "business" && subject.kind !== "provider") return;
    nav("/community/new", {
      state: {
        prefill: {
          type: "SHOUTOUT",
          taggedListing: {
            listingType: subject.kind === "business" ? "BUSINESS" : "PROVIDER",
            listingId: subject.id,
            name: currentTitle,
          },
        },
      },
    });
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

  async function downloadQrImage() {
    if (!qrUrlToUse) {
      showToast(t("qr_not_ready"));
      return;
    }
    try {
      setIsGenerating(true);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = 600;
      canvas.height = 840;

      // Draw background gradient
      const grad = ctx.createLinearGradient(0, 0, 600, 840);
      if (showingPayment) {
        grad.addColorStop(0, "#16a34a");
        grad.addColorStop(1, "#15803d");
      } else {
        grad.addColorStop(0, "#7c3aed");
        grad.addColorStop(1, "#4c1d95");
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 600, 840);

      // Brand header. Generic on purpose — this PNG used to read
      // "STRYT LOCAL BUSINESS" even when the subject was a lost-dog post.
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.font = "bold 22px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("STRYT", 300, 52);

      // White Card Container
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.roundRect(36, 76, 528, 710, 28);
      ctx.fill();

      // Title & Subtitle
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 30px system-ui, -apple-system, sans-serif";
      ctx.fillText(currentTitle, 300, 140);

      ctx.fillStyle = "#64748b";
      ctx.font = "18px system-ui, -apple-system, sans-serif";
      ctx.fillText(currentSubtitle, 300, 175);

      // Load and draw QR code
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = qrUrlToUse;

      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });

      ctx.drawImage(img, 120, 210, 360, 360);

      // Instruction callout — says what scanning THIS subject actually does.
      ctx.fillStyle = showingPayment ? "#16a34a" : "#7c3aed";
      ctx.font = "bold 20px system-ui, -apple-system, sans-serif";
      ctx.fillText(showingPayment ? "SCAN WITH ANY UPI APP TO PAY" : caps.qr.scanLabel, 300, 610);

      ctx.fillStyle = "#64748b";
      ctx.font = "15px system-ui, -apple-system, sans-serif";
      ctx.fillText(showingPayment ? `UPI ID: ${upiId || ""}` : caps.qr.caption, 300, 642);

      // Footer branding on card
      ctx.fillStyle = "#f1f5f9";
      ctx.fillRect(36, 710, 528, 76);
      ctx.fillStyle = "#475569";
      ctx.font = "bold 15px system-ui, -apple-system, sans-serif";
      ctx.fillText("STRYT • Connecting Local Shops & Neighbors", 300, 752);

      // Download
      const dataUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${currentTitle.replace(/\s+/g, "_")}_STRYT_QR.png`;
      a.click();
      showToast(t("qr_downloaded"));
    } catch {
      showToast(t("qr_download_failed"));
    } finally {
      setIsGenerating(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  const ARTIFACT_LABEL: Record<NonNullable<typeof caps.artifact>, string> = {
    "counter-stand": t("print_stand"),
    "lost-found-flyer": t("print_flyer"),
    "campaign-poster": t("print_poster"),
  };

  // Channels are derived, not fixed. In-app channels come first — this is a
  // neighbourhood app, so sending to one neighbour or recommending a place to
  // the street beats bouncing out to WhatsApp, and neither existed before.
  const channels = [
    // Guests have no conversations to send into; the action would dead-end.
    ...(!isGuest
      ? [{ label: t("send_to_chat_short"), icon: Send, color: "var(--brand-700)", onClick: () => setChatOpen(true) }]
      : []),
    ...(caps.recommend && !isGuest
      ? [{ label: t("recommend_short"), icon: Megaphone, color: "var(--green-600)", onClick: recommendToNeighbours }]
      : []),
    { label: t("whatsapp_word"), icon: MessageCircle, color: "#25D366", onClick: shareWhatsApp },
    { label: t("copy_link"), icon: Link2, color: "var(--ink-600)", onClick: copyLink },
    ...(caps.qr.enabled
      ? [{ label: t("download_qr"), icon: Download, color: "var(--purple-600)", onClick: downloadQrImage }]
      : []),
    ...(caps.artifact
      ? [{ label: ARTIFACT_LABEL[caps.artifact], icon: Printer, color: "var(--blue-600)", onClick: () => setShowPrintModal(true) }]
      : []),
    { label: t("more_word"), icon: Share2, color: "var(--orange-500)", onClick: shareMore },
  ];

  return (
    <>
      {/* Off-screen source for every QR on this sheet (preview, print stand and
          the downloaded PNG all read its data: URL). Kept mounted regardless of
          which tab is showing so "Download QR" works straight from the card
          view. `marginSize={4}` is the quiet zone the QR spec requires — without
          it scanners struggle against a coloured backdrop. */}
      {!uploadedQrUrl && caps.qr.enabled && (
        <div aria-hidden style={{ position: "absolute", width: 0, height: 0, overflow: "hidden", pointerEvents: "none" }}>
          <QRCodeCanvas ref={qrCanvasRef} value={qrPayload} size={500} level="M" marginSize={4} />
        </div>
      )}
      <div className="overlay" onClick={onClose}>
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <div className="sheet-grab" />
          <div className="row gap-8" style={{ marginBottom: 14 }}>
            <Share2 size={20} color="var(--brand-700)" />
            <h3 className="bold h2">{t("share_with_neighbors")}</h3>
          </div>

          {/* Subject switcher — only when there's more than one to switch to. */}
          {list.length > 1 && (
            <div className="row gap-8" style={{ marginBottom: 14, overflowX: "auto", paddingBottom: 4, width: "100%" }}>
              {list.map((opt, i) => (
                <button
                  key={`${opt.kind}:${opt.id}`}
                  onClick={() => setActiveIdx(i)}
                  className="chip"
                  style={{
                    background: activeIdx === i ? "var(--brand-700)" : "#fff",
                    color: activeIdx === i ? "#fff" : "var(--ink-700)",
                    borderColor: activeIdx === i ? "var(--brand-700)" : "var(--ink-200)",
                    fontSize: 12,
                    padding: "5px 12px",
                    borderRadius: 20,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0
                  }}
                >
                  {opt.label ?? opt.title}
                </button>
              ))}
            </div>
          )}

          {/* View Mode Toggle: Card vs QR Code — QR hidden when the subject
              has no meaningful one (a request expires within 24h). */}
          {caps.qr.enabled && (
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
                  {t("details")}
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
                  {t("qr_code_tab")}
                </button>
              </div>
            </div>
          )}

          {/* Preview Container */}
          {viewMode === "qr" && caps.qr.enabled ? (
            <div
              style={{
                borderRadius: 20,
                padding: "20px 16px",
                background: showingPayment ? "linear-gradient(160deg, var(--green-500), var(--green-700))" : "linear-gradient(160deg, var(--brand-500), var(--brand-800))",
                color: "#fff",
                boxShadow: "var(--shadow-md)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center"
              }}
            >
              {/* Payment / Profile toggle — merchant subjects the viewer
                  manages, with a UPI id actually configured. */}
              {caps.paymentQr && (
                <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 20, padding: 3, display: "flex", gap: 2, marginBottom: 14 }}>
                  <button
                    onClick={() => setQrMode("profile")}
                    style={{ border: "none", background: qrMode === "profile" ? "rgba(255,255,255,0.9)" : "transparent", color: qrMode === "profile" ? "var(--ink-900)" : "rgba(255,255,255,0.8)", fontWeight: 600, padding: "5px 14px", borderRadius: 18, fontSize: 12, cursor: "pointer", transition: "all 0.2s" }}
                  >
                    {t("profile_tab")}
                  </button>
                  <button
                    onClick={() => setQrMode("payment")}
                    style={{ border: "none", background: qrMode === "payment" ? "rgba(255,255,255,0.9)" : "transparent", color: qrMode === "payment" ? "var(--ink-900)" : "rgba(255,255,255,0.8)", fontWeight: 600, padding: "5px 14px", borderRadius: 18, fontSize: 12, cursor: "pointer", transition: "all 0.2s" }}
                  >
                    <span className="row gap-4"><QrCode size={12} /> {t("payment_tab")}</span>
                  </button>
                </div>
              )}

              {showingPayment ? (
                <>
                  <div style={{ background: "#fff", borderRadius: 16, padding: 12, boxShadow: "var(--shadow)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                    {/* `|| undefined` so React omits src entirely on the first
                        frame before the canvas has been read — an empty src
                        makes the browser re-request the page itself. */}
                    <img src={qrUrlToUse || undefined} alt="" style={{ width: 160, height: 160, objectFit: "contain", display: "block" }} />
                  </div>
                  <div className="bold" style={{ fontSize: 18 }}>{currentTitle}</div>
                  <div className="small" style={{ opacity: 0.9, marginTop: 2 }}>{upiId}</div>
                  <div className="tiny semi" style={{ marginTop: 10, opacity: 0.85, letterSpacing: 0.5 }}>{t("scan_to_pay")}</div>
                </>
              ) : (
                <>
                  <div style={{ background: "#fff", borderRadius: 16, padding: 12, boxShadow: "var(--shadow)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                    <img
                      src={qrUrlToUse || undefined}
                      alt="QR Code"
                      style={{ width: 160, height: 160, display: "block" }}
                    />
                  </div>
                  <div className="bold" style={{ fontSize: 18 }}>{currentTitle}</div>
                  <div className="small" style={{ opacity: 0.9, marginTop: 2 }}>{currentSubtitle}</div>
                  {currentMeta && <div className="tiny" style={{ opacity: 0.8, marginTop: 4 }}>{currentMeta}</div>}
                  <div className="tiny semi" style={{ marginTop: 10, opacity: 0.85, letterSpacing: 0.5 }}>{caps.qr.scanLabel}</div>
                </>
              )}

              {/* Action row in QR Mode */}
              <div className="row gap-8" style={{ marginTop: 16 }}>
                <button
                  className="btn btn-sm"
                  onClick={downloadQrImage}
                  disabled={isGenerating}
                  style={{ background: "#fff", color: "var(--ink-900)", border: "none", fontWeight: 700 }}
                >
                  <Download size={15} /> {isGenerating ? t("saving_ellipsis") : t("download_qr")}
                </button>
                {caps.artifact === "counter-stand" && (
                  <button
                    className="btn btn-sm"
                    onClick={() => setShowPrintModal(true)}
                    style={{ background: "rgba(255,255,255,0.2)", color: "#fff", border: "1px solid rgba(255,255,255,0.4)", fontWeight: 700 }}
                  >
                    <Printer size={15} /> Print Stand
                  </button>
                )}
              </div>
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
                  <AppMark size={20} radius={5} shadow={false} />
                  <span className="tiny semi" style={{ opacity: 0.85, letterSpacing: 1 }}>{t("found_on_stryt")}</span>
                </div>
                <div className="bold" style={{ fontSize: 19 }}>{currentTitle}</div>
                <div className="small" style={{ opacity: 0.9 }}>{currentSubtitle}</div>
                {currentMeta && <div className="tiny" style={{ opacity: 0.75, marginTop: 6 }}>{currentMeta}</div>}
                <div className="tiny semi" style={{ marginTop: 10, opacity: 0.9 }}>📍 {t("tap_to_open_stryt")}</div>
              </div>
            </div>
          )}

          {/* Channels. Scrollable rather than space-around: the list is now
              derived, so a business visitor sees six and an owner six — more
              than fit a 480px shell at a 52px target each. */}
          <div
            className="row"
            style={{
              marginTop: 18,
              gap: 6,
              overflowX: "auto",
              justifyContent: channels.length <= 5 ? "space-around" : "flex-start",
              scrollbarWidth: "none",
            }}
          >
            {channels.map((c) => {
              const Icon = c.icon;
              return (
                <button
                  key={c.label}
                  className="col center"
                  style={{ gap: 7, flexShrink: 0, minWidth: 64 }}
                  onClick={c.onClick}
                >
                  <div style={{ width: 52, height: 52, borderRadius: "50%", background: `${c.color}1a`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon size={22} color={c.color} />
                  </div>
                  <span className="tiny semi" style={{ fontSize: 11, textAlign: "center", lineHeight: 1.2 }}>{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Printable Counter Stand — merchant signage, so it only ever renders
          for a business/provider the viewer actually manages. Its copy
          ("Official Local Business Scanner", "view our catalog, menu &
          offers") is finally guaranteed to match its subject. */}
      {showPrintModal && caps.artifact && (
        <div className="overlay" style={{ zIndex: 120 }} onClick={() => setShowPrintModal(false)}>
          <div
            className="sheet printable-artifact"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 440,
              borderRadius: 24,
              padding: 24,
              background: "#fff",
              color: "var(--ink-900)",
              maxHeight: "92vh",
              overflowY: "auto",
            }}
          >
            {/* Header controls (hidden on print) */}
            <div className="row between no-print" style={{ marginBottom: 16 }}>
              <div className="bold h3 row gap-6">
                <Printer size={20} color="var(--brand-700)" /> {ARTIFACT_LABEL[caps.artifact]}
              </div>
              <button className="icon-btn-sm" onClick={() => setShowPrintModal(false)} aria-label={t("close_word")}>
                <X size={18} />
              </button>
            </div>

            {caps.artifact === "counter-stand" && (
              <CounterStand title={currentTitle} subtitle={currentSubtitle} qrUrl={qrUrlToUse} />
            )}
            {caps.artifact === "lost-found-flyer" && (
              <LostFoundFlyer title={currentTitle} subtitle={currentSubtitle} meta={currentMeta} image={currentImage} qrUrl={qrUrlToUse} shareUrl={shareUrl} />
            )}
            {caps.artifact === "campaign-poster" && (
              <CampaignPoster title={currentTitle} subtitle={currentSubtitle} meta={currentMeta} qrUrl={qrUrlToUse} />
            )}

            {/* Print Action Buttons (hidden on print) */}
            <div className="row gap-10 no-print" style={{ marginTop: 20, justifyContent: "flex-end" }}>
              <button className="btn btn-outline" onClick={() => setShowPrintModal(false)}>
                {t("cancel_word")}
              </button>
              <button className="btn btn-primary row gap-6" onClick={handlePrint}>
                <Printer size={18} /> {t("print_word")}
              </button>
            </div>
          </div>
        </div>
      )}

      {chatOpen && (
        <ShareToChatSheet
          message={`${shareText}\n${shareUrl}`}
          onSent={onClose}
          onClose={() => setChatOpen(false)}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Artifacts — one template per subject kind that genuinely warrants a
 * physical print. Each is its own component so the sheet body stays a
 * three-line switch rather than three inlined posters.
 * ------------------------------------------------------------------ */

/** Till signage for a shop the viewer manages. Its merchant copy is finally
 *  guaranteed to match its subject — this used to render for lost dogs. */
function CounterStand({ title, subtitle, qrUrl }: { title: string; subtitle: string; qrUrl: string }) {
  const { t } = useI18n();
  return (
    <div style={{ border: "2.5px solid var(--brand-300)", borderRadius: 24, overflow: "hidden", background: "#ffffff", boxShadow: "0 12px 32px rgba(124, 58, 237, 0.15)", position: "relative" }}>
      <div className="tiny semi no-print" style={{ background: "var(--brand-50)", color: "var(--brand-700)", padding: "6px 12px", borderBottom: "1px dashed var(--brand-300)", fontSize: 11, letterSpacing: 0.5, textAlign: "center" }}>
        ✂️ {t("fold_to_stand")}
      </div>

      <div style={{ background: "linear-gradient(135deg, var(--brand-700), var(--brand-900))", color: "#fff", padding: "18px 20px", textAlign: "center" }}>
        <div className="row center gap-8" style={{ marginBottom: 4 }}>
          <AppMark size={28} radius={8} shadow={false} />
          <span className="bold" style={{ fontSize: 20, letterSpacing: 1.5, color: "#fff" }}>STRYT</span>
        </div>
        <div className="tiny" style={{ opacity: 0.85, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase" }}>
          {t("official_business_scanner")}
        </div>
      </div>

      <div style={{ padding: "20px 24px 24px", textAlign: "center" }}>
        <div className="bold" style={{ fontSize: 24, color: "var(--ink-900)", marginBottom: 4, lineHeight: 1.2 }}>{title}</div>

        <div className="row center gap-6" style={{ marginBottom: 16 }}>
          <span className="chip" style={{ background: "var(--brand-50)", color: "var(--brand-700)", borderColor: "var(--brand-200)", fontSize: 12, padding: "3px 10px", fontWeight: 600 }}>
            <Store size={12} style={{ display: "inline", marginRight: 4 }} />
            {subtitle}
          </span>
        </div>

        <div style={{ background: "#ffffff", borderRadius: 20, padding: 16, display: "inline-block", border: "2px solid var(--brand-300)", boxShadow: "0 8px 20px rgba(0,0,0,0.06)", marginBottom: 16, position: "relative" }}>
          <img src={qrUrl || undefined} alt="" style={{ width: 210, height: 210, display: "block" }} />
          <div style={{ position: "absolute", bottom: -10, left: "50%", transform: "translateX(-50%)", background: "var(--brand-700)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 10px", borderRadius: 12, whiteSpace: "nowrap" }}>
            {t("scan_me")}
          </div>
        </div>

        <div style={{ background: "var(--ink-50)", borderRadius: 16, padding: "14px 16px", marginBottom: 16, textAlign: "left" }}>
          <div className="tiny bold row gap-6" style={{ color: "var(--brand-700)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
            <Camera size={14} /> {t("how_to_connect_store")}
          </div>
          <div className="col gap-6" style={{ fontSize: 12, color: "var(--ink-700)", lineHeight: 1.35 }}>
            {[t("scan_step_1"), t("scan_step_2"), t("scan_step_3_store")].map((step, i) => (
              <div key={i} className="row gap-8">
                <span className="bold" style={{ color: "var(--brand-700)", width: 16 }}>{i + 1}.</span>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="row center gap-4 tiny muted" style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-500)" }}>
          <Sparkles size={13} color="var(--brand-600)" />
          <span>{t("support_local_stryt")}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * A lamppost flyer for a lost/found post — the one case where printing is the
 * POINT rather than an odd extra. Photo-led (a stranger recognises the pet or
 * bag, not the words), with tear-off tabs carrying the link, which is what
 * actually makes a paper flyer work.
 */
function LostFoundFlyer({
  title, subtitle, meta, image, qrUrl, shareUrl,
}: { title: string; subtitle: string; meta?: string; image: string; qrUrl: string; shareUrl: string }) {
  const { t } = useI18n();
  // The tab text is the bare host+path — someone tearing a strip off a pole
  // types it in, so it has to be short enough to read at arm's length.
  const shortLink = shareUrl.replace(/^https?:\/\//, "");
  return (
    <div style={{ border: "2.5px solid var(--amber-500)", borderRadius: 20, overflow: "hidden", background: "#ffffff", boxShadow: "0 12px 32px rgba(245, 158, 11, 0.18)" }}>
      <div style={{ background: "var(--amber-500)", color: "var(--ink-900)", padding: "14px 20px", textAlign: "center" }}>
        <div className="bold" style={{ fontSize: 30, letterSpacing: 3, lineHeight: 1 }}>{t("lost_found_banner")}</div>
      </div>

      <div style={{ padding: "18px 20px 20px", textAlign: "center" }}>
        {image && (
          <img
            src={image}
            alt=""
            style={{ width: "100%", maxHeight: 240, objectFit: "cover", borderRadius: 14, marginBottom: 14, border: "1px solid var(--ink-200)" }}
          />
        )}

        <div className="bold" style={{ fontSize: 22, color: "var(--ink-900)", lineHeight: 1.25, marginBottom: 6 }}>{title}</div>
        <div className="small" style={{ color: "var(--ink-600)", marginBottom: 4 }}>{subtitle}</div>
        {meta && <div className="tiny" style={{ color: "var(--ink-500)", marginBottom: 14 }}>{meta}</div>}

        <div className="row center gap-14" style={{ marginTop: 8, marginBottom: 14, alignItems: "center" }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 8, border: "2px solid var(--ink-200)", flexShrink: 0 }}>
            <img src={qrUrl || undefined} alt="" style={{ width: 116, height: 116, display: "block" }} />
          </div>
          <div style={{ textAlign: "left", fontSize: 12, color: "var(--ink-700)", lineHeight: 1.4 }}>
            <div className="bold" style={{ color: "var(--amber-800)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 11 }}>
              {t("seen_this")}
            </div>
            <div>{t("scan_to_contact")}</div>
          </div>
        </div>

        {/* Tear-off contact strips — the mechanic that makes a pole flyer work
            at all. Ten so a passer-by can take one and the rest stay. */}
        <div style={{ borderTop: "2px dashed var(--ink-300)", paddingTop: 10, marginTop: 6 }}>
          <div className="tiny semi no-print" style={{ color: "var(--ink-500)", marginBottom: 8 }}>
            ✂️ {t("cut_along_dashes")}
          </div>
          <div className="row" style={{ gap: 3, justifyContent: "center", flexWrap: "nowrap" }}>
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  minWidth: 0,
                  borderLeft: i === 0 ? "none" : "1px dashed var(--ink-300)",
                  padding: "6px 1px",
                  fontSize: 7,
                  lineHeight: 1.2,
                  color: "var(--ink-700)",
                  writingMode: "vertical-rl",
                  textOrientation: "mixed",
                  height: 86,
                  overflow: "hidden",
                  fontWeight: 600,
                }}
              >
                {shortLink}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** In-store poster for a bulk-buying campaign the viewer's business is
 *  running — pooling is inherently local, so promoting it at the counter is
 *  the natural fit. */
function CampaignPoster({
  title, subtitle, meta, qrUrl,
}: { title: string; subtitle: string; meta?: string; qrUrl: string }) {
  const { t } = useI18n();
  return (
    <div style={{ border: "2.5px solid var(--brand-300)", borderRadius: 20, overflow: "hidden", background: "#ffffff", boxShadow: "0 12px 32px rgba(124, 58, 237, 0.15)" }}>
      <div style={{ background: "linear-gradient(135deg, var(--brand-700), var(--brand-900))", color: "#fff", padding: "16px 20px", textAlign: "center" }}>
        <div className="row center gap-8" style={{ marginBottom: 4 }}>
          <AppMark size={24} radius={7} shadow={false} />
          <span className="bold" style={{ fontSize: 17, letterSpacing: 1.5, color: "#fff" }}>STRYT</span>
        </div>
        <div className="tiny" style={{ opacity: 0.9, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase" }}>
          {t("group_deal_banner")}
        </div>
      </div>

      <div style={{ padding: "20px 24px 22px", textAlign: "center" }}>
        <div className="bold" style={{ fontSize: 24, color: "var(--ink-900)", lineHeight: 1.2, marginBottom: 6 }}>{title}</div>
        <div className="small" style={{ color: "var(--ink-600)", marginBottom: meta ? 4 : 14 }}>{subtitle}</div>
        {meta && <div className="tiny semi" style={{ color: "var(--brand-700)", marginBottom: 14 }}>{meta}</div>}

        <div style={{ background: "#fff", borderRadius: 18, padding: 14, display: "inline-block", border: "2px solid var(--brand-300)", marginBottom: 14 }}>
          <img src={qrUrl || undefined} alt="" style={{ width: 190, height: 190, display: "block" }} />
        </div>

        <div style={{ background: "var(--brand-50)", borderRadius: 14, padding: "12px 16px", textAlign: "left" }}>
          <div className="tiny bold" style={{ color: "var(--brand-700)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {t("how_group_buying_works")}
          </div>
          <div className="col gap-5" style={{ fontSize: 12, color: "var(--ink-700)", lineHeight: 1.35 }}>
            {[t("campaign_step_1"), t("campaign_step_2"), t("campaign_step_3")].map((step, i) => (
              <div key={i} className="row gap-8">
                <span className="bold" style={{ color: "var(--brand-700)", width: 16 }}>{i + 1}.</span>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
