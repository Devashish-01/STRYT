import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Navigate, Outlet, useParams } from "react-router-dom";
import { businessAccessService } from "@/services";
import { deliveryService } from "@/services/engagement/deliveryService";
import type { AccessLevel, Scope } from "@/services/marketplace/businessAccessService";
import { useApp } from "@/store";
import { Skeleton } from "@/components/states";
import { DELIVERY_AGENT_ENABLED } from "@/lib/features";
import { buildScopeLabel, resolveConsoleMode, type ConsoleMode } from "@/lib/teamConsole";

interface BusinessAccessValue {
  isOwner: boolean;
  accessLevel: AccessLevel;
  scopes: Scope[];
  hasScope: (scope: Scope) => boolean;
  consoleMode: ConsoleMode;
  scopeLabel: string;
  hasActiveDeliveries: boolean;
}

const FULL_ACCESS: BusinessAccessValue = {
  isOwner: true,
  accessLevel: "FULL",
  scopes: [],
  hasScope: () => true,
  consoleMode: "owner",
  scopeLabel: "",
  hasActiveDeliveries: false,
};

const BusinessAccessContext = createContext<BusinessAccessValue>(FULL_ACCESS);

/**
 * What can the current user do in THIS business's manage console — owner,
 * a FULL delegate, or a SCOPED team member (only the sections in `scopes`).
 */
export function useBusinessAccess() {
  return useContext(BusinessAccessContext);
}

/**
 * Wraps every /business/:id/manage* route. Re-validates access on entry and
 * publishes scope + console mode for child screens.
 */
export default function BusinessAccessGuard() {
  const { id = "" } = useParams();
  const { ownedBusinessIds, ownedEntitiesLoaded, setContext, showToast } = useApp();
  const isOwner = ownedBusinessIds.includes(id);

  const [status, setStatus] = useState<"checking" | "allowed" | "denied" | "retry">(isOwner ? "allowed" : "checking");
  const [attempt, setAttempt] = useState(0);
  const [waitedEnough, setWaitedEnough] = useState(false);
  const [scope, setScope] = useState<{ accessLevel: AccessLevel; scopes: Scope[] }>({ accessLevel: "FULL", scopes: [] });
  const [hasActiveDeliveries, setHasActiveDeliveries] = useState(false);

  useEffect(() => {
    if (ownedEntitiesLoaded) return;
    const timer = window.setTimeout(() => setWaitedEnough(true), 2500);
    return () => window.clearTimeout(timer);
  }, [ownedEntitiesLoaded]);

  useEffect(() => {
    if (isOwner) {
      setStatus("allowed");
      return;
    }
    if (!ownedEntitiesLoaded && !waitedEnough) return;
    let active = true;
    setStatus("checking");
    businessAccessService.checkAccess(id).then((result) => {
      if (!active) return;
      if (result === "ERROR") { setStatus("retry"); return; }
      if (result === "DENIED") { setStatus("denied"); return; }
      businessAccessService.myScope(id).then((s) => {
        if (!active) return;
        setScope(s);
        setStatus("allowed");
      });
    });
    return () => { active = false; };
  }, [id, isOwner, ownedEntitiesLoaded, waitedEnough, attempt]);

  useEffect(() => {
    if (status !== "allowed" || !DELIVERY_AGENT_ENABLED || !id) return;
    let active = true;
    deliveryService.countMyActiveDeliveries(id).then((count) => {
      if (active) setHasActiveDeliveries(count > 0);
    }).catch(() => {
      if (active) setHasActiveDeliveries(false);
    });
    return () => { active = false; };
  }, [status, id]);

  const value = useMemo((): BusinessAccessValue => {
    if (isOwner) return FULL_ACCESS;
    const hasScope = (s: Scope) => scope.accessLevel === "FULL" || scope.scopes.includes(s);
    return {
      isOwner: false,
      accessLevel: scope.accessLevel,
      scopes: scope.scopes,
      hasScope,
      consoleMode: resolveConsoleMode(false, scope.accessLevel),
      scopeLabel: buildScopeLabel(hasScope),
      hasActiveDeliveries,
    };
  }, [isOwner, scope, hasActiveDeliveries]);

  if (status === "checking") {
    return (
      <div className="screen page-pad" style={{ paddingTop: "calc(20px + var(--safe-area-top))" }}>
        <Skeleton h={40} mb={16} />
        <Skeleton h={120} mb={12} />
        <Skeleton h={120} />
      </div>
    );
  }

  if (status === "retry") {
    return (
      <div className="screen page-pad center-v center-h col gap-12" style={{ paddingTop: "calc(20px + var(--safe-area-top))", minHeight: "60vh", textAlign: "center" }}>
        <div className="semi">Couldn't verify your access</div>
        <div className="small muted">Check your connection and try again — nothing about your access has changed.</div>
        <button className="btn btn-primary" onClick={() => setAttempt((a) => a + 1)}>Retry</button>
      </div>
    );
  }

  if (status === "denied") {
    setContext({ type: "customer", id: null, name: "" });
    showToast("Your access to that business was revoked");
    return <Navigate to="/home" replace />;
  }

  return (
    <BusinessAccessContext.Provider value={value}>
      <Outlet />
    </BusinessAccessContext.Provider>
  );
}
