import { useEffect, useState } from "react";
import { Navigate, Outlet, useParams } from "react-router-dom";
import { useApp } from "@/store";
import { Skeleton } from "@/components/states";

/**
 * Wraps every /provider/:id/manage* route — the provider-side counterpart to
 * BusinessAccessGuard. Providers have no delegation system (only businesses
 * have business_access_sessions), so this is just an ownedProviderId check,
 * bounded-waited against ownedEntitiesLoaded so a reopening owner isn't
 * bounced out before that array has hydrated. No RPC, so there's no
 * transient-network-error case to distinguish — a mismatch here really does
 * mean "not yours".
 */
export default function ProviderAccessGuard() {
  const { id = "" } = useParams();
  const { ownedProviderId, ownedEntitiesLoaded, setContext, showToast } = useApp();
  const isOwner = ownedProviderId === id;

  const [waitedEnough, setWaitedEnough] = useState(false);
  useEffect(() => {
    if (ownedEntitiesLoaded) return;
    const timer = window.setTimeout(() => setWaitedEnough(true), 2500);
    return () => window.clearTimeout(timer);
  }, [ownedEntitiesLoaded]);

  if (isOwner) {
    return <Outlet />;
  }

  if (!ownedEntitiesLoaded && !waitedEnough) {
    return (
      <div className="screen page-pad" style={{ paddingTop: "calc(20px + var(--safe-area-top))" }}>
        <Skeleton h={40} mb={16} />
        <Skeleton h={120} mb={12} />
        <Skeleton h={120} />
      </div>
    );
  }

  setContext({ type: "customer", id: null, name: "" });
  showToast("You don't have access to that provider profile");
  return <Navigate to="/home" replace />;
}
