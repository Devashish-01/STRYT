import { Bell, Calendar, MessageCircle, Users, X, Check } from "@/components/Icons";
import { haptics } from "@/lib/haptics";

/**
 * Shown once, the first time a signed-in session on a native install would
 * otherwise trigger the OS notification permission dialog cold.
 *
 * registerPush (src/lib/pushNotifications.ts) used to call
 * PushNotifications.requestPermissions() directly on every sign-in with no
 * preceding explanation — an unexplained system dialog right after signing
 * in (flow-completeness audit, workflow 22). Mirrors LiveShareExplainer's
 * shape: explain what the permission is actually for before the OS asks,
 * once, then never again.
 */

const ROWS = [
  {
    icon: Calendar,
    title: "Bookings & deals",
    body: "When a business accepts, confirms payment, or a bulk-buy campaign you joined is closing.",
  },
  {
    icon: MessageCircle,
    title: "Messages",
    body: "New chat messages and replies to your questions or reviews.",
  },
  {
    icon: Users,
    title: "Community & your street",
    body: "Replies, mentions, and things happening nearby you've asked to hear about.",
  },
];

export default function NotificationPermissionExplainer({
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
                background: "var(--brand-100)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <Bell size={17} color="var(--brand-700)" />
            </span>
            <h3 className="bold h2">Turn on notifications?</h3>
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
          Here's exactly what STRYT sends you.
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
          <Check size={16} /> Turn on
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
