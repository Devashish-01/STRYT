import { useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "@/components/Icons";
import { SafeImg } from "@/components/common";

export interface PhotoViewerItem {
  url: string;
  caption?: string;
}

interface PhotoViewerProps {
  photos: PhotoViewerItem[];
  startIndex: number;
  onClose: () => void;
}

/**
 * Full-screen photo viewer for plain image galleries (cover/gallery strip,
 * portfolio, catalog thumbnails, avatars) — deliberately separate from
 * StoryViewer, which is built around the Story domain (captions, expiry,
 * auto-progress, reaction chrome) and isn't a good fit for "just look at this
 * photo". Left/right tap zones mirror StoryViewer's existing interaction
 * convention so full-screen media browsing feels the same everywhere.
 */
export default function PhotoViewer({ photos, startIndex, onClose }: PhotoViewerProps) {
  const clamp = (i: number) => Math.max(0, Math.min(photos.length - 1, i));
  const [index, setIndex] = useState(clamp(startIndex));

  const goPrev = () => setIndex((i) => clamp(i - 1));
  const goNext = () => setIndex((i) => clamp(i + 1));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (photos.length === 0) return null;
  const current = photos[index];

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 2000 }}>
      {/* Chrome — counter + close */}
      <div className="row between center-v" style={{ position: "absolute", top: "calc(14px + var(--safe-area-top))", left: 16, right: 16, zIndex: 3 }}>
        <span className="tiny semi" style={{ color: "rgba(255,255,255,0.85)" }}>
          {photos.length > 1 ? `${index + 1} / ${photos.length}` : ""}
        </span>
        <button
          className="icon-btn"
          onClick={onClose}
          style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }}
        >
          <X size={20} />
        </button>
      </div>

      {/* Tap zones — left/right thirds navigate, matching StoryViewer's convention */}
      {photos.length > 1 && (
        <>
          <div onClick={goPrev} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "35%", zIndex: 2, cursor: "w-resize" }} />
          <div onClick={goNext} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "35%", zIndex: 2, cursor: "e-resize" }} />
        </>
      )}

      {/* Image */}
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1, padding: "0 8px" }}>
        <SafeImg
          key={current.url}
          src={current.url}
          alt={current.caption || ""}
          variant="photo"
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
        />
      </div>

      {/* Explicit prev/next controls — larger screens / accessibility */}
      {photos.length > 1 && (
        <>
          <button
            className="icon-btn"
            onClick={goPrev}
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", zIndex: 3, background: "rgba(255,255,255,0.15)", color: "#fff" }}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            className="icon-btn"
            onClick={goNext}
            style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", zIndex: 3, background: "rgba(255,255,255,0.15)", color: "#fff" }}
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}

      {current.caption && (
        <div
          className="small"
          style={{
            position: "absolute", left: 16, right: 16, bottom: "calc(20px + var(--safe-area-bottom))", zIndex: 3,
            color: "#fff", textAlign: "center", textShadow: "0 1px 4px rgba(0,0,0,0.6)",
          }}
        >
          {current.caption}
        </div>
      )}
    </div>
  );
}
