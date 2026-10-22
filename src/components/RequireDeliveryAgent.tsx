import { Navigate, Outlet } from "react-router-dom";
import { useApp } from "@/store";
import { useQuery } from "@/hooks/useApi";
import { businessAccessService } from "@/services";
import { deliveryService } from "@/services/engagement/deliveryService";
import { DELIVERY_AGENT_ENABLED } from "@/lib/features";
import RouteFallback from "@/components/RouteFallback";

// Per user, so someone else signing in on the same tab is not carried in by the previous rider's admission.
const admittedKey = (userId: string) => `stryt_delivery_console_admitted:${userId}`;
function rememberAdmitted(userId: string) {
  try { sessionStorage.setItem(admittedKey(userId), "1"); } catch { /* private mode: falls back to the old behaviour */ }
}
function wasAdmitted(userId: string): boolean {
  try { return sessionStorage.getItem(admittedKey(userId)) === "1"; } catch { return false; }
}

/**
 * Gate for the /delivery console. Users with the `delivery` scope OR any
 * active assigned delivery may enter.
 */
export default function RequireDeliveryAgent() {
  const { user } = useApp();
  const { data: sessions, loading: sessionsLoading } = useQuery(
    () => businessAccessService.mySessions(),
    [user.id],
    `business-access:my-sessions:${user.id}`
  );
  const { data: activeCount, loading: countLoading } = useQuery(
    async () => (DELIVERY_AGENT_ENABLED ? deliveryService.countMyActiveDeliveries() : 0),
    [user.id],
    `delivery:active-count:${user.id}`
  );

  if (!DELIVERY_AGENT_ENABLED) return <Navigate to="/home" replace />;
  if (sessionsLoading || countLoading) return <RouteFallback />;

  const hasDeliveryScope = (sessions ?? []).some(
    (s) => s.status === "ACTIVE" && (s.scopes ?? []).includes("delivery" as any),
  );
  const hasActiveAssignment = (activeCount ?? 0) > 0;

  // Once let in this session, stay in: finishing the last delivery used to drop the active count to zero and bounce the
  // rider out before they saw it complete (R11). A fresh session still needs the scope or an assignment.
  const earned = hasDeliveryScope || hasActiveAssignment;
  if (earned) rememberAdmitted(user.id);
  if (!earned && !wasAdmitted(user.id)) return <Navigate to="/home" replace />;

  return <Outlet />;
}
