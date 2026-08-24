import { Navigate, Outlet } from "react-router-dom";
import { useApp } from "@/store";
import { useQuery } from "@/hooks/useApi";
import { businessAccessService } from "@/services";
import { deliveryService } from "@/services/engagement/deliveryService";
import { DELIVERY_AGENT_ENABLED } from "@/lib/features";
import RouteFallback from "@/components/RouteFallback";

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

  if (!hasDeliveryScope && !hasActiveAssignment) return <Navigate to="/home" replace />;

  return <Outlet />;
}
