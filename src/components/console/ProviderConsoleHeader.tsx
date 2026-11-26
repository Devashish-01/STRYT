import { Link, useNavigate } from "react-router-dom";
import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, Sun } from "@phosphor-icons/react";
import { BadgeCheck, Bell, MessageSquareText, Share2 } from "@/components/Icons";
import { SafeImg } from "@/components/common";
import BrandHome from "@/components/BrandHome";
import RoleSwitcher from "@/components/RoleSwitcher";
import AmbientSky from "@/features/ambient/AmbientSky";
import { useAmbientTheme } from "@/features/ambient/useAmbientTheme";
import { useQueryWithRealtime } from "@/hooks/useApi";
import { useI18n } from "@/lib/i18n";
import { chatService } from "@/services/engagement/chatService";
import { notificationService } from "@/services/engagement/notificationService";
import { useApp } from "@/store";
import type { Provider } from "@/types";
import ConsoleHeader from "./ConsoleHeader";

function weatherIcon(code: number) {
  if (code >= 95) return CloudLightning;
  if (code === 85 || code === 86 || (code >= 71 && code <= 77)) return CloudSnow;
  if (code >= 51) return CloudRain;
  if (code >= 45) return CloudFog;
  return code > 0 ? Cloud : Sun;
}

export default function ProviderConsoleHeader({ provider, available, onShare }: {
  provider: Provider;
  available: boolean;
  onShare: () => void;
}) {
  const { id } = provider;
  const nav = useNavigate();
  const { t, tf } = useI18n();
  const { user, notifUnread: totalNotifUnread } = useApp();
  const ambient = useAmbientTheme(user.lat, user.lng, "provider");
  const { data: notifUnread } = useQueryWithRealtime(
    () => notificationService.getUnreadCount({ scope: "PROVIDER", id }), "notifications",
    [id, user.id], user.id ? `user_id=eq.${user.id}` : undefined, `notif:provider:${id}`,
  );
  const { data: chatUnread } = useQueryWithRealtime(
    () => chatService.totalUnread({ scope: "PROVIDER", id }), "conversations", [id], undefined, `chat:provider:${id}`,
  );
  const scopedUnread = (notifUnread ?? 0) > 0;
  const crossHatUnread = !scopedUnread && totalNotifUnread > 0;
  const weather = ambient.weather;
  const Weather = weather ? weatherIcon(weather.code) : null;
  const radius = provider.serviceRadiusKm ?? 10;
  const reach = radius >= 5000 ? t("provider_reach_worldwide") : radius === 0.5 ? "500 m" : `${radius} km`;

  return (
    <ConsoleHeader
      background={ambient.headerGradient}
      backdrop={<AmbientSky dayPart={ambient.dayPartKey} effect={ambient.seasonEffect} glow={ambient.lampGlow} />}
      brand={<BrandHome glow={ambient.lampGlow} />}
      primary={<>
        <RoleSwitcher theme="dark-pill" enableLongPress />
        <button type="button" className="icon-btn-sm console-header-icon" aria-label={t("notifications")}
          onClick={() => nav(crossHatUnread ? "/notifications" : `/notifications?scope=PROVIDER&id=${id}`)}>
          <Bell size={18} />
          {(scopedUnread || crossHatUnread) && <span className="console-header-unread" data-cross-hat={crossHatUnread} aria-hidden="true" />}
        </button>
        <button type="button" className="icon-btn-sm console-header-icon" aria-label={t("messages_header")}
          onClick={() => nav(`/chats?scope=PROVIDER&id=${id}`)}>
          <MessageSquareText size={18} />
          {(chatUnread ?? 0) > 0 && <span className="console-header-unread" aria-hidden="true" />}
        </button>
      </>}
      identity={<>
        <div className="provider-console-avatar" data-available={available}>
          <SafeImg src={provider.avatar} alt={provider.displayName} variant="avatar" className="avatar" />
          {available && <span className="provider-console-live-dot" aria-hidden="true" />}
        </div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row gap-6 center-v">
            <h1 className="bold h1 ellipsis" style={{ color: "inherit", margin: 0 }}>{provider.displayName}</h1>
            {provider.isVerified && <BadgeCheck size={18} color="var(--accent-400)" weight="fill" />}
          </div>
          <div className="small">{provider.categoryName}</div>
          <div className="tiny">{ambient.greeting} · {tf("provider_reach", { reach })}</div>
        </div>
      </>}
      actions={<>
        <Link className="provider-console-view" to={`/provider/${id}`}>{t("provider_view_public")}</Link>
        <button type="button" className="icon-btn-sm console-header-icon" aria-label={t("share_qr_code_label")} onClick={onShare}>
          <Share2 size={18} />
        </button>
        {weather && Weather && (
          <span className="provider-console-weather" title={ambient.ambientSubtitle}>
            <Weather size={16} weight="fill" aria-hidden="true" /> {Math.round(weather.tempC)}°C
          </span>
        )}
      </>}
    />
  );
}
