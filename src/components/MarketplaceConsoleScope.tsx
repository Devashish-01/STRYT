import type { ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { findInQueryCacheByPrefix, hasQueryCache, peekQueryCache, useQuery } from "@/hooks/useApi";
import { Skeleton } from "@/components/states";
import {
  isExcludedMarketplaceEntry,
  MARKETPLACE_UNAVAILABLE,
  RESTRICTED_ANDROID_MARKETPLACE,
  type MarketplaceEntry,
} from "@/lib/marketplaceScope";
import { businessService } from "@/services/marketplace/businessService";
import { providerService } from "@/services/marketplace/providerService";

export default function MarketplaceConsoleScope({
  kind, children,
}: { kind: "business" | "provider"; children: ReactNode }) {
  if (!RESTRICTED_ANDROID_MARKETPLACE) return children;
  return <ScopedConsole kind={kind}>{children}</ScopedConsole>;
}

function findCachedEntity(kind: "business" | "provider", id: string): MarketplaceEntry | undefined {
  if (!id) return undefined;
  const direct = peekQueryCache<MarketplaceEntry | undefined>(`${kind}:${id}`);
  if (direct) return direct;
  const prefixes = kind === "business" ? ["my-businesses:", "profile:my-biz:"] : ["my-providers:"];
  for (const prefix of prefixes) {
    const match = findInQueryCacheByPrefix<MarketplaceEntry>(prefix, (val) =>
      Array.isArray(val) ? (val as MarketplaceEntry[]).find((item) => item?.id === id) : undefined,
    );
    if (match) return match;
  }
  return undefined;
}

function ScopedConsole({ kind, children }: { kind: "business" | "provider"; children: ReactNode }) {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const cacheKey = id ? `${kind}:${id}` : undefined;
  const { data, loading, error, refetch } = useQuery<MarketplaceEntry | undefined>(
    () => (kind === "business" ? businessService.get(id) : providerService.get(id)),
    [id, kind],
    cacheKey,
  );

  if (!id) return children;

  const directSettled = cacheKey ? hasQueryCache(cacheKey) : false;
  const directEntity = cacheKey ? peekQueryCache<MarketplaceEntry | undefined>(cacheKey) : undefined;
  const resolved = (data?.id === id ? data : undefined) ?? directEntity ?? (directSettled ? undefined : findCachedEntity(kind, id));

  if (resolved && !isExcludedMarketplaceEntry(resolved)) {
    return children;
  }

  if (error) {
    return (
      <div className="screen page-pad col center-v center-h gap-12" style={{ paddingTop: "calc(20px + var(--safe-area-top))", minHeight: "60vh", textAlign: "center" }}>
        <div className="semi">Couldn&apos;t check listing availability</div>
        <div className="small muted">Check your connection and try again.</div>
        <button type="button" className="btn btn-primary" onClick={refetch}>Try again</button>
      </div>
    );
  }

  if (loading || !directSettled) {
    return (
      <div className="screen page-pad" role="status" aria-label="Loading console" style={{ paddingTop: "calc(20px + var(--safe-area-top))" }}>
        <Skeleton h={40} mb={16} />
        <Skeleton h={120} mb={12} />
        <Skeleton h={120} />
      </div>
    );
  }

  return (
    <div className="screen page-pad col center-v center-h gap-12" style={{ paddingTop: "calc(20px + var(--safe-area-top))", minHeight: "60vh", textAlign: "center" }}>
      <p className="small muted">{MARKETPLACE_UNAVAILABLE}</p>
      <button type="button" className="btn btn-primary" onClick={() => nav("/home", { replace: true })}>
        Back to Home
      </button>
    </div>
  );
}
