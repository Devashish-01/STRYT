import { useState } from "react";
import { AppBar, EmptyState } from "@/components/common";
import { useApp } from "@/store";
import { discoveryService, requestService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { BusinessCardWide, ProviderCard, RequestCard } from "@/components/cards";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ListSkeleton } from "@/components/states";

type Tab = "BUSINESS" | "PROVIDER" | "REQUEST" | "FOLLOWING";

export default function Bookmarks() {
  const { bookmarks, follows, user } = useApp();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get("tab")?.toUpperCase() as Tab) ?? "BUSINESS";
  const [tab, setTab] = useState<Tab>(initialTab);

  // Fetch live entity data so bookmarks reflect real DB content
  const { data: bizPage, loading: bizLoading } = useQuery(() => discoveryService.businesses({ lat: user.lat || undefined, lng: user.lng || undefined }), [user.lat, user.lng]);
  const { data: provPage, loading: provLoading } = useQuery(() => discoveryService.providers({ lat: user.lat || undefined, lng: user.lng || undefined }), [user.lat, user.lng]);
  const { data: reqPage, loading: reqLoading } = useQuery(() => requestService.feed({ lat: user.lat || undefined, lng: user.lng || undefined }), [user.lat, user.lng]);

  const allBiz  = bizPage?.data  ?? [];
  const allProv = provPage?.data ?? [];
  const allReq  = reqPage?.data  ?? [];

  const savedBiz  = allBiz.filter((b) => bookmarks.some((m) => m.type === "BUSINESS"  && m.id === b.id));
  const savedProv = allProv.filter((p) => bookmarks.some((m) => m.type === "PROVIDER"  && m.id === p.id));
  const savedReq  = allReq.filter((r) => bookmarks.some((m) => m.type === "REQUEST"   && m.id === r.id));
  const followBiz = allBiz.filter((b) => follows.some((f) => f.type === "BUSINESS"   && f.id === b.id));
  const followProv= allProv.filter((p) => follows.some((f) => f.type === "PROVIDER"   && f.id === p.id));

  const counts = {
    BUSINESS:  savedBiz.length,
    PROVIDER:  savedProv.length,
    REQUEST:   savedReq.length,
    FOLLOWING: followBiz.length + followProv.length,
  };

  const loading = bizLoading || provLoading || reqLoading;

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

      <div className="screen-scroll page-pad col gap-14">
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
              (followBiz.length + followProv.length ? (
                <>
                  {followProv.map((p) => <ProviderCard key={p.id} p={p} />)}
                  {followBiz.map((b) => <BusinessCardWide key={b.id} b={b} />)}
                </>
              ) : (
                <EmptyState
                  emoji="➕"
                  title="Not following anyone yet"
                  text="Follow shops and providers to see their stories and offers first."
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
