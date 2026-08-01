import { useBusinessAccess } from "@/components/BusinessAccessGuard";

/**
 * Shown at the top of every business-manage screen for delegates and scoped
 * team members — makes it obvious you're not in the owner's console.
 */
export default function TeamConsoleBanner() {
  const { consoleMode, scopeLabel, hasActiveDeliveries } = useBusinessAccess();

  if (consoleMode === "owner") return null;

  const isFull = consoleMode === "full_delegate";
  const title = isFull ? "Delegated access" : "Team member";
  const detail = isFull
    ? "You can run day-to-day operations — settings stay with the owner."
    : scopeLabel;

  return (
    <div
      className={`team-console-banner ${isFull ? "team-console-banner--full" : "team-console-banner--scoped"}`}
      role="status"
    >
      <div className="team-console-banner__title">{title}</div>
      <div className="team-console-banner__detail">{detail}</div>
      {hasActiveDeliveries && (
        <div className="team-console-banner__delivery">You have active deliveries for this business</div>
      )}
    </div>
  );
}
