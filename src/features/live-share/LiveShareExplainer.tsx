import { Users, MapPin, Eye, X, Check } from "@/components/Icons";
import { haptics } from "@/lib/haptics";

/**
 * Shown the first time someone taps My People to share their live location.
 *
 * The toggle was one tap from broadcasting ("no confirmation sheet — press and
 * go"). There WAS a sheet in the path, but it's `BackgroundLocationDisclosure`
 * — the Android background-location permissions notice required for the Play
 * Store. That explains a *permission*; it never said what the feature is, who
 * receives the location, or how to stop. And it's suppressed after the first
 * accept, so returning users got nothing at all.
 *
 * Sharing your real-time position is the highest-consequence thing a customer
 * can switch on in this app, so it gets an explanation before it starts — once,
 * then never again.
 */

const ROWS = [
  {
    icon: Users,
    title: "Only your People see it",
    body: "The emergency contacts you've added — nobody else, and never other STRYT users or businesses.",
  },
  {
    icon: MapPin,
    title: "Live until you stop it",
    body: "Your position updates as you move, in the background, with a permanent notification while it's on.",
  },
  {
    icon: Eye,
    title: "Stop anytime, one tap",
    body: "Tap the same button again to stop instantly. Hold it to manage who your People are.",
  },
];

export default function LiveShareExplainer({
  onConfirm, onClose,
}: {
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />

        <div className="row between center-v" style={{ marginBottom: 2 }}>
          <div className="row gap-8 center-v">
            <span
              style={{
                width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                /* Amber/accent family — matches the toggle's own sharing tint
                   (--accent-500) so the sheet reads as the same feature. */
                background: "var(--amber-100)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <Users size={17} color="var(--accent-600)" />
            </span>
            <h3 className="bold h2">Share live location?</h3>
          </div>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
            style={{ background: "var(--ink-100)", flexShrink: 0 }}
          >
            <X size={16} />
          </button>
        </div>

        <p className="small muted" style={{ marginBottom: 16 }}>
          Here's exactly what happens when you turn this on.
        </p>

        <div className="col gap-14" style={{ marginBottom: 18 }}>
          {ROWS.map((r) => {
            const Icon = r.icon;
            return (
              <div key={r.title} className="row gap-11" style={{ alignItems: "flex-start" }}>
                <span
                  style={{
                    width: 30, height: 30, borderRadius: 9, flexShrink: 0, marginTop: 1,
                    background: "var(--ink-50)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Icon size={15} color="var(--ink-600)" />
                </span>
                <div className="col" style={{ gap: 2, minWidth: 0 }}>
                  <span className="semi small">{r.title}</span>
                  <span className="tiny muted">{r.body}</span>
                </div>
              </div>
            );
          })}
        </div>

        <button
          className="btn btn-primary btn-block row gap-8 center"
          style={{ height: 50, fontSize: 16, fontWeight: 700 }}
          onClick={() => { haptics.medium(); onConfirm(); }}
        >
          <Check size={16} /> Start sharing
        </button>
        <button
          className="btn btn-block"
          style={{ marginTop: 8, height: 44, background: "transparent", color: "var(--ink-600)" }}
          onClick={onClose}
        >
          Not now
        </button>

        <p className="tiny muted" style={{ textAlign: "center", marginTop: 12 }}>
          You'll only see this once.
        </p>
      </div>
    </div>
  );
}
