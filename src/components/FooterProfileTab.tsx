import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { User } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";
import { useLongPress } from "@/hooks/useLongPress";
import { haptics } from "@/lib/haptics";
import AccountSwitcher from "@/components/AccountSwitcher";

interface FooterProfileTabProps {
  profilePath: string;
  active: boolean;
  /** Extra class on the nav button (e.g. provider-nav styling is on parent nav). */
  iconStrokeWidth?: number;
  label?: string;
}

/**
 * Footer Profile tab — tap opens profile hub, long-press opens the
 * sleek AccountSwitcher drawer with haptic feedback.
 * Shared by customer BottomNav, business ManageNav, and provider ProviderManageNav.
 */
export default function FooterProfileTab({
  profilePath,
  active,
  iconStrokeWidth,
  label,
}: FooterProfileTabProps) {
  const nav = useNavigate();
  const { t } = useI18n();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { handlers: longPress, wrapTap } = useLongPress(() => {
    haptics.medium();
    setDrawerOpen(true);
  });
  const profileTap = wrapTap(() => nav(profilePath));
  const stroke = iconStrokeWidth ?? (active ? 2.6 : 2);
  const tabLabel = label ?? t("profile");

  return (
    <>
      <button
        className={`nav-item ${active ? "active" : ""}`}
        onClick={profileTap}
        {...longPress}
        aria-label={`${tabLabel} — long-press to switch account`}
      >
        <User size={22} strokeWidth={stroke} />
        <span>{tabLabel}</span>
      </button>

      {drawerOpen && <AccountSwitcher onClose={() => setDrawerOpen(false)} />}
    </>
  );
}
