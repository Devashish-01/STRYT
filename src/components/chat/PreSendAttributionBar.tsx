import React from "react";
import { Store, User, Wrench } from "@/components/Icons";

export type ChatReplyingPersona = "business" | "provider" | "personal";

interface PreSendAttributionBarProps {
  entityName?: string | null;
  staffAlias?: string | null;
  persona: ChatReplyingPersona;
  onTogglePersona: () => void;
}

export default function PreSendAttributionBar({
  entityName,
  staffAlias,
  persona,
  onTogglePersona,
}: PreSendAttributionBarProps) {
  if (!entityName && persona === "personal") return null;

  const isBusiness = persona === "business";
  const isProvider = persona === "provider";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 14px",
        background: isBusiness
          ? "var(--brand-50)"
          : isProvider
          ? "var(--green-50)"
          : "var(--surface)",
        borderTop: "1px solid var(--line)",
        borderBottom: "1px solid var(--line)",
        fontSize: 12,
        color: "var(--ink-700)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        {isBusiness ? (
          <Store size={14} color="var(--brand-600)" />
        ) : isProvider ? (
          <Wrench size={14} color="var(--green-600)" />
        ) : (
          <User size={14} color="var(--ink-500)" />
        )}

        <span style={{ whiteSpace: "nowrap" }}>
          Replying as:{" "}
          <strong style={{ color: isBusiness ? "var(--brand-700)" : isProvider ? "var(--green-700)" : "inherit" }}>
            {persona === "personal" ? "Personal Account" : entityName || "Store"}
          </strong>
          {persona !== "personal" && staffAlias ? (
            <span style={{ opacity: 0.75, marginLeft: 4 }}>({staffAlias})</span>
          ) : null}
        </span>
      </div>

      <button
        type="button"
        onClick={onTogglePersona}
        style={{
          background: "none",
          border: "none",
          color: isBusiness ? "var(--brand-600)" : isProvider ? "var(--green-600)" : "var(--ink-600)",
          fontWeight: 600,
          fontSize: 11,
          cursor: "pointer",
          padding: "2px 6px",
          borderRadius: 4,
          textDecoration: "underline",
        }}
      >
        Change
      </button>
    </div>
  );
}
