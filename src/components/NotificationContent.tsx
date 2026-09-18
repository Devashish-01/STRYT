import type { CSSProperties, ReactNode } from "react";
import type { NotificationMetadata, NotificationTone } from "@/types";
import { toneColor, toneBg } from "@/lib/notificationTone";
import { SafeImg } from "@/components/common";
import { inr } from "@/lib/format";
import { initialsOf } from "@/lib/notificationCard";

/** Small rounded status pill — "Confirmed", "Rejected", "Pending", etc.
 *  Reuses the app's tone→color mapping rather than a new color system. */
export function StatusPill({ label, tone, style }: { label: string; tone?: NotificationTone; style?: CSSProperties }) {
  return (
    <span
      className="notif-pill"
      style={{ color: toneColor(tone), background: toneBg(tone), ...style }}
    >
      {label}
    </span>
  );
}

/**
 * The round leading picture every card shares: the person's photo; without one, their initials; without a name,
 * the card's own icon on a colored tile. `badge` is the small type icon in the corner (a heart for a like, a speech
 * bubble for a comment), so the picture says who and the badge says what.
 */
export function NotificationAvatar({
  src,
  name,
  icon,
  iconBg,
  badge,
  badgeBg,
}: {
  src?: string | null;
  name?: string | null;
  /** Shown when there is neither a photo nor a name. */
  icon?: ReactNode;
  iconBg?: string;
  badge?: ReactNode;
  badgeBg?: string;
}) {
  const initials = initialsOf(name);
  return (
    <div className="notif-avatar">
      {src ? (
        <SafeImg src={src} variant="avatar" className="notif-avatar-img" />
      ) : initials ? (
        <span className="notif-avatar-initials" aria-hidden="true">{initials}</span>
      ) : (
        <span className="notif-avatar-icon" style={{ background: iconBg }}>{icon}</span>
      )}
      {badge && (src || initials) && (
        <span className="notif-corner-badge" style={{ background: badgeBg }} aria-hidden="true">
          {badge}
        </span>
      )}
    </div>
  );
}

/** A ₹ amount rendered as a small receipt-style line — tabular-nums so a
 *  column of amounts (if ever shown side by side) lines up like Wallet. */
export function AmountLine({ amount, label }: { amount?: number; label?: string }) {
  if (amount == null) return null;
  return (
    <span className="notif-amount">
      {label && <span className="notif-amount-label">{label}</span>}
      <span className="notif-amount-value tabular-nums">{inr(amount)}</span>
    </span>
  );
}

/** Group-buy / "me too" progress — a thin filled bar, same visual language
 *  as RatingBars (common.tsx) but horizontal-single, not a distribution. */
export function ProgressLine({ current, target }: { current?: number; target?: number }) {
  if (current == null || target == null || target <= 0) return null;
  const pct = Math.min(100, Math.round((current / target) * 100));
  return (
    <div className="notif-progress">
      <div className="notif-progress-track">
        <div className="notif-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="notif-progress-label tabular-nums">{current}/{target}</span>
    </div>
  );
}

/**
 * The per-type "supporting line" rendered under a notification's title —
 * one of five archetypes, chosen from whichever metadata fields are present
 * rather than the notification `type` itself, so the same visual vocabulary
 * naturally covers types added later. Every branch degrades to nothing when
 * its fields are absent (older rows, or a type not yet enriched) — the
 * caller's plain body text is always shown above/alongside this regardless.
 */
export function NotificationSupportingLine({ metadata }: { metadata?: NotificationMetadata | null }): ReactNode {
  if (!metadata) return null;
  const { amount, amountLabel, statusPill, tone, reason, progressCurrent, progressTarget, category } = metadata;

  if (progressCurrent != null && progressTarget != null) {
    return <ProgressLine current={progressCurrent} target={progressTarget} />;
  }

  if (reason) {
    return <p className="notif-reason">{reason}</p>;
  }

  if (amount != null || statusPill || category) {
    return (
      <span className="notif-supporting-row">
        <AmountLine amount={amount} label={amountLabel} />
        {category && <span className="notif-category-chip">{category}</span>}
        {statusPill && <StatusPill label={statusPill} tone={tone} />}
      </span>
    );
  }

  return null;
}

/**
 * The leading visual for a notification row — a circular avatar when
 * `avatarUrl`/`emoji` is present, otherwise the caller's own type-colored
 * icon tile (unchanged Phase-1 behavior). A rectangular `imageUrl` (a
 * listing cover, a story frame) takes priority when present, rendered as a
 * small rounded thumbnail instead of a circle — the Listing/Discovery
 * archetype from the design.
 */
export function NotificationLeadingVisual({
  metadata,
  fallbackIcon,
  fallbackBg,
}: {
  metadata?: NotificationMetadata | null;
  fallbackIcon: ReactNode;
  fallbackBg: string;
}): ReactNode {
  if (metadata?.imageUrl) {
    return (
      <div className="notif-row-icon notif-row-thumb">
        <SafeImg src={metadata.imageUrl} variant="photo" className="notif-thumb-img" />
      </div>
    );
  }
  if (metadata?.avatarUrl) {
    return (
      <div className="notif-row-icon notif-row-avatar-wrap">
        <SafeImg src={metadata.avatarUrl} variant="avatar" className="notif-avatar-img" />
      </div>
    );
  }
  if (metadata?.emoji) {
    return (
      <div className="notif-row-icon" style={{ background: fallbackBg, fontSize: 20 }}>
        {metadata.emoji}
      </div>
    );
  }
  return (
    <div className="notif-row-icon" style={{ background: fallbackBg }}>
      {fallbackIcon}
    </div>
  );
}
