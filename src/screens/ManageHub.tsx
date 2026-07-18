import { useNavigate } from "react-router-dom";
import { AppBar, SafeImg } from "@/components/common";
import { Store, Briefcase, Plus, ChevronRight, Eye, Phone, Star, TrendingUp } from "@/components/Icons";
import { useApp } from "@/store";
import { businessService, providerService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { ListSkeleton } from "@/components/states";

export default function ManageHub() {
  const nav = useNavigate();
  const { ownedBusinessIds, ownedProviderId, roles, attemptSwitchContext } = useApp();
  const { data: myBiz, loading: bizLoading } = useQuery(() => businessService.mine(), [ownedBusinessIds.join(",")]);
  const { data: myProviders, loading: provLoading } = useQuery(() => providerService.mine(), [ownedProviderId]);

  const businesses = myBiz ?? [];
  const provider = (myProviders ?? []).find((p) => p.id === ownedProviderId) ?? (myProviders ?? [])[0];

  return (
    <div className="screen">
      <AppBar title="Manage" subtitle="Your businesses & provider profile" />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 30 }}>
        {/* Businesses */}
        <div>
          <div className="small semi muted" style={{ marginBottom: 8 }}>Businesses</div>
          <div className="col gap-12">
            {bizLoading && <ListSkeleton count={1} />}
            {businesses.map((b) => {
              const bid = b.id;
              return (
                <div key={bid} className="card">
                  <div className="row gap-12">
                    <SafeImg src={b.coverImage} className="thumb" style={{ width: 56, height: 56, borderRadius: 12 }} />
                    <div className="grow">
                      <div className="row gap-6"><span className="semi">{b.name}</span></div>
                      <span className="badge badge-green" style={{ marginTop: 3 }}>● Live</span>
                    </div>
                    <Store size={20} color="var(--orange-500)" />
                  </div>
                  <div className="row gap-12 tiny muted" style={{ marginTop: 12 }}>
                    <span className="row gap-4"><Eye size={12} /> {b.viewCount.toLocaleString()}</span>
                    <span className="row gap-4"><Phone size={12} /> 142</span>
                    <span className="row gap-4"><Star size={12} fill="var(--amber-500)" strokeWidth={0} /> {b.ratingAvg}</span>
                  </div>
                  <button
                    className="btn btn-primary btn-sm btn-block"
                    style={{ marginTop: 12 }}
                    onClick={() => {
                      const dest = `/business/${bid}/manage`;
                      if (attemptSwitchContext({ type: "business", id: bid, name: b.name }, dest)) nav(dest);
                    }}
                  >
                    Manage <ChevronRight size={15} />
                  </button>
                </div>
              );
            })}
            <button className="card row gap-12 center" style={{ padding: 16, border: "1.5px dashed var(--ink-300)" }} onClick={() => nav("/onboard/business")}>
              <Plus size={20} color="var(--orange-500)" /> <span className="semi small">Add a business</span>
            </button>
          </div>
        </div>

        {/* Provider */}
        <div>
          <div className="small semi muted" style={{ marginBottom: 8 }}>Provider profile</div>
          {provLoading ? (
            <ListSkeleton count={1} />
          ) : ownedProviderId && roles.includes("provider") && provider ? (
            <div className="card">
              <div className="row gap-12">
                <SafeImg src={provider.avatar} variant="avatar" className="avatar" style={{ width: 56, height: 56 }} />
                <div className="grow">
                  <span className="semi">{provider.displayName}</span>
                  <div className="tiny muted">{provider.categoryName}</div>
                </div>
                <Briefcase size={20} color="var(--green-500)" />
              </div>
              <div className="row gap-12 tiny muted" style={{ marginTop: 12 }}>
                <span className="row gap-4"><TrendingUp size={12} /> {provider.jobsDone} jobs</span>
                <span className="row gap-4"><Star size={12} fill="var(--amber-500)" strokeWidth={0} /> {provider.ratingAvg}</span>
              </div>
              <button
                className="btn btn-green btn-sm btn-block"
                style={{ marginTop: 12 }}
                onClick={() => {
                  const dest = `/provider/${provider.id}/manage`;
                  if (attemptSwitchContext({ type: "provider", id: provider.id, name: provider.displayName }, dest)) nav(dest);
                }}
              >
                Manage <ChevronRight size={15} />
              </button>
            </div>
          ) : roles.includes("provider") ? (
            // Already a provider but store hasn't refreshed yet — show a loading state
            <div className="card row gap-12 center" style={{ padding: 16 }}>
              <span className="small muted">Loading your provider profile…</span>
            </div>
          ) : (
            <button className="card row gap-12 center" style={{ padding: 16, border: "1.5px dashed var(--ink-300)" }} onClick={() => nav("/onboard/provider")}>
              <Plus size={20} color="var(--green-500)" /> <span className="semi small">Become a provider</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
