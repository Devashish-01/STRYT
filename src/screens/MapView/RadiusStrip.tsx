import { useRef, useState } from "react";
import { Pencil, Check } from "@/components/Icons";
import { RADIUS_OPTIONS } from "@/utils/constants";
import { useI18n } from "@/lib/i18n";

function roundToHalf(v: number): number {
  const r = Math.round(v * 2) / 2;
  return Math.max(0.5, r);
}

export function RadiusStrip({
  radiusKm, setRadiusKm,
}: {
  radiusKm: number;
  setRadiusKm: (km: number) => void;
}) {
  const { t } = useI18n();
  const [showCustom, setShowCustom] = useState(false);
  const [customVal, setCustomVal] = useState("");
  const customInputRef = useRef<HTMLInputElement>(null);

  const presetKms = new Set<number>(RADIUS_OPTIONS.map((o) => o.km));
  const isCustomActive = !presetKms.has(radiusKm);

  function openCustom() {
    setCustomVal(isCustomActive ? String(radiusKm) : "");
    setShowCustom(true);
    setTimeout(() => customInputRef.current?.focus(), 60);
  }

  function applyCustom() {
    const n = parseFloat(customVal);
    if (!isNaN(n) && n > 0) setRadiusKm(roundToHalf(n));
    setShowCustom(false);
  }

  return (
    <>
      {/* Custom distance input card */}
      {showCustom && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 1100 }}
            onClick={() => setShowCustom(false)}
          />
          <div className="map-glass-panel" style={{
            position: "absolute", bottom: "calc(80px + var(--safe-area-bottom))", left: "50%", transform: "translateX(-50%)",
            zIndex: 1200,
            borderRadius: 20,
            padding: "16px 18px",
            minWidth: 240,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-500)", marginBottom: 10, letterSpacing: 0.4 }}>
              {t("map_custom_radius_label")}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                ref={customInputRef}
                type="number"
                min={0.5}
                step={0.5}
                value={customVal}
                placeholder={t("map_radius_example")}
                onChange={(e) => setCustomVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") applyCustom(); if (e.key === "Escape") setShowCustom(false); }}
                style={{
                  flex: 1,
                  border: "1.5px solid var(--ink-200)",
                  borderRadius: 12,
                  padding: "10px 12px",
                  fontSize: 18,
                  fontWeight: 700,
                  color: "var(--ink-900)",
                  outline: "none",
                  width: 0,
                  background: "rgba(255, 255, 255, 0.7)",
                }}
              />
              <span style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-500)", flexShrink: 0 }}>km</span>
              <button
                onClick={applyCustom}
                style={{
                  width: 42, height: 42, borderRadius: 13,
                  background: "var(--brand-600)", color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: "none", cursor: "pointer", flexShrink: 0,
                }}
              >
                <Check size={20} strokeWidth={2.8} />
              </button>
            </div>
            {customVal && !isNaN(parseFloat(customVal)) && parseFloat(customVal) > 0 && (
              <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 8 }}>
                {t("map_snaps_to")} <strong style={{ color: "var(--brand-600)" }}>{roundToHalf(parseFloat(customVal))} km</strong>
              </div>
            )}
          </div>
        </>
      )}

      {/* Radius selector strip */}
      <div className="map-glass-panel" style={{
        position: "absolute", bottom: "calc(24px + var(--safe-area-bottom))", left: "50%", transform: "translateX(-50%)",
        zIndex: 1000,
        borderRadius: 30,
        padding: "6px 10px",
        display: "flex", gap: 2,
        maxWidth: "calc(100% - 32px)",
        overflowX: "auto",
        scrollbarWidth: "none",
      }}>
        {RADIUS_OPTIONS.map((opt) => {
          const active = radiusKm === opt.km;
          return (
            <button
              key={opt.km}
              onClick={() => { setRadiusKm(opt.km); setShowCustom(false); }}
              style={{
                padding: "6px 13px",
                borderRadius: 22,
                border: "none",
                background: active ? "var(--brand-600)" : "transparent",
                color: active ? "#fff" : "var(--ink-600)",
                fontWeight: active ? 700 : 500,
                fontSize: 13,
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

        {/* Custom button */}
        <button
          onClick={openCustom}
          style={{
            padding: "6px 13px",
            borderRadius: 22,
            border: "none",
            background: isCustomActive ? "var(--brand-600)" : "transparent",
            color: isCustomActive ? "#fff" : "var(--ink-600)",
            fontWeight: isCustomActive ? 700 : 500,
            fontSize: 13,
            cursor: "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
            display: "flex", alignItems: "center", gap: 5,
            transition: "background 0.15s, color 0.15s",
          }}
        >
          <Pencil size={12} strokeWidth={2.5} />
          {isCustomActive ? `${radiusKm} km` : t("map_custom")}
        </button>
      </div>
    </>
  );

}
