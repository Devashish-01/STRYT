import { Link } from "react-router-dom";
import { ChevronRight } from "@/components/Icons";
import { AccessibleSheet } from "@/components/ui/AccessibleSheet";
import { useI18n } from "@/lib/i18n";

export default function ConsoleToolsSheet({ open, onClose, items, onSignOut }: {
  open: boolean;
  onClose: () => void;
  items: readonly { to: string; labelKey: string }[];
  onSignOut?: () => void;
}) {
  const { t } = useI18n();
  return (
    <AccessibleSheet isOpen={open} onClose={onClose} title={t("console_all_tools")}>
      <div className="col gap-8">
        {items.map(({ to, labelKey }) => (
          <Link to={to} key={to} onClick={onClose} className="btn btn-outline row between center-v">
            <span>{t(labelKey)}</span><ChevronRight size={16} aria-hidden="true" />
          </Link>
        ))}
        {onSignOut && <button type="button" className="btn btn-outline" onClick={onSignOut}>{t("console_log_out")}</button>}
        <button type="button" className="btn" onClick={onClose}>{t("create_sheet_close")}</button>
      </div>
    </AccessibleSheet>
  );
}
