import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell, Settings, Store, Briefcase, FileText, Star,
  ChevronRight, Share2,
  Trophy, Award, Users, UserCircle, Heart,
  ArrowLeftRight, MessageSquare, Image, ListChecks, Clock,
  Calendar, Wallet
} from "@/components/Icons";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { SafeImg } from "@/components/common";
import { displayName } from "@/lib/publicName";
import AccountSwitcher from "@/components/AccountSwitcher";
import { requestService, socialService, businessService, notificationService } from "@/services";
import { PLACEHOLDER_AVATAR, PLACEHOLDER_AVATAR_ALT, PLACEHOLDER_BUSINESS_COVER } from "@/lib/placeholders";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import type { Role, AgreementStatus } from "@/types";
import ShareCard, { type ShareOption } from "@/components/ShareCard";
import { StoryViewer } from "@/components/Stories";

const TERMINAL: AgreementStatus[] = ["COMPLETED", "CANCELLED", "DISPUTED"];

export default function Profile() {
  const nav = useNavigate();
  const { user, roles, activeRole, setActiveRole, bookmarks, follows, ownedBusinessIds, ownedProviderId, chatUnread } = useApp();
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

  const { data: custUnread } = useQueryWithRealtime(() => notificationService.getUnreadCount({ scope: "CUSTOMER" }), "notifications", []);

  const { data: highlightsData } = useQuery(() => socialService.myHighlights(), [user.id]);
  const highlights = highlightsData ?? [];

  const roleMeta: Record<Role, { label: string; icon: any; color: string; bg: string }> = {
    customer:       { label: "Customer",  icon: Heart,    color: "var(--brand-600)", bg: "var(--brand-50)" },
    business_owner: { label: "Business",  icon: Store,    color: "var(--orange-500)", bg: "var(--orange-50)" },
    provider:       { label: "Provider",  icon: Briefcase, color: "var(--green-500)", bg: "var(--green-100)" },
  };

  // The 6 most-used destinations, as one scannable grid instead of a tall list —
  // spatial position becomes memorable ("Wallet is always top-middle-right").
  // Map is deliberately excluded — it already lives in the bottom nav, so
  // repeating it here would just be the same destination in two places.
  const quickActions: { icon: React.ReactNode; label: string; badge?: number; onClick: () => void }[] = [
    { icon: <Calendar size={22} color="var(--brand-500)" />, label: t("appointments"), onClick: () => nav("/appointments") },
    { icon: <FileText size={22} color="var(--brand-700)" />, label: t("requests"), onClick: () => nav("/requests") },
    { icon: <Wallet size={22} color="var(--green-600)" />, label: "Wallet", onClick: () => nav("/wallet") },
    { icon: <Clock size={22} color="var(--amber-500)" />, label: "Queues", badge: activeQueues.length || undefined, onClick: () => nav("/queues") },
    { icon: <Users size={22} color="var(--blue-500)" />, label: t("community"), onClick: () => nav("/community-hub") },
    { icon: <Award size={22} color="var(--amber-500)" />, label: t("badges"), onClick: () => nav("/achievements") },
  ];

  return (
    <div className="screen screen-boxed with-nav">
      <div className="screen-scroll">

        {/* ── Hero header — only the two things people check constantly
            (messages, notifications) get an icon slot. Switching accounts and
            settings both have a home further down, so they don't need to
            compete for space up here too. ── */}
        <div style={{ background: "linear-gradient(135deg, var(--brand-500), var(--brand-700))", color: "#fff", padding: "calc(20px + var(--safe-area-top)) 16px 32px" }}>
          <div className="row between">
            <span className="bold" style={{ fontSize: 20 }}>{t("profile")}</span>
            <div className="row gap-8">
              <button className="icon-btn" style={{ background: "rgba(255,255,255,0.16)", color: "#fff", position: "relative" }} onClick={() => nav("/chats?scope=CUSTOMER")} aria-label="Messages">
                <MessageSquare size={18} />
                {chatUnread > 0 && (
                  <span style={{
                    position: "absolute", top: 5, right: 5,
                    width: 7, height: 7, background: "var(--red-500)",
                    borderRadius: "50%", border: "1.5px solid rgba(0,0,0,0.2)",
                  }} />
                )}
              </button>
              <button className="icon-btn" style={{ background: "rgba(255,255,255,0.16)", color: "#fff", position: "relative" }} onClick={() => nav("/notifications?scope=CUSTOMER")} aria-label="Notifications">
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

          <div className="row gap-14" style={{ marginTop: 18 }}>
            <SafeImg
              src={user.avatar} alt="" variant="avatar" className="avatar"
              style={{ width: 72, height: 72, border: "3px solid rgba(255,255,255,0.35)", flexShrink: 0 }}
              onClick={() => nav(`/u/${user.id}`)}
            />
            <div className="grow">
              <div className="bold" style={{ fontSize: 21, color: "#fff" }}>{displayName(user.name)}</div>
              <div className="small" style={{ color: "#fff", opacity: 0.85, marginTop: 2 }}>{user.phone}</div>
              <div className="row gap-6" style={{ marginTop: 8 }}>
                <span className="badge" style={{ background: "rgba(255,255,255,0.22)", color: "#fff" }}>
                  <Star size={11} fill="var(--amber-500)" strokeWidth={0} /> {(user.ratingCount ?? 0) > 0 ? `${user.ratingAvg} (${user.ratingCount})` : "New"}
                </span>
                <span className="badge" style={{ background: "rgba(255,255,255,0.16)", color: "#fff" }}>
                  📍 {user.area || "No location"}
                </span>
              </div>
            </div>
          </div>

          <div className="row gap-8" style={{ marginTop: 14 }}>
            <button
              className="btn btn-sm grow"
              style={{ background: "rgba(255,255,255,0.16)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)" }}
              onClick={() => nav("/profile/edit")}
            >
              Edit profile
            </button>
            <button
              className="btn btn-sm grow"
              style={{ background: "rgba(255,255,255,0.16)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)" }}
              onClick={() => nav(`/u/${user.id}`)}
            >
              <UserCircle size={16} /> Public profile
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

          {/* ── Integrated stats strip — one premium identity block instead of a
              second stacked row of pills below the hero ── */}
          <div className="row" style={{ marginTop: 18, background: "rgba(255,255,255,0.12)", borderRadius: 16, padding: "10px 0", backdropFilter: "blur(2px)" }}>
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
                style={{ gap: 2, color: "#fff", borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.18)" : "none", position: "relative" }}
              >
                <span className="bold" style={{ fontSize: 19, lineHeight: 1.1, color: "#fff" }}>{s.n}</span>
                <span className="tiny" style={{ color: "#fff", opacity: 0.85 }}>{s.l}</span>
                {"active" in s && s.active > 0 && (
                  <span style={{ position: "absolute", top: -2, right: "50%", transform: "translateX(22px)", width: 7, height: 7, borderRadius: "50%", background: "var(--green-400)" }} />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Live queue banner (only when in ≥1 queue) ── */}
        {activeQueues.length > 0 && (
          <div className="page-pad" style={{ paddingTop: 4 }}>
            <button
              className="card row gap-12 center-v"
              style={{ padding: 14, width: "100%", textAlign: "left", background: "var(--orange-50)", border: "1px solid var(--orange-100)" }}
              onClick={() => nav("/queues")}
            >
              <span style={{ fontSize: 22 }}>👥</span>
              <div className="grow">
                <div className="semi small">In {activeQueues.length} live queue{activeQueues.length > 1 ? "s" : ""}</div>
                <div className="tiny muted">{activeQueues[0].businessName}{activeQueues.length > 1 ? ` +${activeQueues.length - 1} more` : ""} — tap to view position</div>
              </div>
              <ChevronRight size={18} color="var(--ink-300)" />
            </button>
          </div>
        )}

        {/* ── My Highlights — stories saved past their normal expiry ── */}
        {highlights.length > 0 && (
          <div className="hscroll" style={{ padding: "10px 16px" }}>
            {highlights.map((h, i) => (
              <button key={h.id} className="col center" style={{ gap: 6, width: 68, flexShrink: 0 }} onClick={() => setViewingHighlight(i)}>
                <div style={{ width: 60, height: 60, borderRadius: "50%", padding: 2.5, background: "linear-gradient(135deg,var(--amber-500),var(--amber-500))" }}>
                  <SafeImg src={h.image} variant="photo" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", border: "2px solid #fff" }} />
                </div>
                <span className="tiny semi ellipsis" style={{ maxWidth: 62, textAlign: "center" }}>{h.caption || "Highlight"}</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Quick actions grid — same 6 spots every time, so position becomes
            memory. Wallet & Queues live here (frequent, money/live-status),
            Map is deliberately left out (it's already a bottom-nav tab) ── */}
        <div className="page-pad" style={{ paddingTop: 4 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {quickActions.map((a) => (
              <button key={a.label} className="feature-card" onClick={a.onClick}>
                {a.badge ? <span className="count-badge feature-card-badge">{a.badge}</span> : null}
                {a.icon}
                <span className="semi" style={{ fontSize: 12 }}>{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Role switcher ── */}
        <div className="page-pad" style={{ paddingTop: 4 }}>
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
            {activeRole === "business_owner" && roles.includes("business_owner") && manageBizId && (
              <button
                className="btn btn-ghost btn-block btn-sm"
                style={{ marginTop: 10 }}
                onClick={() => nav(`/business/${manageBizId}/manage`)}
              >
                Open business dashboard →
              </button>
            )}
            {activeRole === "provider" && roles.includes("provider") && ownedProviderId && (
              <button
                className="btn btn-ghost btn-block btn-sm"
                style={{ marginTop: 10 }}
                onClick={() => nav(`/provider/${ownedProviderId}/manage`)}
              >
                Open provider dashboard →
              </button>
            )}
            <button
              className="row gap-6 center-v tiny semi"
              style={{ marginTop: 10, color: "var(--ink-500)", padding: "6px 2px" }}
              onClick={() => setSwitcher(true)}
            >
              <ArrowLeftRight size={13} /> Switch or add another account
            </button>
          </div>
        </div>

        {/* ── More for you — content & management shortcuts that don't need
            daily front-row space: seller console (if any), your saved lists
            (moved here from Settings since it's content, not a preference),
            your posts, and the neighborhood leaderboard. ── */}
        <div className="page-pad" style={{ paddingTop: 0 }}>
          <div className="small semi muted" style={{ margin: "0 2px 8px" }}>More for you</div>
          <div className="card" style={{ overflow: "hidden" }}>
            {hasSellerProfile && (
              <MenuRow icon={<Store size={20} color="var(--orange-500)" />} label="Manage business & profile" onClick={() => nav("/manage")} />
            )}
            <MenuRow icon={<ListChecks size={20} color="var(--blue-500)" />} label="My saved lists" onClick={() => nav("/lists")} />
            <MenuRow icon={<Image size={20} color="var(--pink-500)" />} label="My activity" hint="Stories & posts" onClick={() => nav("/my-activity")} />
            <MenuRow icon={<Trophy size={20} color="var(--brand-700)" />} label="Neighborhood heroes" hint="Leaderboard" onClick={() => nav("/leaderboard")} last />
          </div>
        </div>

        {/* ── Settings & more — the infrequent stuff (including sign-out)
            lives on its own page, so it's never one accidental tap away
            from the screen people open constantly ── */}
        <div className="page-pad" style={{ paddingTop: 0 }}>
          <div className="card" style={{ overflow: "hidden" }}>
            <MenuRow icon={<Settings size={20} color="var(--ink-600)" />} label="Settings & more" hint="Preferences, support, log out" onClick={() => nav("/account")} last />
          </div>
        </div>

        <p className="tiny muted" style={{ textAlign: "center", padding: "8px 0 28px" }}>
          STRYT v0.1.0 · Made for your street
        </p>
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
