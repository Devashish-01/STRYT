import { Navigate, Outlet } from "react-router-dom";
import { useApp } from "@/store";
import { useQuery } from "@/hooks/useApi";
import { businessAccessService } from "@/services";
import { DELIVERY_AGENT_ENABLED } from "@/lib/features";
import RouteFallback from "@/components/RouteFallback";

/**
 * Gate for the /delivery console. Only a user with an ACTIVE grant carrying the
 * `delivery` scope may enter; anyone else is bounced to /home. Mirrors
 * BusinessAccessGuard / ProviderAccessGuard so a revoked rider can't linger on
 * the delivery screens. Hard-off while the feature flag is disabled.
 */
export default function RequireDeliveryAgent() {
  const { user } = useApp();
  const { data: sessions, loading } = useQuery(
    () => businessAccessService.mySessions(),
    [user.id],
  );

  if (!DELIVERY_AGENT_ENABLED) return <Navigate to="/home" replace />;
  if (loading) return <RouteFallback />;

  const isAgent = (sessions ?? []).some(
    (s) => s.status === "ACTIVE" && (s.scopes ?? []).includes("delivery" as any),
  );
  if (!isAgent) return <Navigate to="/home" replace />;

  return <Outlet />;
}
