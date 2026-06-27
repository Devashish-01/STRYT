import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { QrCode, X, Camera, Link } from "lucide-react";
import { useApp } from "@/store";

interface Props {
  onClose: () => void;
}

export default function QrScannerSheet({ onClose }: Props) {
  const nav = useNavigate();
  const { showToast, user, ownedBusinessIds, ownedProviderId } = useApp();
  const [tab, setTab] = useState<"camera" | "input">("camera");
  const [inputText, setInputText] = useState("");

  const handleScan = (data: string) => {
    try {
      let path = data.trim();
      if (path.includes("://")) {
        // Parse absolute URLs
        const parsed = new URL(path);
        path = parsed.pathname + parsed.search;
      }

      // Allow simple relative paths like "u/123" or "/u/123"
      if (!path.startsWith("/")) {
        path = "/" + path;
      }

      // Check if it is a valid STRYT path
      if (
        path.startsWith("/business/") ||
        path.startsWith("/provider/") ||
        path.startsWith("/u/") ||
        path.startsWith("/request/")
      ) {
        showToast("QR Scanned successfully!");
        nav(path);
        onClose();
      } else {
        showToast("Unsupported QR Code format");
      }
    } catch {
      showToast("Invalid QR Code text");
    }
  };

  // Demo scan presets (using some known IDs in the system or fallbacks)
  const demoPresets = [
    {
      label: "John's Grocery Store (Business)",
      data: "/business/b1",
      emoji: "🛒",
    },
    {
      label: "Alex Sharma (AC Technician)",
      data: "/provider/p1",
      emoji: "🛠️",
    },
    {
      label: "Sarah Jenkins (Neighbor)",
      data: "/u/u1",
      emoji: "👤",
    },
  ];

  return (
    <div className="overlay" style={{ zIndex: 1100 }} onClick={onClose}>
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
        <div className="row between" style={{ marginBottom: 16 }}>
          <div className="row gap-8">
            <QrCode size={20} color="#8b47f5" />
            <h3 className="bold" style={{ fontSize: 18, color: "#fff" }}>STRYT QR Scanner</h3>
          </div>
          <button
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
              color: "#fff"
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="row center" style={{ marginBottom: 18 }}>
          <div style={{
            background: "rgba(255,255,255,0.08)", borderRadius: 20, padding: 3, display: "flex", gap: 2
          }}>
            <button
              onClick={() => setTab("camera")}
              style={{
                border: "none", background: tab === "camera" ? "var(--brand-700)" : "transparent",
                color: "#fff",
                fontWeight: 600, padding: "6px 16px", borderRadius: 18, fontSize: 13, cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              <Camera size={14} style={{ display: "inline", marginRight: 5, verticalAlign: "middle" }} />
              Camera View
            </button>
            <button
              onClick={() => setTab("input")}
              style={{
                border: "none", background: tab === "input" ? "var(--brand-700)" : "transparent",
                color: "#fff",
                fontWeight: 600, padding: "6px 16px", borderRadius: 18, fontSize: 13, cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              <Link size={14} style={{ display: "inline", marginRight: 5, verticalAlign: "middle" }} />
              Simulate Code
            </button>
          </div>
        </div>

        {/* Tab contents */}
        {tab === "camera" ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            {/* Viewfinder with scanning line */}
            <div
              style={{
                position: "relative",
                width: 220,
                height: 220,
                border: "2px solid rgba(255, 255, 255, 0.4)",
                borderRadius: 24,
                overflow: "hidden",
                background: "#000",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 30px rgba(139, 71, 245, 0.2)"
              }}
            >
              {/* Corner brackets */}
              <div style={{ position: "absolute", top: 12, left: 12, width: 20, height: 20, borderTop: "3px solid #8b47f5", borderLeft: "3px solid #8b47f5", borderRadius: "4px 0 0 0" }} />
              <div style={{ position: "absolute", top: 12, right: 12, width: 20, height: 20, borderTop: "3px solid #8b47f5", borderRight: "3px solid #8b47f5", borderRadius: "0 4px 0 0" }} />
              <div style={{ position: "absolute", bottom: 12, left: 12, width: 20, height: 20, borderBottom: "3px solid #8b47f5", borderLeft: "3px solid #8b47f5", borderRadius: "0 0 0 4px" }} />
              <div style={{ position: "absolute", bottom: 12, right: 12, width: 20, height: 20, borderBottom: "3px solid #8b47f5", borderRight: "3px solid #8b47f5", borderRadius: "0 0 4px 0" }} />

              <QrCode size={100} color="rgba(255, 255, 255, 0.15)" />

              {/* Scanning Laser Line */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  height: 3,
                  background: "linear-gradient(90deg, transparent, #22c55e, transparent)",
                  boxShadow: "0 0 10px #22c55e",
                  animation: "scan-laser 2.2s linear infinite"
                }}
              />
            </div>
            
            <p className="tiny muted" style={{ textAlign: "center", margin: "14px 0 18px", color: "rgba(255,255,255,0.6)" }}>
              Align the QR code inside the frame to scan
            </p>

            {/* CSS Keyframes injected dynamically */}
            <style dangerouslySetInnerHTML={{__html: `
              @keyframes scan-laser {
                0% { top: 15px; }
                50% { top: 205px; }
                100% { top: 15px; }
              }
            `}} />

            {/* Presets Grid */}
            <div style={{ width: "100%", marginTop: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 8, letterSpacing: 0.5 }}>
                QUICK SCAN DEMO
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {demoPresets.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => handleScan(preset.data)}
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 14,
                      color: "#fff",
                      textAlign: "left",
                      cursor: "pointer",
                      fontSize: 13,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      transition: "background 0.2s"
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)"}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.06)"}
                  >
                    <span style={{ fontSize: 20 }}>{preset.emoji}</span>
                    <span className="semi">{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="col gap-14" style={{ paddingBottom: 16 }}>
            <div className="field">
              <label style={{ color: "rgba(255,255,255,0.6)" }}>Type or Paste QR Link/Path</label>
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
                  outline: "none"
                }}
              />
            </div>
            <button
              className="btn btn-primary btn-block"
              disabled={!inputText.trim()}
              onClick={() => handleScan(inputText)}
              style={{
                borderRadius: 14,
                padding: 13,
                fontWeight: 700
              }}
            >
              Simulate Scan
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
