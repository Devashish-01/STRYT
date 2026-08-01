import { useEffect } from "react";
import { Navigate, Outlet, useParams } from "react-router-dom";
import { useBusinessAccess } from "@/components/BusinessAccessGuard";
import { useApp } from "@/store";

/**
 * My-deliveries view inside the business console — for agents assigned to a
 * run even when they lack the standing `delivery` scope grant.
 */
export default function RequireBusinessDeliveryMember() {
  const { id = "" } = useParams();
  const { hasScope, hasActiveDeliveries } = useBusinessAccess();
  const { showToast } = useApp();
  const base = `/business/${id}/manage`;
  const allowed = hasActiveDeliveries || hasScope("delivery");

  useEffect(() => {
    if (!allowed) showToast("You don't have any deliveries here");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  if (!allowed) return <Navigate to={base} replace />;
  return <Outlet />;
}
