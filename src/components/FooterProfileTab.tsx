import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { User } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";
import { useLongPress } from "@/hooks/useLongPress";
import AccountSwitcher from "@/components/AccountSwitcher";
import HatSwitcherPopover from "@/components/HatSwitcherPopover";

interface FooterProfileTabProps {
  profilePath: string;
  active: boolean;
  /** Extra class on the nav button (e.g. provider-nav styling is on parent nav). */
  iconStrokeWidth?: number;
  label?: string;
}

/**
 * Footer Profile tab — tap opens profile hub, long-press opens upward hat
 * popover with a "See all accounts" path to the full AccountSwitcher sheet.
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
  const [popover, setPopover] = useState(false);
  const [fullSwitcher, setFullSwitcher] = useState(false);

  const { handlers: longPress, wrapTap } = useLongPress(() => setPopover(true));
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

      {popover && (
        <HatSwitcherPopover
          onClose={() => setPopover(false)}
          onSeeAll={() => setFullSwitcher(true)}
        />
      )}
      {fullSwitcher && <AccountSwitcher onClose={() => setFullSwitcher(false)} />}
    </>
  );
}
