import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@/hooks/useApi";
import { MARKETPLACE_UNAVAILABLE, RESTRICTED_ANDROID_MARKETPLACE } from "@/lib/marketplaceScope";
import { businessService } from "@/services/marketplace/businessService";
import { providerService } from "@/services/marketplace/providerService";

export default function MarketplaceConsoleScope({
  kind, children,
}: { kind: "business" | "provider"; children: ReactNode }) {
  if (!RESTRICTED_ANDROID_MARKETPLACE) return children;
  return <ScopedConsole kind={kind}>{children}</ScopedConsole>;
}

function ScopedConsole({ kind, children }: { kind: "business" | "provider"; children: ReactNode }) {
  const { id = "" } = useParams();
  const { data, loading, error, refetch } = useQuery(
    async () => ({
      id,
      available: !!(await (kind === "business" ? businessService.get(id) : providerService.get(id))),
    }),
    [id, kind],
  );

  if (error) {
    return <div className="screen page-pad">
      <p>Couldn't check listing availability.</p>
      <button className="btn btn-primary" onClick={refetch}>Try again</button>
    </div>;
  }
  if (loading || data?.id !== id) return <div className="screen page-pad" role="status">Checking listing availability…</div>;
  if (!data.available) {
    return <div className="screen page-pad">
      <p>{MARKETPLACE_UNAVAILABLE}</p>
      <Link to="/home">Back to Home</Link>
    </div>;
  }
  return children;
}
