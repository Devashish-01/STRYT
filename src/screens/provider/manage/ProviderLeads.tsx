import { useParams, useNavigate } from "react-router-dom";
import { AppBar, EmptyState } from "@/components/common";
import { requestService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { RequestCard } from "@/components/cards";
import { providerService } from "@/services";
import type { RequestPost } from "@/types";
import ProviderManageNav from "./ProviderManageNav";

export default function ProviderLeads() {
  const { id = "p1" } = useParams();
  const { data: p } = useQuery(() => providerService.get(id), [id]);
  const { data, loading, error, refetch } = useQuery(
    () => requestService.feed({
      lat: p?.lat ?? undefined,
      lng: p?.lng ?? undefined,
      radiusKm: p?.serviceRadiusKm ?? undefined,
    }),
    [p?.lat, p?.lng, p?.serviceRadiusKm]
  );
  const items = ((data?.data ?? []) as RequestPost[]).filter((r) => r.status === "OPEN");

  return (
    <div className="screen with-nav">
      <AppBar title="Leads & requests" subtitle={`Matching ${p?.categoryName ?? "your skills"}`} />
      <div className="screen-scroll">
        <div className="page-pad" style={{ paddingBottom: 0 }}>
          <div className="card row gap-10" style={{ padding: 12, background: "#e8f7ee", border: "1px solid #bbf7d0" }}>
            <span style={{ fontSize: 20 }}>🙋</span>
            <span className="tiny" style={{ color: "#15803d", lineHeight: 1.4 }}>Open requests near you. Send a proposal to win the job — itemize your quote for the best shot.</span>
          </div>
        </div>
        {loading && <ListSkeleton count={3} />}
        {error && <ErrorView error={error} onRetry={refetch} />}
        {data && (
          <div className="page-pad col gap-12">
            {items.length === 0 ? <EmptyState emoji="🌙" title="No open requests" text="New matching requests will appear here." /> : items.map((r) => <RequestCard key={r.id} r={r} />)}
          </div>
        )}
        <div style={{ height: 16 }} />
      </div>
      <ProviderManageNav pid={id} />
    </div>
  );
}
