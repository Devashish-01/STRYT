import type { Dispatch, SetStateAction } from "react";
import type { Layer } from "./mapIcons";
import { pinColors, layerLabels } from "./mapIcons";

export function LayerToggles({
  layers, setLayers, availOnly, setAvailOnly,
}: {
  layers: Record<Layer, boolean>;
  setLayers: Dispatch<SetStateAction<Record<Layer, boolean>>>;
  availOnly: boolean;
  setAvailOnly: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <div style={{ position: "absolute", top: 74, left: 16, zIndex: 1000 }}>
      <div className="row gap-8" style={{ flexWrap: "wrap", maxWidth: 220 }}>
        {(["business", "provider", "request", "story"] as Layer[]).map((l) => {
          const color = l === "story" ? "#ec4899" : pinColors[l as Exclude<Layer, "story">];
          return (
            <button
              key={l}
              className="chip"
              style={{
                background: layers[l] ? color : "#fff",
                color:       layers[l] ? "#fff" : "var(--ink-700)",
                borderColor: layers[l] ? color : "var(--ink-200)",
                boxShadow:   "var(--shadow-sm)",
                fontSize: 12,
                padding: "4px 10px",
              }}
              onClick={() => setLayers((s) => ({ ...s, [l]: !s[l] }))}
            >
              {layerLabels[l]}
            </button>
          );
        })}
        <button
          className="chip"
          style={{
            background: availOnly ? "var(--green-500)" : "#fff",
            color: availOnly ? "#fff" : "var(--ink-700)",
            borderColor: availOnly ? "var(--green-500)" : "var(--ink-200)",
            boxShadow: "var(--shadow-sm)",
            fontSize: 12,
            padding: "4px 10px",
            fontWeight: 700,
          }}
          onClick={() => setAvailOnly((v) => !v)}
        >
          ⚡ Available Now
        </button>
      </div>
    </div>
  );
}
