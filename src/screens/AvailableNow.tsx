import { useNavigate } from "react-router-dom";
import { AppBar, Rating, inr, EmptyState, SafeImg } from "@/components/common";
import { Clock, Zap, Phone, BadgeCheck } from "lucide-react";
import { socialService, discoveryService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";

export default function AvailableNow() {
  const nav = useNavigate();
  const { data: availList, loading, error, refetch } = useQuery(() => socialService.availableNow(), []);
  const { data: provPage } = useQuery(() => discoveryService.providers(), []);
  const availableNow = availList ?? [];
  const providers = provPage?.data ?? [];

  return (
    <div className="screen">
      <AppBar title="Free right now" subtitle="Providers available in the next few hours" />
      <div className="screen-scroll">
        <div className="page-pad" style={{ paddingBottom: 4 }}>
          <div className="card row gap-10" style={{ padding: 12, background: "#e8f7ee", border: "1px solid #bbf7d0" }}>
            <Zap size={20} color="#16a34a" />
            <span className="tiny" style={{ color: "#15803d", lineHeight: 1.4 }}>
              These providers toggled "available now." Great for same-day or urgent jobs.
            </span>
          </div>
        </div>

        {loading ? (
          <ListSkeleton count={3} />
        ) : error ? (
          <ErrorView error={error} onRetry={refetch} />
        ) : (
        <div className="page-pad col gap-12">
          {availableNow.length === 0 ? (
            <EmptyState emoji="😴" title="No one's free right now" text="Check back later or post a request — providers will respond." />
          ) : (
            availableNow.map((a) => {
              const p = providers.find((x) => x.id === a.providerId);
              if (!p) return null;
              return (
                <div key={a.providerId} className="card" style={{ padding: 14 }} onClick={() => nav(`/provider/${p.id}`)}>
                  <div className="row gap-12">
                    <div style={{ position: "relative" }}>
                      <SafeImg src={p.avatar} variant="avatar" className="avatar" style={{ width: 54, height: 54 }} />
                      <span style={{ position: "absolute", bottom: 0, right: 0, width: 16, height: 16, borderRadius: "50%", background: "#16a34a", border: "2px solid #fff" }} />
                    </div>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="row gap-6">
                        <span className="semi ellipsis">{p.displayName}</span>
                        {p.isVerified && <BadgeCheck size={15} color="#e5521c" />}
                      </div>
                      <div className="tiny muted">{p.categoryName} • {p.distanceKm} km</div>
                      <div className="row gap-6" style={{ marginTop: 5 }}>
                        <span className="badge badge-green"><Clock size={11} /> till {a.availableUntil}</span>
                        <Rating value={p.ratingAvg} size={10} />
                      </div>
                    </div>
                  </div>
                  <div className="card" style={{ padding: 10, marginTop: 10, background: "var(--ink-50)", border: "none" }}>
                    <span className="tiny semi" style={{ color: "#15803d" }}>⚡ {a.note}</span>
                  </div>
                  <div className="row gap-10" style={{ marginTop: 10 }}>
                    <div className="grow col" style={{ gap: 0 }}>
                      <span className="tiny muted">Starts at</span>
                      <span className="bold" style={{ color: "var(--green-600)" }}>{inr(p.startingPrice)}</span>
                    </div>
                    <a href={`tel:${p.phone}`} className="btn btn-outline btn-sm" onClick={(e) => e.stopPropagation()}><Phone size={15} /> Call</a>
                    <button className="btn btn-green btn-sm" onClick={(e) => { e.stopPropagation(); nav("/ask"); }}>Book now</button>
                  </div>
                </div>
              );
            })
          )}
        </div>
        )}
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
