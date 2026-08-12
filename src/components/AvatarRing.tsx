import type { CSSProperties, ReactNode } from "react";

/**
 * Wraps a circular avatar in the app's on-brand "story ring" gradient — the
 * same treatment PublicProfile.tsx already used for the Instagram/Snapchat-
 * style hero avatar. Takes children (a SafeImg, or a plain fallback div) so
 * every caller keeps full control of what's inside the ring.
 *
 * Children should fill the inner disc (`width/height: 100%`). An inner clip
 * wrapper is provided so photos stay circular even when this is rendered as
 * a <button> (UA button styles + global `img { max-width: 100% }` otherwise
 * collapse or spill the image).
 */
export default function AvatarRing({
  size = 92,
  ringPadding = 3,
  onClick,
  ariaLabel,
  disabled,
  style,
  children,
}: {
  size?: number;
  ringPadding?: number;
  onClick?: () => void;
  ariaLabel?: string;
  disabled?: boolean;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const ringStyle: CSSProperties = {
    position: "relative",
    display: "block",
    width: size,
    height: size,
    padding: ringPadding,
    borderRadius: "50%",
    background: "linear-gradient(135deg, var(--amber-500), var(--pink-500), var(--brand-500))",
    boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
    flexShrink: 0,
    overflow: "hidden",
    lineHeight: 0,
    boxSizing: "border-box",
    ...style,
  };

  const inner = (
    <span
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        borderRadius: "50%",
        overflow: "hidden",
        background: "var(--ink-100)",
      }}
    >
      {children}
    </span>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel}
        style={{
          ...ringStyle,
          border: "none",
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.7 : 1,
        }}
      >
        {inner}
      </button>
    );
  }

  return <div style={ringStyle}>{inner}</div>;
}
