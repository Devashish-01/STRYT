import { AlertTriangle } from "@/components/Icons";
import type { AppointmentRecord } from "@/types";

/** Cancellation attribution note, phrased from the given viewpoint. Shared
 *  across the customer and both owner consoles. */
export function CancelAttributionNote({ apt, viewpoint }: { apt: AppointmentRecord; viewpoint: "OWNER" | "CUSTOMER" }) {
  if (apt.status === "REJECTED") {
    return (
      <div className="card row gap-10 center-v" style={{ padding: 10, background: "var(--red-50)", border: "1px solid var(--red-100)", borderRadius: 10 }}>
        <AlertTriangle size={16} color="var(--red-600)" style={{ flexShrink: 0 }} />
        <div>
          <div className="bold tiny" style={{ color: "var(--red-600)" }}>{viewpoint === "OWNER" ? "You declined this booking" : `Declined by ${apt.targetName}`}</div>
          {apt.responseNote ? (
            <div className="tiny" style={{ color: "var(--red-600)", marginTop: 1, fontStyle: "italic" }}>Reason: "{apt.responseNote}"</div>
          ) : (
            <div className="tiny" style={{ color: "var(--red-600)", marginTop: 1 }}>No specific reason was provided.</div>
          )}
        </div>
      </div>
    );
  }
  if (apt.status !== "CANCELLED") return null;

  const who = apt.cancelledBy;
  const title = viewpoint === "OWNER"
    ? (who === "CUSTOMER" ? "Cancelled by customer" : who === "SYSTEM" ? "Auto-cancelled (you didn't respond in time)" : "Cancelled by you")
    : (who === "CUSTOMER" ? "Cancelled by you" : who === "SYSTEM" ? `Auto-cancelled — ${apt.targetName} didn't respond in time` : `Cancelled by ${apt.targetName}`);

  return (
    <div className="card row gap-10 center-v" style={{ padding: 10, background: "var(--orange-50)", border: "1px solid var(--orange-100)", borderRadius: 10 }}>
      <AlertTriangle size={16} color="var(--orange-500)" style={{ flexShrink: 0 }} />
      <div>
        <div className="bold tiny" style={{ color: "var(--orange-500)" }}>{title}</div>
        {apt.responseNote ? (
          <div className="tiny" style={{ color: "var(--orange-500)", marginTop: 1, fontStyle: "italic" }}>Reason: "{apt.responseNote}"</div>
        ) : (
          <div className="tiny" style={{ color: "var(--orange-500)", marginTop: 1 }}>No reason was provided.</div>
        )}
      </div>
    </div>
  );
}
