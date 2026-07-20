import { X } from "@/components/Icons";

/** Fullscreen photo viewer for a booking's attached reference image — shared
 *  across the customer and both owner consoles (previously copy-pasted verbatim
 *  in each). */
export function PhotoPreviewModal({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1300, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ position: "relative", maxWidth: "100%", maxHeight: "100%" }}>
        <img src={src} alt="Attachment Preview" style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: 12, objectFit: "contain" }} />
        <button className="icon-btn" style={{ position: "absolute", top: -12, right: -12, background: "#fff", color: "#000" }} onClick={onClose}><X size={18} /></button>
      </div>
    </div>
  );
}
