import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell, Settings, Store, FileText,
  ChevronRight, Share2, Pencil,
  Award, Users, UserCircle,
  MessageSquare, Image, ListChecks, Clock,
  Calendar, Globe, Lock, Handshake, MapPin
} from "@/components/Icons";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { SafeImg } from "@/components/common";
import { displayName } from "@/lib/publicName";
import HatSwitcherCard from "@/components/HatSwitcherCard";
import AvatarRing from "@/components/AvatarRing";
import AvatarActionSheet from "@/components/AvatarActionSheet";
import PhotoViewer from "@/components/PhotoViewer";
import { requestService, socialService, businessService, notificationService, appointmentService } from "@/services";
import { PLACEHOLDER_AVATAR, PLACEHOLDER_AVATAR_ALT, PLACEHOLDER_BUSINESS_COVER } from "@/lib/placeholders";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import type { AgreementStatus } from "@/types";
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
  const { user, bookmarks, follows, lists, ownedBusinessIds, ownedProviderId, chatUnread } = useApp();
  const ambient = useAmbientTheme(user.lat, user.lng, "customer");
  const { t } = useI18n();
  const [share, setShare] = useState(false);
  const [viewingHighlight, setViewingHighlight] = useState<number | null>(null);
  const [avatarSheet, setAvatarSheet] = useState(false);
  const [viewingAvatarPhoto, setViewingAvatarPhoto] = useState(false);
  const manageBizId = ownedBusinessIds[0];
  const hasSellerProfile = ownedBusinessIds.length > 0 || !!ownedProviderId;
  const hasAlias = !!user.alias;

  const getFirstName = (name: string) => name.split(" ")[0] || "My";

  const { data: myBizList } = useQuery(
    () => (ownedBusinessIds.length > 0 ? businessService.mine() : Promise.resolve([])),
    [ownedBusinessIds.join(",")],
    `profile:my-biz:${user.id}`
  );

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

  
  // Up to 5 businesses per owner (trg_enforce_business_owner_limit) — one
  // share entry per business, not just the first, each with its real name
  // once myBizList has loaded (falls back to a generic label until then).
  ownedBusinessIds.forEach((bizId, i) => {
    const biz = (myBizList ?? []).find((b) => b.id === bizId);
    shareOptions.push({
      role: "business_owner",
      label: ownedBusinessIds.length > 1 ? (biz?.name ?? `Shop Profile ${i + 1}`) : "Shop Profile",
      url: window.location.origin + "/business/" + bizId,
      title: biz?.name ?? `${getFirstName(displayName(user.name, "My"))}'s Shop`,
      subtitle: "Local Business on Stryt",
      image: biz?.coverImage || PLACEHOLDER_BUSINESS_COVER,
      meta: "Shops & Deals"
    });
  });

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

  const { data: agreementsData } = useQuery(() => requestService.agreements(), [], `home:agreements:${user.id}`);
  const { data: followersData } = useQuery(() => user.id ? socialService.followers(user.id) : Promise.resolve([]), [user.id], `profile:followers:${user.id}`);
  const followersCount = followersData?.length ?? 0;
  const activeAgreements = (agreementsData ?? []).filter((a) => !TERMINAL.includes(a.status));
  const totalAgreements  = agreementsData?.length ?? 0;

  const { data: myQueuesData } = useQueryWithRealtime(() => businessService.myQueues(), "queue_tokens", [user.id], user.id ? `customer_user_id=eq.${user.id}` : undefined, `home:queues:${user.id}`);
  const activeQueues = (myQueuesData ?? []).filter((q) => q.status === "WAITING" || q.status === "CALLED");

  // Tile subtitles are only worth showing if they're TRUE — a tile that says
  // "2 upcoming" and is wrong is worse than one that says nothing. So the two
  // counts that need a fetch get one, and everything else uses a static
  // descriptor rather than a number we haven't actually loaded.
  const { data: myAppointments } = useQuery(() => user.id ? appointmentService.listForCustomer(user.id) : Promise.resolve([]), [user.id], `home:appointments:${user.id}`);
  const upcomingCount = (myAppointments ?? []).filter(
    (a) => (a.status === "PENDING" || a.status === "ACCEPTED") && new Date(a.scheduledForISO).getTime() > Date.now()
  ).length;

  const { data: myRequests } = useQuery(() => user.id ? requestService.mine() : Promise.resolve([]), [user.id], `profile:my-requests:${user.id}`);
  const openRequestCount = (myRequests ?? []).filter((r) => r.status === "OPEN").length;

  // Mirrors what the Achievements screen itself says in its own subtitle
  // ("X of Y unlocked") so the tile and the destination can't disagree.
  const { data: achievementsData } = useQuery(() => socialService.achievements(), [user.id], `profile:achievements:${user.id}`);
  const badgeSub = achievementsData
    ? `${achievementsData.filter((a) => a.unlocked).length} of ${achievementsData.length} unlocked`
    : "Your achievements";

  const { data: custUnread } = useQueryWithRealtime(() => notificationService.getUnreadCount({ scope: "CUSTOMER" }), "notifications", [], undefined, "notif:customer");

  const { data: highlightsData } = useQuery(() => socialService.myHighlights(), [user.id], `profile:highlights:${user.id}`);
  const highlights = highlightsData ?? [];

  // Destinations, split into two labelled groups instead of one undifferentiated
  // 6-up. "Your activity" is things with live state (a count that changes);
  // "You on STRYT" is your identity/content. Same tile shape for both, so the
  // whole page speaks ONE visual language for "go somewhere".
  //
  // Map is deliberately excluded — it already lives in the bottom nav.
  const activityTiles: Tile[] = [
    { icon: <Calendar size={20} />, label: t("appointments"), sub: upcomingCount > 0 ? `${upcomingCount} upcoming` : "None upcoming", tint: "var(--brand-50)", accent: "var(--brand-600)", onClick: () => nav("/appointments") },
    // "My requests" + ?tab=mine: the count below is YOUR open requests
    // (requestService.mine), so the tile must open that tab — the default
    // "nearby" tab is everyone else's feed, which made the number and the
    // destination describe two different lists.
    { icon: <FileText size={20} />, label: "My requests", sub: openRequestCount > 0 ? `${openRequestCount} open` : "None open", tint: "var(--brand-50)", accent: "var(--brand-700)", onClick: () => nav("/requests?tab=mine") },
    { icon: <Clock size={20} />, label: "Queues", sub: activeQueues.length > 0 ? `${activeQueues.length} active` : "Not in line", tint: "var(--amber-100)", accent: "var(--amber-700)", badge: activeQueues.length || undefined, onClick: () => nav("/queues") },
    { icon: <Award size={20} />, label: t("badges"), sub: badgeSub, tint: "var(--green-100)", accent: "var(--green-600)", onClick: () => nav("/achievements") },
  ];

  const youTiles: Tile[] = [
    { icon: <Users size={20} />, label: t("community"), sub: "Neighbourhood feed", tint: "var(--pink-100)", accent: "var(--pink-600)", onClick: () => nav("/community-hub") },
    { icon: <Image size={20} />, label: "My activity", sub: "Stories & posts", tint: "var(--pink-100)", accent: "var(--pink-600)", onClick: () => nav("/my-activity") },
    // Counts `lists`, not `bookmarks` — /lists renders user-created lists, a
    // different collection entirely. Showing the bookmark count here meant
    // "7 saved" could open a completely empty screen. Bookmarks have their own
    // entry: the "Saved" stat above, which goes to /bookmarks.
    { icon: <ListChecks size={20} />, label: "My lists", sub: lists.length > 0 ? `${lists.length} ${lists.length === 1 ? "list" : "lists"}` : "No lists yet", tint: "var(--brand-50)", accent: "var(--brand-600)", onClick: () => nav("/lists") },
    { icon: <UserCircle size={20} />, label: "Public profile", sub: "How neighbours see you", tint: "var(--brand-50)", accent: "var(--brand-600)", onClick: () => nav(`/u/${user.id}`) },
  ];

  // The identity block: username-first. Your @handle is what neighbours see and
  // search for, so it leads; the real name sits under it, quiet and clearly
  // "yours only".
  //
  // This block is DELIBERATELY not tappable. It used to be one big button to
  // /profile/edit, so glancing at your own name — or trying to select it —
  // threw you into an edit form you hadn't asked for. Editing has its own
  // explicit button ("Edit profile", below), which is the only route now.
  //
  // The one exception is a user with no @handle yet: that sub-line is a real
  // call to action rather than a label, so it stays a button. Everyone on the
  // current DB has an alias, so this is the rare path.
  const IdentityBlock = () => (
    <div className="pf-identity">
      <AvatarRing size={112} onClick={() => setAvatarSheet(true)} ariaLabel="Profile photo options">
        <SafeImg
          src={user.avatar} alt="" variant="avatar"
          style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", border: "3px solid #fff", display: "block" }}
        />
      </AvatarRing>
      <div style={{ minWidth: 0, width: "100%" }}>
        <div className="row gap-6 center" style={{ minWidth: 0 }}>
          {/* No pencil icon here any more — it advertised a tap target that
              should not exist on the name itself. */}
          <span className="pf-hero-name ellipsis">
            {hasAlias ? `@${user.alias}` : displayName(user.name)}
          </span>
        </div>
        {hasAlias ? (
          <div className="pf-hero-sub ellipsis center">
            {displayName(user.name)}{user.area ? ` · ${user.area}` : ""}
          </div>
        ) : (
          <button
            className="pf-hero-sub ellipsis row gap-4 center"
            onClick={() => nav("/profile/edit")}
            style={{ background: "none", border: "none", padding: 0, width: "100%" }}
          >
            Set your public @handle
            <Pencil size={12} color="rgba(255,255,255,0.7)" style={{ flexShrink: 0 }} />
          </button>
        )}
      </div>
    </div>
  );

  // paddingBottom deliberately omitted below — see Home.tsx's identical fix:
  // the old shorthand `padding: 0` here overrode .with-nav's bottom clearance
  // for the fixed nav bar (inline styles always win over a class for the same
  // property), so Profile's last content — the version footer — rendered
  // underneath the nav bar.
  return (
    <div className="screen with-nav" style={{ paddingTop: 0, paddingLeft: 0, paddingRight: 0 }}>
      {/* ==========================================================
          MOBILE-ONLY VIEW
         ========================================================== */}
      <div className="mobile-only screen-boxed" style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
        <div className="screen-scroll">
          {/* ── Identity ────────────────────────────────────────────────── */}
          <div className="pf-hero living-sky-header" style={{ background: ambient.headerGradient }}>
            <AmbientSky dayPart={ambient.dayPartKey} effect={ambient.seasonEffect} glow={ambient.lampGlow} />
            <div className="pf-hero-content">
              <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginBottom: 6 }}>
                <button className="icon-btn pf-glass-btn" style={{ position: "relative" }} onClick={() => nav("/chats?scope=CUSTOMER")} aria-label="Messages">
                  <MessageSquare size={18} />
                  {chatUnread > 0 && <span className="count-badge btn-badge">{chatUnread > 9 ? "9+" : chatUnread}</span>}
                </button>
                <button className="icon-btn pf-glass-btn" style={{ position: "relative" }} onClick={() => nav("/notifications?scope=CUSTOMER")} aria-label="Notifications">
                  <Bell size={18} />
                  {(custUnread ?? 0) > 0 && <span className="count-badge btn-badge count-badge-accent">{(custUnread ?? 0) > 9 ? "9+" : custUnread}</span>}
                </button>
              </div>

              <IdentityBlock />

              {/* Leads with what the row DOES (opens your public profile).
                  The name-privacy state rides along as a status, not as the
                  label — worded as a state with a Globe/Lock it read like a
                  toggle, but tapping it never changed anything (that switch
                  lives in Edit profile → Privacy). */}
              <button className="pf-glass-row" onClick={() => nav(`/u/${user.id}`)} aria-label="View your public profile">
                <UserCircle size={15} />
                <span className="pf-glass-row-label grow">View your public profile</span>
                <span className="pf-glass-row-cta">
                  {user.showNamePublicly ? <Globe size={13} /> : <Lock size={13} />}
                  {user.showNamePublicly ? "Name public" : "Name private"}
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

          {/* ── Selling / hat switching ── */}
          <div className="page-pad" style={{ paddingBottom: 0 }}>
            <HatSwitcherCard />
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

          <p className="tiny muted" style={{ textAlign: "center", padding: "8px 0 28px" }}>
            STRYT v{__APP_VERSION__} · Made for your street
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
              <AvatarRing size={96} onClick={() => setAvatarSheet(true)} ariaLabel="Profile photo options" style={{ marginBottom: 16 }}>
                <SafeImg
                  src={user.avatar} alt="" variant="avatar"
                  style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", border: "3px solid #fff", display: "block" }}
                />
              </AvatarRing>
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

            <HatSwitcherCard />
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

            {/* Seller entry + settings — genuinely different destinations.
                Both states render on both platforms: a seller gets "Manage",
                a non-seller gets the invite. Previously desktop only had the
                first and mobile only had the second, so a desktop customer had
                no way into selling at all from this screen. */}
            <div className="col gap-10">
              {hasSellerProfile ? (
                <button className="pf-row" style={themed("var(--orange-100)", "var(--orange-500)")} onClick={() => nav("/manage")}>
                  <span className="pf-row-icon"><Store size={19} /></span>
                  <span className="semi grow" style={{ fontSize: 14 }}>Manage business &amp; profile</span>
                  <ChevronRight size={18} color="var(--ink-300)" />
                </button>
              ) : (
                <button className="pf-row pf-row-invite" style={themed("var(--surface)", "var(--brand-600)")} onClick={() => nav("/manage")}>
                  <span className="pf-row-icon"><Store size={19} /></span>
                  <span className="col grow" style={{ gap: 2, textAlign: "left" }}>
                    <span className="semi" style={{ fontSize: 14 }}>Start selling on STRYT</span>
                    <span className="tiny" style={{ fontWeight: 500 }}>List your shop or offer your services</span>
                  </span>
                  <ChevronRight size={18} color="var(--brand-300)" />
                </button>
              )}
              <button className="pf-row" onClick={() => nav("/account")}>
                <span className="pf-row-icon"><Settings size={19} /></span>
                <span className="semi grow" style={{ fontSize: 14 }}>Settings &amp; more</span>
                <span className="tiny">Preferences, support, log out</span>
                <ChevronRight size={18} color="var(--ink-300)" />
              </button>
            </div>

            <p className="tiny muted" style={{ textAlign: "center", padding: "12px 0 20px" }}>
              STRYT v{__APP_VERSION__} · Made for your street
            </p>

          </div>

        </div>

      </div>

      {viewingHighlight !== null && (
        <StoryViewer stories={highlights} startIndex={viewingHighlight} onClose={() => setViewingHighlight(null)} />
      )}
      {avatarSheet && (
        <AvatarActionSheet
          onClose={() => setAvatarSheet(false)}
          onViewPhoto={() => { setAvatarSheet(false); setViewingAvatarPhoto(true); }}
        />
      )}
      {viewingAvatarPhoto && (
        <PhotoViewer photos={[{ url: user.avatar || PLACEHOLDER_AVATAR }]} startIndex={0} onClose={() => setViewingAvatarPhoto(false)} />
      )}
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
