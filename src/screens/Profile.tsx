import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell, Settings, Store, Briefcase, FileText,
  ChevronRight, Share2, Pencil,
  Award, Users, UserCircle, Heart,
  ArrowLeftRight, MessageSquare, Image, ListChecks, Clock,
  Calendar, Globe, Lock, Handshake, MapPin
} from "@/components/Icons";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { SafeImg } from "@/components/common";
import { displayName } from "@/lib/publicName";
import AccountSwitcher from "@/components/AccountSwitcher";
import AppUpdateButton from "@/components/AppUpdateButton";
import { requestService, socialService, businessService, providerService, notificationService, appointmentService } from "@/services";
import { PLACEHOLDER_AVATAR, PLACEHOLDER_AVATAR_ALT, PLACEHOLDER_BUSINESS_COVER } from "@/lib/placeholders";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import type { Role, AgreementStatus } from "@/types";
import ShareCard, { type ShareOption } from "@/components/ShareCard";
import { StoryViewer } from "@/components/Stories";
import { useAmbientTheme } from "@/features/ambient/useAmbientTheme";
import AmbientSky from "@/features/ambient/AmbientSky";

const TERMINAL: AgreementStatus[] = ["COMPLETED", "CANCELLED", "DISPUTED"];

/** Hand a tile/row its two theme tokens as custom properties (never raw hex). */
function themed(tint: string, accent: string): React.CSSProperties {
  return { "--pf-tint": tint, "--pf-accent": accent } as React.CSSProperties;
}

type Tile = {
  icon: React.ReactNode; label: string; sub: string;
  tint: string; accent: string; badge?: number; onClick: () => void;
};

