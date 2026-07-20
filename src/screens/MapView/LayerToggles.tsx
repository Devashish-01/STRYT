import type { Dispatch, SetStateAction } from "react";
import type { Layer } from "./mapIcons";
import { pinColors } from "./mapIcons";
import { useI18n } from "@/lib/i18n";

const activeShadows: Record<Layer, string> = {
  business: "0 4px 12px rgba(242, 106, 0, 0.25)",
  provider: "0 4px 12px rgba(22, 163, 74, 0.25)",
  request:  "0 4px 12px rgba(124, 47, 232, 0.25)",
  story:    "0 4px 12px rgba(255, 93, 186, 0.25)",
};

export function LayerToggles({
  layers, setLayers, availOnly, setAvailOnly,
}: {
  layers: Record<Layer, boolean>;
  setLayers: Dispatch<SetStateAction<Record<Layer, boolean>>>;
  availOnly: boolean;
  setAvailOnly: Dispatch<SetStateAction<boolean>>;
}) {
  const { t } = useI18n();
  const translatedLayerLabels: Record<Layer, string> = {
    business: t("explore_tab_shops"),
    provider: t("map_layer_providers"),
    request: t("map_layer_requests"),
    story: t("map_layer_stories"),
  };
  return (
    <div style={{ position: "absolute", top: "calc(74px + var(--safe-area-top))", left: 16, zIndex: 1000 }}>
      <div className="row gap-8" style={{ flexWrap: "wrap", maxWidth: 240 }}>
        {(["business", "provider", "request", "story"] as Layer[]).map((l) => {
          const color = l === "story" ? "var(--pink-500)" : pinColors[l as Exclude<Layer, "story">];
          const active = layers[l];
          return (
            <button
              key={l}
              className={`chip ${active ? "" : "map-glass-panel"}`}
              style={{
                background:  active ? color : undefined,
                color:       active ? "#fff" : "var(--ink-700)",
                borderColor: active ? color : undefined,
                boxShadow:   active ? activeShadows[l] : undefined,
                fontSize: 12,
                padding: "6px 12px",
                borderRadius: 16,
                fontWeight: 600,
                transition: "all 0.15s ease",
              }}
              onClick={() => setLayers((s) => ({ ...s, [l]: !s[l] }))}
            >
              {translatedLayerLabels[l]}
            </button>
          );
        })}
        <button
          className={`chip ${availOnly ? "" : "map-glass-panel"}`}
          style={{
            background:  availOnly ? "var(--green-500)" : undefined,
            color:       availOnly ? "#fff" : "var(--ink-700)",
            borderColor: availOnly ? "var(--green-500)" : undefined,
            boxShadow:   availOnly ? "0 4px 12px rgba(22, 163, 74, 0.25)" : undefined,
            fontSize: 12,
            padding: "6px 12px",
            borderRadius: 16,
            fontWeight: 700,
            transition: "all 0.15s ease",
          }}
          onClick={() => setAvailOnly((v) => !v)}
        >
          {t("map_available_only")}
        </button>
      </div>
    </div>
  );
}

