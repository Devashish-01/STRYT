import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeftRight, BadgeCheck, Edit3, Eye, Globe, LogOut, Settings, Star, Users, Wallet } from "@/components/Icons";
import AccountSwitcher from "@/components/AccountSwitcher";
import { SettingsRow, SettingsSection } from "@/components/settings";
import { AccessibleSheet } from "@/components/ui/AccessibleSheet";
import { useBusinessConsoleData } from "@/features/business-home/businessConsoleData";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/store";
import BusinessDetail from "../BusinessDetail";
import ManageNav from "./ManageNav";

export default function BusinessProfileHub({ preview = false }: { preview?: boolean }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { signOut } = useApp();
  const { shop: { data: business } } = useBusinessConsoleData();
  const [sheet, setSheet] = useState<"settings" | "accounts" | null>(null);
  const settingsOpen = sheet === "settings";
  const base = `/business/${encodeURIComponent(id)}/manage`;
  const settingsLabel = t("business_profile_settings");

  if (preview) return <BusinessDetail view="preview" />;

  function openSetting(path: string) {
    setSheet(null);
    navigate(path);
  }

  return (
    <>
      <BusinessDetail
        view="owner"
        ownerActions={
          <>
            <Link to={`${base}/edit-profile`} className="btn btn-primary">
              <Edit3 size={17} aria-hidden="true" />
              {t("pdash_edit_profile")}
            </Link>
            <Link to={`${base}/profile/preview`} className="btn btn-outline">
              <Eye size={17} aria-hidden="true" />
              {t("business_profile_preview")}
            </Link>
          </>
        }
        toolbarActions={
          <button
            type="button"
            className="icon-btn"
            aria-label={settingsLabel}
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
            onClick={() => setSheet("settings")}
          >
            <Settings size={20} aria-hidden="true" />
          </button>
        }
        footer={<ManageNav bizId={id} />}
      />
      <AccessibleSheet isOpen={settingsOpen} onClose={() => setSheet(null)} title={settingsLabel}>
        <div className="col gap-16">
          <SettingsSection title={t("business_profile_identity")}>
            <SettingsRow
              icon={<Globe size={19} />}
              label={t("bset_service_radius")}
              hint={t("bset_service_radius_hint")}
              onClick={() => openSetting(`${base}/broadcast`)}
            />
            <SettingsRow
              icon={<Star size={19} />}
              label={t("bset_customer_reviews")}
              hint={t("bset_customer_reviews_hint")}
              onClick={() => openSetting(`${base}/reviews`)}
            />
            <SettingsRow
              icon={<BadgeCheck size={19} />}
              label={t("bset_verification")}
              hint={t("bset_verification_hint")}
              value={business?.isVerified ? t("verified_badge") : undefined}
              onClick={() => openSetting(`${base}/verify`)}
            />
          </SettingsSection>
          <SettingsSection title={t("bset_account")}>
            <SettingsRow
              icon={<Users size={19} />}
              label={t("bset_team_access")}
              hint={t("bset_team_access_hint")}
              onClick={() => openSetting("/account/business-access")}
            />
            <SettingsRow
              icon={<Wallet size={19} />}
              label={t("bdial_payments")}
              onClick={() => openSetting(`${base}/payments`)}
            />
            <SettingsRow
              icon={<Settings size={19} />}
              label={t("bset_business_settings")}
              onClick={() => openSetting(`${base}/settings`)}
            />
            <SettingsRow
              icon={<ArrowLeftRight size={19} />}
              label={t("console_switch_account")}
              onClick={() => setSheet("accounts")}
            />
          </SettingsSection>
          <button
            type="button"
            className="btn btn-outline"
            style={{ color: "var(--red-600)" }}
            onClick={() => {
              signOut();
              openSetting("/");
            }}
          >
            <LogOut size={18} aria-hidden="true" />
            {t("console_log_out")}
          </button>
          <button type="button" className="btn" onClick={() => setSheet(null)}>
            {t("create_sheet_close")}
          </button>
        </div>
      </AccessibleSheet>
      {sheet === "accounts" && <AccountSwitcher onClose={() => setSheet(null)} />}
    </>
  );
}
