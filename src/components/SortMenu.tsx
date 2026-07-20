import { useI18n } from "@/lib/i18n";
import { haptics } from "@/lib/haptics";

export type SortOption = "nearby" | "rating" | "new";

const OPTIONS: SortOption[] = ["nearby", "rating", "new"];

export default function SortMenu({ value, onChange, label }: { value: SortOption; onChange: (s: SortOption) => void; label?: string }) {
  const { t } = useI18n();
  const labelFor = (s: SortOption) => (s === "nearby" ? t("sort_nearby") : s === "rating" ? t("sort_rating") : t("sort_new"));

  return (
    <div>
      {label && <label className="filter-label" style={{ display: "block", marginBottom: "var(--space-xs)" }}>{label}</label>}
      <div className="row gap-6" style={{ flexWrap: "wrap" }}>
        {OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`chip ${value === opt ? "active" : ""}`}
            onClick={() => { haptics.selection(); onChange(opt); }}
          >
            {labelFor(opt)}
          </button>
        ))}
      </div>
    </div>
  );
}
