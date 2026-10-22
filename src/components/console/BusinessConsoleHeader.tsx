import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { BadgeCheck, Bell, MessageSquareText, Share2 } from "@/components/Icons";
import { SafeImg } from "@/components/common";
import BrandHome from "@/components/BrandHome";
import RoleSwitcher from "@/components/RoleSwitcher";
import AmbientSky from "@/features/ambient/AmbientSky";
import type { useAmbientTheme } from "@/features/ambient/useAmbientTheme";
import type { ConsoleMode } from "@/lib/teamConsole";
import { useI18n } from "@/lib/i18n";
import type { Business } from "@/types";

/**
 * The console's living header — the shop's face, its notifications and messages, and the owner's account switcher. Shared by
 * the Home page and the Dashboard so both open on the same identity; owners get the ambient sky, delegates and team members
 * the console colours that tell them they are working inside someone else's business.
 */
export default function BusinessConsoleHeader({
  id, business, isOwner, consoleMode, ambient, subtitle, notificationUnread, chatUnread, onShare,
}: {
  id: string;
  business: Business | undefined;
  isOwner: boolean;
  consoleMode: ConsoleMode;
  ambient: ReturnType<typeof useAmbientTheme>;
  subtitle: string;
  notificationUnread: number;
  chatUnread: number;
  onShare: () => void;
}) {
  const nav = useNavigate();
  const { t } = useI18n();
  return (
    <header className="living-sky-header" style={{
      background: isOwner
        ? ambient.headerGradient
        : consoleMode === "full_delegate"
          ? "linear-gradient(135deg, var(--console-delegate-from) 0%, var(--console-delegate-to) 100%)"
          : "linear-gradient(135deg, var(--console-team-from) 0%, var(--console-team-to) 100%)",
      color: "#fff",
      padding: "calc(18px + var(--safe-area-top)) 16px 22px",
      borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
      position: "relative",
    }}>
      {/* Clips only the decorative sky layer — the header itself must NOT clip, or RoleSwitcher's dropdown (a sibling
          below) gets cut off the moment it's taller than the header. */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
        {isOwner && <AmbientSky dayPart={ambient.dayPartKey} effect={ambient.seasonEffect} glow={ambient.lampGlow} />}
      </div>
      <div style={{ position: "relative", zIndex: 1 }}>
        {/* Logo + switcher + two buttons is ~348px with the page padding — it fits a 360px phone. Share used to be a third
            button here and ran off the screen; it lives next to "View shop" now. */}
        <div className="row between center-v" style={{ gap: 8 }}>
          <BrandHome color="#fff" glow={ambient.lampGlow} />
          <div className="row gap-8 center-v" style={{ minWidth: 0 }}>
            <RoleSwitcher theme="dark-pill" enableLongPress />
            <HeaderIcon label={t("notifications")} count={notificationUnread} onClick={() => nav(`/notifications?scope=BUSINESS&id=${id}`)}>
              <Bell size={16} />
            </HeaderIcon>
            <HeaderIcon label={t("messages_header")} count={chatUnread} onClick={() => nav(`/chats?scope=BUSINESS&id=${id}`)}>
              <MessageSquareText size={16} />
            </HeaderIcon>
          </div>
        </div>
        <div className="row gap-12 center-v" style={{ marginTop: 18 }}>
          <SafeImg src={business?.coverImage} variant="photo" style={{ width: 58, height: 58, borderRadius: 16, border: "2px solid rgba(255,255,255,.4)" }} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="row gap-6 center-v">
              <span className="bold h1 ellipsis" style={{ color: "#fff" }}>{business?.name ?? "Your business"}</span>
              {business?.isVerified && <BadgeCheck size={18} color="var(--accent-400)" weight="fill" />}
            </div>
            <div className="small" style={{ opacity: .9, color: "#fff" }}>{business?.subCategory || business?.categoryName || "Local business"}</div>
            <div className="tiny" style={{ opacity: .78, marginTop: 3, color: "#fff" }}>{subtitle}</div>
          </div>
        </div>
        {/* Below the identity row, not beside it: beside it they took ~130px and truncated the shop name to "Sharma Kiran…". */}
        <div className="row gap-8 center-v" style={{ marginTop: 12 }}>
          <button className="tiny semi" style={{ color: "#fff", background: "rgba(255,255,255,.16)", padding: "8px 14px", borderRadius: 999, whiteSpace: "nowrap" }} onClick={() => nav(`/business/${id}`)}>
            {t("map_view_shop")}
          </button>
          {isOwner && (
            <button className="icon-btn-sm" aria-label={t("mdash_share_shop")} onClick={onShare} style={{ background: "rgba(255,255,255,.16)", color: "#fff" }}>
              <Share2 size={16} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function HeaderIcon({ label, count, onClick, children }: { label: string; count: number; onClick: () => void; children: ReactNode }) {
  return (
    <button className="icon-btn-sm" aria-label={label} onClick={onClick} style={{ background: "rgba(255,255,255,.16)", color: "#fff", position: "relative" }}>
      {children}
      {count > 0 && <span style={{ position: "absolute", top: 2, right: 2, width: 7, height: 7, borderRadius: "50%", background: "var(--red-500)" }} />}
    </button>
  );
}