export default function Profile() {
  const nav = useNavigate();
  const { user, roles, activeRole, setActiveRole, attemptSwitchContext, bookmarks, follows, ownedBusinessIds, ownedProviderId, chatUnread } = useApp();
  const ambient = useAmbientTheme(user.lat, user.lng, "customer");
  const { t } = useI18n();
  const [switcher, setSwitcher] = useState(false);
  const [share, setShare] = useState(false);
  const [viewingHighlight, setViewingHighlight] = useState<number | null>(null);
  const manageBizId = ownedBusinessIds[0];
  const hasSellerProfile = ownedBusinessIds.length > 0 || !!ownedProviderId;
  const hasAlias = !!user.alias;

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
  // Needed to pass business/provider names into attemptSwitchContext so the
  // RoleSwitcher pill updates immediately when the user taps a role button.
  const { data: myBizList } = useQuery(() => businessService.mine(), []);
  const { data: myProvList } = useQuery(() => providerService.mine(), []);
  const myBiz = (myBizList ?? []).find((b) => b.id === manageBizId);
  const myProv = (myProvList ?? []).find((p) => p.id === ownedProviderId);
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

  const roleMeta: Record<Role, { label: string; icon: any; tint: string; accent: string }> = {
    customer:       { label: "Customer",  icon: Heart,     tint: "var(--brand-50)",   accent: "var(--brand-600)" },
    business_owner: { label: "Business",  icon: Store,     tint: "var(--orange-100)", accent: "var(--orange-500)" },
    provider:       { label: "Provider",  icon: Briefcase, tint: "var(--green-100)",  accent: "var(--green-600)" },
  };

  // Destinations, split into two labelled groups instead of one undifferentiated
  // 6-up. "Your activity" is things with live state (a count that changes);
  // "You on STRYT" is your identity/content. Same tile shape for both, so the
  // whole page speaks ONE visual language for "go somewhere".
  //
  // Map is deliberately excluded — it already lives in the bottom nav.
  const activityTiles: Tile[] = [
    { icon: <Calendar size={20} />, label: t("appointments"), sub: upcomingCount > 0 ? `${upcomingCount} upcoming` : "None upcoming", tint: "var(--brand-50)", accent: "var(--brand-600)", onClick: () => nav("/appointments") },
    { icon: <FileText size={20} />, label: t("requests"), sub: openRequestCount > 0 ? `${openRequestCount} open` : "None open", tint: "var(--brand-50)", accent: "var(--brand-700)", onClick: () => nav("/requests") },
    { icon: <Clock size={20} />, label: "Queues", sub: activeQueues.length > 0 ? `${activeQueues.length} active` : "Not in line", tint: "var(--amber-100)", accent: "var(--amber-700)", badge: activeQueues.length || undefined, onClick: () => nav("/queues") },
    { icon: <Award size={20} />, label: t("badges"), sub: badgeSub, tint: "var(--green-100)", accent: "var(--green-600)", onClick: () => nav("/achievements") },
  ];

  const youTiles: Tile[] = [
    { icon: <Users size={20} />, label: t("community"), sub: "Your street feed", tint: "var(--pink-100)", accent: "var(--pink-600)", onClick: () => nav("/community-hub") },
    { icon: <Image size={20} />, label: "My activity", sub: "Stories & posts", tint: "var(--pink-100)", accent: "var(--pink-600)", onClick: () => nav("/my-activity") },
    { icon: <ListChecks size={20} />, label: "Saved lists", sub: bookmarks.length > 0 ? `${bookmarks.length} saved` : "Nothing saved yet", tint: "var(--brand-50)", accent: "var(--brand-600)", onClick: () => nav("/lists") },
    { icon: <UserCircle size={20} />, label: "Public profile", sub: "How neighbours see you", tint: "var(--brand-50)", accent: "var(--brand-600)", onClick: () => nav(`/u/${user.id}`) },
  ];

  // The identity block: username-first. Your @handle is what neighbours see and
  // search for, so it leads; the real name sits under it, quiet and clearly
  // "yours only". Tapping anywhere on the block opens Edit, where the handle
  // lives — previously the only route to it, with no signpost from here.
  const IdentityBlock = () => (
    <button className="pf-identity" onClick={() => nav("/profile/edit")} aria-label="Edit your profile and handle">
      <SafeImg
        src={user.avatar} alt="" variant="avatar" className="avatar pf-avatar"
      />
      <div style={{ minWidth: 0 }}>
        <div className="row gap-6" style={{ minWidth: 0 }}>
          <span className="pf-hero-name ellipsis">
            {hasAlias ? `@${user.alias}` : displayName(user.name)}
          </span>
          <Pencil size={14} color="rgba(255,255,255,0.7)" style={{ flexShrink: 0 }} />
        </div>
        <div className="pf-hero-sub ellipsis">
          {hasAlias ? (
            <>{displayName(user.name)}{user.area ? ` · ${user.area}` : ""}</>
          ) : (
            <>Tap to set your public @handle</>
          )}
        </div>
      </div>
    </button>
  );

  return (
    <div className="screen with-nav" style={{ padding: 0 }}>
      {/* ==========================================================
          MOBILE-ONLY VIEW
         ========================================================== */}
      <div className="mobile-only screen-boxed" style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
        <div className="screen-scroll">
          {/* ── Identity ────────────────────────────────────────────────── */}
          <div className="pf-hero living-sky-header" style={{ background: ambient.headerGradient }}>
            <AmbientSky dayPart={ambient.dayPartKey} effect={ambient.seasonEffect} glow={ambient.lampGlow} />
            <div className="pf-hero-content">
              <div className="row between" style={{ alignItems: "flex-start" }}>
                <IdentityBlock />
                <div className="row gap-8" style={{ flexShrink: 0 }}>
                  <button className="icon-btn pf-glass-btn" style={{ position: "relative" }} onClick={() => nav("/chats?scope=CUSTOMER")} aria-label="Messages">
                    <MessageSquare size={18} />
                    {chatUnread > 0 && <span className="count-badge btn-badge">{chatUnread > 9 ? "9+" : chatUnread}</span>}
                  </button>
                  <button className="icon-btn pf-glass-btn" style={{ position: "relative" }} onClick={() => nav("/notifications?scope=CUSTOMER")} aria-label="Notifications">
                    <Bell size={18} />
                    {(custUnread ?? 0) > 0 && <span className="count-badge btn-badge count-badge-accent">{(custUnread ?? 0) > 9 ? "9+" : custUnread}</span>}
                  </button>
                </div>
              </div>

              {/* Privacy state + "see yourself as a neighbour does" are the same
                  question, so they're one control. */}
              <button className="pf-glass-row" onClick={() => nav(`/u/${user.id}`)}>
                {user.showNamePublicly ? <Globe size={15} /> : <Lock size={15} />}
                <span className="pf-glass-row-label grow">
                  {user.showNamePublicly ? "Your full name is public" : "Your full name is private"}
                </span>
                <span className="pf-glass-row-cta">
                  <UserCircle size={13} /> View as neighbour
                </span>
              </button>

              <div className="pf-hero-actions">
                <button className="btn btn-sm pf-edit-btn" onClick={() => nav("/profile/edit")}>
                  Edit profile
                </button>
                <button className="icon-btn pf-glass-btn" onClick={() => setShare(true)} aria-label="Share profile">
                  <Share2 size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Stats — on a real card so the dark block stays about identity. */}
          <div className="page-pad" style={{ paddingTop: 12, paddingBottom: 0 }}>
            <div className="card pf-stats">
              {([
                { n: bookmarks.length, l: "Saved", onClick: () => nav("/bookmarks") },
                { n: follows.length, l: "Following", onClick: () => nav("/bookmarks?tab=following") },
                { n: followersCount, l: "Followers", onClick: () => nav("/followers") },
                { n: totalAgreements, l: "Deals", onClick: () => nav("/agreements"), active: activeAgreements.length },
              ] as const).map((s) => (
                <button key={s.l} onClick={s.onClick} className="pf-stat">
                  <span className="pf-stat-num">{s.n}</span>
                  <span className="tiny">{s.l}</span>
                  {"active" in s && s.active > 0 && <span className="pf-stat-dot" />}
                </button>
              ))}
            </div>
          </div>

          {/* Highlights — your own story reel, so it belongs with identity. */}
          {highlights.length > 0 && (
            <div className="hscroll" style={{ padding: "14px 16px 0" }}>
              {highlights.map((h, i) => (
                <button key={h.id} className="pf-highlight" onClick={() => setViewingHighlight(i)}>
                  <div className="pf-highlight-ring">
                    <SafeImg src={h.image} variant="photo" className="pf-highlight-img" />
                  </div>
                  <span className="tiny semi ellipsis" style={{ maxWidth: 62, textAlign: "center" }}>{h.caption || "Highlight"}</span>
                </button>
              ))}
            </div>
          )}

          {/* ── Right now ────────────────────────────────────────────────── */}
          {(activeQueues.length > 0 || activeAgreements.length > 0) && (
            <div className="page-pad" style={{ paddingBottom: 0 }}>
              <div className="profile-eyebrow">Right now</div>
              <div className="col gap-10">
                {activeQueues.map((q) => (
                  <LiveRow
                    key={q.tokenId}
                    icon={<Users size={19} />}
                    tint="var(--amber-100)"
                    accent="var(--amber-500)"
                    title={q.businessName}
                    chip={q.status === "CALLED" ? "Your turn" : `You're #${q.position}`}
                    chipClass="badge-amber"
                    sub={q.status === "CALLED" ? "Head in now" : `~${q.estWaitMin ?? 0} min wait · tap to view position`}
                    onClick={() => nav("/queues")}
                  />
                ))}
                {activeAgreements.map((a) => (
                  <LiveRow
                    key={a.id}
                    icon={<Handshake size={19} />}
                    tint="var(--green-100)"
                    accent="var(--green-500)"
                    title={a.requestTitle}
                    chip={a.status === "PENDING" ? "Confirm" : "In progress"}
                    chipClass="badge-green"
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

          {/* ── Selling ────────────────────────────────────────────────── */}
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
                            const dest = manageBizId ? `/business/${manageBizId}/manage` : "/manage";
                            const ready = attemptSwitchContext(
                              { type: "business", id: manageBizId ?? null, name: myBiz?.name ?? "My Business" },
                              dest
                            );
                            if (ready) nav(dest);
                          } else if (r === "provider") {
                            const dest = ownedProviderId ? `/provider/${ownedProviderId}/manage` : "/manage";
                            const ready = attemptSwitchContext(
                              { type: "provider", id: ownedProviderId ?? null, name: myProv?.displayName ?? "My Provider Profile" },
                              dest
                            );
                            if (ready) nav(dest);
                          } else {
                            setActiveRole(r);
                          }
                        }}
                        className={`pf-role${active ? " active" : ""}`}
                        style={themed(M.tint, M.accent)}
                      >
                        <Icon size={22} color={M.accent} />
                        <span className="tiny semi" style={{ color: active ? M.accent : "var(--ink-600)" }}>{M.label}</span>
                        {!has && <span className="pf-role-add">+ Add</span>}
                      </button>
                    );
                  })}
                </div>
                <button className="pf-subtle-link" onClick={() => setSwitcher(true)}>
                  <ArrowLeftRight size={13} /> Switch or add another account
                </button>
              </div>
            ) : (
              <button className="pf-row pf-row-invite" style={themed("var(--surface)", "var(--brand-600)")} onClick={() => nav("/manage")}>
                <span className="pf-row-icon"><Store size={19} /></span>
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
            <button className="pf-row" onClick={() => nav("/account")}>
              <span className="pf-row-icon"><Settings size={19} /></span>
              <span className="semi grow" style={{ fontSize: 14 }}>Settings &amp; more</span>
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
          boxShadow: "var(--shadow-md)",
        }}>
          <AmbientSky dayPart={ambient.dayPartKey} effect={ambient.seasonEffect} glow={ambient.lampGlow} />
          <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="bold" style={{ fontSize: 22, letterSpacing: -0.5 }}>{t("profile")}</span>
            <div className="row gap-8">
              <button className="icon-btn pf-glass-btn" style={{ position: "relative" }} onClick={() => nav("/chats?scope=CUSTOMER")} aria-label="Messages">
                <MessageSquare size={18} />
                {chatUnread > 0 && <span className="count-badge btn-badge">{chatUnread > 9 ? "9+" : chatUnread}</span>}
              </button>
              <button className="icon-btn pf-glass-btn" style={{ position: "relative" }} onClick={() => nav("/notifications?scope=CUSTOMER")} aria-label="Notifications">
                <Bell size={18} />
                {(custUnread ?? 0) > 0 && <span className="count-badge btn-badge count-badge-accent">{(custUnread ?? 0) > 9 ? "9+" : custUnread}</span>}
              </button>
            </div>
          </div>
        </header>

        {/* Dashboard Content Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 24, alignItems: "start" }}>
          
          {/* Left Column: Profile Card & Role Switcher */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            
            {/* Premium Profile Card */}
            <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", borderRadius: 20 }}>
              <SafeImg
                src={user.avatar} alt="" variant="avatar" className="avatar"
                style={{ width: 90, height: 90, border: "4px solid var(--brand-100)", marginBottom: 16, cursor: "pointer" }}
                onClick={() => nav(`/u/${user.id}`)}
              />
              <div className="row gap-6 center">
                <span className="bold" style={{ fontSize: 20, color: "var(--ink-900)" }}>
                  {hasAlias ? `@${user.alias}` : displayName(user.name)}
                </span>
                <span className="badge badge-purple">
                  {user.showNamePublicly ? <Globe size={11} /> : <Lock size={11} />}
                  {user.showNamePublicly ? "Public" : "Private"}
                </span>
              </div>

              <div className="small muted row gap-6 center" style={{ marginTop: 6, flexWrap: "wrap" }}>
                {hasAlias && <span className="semi">{displayName(user.name)}</span>}
                {hasAlias && <span style={{ opacity: 0.5 }}>·</span>}
                <span className="row gap-4" style={{ alignItems: "center" }}><MapPin size={13} /> {user.area || "No location"}</span>
              </div>

              <div style={{ background: "var(--brand-50)", border: "1px solid var(--brand-100)", padding: "10px 14px", borderRadius: "var(--radius)", marginTop: 18, width: "100%" }}>
                <span className="tiny semi" style={{ color: "var(--brand-700)", display: "block" }}>
                  {ambient.greeting} • {ambient.ambientSubtitle.toLowerCase()}
                </span>
              </div>

              <div className="row gap-8" style={{ marginTop: 22, width: "100%" }}>
                <button className="btn btn-sm btn-outline grow" onClick={() => nav("/profile/edit")}>
                  Edit profile
                </button>
                <button className="btn btn-sm btn-outline grow" onClick={() => nav(`/u/${user.id}`)}>
                  <UserCircle size={16} /> Public profile
                </button>
                <button className="icon-btn" style={{ flexShrink: 0 }} onClick={() => setShare(true)} aria-label="Share profile">
                  <Share2 size={16} />
                </button>
              </div>
            </div>

            {/* Role Switcher */}
            <div className="card" style={{ padding: 20, borderRadius: 20 }}>
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
                      className={`pf-role${active ? " active" : ""}`}
                      style={themed(M.tint, M.accent)}
                    >
                      <Icon size={22} color={M.accent} />
                      <span className="tiny semi" style={{ color: active ? M.accent : "var(--ink-600)" }}>{M.label}</span>
                      {!has && <span className="pf-role-add">+ Add</span>}
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
              <button className="pf-subtle-link" onClick={() => setSwitcher(true)}>
                <ArrowLeftRight size={13} /> Switch or add another account
              </button>
            </div>
          </div>

          {/* Right Column: Stats, Highlights, Actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            
            {/* Stats strip */}
            <div className="card pf-stats" style={{ borderRadius: 20 }}>
              {([
                { n: bookmarks.length, l: "Saved", onClick: () => nav("/bookmarks") },
                { n: follows.length, l: "Following", onClick: () => nav("/bookmarks?tab=following") },
                { n: followersCount, l: "Followers", onClick: () => nav("/followers") },
                { n: totalAgreements, l: "Deals", onClick: () => nav("/agreements"), active: activeAgreements.length },
              ] as const).map((s) => (
                <button key={s.l} onClick={s.onClick} className="pf-stat">
                  <span className="pf-stat-num" style={{ fontSize: 24 }}>{s.n}</span>
                  <span className="small semi muted">{s.l}</span>
                  {"active" in s && s.active > 0 && <span className="pf-stat-dot" />}
                </button>
              ))}
            </div>

            {/* Right now — same live rows as mobile, one shared vocabulary. */}
            {(activeQueues.length > 0 || activeAgreements.length > 0) && (
              <div className="card" style={{ borderRadius: 20 }}>
                <div className="profile-eyebrow">Right now</div>
                <div className="col gap-10">
                  {activeQueues.map((q) => (
                    <LiveRow
                      key={q.tokenId}
                      icon={<Users size={19} />}
                      tint="var(--amber-100)"
                      accent="var(--amber-500)"
                      title={q.businessName}
                      chip={q.status === "CALLED" ? "Your turn" : `You're #${q.position}`}
                      chipClass="badge-amber"
                      sub={q.status === "CALLED" ? "Head in now" : `~${q.estWaitMin ?? 0} min wait · tap to view position`}
                      onClick={() => nav("/queues")}
                    />
                  ))}
                  {activeAgreements.map((a) => (
                    <LiveRow
                      key={a.id}
                      icon={<Handshake size={19} />}
                      tint="var(--green-100)"
                      accent="var(--green-500)"
                      title={a.requestTitle}
                      chip={a.status === "PENDING" ? "Confirm" : "In progress"}
                      chipClass="badge-green"
                      sub={`with ${a.responderUserId === user.id ? a.requesterName : a.responderName}`}
                      onClick={() => nav(`/agreement/${a.id}`)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Highlights */}
            {highlights.length > 0 && (
              <div className="card" style={{ padding: 20, borderRadius: 20 }}>
                <div className="profile-eyebrow">My highlights</div>
                <div className="row gap-12" style={{ overflowX: "auto" }}>
                  {highlights.map((h, i) => (
                    <button key={h.id} className="pf-highlight" onClick={() => setViewingHighlight(i)}>
                      <div className="pf-highlight-ring">
                        <SafeImg src={h.image} variant="photo" className="pf-highlight-img" />
                      </div>
                      <span className="tiny semi ellipsis" style={{ maxWidth: 62, textAlign: "center", color: "var(--ink-700)" }}>{h.caption || "Highlight"}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Same two groups as mobile — one shared vocabulary across both. */}
            <div className="card" style={{ padding: 24, borderRadius: 20 }}>
              <div className="profile-eyebrow">Your activity</div>
              <TileGrid tiles={activityTiles} />
              <div className="profile-eyebrow" style={{ marginTop: 20 }}>You on STRYT</div>
              <TileGrid tiles={youTiles} />
            </div>

            {/* Seller entry + settings — genuinely different destinations. */}
            <div className="col gap-10">
              {hasSellerProfile && (
                <button className="pf-row" style={themed("var(--orange-100)", "var(--orange-500)")} onClick={() => nav("/manage")}>
                  <span className="pf-row-icon"><Store size={19} /></span>
                  <span className="semi grow" style={{ fontSize: 14 }}>Manage business &amp; profile</span>
                  <ChevronRight size={18} color="var(--ink-300)" />
                </button>
              )}
              <button className="pf-row" onClick={() => nav("/account")}>
                <span className="pf-row-icon"><Settings size={19} /></span>
                <span className="semi grow" style={{ fontSize: 14 }}>Settings &amp; more</span>
                <span className="tiny">Preferences, support, log out</span>
                <ChevronRight size={18} color="var(--ink-300)" />
              </button>
            </div>

            <div className="card" style={{ padding: 16, borderRadius: 20, display: "flex", justifyContent: "center" }}>
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
 *  before you tap. The icon sits in a tinted chip themed by two tokens. */
function TileGrid({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="pf-tiles">
      {tiles.map((t) => (
        <button key={t.label} onClick={t.onClick} className="pf-tile" style={themed(t.tint, t.accent)}>
          {t.badge ? <span className="count-badge feature-card-badge">{t.badge}</span> : null}
          <span className="pf-tile-icon">{t.icon}</span>
          <span className="pf-tile-body">
            <span className="pf-tile-label ellipsis">{t.label}</span>
            <span className="pf-tile-sub ellipsis">{t.sub}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** A live, time-sensitive row (queue position, running deal). The accent stripe
 *  is what separates "this is happening now" from the rest of the page. */
function LiveRow({
  icon, tint, accent, title, chip, chipClass, sub, onClick,
}: {
  icon: React.ReactNode; tint: string; accent: string; title: string;
  chip: string; chipClass: string; sub: string; onClick: () => void;
}) {
  return (
    <button className="pf-live" style={themed(tint, accent)} onClick={onClick}>
      <span className="pf-chip-icon">{icon}</span>
      <span className="col grow" style={{ gap: 2, minWidth: 0 }}>
        <span className="row gap-6" style={{ minWidth: 0 }}>
          <span className="semi ellipsis" style={{ fontSize: 14 }}>{title}</span>
          <span className={`badge ${chipClass}`} style={{ fontSize: 9.5, flexShrink: 0 }}>{chip}</span>
        </span>
        <span className="tiny ellipsis" style={{ fontWeight: 500 }}>{sub}</span>
      </span>
      <ChevronRight size={18} color="var(--ink-300)" />
    </button>
  );
}
