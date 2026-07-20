import type { ReactNode } from "react";
import type { NotificationMetadata, NotificationTone } from "@/types";
import { SafeImg, inr } from "@/components/common";

/** Maps a semantic NotificationTone to the app's existing color tokens —
 *  the one place a tone becomes an actual hex/var, so every archetype below
 *  stays token-driven without repeating this switch. */
export function toneColor(tone?: NotificationTone): string {
  switch (tone) {
    case "success": return "var(--green-600)";
    case "danger": return "var(--red-600)";
    case "warning": return "var(--amber-700)";
    case "info": return "var(--blue-500)";
    case "brand": return "var(--brand-700)";
    default: return "var(--ink-600)";
  }
}
function toneBg(tone?: NotificationTone): string {
  switch (tone) {
    case "success": return "var(--green-100)";
    case "danger": return "var(--red-100)";
    case "warning": return "var(--amber-100)";
    case "info": return "var(--blue-100)";
    case "brand": return "var(--brand-100)";
    default: return "var(--ink-100)";
  }
}

/** Small rounded status pill — "Confirmed", "Rejected", "Pending", etc.
 *  Reuses the app's tone→color mapping rather than a new color system. */
export function StatusPill({ label, tone }: { label: string; tone?: NotificationTone }) {
  return (
    <span
      className="notif-pill"
      style={{ color: toneColor(tone), background: toneBg(tone) }}
    >
      {label}
    </span>
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
