import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { QrCode, X, Camera, Upload, Link, AlertCircle } from "@/components/Icons";
import { Html5Qrcode } from "html5-qrcode";
import { useApp } from "@/store";

interface Props {
  onClose: () => void;
}

export default function QrScannerSheet({ onClose }: Props) {
  const nav = useNavigate();
  const { showToast, addStamp } = useApp();
  const [tab, setTab] = useState<"camera" | "upload" | "input">("camera");
  const [inputText, setInputText] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleScanResult = (data: string) => {
    try {
      let raw = data.trim();
      if (!raw) return;

      // 1. Try JSON parsing (e.g. {"type": "business", "id": "b1"} or {"action": "stamp", "cardId": "c1"})
      if (raw.startsWith("{") && raw.endsWith("}")) {
        try {
          const json = JSON.parse(raw);
          if (json.action === "stamp" && json.cardId) {
            addStamp(json.cardId);
            showToast("Loyalty Stamp Added! 🎟️");
            onClose();
            return;
          }
          if (json.type && json.id) {
            showToast("QR Code recognized!");
            nav(`/${json.type}/${json.id}`);
            onClose();
            return;
          }
        } catch {
          /* not JSON, continue */
        }
      }

      // 2. Handle custom scheme or full URLs (e.g. stryt://... or https://...)
      let path = raw;
      if (path.startsWith("stryt://")) {
        path = "/" + path.replace("stryt://", "");
      } else if (path.includes("://")) {
        const parsed = new URL(path);
        path = parsed.pathname + parsed.search;
      }

      if (!path.startsWith("/") && !path.startsWith("@")) {
        path = "/" + path;
      }

      // 3. Smart routing for STRYT paths & raw IDs
      if (path.startsWith("@")) {
        showToast(`Searching handle ${path}...`);
        nav(`/search?q=${encodeURIComponent(path)}`);
        onClose();
      } else if (path.startsWith("/track/") || path.startsWith("track_")) {
        const token = path.replace("/track/", "").replace("track_", "");
        showToast("Opening tracking details...");
        nav(`/track/${token}`);
        onClose();
      } else if (
        path.startsWith("/business/") ||
        path.startsWith("/provider/") ||
        path.startsWith("/u/") ||
        path.startsWith("/request/") ||
        path.startsWith("/catalog/") ||
        path.startsWith("/agreement/")
      ) {
        showToast("QR Scanned successfully! 🎯");
        nav(path);
        onClose();
      } else if (/^\/?biz_[a-zA-Z0-9_-]+$/.test(path) || /^\/?b\d+$/.test(path)) {
        const id = path.replace(/^\//, "");
        nav(`/business/${id}`);
        onClose();
      } else if (/^\/?prov_[a-zA-Z0-9_-]+$/.test(path) || /^\/?p\d+$/.test(path)) {
        const id = path.replace(/^\//, "");
        nav(`/provider/${id}`);
        onClose();
      } else if (/^\/?u\d+$/.test(path) || /^\/?usr_[a-zA-Z0-9_-]+$/.test(path)) {
        const id = path.replace(/^\//, "");
        nav(`/u/${id}`);
        onClose();
      } else {
        showToast("Opening QR link: " + path);
        nav(path);
        onClose();
      }
    } catch {
      showToast("Invalid QR Code text");
    }
  };

  useEffect(() => {
    if (tab !== "camera") {
      if (scannerRef.current && scannerRef.current.isScanning) {
        void scannerRef.current.stop().then(() => {
          scannerRef.current?.clear();
          setIsScanning(false);
        });
      }
      return;
    }

    let isMounted = true;
    const scannerId = "live-qr-reader";

    const timer = setTimeout(() => {
      if (!document.getElementById(scannerId)) return;
      const html5QrCode = new Html5Qrcode(scannerId);
      scannerRef.current = html5QrCode;

      html5QrCode
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText) => {
            if (!isMounted) return;
            void html5QrCode.stop().then(() => {
              html5QrCode.clear();
              setIsScanning(false);
              handleScanResult(decodedText);
            });
          },
          () => {
            // Frame parse noise — ignore
          }
        )
        .then(() => {
          if (isMounted) {
            setIsScanning(true);
            setCameraError(null);
          }
        })
        .catch((err) => {
          if (isMounted) {
            setIsScanning(false);
            const msg = typeof err === "string" ? err : err?.message || "Could not access camera hardware";
            setCameraError(msg);
          }
        });
    }, 150);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (scannerRef.current && scannerRef.current.isScanning) {
        void scannerRef.current.stop().then(() => {
          scannerRef.current?.clear();
        }).catch(() => {/* ignore */});
      }
    };
  }, [tab]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const html5QrCode = new Html5Qrcode("file-qr-reader-temp");
      const decodedText = await html5QrCode.scanFile(file, true);
      html5QrCode.clear();
      handleScanResult(decodedText);
    } catch {
      showToast("No QR code found in selected image");
    }
  }

  return (
    <div className="overlay" style={{ zIndex: 1100 }} onClick={onClose}>
      {/* Hidden element for file scanning */}
      <div id="file-qr-reader-temp" style={{ display: "none" }} />

      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#14111c",
          color: "#fff",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: "24px 24px 0 0",
        }}
      >
        <div className="sheet-grab" style={{ background: "rgba(255,255,255,0.2)" }} />

        {/* Header */}
        <div className="row space-between" style={{ marginBottom: 16, alignItems: "center" }}>
          <div className="row gap-8" style={{ alignItems: "center" }}>
            <QrCode size={20} color="var(--brand-500)" />
            <h3 className="bold h2" style={{ color: "#fff", margin: 0 }}>Live QR Scanner</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.1)",
              border: "none",
              borderRadius: "50%",
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "#fff",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="row center" style={{ marginBottom: 18 }}>
          <div
            style={{
              background: "rgba(255,255,255,0.08)",
              borderRadius: 20,
              padding: 3,
              display: "flex",
              gap: 2,
            }}
          >
            <button
              type="button"
              onClick={() => setTab("camera")}
              style={{
                border: "none",
                background: tab === "camera" ? "var(--brand-700)" : "transparent",
                color: "#fff",
                fontWeight: 600,
                padding: "6px 14px",
                borderRadius: 18,
                fontSize: 13,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              <Camera size={14} style={{ display: "inline", marginRight: 5, verticalAlign: "middle" }} />
              Live Camera
            </button>
            <button
              type="button"
              onClick={() => setTab("upload")}
              style={{
                border: "none",
                background: tab === "upload" ? "var(--brand-700)" : "transparent",
                color: "#fff",
                fontWeight: 600,
                padding: "6px 14px",
                borderRadius: 18,
                fontSize: 13,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              <Upload size={14} style={{ display: "inline", marginRight: 5, verticalAlign: "middle" }} />
              Upload Image
            </button>
            <button
              type="button"
              onClick={() => setTab("input")}
              style={{
                border: "none",
                background: tab === "input" ? "var(--brand-700)" : "transparent",
                color: "#fff",
                fontWeight: 600,
                padding: "6px 14px",
                borderRadius: 18,
                fontSize: 13,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              <Link size={14} style={{ display: "inline", marginRight: 5, verticalAlign: "middle" }} />
              Enter Code
            </button>
          </div>
        </div>

        {/* Tab contents */}
        {tab === "camera" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            {/* Viewfinder Container */}
            <div
              style={{
                position: "relative",
                width: 250,
                height: 250,
                borderRadius: 24,
                overflow: "hidden",
                background: "#000",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 30px rgba(139, 71, 245, 0.25)",
                border: "2px solid rgba(255, 255, 255, 0.3)",
              }}
            >
              {/* html5-qrcode video container */}
              <div id="live-qr-reader" style={{ width: "100%", height: "100%" }} />

              {/* Laser animation overlay */}
              {isScanning && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    height: 3,
                    background: "linear-gradient(90deg, transparent, #22c55e, transparent)",
                    boxShadow: "0 0 12px #22c55e",
                    animation: "scan-laser 2.2s linear infinite",
                    zIndex: 10,
                    pointerEvents: "none",
                  }}
                />
              )}
            </div>

            {cameraError ? (
              <div
                className="row gap-8 center-v"
                style={{
                  marginTop: 16,
                  padding: "10px 14px",
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: 12,
                  color: "#f87171",
                  fontSize: 13,
                  maxWidth: 260,
                  textAlign: "center",
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{cameraError} — try uploading an image or entering code.</span>
              </div>
            ) : (
              <p className="tiny muted" style={{ textAlign: "center", margin: "14px 0 18px", color: "rgba(255,255,255,0.6)" }}>
                Align the physical STRYT QR code inside the frame to scan
              </p>
            )}

            <style dangerouslySetInnerHTML={{
              __html: `
              @keyframes scan-laser {
                0% { top: 15px; }
                50% { top: 230px; }
                100% { top: 15px; }
              }
              #live-qr-reader video {
                object-fit: cover !important;
                width: 100% !important;
                height: 100% !important;
              }
              #live-qr-reader__scan_region {
                background: transparent !important;
              }
            `,
            }} />
          </div>
        )}

        {tab === "upload" && (
          <div className="col center gap-14" style={{ padding: "24px 12px 12px", textAlign: "center" }}>
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: 120,
                height: 120,
                borderRadius: 24,
                border: "2px dashed rgba(255,255,255,0.25)",
                background: "rgba(255,255,255,0.05)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                cursor: "pointer",
              }}
            >
              <Upload size={32} color="var(--brand-500)" />
              <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>Select QR Image</span>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/*"
              style={{ display: "none" }}
            />
            <p className="tiny muted" style={{ color: "rgba(255,255,255,0.6)", maxWidth: 240, margin: 0 }}>
              Upload a photo or screenshot containing a STRYT QR code to decode instantly.
            </p>
          </div>
        )}

        {tab === "input" && (
          <div className="col gap-14" style={{ paddingBottom: 16 }}>
            <div className="field">
              <label style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>
                Type or Paste QR Link/Path
              </label>
              <input
                type="text"
                className="input"
                placeholder="e.g. /business/b1 or http://stryt.app/u/u1"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1.5px solid rgba(255,255,255,0.15)",
                  color: "#fff",
                  padding: "12px 14px",
                  borderRadius: 14,
                  fontSize: 15,
                  width: "100%",
                  outline: "none",
                }}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={!inputText.trim()}
              onClick={() => handleScanResult(inputText)}
              style={{
                borderRadius: 14,
                padding: 13,
                fontWeight: 700,
              }}
            >
              Open Link
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
