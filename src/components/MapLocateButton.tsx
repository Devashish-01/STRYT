import { useEffect, useRef, useState } from "react";
import { Loader, Navigation, Target } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";
import {
  createTapPairHandler,
  getLocationPrecisionState,
  type PrecisionState,
} from "@/lib/mapLocate";

export interface MapLocateButtonProps {
  /** Direct 1-tap calibrated locate handler (preferred — replaces hidden double-tap). */
  onLocate?: () => void | Promise<void>;
  /** Legacy 1-tap handler, used if `onLocate` is omitted. */
  onSingleTap?: () => void | Promise<void>;
  /** Legacy double-tap handler, used if `onLocate` is omitted. */
  onDoubleTap?: () => void | Promise<void>;
  /** Shows an active GPS calibration spinner/ring while locking onto the sharpest fix. */
  busy?: boolean;
  icon?: "target" | "navigation";
  compact?: boolean;
  className?: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
  title?: string;
}

/**
 * Shared map locate button used across Explore and Location Picker.
 * One tap requests Precise GPS (if needed) and calibrates to the sharpest coordinate,
 * showing a clear spinning state while locking and a status dot for permission granularity.
 */
export function MapLocateButton({
  onLocate,
  onSingleTap,
  onDoubleTap,
  busy = false,
  icon = "target",
  compact = false,
  className = "",
  style,
  ariaLabel,
  title,
}: MapLocateButtonProps) {
  const { t } = useI18n();
  const [precision, setPrecision] = useState<PrecisionState>("prompt");
  const [internalBusy, setInternalBusy] = useState(false);

  const locateRef = useRef(onLocate);
  const singleRef = useRef(onSingleTap);
  const doubleRef = useRef(onDoubleTap);
  locateRef.current = onLocate;
  singleRef.current = onSingleTap;
  doubleRef.current = onDoubleTap;

  const refreshPrecision = () => {
    void getLocationPrecisionState().then(setPrecision);
  };

  useEffect(() => {
    let active = true;
    void getLocationPrecisionState().then((s) => {
      if (active) setPrecision(s);
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshPrecision();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const tapPairRef = useRef(
    createTapPairHandler(
      () => {
        setInternalBusy(true);
        void Promise.resolve(singleRef.current?.()).finally(() => {
          setInternalBusy(false);
          refreshPrecision();
        });
      },
      () => {
        setInternalBusy(true);
        void Promise.resolve(doubleRef.current?.()).finally(() => {
          setInternalBusy(false);
          refreshPrecision();
        });
      },
    ),
  );

  const handlePress = () => {
    if (isBusy) return;
    if (locateRef.current) {
      setInternalBusy(true);
      void Promise.resolve(locateRef.current()).finally(() => {
        setInternalBusy(false);
        refreshPrecision();
      });
      return;
    }
    tapPairRef.current();
  };

  const isBusy = busy || internalBusy;
  const sizePx = compact ? 34 : 44;
  const iconSize = compact ? 15 : 19;
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
        handlePress();
      }}
      disabled={isBusy}
      className={`${className}${isBusy ? " is-calibrating" : ""}`.trim()}
      aria-label={ariaLabel || hint}
      aria-busy={isBusy}
      title={hint}
      style={{
        position: "relative",
        width: sizePx,
        height: sizePx,
        borderRadius: compact ? 10 : "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--surface)",
        color: isBusy || precision === "precise" ? "var(--brand-600)" : "var(--ink-700)",
        boxShadow: "0 4px 14px rgba(0,0,0,0.14)",
        border: "1px solid var(--line)",
        cursor: isBusy ? "wait" : "pointer",
        transition: "transform 0.14s ease, color 0.14s ease",
        ...style,
      }}
    >
      {isBusy ? (
        <Loader size={iconSize} className="spin" />
      ) : icon === "navigation" ? (
        <Navigation size={iconSize} />
      ) : (
        <Target size={iconSize} />
      )}
      {dotColor && !isBusy && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: compact ? 4 : 7,
            right: compact ? 4 : 7,
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: dotColor,
            border: "1.5px solid var(--surface)",
          }}
        />
      )}
    </button>
  );
}
