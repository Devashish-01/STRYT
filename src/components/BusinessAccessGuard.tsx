import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Navigate, Outlet, useParams, useNavigate } from "react-router-dom";
import { businessAccessService } from "@/services";
import { deliveryService } from "@/services/engagement/deliveryService";
import type { AccessLevel, Scope } from "@/services/marketplace/businessAccessService";
import { useApp } from "@/store";
import { getSupabase, hasSupabaseEnv } from "@/lib/supabaseClient";
import { Skeleton } from "@/components/states";
import { DELIVERY_AGENT_ENABLED } from "@/lib/features";
import { buildScopeLabel, resolveConsoleMode, type ConsoleMode } from "@/lib/teamConsole";
import { useI18n } from "@/lib/i18n";
import PinEntrySheet from "@/components/PinEntrySheet";
import { entityPasswordService } from "@/services/core/entityPasswordService";
import { useAdoptConsoleContext } from "@/hooks/useAdoptConsoleContext";

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

/**
 * The context default, used only when a component calls useBusinessAccess()
 * outside this guard's provider. It denies everything on purpose: the default
 * used to be FULL_ACCESS, which meant any such component — a screen mounted on
 * a route that forgot the guard, or one rendering during a route transition —
 * silently rendered as if the viewer owned the business.
 */
const NO_ACCESS: BusinessAccessValue = {
  isOwner: false,
  accessLevel: "SCOPED",
  scopes: [],
  hasScope: () => false,
  consoleMode: "team_member",
  scopeLabel: "",
  hasActiveDeliveries: false,
};

const BusinessAccessContext = createContext<BusinessAccessValue>(NO_ACCESS);

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
  const nav = useNavigate();
  const { ownedBusinessIds, ownedEntitiesLoaded, setContext, showToast, user, businessPasswordRequired } = useApp();
  // Strictly ownership — `ownedBusinessIds` must never contain a delegated
  // grant (see userService.owned). This one line is the whole definition of
  // "owner" for the console: everything RequireOwner protects, and every
  // hasScope() check, collapses to true the moment it's wrong.
  const isOwner = ownedBusinessIds.includes(id);

  const [pinUnlocked, setPinUnlocked] = useState(() => entityPasswordService.isSessionUnlocked(id));
  const [status, setStatus] = useState<"checking" | "allowed" | "denied" | "retry">(isOwner ? "allowed" : "checking");
  const [attempt, setAttempt] = useState(0);
  const [waitedEnough, setWaitedEnough] = useState(false);
  const [scope, setScope] = useState<{ accessLevel: AccessLevel; scopes: Scope[] }>({ accessLevel: "FULL", scopes: [] });
  const [hasActiveDeliveries, setHasActiveDeliveries] = useState(false);
  useAdoptConsoleContext("business", id, status === "allowed" && (!businessPasswordRequired[id] || pinUnlocked));

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
      }).catch(() => {
        // myScope already fails closed on a Supabase error, but a thrown
        // rejection would skip .then entirely and strand the guard on the
        // "checking" skeleton forever. Offer the retry screen instead.
        if (active) setStatus("retry");
      });
    }).catch(() => {
      if (active) setStatus("retry");
    });
    return () => { active = false; };
  }, [id, isOwner, ownedEntitiesLoaded, waitedEnough, attempt]);

  // Re-check the moment the owner revokes/re-scopes THIS grantee, instead of
  // only on mount/route-change. Without this, a team member already inside
  // the console keeps navigating between manage screens on a revoked grant
  // until they happen to leave the whole /manage tree and come back — the
  // guard's own mount-only check never re-runs for a same-tree navigation.
  useEffect(() => {
    if (isOwner || !id || !user.id || !hasSupabaseEnv) return;
    const sb = getSupabase();
    const channel = sb
      .channel(`rt:business_access_guard:${id}:${user.id}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "business_access_sessions", filter: `business_id=eq.${id}` },
        (payload: any) => {
          const row = payload?.new ?? payload?.old;
          if (row?.grantee_user_id === user.id) setAttempt((a) => a + 1);
        }
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [id, isOwner, user.id]);

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

  const { t } = useI18n();
  const value = useMemo((): BusinessAccessValue => {
    if (isOwner) return FULL_ACCESS;
    const hasScope = (s: Scope) => scope.accessLevel === "FULL" || scope.scopes.includes(s);
    return {
      isOwner: false,
      accessLevel: scope.accessLevel,
      scopes: scope.scopes,
      hasScope,
      consoleMode: resolveConsoleMode(false, scope.accessLevel),
      scopeLabel: buildScopeLabel(hasScope, t),
      hasActiveDeliveries,
    };
  }, [isOwner, scope, hasActiveDeliveries, t]);

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
    // Keeps the user's own name in headers — blanking it left them nameless after a revoke (ROLE-6).
    setContext({ type: "customer", id: null, name: user.name });
    showToast("Your access to that business was revoked");
    return <Navigate to="/home" replace />;
  }

  if (status === "allowed" && !!businessPasswordRequired[id] && !pinUnlocked) {
    return (
      <PinEntrySheet
        mode="verify"
        kind="business"
        entityId={id}
        onClose={() => {
          nav("/home", { replace: true });
        }}
        onVerified={() => {
          entityPasswordService.markSessionUnlocked(id);
          setPinUnlocked(true);
        }}
      />
    );
  }

  return (
    <BusinessAccessContext.Provider value={value}>
      <Outlet />
    </BusinessAccessContext.Provider>
  );
}
