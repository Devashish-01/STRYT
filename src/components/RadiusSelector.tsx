import { useState, useRef } from "react";
import { RADIUS_OPTIONS } from "@/utils/constants";
import { Pencil } from "lucide-react";

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
  const [showCustom, setShowCustom] = useState(false);
  const [customVal, setCustomVal] = useState("");
  const customInputRef = useRef<HTMLInputElement>(null);

  const presetKms = new Set<number>(RADIUS_OPTIONS.map((o) => o.km));
  const isCustomActive = !presetKms.has(value);

  const roundToHalf = (v: number): number => {
    const r = Math.round(v * 2) / 2;
    return Math.max(0.5, r);
  };

  const handlePresetClick = (km: number) => {
    onChange(km);
    setShowCustom(false);
  };

  const handleCustomApply = () => {
    const n = parseFloat(customVal);
    if (!isNaN(n) && n > 0) {
      onChange(roundToHalf(n));
    }
    setShowCustom(false);
  };

  const openCustom = () => {
    setCustomVal(isCustomActive ? String(value) : "");
    setShowCustom(true);
    setTimeout(() => customInputRef.current?.focus(), 60);
  };

  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="row between small semi" style={{ marginBottom: 12 }}>
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
                borderRadius: 10,
                outline: "none"
              }}
              placeholder="Radius in km..."
              value={customVal}
              onChange={(e) => setCustomVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCustomApply();
                if (e.key === "Escape") setShowCustom(false);
              }}
              autoFocus
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ height: 36, padding: "0 12px", background: accentColor, borderColor: accentColor }}
              onClick={handleCustomApply}
            >
              Apply
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ height: 36, padding: "0 12px" }}
              onClick={() => setShowCustom(false)}
            >
              Cancel
            </button>
          </div>
          {customVal && !isNaN(parseFloat(customVal)) && parseFloat(customVal) > 0 && (
            <div style={{ fontSize: 11, color: "var(--ink-50)" }}>
              Snaps to <strong style={{ color: accentColor }}>{roundToHalf(parseFloat(customVal))} km</strong>
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
          {RADIUS_OPTIONS.map((opt) => {
            const active = value === opt.km;
            return (
              <button
                key={opt.km}
                type="button"
                onClick={() => handlePresetClick(opt.km)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 16,
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
            onClick={openCustom}
            style={{
              padding: "6px 12px",
              borderRadius: 16,
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
              gap: 4,
              transition: "background 0.15s, color 0.15s",
            }}
          >
            <Pencil size={11} strokeWidth={2.5} />
            {isCustomActive ? `${value} km` : "Custom"}
          </button>
        </div>
      )}
      {description && (
        <div className="tiny muted" style={{ marginTop: 8 }}>
          {description}
        </div>
      )}
    </div>
  );
}
