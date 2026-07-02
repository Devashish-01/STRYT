import { useNavigate } from "react-router-dom";
import { AppBar, EmptyState, SafeImg } from "@/components/common";
import { ListSkeleton, ErrorView } from "@/components/states";
import { useQuery } from "@/hooks/useApi";
import { socialService } from "@/services";
import { useApp } from "@/store";

export default function Followers() {
  const nav = useNavigate();
  const { user } = useApp();
  const { data, loading, error, refetch } = useQuery(
    () => socialService.followers(user.id),
    [user.id]
  );

  return (
    <div className="screen">
      <AppBar title="Followers" subtitle={data ? `${data.length} following you` : undefined} />
      <div className="screen-scroll page-pad col gap-10" style={{ paddingTop: 14 }}>
        {loading && <ListSkeleton count={4} />}
        {error && <ErrorView error={error} onRetry={refetch} />}
        {!loading && !error && (data ?? []).length === 0 && (
          <EmptyState emoji="👥" title="No followers yet" text="When neighbors follow you, they'll show up here." />
        )}
        {(data ?? []).map((f) => (
          <button
            key={f.id}
            className="card row gap-12 center-v"
            style={{ padding: 14, borderRadius: 16, textAlign: "left" }}
            onClick={() => nav(`/u/${f.id}`)}
          >
            <SafeImg src={f.avatar} variant="avatar" style={{ width: 46, height: 46, borderRadius: "50%", objectFit: "cover" }} />
            <span className="bold small">{f.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
