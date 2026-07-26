import type { ReactNode } from "react";
import { MapPin, Shield } from "@/components/Icons";

const DEFAULT_BODY = (
  <>
    STRYT collects your precise location <strong>even when the app is closed or not in use</strong>{" "}
    so My People can follow your live share on a map until you stop sharing.
  </>
);
const DEFAULT_NOTICE =
  "Location is shared only with emergency contacts you choose. A persistent notification stays visible while sharing. Stop anytime in the app or from that notification.";

/**
 * Play / Apple prominent disclosure shown BEFORE the system location
 * permission dialog when starting a share/run that needs background location.
 * Required when declaring ACCESS_BACKGROUND_LOCATION / Always location.
 * Reused as-is by delivery (accepted stop routes) — same OS-level consent,
 * different audience, so the copy is overridable per caller.
 */
export default function BackgroundLocationDisclosure({
  onAccept,
  onDecline,
  body = DEFAULT_BODY,
  noticeBody = DEFAULT_NOTICE,
}: {
  onAccept: () => void;
  onDecline: () => void;
  /** Main disclosure copy — override for non-live-share callers (e.g. delivery). */
  body?: ReactNode;
  /** Copy inside the reassurance strip below the main disclosure text. */
  noticeBody?: ReactNode;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: 16,
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bg-loc-title"
    >
      <div
        className="card col gap-14"
        style={{
          width: "100%",
          maxWidth: 440,
          padding: 20,
          background: "var(--ink-50)",
          borderRadius: 20,
          boxShadow: "var(--shadow-lg)",
          marginBottom: "max(8px, env(safe-area-inset-bottom))",
        }}
      >
        <div className="row gap-12" style={{ alignItems: "flex-start" }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: "var(--brand-50)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <MapPin size={22} color="var(--brand-600)" />
          </div>
          <div className="grow">
            <h2 id="bg-loc-title" className="bold" style={{ fontSize: 18, margin: 0 }}>
              Allow location in the background?
            </h2>
            <p className="tiny muted" style={{ marginTop: 6, lineHeight: 1.5 }}>
              {body}
            </p>
          </div>
        </div>

        <div
          className="row gap-8"
          style={{
            padding: 12,
            borderRadius: 12,
            background: "var(--brand-50)",
            border: "1px solid var(--brand-100)",
            alignItems: "flex-start",
          }}
        >
          <span style={{ flexShrink: 0, marginTop: 2, display: "inline-flex" }}>
            <Shield size={16} color="var(--brand-600)" />
          </span>
          <p className="tiny" style={{ margin: 0, color: "var(--brand-800)", lineHeight: 1.45 }}>
            {noticeBody}
          </p>
        </div>

        <div className="col gap-8">
          <button className="btn btn-primary btn-block" onClick={onAccept} style={{ padding: 14, fontWeight: 700 }}>
            Continue
          </button>
          <button className="btn btn-outline btn-block" onClick={onDecline} style={{ padding: 12 }}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
