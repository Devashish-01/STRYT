import { useEffect } from "react";
import { Navigate, Outlet, useParams } from "react-router-dom";
import { useBusinessAccess } from "@/components/BusinessAccessGuard";
import { useApp } from "@/store";
import { DELIVERY_AGENT_ENABLED } from "@/lib/features";

/**
 * My-deliveries view inside the business console — for agents assigned to a
 * run even when they lack the standing `delivery` scope grant.
 */
export default function RequireBusinessDeliveryMember() {
  const { id = "" } = useParams();
  const { hasScope, hasActiveDeliveries } = useBusinessAccess();
  const { showToast } = useApp();
  const base = `/business/${id}/manage`;
  // hasScope("delivery") is a raw DB read with no flag awareness of its own —
  // without the AND, a leftover scope grant from before the flag was
  // switched off would still get someone in here.
  const allowed = DELIVERY_AGENT_ENABLED && (hasActiveDeliveries || hasScope("delivery"));

  useEffect(() => {
    if (!allowed) showToast("You don't have any deliveries here");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  if (!allowed) return <Navigate to={base} replace />;
  return <Outlet />;
}
