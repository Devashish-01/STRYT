import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { useNavigate } from "react-router-dom";
import {
  Bell, Settings, Store, Briefcase, FileText, Star,
  ChevronRight, Shield, HelpCircle, LogOut, Globe, Share2,
  ListChecks, Trophy, Award, Users, UserCircle, Heart,
  ArrowLeftRight, Map, MessageSquare, UserPlus, Bookmark, Handshake,
  Bug, Calendar
} from "@/components/Icons";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { SafeImg } from "@/components/common";
import { displayName } from "@/lib/publicName";
import AccountSwitcher from "@/components/AccountSwitcher";
import { requestService, socialService, businessService } from "@/services";
import { PLACEHOLDER_AVATAR, PLACEHOLDER_AVATAR_ALT, PLACEHOLDER_BUSINESS_COVER } from "@/lib/placeholders";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import type { Role, AgreementStatus } from "@/types";
import ShareCard, { type ShareOption } from "@/components/ShareCard";

const TERMINAL: AgreementStatus[] = ["COMPLETED", "CANCELLED", "DISPUTED"];

export default function Profile() {
  const nav = useNavigate();
  const { user, roles, activeRole, setActiveRole, bookmarks, follows, signOut, ownedBusinessIds, ownedProviderId, chatUnread } = useApp();
  const { t } = useI18n();
  const [switcher, setSwitcher] = useState(false);
  const [share, setShare] = useState(false);
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

  // Admin console stays reachable (own bypass-token entry screen lives at /admin
  // itself) but only earns a spot in the nav for people who are actually admins.
  const envBypassToken = (import.meta as any).env.VITE_ADMIN_BYPASS_TOKEN;
  const isAdmin =
    (user.roles as string[]).includes("admin") ||
    (user.roles as string[]).includes("super_admin") ||
    (!!envBypassToken && (user.phone === envBypassToken || localStorage.getItem("admin_bypass_token") === envBypassToken));

  const roleMeta: Record<Role, { label: string; icon: any; color: string; bg: string }> = {
    customer:       { label: "Customer",  icon: Heart,    color: "var(--brand-600)", bg: "#faf5ff" },
    business_owner: { label: "Business",  icon: Store,    color: "var(--orange-500)", bg: "#fff7ed" },
    provider:       { label: "Provider",  icon: Briefcase, color: "var(--green-500)", bg: "#f0fdf4" },
  };

  // The 6 most-used destinations, as one scannable grid instead of a tall list —
  // spatial position becomes memorable ("appointments is always top-middle").
  const quickActions: { icon: React.ReactNode; label: string; badge?: number; onClick: () => void }[] = [
    { icon: <Calendar size={22} color="#8b5cf6" />, label: t("appointments"), onClick: () => nav("/appointments") },
    { icon: <FileText size={22} color="var(--brand-700)" />, label: t("requests"), onClick: () => nav("/requests") },
    { icon: <Users size={22} color="#3b82f6" />, label: t("community"), onClick: () => nav("/community-hub") },
    { icon: <Map size={22} color="#0ea5e9" />, label: t("map"), onClick: () => nav("/map") },
    { icon: <Award size={22} color="var(--amber-500)" />, label: t("badges"), onClick: () => nav("/achievements") },
    { icon: <Trophy size={22} color="var(--brand-700)" />, label: t("heroes"), onClick: () => nav("/leaderboard") },
  ];

  return (
    <div className="screen with-nav">
      <div className="screen-scroll">

        {/* ── Hero header ── */}
        <div style={{ background: "linear-gradient(135deg, var(--brand-500), var(--brand-700))", color: "#fff", padding: "20px 16px 32px" }}>
          <div className="row between">
            <span className="bold" style={{ fontSize: 20 }}>{t("profile")}</span>
            <div className="row gap-8">
              <button className="icon-btn" style={{ background: "rgba(255,255,255,0.16)", color: "#fff", position: "relative" }} onClick={() => nav("/chats")} aria-label="Messages">
                <MessageSquare size={18} />
                {chatUnread > 0 && (
                  <span style={{
                    position: "absolute", top: 5, right: 5,
                    width: 7, height: 7, background: "var(--red-500)",
                    borderRadius: "50%", border: "1.5px solid rgba(0,0,0,0.2)",
                  }} />
                )}
              </button>
              <button className="icon-btn" style={{ background: "rgba(255,255,255,0.16)", color: "#fff" }} onClick={() => nav("/notifications")} aria-label="Notifications">
                <Bell size={18} />
              </button>
              <button className="icon-btn" style={{ background: "rgba(255,255,255,0.16)", color: "#fff" }} onClick={() => nav("/settings")} aria-label="Settings">
                <Settings size={18} />
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
              <div className="bold" style={{ fontSize: 21 }}>{displayName(user.name)}</div>
              <div className="small" style={{ opacity: 0.8, marginTop: 2 }}>{user.phone}</div>
              <div className="row gap-6" style={{ marginTop: 8 }}>
                <span className="badge" style={{ background: "rgba(255,255,255,0.22)", color: "#fff" }}>
                  <Star size={11} fill="#ffd23f" strokeWidth={0} /> {(user.ratingCount ?? 0) > 0 ? `${user.ratingAvg} (${user.ratingCount})` : "New"}
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
        </div>

        {/* ── Stats row (single source of truth — these numbers don't repeat elsewhere) ── */}
        <div className="page-pad" style={{ marginTop: -18 }}>
          <div className="row gap-8">
            <button className="stat-pill" onClick={() => nav("/bookmarks")}>
              <span className="row" style={{ gap: 3 }}>
                <Bookmark size={12} color="var(--brand-700)" />
                <span className="bold" style={{ fontSize: 19, color: "var(--brand-700)" }}>{bookmarks.length}</span>
              </span>
              <span className="tiny muted">Saved</span>
            </button>
            <button className="stat-pill" onClick={() => nav("/bookmarks?tab=following")}>
              <span className="row" style={{ gap: 3 }}>
                <UserPlus size={12} color="var(--brand-600)" />
                <span className="bold" style={{ fontSize: 19, color: "var(--brand-600)" }}>{follows.length}</span>
              </span>
              <span className="tiny muted">Following</span>
            </button>
            <button className="stat-pill" onClick={() => nav("/followers")}>
              <span className="row" style={{ gap: 3 }}>
                <Users size={12} color="var(--green-500)" />
                <span className="bold" style={{ fontSize: 19, color: "var(--green-500)" }}>{followersCount}</span>
              </span>
              <span className="tiny muted">Followers</span>
            </button>
            <button className="stat-pill" onClick={() => nav("/agreements")}>
              <span className="row" style={{ gap: 3 }}>
                <Handshake size={12} color={activeAgreements.length > 0 ? "var(--orange-500)" : "var(--ink-400)"} />
                <span className="bold" style={{ fontSize: 19, color: activeAgreements.length > 0 ? "var(--orange-500)" : "var(--brand-700)" }}>
                  {totalAgreements}
                </span>
              </span>
              <span className="tiny muted">Agreements</span>
              {activeAgreements.length > 0 && (
                <span className="badge badge-green" style={{ fontSize: 9, padding: "2px 6px" }}>
                  {activeAgreements.length} active
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ── Live queue banner (only when in ≥1 queue) ── */}
        {activeQueues.length > 0 && (
          <div className="page-pad" style={{ paddingTop: 4 }}>
            <button
              className="card row gap-12 center-v"
              style={{ padding: 14, width: "100%", textAlign: "left", background: "#fff7ed", border: "1px solid #fed7aa" }}
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

        {/* ── Quick actions grid — same 6 spots every time, so position becomes memory ── */}
        <div className="page-pad" style={{ paddingTop: 4 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {quickActions.map((a) => (
              <button key={a.label} className="feature-card" onClick={a.onClick}>
                {a.badge ? <span className="feature-card-badge">{a.badge}</span> : null}
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

        {/* ── Manage (only shown to sellers / for saved lists) ── */}
        <div className="page-pad" style={{ paddingTop: 0 }}>
          <div className="card" style={{ overflow: "hidden" }}>
            {hasSellerProfile && (
              <MenuRow icon={<Store size={20} color="var(--orange-500)" />} label="Manage business & profile" onClick={() => nav("/manage")} />
            )}
            <MenuRow icon={<ListChecks size={20} color="#0ea5e9" />} label="My saved lists" onClick={() => nav("/lists")} />
            <MenuRow icon={<Users size={20} color="var(--amber-500)" />} label="My queues" badge={activeQueues.length || undefined} onClick={() => nav("/queues")} last />
          </div>
        </div>

        {/* ── Settings & support ── */}
        <div className="page-pad" style={{ paddingTop: 0 }}>
          <div className="card" style={{ overflow: "hidden" }}>
            <MenuRow icon={<Globe size={20} color="#0ea5e9" />}    label="Language"         hint="English"     onClick={() => nav("/settings")} />
            <MenuRow icon={<Shield size={20} color="var(--green-500)" />}   label="Privacy & safety"                    onClick={() => nav("/settings")} />
            <MenuRow icon={<HelpCircle size={20} color="#6366f1" />} label="Help & support"                    onClick={() => nav("/support?tab=contact")} />
            <MenuRow icon={<Bug size={20} color="var(--red-500)" />}      label="Report a bug"                        onClick={() => nav("/support?tab=bug")} />
            {isAdmin && (
              <MenuRow icon={<Shield size={20} color="#14111c" />} label="Admin console" onClick={() => nav("/admin")} />
            )}
            {!Capacitor.isNativePlatform() && (
              <MenuRow
                icon={<span style={{ fontSize: 20 }}>🤖</span>}
                label="Download Android App"
                hint="Get the .apk file"
                onClick={() => {
                  const link = document.createElement("a");
                  link.href = "/stryt.apk";
                  link.download = "stryt.apk";
                  link.click();
                }}
              />
            )}
            <MenuRow icon={<LogOut size={20} color="var(--red-500)" />}   label="Log out" last onClick={() => { signOut(); nav("/"); }} />
          </div>
        </div>

        <p className="tiny muted" style={{ textAlign: "center", padding: "8px 0 28px" }}>
          STRYT v0.1.0 · Made for your street
        </p>
      </div>

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
