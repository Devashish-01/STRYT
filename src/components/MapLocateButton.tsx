import { useEffect, useRef, useState } from "react";
import { Navigation, Target } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";
import {
  createTapPairHandler,
  getLocationPrecisionState,
  type PrecisionState,
} from "@/lib/mapLocate";

export interface MapLocateButtonProps {
  /** Fired on single tap: recognize current location / recenter cleanly. */
  onSingleTap: () => void | Promise<void>;
  /** Fired on double tap: trigger system precise-location prompt / GPS refresh. */
  onDoubleTap: () => void | Promise<void>;
  icon?: "target" | "navigation";
  compact?: boolean;
  className?: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
  title?: string;
}

/**
 * Shared map locate button used across Explore, Delivery Live Map, and Location Picker:
 * - Single tap: recognizes/centers on current location without nagging prompts.
 * - Double tap: requests system precise-location permission / fresh GPS lock.
 */
export function MapLocateButton({
  onSingleTap,
  onDoubleTap,
  icon = "target",
  compact = false,
  className = "",
  style,
  ariaLabel,
  title,
}: MapLocateButtonProps) {
  const { t } = useI18n();
  const [precision, setPrecision] = useState<PrecisionState>("prompt");
  const singleRef = useRef(onSingleTap);
  const doubleRef = useRef(onDoubleTap);
  singleRef.current = onSingleTap;
  doubleRef.current = onDoubleTap;

  useEffect(() => {
    let active = true;
    void getLocationPrecisionState().then((s) => {
      if (active) setPrecision(s);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleClick = useRef(
    createTapPairHandler(
      () => {
        void Promise.resolve(singleRef.current()).finally(() => {
          void getLocationPrecisionState().then(setPrecision);
        });
      },
      () => {
        void Promise.resolve(doubleRef.current()).finally(() => {
          void getLocationPrecisionState().then(setPrecision);
        });
      }
    )
  ).current;

  const sizePx = compact ? 32 : 38;
  const iconSize = compact ? 15 : 18;
  const hint = title || t("map_locate_hint");
  const dotColor =
    precision === "precise"
      ? "var(--green-500)"
      : precision === "coarse" || precision === "denied"
      ? "var(--amber-500)"
      : null;

  return (
    <button
      type="button"
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        handleClick();
      }}
      className={className}
      aria-label={ariaLabel || hint}
      title={hint}
      style={{
        position: "relative",
        width: sizePx,
        height: sizePx,
        borderRadius: compact ? 8 : 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--surface)",
        color: precision === "precise" ? "var(--brand-600)" : "var(--ink-700)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.14)",
        border: "1px solid var(--line)",
        cursor: "pointer",
        ...style,
      }}
    >
      {icon === "navigation" ? <Navigation size={iconSize} /> : <Target size={iconSize} />}
      {dotColor && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: dotColor,
            border: "1.5px solid var(--surface)",
          }}
        />
      )}
    </button>
  );
}
