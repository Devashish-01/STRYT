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
import ConsoleHeader from "./ConsoleHeader";

/**
 * The console's living header — the shop's face, its notifications and messages, and the owner's account switcher. Shared by
 * the Home page and the Dashboard so both open on the same identity; owners get the ambient sky, delegates and team members
 * the console colours that tell them they are working inside someone else's business.
 */
export default function BusinessConsoleHeader({
  id, business, isOwner, consoleMode, ambient, subtitle, notificationUnread, totalNotificationUnread = 0, chatUnread, canOpenMessages, onShare,
}: {
  id: string;
  business: Business | undefined;
  isOwner: boolean;
  consoleMode: ConsoleMode;
  ambient: ReturnType<typeof useAmbientTheme>;
  subtitle: string;
  notificationUnread: number;
  totalNotificationUnread?: number;
  chatUnread: number;
  canOpenMessages: boolean;
  onShare: () => void;
}) {
  const nav = useNavigate();
  const { t } = useI18n();
  const hasScopedNotif = notificationUnread > 0;
  const hasCrossHatNotif = !hasScopedNotif && totalNotificationUnread > 0;
  return (
    <ConsoleHeader
      background={isOwner
        ? ambient.headerGradient
        : consoleMode === "full_delegate"
          ? "linear-gradient(135deg, var(--console-delegate-from) 0%, var(--console-delegate-to) 100%)"
          : "linear-gradient(135deg, var(--console-team-from) 0%, var(--console-team-to) 100%)"}
      backdrop={isOwner && <AmbientSky dayPart={ambient.dayPartKey} effect={ambient.seasonEffect} glow={ambient.lampGlow} />}
      brand={<BrandHome color="#fff" glow={ambient.lampGlow} />}
      primary={<>
            <RoleSwitcher theme="dark-pill" enableLongPress />
            <HeaderIcon
              label={t("notifications")}
              count={notificationUnread}
              secondaryDot={hasCrossHatNotif}
              onClick={() => nav(hasCrossHatNotif ? "/notifications" : `/notifications?scope=BUSINESS&id=${id}`)}
            >
              <Bell size={16} />
            </HeaderIcon>
            {canOpenMessages && <HeaderIcon label={t("messages_header")} count={chatUnread} onClick={() => nav(`/chats?scope=BUSINESS&id=${id}`)}>
              <MessageSquareText size={16} />
            </HeaderIcon>}
      </>}
      identity={<>
          <SafeImg src={business?.coverImage} variant="photo" style={{ width: 58, height: 58, borderRadius: 16, border: "2px solid rgba(255,255,255,.4)" }} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="row gap-6 center-v">
              <span className="bold h1 ellipsis" style={{ color: "#fff" }}>{business?.name ?? "Your business"}</span>
              {business?.isVerified && <BadgeCheck size={18} color="var(--accent-400)" weight="fill" />}
            </div>
            <div className="small" style={{ opacity: .9, color: "#fff" }}>{business?.subCategory || business?.categoryName || "Local business"}</div>
            <div className="tiny" style={{ opacity: .78, marginTop: 3, color: "#fff" }}>{subtitle}</div>
          </div>
      </>}
      actions={<>
          <button className="tiny semi" style={{ color: "#fff", background: "rgba(255,255,255,.16)", padding: "8px 14px", borderRadius: 999, whiteSpace: "nowrap" }} onClick={() => nav(`/business/${id}`)}>
            {t("map_view_shop")}
          </button>
          {isOwner && (
            <button className="icon-btn-sm console-header-icon" aria-label={t("mdash_share_shop")} onClick={onShare} style={{ background: "rgba(255,255,255,.16)", color: "#fff" }}>
              <Share2 size={16} />
            </button>
          )}
      </>}
    />
  );
}

function HeaderIcon({ label, count, secondaryDot = false, onClick, children }: { label: string; count: number; secondaryDot?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button className="icon-btn-sm console-header-icon" aria-label={label} onClick={onClick} style={{ background: "rgba(255,255,255,.16)", color: "#fff", position: "relative" }}>
      {children}
      {(count > 0 || secondaryDot) && (
        <span style={{ position: "absolute", top: 2, right: 2, width: 7, height: 7, borderRadius: "50%", background: count > 0 ? "var(--red-500)" : "var(--accent-500)" }} />
      )}
    </button>
  );
}
