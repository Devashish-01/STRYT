import { useRef, useState, type ReactNode } from "react";
import { Trash2 } from "@/components/Icons";
import { haptics } from "@/lib/haptics";
import type { NotificationMetadata } from "@/types";
import { NotificationLeadingVisual, NotificationSupportingLine } from "@/components/NotificationContent";

const SWIPE_REVEAL = 76; // px of red "Delete" backdrop revealed at full swipe
const SWIPE_COMMIT = 46; // px of drag past which releasing commits the delete

/**
 * One notification row: icon tile, title/preview/time, unread state, and an
 * iOS-style swipe-to-delete (real drag-follow, not a CSS-only reveal) plus a
 * desktop hover quick-delete for mouse users. Fires `onDelete` once the user
 * either swipes past the commit threshold or taps either delete affordance —
 * the caller owns the actual removal (optimistic update + revert-on-failure).
 */
export default function NotificationRow({
  icon,
  iconBg,
  iconColor,
  title,
  unread,
  preview,
  time,
  urgent,
  metadata,
  onOpen,
  onDelete,
}: {
  icon: ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  unread: boolean;
  preview: string;
  time: string;
  /** Highest-priority notifications (e.g. "it's your turn") get a distinct tint. */
  urgent?: boolean;
  /** Per-type enrichment (avatar/image, amount, status pill, etc.) — see
   *  NotificationContent.tsx. Undefined/null renders exactly as before. */
  metadata?: NotificationMetadata | null;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const active = useRef(false);
  const decided = useRef(false); // horizontal vs vertical intent locked in yet?

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    active.current = true;
    decided.current = false;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!active.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    if (!decided.current) {
      // Wait for a clear direction before committing to either gesture, so a
      // normal vertical scroll through the list never gets hijacked.
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        active.current = false; // vertical scroll — let the list handle it
        return;
      }
      decided.current = true;
      setDragging(true);
    }

    // Only leftward drag reveals delete; rightward snaps back immediately.
    const clamped = Math.min(0, Math.max(dx, -SWIPE_REVEAL * 1.4));
    setDragX(clamped);
    if (e.cancelable) e.preventDefault();
  }

  function onTouchEnd() {
    if (!active.current) return;
    active.current = false;
    if (!decided.current) return;
    setDragging(false);
    if (dragX <= -SWIPE_COMMIT) {
      haptics.light();
      setDragX(-400); // finish the exit off-screen, caller unmounts shortly after
      onDelete();
    } else {
      setDragX(0);
    }
  }

  const revealed = Math.min(1, -dragX / SWIPE_REVEAL);

  return (
    <div className="notif-row-wrap">
      {dragX < 0 && (
        <button
          className="notif-row-delete-btn"
          aria-label="Delete notification"
          style={{ opacity: revealed }}
          onClick={() => {
            haptics.light();
            onDelete();
          }}
        >
          <Trash2 size={18} />
          <span>Delete</span>
        </button>
      )}
      <div
        role="button"
        tabIndex={0}
        className={`notif-row${urgent ? " notif-row-urgent" : ""}${dragging ? " notif-row-dragging" : ""}`}
        style={{ "--notif-swipe-x": `${dragX}px` } as React.CSSProperties}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onClick={() => {
          if (dragX !== 0) return; // mid-swipe tap shouldn't also open it
          onOpen();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onOpen();
        }}
      >
        {(() => {
          const visual = (
            <NotificationLeadingVisual metadata={metadata} fallbackIcon={icon} fallbackBg={iconBg} />
          );
          // The leading visual carries its own .notif-row-icon wrapper (so a
          // photo/avatar can override sizing/shape); the plain-icon fallback
          // path needs the unread dot layered on top, which only makes sense
          // when we're rendering our own wrapper here.
          if (metadata?.imageUrl || metadata?.avatarUrl || metadata?.emoji) {
            return (
              <div style={{ position: "relative", flexShrink: 0 }}>
                {visual}
                {unread && <span className="notif-unread-dot" aria-hidden="true" />}
              </div>
            );
          }
          return (
            <div className="notif-row-icon" style={{ background: iconBg }}>
              {icon}
              {unread && <span className="notif-unread-dot" aria-hidden="true" />}
            </div>
          );
        })()}
        <div className="notif-row-body">
          <div className="notif-row-top">
            <span className={`notif-row-title${unread ? " unread" : ""}`}>{title}</span>
            <span className="notif-row-time-slot">
              <span className="notif-row-time">{time}</span>
              <button
                className="notif-row-quick-delete"
                aria-label="Delete notification"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                onKeyDown={(e) => {
                  // Prevent Enter/Space here from bubbling to the row's own
                  // onKeyDown (which would also fire onOpen — the row is a
                  // div[role=button], so this nested <button>'s keydown
                  // otherwise bubbles right into it).
                  e.stopPropagation();
                }}
              >
                <Trash2 size={15} color={iconColor} />
              </button>
            </span>
          </div>
          <p className="notif-row-preview clamp-2">{preview}</p>
          <NotificationSupportingLine metadata={metadata} />
        </div>
      </div>
    </div>
  );
}
