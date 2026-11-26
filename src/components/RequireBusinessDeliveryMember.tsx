import { useEffect } from "react";
import { Navigate, Outlet, useParams } from "react-router-dom";
import { useBusinessAccess } from "@/lib/businessAccess";
import { useApp } from "@/store";
import { DELIVERY_AGENT_ENABLED } from "@/lib/features";
import { resolveBusinessToolVisibility } from "@/lib/businessTools";
import { Skeleton } from "@/components/states";

/**
 * My-deliveries view inside the business console — for agents assigned to a
 * run even when they lack the standing `delivery` scope grant.
 */
export default function RequireBusinessDeliveryMember() {
  const { id = "" } = useParams();
  const access = useBusinessAccess();
  const { showToast } = useApp();
  const base = `/business/${id}/manage`;
  // hasScope("delivery") is a raw DB read with no flag awareness of its own —
  // without the AND, a leftover scope grant from before the flag was
  // switched off would still get someone in here.
  const allowed = resolveBusinessToolVisibility(access, DELIVERY_AGENT_ENABLED).myDeliveries;
  const checking = !allowed && access.checkingDeliveries;

  useEffect(() => {
    if (!allowed && !checking) showToast("You don't have any deliveries here");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, checking]);

  if (checking) return <div className="screen page-pad"><Skeleton h={120} /></div>;
  if (!allowed) return <Navigate to={base} replace />;
  return <Outlet />;
}
