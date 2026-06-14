import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Bell, ChevronDown, Clock, Handshake, X } from "lucide-react";
import { useApp } from "@/store";
import { catalogService, discoveryService, requestService, socialService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { CardSkeleton, RowSkeleton } from "@/components/states";
import { BusinessCardSmall, BusinessCardWide, ProviderCardSmall, RequestCard } from "@/components/cards";
import { Section, SafeImg } from "@/components/common";
import { StoriesBar } from "@/components/Stories";
import { NeighborhoodTodayCard } from "@/features/neighborhood-today/NeighborhoodTodayCard";
import { useAmbientTheme } from "@/features/ambient/useAmbientTheme";
import type { AmbientTheme } from "@/features/ambient/useAmbientTheme";

const HandshakeIcon = Handshake as any;

// Reorder categories so boosted slugs appear first; nothing is hidden.
function reorderCategories(
  all: { id: string; slug: string; name: string; icon: string; color: string }[],
  boost: string[]
): typeof all {
  const rank = new Map(boost.map((slug, i) => [slug, i]));
  return [...all].sort((a, b) => {
    const ra = rank.has(a.slug) ? rank.get(a.slug)! : Infinity;
    const rb = rank.has(b.slug) ? rank.get(b.slug)! : Infinity;
    return ra - rb;
  });
}

export default function Home() {
  const nav = useNavigate();
  const { area: rawArea, unreadCount, user } = useApp();
  const area = rawArea || "your area";

  const theme = useAmbientTheme(user.lat, user.lng);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const { data: categories, loading: catLoading } = useQuery(() => catalogService.getCategories(), []);
  const { data: bizPage,   loading: bizLoading  } = useQuery(() => discoveryService.businesses(), []);
  const { data: provPage,  loading: provLoading } = useQuery(() => discoveryService.providers(), []);
  const { data: reqPage,   loading: reqLoading  } = useQuery(() => requestService.feed({ lat: user.lat || 0, lng: user.lng || 0 }), [user.lat, user.lng]);
  const { data: availList }                        = useQuery(() => socialService.availableNow(), []);
  const { data: agreementsList }                   = useQuery(() => requestService.agreements(), []);

  const businesses  = bizPage?.data ?? [];
  const providers   = provPage?.data ?? [];
  const requests    = reqPage?.data ?? [];
  const agreements  = agreementsList ?? [];

  const newBusinesses  = businesses.filter((b) => b.isNew);
  const featured       = businesses.filter((b) => b.isFeatured);
  const topProviders   = [...providers].sort((a, b) => b.ratingAvg - a.ratingAvg).slice(0, 6);
  const openRequests   = requests.filter((r) => r.status === "OPEN").slice(0, 3);
  const activeAgreements = agreements.filter((a) => !["COMPLETED", "CANCELLED", "DISPUTED"].includes(a.status));

  const allLoading = bizLoading || provLoading || reqLoading;
  const isEmpty    = !allLoading && businesses.length === 0 && providers.length === 0 && requests.length === 0;

  // Apply ambient boost to category grid (only when categories are loaded)
  const orderedCategories = (categories ?? []).length > 0
    ? reorderCategories(categories as any[], theme.boostCategories)
    : (categories ?? []);

  const showBanner = !!theme.banner && !bannerDismissed;
  const firstName  = user.name?.split(" ")[0] ?? "";

  return (
    <div className="screen with-nav">
      {/* ── Sticky gradient header ── */}
      <div style={{
        background: `linear-gradient(135deg, ${theme.accent}dd, ${theme.accent}99)`,
        color: "#fff",
        padding: "14px 16px 16px",
        position: "sticky",
        top: 0,
        zIndex: 20,
        transition: "background 0.6s ease",
      }}>
        {/* Location + bell */}
        <div className="row between">
          <button className="col" style={{ alignItems: "flex-start", gap: 2 }} onClick={() => nav("/settings")}>
            <span className="tiny" style={{ opacity: 0.75, letterSpacing: 0.5 }}>
              {theme.greeting}{firstName ? `, ${firstName}` : ""}
            </span>
            <span className="row gap-4 bold" style={{ fontSize: 17 }}>
              {area} <ChevronDown size={16} />
            </span>
          </button>
          <button
            className="icon-btn"
            style={{ background: "rgba(255,255,255,0.16)", color: "#fff", position: "relative" }}
            onClick={() => nav("/notifications")}
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span style={{
                position: "absolute", top: 6, right: 6,
                width: 8, height: 8, background: "#ff8400",
                borderRadius: "50%", border: "2px solid rgba(0,0,0,0.2)",
              }} />
            )}
          </button>
        </div>

        {/* Search bar */}
        <button
          className="row gap-10"
          style={{ marginTop: 12, width: "100%", background: "#fff", borderRadius: 14, padding: "12px 14px", color: "var(--ink-500)" }}
          onClick={() => nav("/search")}
        >
          <Search size={18} />
          <span style={{ fontSize: 14 }}>Search "biryani", "plumber", "salon"…</span>
        </button>
      </div>

      {/* ── Ambient banner (festival / weather) ── */}
      {showBanner && (
        <div
          style={{
            background: theme.accent + "18",
            borderBottom: `1px solid ${theme.accent}30`,
            padding: "8px 14px 8px 16px",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span className="tiny grow" style={{ color: theme.accent, fontWeight: 500, lineHeight: 1.4 }}>
            {theme.banner}
          </span>
          <button
            onClick={() => setBannerDismissed(true)}
            style={{ color: theme.accent, opacity: 0.6, flexShrink: 0, padding: 2 }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="screen-scroll" style={{ background: theme.bgGradient, transition: "background 0.6s ease" }}>
        {/* ── Quick action row ── */}
        <div className="row gap-10 page-pad" style={{ paddingTop: 16, paddingBottom: 0 }}>
          <QuickAction emoji="🗺️" label="Map" sublabel="See nearby" color="#3b82f6" onClick={() => nav("/map")} />
          <QuickAction emoji="🤝" label="Deals" sublabel={activeAgreements.length > 0 ? `${activeAgreements.length} active` : "Agreements"} color="#16a34a" onClick={() => nav("/agreements")} badge={activeAgreements.length || undefined} />
          <QuickAction emoji="👛" label="Wallet" sublabel="Stamps & coupons" color="#f26a00" onClick={() => nav("/wallet")} />
          <QuickAction emoji="🏆" label="Heroes" sublabel="Leaderboard" color="#f59e0b" onClick={() => nav("/leaderboard")} />
        </div>

        {/* ── Active agreement banner (only when there's live work) ── */}
        {activeAgreements.length > 0 && (
          <div className="page-pad" style={{ paddingTop: 14, paddingBottom: 0 }}>
            <button className="activity-banner" style={{ width: "100%" }} onClick={() => nav("/agreements")}>
              <HandshakeIcon size={22} color="#16a34a" />
              <div className="grow" style={{ textAlign: "left" }}>
                <div className="semi small" style={{ color: "#15803d" }}>
                  {activeAgreements.length} active {activeAgreements.length === 1 ? "agreement" : "agreements"}
                </div>
                <div className="tiny muted">Tap to track progress →</div>
              </div>
            </button>
          </div>
        )}

        {/* ── Stories ── */}
        <StoriesBar />

        {/* ── Neighborhood Today card ── */}
        <div className="page-pad" style={{ paddingBottom: 0, paddingTop: 4 }}>
          <NeighborhoodTodayCard
            lat={user.lat}
            lng={user.lng}
            radiusM={(user as any).notificationRadiusKm ? (user as any).notificationRadiusKm * 1000 : 3000}
            areaName={area !== "your area" ? area : undefined}
          />
        </div>

        {/* ── Categories grid (ambient-boosted order) ── */}
        <div className="page-pad" style={{ paddingBottom: 0, paddingTop: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
            {catLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="col center" style={{ gap: 6 }}>
                    <div className="skel" style={{ width: 58, height: 58, borderRadius: 18 }} />
                    <div className="skel" style={{ width: 40, height: 10, borderRadius: 4 }} />
                  </div>
                ))
              : orderedCategories.slice(0, 8).map((c) => (
                  <button key={c.id} className="col center fade-up" style={{ gap: 6 }} onClick={() => nav(`/category/${c.id}`)}>
                    <div style={{
                      width: 58, height: 58, borderRadius: 18,
                      background: `${c.color}1a`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 28,
                    }}>
                      {c.icon}
                    </div>
                    <span className="tiny semi" style={{ textAlign: "center", lineHeight: 1.2 }}>
                      {c.name.split(" ")[0]}
                    </span>
                  </button>
                ))}
          </div>
        </div>

        {/* ── Empty neighborhood CTA ── */}
        {isEmpty && (
          <div className="page-pad col gap-12" style={{ paddingTop: 20 }}>
            <div className="card col center" style={{ padding: 28, gap: 12, textAlign: "center", background: "linear-gradient(135deg, var(--brand-50), #fff)" }}>
              <span style={{ fontSize: 52 }}>🏘️</span>
              <div className="bold" style={{ fontSize: 18 }}>Your neighborhood is getting started</div>
              <p className="small muted" style={{ maxWidth: 280, lineHeight: 1.5 }}>
                Be among the first to list your business, offer a service, or post a request.
              </p>
              <div className="row gap-10" style={{ marginTop: 4 }}>
                <button className="btn btn-primary btn-sm" onClick={() => nav("/onboard/business")}>List a business</button>
                <button className="btn btn-ghost btn-sm" onClick={() => nav("/ask")}>Post a request</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Available now rail ── */}
        {(availList ?? []).length > 0 && (
          <Section title="⚡ Available right now" action="See all" onAction={() => nav("/available")}>
            <div className="hscroll">
              {(availList ?? []).map((a) => {
                const p = providers.find((x) => x.id === a.providerId);
                if (!p) return null;
                return (
                  <button
                    key={a.providerId}
                    className="card col"
                    style={{ width: 150, flexShrink: 0, padding: 12, gap: 6, alignItems: "center", textAlign: "center" }}
                    onClick={() => nav(`/provider/${p.id}`)}
                  >
                    <div style={{ position: "relative" }}>
                      <SafeImg src={p.avatar} variant="avatar" className="avatar" style={{ width: 56, height: 56 }} />
                      <span style={{ position: "absolute", bottom: 0, right: 0, width: 14, height: 14, borderRadius: "50%", background: "#16a34a", border: "2px solid #fff" }} />
                    </div>
                    <div className="semi small ellipsis" style={{ maxWidth: "100%" }}>{p.displayName}</div>
                    <span className="badge badge-green" style={{ fontSize: 10 }}><Clock size={9} /> till {a.availableUntil}</span>
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        {/* ── Compact request CTA ── */}
        <div className="page-pad" style={{ paddingTop: 14, paddingBottom: 0 }}>
          <button
            className="card row gap-12"
            style={{ padding: 14, width: "100%", textAlign: "left", background: "linear-gradient(120deg,#fff7ed,#fff)", border: "1.5px solid #fdba74" }}
            onClick={() => nav("/community-hub")}
          >
            <div style={{ width: 46, height: 46, borderRadius: 12, background: "#fff7ed", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>
              📋
            </div>
            <div className="grow">
              <div className="semi small">
                {openRequests.length > 0 ? `${openRequests.length} open requests nearby` : "Post what you need"}
              </div>
              <div className="tiny muted">Nearby people & shops send you offers</div>
            </div>
            <span className="tiny semi" style={{ color: "#f26a00", flexShrink: 0 }}>View all →</span>
          </button>
        </div>

        {/* ── New near you ── */}
        {(bizLoading || newBusinesses.length > 0) && (
          <Section title="✨ Just opened near you" action="See all" onAction={() => nav("/explore")}>
            <div className="hscroll">
              {bizLoading
                ? Array.from({ length: 3 }).map((_, i) => <div key={i} style={{ width: 160, flexShrink: 0 }}><CardSkeleton /></div>)
                : newBusinesses.map((b) => <BusinessCardSmall key={b.id} b={b} />)}
            </div>
          </Section>
        )}

        {/* ── Open requests preview ── */}
        {(reqLoading || openRequests.length > 0) && (
          <Section title="🙋 People nearby need help" action="See all" onAction={() => nav("/community-hub")}>
            <div className="col gap-12 page-pad" style={{ paddingTop: 0, paddingBottom: 0 }}>
              {reqLoading
                ? Array.from({ length: 2 }).map((_, i) => <RowSkeleton key={i} />)
                : openRequests.map((r) => <RequestCard key={r.id} r={r} />)}
            </div>
          </Section>
        )}

        {/* ── Top rated providers ── */}
        {(provLoading || topProviders.length > 0) && (
          <Section title="⭐ Top-rated providers" action="See all" onAction={() => nav("/explore")}>
            <div className="hscroll">
              {provLoading
                ? Array.from({ length: 3 }).map((_, i) => <div key={i} style={{ width: 150, flexShrink: 0 }}><CardSkeleton /></div>)
                : topProviders.map((p) => <ProviderCardSmall key={p.id} p={p} />)}
            </div>
          </Section>
        )}

        {/* ── Popular businesses ── */}
        {(bizLoading || featured.length > 0) && (
          <Section title="🔥 Popular this week">
            <div className="col gap-14 page-pad" style={{ paddingTop: 0 }}>
              {bizLoading
                ? Array.from({ length: 2 }).map((_, i) => <CardSkeleton key={i} />)
                : featured.map((b) => <BusinessCardWide key={b.id} b={b} />)}
            </div>
          </Section>
        )}

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

function QuickAction({
  emoji, label, sublabel, color, onClick, badge,
}: {
  emoji: string; label: string; sublabel: string; color: string; onClick: () => void; badge?: number;
}) {
  return (
    <button className="quick-action" onClick={onClick} style={{ position: "relative" }}>
      {badge && badge > 0 ? (
        <span className="feature-card-badge" style={{ top: 6, right: 6, minWidth: 18, height: 18, fontSize: 10 }}>
          {badge > 9 ? "9+" : badge}
        </span>
      ) : null}
      <div className="quick-action-icon" style={{ background: `${color}18` }}>{emoji}</div>
      <span className="semi" style={{ fontSize: 12, color: "var(--ink-900)" }}>{label}</span>
      <span style={{ fontSize: 10, color: "var(--ink-500)", lineHeight: 1.2 }}>{sublabel}</span>
    </button>
  );
}
