import { useParams } from "react-router-dom";
import { AppBar, EmptyState } from "@/components/common";
import { requestService, businessService } from "@/services";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { RequestCard } from "@/components/cards";
import type { RequestPost } from "@/types";

// Business-as-responder: open requests matching the business category.
export default function BusinessRequests() {
  const { id = "b1" } = useParams();
  const { data: b } = useQuery(() => businessService.get(id), [id]);
  const { data, loading, error, refetch } = useQueryWithRealtime(
    () => requestService.feed({
      lat: b?.lat ?? undefined,
      lng: b?.lng ?? undefined,
      radiusKm: b?.broadcastRadius ?? undefined,
    }),
    "requests",
    [b?.lat, b?.lng, b?.broadcastRadius]
  );

  // Only show requests within the business's access range. Each request's
  // distanceKm is measured from the business location (feed got b.lat/b.lng).
  const range = b?.broadcastRadius ?? 5;
  const items = ((data?.data ?? []) as RequestPost[])
    .filter((r) => r.status === "OPEN")
    .filter((r) => !r.lat || !r.lng || r.distanceKm <= range);

  return (
    <div className="screen">
      <AppBar title="Find requests" subtitle={`Within ${range} km of ${b?.name ?? "your shop"}`} />
      <div className="screen-scroll">
        <div className="page-pad" style={{ paddingBottom: 0 }}>
          <div className="card row gap-10" style={{ padding: 12, background: "var(--brand-50)", border: "1px solid var(--brand-100)" }}>
            <span style={{ fontSize: 20 }}>🙋</span>
            <span className="tiny" style={{ color: "var(--brand-700)", lineHeight: 1.4 }}>Requests within your <b>{range} km</b> range. Send a proposal as <b>{b?.name}</b> to win the job.</span>
          </div>
        </div>
        {loading && <ListSkeleton count={3} />}
        {error && <ErrorView error={error} onRetry={refetch} />}
        {data && (
          <div className="page-pad col gap-12">
            {items.length === 0 ? (
              <EmptyState emoji="🌙" title="No open requests" text="Check back soon — new requests appear here." />
            ) : (
              items.map((r) => <RequestCard key={r.id} r={r} />)
            )}
          </div>
        )}
      </div>
    </div>
  );
}
