import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { haptics } from "@/lib/haptics";
import { dialRadius, dialSlot, focusedIndex, isRing, offsetFromDrag, snapOffset, stepOffset } from "@/lib/quickDial";

export interface DialCircle {
  id: string;
  label: string;
  icon: ReactNode;
  tint: string;
  accent: string;
  badge?: number;
}

/** A drag shorter than this is a tap. */
const TAP_SLOP_PX = 6;
const CLOSE_MS = 200;

/**
 * A rotary fan of round shortcuts that opens above the Home button — the console's quick access. Five circles show at once on
 * a half-circle; with more, drag (or use the arrow keys) to turn it and the ring wraps. The circle in the middle is named in
 * large type above the arc; every circle is a real button in a labelled group, so a screen reader reads them as a list of
 * buttons and keyboard users can Tab through them (arrow keys turn the ring). Rendered in a portal, because the nav it grows out of is a transformed box and would otherwise trap it.
 */
export default function QuickDial({
  items, open, onClose, onSelect, label, turnHint,
}: {
  items: DialCircle[];
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  /** Accessible name for the whole menu. */
  label: string;
  /** Shown under the arc while there is more to reach by turning. */
  turnHint: string;
}) {
  const n = items.length;
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [radius, setRadius] = useState(() => dialRadius(typeof window === "undefined" ? 390 : window.innerWidth));
  const drag = useRef<{ x: number; base: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const lastFocused = useRef(-1);

  // Mount, then flip `shown` a frame later so the circles animate out of the button instead of appearing in place.
  useEffect(() => {
    if (open) {
      setMounted(true);
      setOffset(0);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), CLOSE_MS);
    return () => clearTimeout(t);
  }, [open]);

  // The arc is sized to the screen, and follows it when the phone is turned.
  useEffect(() => {
    if (!open) return;
    const fit = () => setRadius(dialRadius(window.innerWidth));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [open]);

  // Escape and the system back gesture close it from anywhere, not just when it has focus.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const focused = focusedIndex(offset, n);
  useEffect(() => {
    if (!open || !isRing(n)) return;
    if (lastFocused.current !== -1 && lastFocused.current !== focused) haptics.selection();
    lastFocused.current = focused;
  }, [focused, open, n]);
  useEffect(() => { if (!open) lastFocused.current = -1; }, [open]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!isRing(n) || e.button > 0) return;
    drag.current = { x: e.clientX, base: offset, moved: false };
    suppressClick.current = false;
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = ev.clientX - d.x;
      if (!d.moved && Math.abs(dx) > TAP_SLOP_PX) { d.moved = true; setDragging(true); }
      if (d.moved) setOffset(offsetFromDrag(d.base, dx));
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      const d = drag.current;
      drag.current = null;
      setDragging(false);
      if (d?.moved) {
        // The click that follows a drag must not also select the circle the finger happened to lift over.
        suppressClick.current = true;
        setOffset((o) => snapOffset(o, n));
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }, [n, offset]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); setOffset((o) => stepOffset(o, n, -1)); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); setOffset((o) => stepOffset(o, n, 1)); }
  };

  if (!mounted || n === 0) return null;

  const centre = items[focused];
  return createPortal(
    <div
      className={`qdial-layer${shown ? " is-open" : ""}${dragging ? " is-dragging" : ""}`}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    >
      <div
        className="qdial-backdrop"
        onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } onClose(); }}
        aria-hidden="true"
      />
      <div className="qdial-stage" role="group" aria-label={label} style={{ "--qd-r": `${radius}px` } as CSSProperties}>
        {items.map((item, i) => {
          const slot = dialSlot(i, offset, n, radius);
          const style = {
            "--qd-x": `${slot.x}px`,
            "--qd-y": `${slot.y}px`,
            "--qd-s": slot.scale,
            "--qd-o": slot.opacity,
            "--qd-tint": item.tint,
            "--qd-accent": item.accent,
            "--qd-delay": `${Math.abs(slot.k) * 26}ms`,
          } as CSSProperties;
          return (
            <div key={item.id} className={`qdial-item${slot.focused ? " is-focus" : ""}`} style={style} aria-hidden={!slot.visible}>
              <button
                type="button"
                className="qdial-btn"
                tabIndex={slot.visible && open ? 0 : -1}
                disabled={!slot.visible}
                aria-label={item.badge ? `${item.label}, ${item.badge}` : item.label}
                onClick={() => {
                  if (suppressClick.current) { suppressClick.current = false; return; }
                  haptics.light();
                  onSelect(item.id);
                }}
              >
                <span className="qdial-icon">{item.icon}</span>
                {item.badge ? <span className="count-badge qdial-badge">{item.badge > 9 ? "9+" : item.badge}</span> : null}
              </button>
              <span className="qdial-label" aria-hidden="true">{item.label}</span>
            </div>
          );
        })}
      </div>
      <div className="qdial-stage" style={{ "--qd-r": `${radius}px` } as CSSProperties}>
        {isRing(n) && (
          <div className="qdial-caption" aria-live="polite">
            <span className="qdial-caption-name">{centre?.label}</span>
            <span className="qdial-caption-hint">{turnHint}</span>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

