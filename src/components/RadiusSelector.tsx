import { Pencil } from "@/components/Icons";
import { useRadiusPresets } from "@/hooks/useRadiusPresets";
import { haptics } from "@/lib/haptics";

interface RadiusSelectorProps {
  value: number;
  onChange: (val: number) => void;
  accentColor?: string; // Default: "var(--brand-600)"
  label?: string; // Optional custom label
  description?: string; // Optional helper text
}

export default function RadiusSelector({
  value,
  onChange,
  accentColor = "var(--brand-600)",
  label = "Radius",
  description
}: RadiusSelectorProps) {
  const {
    presets, showCustom, customVal, setCustomVal, customInputRef,
    isCustomActive, isActive, selectPreset, openCustom, applyCustom, cancelCustom, snapPreview,
  } = useRadiusPresets(value, onChange);

  return (
    <div className="card">
      <div className="row between small semi" style={{ marginBottom: "var(--space-sm)" }}>
        <span>{label}</span>
        <span style={{ color: accentColor, fontWeight: 700 }}>
          {value >= 5000 ? "🌍 World" : value === 0.5 ? "500m" : `${value} km`}
        </span>
      </div>

      {showCustom ? (
        <div className="col gap-6">
          <div className="row gap-8">
            <input
              ref={customInputRef}
              type="number"
              step="0.5"
              min="0.5"
              className="input grow"
              style={{
                padding: "8px 12px",
                fontSize: 13,
                height: 36,
                border: "1.5px solid var(--ink-200)",
                borderRadius: "var(--radius-sm)",
                outline: "none"
              }}
              placeholder="Radius in km..."
              value={customVal}
              onChange={(e) => setCustomVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyCustom();
                if (e.key === "Escape") cancelCustom();
              }}
              autoFocus
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ height: 36, padding: "0 12px", background: accentColor, borderColor: accentColor }}
              onClick={() => { haptics.selection(); applyCustom(); }}
            >
              Apply
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ height: 36, padding: "0 12px" }}
              onClick={cancelCustom}
            >
              Cancel
            </button>
          </div>
          {snapPreview !== null && (
            <div style={{ fontSize: 11, color: "var(--ink-500)" }}>
              Snaps to <strong style={{ color: accentColor }}>{snapPreview} km</strong>
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            scrollbarWidth: "none",
            padding: "2px 0",
            width: "100%",
          }}
        >
          {presets.map((opt) => {
            const active = isActive(opt.km);
            return (
              <button
                key={opt.km}
                type="button"
                onClick={() => { haptics.selection(); selectPreset(opt.km); }}
                style={{
                  padding: "6px 12px",
                  borderRadius: "var(--radius)",
                  border: "none",
                  background: active ? accentColor : "var(--ink-100)",
                  color: active ? "#fff" : "var(--ink-700)",
                  fontWeight: active ? 700 : 500,
                  fontSize: 12.5,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                {opt.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => { haptics.selection(); openCustom(); }}
            style={{
              padding: "6px 12px",
              borderRadius: "var(--radius)",
              border: "none",
              background: isCustomActive ? accentColor : "var(--ink-100)",
              color: isCustomActive ? "#fff" : "var(--ink-700)",
              fontWeight: isCustomActive ? 700 : 500,
              fontSize: 12.5,
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: "var(--space-xxs)",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            <Pencil size={11} strokeWidth={2.5} />
            {isCustomActive ? `${value} km` : "Custom"}
          </button>
        </div>
      )}
      {description && (
        <div className="tiny muted" style={{ marginTop: "var(--space-xs)" }}>
          {description}
        </div>
      )}
    </div>
  );
}
