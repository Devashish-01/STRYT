import { useState } from "react";
import { AppBar, EmptyState, SafeImg } from "@/components/common";
import { useApp } from "@/store";
import { discoveryService, requestService, userService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { BusinessCardWide, ProviderCard, RequestCard } from "@/components/cards";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ListSkeleton } from "@/components/states";
import { UserCheck, Star } from "@/components/Icons";

type Tab = "BUSINESS" | "PROVIDER" | "REQUEST" | "FOLLOWING";

export default function Bookmarks() {
  const { bookmarks, follows, user, toggleFollow } = useApp();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get("tab")?.toUpperCase() as Tab) ?? "BUSINESS";
  const [tab, setTab] = useState<Tab>(initialTab);

  // Fetch live entity data so bookmarks reflect real DB content
  const { data: bizPage, loading: bizLoading } = useQuery(
    () => discoveryService.businesses({ lat: user.lat || undefined, lng: user.lng || undefined }),
    [user.lat, user.lng]
  );
  const { data: provPage, loading: provLoading } = useQuery(
    () => discoveryService.providers({ lat: user.lat || undefined, lng: user.lng || undefined }),
    [user.lat, user.lng]
  );
  const { data: reqPage, loading: reqLoading } = useQuery(
    () => requestService.feed({ lat: user.lat || undefined, lng: user.lng || undefined }),
    [user.lat, user.lng]
  );

  const followUserKeys = follows.filter((f) => f.type.toUpperCase() === "USER");
  const { data: usersData, loading: usersLoading } = useQuery(async () => {
    if (followUserKeys.length === 0) return [];
    const profiles = await Promise.all(
      followUserKeys.map(async (k) => {
        try {
          return await userService.publicProfile(k.id);
        } catch {
          return undefined;
        }
      })
    );
    return profiles.filter(Boolean);
  }, [followUserKeys.length]);

  const allBiz = bizPage?.data ?? [];
  const allProv = provPage?.data ?? [];
  const allReq = reqPage?.data ?? [];
  const followUsers = usersData ?? [];

  const savedBiz = allBiz.filter((b) => bookmarks.some((m) => m.type.toUpperCase() === "BUSINESS" && m.id === b.id));
  const savedProv = allProv.filter((p) => bookmarks.some((m) => m.type.toUpperCase() === "PROVIDER" && m.id === p.id));
  const savedReq = allReq.filter((r) => bookmarks.some((m) => m.type.toUpperCase() === "REQUEST" && m.id === r.id));
  const followBiz = allBiz.filter((b) => follows.some((f) => f.type.toUpperCase() === "BUSINESS" && f.id === b.id));
  const followProv = allProv.filter((p) => follows.some((f) => f.type.toUpperCase() === "PROVIDER" && f.id === p.id));

  const counts = {
    BUSINESS: savedBiz.length,
    PROVIDER: savedProv.length,
    REQUEST: savedReq.length,
    FOLLOWING: followBiz.length + followProv.length + followUsers.length,
  };

  const loading = bizLoading || provLoading || reqLoading || usersLoading;

  return (
    <div className="screen">
      <AppBar title="Saved & following" />
      <div
        className="row"
        style={{ borderBottom: "1px solid var(--line)", background: "#fff", overflowX: "auto" }}
      >
        {(
          [
            ["BUSINESS", "Shops"],
            ["PROVIDER", "Providers"],
            ["REQUEST", "Requests"],
            ["FOLLOWING", "Following"],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="semi"
            style={{
              flex: 1,
              minWidth: 90,
              padding: "12px 0",
              fontSize: 13.5,
              whiteSpace: "nowrap",
              color: tab === t ? "var(--brand-700)" : "var(--ink-500)",
              borderBottom: tab === t ? "2.5px solid var(--brand-700)" : "2.5px solid transparent",
            }}
          >
            {label} {counts[t] > 0 && `(${counts[t]})`}
          </button>
        ))}
      </div>

      <div className="screen-scroll page-pad col gap-14" style={{ paddingTop: 14 }}>
        {loading ? (
          <ListSkeleton count={3} />
        ) : (
          <>
            {tab === "BUSINESS" &&
              (savedBiz.length ? savedBiz.map((b) => <BusinessCardWide key={b.id} b={b} />) : <Empty nav={nav} />)}
            {tab === "PROVIDER" &&
              (savedProv.length ? savedProv.map((p) => <ProviderCard key={p.id} p={p} />) : <Empty nav={nav} />)}
            {tab === "REQUEST" &&
              (savedReq.length ? savedReq.map((r) => <RequestCard key={r.id} r={r} />) : <Empty nav={nav} />)}
            {tab === "FOLLOWING" &&
              (counts.FOLLOWING > 0 ? (
                <>
                  {followUsers.map((u: any) => (
                    <div
                      key={u.id}
                      className="card row space-between center-v"
                      style={{ padding: 14, borderRadius: 16, cursor: "pointer" }}
                      onClick={() => nav(`/u/${u.id}`)}
                    >
                      <div className="row gap-12 center-v">
                        <SafeImg
                          src={u.avatar}
                          variant="avatar"
                          style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover" }}
                        />
                        <div>
                          <div className="bold small">{u.name}</div>
                          <div className="tiny muted row gap-4 center-v" style={{ marginTop: 2 }}>
                            <Star size={11} fill="#fbbf24" stroke="none" /> {u.ratingAvg} • 📍 {u.area || "Member"}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm row gap-4 center"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFollow("USER", u.id, u.name);
                        }}
                        style={{
                          borderRadius: 999,
                          padding: "6px 12px",
                          fontSize: 12,
                          fontWeight: 700,
                          background: "var(--brand-100)",
                          color: "var(--brand-700)",
                          border: "none",
                        }}
                      >
                        <UserCheck size={14} /> Following
                      </button>
                    </div>
                  ))}
                  {followProv.map((p) => (
                    <ProviderCard key={p.id} p={p} />
                  ))}
                  {followBiz.map((b) => (
                    <BusinessCardWide key={b.id} b={b} />
                  ))}
                </>
              ) : (
                <EmptyState
                  emoji="➕"
                  title="Not following anyone yet"
                  text="Follow shops, providers, and neighbors to see their posts and updates first."
                  action={
                    <button className="btn btn-ghost btn-sm" onClick={() => nav("/explore")}>
                      Find some
                    </button>
                  }
                />
              ))}
          </>
        )}
      </div>
    </div>
  );
}

function Empty({ nav }: { nav: ReturnType<typeof useNavigate> }) {
  return (
    <EmptyState
      emoji="🤍"
      title="Nothing saved yet"
      text="Tap the heart on any shop, provider or request to save it here."
      action={
        <button className="btn btn-ghost btn-sm" onClick={() => nav("/explore")}>
          Explore now
        </button>
      }
    />
  );
}
