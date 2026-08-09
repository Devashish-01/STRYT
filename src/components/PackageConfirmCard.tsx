import { useState } from "react";
import { BUSINESS_PACKAGES, PACKAGE_KEYS, type BusinessPackageKey } from "@/lib/businessPackages";

/**
 * The moment a Business Package becomes a real, visible, ownable choice
 * instead of an invisible keyword guess (Phase 2, Business Packages plan).
 * Shared between BusinessOnboard.tsx and ProviderOnboard.tsx — same card,
 * same picker, only the accent color differs to match each flow's own
 * brand (purple for business, green for provider).
 *
 * `suggested` is the live auto-detected package (recomputed as the owner
 * picks a category/sub-category); `selected` is what actually gets
 * submitted — starts equal to `suggested` and only diverges once the owner
 * explicitly opens the picker below and taps something else.
 */
export function PackageConfirmCard({
  suggested, selected, onChange, accentColor = "var(--brand-600)",
}: {
  suggested: BusinessPackageKey;
  selected: BusinessPackageKey;
  onChange: (key: BusinessPackageKey) => void;
  accentColor?: string;
}) {
  const [picking, setPicking] = useState(false);
  const pkg = BUSINESS_PACKAGES[selected];

  return (
    <div className="card col gap-10" style={{ padding: 16, border: `1.5px solid ${accentColor}` }}>
      <div className="row gap-10" style={{ alignItems: "flex-start" }}>
        <span style={{ fontSize: 28, lineHeight: 1 }}>{pkg.icon || "🏪"}</span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="bold small">Page type: {pkg.label}</div>
          <p className="tiny muted" style={{ marginTop: 2, lineHeight: 1.4 }}>{pkg.blurb}</p>
        </div>
      </div>

      <div className="row wrap gap-6">
        <span className="tiny semi" style={{ padding: "4px 10px", borderRadius: 999, background: "var(--ink-50)", color: "var(--ink-700)" }}>
          CTA: {pkg.primaryCtaLabel}
        </span>
        <span className="tiny semi" style={{ padding: "4px 10px", borderRadius: 999, background: "var(--ink-50)", color: "var(--ink-700)" }}>
          Catalogue: {pkg.catalogNoun}
        </span>
        <span className="tiny semi" style={{ padding: "4px 10px", borderRadius: 999, background: "var(--ink-50)", color: "var(--ink-700)" }}>
          Bookings {pkg.bookingsDefault ? "on" : "off"} by default
        </span>
      </div>

      {!picking ? (
        <button type="button" className="btn btn-outline btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setPicking(true)}>
          Choose a different page type
        </button>
      ) : (
        <div className="row wrap gap-6">
          {PACKAGE_KEYS.map((key) => {
            const p = BUSINESS_PACKAGES[key];
            return (
              <button
                key={key}
                type="button"
                className={`chip ${selected === key ? "active" : ""}`}
                onClick={() => { onChange(key); setPicking(false); }}
              >
                {p.icon || "🏪"} {key === "generic" ? "Plain page" : p.label}
              </button>
            );
          })}
        </div>
      )}

      {selected !== suggested && (
        <button
          type="button"
          className="tiny semi"
          style={{ color: accentColor, alignSelf: "flex-start" }}
          onClick={() => onChange(suggested)}
        >
          ← Use the suggested {BUSINESS_PACKAGES[suggested].label} package instead
        </button>
      )}
    </div>
  );
}
