import { useMemo, useState } from "react";
import { isAgreementClosed } from "@/lib/machines/agreement";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import {
  Award, Bell, Bookmark, Calendar, ChevronRight, Clock, Download, FileText,
  Globe, Handshake, HelpCircle, Image, Key, ListChecks, Lock, LogOut, MapPin,
  MessageSquare, Pencil, Share2, Shield, Sliders, Store, UserCircle, UserPlus, Users,
} from "@/components/Icons";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { SafeImg } from "@/components/common";
import { displayName } from "@/lib/publicName";
import HatSwitcherCard from "@/components/HatSwitcherCard";
import AccountSwitcher from "@/components/AccountSwitcher";
import AvatarRing from "@/components/AvatarRing";
import AvatarActionSheet from "@/components/AvatarActionSheet";
import PhotoViewer from "@/components/PhotoViewer";
import CustomerDirectory from "@/components/profile/CustomerDirectory";
import type { DirectoryGroup } from "@/components/profile/directoryFilter";
import { requestService, socialService, businessService, appointmentService } from "@/services";
import { isLiveOrder, isOrderActivity } from "@/lib/orderLists";
import { PLACEHOLDER_AVATAR, PLACEHOLDER_AVATAR_ALT, PLACEHOLDER_BUSINESS_COVER } from "@/lib/placeholders";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import ShareCard from "@/components/ShareCard";
import type { ShareSubject } from "@/lib/share";
import { StoryViewer } from "@/components/Stories";
import { useAmbientTheme } from "@/features/ambient/useAmbientTheme";
import AmbientSky from "@/features/ambient/AmbientSky";
import { APK_DOWNLOAD_URL, APK_FILENAME } from "@/lib/apkDownload";

/** Hand a live row its two theme tokens as custom properties (never raw hex). */
function themed(tint: string, accent: string): React.CSSProperties {
  return { "--pf-tint": tint, "--pf-accent": accent } as React.CSSProperties;
}

