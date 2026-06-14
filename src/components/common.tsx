import { useNavigate } from "react-router-dom";
import { ArrowLeft, Star } from "lucide-react";
import { useState, type ReactNode, type CSSProperties } from "react";

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
  const color = value >= 4 ? "#16a34a" : value >= 3 ? "#f59e0b" : "#ef4444";
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
    <span className="row gap-4" style={{ color: "#f59e0b" }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          fill={i <= Math.round(value) ? "#f59e0b" : "none"}
          strokeWidth={i <= Math.round(value) ? 0 : 1.5}
          color={i <= Math.round(value) ? "#f59e0b" : "#cfcadd"}
        />
      ))}
    </span>
  );
}

export function EmptyState({
  emoji,
  title,
  text,
  action,
}: {
  emoji: string;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="col center fade-up" style={{ padding: "56px 28px", textAlign: "center", gap: 10 }}>
      <div style={{ fontSize: 54 }}>{emoji}</div>
      <h3 style={{ fontSize: 18, fontWeight: 800 }}>{title}</h3>
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
        border: `2px solid ${veg ? "#16a34a" : "#dc2626"}`,
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
          background: veg ? "#16a34a" : "#dc2626",
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
  onClick?: () => void;
}) {
  const fallback = variant === "avatar" ? FALLBACK_AVATAR : FALLBACK_IMG;
  const [errored, setErrored] = useState(false);
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
