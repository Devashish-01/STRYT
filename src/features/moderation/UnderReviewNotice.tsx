import { useI18n } from "@/lib/i18n";

/**
 * Shown on a post or comment that moderation has hidden — after enough reports, or by the automatic check.
 * Hidden rows are only returned to their author and to admins (row-level security, 20260990), so whoever sees
 * this notice is one of them. Nobody else sees the content at all.
 */
export default function UnderReviewNotice({ kind }: { kind: "post" | "comment" }) {
  const { t } = useI18n();
  return (
    <div
      role="status"
      className="tiny semi"
      style={{
        marginTop: 6,
        padding: "6px 10px",
        borderRadius: 10,
        background: "var(--amber-50)",
        color: "var(--amber-800)",
        border: "1px solid var(--amber-200)",
      }}
    >
      {kind === "post" ? t("mod_under_review_post") : t("mod_under_review_comment")}
    </div>
  );
}