export default function Profile() {
  const nav = useNavigate();
  const { user, bookmarks, follows, lists, ownedBusinessIds, ownedProviderId, chatUnread, notifUnread, signOut } = useApp();
  const ambient = useAmbientTheme(user.lat, user.lng, "customer");
  const { t, tf } = useI18n();
  const [share, setShare] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  const [viewingHighlight, setViewingHighlight] = useState<number | null>(null);
  const [avatarSheet, setAvatarSheet] = useState(false);
  const [viewingAvatarPhoto, setViewingAvatarPhoto] = useState(false);
  const hasSellerProfile = ownedBusinessIds.length > 0 || !!ownedProviderId;
  const hasAlias = !!user.alias;
  const isAdmin =
    (user.roles as string[]).includes("admin") ||
    (user.roles as string[]).includes("super_admin");

  const getFirstName = (name: string) => name.split(" ")[0] || "My";

  const { data: myBizList } = useQuery(
    () => (ownedBusinessIds.length > 0 ? businessService.mine() : Promise.resolve([])),
    [ownedBusinessIds.join(",")],
    `profile:my-biz:${user.id}`
  );

  // One subject per identity you can share as. Each carries its OWN
  // capabilities so picking "Shop Profile" surfaces that shop's counter
  // stand and payment QR while "Personal Profile" offers neither.
  const shareSubjects: ShareSubject[] = [
    {
      kind: "person",
      id: user.id,
      label: "Personal Profile",
      title: displayName(user.name),
      subtitle: `Customer • ${user.area || "No location"}`,
      image: user.avatar || PLACEHOLDER_AVATAR,
      meta: (user.ratingCount ?? 0) > 0 ? `⭐ ${user.ratingAvg} (${user.ratingCount})` : "New member",
    },
  ];

  ownedBusinessIds.forEach((bizId, i) => {
    const biz = (myBizList ?? []).find((b) => b.id === bizId);
    shareSubjects.push({
      kind: "business",
      id: bizId,
      viewerManages: true,
      upiId: biz?.upiId,
      label: ownedBusinessIds.length > 1 ? (biz?.name ?? `Shop Profile ${i + 1}`) : "Shop Profile",
      title: biz?.name ?? `${getFirstName(displayName(user.name, "My"))}'s Shop`,
      subtitle: "Local Business on Stryt",
      image: biz?.coverImage || PLACEHOLDER_BUSINESS_COVER,
      meta: "Shops & Deals",
    });
  });

  if (ownedProviderId) {
    shareSubjects.push({
      kind: "provider",
      id: ownedProviderId,
      viewerManages: true,
      label: "Provider Profile",
      title: displayName(user.name, "Service Provider"),
      subtitle: "Professional Provider on Stryt",
      image: user.avatar || PLACEHOLDER_AVATAR_ALT,
      meta: "Services & Work",
    });
  }

  const { data: agreementsData } = useQuery(() => requestService.agreements(), [], `home:agreements:${user.id}`);
  const { data: followersData } = useQuery(() => (user.id ? socialService.followers(user.id) : Promise.resolve([])), [user.id], `profile:followers:${user.id}`);
  const followersCount = followersData?.length ?? 0;
  const activeAgreements = (agreementsData ?? []).filter((a) => !isAgreementClosed(a.status));
  const totalAgreements = agreementsData?.length ?? 0;

  const { data: myQueuesData } = useQueryWithRealtime(
    () => businessService.myQueues(),
    "queue_tokens",
    [user.id],
    user.id ? `customer_user_id=eq.${user.id}` : undefined,
    `home:queues:${user.id}`
  );
  const activeQueues = (myQueuesData ?? []).filter((q) => q.status === "WAITING" || q.status === "CALLED");

  const { data: myAppointments } = useQuery(
    () => (user.id ? appointmentService.listForCustomer(user.id) : Promise.resolve([])),
    [user.id],
    `home:appointments:${user.id}`
  );
  const upcomingCount = (myAppointments ?? []).filter((a) => !isOrderActivity(a) && isLiveOrder(a)).length;
  const activeOrdersCount = (myAppointments ?? []).filter((a) => isOrderActivity(a) && isLiveOrder(a)).length;
  const totalOrdersCount = (myAppointments ?? []).filter(isOrderActivity).length;

  const { data: myRequests } = useQuery(() => (user.id ? requestService.mine() : Promise.resolve([])), [user.id], `profile:my-requests:${user.id}`);
  const openRequestCount = (myRequests ?? []).filter((r) => r.status === "OPEN").length;

  const { data: achievementsData } = useQuery(() => socialService.achievements(), [user.id], `profile:achievements:${user.id}`);
  const unlockedCount = achievementsData ? achievementsData.filter((a) => a.unlocked).length : 0;
  const badgeValue = achievementsData ? `${unlockedCount}/${achievementsData.length}` : undefined;

  const { data: highlightsData } = useQuery(() => socialService.myHighlights(), [user.id], `profile:highlights:${user.id}`);
  const highlights = highlightsData ?? [];

  const activeDealsCount = activeAgreements.length + activeOrdersCount;
  const totalDealsCount = totalAgreements + totalOrdersCount;

  const directoryGroups = useMemo<DirectoryGroup[]>(() => {
    const buildGroups = (includeHatSlot: boolean): DirectoryGroup[] => [
      {
        id: "account",
        title: t("prof_sec_account"),
        rows: [
          {
            id: "account-center",
            icon: <UserCircle size={21} color="var(--brand-600)" />,
            label: t("prof_account_center"),
            hint: t("prof_account_center_hint"),
            keywords: "account settings privacy password security notifications discovery language data delete",
            onClick: () => nav("/account"),
          },
          {
            id: "edit-profile",
            icon: <Pencil size={19} />,
            label: "Edit profile",
            keywords: "name alias handle avatar area bio",
            onClick: () => nav("/profile/edit"),
          },
          {
            id: "public-profile",
            icon: user.showNamePublicly ? <Globe size={19} /> : <Lock size={19} />,
            label: t("prof_view_public"),
            value: user.showNamePublicly ? "Public" : "Private",
            keywords: "public profile privacy visibility name",
            onClick: () => nav(`/u/${user.id}`),
          },
        ],
      },
      {
        id: "activity",
        title: t("prof_sec_how_use"),
        rows: [
          {
            id: "saved",
            icon: <Bookmark size={19} />,
            label: t("prof_row_saved"),
            value: bookmarks.length > 0 ? String(bookmarks.length) : undefined,
            keywords: "bookmarks favorites shops saved",
            onClick: () => nav("/bookmarks"),
          },
          {
            id: "lists",
            icon: <ListChecks size={19} />,
            label: t("prof_row_lists"),
            value: lists.length > 0 ? String(lists.length) : undefined,
            keywords: "collections custom lists curated",
            onClick: () => nav("/lists"),
          },
          {
            id: "my-activity",
            icon: <Image size={19} />,
            label: t("prof_row_activity"),
            hint: t("prof_row_activity_hint"),
            keywords: "stories archive posts reactions highlights",
            onClick: () => nav("/my-activity"),
          },
          {
            id: "appointments",
            icon: <Calendar size={19} />,
            label: t("appointments"),
            hint: t("prof_row_orders_hint"),
            badge: upcomingCount > 0 ? tf("prof_upcoming_count", { n: upcomingCount }) : undefined,
            badgeTone: "brand",
            keywords: "bookings schedules orders delivery",
            onClick: () => nav("/appointments"),
          },
          {
            id: "agreements",
            icon: <Handshake size={19} />,
            label: t("prof_row_deals"),
            hint: t("prof_row_deals_hint"),
            badge: activeDealsCount > 0 ? tf("prof_active_count", { n: activeDealsCount }) : undefined,
            badgeTone: "green",
            value: activeDealsCount === 0 && totalDealsCount > 0 ? String(totalDealsCount) : undefined,
            keywords: "agreements proposals orders receipts history",
            onClick: () => nav("/agreements"),
          },
          {
            id: "queues",
            icon: <Clock size={19} />,
            label: t("prof_row_queues"),
            hint: t("prof_row_queues_hint"),
            badge: activeQueues.length > 0 ? tf("prof_active_count", { n: activeQueues.length }) : undefined,
            badgeTone: "amber",
            keywords: "walk-in line tokens wait status",
            onClick: () => nav("/queues"),
          },
          {
            id: "requests",
            icon: <FileText size={19} />,
            label: t("prof_row_requests"),
            hint: t("prof_row_requests_hint"),
            badge: openRequestCount > 0 ? tf("prof_open_count", { n: openRequestCount }) : undefined,
            badgeTone: "brand",
            keywords: "ask quote help needs requests",
            onClick: () => nav("/explore?tab=requests&view=mine"),
          },
          {
            id: "notifications",
            icon: <Bell size={19} />,
            label: t("notifications"),
            badge: notifUnread > 0 ? String(notifUnread > 9 ? "9+" : notifUnread) : undefined,
            badgeTone: "red",
            keywords: "alerts bell unread updates",
            onClick: () => nav("/notifications"),
          },
        ],
      },
      {
        id: "community",
        title: t("prof_sec_community"),
        rows: [
          {
            id: "community-hub",
            icon: <Users size={19} />,
            label: t("community"),
            hint: t("prof_row_community_hint"),
            keywords: "feed deals street updates",
            onClick: () => nav("/community-hub"),
          },
          {
            id: "achievements",
            icon: <Award size={19} />,
            label: t("badges"),
            value: badgeValue,
            keywords: "achievements awards streaks unlocked",
            onClick: () => nav("/achievements"),
          },
          {
            id: "followers",
            icon: <UserPlus size={19} />,
            label: t("prof_row_followers"),
            value: followersCount + follows.length > 0 ? `${followersCount} / ${follows.length}` : undefined,
            keywords: "followers following people social",
            onClick: () => nav("/followers"),
          },
        ],
      },
      {
        id: "profiles",
        title: t("prof_sec_profiles"),
        slot: includeHatSlot ? <HatSwitcherCard /> : undefined,
        rows: [
          {
            id: "manage-spaces",
            icon: <Store size={19} color="var(--orange-500)" />,
            label: hasSellerProfile ? t("prof_manage_business") : t("prof_start_selling"),
            hint: hasSellerProfile ? undefined : t("prof_start_selling_hint"),
            keywords: "shop provider seller store dashboard console",
            onClick: () => nav("/manage"),
          },
          {
            id: "team-access",
            icon: <Key size={19} />,
            label: t("prof_row_team_access"),
            hint: t("prof_row_team_access_hint"),
            keywords: "staff delegate permissions business access",
            onClick: () => nav("/account/business-access"),
          },
          {
            id: "staff-login",
            icon: <Store size={19} />,
            label: t("prof_row_staff_login"),
            hint: t("prof_row_staff_login_hint"),
            keywords: "shared shop login employee staff",
            onClick: () => nav("/business-login"),
          },
        ],
      },
      {
        id: "support",
        title: t("prof_sec_support"),
        rows: [
          {
            id: "safety",
            icon: <Shield size={19} color="var(--green-600)" />,
            label: t("prof_row_safety"),
            hint: t("prof_row_safety_hint"),
            keywords: "sos emergency contacts live location safety",
            onClick: () => nav("/safety"),
          },
          {
            id: "privacy",
            icon: <Lock size={19} />,
            label: t("prof_row_privacy"),
            hint: t("prof_row_privacy_hint"),
            keywords: "privacy visibility location sharing muted stories",
            onClick: () => nav("/settings/privacy"),
          },
          {
            id: "preferences",
            icon: <Sliders size={19} />,
            label: t("prof_row_preferences"),
            hint: t("prof_row_preferences_hint"),
            keywords: "notifications discovery feed language hindi marathi english",
            onClick: () => nav("/account"),
          },
          ...(hasSellerProfile ? [{
            id: "security",
            icon: <Key size={19} />,
            label: t("prof_row_security"),
            hint: t("prof_row_security_hint"),
            keywords: "pin password recovery seller security",
            onClick: () => nav("/settings/security"),
          }] : []),
          {
            id: "help",
            icon: <HelpCircle size={19} />,
            label: t("prof_row_help"),
            hint: t("prof_row_help_hint"),
            keywords: "help support faq guide bug report contact",
            onClick: () => nav("/support?tab=contact"),
          },
          {
            id: "legal-data",
            icon: <FileText size={19} />,
            label: t("prof_row_legal_data"),
            hint: t("prof_row_legal_data_hint"),
            keywords: "legal terms privacy export download delete account",
            onClick: () => nav("/settings/data"),
          },
          ...(!Capacitor.isNativePlatform() ? [{
            id: "download-apk",
            icon: <Download size={19} color="var(--green-600)" />,
            label: t("prof_row_download_app"),
            hint: t("prof_row_download_app_hint"),
            keywords: "android apk app install native",
            onClick: () => {
              const link = document.createElement("a");
              link.href = APK_DOWNLOAD_URL;
              link.download = APK_FILENAME;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            },
          }] : []),
          ...(isAdmin ? [{
            id: "admin",
            icon: <Shield size={19} />,
            label: t("prof_row_admin"),
            keywords: "admin console moderation",
            onClick: () => nav("/admin"),
          }] : []),
        ],
      },
      {
        id: "login",
        title: t("prof_sec_login"),
        rows: [
          {
            id: "add-switch",
            label: t("prof_add_profile"),
            tone: "accent",
            hideChevron: true,
            keywords: "switch add account profile hat",
            onClick: () => setSwitcher(true),
          },
          {
            id: "logout",
            icon: <LogOut size={18} color="var(--red-600)" />,
            label: t("prof_logout"),
            tone: "danger",
            hideChevron: true,
            keywords: "sign out log out exit",
            onClick: () => {
              signOut();
              nav("/");
            },
          },
        ],
      },
    ];
    return buildGroups(true);
  }, [
    t, tf, nav, user.id, user.showNamePublicly, bookmarks.length, lists.length,
    upcomingCount, activeDealsCount, totalDealsCount, activeQueues.length,
    openRequestCount, notifUnread, badgeValue, followersCount, follows.length,
    hasSellerProfile, isAdmin, signOut,
  ]);

  // Desktop renders HatSwitcherCard in its left rail, so omit the duplicate embedded card inside the directory.
  const desktopGroups = useMemo(
    () => directoryGroups.map((g) => (g.id === "profiles" ? { ...g, slot: undefined } : g)),
    [directoryGroups]
  );

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

  const ProfileStats = ({ isDesktop = false }: { isDesktop?: boolean }) => {
    const stats = [
      { n: bookmarks.length, l: "Saved", onClick: () => nav("/bookmarks") },
      { n: follows.length, l: "Following", onClick: () => nav("/bookmarks?tab=following") },
      { n: followersCount, l: "Followers", onClick: () => nav("/followers") },
      { n: totalDealsCount, l: "Deals", onClick: () => nav("/agreements"), active: activeDealsCount },
    ] as const;

    return (
      <div className="card pf-stats" style={isDesktop ? { borderRadius: 20 } : undefined}>
        {stats.map((s) => (
          <button key={s.l} onClick={s.onClick} className="pf-stat">
            <span className="pf-stat-num" style={isDesktop ? { fontSize: 24 } : undefined}>{s.n}</span>
            <span className={isDesktop ? "small semi muted" : "tiny"}>{s.l}</span>
            {"active" in s && s.active > 0 && <span className="pf-stat-dot" />}
          </button>
        ))}
      </div>
    );
  };

  const RightNowSection = ({ isDesktop = false }: { isDesktop?: boolean }) => {
    if (activeQueues.length === 0 && activeAgreements.length === 0) return null;

    const content = (
      <>
        <div className="profile-eyebrow">{t("prof_right_now")}</div>
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
      </>
    );

    if (isDesktop) {
      return <div className="card" style={{ borderRadius: 20 }}>{content}</div>;
    }
    return <div className="page-pad" style={{ paddingBottom: 0 }}>{content}</div>;
  };

  const HighlightsSection = ({ isDesktop = false, title }: { isDesktop?: boolean; title?: string }) => {
    if (highlights.length === 0) return null;

    if (isDesktop) {
      return (
        <div className="card" style={{ padding: 20, borderRadius: 20 }}>
          {title && <div className="profile-eyebrow">{title}</div>}
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
      );
    }

    return (
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
    );
  };

  return (
    <div className="screen with-nav" style={{ paddingTop: 0, paddingLeft: 0, paddingRight: 0 }}>
      {/* ==========================================================
          MOBILE-ONLY VIEW
         ========================================================== */}
      <div className="mobile-only screen-boxed" style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
        <div className="screen-scroll">
          {/* ── Identity ── */}
          <div className="pf-hero living-sky-header" style={{ background: ambient.headerGradient }}>
            <AmbientSky dayPart={ambient.dayPartKey} effect={ambient.seasonEffect} glow={ambient.lampGlow} />
            <div className="pf-hero-content">
              <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginBottom: 6 }}>
                <button className="icon-btn pf-glass-btn" style={{ position: "relative" }} onClick={() => nav("/chats?scope=CUSTOMER")} aria-label={t("messages_header")}>
                  <MessageSquare size={18} />
                  {chatUnread > 0 && <span className="count-badge btn-badge">{chatUnread > 9 ? "9+" : chatUnread}</span>}
                </button>
                <button className="icon-btn pf-glass-btn" style={{ position: "relative" }} onClick={() => nav("/notifications")} aria-label={t("notifications")}>
                  <Bell size={18} />
                  {notifUnread > 0 && <span className="count-badge btn-badge count-badge-accent">{notifUnread > 9 ? "9+" : notifUnread}</span>}
                </button>
              </div>

              <IdentityBlock />

              <button className="pf-glass-row" onClick={() => nav(`/u/${user.id}`)} aria-label={t("prof_view_public")}>
                <UserCircle size={15} />
                <span className="pf-glass-row-label grow">{t("prof_view_public")}</span>
                <span className="pf-glass-row-cta">
                  {user.showNamePublicly ? <Globe size={13} /> : <Lock size={13} />}
                  {user.showNamePublicly ? "Name public" : "Name private"}
                </span>
              </button>

              <div className="pf-hero-actions">
                <button className="btn btn-sm pf-edit-btn" onClick={() => nav("/profile/edit")}>
                  Edit profile
                </button>
                <button className="icon-btn pf-glass-btn" onClick={() => setShare(true)} aria-label={t("share_profile_label")}>
                  <Share2 size={16} />
                </button>
              </div>
            </div>
          </div>

          <div className="page-pad" style={{ paddingTop: 12, paddingBottom: 0 }}>
            <ProfileStats />
          </div>

          <HighlightsSection />
          <RightNowSection />

          {/* ── Searchable Instagram-inspired Menu Directory ── */}
          <CustomerDirectory
            groups={directoryGroups}
            searchPlaceholder={t("prof_search_placeholder")}
            searchClearLabel={t("prof_clear_search")}
            searchEmptyMessage={(q) => tf("prof_search_empty", { q })}
          />

          <p className="tiny muted" style={{ textAlign: "center", padding: "14px 0 28px" }}>
            STRYT v{__APP_VERSION__} · Made for your street
          </p>
        </div>
      </div>

      {/* ==========================================================
          DESKTOP-ONLY VIEW
         ========================================================== */}
      <div className="desktop-only" style={{ display: "flex", flexDirection: "column", width: "100%", padding: "24px 32px", boxSizing: "border-box", background: ambient.bgGradient, minHeight: "100vh", overflowY: "auto" }}>
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
              <button className="icon-btn pf-glass-btn" style={{ position: "relative" }} onClick={() => nav("/chats?scope=CUSTOMER")} aria-label={t("messages_header")}>
                <MessageSquare size={18} />
                {chatUnread > 0 && <span className="count-badge btn-badge">{chatUnread > 9 ? "9+" : chatUnread}</span>}
              </button>
              <button className="icon-btn pf-glass-btn" style={{ position: "relative" }} onClick={() => nav("/notifications")} aria-label={t("notifications")}>
                <Bell size={18} />
                {notifUnread > 0 && <span className="count-badge btn-badge count-badge-accent">{notifUnread > 9 ? "9+" : notifUnread}</span>}
              </button>
            </div>
          </div>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 24, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
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
                <button className="icon-btn" style={{ flexShrink: 0 }} onClick={() => setShare(true)} aria-label={t("share_profile_label")}>
                  <Share2 size={16} />
                </button>
              </div>
            </div>

            <HatSwitcherCard />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <ProfileStats isDesktop />
            <RightNowSection isDesktop />
            <HighlightsSection isDesktop title={t("prof_my_highlights")} />

            <CustomerDirectory
              groups={desktopGroups}
              searchPlaceholder={t("prof_search_placeholder")}
              searchClearLabel={t("prof_clear_search")}
              searchEmptyMessage={(q) => tf("prof_search_empty", { q })}
              isDesktop
            />

            <p className="tiny muted" style={{ textAlign: "center", padding: "4px 0 20px" }}>
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
        <ShareCard subjects={shareSubjects} onClose={() => setShare(false)} />
      )}
      {switcher && (
        <AccountSwitcher onClose={() => setSwitcher(false)} />
      )}
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
