import { useNavigate } from "react-router-dom";
import { AppBar, Section, SafeImg } from "@/components/common";
import { MapPin, Zap, TrendingUp, Store, Users, MessageSquareText, Trophy, Clock } from "@/components/Icons";
import { discoveryService, requestService, socialService, communityService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { StoriesBar } from "@/components/Stories";
import { BusinessCardSmall, CommunityCard } from "@/components/cards";
import { useApp } from "@/store";

export default function Neighborhood() {
  const nav = useNavigate();
  const { area, user } = useApp();

  const { data: bizPage } = useQuery(() => discoveryService.businesses({ lat: user.lat || undefined, lng: user.lng || undefined }), [user.lat, user.lng]);
  const { data: provPage } = useQuery(() => discoveryService.providers({ lat: user.lat || undefined, lng: user.lng || undefined }), [user.lat, user.lng]);
  const { data: reqPage } = useQuery(() => requestService.feed({ lat: user.lat || undefined, lng: user.lng || undefined }), [user.lat, user.lng]);
  const { data: availList } = useQuery(() => {
    const saved = localStorage.getItem("settings_radius");
    const radiusLimit = saved ? parseFloat(saved) : 5;
    return socialService.availableNow(user.lat || undefined, user.lng || undefined, radiusLimit);
  }, [user.lat, user.lng]);
  const { data: posts } = useQuery(() => communityService.feed({ lat: user.lat || undefined, lng: user.lng || undefined }), [user.lat, user.lng]);
  const { data: collectionsData } = useQuery(() => socialService.collections(), []);

  const businesses = bizPage?.data ?? [];
  const providers = provPage?.data ?? [];
  const requests = reqPage?.data ?? [];
  const availableNow = availList ?? [];
  const communityPosts = posts?.data ?? [];
  const collections = collectionsData ?? [];

  const newCount = businesses.filter((b) => b.isNew).length;
  const availCount = availableNow.length;
  const openReq = requests.filter((r) => r.status === "OPEN").length;
  const topAlert = communityPosts.find((p) => p.type === "ALERT");

  const stats = [
    { icon: Store, label: "Just opened", value: newCount, color: "var(--orange-500)", to: "/explore" },
    { icon: Zap, label: "Available now", value: availCount, color: "var(--green-500)", to: "/available" },
    { icon: MessageSquareText, label: "Open requests", value: openReq, color: "var(--brand-600)", to: "/requests" },
  ];

  return (
    <div className="screen with-nav">
      <header className="appbar">
        <button className="icon-btn" onClick={() => nav(-1)}>←</button>
        <div className="grow col" style={{ gap: 0 }}>
          <span className="bold" style={{ fontSize: 18 }}>{area}</span>
          <span className="tiny muted row gap-4"><Users size={11} /> 3,247 neighbors • Pune</span>
        </div>
        <button className="icon-btn" onClick={() => nav("/map")}><MapPin size={18} /></button>
      </header>

      <div className="screen-scroll">
        {/* Live pulse header */}
        <div style={{ background: "linear-gradient(135deg,var(--brand-500),var(--brand-700))", color: "#fff", padding: "16px", margin: "12px 16px 0", borderRadius: 20 }}>
          <div className="row gap-6" style={{ marginBottom: 10 }}>
            <span className="dot-new" style={{ background: "var(--green-500)", boxShadow: "0 0 0 3px rgba(74,222,128,0.3)" }} />
            <span className="tiny semi" style={{ letterSpacing: 0.5 }}>LIVE IN YOUR AREA</span>
          </div>
          <div className="row gap-10">
            {stats.map((s) => {
              const Icon = s.icon;
              return (
                <button key={s.label} className="grow col" style={{ gap: 4, background: "rgba(255,255,255,0.12)", borderRadius: 14, padding: "12px 8px", alignItems: "center" }} onClick={() => nav(s.to)}>
                  <Icon size={18} />
                  <span className="bold" style={{ fontSize: 20 }}>{s.value}</span>
                  <span className="tiny" style={{ opacity: 0.85, textAlign: "center" }}>{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Stories */}
        <div className="section-head page-pad" style={{ paddingBottom: 0, marginTop: 16 }}><h3>Today's stories</h3></div>
        <StoriesBar />

        {/* Alert banner */}
        {topAlert && (
          <div className="page-pad" style={{ paddingTop: 8, paddingBottom: 0 }}>
            <button className="card row gap-10" style={{ padding: 12, background: "var(--red-50)", border: "1px solid var(--red-100)", width: "100%", textAlign: "left" }} onClick={() => nav("/community")}>
              <span style={{ fontSize: 22 }}>📢</span>
              <div className="grow">
                <div className="semi small" style={{ color: "var(--red-600)" }}>{topAlert.title}</div>
                <div className="tiny muted">{topAlert.postedAt} • tap for details</div>
              </div>
            </button>
          </div>
        )}

        {/* Collections */}
        <Section title="Curated for your area">
          <div className="hscroll">
            {collections.map((c) => (
              <button key={c.id} style={{ width: 150, height: 100, borderRadius: 16, background: c.gradient, color: "#fff", flexShrink: 0, padding: 12, textAlign: "left", position: "relative", overflow: "hidden" }} onClick={() => nav("/explore")}>
                <span style={{ fontSize: 30, position: "absolute", right: 8, top: 6, opacity: 0.5 }}>{c.emoji}</span>
                <div className="bold" style={{ fontSize: 14, marginTop: 38 }}>{c.title}</div>
                <div className="tiny" style={{ opacity: 0.85 }}>{c.count} places</div>
              </button>
            ))}
          </div>
        </Section>

        {/* Available now */}
        <Section title="⚡ Free right now" action="See all" onAction={() => nav("/available")}>
          <div className="hscroll">
            {availableNow.map((p) => {
              return (
                <button key={p.providerId} className="card col" style={{ width: 160, flexShrink: 0, padding: 12, gap: 6, alignItems: "center", textAlign: "center" }} onClick={() => nav(`/provider/${p.providerId}`)}>
                  <div style={{ position: "relative" }}>
                    <SafeImg src={p.avatar} variant="avatar" className="avatar" style={{ width: 56, height: 56 }} />
                    <span style={{ position: "absolute", bottom: 0, right: 0, width: 16, height: 16, borderRadius: "50%", background: "var(--green-500)", border: "2px solid #fff" }} />
                  </div>
                  <div className="semi small ellipsis" style={{ maxWidth: "100%" }}>{p.displayName}</div>
                  <span className="badge badge-green tiny"><Clock size={10} /> till {p.availableUntil}</span>
                  <div className="tiny muted clamp-2">{p.note}</div>
                </button>
              );
            })}
          </div>
        </Section>

        {/* New shops */}
        <Section title="🆕 Just opened here" action="See all" onAction={() => nav("/explore")}>
          <div className="hscroll">
            {businesses.filter((b) => b.isNew).map((b) => <BusinessCardSmall key={b.id} b={b} />)}
          </div>
        </Section>

        {/* Community highlights */}
        <Section title="🏘️ Neighborhood buzz" action="Open" onAction={() => nav("/community")}>
          <div className="col gap-12 page-pad" style={{ paddingTop: 0 }}>
            {communityPosts.slice(0, 2).map((p) => <CommunityCard key={p.id} post={p} />)}
          </div>
        </Section>

        {/* Leaderboard teaser */}
        <div className="page-pad" style={{ paddingTop: 6 }}>
          <button className="card row gap-12" style={{ padding: 14, width: "100%", textAlign: "left", background: "linear-gradient(120deg,var(--amber-50),#fff)" }} onClick={() => nav("/leaderboard")}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--amber-100)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Trophy size={22} color="var(--amber-500)" />
            </div>
            <div className="grow">
              <div className="semi small">This month's local heroes</div>
              <div className="tiny muted">Top providers & most helpful neighbors</div>
            </div>
            <TrendingUp size={18} color="var(--amber-500)" />
          </button>
        </div>

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
