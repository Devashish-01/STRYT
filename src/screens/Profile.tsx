import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell, Settings, Store, Briefcase, FileText, Star,
  ChevronRight, Shield, HelpCircle, LogOut, Globe, Share2,
  ListChecks, Trophy, Award, Users, UserCircle, Heart,
  ArrowLeftRight, MessageCircle, Handshake, Map, MessageSquare,
  Bug
} from "lucide-react";
import { useApp } from "@/store";
import { StarRow, SafeImg } from "@/components/common";
import AccountSwitcher from "@/components/AccountSwitcher";
import { requestService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import type { Role, AgreementStatus } from "@/types";
import ShareCard, { type ShareOption } from "@/components/ShareCard";

const HandshakeIcon = Handshake as any;

const TERMINAL: AgreementStatus[] = ["COMPLETED", "CANCELLED", "DISPUTED"];

export default function Profile() {
  const nav = useNavigate();
  const { user, roles, activeRole, setActiveRole, addRole, bookmarks, follows, signOut, ownedBusinessIds, ownedProviderId, chatUnread } = useApp();
  const [switcher, setSwitcher] = useState(false);
  const [share, setShare] = useState(false);
  const manageBizId = ownedBusinessIds[0];

  const getFirstName = (name: string) => name.split(" ")[0] || "My";

  const shareOptions: ShareOption[] = [
    {
      role: "customer",
      label: "Personal Profile",
      url: window.location.origin + "/u/" + user.id,
      title: user.name || "Stryt Neighbor",
      subtitle: `Customer • ${user.area || "No location"}`,
      image: user.avatar || "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120",
      meta: `⭐ ${user.ratingAvg ?? 0} (${user.ratingCount ?? 0})`
    }
  ];

  if (ownedBusinessIds.length > 0) {
    shareOptions.push({
      role: "business_owner",
      label: "Shop Profile",
      url: window.location.origin + "/business/" + ownedBusinessIds[0],
      title: `${getFirstName(user.name || "")}'s Shop`,
      subtitle: "Local Business on Stryt",
      image: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=500",
      meta: "Shops & Deals"
    });
  }

  if (ownedProviderId) {
    shareOptions.push({
      role: "provider",
      label: "Provider Profile",
      url: window.location.origin + "/provider/" + ownedProviderId,
      title: user.name || "Service Provider",
      subtitle: "Professional Provider on Stryt",
      image: user.avatar || "https://images.unsplash.com/photo-1521791136364-7286472b6b5c?w=500",
      meta: "Services & Work"
    });
  }

  const { data: agreementsData } = useQuery(() => requestService.agreements(), []);
  const activeAgreements = (agreementsData ?? []).filter((a) => !TERMINAL.includes(a.status));
  const totalAgreements  = agreementsData?.length ?? 0;

  const roleMeta: Record<Role, { label: string; icon: any; color: string; bg: string }> = {
    customer:       { label: "Customer",  icon: Heart,    color: "#7c3aed", bg: "#faf5ff" },
    business_owner: { label: "Business",  icon: Store,    color: "#f26a00", bg: "#fff7ed" },
    provider:       { label: "Provider",  icon: Briefcase, color: "#16a34a", bg: "#f0fdf4" },
  };

  return (
    <div className="screen with-nav">
      <div className="screen-scroll">

        {/* ── Hero header ── */}
        <div style={{ background: "linear-gradient(135deg, var(--brand-500), var(--brand-700))", color: "#fff", padding: "20px 16px 32px" }}>
          <div className="row between">
            <span className="bold" style={{ fontSize: 20 }}>You</span>
            <div className="row gap-8">
              <button className="icon-btn" style={{ background: "rgba(255,255,255,0.16)", color: "#fff" }} onClick={() => setShare(true)} aria-label="Share QR Code">
                <Share2 size={18} />
              </button>
              <button className="icon-btn" style={{ background: "rgba(255,255,255,0.16)", color: "#fff" }} onClick={() => setSwitcher(true)}>
                <ArrowLeftRight size={18} />
              </button>
              <button className="icon-btn" style={{ background: "rgba(255,255,255,0.16)", color: "#fff", position: "relative" }} onClick={() => nav("/chats")} aria-label="Chats">
                <MessageSquare size={18} />
                {chatUnread > 0 && (
                  <span style={{
                    position: "absolute", top: 5, right: 5,
                    width: 7, height: 7, background: "#ef4444",
                    borderRadius: "50%", border: "1.5px solid rgba(0,0,0,0.2)",
                  }} />
                )}
              </button>
              <button className="icon-btn" style={{ background: "rgba(255,255,255,0.16)", color: "#fff" }} onClick={() => nav("/notifications")}>
                <Bell size={18} />
              </button>
              <button className="icon-btn" style={{ background: "rgba(255,255,255,0.16)", color: "#fff" }} onClick={() => nav("/settings")}>
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
              <div className="bold" style={{ fontSize: 21 }}>{user.name || "New user"}</div>
              <div className="small" style={{ opacity: 0.8, marginTop: 2 }}>{user.phone}</div>
              <div className="row gap-6" style={{ marginTop: 8 }}>
                <span className="badge" style={{ background: "rgba(255,255,255,0.22)", color: "#fff" }}>
                  <Star size={11} fill="#ffd23f" strokeWidth={0} /> {user.ratingAvg ?? 0} ({user.ratingCount ?? 0})
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
          </div>
        </div>

        {/* ── Stats row ── */}
        <div className="page-pad" style={{ marginTop: -18 }}>
          <div className="row gap-10">
            <button className="stat-pill" onClick={() => nav("/bookmarks")}>
              <span className="bold" style={{ fontSize: 22, color: "var(--brand-700)" }}>{bookmarks.length}</span>
              <span className="tiny muted">Saved</span>
            </button>
            <button className="stat-pill" onClick={() => nav("/bookmarks?tab=following")}>
              <span className="bold" style={{ fontSize: 22, color: "var(--brand-700)" }}>{follows.length}</span>
              <span className="tiny muted">Following</span>
            </button>
            <button className="stat-pill" onClick={() => nav("/agreements")}>
              <span className="bold" style={{ fontSize: 22, color: activeAgreements.length > 0 ? "#16a34a" : "var(--brand-700)" }}>
                {totalAgreements}
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

        {/* ── Feature tiles ── */}
        <div className="page-pad" style={{ paddingTop: 4 }}>
          <div className="row gap-10">
            <button className="feature-card" onClick={() => nav("/agreements")}>
              {activeAgreements.length > 0 && (
                <span className="feature-card-badge">{activeAgreements.length}</span>
              )}
              <HandshakeIcon size={24} color="#16a34a" />
              <span className="semi" style={{ fontSize: 12 }}>Agreements</span>
              <span className="tiny muted" style={{ fontSize: 10 }}>Track jobs</span>
            </button>
            <button className="feature-card" onClick={() => nav("/achievements")}>
              <Award size={24} color="#f59e0b" />
              <span className="semi" style={{ fontSize: 12 }}>Badges</span>
              <span className="tiny muted" style={{ fontSize: 10 }}>Achievements</span>
            </button>
            <button className="feature-card" onClick={() => nav("/leaderboard")}>
              <Trophy size={24} color="var(--brand-700)" />
              <span className="semi" style={{ fontSize: 12 }}>Heroes</span>
              <span className="tiny muted" style={{ fontSize: 10 }}>Leaderboard</span>
            </button>
          </div>
        </div>

        {/* ── Role switcher ── */}
        <div className="page-pad" style={{ paddingTop: 4 }}>
          <div className="card" style={{ padding: 14 }}>
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
          </div>
        </div>

        {/* ── Activity & community ── */}
        <div className="page-pad" style={{ paddingTop: 4 }}>
          <div className="card" style={{ overflow: "hidden" }}>
            <MenuRow icon={<MessageCircle size={20} color="var(--brand-700)" />} label="Messages" badge={undefined} onClick={() => nav("/chats")} />
            <MenuRow icon={<HandshakeIcon size={20} color="#16a34a" />} label="My agreements" badge={activeAgreements.length || undefined} onClick={() => nav("/agreements")} />
            <MenuRow icon={<FileText size={20} color="var(--brand-700)" />}     label="My requests"    onClick={() => nav("/requests")} />
            <MenuRow icon={<Users size={20} color="#3b82f6" />}        label="Community board" onClick={() => nav("/community-hub")} />
            <MenuRow icon={<Map size={20} color="#0ea5e9" />}          label="Map view"       onClick={() => nav("/map")} last />
          </div>
        </div>

        {/* ── Manage & admin ── */}
        <div className="page-pad" style={{ paddingTop: 0 }}>
          <div className="card" style={{ overflow: "hidden" }}>
            <MenuRow icon={<Store size={20} color="#f26a00" />}    label="Manage business & profile" onClick={() => nav("/manage")} />
            <MenuRow icon={<ListChecks size={20} color="#0ea5e9" />} label="My saved lists"         onClick={() => nav("/lists")} />
            <MenuRow icon={<Heart size={20} color="#ef4444" />}     label="Saved & following"       onClick={() => nav("/bookmarks")} />
            <MenuRow icon={<Shield size={20} color="#14111c" />}    label="Admin console"           onClick={() => nav("/admin")} last />
          </div>
        </div>

        {/* ── Settings & support ── */}
        <div className="page-pad" style={{ paddingTop: 0 }}>
          <div className="card" style={{ overflow: "hidden" }}>
            <MenuRow icon={<Globe size={20} color="#0ea5e9" />}    label="Language"         hint="English"     onClick={() => nav("/settings")} />
            <MenuRow icon={<Shield size={20} color="#16a34a" />}   label="Privacy & safety"                    onClick={() => nav("/settings")} />
            <MenuRow icon={<HelpCircle size={20} color="#6366f1" />} label="Help & support"                    onClick={() => nav("/support?tab=contact")} />
            <MenuRow icon={<Bug size={20} color="#ef4444" />}      label="Report a bug"                        onClick={() => nav("/support?tab=bug")} />
            <MenuRow icon={<LogOut size={20} color="#ef4444" />}   label="Log out" last onClick={() => { signOut(); nav("/"); }} />
          </div>
        </div>

        <p className="tiny muted" style={{ textAlign: "center", padding: "8px 0 28px" }}>
          STRYT v0.1.0 · Made for your street
        </p>
      </div>

      {switcher && <AccountSwitcher onClose={() => setSwitcher(false)} />}
      {share && (
        <ShareCard
          title={user.name || "Stryt Neighbor"}
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
