import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell, Settings, Store, Briefcase, FileText, Star,
  ChevronRight, Share2,
  Award, Users, UserCircle, Heart,
  ArrowLeftRight, MessageSquare, Image, ListChecks, Clock,
  Calendar
} from "@/components/Icons";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { SafeImg } from "@/components/common";
import { displayName } from "@/lib/publicName";
import AccountSwitcher from "@/components/AccountSwitcher";
import AppUpdateButton from "@/components/AppUpdateButton";
import { requestService, socialService, businessService, notificationService, appointmentService } from "@/services";
import { PLACEHOLDER_AVATAR, PLACEHOLDER_AVATAR_ALT, PLACEHOLDER_BUSINESS_COVER } from "@/lib/placeholders";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import type { Role, AgreementStatus } from "@/types";
import ShareCard, { type ShareOption } from "@/components/ShareCard";
import { StoryViewer } from "@/components/Stories";
import { useAmbientTheme } from "@/features/ambient/useAmbientTheme";
import AmbientSky from "@/features/ambient/AmbientSky";

const TERMINAL: AgreementStatus[] = ["COMPLETED", "CANCELLED", "DISPUTED"];

export default function Profile() {
  const nav = useNavigate();
  const { user, roles, activeRole, setActiveRole, bookmarks, follows, ownedBusinessIds, ownedProviderId, chatUnread } = useApp();
  const ambient = useAmbientTheme(user.lat, user.lng, "customer");
  const { t } = useI18n();
  const [switcher, setSwitcher] = useState(false);
  const [share, setShare] = useState(false);
  const [viewingHighlight, setViewingHighlight] = useState<number | null>(null);
  const manageBizId = ownedBusinessIds[0];
  const hasSellerProfile = ownedBusinessIds.length > 0 || !!ownedProviderId;

  const getFirstName = (name: string) => name.split(" ")[0] || "My";

  const shareOptions: ShareOption[] = [
    {
      role: "customer",
      label: "Personal Profile",
      url: window.location.origin + "/u/" + user.id,
      title: displayName(user.name),
      subtitle: `Customer • ${user.area || "No location"}`,
      image: user.avatar || PLACEHOLDER_AVATAR,
      meta: (user.ratingCount ?? 0) > 0 ? `⭐ ${user.ratingAvg} (${user.ratingCount})` : "New member"
    }
  ];

  
  if (ownedBusinessIds.length > 0) {
    shareOptions.push({
      role: "business_owner",
      label: "Shop Profile",
      url: window.location.origin + "/business/" + ownedBusinessIds[0],
      title: `${getFirstName(displayName(user.name, "My"))}'s Shop`,
      subtitle: "Local Business on Stryt",
      image: PLACEHOLDER_BUSINESS_COVER,
      meta: "Shops & Deals"
    });
  }

  if (ownedProviderId) {
    shareOptions.push({
      role: "provider",
      label: "Provider Profile",
      url: window.location.origin + "/provider/" + ownedProviderId,
      title: displayName(user.name, "Service Provider"),
      subtitle: "Professional Provider on Stryt",
      image: user.avatar || PLACEHOLDER_AVATAR_ALT,
      meta: "Services & Work"
    });
  }

  const { data: agreementsData } = useQuery(() => requestService.agreements(), []);
  const { data: followersData } = useQuery(() => user.id ? socialService.followers(user.id) : Promise.resolve([]), [user.id]);
  const followersCount = followersData?.length ?? 0;
  const activeAgreements = (agreementsData ?? []).filter((a) => !TERMINAL.includes(a.status));
  const totalAgreements  = agreementsData?.length ?? 0;

  const { data: myQueuesData } = useQueryWithRealtime(() => businessService.myQueues(), "queue_tokens", []);
  const activeQueues = (myQueuesData ?? []).filter((q) => q.status === "WAITING" || q.status === "CALLED");

  // Tile subtitles are only worth showing if they're TRUE — a tile that says
  // "2 upcoming" and is wrong is worse than one that says nothing. So the two
  // counts that need a fetch get one, and everything else uses a static
  // descriptor rather than a number we haven't actually loaded.
  const { data: myAppointments } = useQuery(() => user.id ? appointmentService.listForCustomer(user.id) : Promise.resolve([]), [user.id]);
  const upcomingCount = (myAppointments ?? []).filter(
    (a) => (a.status === "PENDING" || a.status === "ACCEPTED") && new Date(a.scheduledForISO).getTime() > Date.now()
  ).length;

  const { data: myRequests } = useQuery(() => user.id ? requestService.mine() : Promise.resolve([]), [user.id]);
  const openRequestCount = (myRequests ?? []).filter((r) => r.status === "OPEN").length;

  // Mirrors what the Achievements screen itself says in its own subtitle
  // ("X of Y unlocked") so the tile and the destination can't disagree.
  const { data: achievementsData } = useQuery(() => socialService.achievements(), [user.id]);
  const badgeSub = achievementsData
    ? `${achievementsData.filter((a) => a.unlocked).length} of ${achievementsData.length} unlocked`
    : "Your achievements";

  const { data: custUnread } = useQueryWithRealtime(() => notificationService.getUnreadCount({ scope: "CUSTOMER" }), "notifications", []);

  const { data: highlightsData } = useQuery(() => socialService.myHighlights(), [user.id]);
  const highlights = highlightsData ?? [];

  const roleMeta: Record<Role, { label: string; icon: any; color: string; bg: string }> = {
    customer:       { label: "Customer",  icon: Heart,    color: "var(--brand-600)", bg: "var(--brand-50)" },
    business_owner: { label: "Business",  icon: Store,    color: "var(--orange-500)", bg: "var(--orange-50)" },
    provider:       { label: "Provider",  icon: Briefcase, color: "var(--green-500)", bg: "var(--green-100)" },
  };

  // Destinations, split into two labelled groups instead of one undifferentiated
  // 6-up. "Your activity" is things with live state (a count that changes);
  // "You on STRYT" is your identity/content. Same tile shape for both, so the
  // whole page speaks ONE visual language for "go somewhere" — previously this
  // was a tile grid, then menu rows, then another menu row, for the same job.
  //
  // Map is deliberately excluded — it already lives in the bottom nav.
  type Tile = { icon: React.ReactNode; label: string; sub: string; badge?: number; onClick: () => void };

  // NOTE: no Wallet tile. Wallet is shelved in screens/future-enhancement/ —
  // it's loyalty stamps, coupons and an offline ledger, none of which ship in
  // this release. It has no other in-app link, so pointing a tile at it would
  // resurrect a shelved feature by the back door.
  const activityTiles: Tile[] = [
    { icon: <Calendar size={20} color="var(--brand-500)" />, label: t("appointments"), sub: upcomingCount > 0 ? `${upcomingCount} upcoming` : "None upcoming", onClick: () => nav("/appointments") },
    { icon: <FileText size={20} color="var(--brand-700)" />, label: t("requests"), sub: openRequestCount > 0 ? `${openRequestCount} open` : "None open", onClick: () => nav("/requests") },
    { icon: <Clock size={20} color="var(--amber-500)" />, label: "Queues", sub: activeQueues.length > 0 ? `${activeQueues.length} active` : "Not in line", badge: activeQueues.length || undefined, onClick: () => nav("/queues") },
    { icon: <Award size={20} color="var(--amber-500)" />, label: t("badges"), sub: badgeSub, onClick: () => nav("/achievements") },
  ];

  const youTiles: Tile[] = [
    { icon: <Users size={20} color="var(--blue-500)" />, label: t("community"), sub: "Your street feed", onClick: () => nav("/community-hub") },
    { icon: <Image size={20} color="var(--pink-500)" />, label: "My activity", sub: "Stories & posts", onClick: () => nav("/my-activity") },
    { icon: <ListChecks size={20} color="var(--blue-500)" />, label: "Saved lists", sub: bookmarks.length > 0 ? `${bookmarks.length} saved` : "Nothing saved yet", onClick: () => nav("/lists") },
    { icon: <UserCircle size={20} color="var(--brand-600)" />, label: "Public profile", sub: "How neighbours see you", onClick: () => nav(`/u/${user.id}`) },
  ];

  return (
    <div className="screen with-nav" style={{ padding: 0 }}>
      {/* ==========================================================
          MOBILE-ONLY VIEW
         ========================================================== */}
      <div className="mobile-only screen-boxed" style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
        <div className="screen-scroll">
          {/* ── Identity ──────────────────────────────────────────────────
              Deliberately calm. No "Profile" page title (you're on your own
              profile looking at your own face) and no ambient greeting — that's
              Home's voice, and "starry skies & quiet streets" tells you nothing
              about *you*. What's left is: who you are, what neighbours see, and
              one primary action. */}
          <div className="living-sky-header" style={{
            background: ambient.headerGradient,
            color: "#fff",
            padding: "calc(16px + var(--safe-area-top)) 16px 20px",
            position: "relative",
            overflow: "hidden",
          }}>
            <AmbientSky dayPart={ambient.dayPartKey} effect={ambient.seasonEffect} glow={ambient.lampGlow} />
            <div style={{ position: "relative", zIndex: 1 }}>
              <div className="row between" style={{ alignItems: "flex-start" }}>
                <button className="row gap-14" style={{ alignItems: "center", background: "none", border: "none", padding: 0, textAlign: "left", minWidth: 0 }} onClick={() => nav(`/u/${user.id}`)}>
                  <SafeImg
                    src={user.avatar} alt="" variant="avatar" className="avatar"
                    style={{ width: 64, height: 64, border: "2.5px solid rgba(255,255,255,0.3)", flexShrink: 0 }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div className="bold ellipsis" style={{ fontSize: 22, color: "#fff", letterSpacing: -0.3, lineHeight: 1.2 }}>
                      {displayName(user.name)}
                    </div>
                    <div className="ellipsis" style={{ fontSize: 13, color: "rgba(255,255,255,0.72)", marginTop: 3, fontWeight: 500 }}>
                      {user.alias ? `@${user.alias}` : "@username"} · {user.area || "No location"}
                    </div>
                  </div>
                </button>
                <div className="row gap-8" style={{ flexShrink: 0 }}>
                  <button className="icon-btn" style={{ background: "rgba(255,255,255,0.16)", color: "#fff", position: "relative", border: "none" }} onClick={() => nav("/chats?scope=CUSTOMER")} aria-label="Messages">
                    <MessageSquare size={18} />
                    {chatUnread > 0 && (
                      <span style={{ position: "absolute", top: 5, right: 5, width: 7, height: 7, background: "var(--red-500)", borderRadius: "50%", border: "1.5px solid rgba(0,0,0,0.2)" }} />
                    )}
                  </button>
                  <button className="icon-btn" style={{ background: "rgba(255,255,255,0.16)", color: "#fff", position: "relative", border: "none" }} onClick={() => nav("/notifications?scope=CUSTOMER")} aria-label="Notifications">
                    <Bell size={18} />
                    {(custUnread ?? 0) > 0 && (
                      <span style={{ position: "absolute", top: 5, right: 5, width: 7, height: 7, background: "var(--red-500)", borderRadius: "50%", border: "1.5px solid rgba(0,0,0,0.2)" }} />
                    )}
                  </button>
                </div>
              </div>

              {/* Privacy state + "see yourself as a neighbour does" are the same
                  question, so they're one control instead of a decorative chip
                  next to a separate "Public profile" button. */}
              <button
                className="row gap-8"
                style={{ width: "100%", marginTop: 16, padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)", color: "#fff", textAlign: "left" }}
                onClick={() => nav(`/u/${user.id}`)}
              >
                <span style={{ fontSize: 13 }}>{user.showNamePublicly ? "🌐" : "🔒"}</span>
                <span className="grow" style={{ fontSize: 12.5, fontWeight: 600, color: "#fff" }}>
                  {user.showNamePublicly ? "Your full name is public" : "Your full name is private"}
                </span>
                <span className="row gap-4" style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>
                  <UserCircle size={13} /> View as neighbour
                </span>
              </button>

              <div className="row gap-8" style={{ marginTop: 10 }}>
                <button
                  className="btn btn-sm grow"
                  style={{ background: "#fff", color: "var(--brand-700)", border: "none" }}
                  onClick={() => nav("/profile/edit")}
                >
                  Edit profile
                </button>
                <button
                  className="icon-btn"
                  style={{ background: "rgba(255,255,255,0.16)", color: "#fff", flexShrink: 0 }}
                  onClick={() => setShare(true)}
                  aria-label="Share profile"
                >
                  <Share2 size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Stats — lifted out of the header onto a real card, so the dark block
              stays about identity and the numbers read as content. */}
          <div className="page-pad" style={{ paddingTop: 12, paddingBottom: 0 }}>
            <div className="row card" style={{ padding: "14px 0" }}>
              {([
                { n: bookmarks.length, l: "Saved", onClick: () => nav("/bookmarks") },
                { n: follows.length, l: "Following", onClick: () => nav("/bookmarks?tab=following") },
                { n: followersCount, l: "Followers", onClick: () => nav("/followers") },
                { n: totalAgreements, l: "Deals", onClick: () => nav("/agreements"), active: activeAgreements.length },
              ] as const).map((s, i) => (
                <button
                  key={s.l}
                  onClick={s.onClick}
                  className="col center grow"
                  style={{ gap: 2, position: "relative", background: "none", border: "none", borderLeft: i > 0 ? "1px solid var(--line)" : "none" }}
                >
                  <span className="bold" style={{ fontSize: 18, lineHeight: 1.1, color: "var(--ink-900)" }}>{s.n}</span>
                  <span className="tiny">{s.l}</span>
                  {"active" in s && s.active > 0 && (
                    <span style={{ position: "absolute", top: 0, right: "50%", transform: "translateX(20px)", width: 7, height: 7, borderRadius: "50%", background: "var(--green-500)" }} />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Highlights — your own story reel, so it belongs with identity. */}
          {highlights.length > 0 && (
            <div className="hscroll" style={{ padding: "14px 16px 0" }}>
              {highlights.map((h, i) => (
                <button key={h.id} className="col center" style={{ gap: 6, width: 68, flexShrink: 0, background: "none", border: "none" }} onClick={() => setViewingHighlight(i)}>
                  <div style={{ width: 60, height: 60, borderRadius: "50%", padding: 2.5, background: "linear-gradient(135deg,var(--amber-500),var(--amber-500))" }}>
                    <SafeImg src={h.image} variant="photo" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", border: "2px solid #fff" }} />
                  </div>
                  <span className="tiny semi ellipsis" style={{ maxWidth: 62, textAlign: "center" }}>{h.caption || "Highlight"}</span>
                </button>
              ))}
            </div>
          )}

          {/* ── Right now ─────────────────────────────────────────────────
              The only time-sensitive things on this page, so they get real
              weight instead of one pale strip. Renders nothing when you have
              no live queue and no running deal — an empty section header is
              worse than no section. */}
          {(activeQueues.length > 0 || activeAgreements.length > 0) && (
            <div className="page-pad" style={{ paddingBottom: 0 }}>
              <div className="profile-eyebrow">Right now</div>
              <div className="col gap-10">
                {activeQueues.map((q) => (
                  <LiveRow
                    key={q.tokenId}
                    accent="var(--amber-500)"
                    tint="var(--amber-100)"
                    emoji="👥"
                    title={q.businessName}
                    chip={q.status === "CALLED" ? "Your turn" : `You're #${q.position}`}
                    chipBg="var(--amber-100)"
                    chipColor="var(--amber-700)"
                    sub={q.status === "CALLED" ? "Head in now" : `~${q.estWaitMin ?? 0} min wait · tap to view position`}
                    onClick={() => nav("/queues")}
                  />
                ))}
                {activeAgreements.map((a) => (
                  <LiveRow
                    key={a.id}
                    accent="var(--green-500)"
                    tint="var(--green-100)"
                    emoji="🤝"
                    title={a.requestTitle}
                    chip={a.status === "PENDING" ? "Confirm" : "In progress"}
                    chipBg="var(--green-100)"
                    chipColor="var(--green-600)"
                    sub={`with ${a.responderUserId === user.id ? a.requesterName : a.responderName}`}
                    onClick={() => nav(`/agreement/${a.id}`)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── Your activity ── */}
          <div className="page-pad" style={{ paddingBottom: 0 }}>
            <div className="profile-eyebrow">Your activity</div>
            <TileGrid tiles={activityTiles} />
          </div>

          {/* ── You on STRYT ── */}
          <div className="page-pad" style={{ paddingBottom: 0 }}>
            <div className="profile-eyebrow">You on STRYT</div>
            <TileGrid tiles={youTiles} />
          </div>

          {/* ── Selling ───────────────────────────────────────────────────
              Progressive disclosure. Most people only ever wear the customer
              hat, and the old 3-tile switcher gave two "+ Add" upsell tiles the
              same weight as their actual identity — plus a second, overlapping
              "switch account" link underneath. Single-role users now get one
              quiet invitation; the real switcher only appears once you actually
              have something to switch between. */}
          <div className="page-pad" style={{ paddingBottom: 0 }}>
            {hasSellerProfile ? (
              <div className="card">
                <div className="small semi" style={{ color: "var(--ink-600)", marginBottom: 12 }}>I'm using STRYT as a…</div>
                <div className="row gap-8">
                  {(["customer", "business_owner", "provider"] as Role[]).map((r) => {
                    const has    = roles.includes(r);
                    const active = activeRole === r;
                    const M      = roleMeta[r];
                    const Icon   = M.icon;
                    return (
                      <button
                        key={r}
                        onClick={() => {
                          if (!has) {
                            nav(r === "business_owner" ? "/onboard/business" : "/onboard/provider");
                          } else if (r === "business_owner") {
                            nav(manageBizId ? `/business/${manageBizId}/manage` : "/manage");
                          } else if (r === "provider") {
                            nav(ownedProviderId ? `/provider/${ownedProviderId}/manage` : "/manage");
                          } else {
                            setActiveRole(r);
                          }
                        }}
                        className="col center"
                        style={{
                          flex: 1, gap: 6, padding: "12px 6px", borderRadius: 14,
                          border: active ? `2px solid ${M.color}` : "2px solid var(--ink-100)",
                          background: active ? M.bg : "#fff",
                          transition: "all 0.15s",
                        }}
                      >
                        <Icon size={22} color={M.color} />
                        <span className="tiny semi" style={{ color: active ? M.color : "var(--ink-600)" }}>{M.label}</span>
                        {!has && <span style={{ fontSize: 9, color: "var(--ink-400)", fontWeight: 700 }}>+ Add</span>}
                      </button>
                    );
                  })}
                </div>
                <button
                  className="row gap-6 center-v tiny semi"
                  style={{ marginTop: 10, color: "var(--ink-500)", padding: "6px 2px", background: "none", border: "none" }}
                  onClick={() => setSwitcher(true)}
                >
                  <ArrowLeftRight size={13} /> Switch or add another account
                </button>
              </div>
            ) : (
              <button
                className="row gap-12"
                style={{ width: "100%", textAlign: "left", padding: "14px 16px", borderRadius: 18, background: "linear-gradient(120deg, var(--brand-50), #fff)", border: "1px solid var(--brand-100)" }}
                onClick={() => nav("/manage")}
              >
                <span style={{ width: 38, height: 38, borderRadius: 11, background: "#fff", border: "1px solid var(--brand-100)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Store size={19} color="var(--brand-600)" />
                </span>
                <span className="col grow" style={{ gap: 2 }}>
                  <span className="semi" style={{ fontSize: 14 }}>Start selling on STRYT</span>
                  <span className="tiny" style={{ fontWeight: 500 }}>List your shop or offer your services</span>
                </span>
                <ChevronRight size={18} color="var(--brand-300)" />
              </button>
            )}
          </div>

          {/* Settings — quiet, and last. */}
          <div className="page-pad">
            <button
              className="row gap-12"
              style={{ width: "100%", textAlign: "left", padding: "14px 16px", borderRadius: 18, background: "var(--surface)", border: "1px solid var(--line)" }}
              onClick={() => nav("/account")}
            >
              <Settings size={19} color="var(--ink-500)" />
              <span className="semi grow" style={{ fontSize: 14 }}>Settings & more</span>
              <span className="tiny">Preferences, support, log out</span>
              <ChevronRight size={18} color="var(--ink-300)" />
            </button>
          </div>

          <div className="page-pad" style={{ paddingTop: 0 }}>
            <AppUpdateButton />
          </div>

          <p className="tiny muted" style={{ textAlign: "center", padding: "8px 0 28px" }}>
            STRYT v0.1.0 · Made for your street
          </p>
        </div>
      </div>

      {/* ==========================================================
          DESKTOP-ONLY VIEW
         ========================================================== */}
      <div className="desktop-only" style={{ display: "flex", flexDirection: "column", width: "100%", padding: "24px 32px", boxSizing: "border-box", background: ambient.bgGradient, minHeight: "100vh", overflowY: "auto" }}>
        
        {/* Living Sky Card Header */}
        <header className="living-sky-header" style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: 20,
          padding: "24px 32px",
          marginBottom: 24,
          color: "#fff",
          background: ambient.headerGradient,
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.08)",
        }}>
          <AmbientSky dayPart={ambient.dayPartKey} effect={ambient.seasonEffect} glow={ambient.lampGlow} />
          <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="bold" style={{ fontSize: 22, letterSpacing: -0.5 }}>{t("profile")}</span>
            <div className="row gap-8">
              <button className="icon-btn" style={{ background: "rgba(255,255,255,0.16)", color: "#fff", position: "relative", border: "none" }} onClick={() => nav("/chats?scope=CUSTOMER")} aria-label="Messages">
                <MessageSquare size={18} />
                {chatUnread > 0 && (
                  <span style={{
                    position: "absolute", top: 5, right: 5,
                    width: 7, height: 7, background: "var(--red-500)",
                    borderRadius: "50%", border: "1.5px solid rgba(0,0,0,0.2)",
                  }} />
                )}
              </button>
              <button className="icon-btn" style={{ background: "rgba(255,255,255,0.16)", color: "#fff", position: "relative", border: "none" }} onClick={() => nav("/notifications?scope=CUSTOMER")} aria-label="Notifications">
                <Bell size={18} />
                {(custUnread ?? 0) > 0 && (
                  <span style={{
                    position: "absolute", top: 5, right: 5,
                    width: 7, height: 7, background: "var(--red-500)",
                    borderRadius: "50%", border: "1.5px solid rgba(0,0,0,0.2)",
                  }} />
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Dashboard Content Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 24, alignItems: "start" }}>
          
          {/* Left Column: Profile Card & Role Switcher */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            
            {/* Premium Profile Card */}
            <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", background: "#fff", borderRadius: 20 }}>
              <SafeImg
                src={user.avatar} alt="" variant="avatar" className="avatar"
                style={{ width: 90, height: 90, border: "4px solid var(--brand-100)", borderRadius: "50%", marginBottom: 16 }}
                onClick={() => nav(`/u/${user.id}`)}
              />
              <div className="row gap-6 center-h center-v" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span className="bold" style={{ fontSize: 22, color: "var(--ink-900)" }}>{displayName(user.name)}</span>
                <span className="badge" style={{ background: "var(--brand-50)", color: "var(--brand-600)", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, padding: "2px 8px", borderRadius: 6, border: "1px solid var(--brand-100)" }}>
                  {user.showNamePublicly ? "🌐 Public" : "🔒 Private"}
                </span>
              </div>
              
              <div style={{ marginTop: 6, color: "var(--ink-500)", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <span className="semi">{user.alias ? `@${user.alias}` : "@username"}</span>
                <span style={{ opacity: 0.5 }}>•</span>
                <span>📍 {user.area || "No location"}</span>
              </div>

              <div style={{ background: "var(--brand-50)", border: "1px solid var(--brand-100)", padding: "10px 14px", borderRadius: 14, marginTop: 18, width: "100%" }}>
                <span className="tiny semi" style={{ color: "var(--brand-700)", display: "block" }}>
                  {ambient.greeting} • {ambient.ambientSubtitle.toLowerCase()}
                </span>
              </div>

              <div className="row gap-8" style={{ marginTop: 22, width: "100%" }}>
                <button className="btn btn-sm btn-ghost grow" style={{ border: "1px solid var(--ink-200)", borderRadius: 10 }} onClick={() => nav("/profile/edit")}>
                  Edit Profile
                </button>
                <button className="btn btn-sm btn-ghost grow" style={{ border: "1px solid var(--ink-200)", borderRadius: 10 }} onClick={() => nav(`/u/${user.id}`)}>
                  <UserCircle size={16} /> Public Profile
                </button>
                <button className="icon-btn" style={{ border: "1px solid var(--ink-200)", borderRadius: 10, flexShrink: 0, padding: 8, background: "none" }} onClick={() => setShare(true)} aria-label="Share Profile">
                  <Share2 size={16} />
                </button>
              </div>
            </div>

            {/* Role Switcher */}
            <div className="card" style={{ padding: 20, background: "#fff", borderRadius: 20 }}>
              <div className="small semi" style={{ color: "var(--ink-600)", marginBottom: 12 }}>I'm using STRYT as a…</div>
              <div className="row gap-8">
                {(["customer", "business_owner", "provider"] as Role[]).map((r) => {
                  const has    = roles.includes(r);
                  const active = activeRole === r;
                  const M      = roleMeta[r];
                  const Icon   = M.icon;
                  return (
                    <button
                      key={r}
                      onClick={() => {
                        if (!has) {
                          nav(r === "business_owner" ? "/onboard/business" : "/onboard/provider");
                        } else if (r === "business_owner") {
                          nav(manageBizId ? `/business/${manageBizId}/manage` : "/manage");
                        } else if (r === "provider") {
                          nav(ownedProviderId ? `/provider/${ownedProviderId}/manage` : "/manage");
                        } else {
                          setActiveRole(r);
                        }
                      }}
                      className="col center"
                      style={{
                        flex: 1, gap: 6, padding: "12px 6px", borderRadius: 14,
                        border: active ? `2px solid ${M.color}` : "2px solid var(--ink-100)",
                        background: active ? M.bg : "#fff",
                        transition: "all 0.15s",
                        cursor: "pointer",
                      }}
                    >
                      <Icon size={22} color={M.color} />
                      <span className="tiny semi" style={{ color: active ? M.color : "var(--ink-600)" }}>{M.label}</span>
                      {!has && <span style={{ fontSize: 9, color: "var(--ink-400)", fontWeight: 700 }}>+ Add</span>}
                    </button>
                  );
                })}
              </div>
              {activeRole === "business_owner" && roles.includes("business_owner") && manageBizId && (
                <button className="btn btn-ghost btn-block btn-sm" style={{ marginTop: 12 }} onClick={() => nav(`/business/${manageBizId}/manage`)}>
                  Open business dashboard →
                </button>
              )}
              {activeRole === "provider" && roles.includes("provider") && ownedProviderId && (
                <button className="btn btn-ghost btn-block btn-sm" style={{ marginTop: 12 }} onClick={() => nav(`/provider/${ownedProviderId}/manage`)}>
                  Open provider dashboard →
                </button>
              )}
              <button className="row gap-6 center-v tiny semi" style={{ marginTop: 12, color: "var(--ink-500)", padding: "6px 2px", background: "none", border: "none", cursor: "pointer" }} onClick={() => setSwitcher(true)}>
                <ArrowLeftRight size={13} /> Switch or add another account
              </button>
            </div>
          </div>

          {/* Right Column: Stats, Highlights, Actions, More for You */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            
            {/* Stats strip */}
            <div className="row" style={{ background: "#fff", borderRadius: 20, padding: "20px 24px", boxShadow: "0 4px 20px rgba(0,0,0,0.02)", display: "flex", width: "100%" }}>
              {([
                { n: bookmarks.length, l: "Saved", onClick: () => nav("/bookmarks") },
                { n: follows.length, l: "Following", onClick: () => nav("/bookmarks?tab=following") },
                { n: followersCount, l: "Followers", onClick: () => nav("/followers") },
                { n: totalAgreements, l: "Deals", onClick: () => nav("/agreements"), active: activeAgreements.length },
              ] as const).map((s, i) => (
                <button
                  key={s.l}
                  onClick={s.onClick}
                  className="col center grow"
                  style={{ gap: 4, color: "var(--ink-800)", borderLeft: i > 0 ? "1px solid var(--ink-100)" : "none", position: "relative", background: "none", borderTop: "none", borderRight: "none", borderBottom: "none", cursor: "pointer" }}
                >
                  <span className="bold" style={{ fontSize: 24, lineHeight: 1.1, color: "var(--ink-900)" }}>{s.n}</span>
                  <span className="small semi muted">{s.l}</span>
                  {"active" in s && s.active > 0 && (
                    <span style={{ position: "absolute", top: 4, right: "50%", transform: "translateX(24px)", width: 8, height: 8, borderRadius: "50%", background: "var(--green-500)" }} />
                  )}
                </button>
              ))}
            </div>

            {/* Live Queue Banner */}
            {activeQueues.length > 0 && (
              <button
                className="card row gap-12 center-v"
                style={{ padding: 16, width: "100%", textAlign: "left", background: "var(--orange-50)", border: "1px solid var(--orange-200)", borderRadius: 20, cursor: "pointer" }}
                onClick={() => nav("/queues")}
              >
                <span style={{ fontSize: 26 }}>👥</span>
                <div className="grow">
                  <div className="semi" style={{ color: "var(--orange-800)" }}>In {activeQueues.length} live queue{activeQueues.length > 1 ? "s" : ""}</div>
                  <div className="tiny" style={{ color: "var(--orange-700)", marginTop: 2 }}>{activeQueues[0].businessName}{activeQueues.length > 1 ? ` +${activeQueues.length - 1} more` : ""} — tap to view position</div>
                </div>
                <ChevronRight size={20} color="var(--orange-400)" />
              </button>
            )}

            {/* Highlights */}
            {highlights.length > 0 && (
              <div className="card" style={{ padding: 20, background: "#fff", borderRadius: 20 }}>
                <div className="small semi muted" style={{ marginBottom: 12 }}>My Highlights</div>
                <div className="row gap-12" style={{ overflowX: "auto" }}>
                  {highlights.map((h, i) => (
                    <button key={h.id} className="col center" style={{ gap: 6, width: 68, flexShrink: 0, background: "none", border: "none", cursor: "pointer" }} onClick={() => setViewingHighlight(i)}>
                      <div style={{ width: 60, height: 60, borderRadius: "50%", padding: 2.5, background: "linear-gradient(135deg,var(--amber-500),var(--amber-500))" }}>
                        <SafeImg src={h.image} variant="photo" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", border: "2px solid #fff" }} />
                      </div>
                      <span className="tiny semi ellipsis" style={{ maxWidth: 62, textAlign: "center", color: "var(--ink-700)" }}>{h.caption || "Highlight"}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Same two groups as mobile — one shared vocabulary across both
                layouts, rather than "Quick Actions" here and something else
                there. */}
            <div className="card" style={{ padding: 24, background: "#fff", borderRadius: 20 }}>
              <div className="profile-eyebrow">Your activity</div>
              <TileGrid tiles={activityTiles} />
              <div className="profile-eyebrow" style={{ marginTop: 20 }}>You on STRYT</div>
              <TileGrid tiles={youTiles} />
            </div>

            {/* Saved lists / My activity now live in the tile grid above — a
                second copy here as menu rows was the same destination twice, in
                two visual languages. Only the seller entry point and settings
                remain, and they're genuinely different things. */}
            <div className="card" style={{ padding: 20, background: "#fff", borderRadius: 20 }}>
              <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid var(--ink-100)" }}>
                {hasSellerProfile && (
                  <MenuRow icon={<Store size={18} color="var(--orange-500)" />} label="Manage business & profile" onClick={() => nav("/manage")} />
                )}
                <MenuRow icon={<Settings size={18} color="var(--ink-600)" />} label="Settings & more" hint="Preferences, support, log out" onClick={() => nav("/account")} last />
              </div>
            </div>

            <div className="card" style={{ padding: 16, background: "#fff", borderRadius: 20, display: "flex", justifyContent: "center" }}>
              <AppUpdateButton />
            </div>

            <p className="tiny muted" style={{ textAlign: "center", padding: "12px 0 20px" }}>
              STRYT v0.1.0 · Made for your street
            </p>

          </div>

        </div>

      </div>

      {viewingHighlight !== null && (
        <StoryViewer stories={highlights} startIndex={viewingHighlight} onClose={() => setViewingHighlight(null)} />
      )}
      {switcher && <AccountSwitcher onClose={() => setSwitcher(false)} />}
      {share && (
        <ShareCard
          title={displayName(user.name)}
          subtitle={`Customer • ${user.area || "No location"}`}
          image={user.avatar}
          options={shareOptions}
          onClose={() => setShare(false)}
        />
      )}
    </div>
  );
}

/** A destination tile. Left-aligned with a subtitle, so you know what's inside
 *  before you tap — a bare "Requests" label makes you go look. */
function TileGrid({ tiles }: { tiles: { icon: React.ReactNode; label: string; sub: string; badge?: number; onClick: () => void }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
      {tiles.map((t) => (
        <button
          key={t.label}
          onClick={t.onClick}
          style={{
            display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8,
            padding: "14px 12px", borderRadius: 18, background: "var(--surface)",
            border: "1px solid var(--line)", boxShadow: "var(--shadow-sm)",
            textAlign: "left", position: "relative",
          }}
        >
          {t.badge ? <span className="count-badge feature-card-badge">{t.badge}</span> : null}
          {t.icon}
          <span style={{ minWidth: 0, width: "100%" }}>
            <span className="semi ellipsis" style={{ fontSize: 13.5, display: "block", color: "var(--ink-900)" }}>{t.label}</span>
            <span className="ellipsis" style={{ fontSize: 11, fontWeight: 500, color: "var(--ink-500)", display: "block", marginTop: 1 }}>{t.sub}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** A live, time-sensitive row (queue position, running deal). The accent stripe
 *  is what separates "this is happening now" from the rest of the page. */
function LiveRow({
  accent, tint, emoji, title, chip, chipBg, chipColor, sub, onClick,
}: {
  accent: string; tint: string; emoji: string; title: string;
  chip: string; chipBg: string; chipColor: string; sub: string; onClick: () => void;
}) {
  return (
    <button
      className="row gap-12"
      style={{
        width: "100%", textAlign: "left", padding: 14, borderRadius: 18,
        background: "var(--surface)", border: "1px solid var(--line)",
        borderLeft: `4px solid ${accent}`, boxShadow: "var(--shadow-sm)",
      }}
      onClick={onClick}
    >
      <span style={{ width: 38, height: 38, borderRadius: 11, background: tint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 18 }}>
        {emoji}
      </span>
      <span className="col grow" style={{ gap: 2, minWidth: 0 }}>
        <span className="row gap-6" style={{ minWidth: 0 }}>
          <span className="semi ellipsis" style={{ fontSize: 14 }}>{title}</span>
          <span className="badge" style={{ background: chipBg, color: chipColor, fontSize: 9.5, flexShrink: 0 }}>{chip}</span>
        </span>
        <span className="tiny ellipsis" style={{ fontWeight: 500 }}>{sub}</span>
      </span>
      <ChevronRight size={18} color="var(--ink-300)" />
    </button>
  );
}

function MenuRow({
  icon, label, hint, badge, onClick, last,
}: {
  icon: React.ReactNode; label: string; hint?: string; badge?: number; onClick: () => void; last?: boolean;
}) {
  return (
    <button
      className="row gap-12"
      style={{ width: "100%", padding: "14px 16px", borderBottom: last ? "none" : "1px solid var(--line)" }}
      onClick={onClick}
    >
      {icon}
      <span className="semi grow" style={{ textAlign: "left", fontSize: 15 }}>{label}</span>
      {hint && <span className="tiny muted">{hint}</span>}
      {badge && badge > 0 ? (
        <span className="badge badge-green" style={{ fontSize: 11 }}>{badge}</span>
      ) : null}
      <ChevronRight size={18} color="var(--ink-300)" />
    </button>
  );
}
