import { useNavigate } from "react-router-dom";
import { ArrowLeft, Star, RefreshCw } from "@/components/Icons";
import { useState, useEffect, type ReactNode, type CSSProperties, type MouseEventHandler } from "react";

/** Visual for `usePullToRefresh` — a self-sizing box that grows with the
 * pull gesture and naturally pushes the content below it down, so no
 * screen needs to transform its own content to make room. */
export function PullToRefreshIndicator({
  pullDistance,
  refreshing,
  threshold = 70,
}: {
  pullDistance: number;
  refreshing: boolean;
  threshold?: number;
}) {
  const height = refreshing ? 52 : pullDistance;
  if (height <= 0) return null;
  const ready = pullDistance >= threshold || refreshing;
  return (
    <div
      style={{
        height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        transition: refreshing ? "height 0.15s ease" : pullDistance === 0 ? "height 0.25s cubic-bezier(0.34,1.56,0.64,1)" : "none",
      }}
    >
      <RefreshCw
        size={20}
        color={ready ? "var(--brand-600)" : "var(--ink-400)"}
        className={refreshing ? "spin" : undefined}
        style={refreshing ? undefined : { transform: `rotate(${Math.min(pullDistance / threshold, 1) * 180}deg)` }}
      />
    </div>
  );
}

/** Drop-in replacement for a button's label while a submit is `pending` —
 * 3 dots pulsing in sequence instead of a spinner ring. Inherits `currentColor`
 * so it works inside btn-primary/btn-pink/btn-green/btn-outline alike. */
export function ButtonSpinner() {
  return (
    <span className="btn-spinner" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

export function AppBar({
  title,
  subtitle,
  right,
  onBack,
  transparent,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  onBack?: () => void;
  transparent?: boolean;
}) {
  const nav = useNavigate();
  return (
    <header
      className="appbar"
      style={transparent ? { background: "transparent", borderBottom: "none" } : undefined}
    >
      <button className="icon-btn" onClick={() => (onBack ? onBack() : nav(-1))} aria-label="Back">
        <ArrowLeft size={20} />
      </button>
      <div className="grow col" style={{ gap: 1, minWidth: 0 }}>
        {title && <div className="bold ellipsis" style={{ fontSize: 17 }}>{title}</div>}
        {subtitle && <div className="tiny muted ellipsis">{subtitle}</div>}
      </div>
      {right}
    </header>
  );
}

export function Rating({ value, size = 13 }: { value: number; size?: number }) {
  const color = value >= 4 ? "var(--green-500)" : value >= 3 ? "var(--amber-500)" : "var(--red-500)";
  return (
    <span
      className="stars"
      style={{
        background: color,
        color: "#fff",
        padding: "2px 7px",
        borderRadius: 7,
        fontSize: size,
        lineHeight: 1,
      }}
    >
      {value.toFixed(1)}
      <Star size={size - 2} fill="#fff" strokeWidth={0} />
    </span>
  );
}

export function StarRow({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="row gap-4" style={{ color: "var(--amber-500)" }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          fill={i <= Math.round(value) ? "var(--amber-500)" : "none"}
          strokeWidth={i <= Math.round(value) ? 0 : 1.5}
          color={i <= Math.round(value) ? "var(--amber-500)" : "var(--ink-300)"}
        />
      ))}
    </span>
  );
}

export function EmptyState({
  emoji,
  illustration,
  title,
  text,
  action,
}: {
  emoji: string;
  /** Optional on-brand SVG illustration (see src/components/illustrations.tsx) — when
   *  present it replaces the emoji. Kept optional so the long tail of rare/low-traffic
   *  empty states can keep using emoji without every call site needing an update. */
  illustration?: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="col center fade-up" style={{ padding: "56px 28px", textAlign: "center", gap: 10 }}>
      {illustration ?? <div style={{ fontSize: 54 }}>{emoji}</div>}
      <h3 className="h2">{title}</h3>
      <p className="muted small" style={{ maxWidth: 260, lineHeight: 1.5 }}>{text}</p>
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

export function Section({
  title,
  action,
  onAction,
  children,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  return (
    <section style={{ marginTop: 22 }}>
      <div className="section-head page-pad" style={{ paddingTop: 0, paddingBottom: 0 }}>
        <h3>{title}</h3>
        {action && (
          <button className="see-all" onClick={onAction}>
            {action}
          </button>
        )}
      </div>
      <div style={{ marginTop: 12 }}>{children}</div>
    </section>
  );
}

export function Pill({ children, tone = "gray" }: { children: ReactNode; tone?: string }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function VegDot({ veg }: { veg?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        width: 16,
        height: 16,
        border: `2px solid ${veg ? "var(--green-500)" : "var(--red-600)"}`,
        borderRadius: 4,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: veg ? "var(--green-500)" : "var(--red-600)",
        }}
      />
    </span>
  );
}

export function inr(n?: number) {
  if (n == null) return "";
  return "₹" + n.toLocaleString("en-IN");
}

// Image with graceful fallback. Real data has missing/broken image URLs;
// this avoids broken-image icons across the app.
const FALLBACK_IMG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><rect width='100%' height='100%' fill='%23ece8f5'/><text x='50%' y='50%' font-size='48' text-anchor='middle' dominant-baseline='central' fill='%23b5add0'>🏪</text></svg>`
  );
const FALLBACK_AVATAR =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><rect width='100%' height='100%' fill='%23ece8f5'/><text x='50%' y='50%' font-size='48' text-anchor='middle' dominant-baseline='central' fill='%23b5add0'>👤</text></svg>`
  );

/** 5→1 star distribution bars, computed from a loaded reviews array. */
export function RatingBars({ ratings }: { ratings: number[] }) {
  if (ratings.length === 0) return null;
  const counts = [5, 4, 3, 2, 1].map((s) => ratings.filter((r) => Math.round(r) === s).length);
  const max = Math.max(...counts, 1);
  return (
    <div className="col gap-4" style={{ margin: "10px 0" }}>
      {counts.map((c, i) => (
        <div key={i} className="row gap-8" style={{ alignItems: "center" }}>
          <span className="tiny muted" style={{ width: 22, textAlign: "right" }}>{5 - i}★</span>
          <div style={{ flex: 1, height: 6, background: "var(--ink-100)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${(c / max) * 100}%`, height: "100%", background: "var(--amber-500)", borderRadius: 999 }} />
          </div>
          <span className="tiny muted" style={{ width: 24 }}>{c}</span>
        </div>
      ))}
    </div>
  );
}

export function SafeImg({
  src,
  alt = "",
  className,
  style,
  variant = "photo",
  onClick,
}: {
  src?: string;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  variant?: "photo" | "avatar";
  onClick?: MouseEventHandler<HTMLImageElement>;
}) {
  const fallback = variant === "avatar" ? FALLBACK_AVATAR : FALLBACK_IMG;
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setErrored(false);
  }, [src]);

  return (
    <img
      src={!src || errored ? fallback : src}
      alt={alt}
      className={className}
      style={style}
      loading="lazy"
      onClick={onClick}
      onError={() => setErrored(true)}
    />
  );
}
